// Vitesse du globe : logique pure, sans three.js, indépendante de la fréquence d'écran.

export const GLOBE_SPEEDS = [
  { id: 'lent', label: 'Lent', turnSeconds: 150 },
  { id: 'normal', label: 'Normal', turnSeconds: 70 },
  { id: 'rapide', label: 'Rapide', turnSeconds: 30 },
  { id: 'tres-rapide', label: 'Très rapide', turnSeconds: 12 },
] as const

export type GlobeSpeedId = (typeof GLOBE_SPEEDS)[number]['id']

export const DEFAULT_GLOBE_SPEED: GlobeSpeedId = 'lent'

/** Vitesse en rad/s */
export function speedValue(id: GlobeSpeedId): number {
  const level = GLOBE_SPEEDS.find(s => s.id === id) ?? GLOBE_SPEEDS[0]
  return (2 * Math.PI) / level.turnSeconds
}

const EASING_S = 0.7
const STOPPED = 0.0008

/** Transition fluide d'une vitesse à l'autre, et jusqu'à l'arrêt complet */
export function easeSpeed(current: number, target: number, dt: number): number {
  const next = current + (target - current) * (1 - Math.exp(-dt / EASING_S))
  return target === 0 && next < STOPPED ? 0 : next
}

/** Direction de rotation de la Terre : vers l'est, soit de gauche à droite vue de l'espace */
export const rotationAfter = (rotation: number, speed: number, dt: number) => rotation + speed * dt

/** Orientation de départ : la longitude donnée face à la caméra */
export const rotationFacing = (lon: number) => (-lon * Math.PI) / 180
