// src/features/ai-admin/probeNotice.ts
// Message d'un test de compatibilité (P1) : vert uniquement si toutes les capacités requises sont
// démontrées. Une réponse HTTP 200 du serveur peut porter une incompatibilité ou une erreur de configuration.

import type { ProbeResult } from './api'
import { CAPABILITIES, CAPABILITY_STATES, PARAM_LABELS, adjustmentLabel, compatState, formatUsd, probeCode } from './format'
import type { Notice } from './useServerAction'

const capList = (caps: string[]) => caps.map(c => CAPABILITIES[c] ?? c).join(', ') || 'aucune'

export function probeNotice(r: ProbeResult): Notice {
  const extra = [
    r.adjustments.length ? `Corrections automatiques : ${r.adjustments.map(adjustmentLabel).join(' ; ')}.` : '',
    r.recorded ? `Coût estimé ${formatUsd(r.estimatedCostMicroUsd)} · ${r.latencyMs} ms.` : 'Aucune requête facturée : rien n’a été envoyé au modèle.',
  ].filter(Boolean).join('\n')
  if (r.status === 'compatible') {
    const vision = r.capabilities.includes('vision') && r.vision ? ` Image lue : « ${r.vision.received} » (attendu ${r.vision.expected}).` : ''
    return { type: 'success', text: `Test réussi : ${capList(r.capabilities)} démontré(s).${vision}\n${extra}` }
  }
  const cause = (r.message ?? probeCode(r.code)).replace(/[.\s]+$/, '')
  const param = r.param ? ` Paramètre concerné : « ${PARAM_LABELS[r.param] ?? r.param} ».` : ''
  if (r.status === 'config_error') {
    return { type: 'warning', text: `${CAPABILITY_STATES.config_error.label} — ${cause}.${param} Rien n’est conclu sur le modèle.\nCapacités démontrées : ${capList(r.capabilities)}.\n${extra}` }
  }
  const state = compatState(r)
  const vision = r.vision && r.failedCapability === 'vision' ? ` Image de test : attendu ${r.vision.expected}, reçu « ${r.vision.received || '(vide)'} ».` : ''
  return { type: 'error', text: `${CAPABILITY_STATES[state].label} — ${cause}.${vision}\nCapacités démontrées : ${capList(r.capabilities)}.\n${extra}` }
}

