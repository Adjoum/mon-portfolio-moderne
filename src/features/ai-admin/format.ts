// src/features/ai-admin/format.ts
// Libellés et formats du centre IA (aucun identifiant de modèle : ils viennent tous de la base)

import type { Blocker, KeyStatus, ModelOrigin, ModelStatus } from './api'

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
