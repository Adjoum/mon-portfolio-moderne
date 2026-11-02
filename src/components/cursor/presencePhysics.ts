// Physique de la présence lumineuse qui accompagne le curseur (LiquidPresence.tsx).
// Pure et indépendante de la fréquence d'affichage (60, 90, 120 Hz : même trajectoire).

export interface PresenceState {
  x: number
  y: number
  /** Vitesse lissée de la présence (px/s) : elle commande l'étirement */
  vx: number
  vy: number
}

/** Rapidité du suivi : plus élevée, moins de retard (s⁻¹) */
export const FOLLOW = 16
/** Lissage de la vitesse mesurée (s⁻¹) : l'étirement naît et retombe progressivement */
export const VELOCITY_SMOOTHING = 10
/** Vitesse (px/s) à partir de laquelle l'étirement est maximal */
export const MAX_SPEED = 2200
/** Étirement maximal : +45 % dans le sens du mouvement, −25 % en travers */
export const STRETCH = { along: 0.45, across: 0.25 }

/** Une image : la présence rejoint la cible, sa vitesse lissée suit son propre déplacement */
export function step(state: PresenceState, target: { x: number; y: number }, dt: number): PresenceState {
  const t = Math.min(Math.max(dt, 0), 0.1) // pas plus de 100 ms : aucun bond après une pause
  if (t === 0) return state
  const k = 1 - Math.exp(-FOLLOW * t)
  const x = state.x + (target.x - state.x) * k
  const y = state.y + (target.y - state.y) * k
  const s = 1 - Math.exp(-VELOCITY_SMOOTHING * t)
  return {
    x,
    y,
    vx: state.vx + ((x - state.x) / t - state.vx) * s,
    vy: state.vy + ((y - state.y) / t - state.vy) * s,
  }
}

/** Déformation liquide : étirement dans le sens du mouvement, forme ronde à l'arrêt */
export function shape(state: PresenceState): { angle: number; scaleX: number; scaleY: number; speed: number } {
  const speed = Math.hypot(state.vx, state.vy)
  const amount = Math.min(speed / MAX_SPEED, 1)
  // Courbe douce : les petits mouvements ne déforment presque pas
  const eased = amount * amount * (3 - 2 * amount)
  return {
    angle: speed > 1 ? Math.atan2(state.vy, state.vx) : 0,
    scaleX: 1 + STRETCH.along * eased,
    scaleY: 1 - STRETCH.across * eased,
    speed,
  }
}

/** Au repos : plus rien à calculer (la boucle d'animation s'arrête) */
export function settled(state: PresenceState, target: { x: number; y: number }): boolean {
  return Math.abs(target.x - state.x) < 0.25 && Math.abs(target.y - state.y) < 0.25 && Math.hypot(state.vx, state.vy) < 4
}

/**
 * Attraction discrète vers le centre d'un élément interactif survolé (18 % de l'écart) :
 * la présence « coule » vers la cible sans jamais quitter le curseur.
 */
export function attract(pointer: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number } | null) {
  if (!rect) return pointer
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  return { x: pointer.x + (cx - pointer.x) * 0.18, y: pointer.y + (cy - pointer.y) * 0.18 }
}
