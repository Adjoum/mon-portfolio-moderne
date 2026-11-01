// CV fictif pour la recette du CV Generator (aucune donnée réelle) : injecté comme état enregistré,
// l'aperçu s'ouvre donc sans génération par l'IA (aucun appel, aucun coût).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

const photo = `data:image/webp;base64,${fs.readFileSync(path.join(ROOT, 'src/assets/portrait/adjoumani-portrait-400.webp')).toString('base64')}`;

export const FIXTURE_CV = {
  personal: {
    name: 'Awa Konan', title: 'Data Analyst', email: 'awa.konan@example.test', phone: '+225 00 00 00 00', city: 'Abidjan',
    linkedin: 'linkedin.com/in/exemple', github: 'github.com/exemple', website: '',
    summary: 'Analyste de données orientée impact : tableaux de bord, automatisation des rapports et accompagnement des équipes métier.',
    photo,
  },
  experience: [
    { role: 'Data Analyst', company: 'Entreprise A', location: 'Abidjan', start: '01/2023', end: 'présent', current: true, bullets: ['Tableaux de bord suivis chaque semaine par la direction', 'Automatisation de 12 rapports mensuels', 'Formation de 20 utilisateurs'], techs: ['Python', 'SQL', 'Power BI'] },
    { role: 'Analyste junior', company: 'Entreprise B', location: 'Yamoussoukro', start: '06/2021', end: '12/2022', current: false, bullets: ['Nettoyage et fiabilisation des données de ventes', 'Analyses ad hoc pour le marketing'], techs: ['Excel', 'R'] },
    { role: 'Stagiaire', company: 'Entreprise C', location: 'San-Pedro', start: '01/2021', end: '05/2021', current: false, bullets: ['Collecte et saisie des données terrain'], techs: ['Excel'] },
  ],
  education: [
    { degree: 'Licence', field: 'Statistique', school: 'Université X', city: 'Abidjan', year: '2018–2021', mention: 'Bien' },
  ],
  skills: [{ cat: 'Data', items: ['Python', 'SQL', 'Power BI'] }, { cat: 'Outils', items: ['Excel', 'Git'] }],
  languages: [{ lang: 'Français', level: 'Natif' }, { lang: 'Anglais', level: 'B2' }],
  projects: [{ name: 'Tableau de bord RH', desc: 'Suivi des effectifs et des absences', impact: 'Décisions mensuelles plus rapides', techs: ['Power BI'], link: '', github: '' }],
  interests: ['Lecture', 'Football'],
};

export const FIXTURE_INTAKE = {
  name: 'Awa Konan', title: 'Data Analyst', email: '', phone: '', city: '', linkedin: '', github: '', targetRole: '', yearsExp: '2-3',
  sector: 'tech', style: 'french', lang: 'fr', rawExps: 'x', rawEdu: '', rawSkills: '', keyAchievement: '', rawProjects: '',
};

/** État enregistré du générateur (clé cvgenpro:state:v1), injecté avant le chargement de la page */
export function seedGenerator(context, { template = 'cascade', design } = {}) {
  return context.addInitScript(([cv, intake, tpl, d]) => {
    if (sessionStorage.getItem('cv-e2e-seeded')) return;
    sessionStorage.setItem('cv-e2e-seeded', '1');
    localStorage.removeItem('cvgenpro:design-presets:v1');
    localStorage.setItem('cvgenpro:state:v1', JSON.stringify({ step: 'preview', intake, cv, template: tpl, ...(d ? { design: d } : {}) }));
  }, [FIXTURE_CV, FIXTURE_INTAKE, template, design ?? null]);
}
