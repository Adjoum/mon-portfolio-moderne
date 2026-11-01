// src/pages/CVBuilder/latexTemplates.ts
// Templates de l'éditeur LaTeX : partagés par l'éditeur et par les tests de compilation
// (tests/latex, scripts/latex-recette.mjs), qui vérifient qu'ils restent conformes à la
// politique du service latex-runner et produisent un PDF.

export interface LatexTemplate { name: string; emoji: string; code: string }

export const TEMPLATES: Record<string, LatexTemplate> = {
  overleafClassic: {
    name: "Premium Hero",
    emoji: "✨",
    code: `\\documentclass[11pt,a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}
\\usepackage[a4paper,top=1.25cm,bottom=1.35cm,left=1.35cm,right=1.35cm]{geometry}
\\usepackage{parskip}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\usepackage{array}
\\usepackage{titlesec}
\\usepackage{lmodern}
\\usepackage{tabularx}
\\usepackage{graphicx}
\\usepackage{multicol}

\\definecolor{mainblue}{HTML}{0F4C81}
\\definecolor{softblue}{HTML}{EDF4FB}
\\definecolor{accent}{HTML}{1D9BF0}
\\definecolor{textdark}{HTML}{1F2937}
\\definecolor{textmuted}{HTML}{6B7280}

\\hypersetup{
  colorlinks=true,
  urlcolor=mainblue,
  linkcolor=mainblue
}

\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\columnsep}{0.6cm}
\\setlist[itemize]{leftmargin=1.1em,itemsep=2pt,topsep=2pt}
\\titleformat{\\section}{\\large\\bfseries\\color{mainblue}}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{10pt}{6pt}

\\newcommand{\\cvtag}[1]{%
  \\fcolorbox{mainblue!20}{softblue}{\\footnotesize\\textcolor{mainblue}{\\strut #1}}\\hspace{4pt}
}

\\begin{document}

\\begin{minipage}[t]{0.72\\textwidth}
    {\\Huge\\bfseries\\textcolor{textdark}{KOFFI WILFRIED ADJOUMANI}}\\\\[4pt]
    {\\large\\textcolor{mainblue}{Technicien Supérieur de Santé \\;|\\; Data Analyst \\;|\\; Développeur IA}}\\\\[10pt]
    \\small
    San-Pedro, Côte d'Ivoire \\quad\\textbullet\\quad +225 XX XX XX XX XX \\\\
    \\href{mailto:votreemail@email.com}{votreemail@email.com} \\quad\\textbullet\\quad
    \\href{https://www.linkedin.com/in/koffi-wilfried-adjoumani/}{LinkedIn} \\quad\\textbullet\\quad
    \\href{https://github.com/Adjoum}{GitHub} \\quad\\textbullet\\quad
    \\href{https://agjoumani-koffi.com}{Portfolio}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.23\\textwidth}
   \\raggedleft
    %%PHOTO%%
\\end{minipage}

\\vspace{0.35cm}

\\colorbox{softblue}{%
\\parbox{\\dimexpr\\textwidth-2\\fboxsep\\relax}{%
\\textbf{Profil}\\\\[3pt]
Technicien supérieur de santé spécialisé en imagerie médicale, en parallèle d'une formation en \\textbf{Data Analytics Industriel} et en \\textbf{Big Data Analytics}. Je conçois des solutions mêlant santé, data, intelligence artificielle et développement web, avec une forte orientation impact, modernité et performance.
}}
\\vspace{0.35cm}

\\section{Compétences clés}
\\cvtag{Python}
\\cvtag{SQL}
\\cvtag{Power BI}
\\cvtag{Excel}
\\cvtag{JavaScript}
\\cvtag{TypeScript}
\\cvtag{React}
\\cvtag{Next.js}
\\cvtag{Tailwind CSS}
\\cvtag{MongoDB}
\\cvtag{Supabase}
\\cvtag{IA \\/ Automatisation}

\\section{Expérience professionnelle}
\\textbf{Technicien Supérieur de Santé -- Imagerie Médicale} \\hfill \\textit{Depuis 2024}\\\\
\\textcolor{textmuted}{EPHR / CHR San-Pedro, Côte d'Ivoire}
\\begin{itemize}
  \\item Réalisation et suivi des examens d'imagerie médicale, notamment en tomodensitométrie.
  \\item Préparation, accompagnement et prise en charge des patients dans le respect des protocoles.
  \\item Contribution à l'amélioration de l'organisation du service et de la fluidité opérationnelle.
\\end{itemize}

\\section{Formation}
\\begin{tabularx}{\\textwidth}{>{\\bfseries}p{0.67\\textwidth} >{\\raggedleft\\arraybackslash}X}
Master 1 Big Data Analytics -- Université Virtuelle de Côte d'Ivoire (UVCI) & En cours \\\\
Licence 3 Data Analytics Industriel -- INPHB & En cours \\\\
Diplôme d'État en Imagerie Médicale -- INFAS & Obtenu \\\\
Licence en Physique -- Université & Obtenue \\\\
\\end{tabularx}

\\section{Projets phares}
\\textbf{Portfolio professionnel personnel}\\\\
Conception d'un portfolio moderne pour présenter mes compétences, mes projets et mon positionnement professionnel.

\\vspace{0.15cm}
\\textbf{Applications web et SaaS}\\\\
Développement de solutions intégrant IA, automatisation, gestion de données et interfaces modernes.

\\vspace{0.15cm}
\\textbf{Projets Data / IA}\\\\
Création d'outils d'analyse, de tableaux de bord et de solutions intelligentes orientées santé et performance.

\\section{Langues et centres d'intérêt}
\\begin{multicols}{2}
\\textbf{Langues}
\\begin{itemize}
  \\item Français : courant
  \\item Anglais : intermédiaire
\\end{itemize}

\\columnbreak

\\textbf{Centres d'intérêt}
\\begin{itemize}
  \\item Intelligence artificielle
  \\item Data science
  \\item Santé numérique
  \\item Innovation technologique
\\end{itemize}
\\end{multicols}

\\end{document}`,
  },

  executiveClean: {
    name: "Executive Clean",
    emoji: "💼",
    code: `\\documentclass[11pt,a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}
\\usepackage[a4paper,top=1.4cm,bottom=1.4cm,left=1.5cm,right=1.5cm]{geometry}
\\usepackage{parskip}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\usepackage{array}
\\usepackage{titlesec}
\\usepackage{lmodern}
\\usepackage{tabularx}
\\usepackage{graphicx}

\\definecolor{mainblue}{HTML}{123B66}
\\definecolor{softgray}{HTML}{F6F8FA}
\\definecolor{textmuted}{HTML}{6B7280}

\\hypersetup{
  colorlinks=true,
  urlcolor=mainblue,
  linkcolor=mainblue
}

\\pagestyle{empty}
\\setlist[itemize]{leftmargin=1.2em,itemsep=2pt,topsep=2pt}
\\titleformat{\\section}{\\large\\bfseries\\color{mainblue}}{}{0em}{}
\\titlespacing{\\section}{0pt}{10pt}{4pt}

\\begin{document}

\\begin{center}
  {\\Huge \\textbf{KOFFI WILFRIED ADJOUMANI}}\\\\[4pt]
  {\\large \\textcolor{mainblue}{Technicien Supérieur de Santé -- Imagerie Médicale \\;|\\; Data Analyst}}\\\\[8pt]
  San-Pedro, Côte d'Ivoire \\quad\\textbullet\\quad +225 XX XX XX XX XX \\quad\\textbullet\\quad
  \\href{mailto:votreemail@email.com}{votreemail@email.com}\\\\[4pt]
  \\href{https://www.linkedin.com/in/koffi-wilfried-adjoumani/}{LinkedIn}
  \\quad\\textbullet\\quad
  \\href{https://github.com/Adjoum}{GitHub}
  \\quad\\textbullet\\quad
  \\href{https://agjoumani-koffi.com}{Portfolio}
\\end{center}

\\vspace{0.2cm}
\\hrule
\\vspace{0.35cm}

\\section{Profil}
Professionnel de santé spécialisé en imagerie médicale, avec un parcours complémentaire en data analytics, big data et développement de solutions numériques. Profil hybride alliant expertise terrain, culture data et vision technologique.

\\section{Compétences}
\\begin{tabularx}{\\textwidth}{>{\\bfseries}p{4.2cm} X}
Analyse de données & Excel, Power BI, SQL, Python, visualisation, tableaux de bord \\\\
Développement web & HTML, CSS, JavaScript, TypeScript, React, Next.js, Tailwind CSS \\\\
IA / Automatisation & Prompt engineering, assistants IA, automatisation, outils métier intelligents \\\\
Base de données & MongoDB, MySQL, Prisma, Supabase \\\\
\\end{tabularx}

\\section{Expérience professionnelle}
\\textbf{Technicien Supérieur de Santé -- Imagerie Médicale} \\hfill \\textit{Depuis 2024}\\\\
\\textcolor{textmuted}{EPHR / CHR San-Pedro, Côte d'Ivoire}
\\begin{itemize}
  \\item Réalisation des examens et suivi des activités en imagerie médicale.
  \\item Participation à l'amélioration de l'efficacité opérationnelle du service.
  \\item Prise en charge des patients en scanner dans le respect des standards de qualité.
\\end{itemize}

\\section{Formation}
\\textbf{Master 1 Big Data Analytics} \\hfill \\textit{En cours}\\\\
Université Virtuelle de Côte d'Ivoire (UVCI)

\\textbf{Licence 3 Data Analytics Industriel} \\hfill \\textit{En cours}\\\\
Institut National Polytechnique Félix Houphouët-Boigny (INPHB)

\\textbf{Diplôme d'État en Imagerie Médicale} \\hfill \\textit{Obtenu}\\\\
INFAS

\\section{Projets}
\\textbf{Portfolio professionnel personnel}\\\\
Site de présentation de mon parcours, de mes réalisations et de mes projets tech.

\\vspace{0.15cm}
\\textbf{Applications web et SaaS}\\\\
Conception de solutions numériques modernes intégrant data, IA et automatisation.

\\section{Langues}
Français : courant \\quad\\textbullet\\quad Anglais : intermédiaire

\\section{Centres d'intérêt}
Intelligence artificielle, santé numérique, data science, innovation, développement web.

\\end{document}`,
  },

  minimal: {
    name: "Minimal",
    emoji: "✏️",
    code: `\\documentclass[11pt,a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}
\\usepackage[a4paper,margin=2cm]{geometry}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\usepackage{lmodern}

\\definecolor{mainblue}{HTML}{0F4C81}

\\hypersetup{
  colorlinks=true,
  urlcolor=mainblue,
  linkcolor=mainblue
}

\\pagestyle{empty}

\\begin{document}

{\\LARGE\\textbf{Votre Nom}} \\hfill \\href{mailto:email@example.com}{email@example.com}\\\\
\\textcolor{mainblue}{Votre poste} \\hfill +225 XX XX XX XX XX\\\\
Ville, Pays \\hfill \\href{https://linkedin.com/in/votreprofil}{LinkedIn}

\\bigskip
\\hrule
\\bigskip

\\section*{Profil}
Présentez ici votre profil en 3 à 4 lignes avec une proposition de valeur claire.

\\section*{Expérience}
\\textbf{Poste} \\hfill 2022--présent\\\\
Entreprise, Ville\\\\
Description du rôle, des missions et de l'impact.

\\bigskip
\\textbf{Poste précédent} \\hfill 2020--2022\\\\
Entreprise, Ville\\\\
Description synthétique.

\\section*{Formation}
\\textbf{Diplôme} \\hfill 2022\\\\
Institution

\\bigskip
\\textbf{Diplôme} \\hfill 2020\\\\
Institution

\\section*{Compétences}
Compétence 1, Compétence 2, Compétence 3, Compétence 4

\\section*{Liens}
\\href{https://github.com/votreprofil}{GitHub} \\quad\\textbullet\\quad
\\href{https://votresite.com}{Portfolio}

\\end{document}`,
  },
};

/** Marqueur de la photo, remplacé avant compilation et avant le téléchargement du .tex */
export const PHOTO_MARKER = /%%PHOTO%%/g

const LOADS_XCOLOR = /\\usepackage\s*(?:\[[^\]]*\]\s*)?\{[^}]*\bxcolor\b[^}]*\}/

/**
 * Cadre « Photo optionnelle » affiché sans photo. Ses couleurs (celles du template Premium Hero)
 * sont définies dans un groupe, sans effet sur le reste du document ; un document généré sans
 * xcolor reçoit un simple cadre. Le marqueur ne provoque ainsi jamais d'erreur de compilation.
 */
export function photoPlaceholder(source: string, size?: { width: number; height: number }): string {
  // Taille du cadre photo du document (studio) : le cadre vide occupe exactement la place de la photo
  const dims = size
    ? `[\\dimexpr${size.height.toFixed(1)}cm-2\\fboxsep\\relax][c]{\\dimexpr${size.width.toFixed(1)}cm-2\\fboxsep\\relax}`
    : '[3.8cm][c]{3.2cm}'
  const box = (inner: string) => `\\parbox[c]${dims}{\\centering${inner}}`
  if (!LOADS_XCOLOR.test(source)) return `\\fbox{${box('\\small Photo\\\\optionnelle')}}`
  return '{\\definecolor{softblue}{HTML}{EDF4FB}\\definecolor{textmuted}{HTML}{6B7280}'
    + `\\colorbox{softblue}{${box('\\textcolor{textmuted}{\\small Photo\\\\optionnelle}')}}}`
}

/** Code compilé et téléchargé : le marqueur devient la photo (photo.jpg) ou le cadre vide */
export function buildFinalLatex(source: string, hasPhoto: boolean, photoWidthCm: number, photoHeightCm?: number): string {
  const width = Math.min(6, Math.max(1, Number.isFinite(photoWidthCm) ? photoWidthCm : 3.2)).toFixed(1)
  const height = photoHeightCm !== undefined && Number.isFinite(photoHeightCm) ? Math.min(7, Math.max(1, photoHeightCm)) : undefined
  const replacement = hasPhoto
    ? `\\includegraphics[width=${width}cm,keepaspectratio]{photo.jpg}`
    : photoPlaceholder(source, height === undefined ? undefined : { width: Number(width), height })
  return source.replace(PHOTO_MARKER, () => replacement)
}
