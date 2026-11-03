// Mouvement du cylindre de l'accueil : logique pure, sans three.js, indépendante de la fréquence d'écran.

export const CARD_STEP = Math.PI / 2
/** Un tour en 48 s : assez lent pour lire, jamais agressif */
export const AUTO_SPEED = (2 * Math.PI) / 48
/** Une carte face à l'écran passe à ce pourcentage de la vitesse : plus de temps pour la lire */
const FACING_SLOWDOWN = 0.35
const SPEED_EASING_S = 0.45
const STIFFNESS = 26
const DAMPING = 9.5
const MAX_FLICK = 2.4
const REST_ANGLE = 0.0006
const REST_SPEED = 0.002

export interface CylinderInput {
  /** Carte à amener de face (lien survolé ou focalisé) */
  target: number | null
  /** Pointeur sur une carte, ou rotation mise en pause */
  hold: boolean
}

export interface CylinderState {
  angle: number
  speed: number
}

/** Vitesse automatique : continue, ralentie quand une carte est de face (angle multiple de CARD_STEP) */
export function autoSpeed(angle: number): number {
  const s = Math.sin(2 * angle)
  return AUTO_SPEED * (FACING_SLOWDOWN + (1 - FACING_SLOWDOWN) * s * s)
}

/** Angle équivalent le plus proche pour amener une carte de face : jamais plus d'un quart de tour inutile */
export function nearestAngle(angle: number, index: number): number {
  const base = index * CARD_STEP
  return base + 2 * Math.PI * Math.round((angle - base) / (2 * Math.PI))
}

export function stepCylinder(state: CylinderState, input: CylinderInput, dt: number): CylinderState {
  let { angle, speed } = state
  if (input.target !== null) {
    const goal = nearestAngle(angle, input.target)
    // Ressort presque critique, intégré par petites tranches : stable à toute fréquence
    let rest = dt
    while (rest > 0) {
      const h = Math.min(rest, 1 / 120)
      speed += ((goal - angle) * STIFFNESS - speed * DAMPING) * h
      angle += speed * h
      rest -= h
    }
    return { angle, speed }
  }
  const wanted = input.hold ? 0 : autoSpeed(angle)
  speed += (wanted - speed) * (1 - Math.exp(-dt / SPEED_EASING_S))
  return { angle: angle + speed * dt, speed }
}

/** Élan après un glissement : plafonné, puis résorbé par stepCylinder */
export const flick = (speed: number) => Math.max(-MAX_FLICK, Math.min(MAX_FLICK, speed))

/** Plus rien à dessiner : la scène peut cesser de demander des images */
export function atRest(state: CylinderState, input: CylinderInput): boolean {
  if (input.target !== null) return Math.abs(nearestAngle(state.angle, input.target) - state.angle) < REST_ANGLE && Math.abs(state.speed) < REST_SPEED
  return input.hold && Math.abs(state.speed) < REST_SPEED
}
