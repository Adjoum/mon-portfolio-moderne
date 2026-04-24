import React, { useState, useEffect, useRef, useCallback } from "react";

/*const TEMPLATES: Record<string, { name: string; emoji: string; code: string }> = {
  overleafClassic: {
    name: "Overleaf Classic",
    emoji: "📄",
    code: `\\documentclass[11pt,a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}
\\usepackage[a4paper,top=1.6cm,bottom=1.6cm,left=1.6cm,right=1.6cm]{geometry}
\\usepackage{parskip}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\usepackage{array}
\\usepackage{titlesec}
\\usepackage{lmodern}

\\definecolor{mainblue}{HTML}{0F4C81}

\\hypersetup{
  colorlinks=true,
  urlcolor=mainblue,
  linkcolor=mainblue
}

\\titleformat{\\section}
{\\large\\bfseries\\color{mainblue}}
{}{0em}{}
[\\titlerule]

\\titlespacing{\\section}{0pt}{10pt}{6pt}
\\setlist[itemize]{leftmargin=1.2em,itemsep=2pt,topsep=2pt}
\\pagestyle{empty}

\\begin{document}

\\begin{center}
  {\\LARGE \\textbf{KOFFI WILFRIED ADJOUMANI}}\\\\[6pt]
  {\\large Technicien Supérieur de Santé -- Imagerie Médicale \\;|\\; Data Analyst / Développeur}\\\\[8pt]
  San-Pedro, Côte d'Ivoire \\;|\\; +225 XX XX XX XX XX \\;|\\;
  \\href{mailto:votreemail@email.com}{votreemail@email.com}\\\\[4pt]
  \\href{https://www.linkedin.com/in/koffi-wilfried-adjoumani/}{LinkedIn}
  \\;|\\;
  \\href{https://github.com/Adjoum}{GitHub}
  \\;|\\;
  \\href{https://agjoumani-koffi.com}{Portfolio}
\\end{center}

\\vspace{0.2cm}

\\section{Profil}
Technicien supérieur de santé spécialisé en imagerie médicale, actuellement en formation en \\textbf{Data Analytics Industriel} et en \\textbf{Big Data Analytics}. Passionné par l'analyse de données, l'intelligence artificielle, le développement web et la création de solutions numériques à fort impact.

\\section{Compétences}
\\begin{tabular}{>{\\bfseries}p{4.2cm} p{11cm}}
Analyse de données & Excel, Power BI, SQL, Python, statistiques descriptives, tableaux de bord \\\\
Développement web & HTML, CSS, JavaScript, TypeScript, React, Next.js, Tailwind CSS \\\\
IA / Automatisation & Prompt engineering, outils IA, automatisation de tâches, chatbots, solutions SaaS \\\\
Base de données & MySQL, MongoDB, Prisma, Supabase \\\\
Outils & Git, GitHub, VS Code, Overleaf, Postman \\\\
Qualités & Rigueur, autonomie, adaptabilité, esprit analytique, apprentissage rapide \\\\
\\end{tabular}

\\section{Expérience professionnelle}
\\textbf{Technicien Supérieur de Santé -- Imagerie Médicale} \\hfill \\textit{Depuis 2024}\\\\
\\textit{EPHR / CHR San-Pedro, Côte d'Ivoire}
\\begin{itemize}
  \\item Réalisation et suivi des examens d'imagerie médicale, notamment en tomodensitométrie (TDM).
  \\item Accueil, préparation et prise en charge des patients dans le respect des protocoles.
  \\item Contribution à l'amélioration de l'organisation du service et du flux de travail.
\\end{itemize}

\\section{Formation}
\\textbf{Master 1 Big Data Analytics} \\hfill \\textit{En cours}\\\\
\\textit{Université Virtuelle de Côte d'Ivoire (UVCI)}

\\textbf{Licence 3 Data Analytics Industriel} \\hfill \\textit{En cours}\\\\
\\textit{Institut National Polytechnique Félix Houphouët-Boigny (INPHB)}

\\textbf{Diplôme d'État en Imagerie Médicale} \\hfill \\textit{Obtenu}\\\\
\\textit{INFAS}

\\section{Projets}
\\textbf{Portfolio professionnel personnel}
\\begin{itemize}
  \\item Conception et développement d'un portfolio moderne pour présenter mon parcours, mes compétences et mes réalisations.
\\end{itemize}

\\textbf{Applications web et SaaS}
\\begin{itemize}
  \\item Développement de solutions web intégrant IA, automatisation, gestion de données et interfaces modernes.
\\end{itemize}

\\section{Langues}
\\begin{itemize}
  \\item Français : courant
  \\item Anglais : intermédiaire
\\end{itemize}

\\section{Centres d'intérêt}
Intelligence artificielle, data science, santé numérique, développement web, innovation technologique, automatisation.

\\end{document}`,
  },

  minimal: {
    name: "Minimal",
    emoji: "✏️",
    code: `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[a4paper,margin=2cm]{geometry}
\\usepackage{hyperref}
\\pagestyle{empty}

\\begin{document}

{\\LARGE\\textbf{Votre Nom}} \\hfill \\href{mailto:email@example.com}{email@example.com}\\\\
Votre poste \\hfill +225 XX XX XX XX XX

\\bigskip\\hrule\\bigskip

\\section*{Expérience}
\\textbf{Poste} \\hfill 2022--présent\\\\
Entreprise, Ville\\\\
Description du rôle.

\\bigskip
\\section*{Formation}
\\textbf{Diplôme} \\hfill 2022\\\\
Institution

\\bigskip
\\section*{Compétences}
Compétence 1, Compétence 2, Compétence 3

\\end{document}`,
  },
};  */
const TEMPLATES: Record<string, { name: string; emoji: string; code: string }> = {
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
    % Décommentez la ligne suivante pour afficher une photo
    % \\includegraphics[width=3.0cm,height=3.8cm,keepaspectratio]{photo.jpg}
    \\colorbox{softblue}{\\parbox[c][3.8cm][c]{3.2cm}{\\centering\\textcolor{textmuted}{\\small Photo\\\\optionnelle}}}
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

/*async function aiGenerateLatex(info: string, template: string, existing: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: `Tu es expert LaTeX et rédacteur CV haut de gamme.
Retourne UNIQUEMENT le code LaTeX brut, sans explications ni balises markdown.
Contraintes:
- Compatible compilation LaTeX standard type Overleaf
- Classe article
- Packages autorisés: geometry, hyperref, array, xcolor, titlesec, enumitem, lmodern, babel, inputenc, fontenc, parskip
- Mise en page professionnelle, lisible, sobre
- Autorise accents UTF-8 normaux
- Produit un CV élégant et compilable`,
      messages: [
        {
          role: "user",
          content: `Infos candidat:\n${info}\n\nTemplate:\n${template}\n\nCode actuel:\n${existing || "(vide)"}`,
        },
      ],
    }),
  });

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}   */

async function aiGenerateLatex(info: string, template: string, existing: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(import.meta as any).env?.VITE_OPENAI_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 3000,
      messages: [
        {
          role: "system",
          content: `Tu es un expert en LaTeX et en rédaction de CV professionnels haut de gamme.
            Retourne UNIQUEMENT le code LaTeX final complet, sans aucune explication, sans commentaire, sans balises markdown et sans texte hors du code.

            Contraintes techniques :
            - Le document doit être entièrement compatible avec une compilation LaTeX standard sur Overleaf.
            - Le document doit utiliser la classe article.
            - Utilise uniquement des packages stables et compatibles avec pdflatex.
            - Packages autorisés : geometry, hyperref, array, xcolor, titlesec, enumitem, lmodern, babel, inputenc, fontenc, parskip, graphicx, tabularx, multicol.
            - Les accents UTF-8 normaux sont autorisés et doivent être correctement gérés.
            - Le code produit doit être directement compilable sans modification.

            Contraintes de contenu et de mise en page :
            - Le CV doit avoir une mise en page professionnelle, lisible, élégante et sobre.
            - Améliore la hiérarchie visuelle, l’alignement, l’espacement, la structure des sections et la présentation générale.
            - Optimise la densité du contenu pour éviter les espaces inutiles et limiter le nombre de pages si possible.
            - Corrige automatiquement les éventuelles erreurs de syntaxe LaTeX.
            - Corrige les maladresses évidentes de structure ou de formulation si elles apparaissent dans le contenu.
            - Préserve fidèlement le sens des informations fournies.
            - N’invente aucune information absente.
            - Si une photo est prévue dans le code ou demandée, intègre-la proprement avec graphicx.
            - Organise le CV de manière logique si nécessaire : en-tête, profil, compétences, expérience, formation, projets, certifications, langues, centres d’intérêt.

            Objectif final :
            produire un CV LaTeX propre, cohérent, moderne, élégant, professionnel et prêt à compiler immédiatement sur Overleaf.`,
        },
        {
          role: "user",
          content: `Infos candidat:\n${info}\n\nTemplate:\n${template}\n\nCode actuel:\n${existing || "(vide)"}`,
        },
      ],
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}


/*async function aiImproveSelection(selection: string, instruction: string, fullCode: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1800,
      system: `Expert LaTeX CV. Retourne UNIQUEMENT le LaTeX amélioré.
Compatible compilation LaTeX standard type Overleaf.
Tu peux utiliser des accents, titlesec, enumitem, xcolor, babel, inputenc, fontenc.`,
      messages: [
        {
          role: "user",
          content: `Texte sélectionné:\n\`\`\`latex\n${selection}\n\`\`\`\n\nInstruction: ${instruction}\n\nContexte:\n${fullCode.slice(0, 3000)}`,
        },
      ],
    }),
  });

  const data = await res.json();
  return data.content?.[0]?.text?.replace(/```latex\n?/g, "").replace(/```\n?/g, "").trim() ?? "";
}  */
async function aiImproveSelection(selection: string, instruction: string, fullCode: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(import.meta as any).env?.VITE_OPENAI_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 1800,
      messages: [
        {
          role: "system",
          content: `Tu es un expert en rédaction de CV professionnels et en LaTeX avancé.

            Ta mission :
            améliorer le code LaTeX d’un CV existant pour le rendre plus professionnel, plus lisible, plus élégant et mieux structuré, tout en conservant les informations importantes du candidat.

            Règles impératives :
            - Retourne UNIQUEMENT le code LaTeX final.
            - N’ajoute aucune explication, aucun commentaire, aucun texte avant ou après le code.
            - Le code doit être directement compilable avec une compilation LaTeX standard type Overleaf.
            - N’utilise que des packages largement compatibles avec Overleaf et pdflatex.
            - Tu peux utiliser si nécessaire : titlesec, enumitem, xcolor, babel, inputenc, fontenc, hyperref, geometry, array, tabularx, graphicx, multicol.
            - Conserve un style sobre, moderne, professionnel et adapté à un CV.
            - Améliore la hiérarchie visuelle, l’espacement, l’alignement, la clarté des sections et la présentation globale.
            - Optimise la mise en page pour limiter les débordements inutiles et réduire le nombre de pages si possible.
            - Corrige toute erreur de syntaxe LaTeX.
            - Corrige aussi les fautes évidentes de structure ou de formulation si elles apparaissent dans le contenu.
            - Préserve fidèlement le sens du contenu d’origine.
            - N’invente pas d’informations absentes.
            - Si une photo est déjà prévue dans le code, conserve-la et améliore son intégration proprement.
            - Si le code contient des sections mal organisées, réorganise-les de façon logique : en-tête, profil, compétences, expérience, formation, projets, certifications, langues, centres d’intérêt.
            - Assure-toi que les caractères accentués en français sont correctement gérés.

            Objectif final :
            produire un CV LaTeX propre, élégant, professionnel, bien structuré et prêt à être compilé sans modification.`,
        },
        {
          role: "user",
          content: `Texte sélectionné:\n\`\`\`latex\n${selection}\n\`\`\`\n\nInstruction: ${instruction}\n\nContexte:\n${fullCode.slice(0, 3000)}`,
        },
      ],
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.replace(/```latex\n?/g, "").replace(/```\n?/g, "").trim() ?? "";
}

async function compileLatex(code: string): Promise<string> {
  const API_BASE =
    import.meta.env.VITE_API_URL || "http://localhost:5000";

  const res = await fetch(`${API_BASE}/cv/compile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
    credentials: "include",
  });

  if (!res.ok) {
    let msg = "Échec de compilation";
    try {
      const data = await res.json();
      msg = data?.error || msg;
    } catch {
      // rien
    }
    throw new Error(msg);
  }

  const pdfBlob = await res.blob();
  return URL.createObjectURL(pdfBlob);
}

export default function LaTeXCVEditor() {
  const [code, setCode] = useState(TEMPLATES.overleafClassic.code);
  const [pdfUrl, setPdfUrl] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState("overleafClassic");
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiMode, setAIMode] = useState<"generate" | "improve">("generate");
  const [aiInfo, setAiInfo] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [monacoLoaded, setMonacoLoaded] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRangeRef = useRef<{ start: number; end: number } | null>(null);

  const doRender = useCallback(async () => {
    setRendering(true);
    setRenderError(null);

    try {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        const nextPdfUrl = await compileLatex(code);
        setPdfUrl(nextPdfUrl);
    } catch (e: any) {
        setRenderError(e.message || "Erreur de compilation");
        setPdfUrl("");
    } finally {
        setRendering(false);
    }
    }, [code, pdfUrl]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void doRender();
    }, 1000);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [code]);

  useEffect(() => {
    const w = window as any;

    if (w.__monacoEditor) {
      setMonacoLoaded(true);
      return;
    }

    if (w.__monacoLoading) {
      const check = setInterval(() => {
        if (w.__monacoEditor) {
          setMonacoLoaded(true);
          clearInterval(check);
        }
      }, 200);
      return () => clearInterval(check);
    }

    w.__monacoLoading = true;

    const loader = document.createElement("script");
    loader.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs/loader.min.js";
    loader.async = true;

    loader.onload = () => {
      w.require.config({
        paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs" },
      });

      w.require(["vs/editor/editor.main"], () => {
        if (!editorRef.current || w.__monacoEditor) {
          setMonacoLoaded(true);
          return;
        }

        if (!w.monaco.languages.getLanguages().find((l: any) => l.id === "latex")) {
          w.monaco.languages.register({ id: "latex" });
        }

        const editor = w.monaco.editor.create(editorRef.current, {
          value: code,
          language: "latex",
          theme: "vs-dark",
          fontSize: 13,
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          lineNumbers: "on",
          minimap: { enabled: false },
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
        });

        editor.onDidChangeModelContent(() => setCode(editor.getValue()));

        editor.onDidChangeCursorSelection(() => {
          const sel = editor.getSelection();
          if (sel && !sel.isEmpty()) {
            const model = editor.getModel();
            const text = model?.getValueInRange(sel) ?? "";
            setSelectedText(text);
            const start = model?.getOffsetAt(sel.getStartPosition()) ?? 0;
            selectionRangeRef.current = { start, end: start + text.length };
          } else {
            setSelectedText("");
            selectionRangeRef.current = null;
          }
        });

        w.__monacoEditor = editor;
        delete w.__monacoLoading;
        setMonacoLoaded(true);
      });
    };

    document.head.appendChild(loader);

    return () => {
      const ed = (window as any).__monacoEditor;
      if (ed?.dispose) {
        ed.dispose();
        delete (window as any).__monacoEditor;
      }
    };
  }, []);

  useEffect(() => {
    const ed = (window as any).__monacoEditor;
    if (ed && ed.getValue() !== code) {
      const pos = ed.getPosition();
      ed.setValue(code);
      if (pos) ed.setPosition(pos);
    }
  }, [code]);

  const handleTemplateChange = (id: string) => {
    setActiveTemplate(id);
    setCode(TEMPLATES[id].code);
  };

  const handleAIGenerate = async () => {
    if (!aiInfo.trim()) return;
    setAiLoading(true);
    setAiError("");

    try {
      const r = await aiGenerateLatex(aiInfo, TEMPLATES[activeTemplate].code, code);
      if (r.trim()) setCode(r.trim());
      else setAiError("Aucun code retourné.");
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIImprove = async () => {
    if (!selectedText.trim() || !aiInstruction.trim()) return;
    setAiLoading(true);
    setAiError("");

    try {
      const improved = await aiImproveSelection(selectedText, aiInstruction, code);
      if (improved) {
        const range = selectionRangeRef.current;
        if (range) {
          setCode((prev) => prev.slice(0, range.start) + improved + prev.slice(range.end));
        }
      } else {
        setAiError("Aucune amélioration retournée.");
      }
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownloadTex = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    a.download = "cv.tex";
    a.click();
  };

  const copyCode = () => navigator.clipboard.writeText(code);

  const statusColor = rendering ? "#f59e0b" : renderError ? "#ef4444" : pdfUrl ? "#22c55e" : "#6b7280";
  const statusText = rendering ? "Compilation..." : renderError ? "Erreur" : pdfUrl ? "PDF prêt" : "En attente";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0e1015",
        color: "#c9d1d9",
        fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
        fontSize: 13,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 18px",
          background: "#13161d",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#e6edf3" }}>📘 LaTeX CV Editor</span>
          <span style={{ fontSize: 10, color: "#8b949e" }}>mode Overleaf-compatible · PDF serveur</span>
          
        </div>
        <button
            onClick={() => window.location.href = '/cv-generator'}
            style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', border: '1px solid #21262d',
              background: '#21262d', color: '#8b949e',
              whiteSpace: 'nowrap',
            }}
          >
            ← CV Generator
          </button>

        <div style={{ display: "flex", gap: 5, marginLeft: 10, flexWrap: "wrap" }}>
          {Object.entries(TEMPLATES).map(([id, t]) => (
            <button
              key={id}
              onClick={() => handleTemplateChange(id)}
              style={{
                padding: "5px 11px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid",
                borderColor: activeTemplate === id ? "#6366f1" : "#21262d",
                background: activeTemplate === id ? "rgba(99,102,241,.15)" : "#21262d",
                color: activeTemplate === id ? "#a5b4fc" : "#8b949e",
              }}
            >
              {t.emoji} {t.name}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 7, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: statusColor }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: statusColor,
              }}
            />
            {statusText}
          </div>

          <button onClick={() => setShowAIPanel((s) => !s)} style={btnStyle}>
            🤖 IA
          </button>
          <button onClick={copyCode} style={btnStyle}>
            📋 Copier
          </button>
          <button onClick={handleDownloadTex} style={btnStyle}>
            ⬇ .tex
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {showAIPanel && (
          <div
            style={{
              width: 300,
              flexShrink: 0,
              background: "#13161d",
              borderRight: "1px solid #21262d",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #21262d" }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10, color: "#e6edf3" }}>🤖 Assistant IA</div>
              <div style={{ display: "flex", gap: 5 }}>
                {(["generate", "improve"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setAIMode(m)}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      border: "1px solid",
                      borderColor: aiMode === m ? "#6366f1" : "#21262d",
                      background: aiMode === m ? "rgba(99,102,241,.2)" : "transparent",
                      color: aiMode === m ? "#a5b4fc" : "#8b949e",
                    }}
                  >
                    {m === "generate" ? "⚡ Générer" : "✨ Améliorer"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              {aiMode === "generate" ? (
                <>
                  <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 8, lineHeight: 1.6 }}>
                    Décrivez votre profil, l'IA génère un LaTeX compatible Overleaf.
                  </div>

                  <textarea
                    value={aiInfo}
                    onChange={(e) => setAiInfo(e.target.value)}
                    placeholder={"Nom: Koffi Wilfried Adjoumani\nPoste: Data Analyst\nExpérience:\n- CHR San-Pedro\nFormation:\n- M1 Big Data Analytics\nCompétences:\n- Python, SQL, Power BI"}
                    style={textareaStyle}
                  />

                  <button
                    onClick={handleAIGenerate}
                    disabled={aiLoading || !aiInfo.trim()}
                    style={{
                      width: "100%",
                      padding: "10px 0",
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                      border: "none",
                      background: aiLoading ? "#21262d" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                      color: "#fff",
                      opacity: aiLoading || !aiInfo.trim() ? 0.6 : 1,
                    }}
                  >
                    {aiLoading ? "⏳ Génération..." : "⚡ Générer le code LaTeX"}
                  </button>
                </>
              ) : (
                <>
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 7,
                      marginBottom: 10,
                      background: selectedText ? "rgba(34,197,94,.08)" : "rgba(245,158,11,.08)",
                      border: `1px solid ${selectedText ? "rgba(34,197,94,.25)" : "rgba(245,158,11,.25)"}`,
                      fontSize: 11,
                      color: selectedText ? "#4ade80" : "#fbbf24",
                    }}
                  >
                    {selectedText ? `✅ ${selectedText.split("\n").length} ligne(s) sélectionnée(s)` : "⚠️ Sélectionnez du texte d'abord"}
                  </div>

                  <textarea
                    value={aiInstruction}
                    onChange={(e) => setAiInstruction(e.target.value)}
                    placeholder={"Ex:\n• rends cette section plus professionnelle\n• ajoute des métriques\n• corrige la syntaxe LaTeX"}
                    style={{ ...textareaStyle, minHeight: 120, marginBottom: 10 }}
                  />

                  <button
                    onClick={handleAIImprove}
                    disabled={aiLoading || !selectedText.trim() || !aiInstruction.trim()}
                    style={{
                      width: "100%",
                      padding: "10px 0",
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                      border: "none",
                      background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                      color: "#fff",
                      opacity: aiLoading || !selectedText || !aiInstruction ? 0.5 : 1,
                    }}
                  >
                    {aiLoading ? "⏳ Amélioration..." : "✨ Améliorer la sélection"}
                  </button>
                </>
              )}

              {aiError && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    borderRadius: 7,
                    background: "rgba(239,68,68,.1)",
                    border: "1px solid rgba(239,68,68,.3)",
                    fontSize: 11,
                    color: "#f87171",
                  }}
                >
                  ⚠️ {aiError}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderRight: "1px solid #21262d" }}>
          <div
            style={{
              padding: "6px 14px",
              background: "#13161d",
              borderBottom: "1px solid #21262d",
              fontSize: 11,
              color: "#8b949e",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>📝 Éditeur LaTeX</span>
            <span>{code.split("\n").length} lignes</span>
          </div>

          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div ref={editorRef} style={{ position: "absolute", inset: 0, visibility: monacoLoaded ? "visible" : "hidden" }} />

            {!monacoLoaded && (
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  background: "#0d1117",
                  color: "#c9d1d9",
                  fontFamily: "monospace",
                  fontSize: 13,
                  border: "none",
                  outline: "none",
                  padding: 16,
                  resize: "none",
                  lineHeight: 1.6,
                  boxSizing: "border-box",
                }}
                spellCheck={false}
                onSelect={(e) => {
                  const ta = e.target as HTMLTextAreaElement;
                  const text = ta.value.slice(ta.selectionStart, ta.selectionEnd);
                  setSelectedText(text);
                  selectionRangeRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
                }}
              />
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              padding: "6px 14px",
              background: "#13161d",
              borderBottom: "1px solid #21262d",
              fontSize: 11,
              color: "#8b949e",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>👁 Aperçu PDF</span>
            {rendering && <span style={{ color: "#f59e0b", fontSize: 10 }}>⏳ Compilation...</span>}
          </div>

          {renderError && (
            <div
              style={{
                margin: 12,
                padding: 14,
                borderRadius: 8,
                flexShrink: 0,
                background: "#1a0000",
                border: "1px solid #7f1d1d",
                fontFamily: "monospace",
                fontSize: 12,
                color: "#fca5a5",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, color: "#f87171" }}>⚠️ Erreur de compilation</div>
              {renderError}
            </div>
          )}

          {pdfUrl ? (
            <iframe
                key={pdfUrl}
                src={pdfUrl}
                style={{ flex: 1, border: "none", background: "#fff" }}
                title="PDF Preview"
            />
            ) : !renderError ? (
            <div
                style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#4b5563",
                fontSize: 13,
                flexDirection: "column",
                gap: 10,
                }}
            >
                <div style={{ fontSize: 32 }}>📄</div>
                <div>Le PDF compilé apparaîtra ici</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 11px",
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid #21262d",
  background: "#21262d",
  color: "#8b949e",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "#21262d",
  border: "1px solid #30363d",
  borderRadius: 7,
  color: "#e6edf3",
  fontSize: 11.5,
  padding: "10px",
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.6,
  minHeight: 160,
  outline: "none",
};