// Repères du globe : points, arcs et libellés. Aucune donnée de clientèle : ces repères illustrent
// les grandes zones de chaque continent, depuis la Côte d'Ivoire (San-Pedro, comme le pied de page).

export const HOME = { name: 'Côte d’Ivoire', lat: 4.75, lon: -6.64 }

export const HOME_COLOR = '#fb923c'

/** Teinte des points de chaque continent, indexée par la valeur de la grille (globeData.ts) */
export const CONTINENT_COLORS = [
  '#000000',
  '#f0abfc', // Afrique
  '#a5b4fc', // Europe
  '#c4b5fd', // Asie
  '#93c5fd', // Amérique du Nord
  '#67e8f9', // Amérique du Sud
  '#6ee7b7', // Océanie
  '#64748b', // Antarctique
]

const AFRICA = 1, EUROPE = 2, ASIA = 3, NORTH_AMERICA = 4, SOUTH_AMERICA = 5, OCEANIA = 6

export interface Place {
  name: string
  lat: number
  lon: number
  continent: number
  /** Relié à la Côte d'Ivoire par un arc */
  arc?: boolean
  /** Repère conservé sur petit écran */
  major?: boolean
}

export const PLACES: Place[] = [
  { name: 'Maroc', lat: 32, lon: -6.5, continent: AFRICA },
  { name: 'Nigeria', lat: 9.5, lon: 8, continent: AFRICA },
  { name: 'Kenya', lat: 0.3, lon: 37.9, continent: AFRICA, arc: true },
  { name: 'Afrique du Sud', lat: -29, lon: 25, continent: AFRICA, arc: true, major: true },
  { name: 'France', lat: 46.6, lon: 2.4, continent: EUROPE, arc: true, major: true },
  { name: 'Allemagne', lat: 51.2, lon: 10.4, continent: EUROPE },
  { name: 'Émirats', lat: 24, lon: 54, continent: ASIA, arc: true },
  { name: 'Inde', lat: 22, lon: 79, continent: ASIA, arc: true, major: true },
  { name: 'Chine', lat: 35, lon: 104, continent: ASIA, arc: true, major: true },
  { name: 'Japon', lat: 36.5, lon: 138, continent: ASIA, arc: true },
  { name: 'États-Unis', lat: 38, lon: -97, continent: NORTH_AMERICA, arc: true, major: true },
  { name: 'Canada', lat: 57, lon: -105, continent: NORTH_AMERICA },
  { name: 'Mexique', lat: 23.5, lon: -102, continent: NORTH_AMERICA, arc: true },
  { name: 'Brésil', lat: -11, lon: -52, continent: SOUTH_AMERICA, arc: true, major: true },
  { name: 'Argentine', lat: -35, lon: -65, continent: SOUTH_AMERICA, arc: true },
  { name: 'Australie', lat: -25, lon: 134, continent: OCEANIA, arc: true, major: true },
  { name: 'Nouvelle-Zélande', lat: -39, lon: 175.8, continent: OCEANIA },
]

export const CONTINENT_LABELS = [
  { name: 'Afrique', lat: 19, lon: 20 },
  { name: 'Europe', lat: 58, lon: 22 },
  { name: 'Asie', lat: 50, lon: 88 },
  { name: 'Amérique du Nord', lat: 47, lon: -97 },
  { name: 'Amérique du Sud', lat: 2, lon: -65 },
  { name: 'Océanie', lat: -12, lon: 150 },
]

export interface GlobeLabel {
  name: string
  lat: number
  lon: number
  kind: 'home' | 'country' | 'continent'
  major: boolean
}

export const GLOBE_LABELS: GlobeLabel[] = [
  { ...HOME, kind: 'home', major: true },
  ...CONTINENT_LABELS.map(l => ({ ...l, kind: 'continent' as const, major: true })),
  ...PLACES.map(({ name, lat, lon, major }) => ({ name, lat, lon, kind: 'country' as const, major: !!major })),
]
