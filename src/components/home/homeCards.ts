// Accès directs de l'accueil : mêmes données pour les liens (HomeNavCards) et le cylindre 3D (cardTexture)

export interface HomeCard {
  to: string
  title: string
  description: string
  colors: [string, string]
  /** Tracés Lucide de l'icône (viewBox 24), dessinés sur la texture du cylindre */
  iconPaths: string[]
}

export const HOME_CARDS: HomeCard[] = [
  {
    to: '/cv-generator',
    title: 'CV Generator Pro',
    description: 'Créez un CV professionnel : 8 modèles, design personnalisable, export PDF.',
    colors: ['#6366f1', '#8b5cf6'],
    iconPaths: [
      'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
      'M14 2v5a1 1 0 0 0 1 1h5', 'M10 9H8', 'M16 13H8', 'M16 17H8',
    ],
  },
  {
    to: '/projects',
    title: 'Mes projets',
    description: 'Applications web, mobiles, data et IA que j’ai conçues et livrées.',
    colors: ['#0ea5e9', '#6366f1'],
    iconPaths: [
      'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z',
      'M8 10v4', 'M12 10v2', 'M16 10v6',
    ],
  },
  {
    to: '/ai-lab',
    title: 'IA Lab',
    description: 'Expérimentations et démonstrations en intelligence artificielle.',
    colors: ['#8b5cf6', '#ec4899'],
    iconPaths: [
      'M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2',
      'M6.453 15h11.094', 'M8.5 2h7',
    ],
  },
  {
    to: '/skills',
    title: 'Mes compétences',
    description: 'Technologies, outils et domaines que je maîtrise au quotidien.',
    colors: ['#10b981', '#0ea5e9'],
    iconPaths: ['m18 16 4-4-4-4', 'm6 8-4 4 4 4', 'm14.5 4-5 16'],
  },
]
