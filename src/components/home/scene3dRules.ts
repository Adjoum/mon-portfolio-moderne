// Règles communes aux scènes 3D de l'accueil (cylindre, globe). Aucun import de three.js ici :
// ce module reste dans le bundle principal, la 3D n'est téléchargée qu'une fois décidée.

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Une scène a dû renoncer pendant cette visite : les suivantes n'essaient pas, le résultat serait le même */
let tooSlow = false
const listeners = new Set<() => void>()
export const reportTooSlow = () => {
  tooSlow = true
  listeners.forEach(notify => notify())
}
export const onTooSlow = (notify: () => void) => {
  listeners.add(notify)
  return () => { listeners.delete(notify) }
}

/** Économie de données, réseau très lent ou appareil modeste : la 3D n'est pas proposée */
export function modestDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }
  if (tooSlow || nav.connection?.saveData) return true
  if (/(^|-)2g$/.test(nav.connection?.effectiveType ?? '')) return true
  if ((nav.deviceMemory ?? 8) <= 2) return true
  return (nav.hardwareConcurrency ?? 8) <= 2
}

export type BudgetVerdict = 'keep' | 'lower' | 'abandon'

/** Mêmes seuils que la bulle du Hero (elasticBubble.ts) : qualité réduite, puis repli sans 3D */
const LOWER_ABOVE_MS = 28
const ABANDON_ABOVE_MS = 40
const SAMPLE = 45
/** Premier bilan, assez tôt pour renoncer avant de montrer quoi que ce soit : 1 à 2 s sur un appareil lent */
const FIRST_SAMPLE = 10
/** Moins de 20 images par seconde : la scène n'est pas montrée, la fluidité passe avant l'effet */
const HOPELESS_ABOVE_MS = 50
/** Premières images ignorées : compilation des shaders, envoi des textures */
const WARM_UP = 6
/** Au-delà : onglet masqué ou animation suspendue, pas un appareil lent… */
const GAP_MS = 250
/** …sauf si cela se répète d'une image à l'autre */
const GAP_STREAK = 6

const medianOf = (samples: number[]) => [...samples].sort((a, b) => a - b)[samples.length >> 1]

/**
 * Surveille l'intervalle médian entre deux images : renonce aussitôt si l'appareil est très lent,
 * sinon réduit d'abord la qualité et n'abandonne que si cela ne suffit pas.
 * Un seul appel renvoie autre chose que `keep` à chaque palier.
 */
export class FrameBudget {
  private samples: number[] = []
  private skipped = 0
  private lowered = false
  private gaps = 0
  /** Premier bilan passé : la scène peut s'afficher sans risquer une apparition suivie d'un retrait */
  verified = false

  push(ms: number): BudgetVerdict {
    if (ms <= 0) return 'keep'
    if (ms > GAP_MS) return ++this.gaps >= GAP_STREAK ? 'abandon' : 'keep'
    this.gaps = 0
    if (this.skipped < WARM_UP) {
      this.skipped++
      return 'keep'
    }
    this.samples.push(ms)
    if (!this.verified && this.samples.length === FIRST_SAMPLE) {
      if (medianOf(this.samples) > HOPELESS_ABOVE_MS) return 'abandon'
      this.verified = true
    }
    if (this.samples.length < SAMPLE) return 'keep'
    const median = medianOf(this.samples)
    this.samples = []
    if (!this.lowered && median > LOWER_ABOVE_MS) {
      this.lowered = true
      this.skipped = 0
      return 'lower'
    }
    return this.lowered && median > ABANDON_ABOVE_MS ? 'abandon' : 'keep'
  }
}
