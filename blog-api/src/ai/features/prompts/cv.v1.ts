// blog-api/src/ai/features/prompts/cv.v1.ts
// Prompts du générateur de CV, version 1 : repris à l'identique du frontend
// (src/pages/CVBuilder/CVGeneratorPro_part1.tsx avant P0.A2). Ils sont désormais
// définis exclusivement côté serveur ; le navigateur n'envoie que des données.
// ⚠️ La règle « inventer de façon cohérente » est conservée en attente de la décision D9.

export interface CvIntake {
  name: string; title: string; email: string; phone: string;
  city: string; linkedin: string; github: string;
  targetRole: string; yearsExp: string; sector: string;
  style: 'french' | 'american'; lang: 'fr' | 'en';
  rawExps: string; rawEdu: string; rawSkills: string;
  keyAchievement: string; rawProjects: string;
  importedContent: string; updateInstructions: string;
}

export const CV_PROMPT_VERSION = 'cv.v1';

export function cvGenerateSystem(intake: CvIntake): string {
  const lang = intake.lang === 'fr';
  return `Expert rédacteur CV haut de gamme — FAANG, académique, recherche.
Style: ${intake.style === 'french' ? 'CV français complet, détaillé' : 'American résumé, impact-first, 1-2 pages'}.
Langue: ${lang ? 'FRANÇAIS exclusivement' : 'ENGLISH only'}.
RETOURNE UNIQUEMENT DU JSON VALIDE, SANS MARKDOWN.`;
}

export function cvGenerateUser(intake: CvIntake): string {
  const lang = intake.lang === 'fr';
  const hasImport = !!intake.importedContent;

  const importCtx = hasImport
    ? `\n\nCONTENU CV IMPORTÉ:\n${intake.importedContent}\n\nMISES À JOUR DEMANDÉES: ${intake.updateInstructions || 'Améliorer et moderniser le contenu'}` : '';

  const projectsCtx = intake.rawProjects
    ? `\n\nPROJETS (format: Nom | Description | Lien | GitHub | Technologies):\n${intake.rawProjects}` : '';

  return `
Candidat:
- Nom: ${intake.name} | Titre: ${intake.title}
- Poste visé: ${intake.targetRole} | Expérience: ${intake.yearsExp} ans
- Ville: ${intake.city} | Email: ${intake.email} | Phone: ${intake.phone}
- LinkedIn: ${intake.linkedin} | GitHub: ${intake.github}
- Expériences: ${intake.rawExps}
- Formation: ${intake.rawEdu}
- Compétences: ${intake.rawSkills}
- Réalisation clé: ${intake.keyAchievement}${importCtx}${projectsCtx}

JSON EXACT requis:
{
  "personal": {
    "name": "${intake.name || 'Prénom Nom'}",
    "title": "${intake.title || intake.targetRole}",
    "email": "${intake.email}",
    "phone": "${intake.phone}",
    "city": "${intake.city}",
    "linkedin": "${intake.linkedin}",
    "github": "${intake.github}",
    "website": "",
    "summary": "<accroche 3-4 lignes percutantes, 1ère personne, mentionne poste visé + réalisation clé>"
  },
  "experience": [{
    "role": "<titre exact>",
    "company": "<entreprise>",
    "location": "<ville>",
    "start": "<mois/année>",
    "end": "<mois/année ou présent>",
    "current": true,
    "bullets": [
      "<verb d'action fort + résultat chiffré>",
      "<impact business ou technique>",
      "<leadership/collaboration ou méthode>",
      "<réalisation notable>"
    ],
    "techs": ["<tech1>","<tech2>"]
  }],
  "education": [{
    "degree": "<diplôme>", "field": "<spécialité>",
    "school": "<école>", "city": "<ville>", "year": "<année>", "mention": "<mention>"
  }],
  "skills": [
    {"cat": "<Langages>", "items": ["Python","Java","Go","TypeScript"]},
    {"cat": "<Frameworks>", "items": ["React","FastAPI","Spring"]},
    {"cat": "<Cloud & DevOps>", "items": ["AWS","Docker","Kubernetes","Terraform"]},
    {"cat": "<Outils>", "items": ["Git","Jira","Figma","LaTeX"]}
  ],
  "languages": [
    {"lang": "${lang?'Français':'French'}", "level": "${lang?'Langue maternelle':'Native'}"},
    {"lang": "${lang?'Anglais':'English'}", "level": "${lang?'Courant (B2+)':'Fluent (B2+)'}"}
  ],
  "projects": [{
    "name": "<nom projet>",
    "desc": "<description 1-2 lignes impactante>",
    "impact": "<métriques ou résultats>",
    "techs": ["<tech1>"],
    "link": "<url ou vide>",
    "github": "<github url ou vide>"
  }],
  "certifications": [{"name": "<cert>", "issuer": "<issuer>", "year": "<year>", "url": ""}],
  "awards": [{"name": "<award>", "org": "<org>", "year": "<year>"}],
  "interests": ["<intérêt 1>", "<intérêt 2>", "<intérêt 3>"]
}

RÈGLES:
- 3-4 bullets RÉELS par expérience, verbe d'action fort, impact chiffré
- Si données manquantes: inventer de façon cohérente avec le secteur ${intake.sector}
- ${hasImport ? 'Intégrer TOUTES les infos du CV importé + les mises à jour demandées' : 'Enrichir les données fournies'}
- JSON pur SANS commentaires ni markdown`;
}

export const CV_REVIEW_SYSTEM = `Tu es un expert recruteur FAANG/académique et coach CV. Analyse ce CV et retourne UNIQUEMENT ce JSON:
{
  "score": <0-100>,
  "grade": "<Excellent|Très Bon|Bon|Passable|À retravailler>",
  "approved": <score >= 75>,
  "categories": [
    {"name":"Impact & Métriques","score":<0-100>,"comment":"<max 80 chars>","icon":"📊"},
    {"name":"Clarté & Lisibilité","score":<0-100>,"comment":"<max 80 chars>","icon":"✍️"},
    {"name":"ATS & Mots-clés","score":<0-100>,"comment":"<max 80 chars>","icon":"🤖"},
    {"name":"Expérience & Formation","score":<0-100>,"comment":"<max 80 chars>","icon":"🎓"},
    {"name":"Accroche & Positionnement","score":<0-100>,"comment":"<max 80 chars>","icon":"🎯"}
  ],
  "globalTip": "<conseil global max 150 chars>",
  "suggestions": ["<suggestion 1>","<suggestion 2>","<suggestion 3>"]
}`;

export const CV_OCR_SYSTEM = `Tu es expert en lecture de CV. Extrais TOUT le contenu de ce CV image.
Retourne le texte structuré: NOM, TITRE, CONTACT, RÉSUMÉ, EXPÉRIENCES (dates+entreprises), FORMATION, COMPÉTENCES.`;
export const CV_OCR_USER = 'Extrais intégralement le contenu de ce CV.';

export const CV_STRUCTURE_SYSTEM = `Tu es expert CV. Ce texte a été extrait automatiquement d'un PDF ou Word.
Réorganise-le en sections claires: NOM · TITRE · CONTACT · RÉSUMÉ · EXPÉRIENCES (dates+entreprises) · FORMATION · COMPÉTENCES · LANGUES.
Corrige les artéfacts (espaces parasites, retours mal placés). Retourne le texte propre et structuré.`;
