// P4 : synchronisation PDF ↔ code. Texte visible d'une ligne de LaTeX, découpage des lignes du PDF,
// rattachement (textes répétés, colonnes, zones partagées), clic → ligne, ligne → zones, plan.
// La vérification sur les PDF réels des huit modèles est faite par npm run recette:modeles.
import { describe, it, expect } from 'vitest'
import { buildSync, codeTexts, latexToText, lineAt, norm, outline, pdfSegments, rectsForLine, syncedLines } from './sync'
import type { PageText } from './quality'

/** Page fictive : éléments de texte (x, y depuis le bas, hauteur 10) */
const page = (items: [string, number, number, number?][]): PageText => ({
  width: 595, height: 842,
  items: items.map(([str, x, y, width]) => ({ str, x, y, width: width ?? str.length * 5, height: 10 })),
})

describe('texte visible d’une ligne de LaTeX', () => {
  it('commandes de mise en forme retirées, texte des arguments conservé', () => {
    expect(latexToText('\\vspace{3pt}{\\cvheadline Intitulé du poste visé}\\par')).toBe('Intitulé du poste visé')
    expect(latexToText('\\begin{tabularx}{\\linewidth}{@{}X@{\\hspace{1em}}r@{}}\\textbf{Data Analyst} & \\textcolor{muted}{2023 -- 2024}\\end{tabularx}'))
      .toBe('Data Analyst 2023 -- 2024')
    expect(latexToText('\\\\[-1pt]{\\color{muted}Institut fictif, Abidjan}')).toBe('Institut fictif, Abidjan')
    expect(latexToText('\\href{mailto:a@b.ci}{a@b.ci} \\quad\\textbullet\\quad')).toBe('a@b.ci')
    expect(latexToText('\\cvsection{R\\&D \\% 100}')).toBe('R&D % 100')
    expect(latexToText('  \\item Tableaux de bord % commentaire')).toBe('Tableaux de bord')
    expect(latexToText('\\definecolor{accent}{HTML}{0B57D0}')).toBe('')
    expect(latexToText('{\\textls[60]{\\MakeUppercase{Formation}}}')).toBe('Formation')
  })

  it('forme comparable : sans accents, ligatures, casse ni ponctuation', () => {
    expect(norm('Expérience  PROFESSIONNELLE')).toBe('experienceprofessionnelle')
    expect(norm('ﬁnance – œuvre')).toBe('financeuvre')
  })

  it('lignes du corps seulement ; plan des sections', () => {
    const code = '\\documentclass{article}\n\\newcommand{\\cvsection}[1]{#1}\n\\begin{document}\n\\cvsection{Profil}\nTexte libre\n% commentaire\n\\section*{Langues}\n\\end{document}'
    expect(codeTexts(code).map(c => c.line)).toEqual([4, 5, 7])
    expect(outline(code)).toEqual([{ line: 4, title: 'Profil' }, { line: 7, title: 'Langues' }])
  })
})

describe('lignes du PDF', () => {
  it('éléments d’une même ligne réunis ; grands blancs (date à droite, autre colonne) séparés', () => {
    const segs = pdfSegments([page([['Data', 50, 700, 22], ['Analyst', 75, 700, 35], ['2023 – 2024', 480, 700], ['Python', 50, 680]])])
    expect(segs.map(s => s.text)).toEqual(['Data Analyst', '2023 – 2024', 'Python'])
    expect(segs[0].top).toBeCloseTo(842 - 710)
  })
})

describe('rattachement des zones du PDF au code', () => {
  const code = [
    '\\begin{document}',                                                           // 1
    '\\cvname{Awa Konan}',                                                         // 2
    '{\\cvheadline Data Analyst}',                                                 // 3
    '\\cvsection{Expérience}',                                                     // 4
    '\\begin{tabularx}{\\linewidth}{Xr}\\textbf{Data Analyst} & 2023 -- 2024\\end{tabularx}', // 5
    '  \\item Tableaux de bord pour la santé publique',                           // 6
    '\\cvsection{Formation}',                                                      // 7
    'Master en informations et données',                                           // 8
    '\\href{https://github.com/x}{GitHub} \\quad',                                 // 9
    '\\href{https://x.dev}{Portfolio}',                                            // 10
    '\\end{document}',
  ].join('\n')
  const pdf = [page([
    ['Awa Konan', 50, 780], ['Data Analyst', 50, 765],
    ['EXPÉRIENCE', 50, 740],
    ['Data Analyst', 50, 725], ['2023 – 2024', 480, 725],
    ['• Tableaux de bord pour la santé publique', 60, 712],
    ['FORMATION', 50, 690],
    ['Master en informations et données', 50, 675],
    ['GitHub • Portfolio', 50, 660, 90],
  ])]
  const map = buildSync(code, pdf)
  const lineOfText = (t: string, nth = 0) => map.lineOf[map.segments.map((s, k) => [s, k] as const).filter(([s]) => s.text === t)[nth][1]]

  it('texte répété : le titre sous le nom va au titre, le poste à côté de ses dates va à l’expérience', () => {
    expect(lineOfText('Data Analyst', 0)).toBe(3)
    expect(lineOfText('Data Analyst', 1)).toBe(5)
    expect(lineOfText('2023 – 2024')).toBe(5)
  })

  it('mot entier préféré à un fragment (« formation » dans « informations »)', () => {
    expect(lineOfText('FORMATION')).toBe(7)
  })

  it('zone partagée par deux lignes du code : chaque portion renvoie à sa ligne', () => {
    const seg = map.segments.find(s => s.text.startsWith('GitHub'))!
    expect(lineAt(map, 1, seg.x0 + 5, seg.top + 3)).toBe(9)
    expect(lineAt(map, 1, seg.x1 - 5, seg.top + 3)).toBe(10)
    const [portfolio] = rectsForLine(map, 10)
    expect(portfolio.x0).toBeGreaterThan(seg.x0 + 20)
  })

  it('clic : ligne du code sous le point ; ligne sans texte : zone de la ligne suivante', () => {
    const bullet = map.segments.find(s => s.text.includes('Tableaux'))!
    expect(lineAt(map, 1, bullet.x0 + 30, bullet.top + 2)).toBe(6)
    expect(lineAt(map, 2, 100, 100)).toBeNull()
    expect(rectsForLine(map, 1)[0].top).toBe(map.segments[0].top)
    expect([...syncedLines(map)].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})
