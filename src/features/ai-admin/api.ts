// src/features/ai-admin/api.ts
// Client du centre d'administration multi-IA (/api/admin/ai/*). Toutes les opérations passent
// par blog-api, qui revérifie admin + MFA et écrit dans Supabase : aucune donnée de
// configuration n'est conservée dans le navigateur, et une clé API n'est jamais relue.

import { adminFetch, describeAdminApiError } from '../../lib/adminAuth'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const BASE = `${API_URL}/admin/ai`

export const PROVIDER_IDS = ['openai', 'groq', 'xai', 'gemini', 'openrouter', 'anthropic'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export type KeyStatus = 'not_configured' | 'valid' | 'invalid'
export type ModelStatus = 'available' | 'unverified' | 'incompatible' | 'deprecated' | 'disabled'
export type ModelOrigin = 'official' | 'manual' | 'seed'
export type Blocker = 'no_model' | 'key_missing' | 'provider_disabled' | 'model_unavailable' | 'not_validated' | 'unpriced'
/** Issue d'une sonde : config_error ne dit rien du modèle (requête ou configuration en cause) */
export type CompatStatus = 'compatible' | 'incompatible' | 'config_error'
export type Capability = 'text' | 'json' | 'vision'

export interface CompatDetails {
  param?: string
  rejectedParams?: string[]
  adjustments?: string[]
  matrixVersion?: string
  vision?: { expected: string; received: string }
}

export interface Compat {
  status: CompatStatus
  capabilities: string[]
  testedAt: string
  code: string | null
  latencyMs?: number | null
  failedCapability?: Capability | null
  details?: CompatDetails
}

/** Profil du modèle selon la matrice de capacités (documentation officielle) : un indice, jamais une preuve */
export interface ModelProfile {
  matrixVersion: string
  rule: string | null
  reasoning: boolean | null
  visionDocumented: boolean | null
  endpoint: 'chat' | 'responses' | null
  rejectedParams: string[]
  samplingOnlyWithoutReasoning: boolean
  reasoningEfforts: string[] | null
  source: string | null
}

export interface ProviderState {
  id: ProviderId
  displayName: string
  enabled: boolean
  keyStatus: KeyStatus
  keyFingerprint: string | null
  keyUpdatedAt: string | null
  lastCheckAt: string | null
  lastCheckOk: boolean | null
  lastCheckCode: string | null
  lastSyncAt: string | null
  lastSyncAttemptAt: string | null
  lastSyncOk: boolean | null
  lastSyncCode: string | null
  lastSyncCount: number | null
  modelCount: number
  assignedCount: number
}

export interface FeatureQuotas {
  perSubjectPerDay: number
  globalPerDay: number
  perMinute: number
  concurrency: number
  dailyBudgetMicroUsd: number | null
  monthlyBudgetMicroUsd: number | null
  version: number
}

export interface FeatureState {
  id: string
  section: string
  requiredCapabilities: string[]
  output: 'text' | 'json'
  personalData: boolean
  providerId: ProviderId
  modelId: string | null
  enabled: boolean
  params: Record<string, number | string>
  maxOutputTokens: number
  timeoutMs: number
  version: number
  updatedAt: string
  blocker: Blocker | null
  compat: Compat | null
  quotas: FeatureQuotas
  usage: { dayRequests: number; dayCostMicroUsd: number; monthCostMicroUsd: number }
}

export interface Overview {
  providers: ProviderState[]
  features: FeatureState[]
  budget: {
    dailyLimitMicroUsd: number | null
    monthlyLimitMicroUsd: number | null
    globalConcurrency: number | null
    dayCostMicroUsd: number
    monthCostMicroUsd: number
    dayRequests: number
  }
  runtime: { databaseConfigured: boolean }
  paramsByProvider: Record<ProviderId, string[]>
}

export interface CatalogModel {
  modelId: string
  origin: ModelOrigin
  status: ModelStatus
  displayName: string | null
  contextWindow: number | null
  maxOutputTokens: number | null
  vision: boolean | null
  shutdownDate: string | null
  firstSeenAt: string
  lastSeenAt: string | null
  lastVerifiedAt: string | null
  pricing: { inputPerMTok: number; outputPerMTok: number; source: 'seed' | 'catalog' | 'admin' } | null
  usedBy: { featureId: string; enabled: boolean }[]
  compat: (Partial<Compat> & { featureId: string; status: CompatStatus; testedAt: string })[]
  profile?: ModelProfile
}

export interface Catalog {
  matrixVersion?: string
  models: CatalogModel[]
  excluded: { modelId: string; origin: ModelOrigin; excludedAt: string }[]
}

export interface Usage {
  byDay: { day: string; requests: number; errors: number; costMicroUsd: number }[]
  byFeature: {
    featureId: string; providerId: string | null; modelId: string | null; requests: number; errors: number; blocked: number
    inputTokens: number; outputTokens: number; costMicroUsd: number; avgLatencyMs: number | null
  }[]
  recent: {
    at: string; kind: 'run' | 'probe'; featureId: string; providerId: string | null; modelId: string | null
    outcome: 'ok' | 'error' | 'blocked'; code: string | null; latencyMs: number | null; costMicroUsd: number | null
  }[]
}

export interface AuditEntry {
  id: number
  at: string
  actorId: string
  action: string
  entityType: string
  entityId: string
  before: unknown
  after: unknown
}

export interface ProbeResult {
  status: CompatStatus
  capabilities: string[]
  required: string[]
  failedCapability: Capability | null
  code: string | null
  /** Paramètre refusé par le fournisseur (nom seulement) */
  param: string | null
  /** Paramètres de l'affectation que ce modèle refuse */
  rejectedParams: string[]
  /** Corrections de forme appliquées automatiquement */
  adjustments: string[]
  vision: { expected: string; received: string } | null
  latencyMs: number
  estimatedCostMicroUsd: number
  /** false : aucune requête facturée, rien d'enregistré (matrice, modèle absent du catalogue) */
  recorded: boolean
  message: string | null
  matrixVersion: string
  estimate: { requests: number; maxRequests: number; maxCostMicroUsd: number | null }
}

export interface TestEstimate {
  requests: number
  maxRequests: number
  inputTokens: number
  outputTokens: number
  maxCostMicroUsd: number | null
  priced: boolean
  steps: Capability[]
  /** null : budget invérifiable */
  budgetOk: boolean | null
  profile: ModelProfile
}

export interface ModelCheck {
  status: 'available' | 'not_listed' | 'key_rejected' | 'unknown'
  message: string
  catalogVision?: boolean | null
  profile: ModelProfile
  latencyMs: number
}

/** Erreur renvoyée par le serveur : message déjà rédigé pour l'administrateur */
export class AiAdminError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'AiAdminError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await adminFetch(`${BASE}${path}`, {
      method,
      cache:   'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body:    body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AiAdminError(0, 'NETWORK', 'Serveur injoignable. Vérifiez votre connexion : rien n’a été modifié.')
  }
  const data = await res.json().catch(() => null) as (T & { error?: unknown; code?: unknown }) | null
  if (!res.ok) {
    const details: Record<string, unknown> = { ...(data ?? {}) }
    const code = details.code
    delete details.error
    delete details.code
    throw new AiAdminError(res.status, typeof code === 'string' ? code : `HTTP_${res.status}`, describeAdminApiError(res.status, data), details)
  }
  return data as T
}

const provider = (id: ProviderId) => `/providers/${encodeURIComponent(id)}`
const feature = (id: string) => `/features/${encodeURIComponent(id)}`

export const aiAdmin = {
  overview: () => request<Overview>('GET', '/overview'),
  models: (id: ProviderId) => request<Catalog>('GET', `${provider(id)}/models`),
  usage: (days: number) => request<Usage>('GET', `/usage?days=${days}`),
  audit: (beforeId?: number) => request<AuditEntry[]>('GET', `/audit?limit=50${beforeId ? `&before=${beforeId}` : ''}`),

  setKey: (id: ProviderId, key: string) => request<{ fingerprint: string; sync: unknown }>('PUT', `${provider(id)}/key`, { key }),
  deleteKey: (id: ProviderId) => request('DELETE', `${provider(id)}/key`),
  testProvider: (id: ProviderId) => request<{ ok: boolean; modelCount?: number; code?: string; latencyMs: number }>('POST', `${provider(id)}/test`),
  setProviderEnabled: (id: ProviderId, enabled: boolean) => request('PATCH', provider(id), { enabled }),

  syncModels: (id: ProviderId) => request<{ received: number; added: number; excludedSkipped: number; deprecated: number }>('POST', `${provider(id)}/models/sync`),
  addModel: (id: ProviderId, modelId: string, displayName = '') => request('POST', `${provider(id)}/models`, { modelId, displayName }),
  setModelDisabled: (id: ProviderId, modelId: string, disabled: boolean) => request('PATCH', `${provider(id)}/models`, { modelId, disabled }),
  deleteModel: (id: ProviderId, modelId: string) => request('DELETE', `${provider(id)}/models?modelId=${encodeURIComponent(modelId)}`),
  restoreModel: (id: ProviderId, modelId: string) => request('POST', `${provider(id)}/models/restore`, { modelId }),
  setPricing: (id: ProviderId, modelId: string, inputUsdPerMTok: number, outputUsdPerMTok: number) =>
    request('PUT', `${provider(id)}/models/pricing`, { modelId, inputUsdPerMTok, outputUsdPerMTok }),

  saveAssignment: (id: string, assignment: {
    providerId: ProviderId; modelId: string | null; params: Record<string, number | string>
    maxOutputTokens: number; timeoutMs: number; enabled: boolean; version: number
  }) => request<{ version: number }>('PUT', `${feature(id)}/assignment`, assignment),
  testFeature: (id: string, providerId: ProviderId, modelId: string, params: Record<string, number | string>, allowUnlisted = false) =>
    request<ProbeResult>('POST', `${feature(id)}/test`, { providerId, modelId, params, confirmBilling: true, ...(allowUnlisted ? { allowUnlisted } : {}) }),
  /** Gratuit : aucune génération */
  testEstimate: (id: string, providerId: ProviderId, modelId: string) =>
    request<TestEstimate>('GET', `${feature(id)}/test-estimate?providerId=${encodeURIComponent(providerId)}&modelId=${encodeURIComponent(modelId)}`),
  /** Gratuit : présence du modèle dans le catalogue du compte */
  checkModel: (id: ProviderId, modelId: string) => request<ModelCheck>('POST', `${provider(id)}/models/check`, { modelId }),
  saveQuotas: (id: string, quotas: {
    perSubjectPerDay: number; globalPerDay: number; perMinute: number; concurrency: number
    dailyBudgetUsd: number | null; monthlyBudgetUsd: number | null; version: number
  }) => request<{ version: number }>('PUT', `${feature(id)}/quotas`, quotas),
  saveBudget: (dailyUsd: number, monthlyUsd: number, globalConcurrency: number) =>
    request('PUT', '/budget', { dailyUsd, monthlyUsd, globalConcurrency }),
}
