// Centre d'administration multi-IA sur la pile Supabase locale RÉELLE (lancé par run.mjs).
// Vrais jetons MFA, vraie base (Vault, RLS, fonctions), blog-api réellement démarrée,
// connectée avec le rôle restreint ai_backend. Fournisseurs simulés en local : aucune
// requête payante, aucune vraie clé.

export const AI_KEYS = {
  openai:    'CANARY-openai-key-0001-local-test',
  openai2:   'CANARY-openai-key-0002-local-test',
  groq:      'CANARY-groq-key-0001-local-test',
  anthropic: 'CANARY-anthropic-key-0001-local-test',
  direct:    'CANARY-direct-call-key-local-test',
};

const DIAGRAM = JSON.stringify({ diagramType: 'mind', nodes: { n1: { id: 'n1', label: 'Idée' } }, edges: [] });
const MARKER = 'MARQUEUR_CONFIDENTIEL_42';

export async function runAiScenarios(ctx) {
  const { API, check, psql, sqlValue, compose, stopApi, startApi, waitFor, sleep, rest, rpc, fakes, apiLogs, tokens } = ctx;
  const { adminAal2, adminAal1, userAal2 } = tokens;

  const api = async (method, path, token = adminAal2, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  let ip = 10;
  const pub = async (path, body, from = `198.51.100.${++ip}`) => {
    const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': from }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const inkspace = from => pub('/api/groq/generate', { prompt: 'Les planètes' }, from);
  const novamind = from => pub('/api/groq/generate-diagram', { prompt: 'SWOT' }, from);
  const agent = (from, message = 'Bonjour') => pub('/api/agent/chat', { message }, from);
  const responses = [];
  const overview = async () => { const r = await api('GET', '/api/admin/ai/overview'); responses.push(r.body); return r.body; };
  const feature = async id => (await overview()).features.find(f => f.id === id);
  const provider = async id => (await overview()).providers.find(p => p.id === id);
  const models = async id => { const r = await api('GET', `/api/admin/ai/providers/${id}/models`); responses.push(r.body); return r.body; };
  const lastCall = id => fakes[id].calls.at(-1);
  const callCount = () => Object.values(fakes).reduce((n, f) => n + f.calls.length, 0);
  const vaultCount = () => Number(sqlValue("select count(*) from vault.secrets where name like 'ai_provider_%';"));
  const vaultValue = id => sqlValue(`select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'ai_provider_${id}';`);

  const assign = async (id, providerId, modelId, enabled, params = {}) => {
    const f = await feature(id);
    return api('PUT', `/api/admin/ai/features/${id}/assignment`, adminAal2, {
      providerId, modelId, params, maxOutputTokens: f.maxOutputTokens, timeoutMs: f.timeoutMs, enabled, version: f.version,
    });
  };
  const probe = (id, providerId, modelId) =>
    api('POST', `/api/admin/ai/features/${id}/test`, adminAal2, { providerId, modelId, params: {}, confirmBilling: true });
  const quotas = async (id, over) => {
    const q = (await feature(id)).quotas;
    return api('PUT', `/api/admin/ai/features/${id}/quotas`, adminAal2, {
      perSubjectPerDay: q.perSubjectPerDay, globalPerDay: q.globalPerDay, perMinute: q.perMinute, concurrency: q.concurrency,
      dailyBudgetUsd: q.dailyBudgetMicroUsd === null ? null : q.dailyBudgetMicroUsd / 1e6,
      monthlyBudgetUsd: q.monthlyBudgetMicroUsd === null ? null : q.monthlyBudgetMicroUsd / 1e6,
      version: q.version, ...over,
    });
  };

  fakes.openai.models = [{ id: 'gpt-6-astra' }, { id: 'gpt-6.1-terra' }, { id: 'modele-c' }];
  fakes.groq.models = [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }];
  fakes.anthropic.models = [{ id: 'claude-sonnet-5-5', vision: true }, { id: 'claude-haiku-5-5', vision: true }];
  fakes.openai.acceptedKeys = [AI_KEYS.openai, AI_KEYS.openai2];
  fakes.groq.acceptedKeys = [AI_KEYS.groq];
  fakes.anthropic.acceptedKeys = [AI_KEYS.anthropic];
  for (const fake of Object.values(fakes)) fake.behavior = { kind: 'ok', content: DIAGRAM };

  console.log('▶ Centre IA : contrôle d’accès avec de vrais jetons');
  check('IA : anonyme → 401', (await api('GET', '/api/admin/ai/overview', null)).status === 401);
  check('IA : utilisateur non administrateur → 403', (await api('GET', '/api/admin/ai/overview', userAal2)).status === 403);
  const noMfa = await api('GET', '/api/admin/ai/overview', adminAal1);
  check('IA : administrateur sans MFA → 403 MFA_REQUIRED', noMfa.status === 403 && noMfa.body?.code === 'MFA_REQUIRED');
  const first = await overview();
  check('IA : admin MFA → vue d’ensemble (6 fournisseurs, 9 fonctionnalités)', first?.providers?.length === 6 && first?.features?.length === 9, `${first?.providers?.length} / ${first?.features?.length}`);
  check('IA : budget initial 5 USD/jour et 30 USD/mois', first.budget.dailyLimitMicroUsd === 5_000_000 && first.budget.monthlyLimitMicroUsd === 30_000_000);
  check('IA : connexion ai_backend établie (registre synchronisé au démarrage)', first.runtime.databaseConfigured === true && Number(sqlValue('select count(*) from public.ai_features;')) === 9);
  check('IA : aucune fonctionnalité active au départ', first.features.every(f => !f.enabled));

  const directTables = await Promise.all(['ai_providers', 'ai_feature_assignments', 'ai_usage_events', 'ai_config_audit'].flatMap(t => [rest(`${t}?select=*`), rest(`${t}?select=*`, adminAal2)]));
  check('IA : tables ai_* illisibles en direct (anonyme et même admin MFA)', directTables.every(r => r.status >= 400), directTables.map(r => r.status).join(','));
  const privateFn = await rpc('runtime_secret', { p_provider: 'openai' }, adminAal2);
  check('IA : fonctions d’exécution invisibles depuis PostgREST', privateFn.status === 404, `HTTP ${privateFn.status}`);
  const direct = await rpc('ai_admin_set_provider_key', { p_provider: 'openai', p_key: AI_KEYS.direct, p_fingerprint: '0123456789abcdef' }, userAal2);
  check('IA : appel SQL direct d’un non-admin refusé', direct.status >= 400 && vaultCount() === 0, `HTTP ${direct.status}`);

  const before = await api('GET', '/api/ai/features', null);
  check('IA : visiteurs, rien de disponible avant configuration', before.body.features.every(f => !f.available));
  const blocked = await agent();
  check('IA : assistant refusé sans configuration, aucun appel fournisseur', blocked.status === 503 && callCount() === 0, `HTTP ${blocked.status}`);

  console.log('▶ Centre IA : clés API (Vault)');
  const rejected = await api('PUT', '/api/admin/ai/providers/openai/key', adminAal2, { key: 'CANARY-mauvaise-cle-local' });
  check('IA : clé refusée par le fournisseur → 422, rien dans Vault', rejected.status === 422 && rejected.body?.code === 'AI_KEY_REJECTED' && vaultCount() === 0);
  const saved = await api('PUT', '/api/admin/ai/providers/openai/key', adminAal2, { key: AI_KEYS.openai });
  responses.push(saved.body);
  check('IA : clé enregistrée après vérification → empreinte renvoyée', saved.status === 200 && /^[0-9a-f]{16}$/.test(saved.body?.fingerprint ?? ''), `HTTP ${saved.status} ${saved.body?.code ?? ''}`);
  check('IA : clé chiffrée dans Vault, lisible côté serveur seulement', vaultCount() === 1 && vaultValue('openai') === AI_KEYS.openai);
  check('IA : chiffrée au repos', Number(sqlValue(`select count(*) from vault.secrets where secret like '%CANARY%';`)) === 0);
  const replaced = await api('PUT', '/api/admin/ai/providers/openai/key', adminAal2, { key: AI_KEYS.openai2 });
  check('IA : remplacement de clé, sans doublon, nouvelle empreinte', replaced.status === 200 && vaultCount() === 1 && vaultValue('openai') === AI_KEYS.openai2 && replaced.body.fingerprint !== saved.body.fingerprint);
  for (const id of ['groq', 'anthropic']) responses.push((await api('PUT', `/api/admin/ai/providers/${id}/key`, adminAal2, { key: AI_KEYS[id] })).body);
  const testConn = await api('POST', '/api/admin/ai/providers/groq/test');
  check('IA : test de connexion avec la clé stockée, sans génération', testConn.body?.ok === true && fakes.groq.calls.length === 0);
  const openai = await provider('openai');
  check('IA : fournisseur configuré et actif, date de synchronisation affichée', openai.keyStatus === 'valid' && openai.enabled && openai.lastSyncOk && !!openai.lastSyncAt);

  console.log('▶ Centre IA : catalogue des modèles');
  let catalog = await models('openai');
  check('IA : catalogue actualisé depuis le fournisseur', ['gpt-6-astra', 'gpt-6.1-terra', 'modele-c'].every(id => catalog.models.some(m => m.modelId === id && m.origin === 'official')));
  check('IA : modèles initiaux non confirmés restés « seed »', catalog.models.some(m => m.modelId === 'gpt-6-luna' && m.origin === 'seed'));
  check('IA : ajout manuel', (await api('POST', '/api/admin/ai/providers/openai/models', adminAal2, { modelId: 'gpt-6-manuel' })).status === 200);
  catalog = await models('openai');
  check('IA : modèle manuel distingué, non vérifié', catalog.models.some(m => m.modelId === 'gpt-6-manuel' && m.origin === 'manual' && m.status === 'unverified'));
  const del = await api('DELETE', '/api/admin/ai/providers/openai/models?modelId=modele-c');
  check('IA : suppression permanente', del.status === 200 && sqlValue("select count(*) from public.ai_models where model_id = 'modele-c';") === '0');
  await api('POST', '/api/admin/ai/providers/openai/models/sync');
  catalog = await models('openai');
  check('IA : modèle supprimé non réintroduit par la synchronisation', !catalog.models.some(m => m.modelId === 'modele-c') && catalog.excluded.some(e => e.modelId === 'modele-c'));
  check('IA : modèle manuel conservé après synchronisation', catalog.models.some(m => m.modelId === 'gpt-6-manuel' && m.origin === 'manual'));
  check('IA : restauration', (await api('POST', '/api/admin/ai/providers/openai/models/restore', adminAal2, { modelId: 'modele-c' })).status === 200
    && (await models('openai')).models.some(m => m.modelId === 'modele-c' && m.status === 'unverified'));
  const syncedAt = (await provider('openai')).lastSyncAt;
  const count = (await models('openai')).models.length;
  fakes.openai.modelListStatus = 503;
  const failed = await api('POST', '/api/admin/ai/providers/openai/models/sync');
  fakes.openai.modelListStatus = 200;
  const afterFail = await provider('openai');
  check('IA : échec d’actualisation signalé, liste et vraie date conservées', failed.status === 502 && afterFail.lastSyncOk === false
    && afterFail.lastSyncAt === syncedAt && (await models('openai')).models.length === count);

  console.log('▶ Centre IA : affectations et tests de compatibilité');
  const early = await assign('inkspace.generate', 'openai', 'gpt-6-astra', true);
  check('IA : activation sans test refusée', early.status === 422 && early.body?.blocker === 'not_validated');
  const t1 = await probe('inkspace.generate', 'openai', 'gpt-6-astra');
  check('IA : test InkSpace (texte + JSON) → compatible, clé stockée utilisée', t1.body?.status === 'compatible' && lastCall('openai').headers.authorization === `Bearer ${AI_KEYS.openai2}`);
  check('IA : InkSpace activé sur OpenAI', (await assign('inkspace.generate', 'openai', 'gpt-6-astra', true)).status === 200);
  for (const id of ['novamind.diagram', 'agent.chat']) {
    await probe(id, 'groq', 'openai/gpt-oss-120b');
    await assign(id, 'groq', 'openai/gpt-oss-120b', true);
  }
  const ocr = await probe('cv.import.ocr', 'groq', 'openai/gpt-oss-120b');
  check('IA : OCR sur un modèle sans vision → incompatible, sans appel', ocr.body?.status === 'incompatible' && ocr.body?.code === 'vision_unsupported');
  check('IA : modèle incompatible jamais activable pour l’OCR', (await assign('cv.import.ocr', 'groq', 'openai/gpt-oss-120b', true)).status === 422);

  const available = Object.fromEntries((await api('GET', '/api/ai/features', null)).body.features.map(f => [f.id, f.available]));
  check('IA : disponibilité publique à jour, sans fournisseur ni modèle', available['inkspace.generate'] && available['novamind.diagram'] && available['agent.chat'] && !available['cv.generate']);

  console.log('▶ Centre IA : les assistants utilisent leurs affectations');
  const ink = await inkspace();
  check('IA : InkSpace → OpenAI gpt-6-astra avec la clé de Vault', ink.status === 200 && lastCall('openai').body.model === 'gpt-6-astra' && lastCall('openai').headers.authorization === `Bearer ${AI_KEYS.openai2}`, `HTTP ${ink.status}`);
  const nova = await novamind();
  check('IA : NovaMind → Groq gpt-oss-120b', nova.status === 200 && nova.body?.nodes?.n1 && lastCall('groq').body.model === 'openai/gpt-oss-120b' && lastCall('groq').headers.authorization === `Bearer ${AI_KEYS.groq}`);
  check('IA : assistant Clone → Groq', (await agent(undefined, `Question ${MARKER}`)).status === 200 && lastCall('groq').body.model === 'openai/gpt-oss-120b');

  await probe('novamind.diagram', 'groq', 'openai/gpt-oss-20b');
  await assign('novamind.diagram', 'groq', 'openai/gpt-oss-20b', true);
  await novamind();
  const novaModel = lastCall('groq').body.model;
  await agent();
  check('IA : nouveau modèle de NovaMind appliqué dès la requête suivante', novaModel === 'openai/gpt-oss-20b');
  check('IA : l’assistant Clone garde son propre modèle', lastCall('groq').body.model === 'openai/gpt-oss-120b');

  await probe('inkspace.generate', 'anthropic', 'claude-sonnet-5-5');
  check('IA : InkSpace passe sur Anthropic', (await assign('inkspace.generate', 'anthropic', 'claude-sonnet-5-5', true)).status === 200);
  const anthropicBefore = fakes.anthropic.calls.length;
  await inkspace();
  check('IA : InkSpace → Anthropic, clé en x-api-key', fakes.anthropic.calls.length === anthropicBefore + 1 && lastCall('anthropic').headers['x-api-key'] === AI_KEYS.anthropic && lastCall('anthropic').body.model === 'claude-sonnet-5-5');
  await novamind();
  check('IA : NovaMind non affecté par le changement d’InkSpace', lastCall('groq').body.model === 'openai/gpt-oss-20b');

  console.log('▶ Centre IA : persistance');
  await stopApi();
  await startApi();
  const anthropicCalls = fakes.anthropic.calls.length;
  await inkspace();
  await novamind();
  check('IA : redémarrage du backend → affectations conservées et appliquées', fakes.anthropic.calls.length === anthropicCalls + 1 && lastCall('groq').body.model === 'openai/gpt-oss-20b');
  compose('restart', 'db');
  await sleep(3000);
  compose('restart', 'rest', 'auth', 'storage');
  await waitFor('PostgREST', 'http://127.0.0.1:58332/');
  await waitFor('Auth', 'http://127.0.0.1:58331/health');
  await sleep(2000);
  let restarted = { status: 0 };
  for (let i = 0; i < 5 && restarted.status !== 200; i++) { restarted = await inkspace(); if (restarted.status !== 200) await sleep(1000); }
  check('IA : redémarrage de Postgres → configuration et clés conservées', restarted.status === 200 && lastCall('anthropic').body.model === 'claude-sonnet-5-5', `HTTP ${restarted.status}`);
  check('IA : vue d’ensemble identique après redémarrage', (await feature('inkspace.generate')).providerId === 'anthropic' && (await feature('novamind.diagram')).modelId === 'openai/gpt-oss-20b');

  console.log('▶ Centre IA : quotas et budgets');
  check('IA : quota de l’assistant ramené à 1 par visiteur', (await quotas('agent.chat', { perSubjectPerDay: 1 })).status === 200);
  const groqBefore = fakes.groq.calls.length;
  const q1 = await agent('203.0.113.50');
  const q2 = await agent('203.0.113.50');
  check('IA : quota par visiteur appliqué, sans appel au fournisseur', q1.status === 200 && q2.status === 429 && q2.body?.code === 'AI_QUOTA_EXCEEDED' && fakes.groq.calls.length === groqBefore + 1, `${q1.status}/${q2.status}`);
  check('IA : un autre visiteur reste servi', (await agent('203.0.113.51')).status === 200);
  await quotas('inkspace.generate', { dailyBudgetUsd: 0.000001 });
  const anthropicNow = fakes.anthropic.calls.length;
  const overBudget = await inkspace();
  check('IA : sous-budget d’InkSpace atteint → 429, aucun appel', overBudget.status === 429 && overBudget.body?.code === 'AI_BUDGET_EXCEEDED' && fakes.anthropic.calls.length === anthropicNow);
  check('IA : NovaMind non touché par ce sous-budget', (await novamind()).status === 200);
  await api('PUT', '/api/admin/ai/budget', adminAal2, { dailyUsd: 0, monthlyUsd: 30, globalConcurrency: 8 });
  const noBudget = await novamind();
  check('IA : budget global épuisé → toutes les fonctionnalités refusées', noBudget.status === 429 && noBudget.body?.code === 'AI_BUDGET_EXCEEDED');
  await api('PUT', '/api/admin/ai/budget', adminAal2, { dailyUsd: 5, monthlyUsd: 30, globalConcurrency: 8 });
  check('IA : budget rétabli', (await novamind()).status === 200);

  const usage = (await api('GET', '/api/admin/ai/usage?days=1')).body;
  check('IA : statistiques par fonctionnalité, coût estimé', usage.byFeature.some(r => r.featureId === 'novamind.diagram' && r.costMicroUsd > 0) && usage.recent.some(r => r.kind === 'probe'));
  check('IA : refus tracés dans l’historique', Number(sqlValue("select count(*) from public.ai_usage_events where outcome = 'blocked' and code like 'AI_BUDGET_EXCEEDED%';")) >= 2);
  check('IA : compteurs persistants en base', Number(sqlValue("select coalesce(sum(cost_micro_usd), 0) from public.ai_usage_counters where scope = 'global' and period = 'day';")) > 0);
  check('IA : aucun contenu de conversation en base', Number(sqlValue(`select count(*) from public.ai_usage_events e where row_to_json(e)::text like '%${MARKER}%';`)) === 0);

  console.log('▶ Centre IA : protections');
  const inUse = await api('DELETE', `/api/admin/ai/providers/groq/models?modelId=${encodeURIComponent('openai/gpt-oss-20b')}`);
  check('IA : suppression d’un modèle affecté refusée', inUse.status === 409 && inUse.body?.features?.includes('novamind.diagram'));
  await api('PATCH', '/api/admin/ai/providers/groq', adminAal2, { enabled: false });
  const off = await novamind();
  check('IA : fournisseur désactivé → assistants concernés coupés', off.status === 503 && (await agent()).status === 503);
  await api('PATCH', '/api/admin/ai/providers/groq', adminAal2, { enabled: true });
  check('IA : réactivation', (await novamind()).status === 200);
  check('IA : clé supprimée → retirée de Vault, InkSpace coupé',
    (await api('DELETE', '/api/admin/ai/providers/anthropic/key')).status === 200 && !vaultValue('anthropic') && (await inkspace()).status === 503);

  const audit = (await api('GET', '/api/admin/ai/audit?limit=200')).body;
  check('IA : journal d’audit complet', Array.isArray(audit) && audit.length >= 20 && audit.some(a => a.action === 'provider.key.set') && audit.some(a => a.action === 'model.delete'));
  check('IA : audit en ajout seul, même pour le propriétaire', (() => { try { psql('postgres', 'update public.ai_config_audit set action = action;'); return false; } catch { return true; } })());

  const secrets = Object.values(AI_KEYS);
  const leaks = where => secrets.filter(s => where.includes(s));
  check('IA : aucune clé dans les réponses de l’API', leaks(JSON.stringify(responses)).length === 0);
  check('IA : aucune clé dans l’audit', leaks(JSON.stringify(audit)).length === 0);
  // Témoins positifs : les journaux examinés contiennent bien l'activité, y compris l'appel refusé
  check('IA : aucune clé dans les journaux de l’API', apiLogs().includes('[AI_USAGE]') && leaks(apiLogs()).length === 0, `${apiLogs().length} caractères`);
  const dbLogs = compose('logs', 'db').stdout + compose('logs', 'rest').stdout;
  check('IA : aucune clé dans les journaux Postgres et PostgREST, même après un appel refusé',
    dbLogs.includes('ai_forbidden') && leaks(dbLogs).length === 0, `appel refusé journalisé : ${dbLogs.includes('ai_forbidden')}`);
}
