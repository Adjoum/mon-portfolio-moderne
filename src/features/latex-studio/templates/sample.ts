// src/features/latex-studio/templates/sample.ts
// Données d'exemple des modèles : de simples gabarits à remplacer, jamais présentés comme une
// personne ou des coordonnées réelles. Le contrôle qualité les signale tant qu'ils restent.
import type { CvData } from '../lib/cvData'

export function sampleCv(size: 'short' | 'long' = 'short'): CvData {
  const exp = (n: number) => ({
    id: `e${n}`,
    role: 'Intitulé du poste',
    organization: 'Nom de l’organisation',
    location: 'Ville, Pays',
    start: String(2024 - 2 * n),
    end: n === 1 ? 'aujourd’hui' : String(2026 - 2 * n),
    bullets: [
      'Réalisation clé : action menée, méthode employée et résultat obtenu.',
      'Responsabilité principale décrite en une phrase concise et concrète.',
      'Projet ou initiative portée, avec son impact pour l’équipe ou les usagers.',
    ],
  })
  const count = size === 'long' ? 7 : 3
  return {
    identity: {
      fullName: 'Prénom NOM',
      headline: 'Intitulé du poste visé',
      email: 'prenom.nom@exemple.com',
      phone: '+00 0 00 00 00 00',
      location: 'Ville, Pays',
      links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/exemple' }, { label: 'Portfolio', url: 'https://exemple.com' }],
    },
    summary: 'Deux à trois phrases qui présentent votre expertise, votre secteur et ce que vous apportez au poste visé. Texte d’exemple à remplacer par vos propres informations.',
    experiences: Array.from({ length: count }, (_, i) => exp(i + 1)),
    education: [
      { id: 'd1', degree: 'Diplôme et spécialité', institution: 'Établissement', location: 'Ville', start: '2018', end: '2020', details: 'Mention, mémoire ou option à préciser.' },
      { id: 'd2', degree: 'Diplôme précédent', institution: 'Établissement', location: 'Ville', start: '2015', end: '2018', details: '' },
    ],
    skills: [
      { id: 's1', category: 'Domaine principal', items: ['Compétence clé', 'Méthode', 'Outil de référence'] },
      { id: 's2', category: 'Outils', items: ['Outil A', 'Outil B', 'Outil C', 'Outil D'] },
      { id: 's3', category: 'Savoir-être', items: ['Communication', 'Organisation', 'Travail en équipe'] },
    ],
    projects: [
      { id: 'p1', name: 'Nom du projet', description: 'Objectif, rôle tenu et résultat du projet, en une ou deux phrases.', link: '', technologies: ['Outil A', 'Outil B'] },
    ],
    languages: [{ name: 'Français', level: 'langue maternelle' }, { name: 'Anglais', level: 'C1' }],
    certifications: [{ id: 'c1', name: 'Certification professionnelle', issuer: 'Organisme', date: '2023' }],
    publications: Array.from({ length: size === 'long' ? 12 : 2 }, (_, i) => ({
      id: `u${i + 1}`, authors: 'NOM P., Coauteur A.', title: `Titre de la publication ${i + 1}`, venue: 'Revue ou conférence', year: String(2024 - i),
    })),
    interests: ['Centre d’intérêt', 'Engagement associatif', 'Sport'],
  }
}

/** Indices de données d'exemple ou de coordonnées fictives restées dans un document */
export const PLACEHOLDER_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /Prénom NOM|Votre Nom|Your Name/i, label: 'nom d’exemple' },
  { re: /XX XX|00 00 00|\+00 0 00/, label: 'téléphone fictif' },
  { re: /@exemple\.|votreemail|email@example|@email\.com/i, label: 'adresse e-mail fictive' },
  { re: /exemple\.com|votresite|votreprofil|linkedin\.com\/in\/exemple/i, label: 'lien fictif' },
  { re: /Intitulé du poste|Nom de l’organisation|Texte d’exemple|à remplacer/i, label: 'texte d’exemple' },
]
