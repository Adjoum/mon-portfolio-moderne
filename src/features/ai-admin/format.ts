// src/features/ai-admin/format.ts
// Libellés et formats du centre IA (aucun identifiant de modèle : ils viennent tous de la base)

import type { Blocker, CatalogModel, Compat, KeyStatus, ModelOrigin, ModelStatus } from './api'

export const FEATURE_LABELS: Record<string, string> = {
  'agent.chat':          'Assistant Clone IA',
  'inkspace.generate':   'InkSpace — génération',
  'novamind.diagram':    'NovaMind — diagrammes',
  'cv.generate':         'Génération de CV',
  'cv.review':           'Vérification de CV',
  'cv.import.structure': 'Import de CV — structuration',
  'cv.import.ocr':       'Import de CV — lecture d’image (OCR)',
  'latex.generate':      'LaTeX — génération',
  'latex.improve':       'LaTeX — amélioration',
  'latex.fix':           'LaTeX — correction des erreurs de compilation',
  'latex.import.structure': 'LaTeX — import de CV (structuration)',
  'latex.import.ocr':    'LaTeX — import de CV (lecture d’image)',
  'latex.rewrite':       'LaTeX — réécriture ciblée',
}

export const featureLabel = (id: string) => FEATURE_LABELS[id] ?? id

export const KEY_STATUS: Record<KeyStatus, string> = {
  not_configured: 'Non configuré',
  valid:          'Clé valide',
  invalid:        'Clé refusée',
}

export const MODEL_STATUS: Record<ModelStatus, string> = {
  available:    'Disponible',
  unverified:   'Non vérifié',
  incompatible: 'Incompatible',
  deprecated:   'Déprécié',
  disabled:     'Désactivé',
}

export const MODEL_ORIGIN: Record<ModelOrigin, string> = {
  official: 'Catalogue officiel',
  manual:   'Ajout manuel',
  seed:     'Liste initiale',
}

export const BLOCKERS: Record<Blocker, string> = {
  no_model:          'Aucun modèle choisi',
  key_missing:       'Clé API absente ou refusée',
  provider_disabled: 'Fournisseur désactivé',
  model_unavailable: 'Modèle désactivé ou incompatible',
  not_validated:     'Test de compatibilité requis',
  unpriced:          'Tarif du modèle à saisir',
}

export const CAPABILITIES: Record<string, string> = { text: 'texte', json: 'JSON', vision: 'image' }

export const PARAM_LABELS: Record<string, string> = {
  temperature:       'Température',
  top_p:             'Top p',
  top_k:             'Top k',
  stop:              'Séquence d’arrêt',
  presence_penalty:  'Pénalité de présence',
  frequency_penalty: 'Pénalité de fréquence',
  seed:              'Graine',
  reasoning_effort:  'Effort de raisonnement',
}

export const REASONING_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export const MICRO_PER_USD = 1_000_000

export function formatUsd(micro: number | null | undefined, digits = 2): string {
  if (micro === null || micro === undefined) return '—'
  const usd = micro / MICRO_PER_USD
  const precise = usd !== 0 && Math.abs(usd) < 0.01
  return `${usd.toLocaleString('fr-FR', { minimumFractionDigits: precise ? 4 : digits, maximumFractionDigits: precise ? 6 : digits })} $`
}

/** Prix par million de tokens, en USD lisibles */
export const perMTok = (micro: number) => (micro / MICRO_PER_USD).toLocaleString('fr-FR', { maximumFractionDigits: 4 })

export function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

export const formatTokens = (n: number | null | undefined) => (n ? n.toLocaleString('fr-FR') : '—')

/** Part consommée, bornée à 100 % pour l'affichage */
export const ratio = (used: number, limit: number | null | undefined) =>
  !limit ? (used > 0 ? 100 : 0) : Math.min(100, Math.round((used / limit) * 100))

// ── États de capacité (P1) : jamais un succès vert pour un test en échec ──

export type CapabilityState = 'available' | 'compatible' | 'vision_confirmed' | 'text_only' | 'untested' | 'incompatible' | 'config_error'
type StateTone = 'green' | 'red' | 'amber' | 'gray' | 'sky'

export const CAPABILITY_STATES: Record<CapabilityState, { label: string; tone: StateTone; hint: string }> = {
  available:        { label: 'Disponible', tone: 'sky', hint: 'Présent dans le catalogue de ce compte : aucune capacité n’est encore démontrée.' },
  compatible:       { label: 'Compatible', tone: 'green', hint: 'Toutes les capacités requises ont été démontrées par une sonde réelle.' },
  vision_confirmed: { label: 'Vision confirmée', tone: 'green', hint: 'Le modèle a lu le code de l’image de test : lecture d’image démontrée.' },
  text_only:        { label: 'Texte uniquement', tone: 'red', hint: 'Le texte fonctionne, mais le modèle refuse ou ne lit pas l’image.' },
  untested:         { label: 'Non testé', tone: 'gray', hint: 'Aucune sonde n’a encore été lancée pour cette combinaison.' },
  incompatible:     { label: 'Incompatible confirmé', tone: 'red', hint: 'Une sonde a montré que ce modèle ne convient pas à cette fonctionnalité.' },
  config_error:     { label: 'Erreur de configuration', tone: 'amber', hint: 'La requête ou la configuration est en cause : rien n’est conclu sur le modèle.' },
}

/** État d'une fonctionnalité pour le modèle affecté, d'après son dernier test */
export function compatState(compat: Pick<Compat, 'status' | 'capabilities' | 'failedCapability'> | null | undefined): CapabilityState {
  if (!compat) return 'untested'
  if (compat.status === 'config_error') return 'config_error'
  if (compat.status === 'compatible') return compat.capabilities?.includes('vision') ? 'vision_confirmed' : 'compatible'
  return compat.failedCapability === 'vision' && compat.capabilities?.includes('text') ? 'text_only' : 'incompatible'
}

/** États d'un modèle du catalogue, toutes fonctionnalités confondues */
export function modelStates(model: Pick<CatalogModel, 'status' | 'compat' | 'lastSeenAt' | 'origin'>): CapabilityState[] {
  const states = new Set<CapabilityState>()
  if (model.status === 'available' || (model.origin === 'official' && model.lastSeenAt)) states.add('available')
  const results = model.compat.map(c => compatState({ status: c.status, capabilities: c.capabilities ?? [], failedCapability: c.failedCapability ?? null }))
  if (!results.length) states.add('untested')
  if (results.includes('vision_confirmed')) states.add('vision_confirmed')
  else if (results.includes('text_only')) states.add('text_only')
  if (results.includes('incompatible')) states.add('incompatible')
  if (results.includes('config_error')) states.add('config_error')
  return [...states]
}

/** Causes renvoyées par les sondes et les vérifications */
export const PROBE_CODES: Record<string, string> = {
  auth:                  'clé API refusée',
  permission_denied:     'modèle non ouvert à ce compte',
  model_not_found:       'modèle inexistant ou invisible pour ce compte',
  model_not_listed:      'modèle absent du catalogue du compte',
  endpoint_incompatible: 'point d’accès incompatible',
  unsupported_parameter: 'paramètre refusé',
  invalid_image:         'image de test refusée (requête)',
  bad_request:           'requête refusée (structure)',
  output_truncated:      'limite de sortie atteinte',
  payload_too_large:     'requête trop volumineuse',
  context_too_long:      'contexte trop long',
  vision_unsupported:    'image refusée ou non vue par le modèle',
  vision_misread:        'image mal lue',
  json_invalid:          'JSON invalide',
  timeout:               'délai dépassé',
  unavailable:           'fournisseur injoignable',
  rate_limited:          'limite de débit du fournisseur',
  quota_exceeded:        'crédit du compte fournisseur épuisé',
  budget_exceeded:       'budget du centre IA atteint',
}

export const probeCode = (code: string | null | undefined) => (code ? PROBE_CODES[code] ?? code : '')

/** Corrections automatiques de la forme de la requête */
export function adjustmentLabel(adjustment: string): string {
  const [kind, value] = adjustment.split(':')
  switch (kind) {
    case 'endpoint':             return 'API Responses utilisée (modèle absent de Chat Completions)'
    case 'output_limit_field':   return `limite de sortie transmise en « ${value} »`
    case 'image_detail_removed': return 'champ « detail » de l’image retiré'
    case 'json_mode_removed':    return 'mode JSON du fournisseur retiré (sortie validée par le serveur)'
    case 'probe_output_limit':   return `sonde relancée avec ${Number(value).toLocaleString('fr-FR')} tokens de sortie (réflexion longue)`
    default:                     return adjustment
  }
}
