// blog-api/src/routes/adminAi.ts
// Centre d'administration multi-IA : /api/admin/ai/*
//
// Admin vérifié + MFA (aal2) sur toutes les routes, lectures comprises. Aucune clé
// service_role : le jeton de l'administrateur est transmis à Supabase, où les fonctions
// ai_admin_* revérifient ses droits, écrivent et auditent dans une seule transaction.
// Une réponse de succès n'est envoyée qu'après la confirmation de la base.
// Aucune clé n'est jamais renvoyée, journalisée ni placée dans une URL.

import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { adminLimiter, aiAdminWriteLimiter } from '../middleware/rateLimit';
import {
  requireSupabaseAdmin,
  requireAdminMfa,
  bearerToken,
  getSupabaseConfig,
  type SupabaseAdminRequest,
} from '../middleware/supabaseAdmin';
import { auditLog, requestContext } from '../lib/audit';
import { strictObject, InputError } from '../ai/features/validate';
import { isProviderId, PROVIDERS } from '../ai/providers/registry';
import { isValidModelId } from '../ai/providers/modelId';
import { ProviderError, type ProviderId } from '../ai/providers/types';
import { invalidParam, MAX_OUTPUT_TOKENS, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS } from '../ai/services/params';
import { ProbeInconclusive, runProbes } from '../ai/services/probes';
import { usageCost } from '../ai/services/cost';
import { catalogPayload, type AiRuntimeStore, type FeaturePricing } from '../ai/services/store';
import { hashSubject } from '../ai/services/usage';
import { newRequestId, type AiGateway } from '../ai/services/gateway';

const RPC_TIMEOUT_MS = 15_000;
const CATALOG_TIMEOUT_MS = 20_000;
const MICRO_PER_USD = 1_000_000;
const MAX_USD = 100_000;

class AdminAiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const SQL_ERRORS: Record<string, [number, string, string]> = {
  ai_forbidden:            [403, 'FORBIDDEN', 'Opération refusée par la base de données'],
  ai_conflict:             [409, 'AI_CONFLICT', 'Cette configuration a changé entre-temps. Rechargez la page puis réessayez.'],
  ai_model_in_use:         [409, 'AI_MODEL_IN_USE', 'Ce modèle est utilisé par une fonctionnalité active. Réaffectez-la ou désactivez-la d’abord.'],
  ai_model_exists:         [409, 'AI_MODEL_EXISTS', 'Ce modèle figure déjà dans le catalogue.'],
  ai_model_excluded:       [409, 'AI_MODEL_EXCLUDED', 'Ce modèle a été exclu. Restaurez-le depuis la liste des modèles exclus.'],
  ai_model_not_found:      [404, 'AI_MODEL_NOT_FOUND', 'Modèle introuvable.'],
  ai_model_unavailable:    [422, 'AI_MODEL_UNAVAILABLE', 'Ce modèle est désactivé ou incompatible.'],
  ai_activation_blocked:   [422, 'AI_ACTIVATION_BLOCKED', 'Activation impossible.'],
  ai_provider_without_key: [422, 'AI_PROVIDER_WITHOUT_KEY', 'Enregistrez d’abord une clé valide pour ce fournisseur.'],
  ai_invalid_key:          [400, 'AI_INVALID_KEY', 'Format de clé invalide.'],
  ai_invalid_model_id:     [400, 'AI_INVALID_MODEL_ID', 'Identifiant de modèle invalide.'],
  ai_invalid_budget:       [400, 'AI_INVALID_INPUT', 'Budget invalide.'],
  ai_invalid_pricing:      [400, 'AI_INVALID_INPUT', 'Tarif invalide.'],
  ai_unknown_provider:     [404, 'AI_PROVIDER_UNKNOWN', 'Fournisseur inconnu.'],
  ai_unknown_feature:      [404, 'AI_FEATURE_UNKNOWN', 'Fonctionnalité inconnue.'],
};

const BLOCKER_MESSAGES: Record<string, string> = {
  no_model:          'Choisissez d’abord un modèle.',
  key_missing:       'Ce fournisseur n’a pas de clé valide.',
  provider_disabled: 'Ce fournisseur est désactivé.',
  model_unavailable: 'Ce modèle est désactivé ou incompatible.',
  not_validated:     'Testez d’abord ce modèle pour cette fonctionnalité : le test doit réussir.',
  unpriced:          'Saisissez d’abord le tarif de ce modèle : il sert à appliquer le budget.',
};

interface RpcError { code?: string; message?: string; details?: string }

async function rpc<T = unknown>(req: Request, fn: string, args: object = {}): Promise<T> {
  const cfg = getSupabaseConfig();
  const token = bearerToken(req);
  if (!cfg || !token) throw new AdminAiError(503, 'ADMIN_AUTH_NOT_CONFIGURED', 'Administration indisponible');

  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method:  'POST',
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(args),
    signal:  AbortSignal.timeout(RPC_TIMEOUT_MS),
  }).catch(() => { throw new AdminAiError(502, 'AI_STORE_UNAVAILABLE', 'Base de données injoignable. Rien n’a été modifié.'); });

  const body = await res.json().catch(() => null) as (T & RpcError) | null;
  if (res.ok) return body as T;

  if (res.status === 404 && body?.code === 'PGRST202') {
    throw new AdminAiError(503, 'AI_NOT_MIGRATED', 'Les migrations du centre IA ne sont pas encore appliquées.');
  }
  const known = SQL_ERRORS[body?.message ?? ''];
  if (known) {
    const [status, code, message] = known;
    if (code === 'AI_ACTIVATION_BLOCKED') {
      throw new AdminAiError(status, code, BLOCKER_MESSAGES[body?.details ?? ''] ?? message, { blocker: body?.details });
    }
    if (code === 'AI_MODEL_IN_USE') {
      throw new AdminAiError(status, code, message, { features: (body?.details ?? '').split(',').filter(Boolean) });
    }
    throw new AdminAiError(status, code, message);
  }
  if (res.status === 401 || res.status === 403) throw new AdminAiError(403, 'FORBIDDEN', 'Opération refusée par la base de données');
  console.error(`[AI_ADMIN] rpc ${fn} : HTTP ${res.status} ${body?.code ?? ''}`);
  throw new AdminAiError(502, 'AI_STORE_ERROR', 'Enregistrement impossible. La configuration précédente est conservée.');
}

function audit(req: SupabaseAdminRequest, action: string, outcome: 'success' | 'failure', target: string) {
  auditLog({ action, outcome, actorType: 'supabase_admin', actorId: req.supabaseAdmin?.userId, ...requestContext(req), target });
}

const fingerprint = (key: string) =>
  crypto.createHmac('sha256', process.env.AI_LOG_HMAC_SECRET || 'ai-key-fingerprint').update(key).digest('hex').slice(0, 16);

function providerParam(req: Request): ProviderId {
  const id = String(req.params.id);
  if (!isProviderId(id)) throw new AdminAiError(404, 'AI_PROVIDER_UNKNOWN', 'Fournisseur inconnu.');
  return id;
}

function modelIdOf(value: unknown): string {
  if (!isValidModelId(value)) throw new AdminAiError(400, 'AI_INVALID_MODEL_ID', 'Identifiant de modèle invalide.');
  return value;
}

const boolOf = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') throw new InputError(field, 'booléen attendu');
  return value;
};

const intOf = (value: unknown, field: string, min: number, max: number) => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new InputError(field, `entier entre ${min} et ${max} attendu`);
  return value as number;
};

/** Montant en USD saisi dans le dashboard → micro-USD */
const usdToMicro = (value: unknown, field: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_USD) throw new InputError(field, 'montant en USD attendu');
  return Math.round(value * MICRO_PER_USD);
};

const optionalUsd = (value: unknown, field: string) => (value === null || value === undefined ? null : usdToMicro(value, field));

export function createAdminAiRouter(gateway: AiGateway, store: AiRuntimeStore) {
  const router = Router();
  router.use(adminLimiter, requireSupabaseAdmin, requireAdminMfa);

  type Handler = (req: SupabaseAdminRequest, res: Response) => Promise<unknown>;
  const route = (handler: Handler) => async (req: SupabaseAdminRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body = await handler(req, res);
      if (!res.headersSent) res.json(body ?? { ok: true });
    } catch (err) {
      if (err instanceof AdminAiError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
      if (err instanceof InputError) return res.status(400).json({ error: 'Données invalides.', code: 'AI_INVALID_INPUT', field: err.field.slice(0, 60) });
      console.error('[AI_ADMIN] erreur inattendue :', (err as Error)?.name);
      res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
    }
  };

  /** Écriture : la configuration en cache n'est plus valable dès la confirmation de la base */
  const write = <T>(promise: Promise<T>) => promise.then(result => { store.invalidate(); return result; });

  const adapterOf = (provider: ProviderId) => {
    const adapter = gateway.adapter(provider);
    if (!adapter) throw new AdminAiError(404, 'AI_PROVIDER_UNKNOWN', 'Fournisseur inconnu.');
    return adapter;
  };

  const storedKey = async (provider: ProviderId) => {
    const key = await store.adminSecret(provider).catch(() => { throw new AdminAiError(502, 'AI_STORE_UNAVAILABLE', 'Accès au stockage sécurisé impossible.'); });
    if (!key) throw new AdminAiError(422, 'AI_PROVIDER_WITHOUT_KEY', 'Enregistrez d’abord une clé valide pour ce fournisseur.');
    return key;
  };

  const listCatalog = (provider: ProviderId, apiKey: string) =>
    adapterOf(provider).listModels({ apiKey, signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) });

  // ── Lectures ──
  router.get('/overview', route(async req => ({
    ...(await rpc<object>(req, 'ai_admin_overview')),
    runtime: { databaseConfigured: store.configured },
    paramsByProvider: Object.fromEntries((Object.keys(PROVIDERS) as ProviderId[]).map(id => [id, [...adapterOf(id).supportedParams]])),
  })));

  router.get('/providers/:id/models', route(req => rpc(req, 'ai_admin_models', { p_provider: providerParam(req) })));

  router.get('/usage', route(req => rpc(req, 'ai_admin_usage', { p_days: Number(req.query.days) || 30 })));

  router.get('/audit', route(req => rpc(req, 'ai_admin_audit', {
    p_limit: Number(req.query.limit) || 50,
    p_before_id: Number(req.query.before) || null,
  })));

  // ── Clés ──
  router.put('/providers/:id/key', aiAdminWriteLimiter, route(async req => {
    const provider = providerParam(req);
    const { key } = strictObject(req.body, 'body', ['key']);
    if (typeof key !== 'string' || key.length < 8 || key.length > 2048 || /\s/.test(key)) {
      throw new AdminAiError(400, 'AI_INVALID_KEY', 'Format de clé invalide.');
    }

    // Vérification gratuite (catalogue) : une clé refusée n'est jamais enregistrée
    let models;
    try {
      models = await listCatalog(provider, key);
    } catch (err) {
      const auth = err instanceof ProviderError && err.code === 'auth';
      audit(req, 'ai.provider.key.set', 'failure', provider);
      throw auth
        ? new AdminAiError(422, 'AI_KEY_REJECTED', 'Le fournisseur a refusé cette clé. Rien n’a été modifié.')
        : new AdminAiError(502, 'AI_PROVIDER_UNREACHABLE', 'Fournisseur injoignable : clé non vérifiée, rien n’a été modifié.');
    }

    const saved = await write(rpc<{ fingerprint: string }>(req, 'ai_admin_set_provider_key', {
      p_provider: provider, p_key: key, p_fingerprint: fingerprint(key),
    }));
    audit(req, 'ai.provider.key.set', 'success', provider);

    // Le catalogue vient d'être lu : autant l'enregistrer
    const sync = await write(rpc(req, 'ai_admin_sync_models', { p_provider: provider, p_models: catalogPayload(models) })).catch(() => null);
    return { fingerprint: saved.fingerprint, sync };
  }));

  router.delete('/providers/:id/key', aiAdminWriteLimiter, route(async req => {
    const provider = providerParam(req);
    await write(rpc(req, 'ai_admin_delete_provider_key', { p_provider: provider }));
    audit(req, 'ai.provider.key.delete', 'success', provider);
  }));

  router.post('/providers/:id/test', aiAdminWriteLimiter, route(async req => {
    const provider = providerParam(req);
    const key = await storedKey(provider);
    const started = Date.now();
    try {
      const models = await listCatalog(provider, key);
      await write(rpc(req, 'ai_admin_record_provider_check', { p_provider: provider, p_ok: true, p_code: null }));
      return { ok: true, modelCount: models.length, latencyMs: Date.now() - started };
    } catch (err) {
      if (err instanceof AdminAiError) throw err;
      const code = err instanceof ProviderError ? err.code : 'unknown';
      await write(rpc(req, 'ai_admin_record_provider_check', { p_provider: provider, p_ok: false, p_code: code }));
      return { ok: false, code, latencyMs: Date.now() - started };
    }
  }));

  router.patch('/providers/:id', aiAdminWriteLimiter, route(async req => {
    const { enabled } = strictObject(req.body, 'body', ['enabled']);
    await write(rpc(req, 'ai_admin_set_provider_enabled', { p_provider: providerParam(req), p_enabled: boolOf(enabled, 'enabled') }));
  }));

  // ── Catalogue ──
  router.post('/providers/:id/models/sync', aiAdminWriteLimiter, route(async req => {
    const provider = providerParam(req);
    const key = await storedKey(provider);
    let models;
    try {
      models = await listCatalog(provider, key);
    } catch (err) {
      const code = err instanceof ProviderError ? err.code : 'unknown';
      await write(rpc(req, 'ai_admin_record_sync_failure', { p_provider: provider, p_code: code }));
      throw new AdminAiError(502, 'AI_SYNC_FAILED', 'Actualisation impossible : la liste existante reste affichée avec sa date réelle.', { reason: code });
    }
    return write(rpc(req, 'ai_admin_sync_models', { p_provider: provider, p_models: catalogPayload(models) }));
  }));

  router.post('/providers/:id/models', aiAdminWriteLimiter, route(async req => {
    const { modelId, displayName } = strictObject(req.body, 'body', ['modelId', 'displayName']);
    await write(rpc(req, 'ai_admin_add_model', {
      p_provider: providerParam(req),
      p_model: modelIdOf(modelId),
      p_display_name: typeof displayName === 'string' ? displayName.slice(0, 200) : '',
    }));
  }));

  router.patch('/providers/:id/models', aiAdminWriteLimiter, route(async req => {
    const { modelId, disabled } = strictObject(req.body, 'body', ['modelId', 'disabled']);
    await write(rpc(req, 'ai_admin_set_model_disabled', {
      p_provider: providerParam(req), p_model: modelIdOf(modelId), p_disabled: boolOf(disabled, 'disabled'),
    }));
  }));

  // L'identifiant peut contenir « / » : il passe en paramètre de requête
  router.delete('/providers/:id/models', aiAdminWriteLimiter, route(async req => {
    await write(rpc(req, 'ai_admin_delete_model', { p_provider: providerParam(req), p_model: modelIdOf(req.query.modelId) }));
  }));

  router.post('/providers/:id/models/restore', aiAdminWriteLimiter, route(async req => {
    const { modelId } = strictObject(req.body, 'body', ['modelId']);
    await write(rpc(req, 'ai_admin_restore_model', { p_provider: providerParam(req), p_model: modelIdOf(modelId) }));
  }));

  router.put('/providers/:id/models/pricing', aiAdminWriteLimiter, route(async req => {
    const { modelId, inputUsdPerMTok, outputUsdPerMTok } = strictObject(req.body, 'body', ['modelId', 'inputUsdPerMTok', 'outputUsdPerMTok']);
    await write(rpc(req, 'ai_admin_set_pricing', {
      p_provider: providerParam(req),
      p_model: modelIdOf(modelId),
      p_input: usdToMicro(inputUsdPerMTok, 'inputUsdPerMTok'),
      p_output: usdToMicro(outputUsdPerMTok, 'outputUsdPerMTok'),
    }));
  }));

  // ── Fonctionnalités ──
  const featureOf = (req: Request) => {
    const feature = gateway.feature(String(req.params.id));
    if (!feature) throw new AdminAiError(404, 'AI_FEATURE_UNKNOWN', 'Fonctionnalité inconnue.');
    return feature;
  };

  const paramsOf = (provider: ProviderId, raw: unknown) => {
    const params = (raw ?? {}) as Record<string, number | string>;
    if (typeof params !== 'object' || Array.isArray(params)) throw new InputError('params', 'objet attendu');
    const refused = invalidParam(adapterOf(provider), params);
    if (refused) throw new InputError(`params.${refused}`, 'paramètre non pris en charge ou hors limites');
    return params;
  };

  router.put('/features/:id/assignment', aiAdminWriteLimiter, route(async req => {
    const feature = featureOf(req);
    const { providerId, modelId, params, maxOutputTokens, timeoutMs, enabled, version } = strictObject(req.body, 'body',
      ['providerId', 'modelId', 'params', 'maxOutputTokens', 'timeoutMs', 'enabled', 'version']);
    if (typeof providerId !== 'string' || !isProviderId(providerId)) throw new AdminAiError(404, 'AI_PROVIDER_UNKNOWN', 'Fournisseur inconnu.');

    return write(rpc(req, 'ai_admin_save_assignment', {
      p_feature: feature.id,
      p_provider: providerId,
      p_model: modelId === null ? null : modelIdOf(modelId),
      p_params: paramsOf(providerId, params),
      p_max_output_tokens: intOf(maxOutputTokens, 'maxOutputTokens', 1, MAX_OUTPUT_TOKENS),
      p_timeout_ms: intOf(timeoutMs, 'timeoutMs', MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
      p_enabled: boolOf(enabled, 'enabled'),
      p_expected_version: intOf(version, 'version', 1, 2_000_000_000),
    }));
  }));

  // Génération réelle, potentiellement facturée : confirmation explicite obligatoire
  router.post('/features/:id/test', aiAdminWriteLimiter, route(async req => {
    const feature = featureOf(req);
    const { providerId, modelId, params, confirmBilling } = strictObject(req.body, 'body', ['providerId', 'modelId', 'params', 'confirmBilling']);
    if (confirmBilling !== true) throw new AdminAiError(400, 'AI_BILLING_NOT_CONFIRMED', 'Confirmez d’abord que ce test peut être facturé.');
    if (typeof providerId !== 'string' || !isProviderId(providerId)) throw new AdminAiError(404, 'AI_PROVIDER_UNKNOWN', 'Fournisseur inconnu.');
    const model = modelIdOf(modelId);
    const key = await storedKey(providerId);

    let result;
    try {
      result = await runProbes(adapterOf(providerId), feature, model, key, paramsOf(providerId, params));
    } catch (err) {
      if (err instanceof ProbeInconclusive) {
        throw new AdminAiError(502, 'AI_TEST_INCONCLUSIVE', 'Le fournisseur n’a pas pu répondre : test sans conclusion, rien n’a été enregistré.', { reason: err.code });
      }
      throw err;
    }

    await write(rpc(req, 'ai_admin_record_compat', {
      p_feature: feature.id, p_provider: providerId, p_model: model, p_status: result.status,
      p_capabilities: result.capabilities, p_code: result.code, p_latency: result.latencyMs,
    }));

    // Tarif du modèle TESTÉ (souvent un candidat, pas encore affecté) : la sonde compte dans le budget
    const catalog = await rpc<{ models?: { modelId: string; pricing: FeaturePricing | null }[] }>(req, 'ai_admin_models', { p_provider: providerId })
      .catch(() => null);
    const pricing = catalog?.models?.find(m => m.modelId === model)?.pricing ?? null;
    const cost = pricing ? usageCost(result.inputTokens, result.outputTokens, pricing) : 0;
    await store.recordProbe(feature.id, cost, {
      requestId: newRequestId(), kind: 'probe', feature: feature.id, provider: providerId, model,
      subject: hashSubject(`user:${req.supabaseAdmin?.userId}`), outcome: result.status === 'compatible' ? 'ok' : 'error',
      code: result.code ?? undefined, latencyMs: result.latencyMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costMicroUsd: cost,
    }).catch(err => console.error('[AI_ADMIN] coût de la sonde non enregistré :', (err as Error)?.name));

    return {
      status: result.status,
      capabilities: result.capabilities,
      required: feature.requiredCapabilities,
      code: result.code,
      latencyMs: result.latencyMs,
      estimatedCostMicroUsd: cost,
    };
  }));

  router.put('/features/:id/quotas', aiAdminWriteLimiter, route(async req => {
    const feature = featureOf(req);
    const { perSubjectPerDay, globalPerDay, perMinute, concurrency, dailyBudgetUsd, monthlyBudgetUsd, version } = strictObject(req.body, 'body',
      ['perSubjectPerDay', 'globalPerDay', 'perMinute', 'concurrency', 'dailyBudgetUsd', 'monthlyBudgetUsd', 'version']);
    return write(rpc(req, 'ai_admin_save_quotas', {
      p_feature: feature.id,
      p_per_subject: intOf(perSubjectPerDay, 'perSubjectPerDay', 0, 1_000_000),
      p_global: intOf(globalPerDay, 'globalPerDay', 0, 10_000_000),
      p_per_minute: intOf(perMinute, 'perMinute', 1, 10_000),
      p_concurrency: intOf(concurrency, 'concurrency', 1, 100),
      p_daily_budget: optionalUsd(dailyBudgetUsd, 'dailyBudgetUsd'),
      p_monthly_budget: optionalUsd(monthlyBudgetUsd, 'monthlyBudgetUsd'),
      p_expected_version: intOf(version, 'version', 1, 2_000_000_000),
    }));
  }));

  router.put('/budget', aiAdminWriteLimiter, route(async req => {
    const { dailyUsd, monthlyUsd, globalConcurrency } = strictObject(req.body, 'body', ['dailyUsd', 'monthlyUsd', 'globalConcurrency']);
    await write(rpc(req, 'ai_admin_save_budget', {
      p_daily: usdToMicro(dailyUsd, 'dailyUsd'),
      p_monthly: usdToMicro(monthlyUsd, 'monthlyUsd'),
      p_concurrency: intOf(globalConcurrency, 'globalConcurrency', 1, 100),
    }));
  }));

  return router;
}
