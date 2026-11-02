// P8.1 — Salutation du Hero selon l'heure locale du navigateur (aucune donnée envoyée au serveur)

const SLOTS = [
  { from: 5, text: 'Bonjour' },
  { from: 12, text: 'Bon après-midi' },
  { from: 18, text: 'Bonsoir' },
  { from: 22, text: 'Bonne nuit' },
] as const

/** Repli si l'heure est illisible : la salutation d'origine */
export const FALLBACK_GREETING = 'Bonjour'

/** Marge après le changement de créneau, pour ne pas se réveiller une milliseconde trop tôt */
const WAKE_MARGIN_MS = 50
/** Réveil au moins toutes les heures : rattrape un changement d'horloge ou de fuseau du système */
const MAX_WAIT_MS = 60 * 60 * 1000

export function greetingAt(date: Date): string {
  const hour = date.getHours()
  if (Number.isNaN(hour)) return FALLBACK_GREETING
  for (let i = SLOTS.length - 1; i >= 0; i--) if (hour >= SLOTS[i].from) return SLOTS[i].text
  // Avant 05:00 : suite de la nuit commencée à 22:00
  return SLOTS[SLOTS.length - 1].text
}

/** Délai avant la prochaine vérification. Par heure locale, donc juste aussi les jours de changement d'heure */
export function msUntilNextCheck(date: Date): number {
  const now = date.getTime()
  if (Number.isNaN(now)) return MAX_WAIT_MS
  const hour = date.getHours()
  const nextFrom = SLOTS.find(s => s.from > hour)?.from
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (nextFrom === undefined ? 1 : 0), nextFrom ?? SLOTS[0].from)
  return Math.min(next.getTime() - now + WAKE_MARGIN_MS, MAX_WAIT_MS)
}
