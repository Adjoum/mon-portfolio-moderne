// P3 : cadre de la photo (bornes, formes, par modèle), géométrie du cadrage (aucune zone vide),
// signatures de fichiers, rendu LaTeX (largeur, position, commentaire), aucune injection.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FRAME, IDENTITY, ZOOM_MAX, clampTransform, coverScale, covers, frameSummary, photoPixels, resolveFrame,
  sanitizeFrame, sniffImage,
} from './photo'
import { TEMPLATE_LIBRARY, photoSetup, renderCv } from '../templates/library'
import { sampleCv } from '../templates/sample'
import { choiceForTemplate } from './templateSwitch'
import { buildFinalLatex, photoPlaceholder } from '../../../pages/CVBuilder/latexTemplates'

describe('cadre relu et borné', () => {
  it('formes à proportions fixes : hauteur déduite de la largeur', () => {
    expect(sanitizeFrame({ shape: 'square', width: 3, height: 5.5 })).toMatchObject({ width: 3, height: 3 })
    expect(sanitizeFrame({ shape: 'circle', width: 2.8 })).toMatchObject({ width: 2.8, height: 2.8 })
    expect(sanitizeFrame({ shape: 'portrait', width: 3.5 }).height).toBeCloseTo(4.5, 1)
    expect(sanitizeFrame({ shape: 'landscape', width: 4 }).height).toBe(3)
    expect(sanitizeFrame({ shape: 'free', width: 3, height: 5.5 })).toMatchObject({ width: 3, height: 5.5 })
  })

  it('valeurs hors limites ou d’un autre type remplacées, couleurs validées', () => {
    const f = sanitizeFrame({ shape: 'hexagone', width: 99, height: -4, radius: 400, border: 'x', borderColor: 'red;}\\input', position: 'centre' })
    // Nombre hors limites ramené à la borne ; valeur d'un autre type remplacée par le défaut
    expect(f).toEqual({ ...DEFAULT_FRAME, width: 5, height: 6.4, radius: 50 })
    expect(sanitizeFrame({ borderColor: 'ff00aa' }).borderColor).toBe('FF00AA')
    expect(sanitizeFrame({ width: 3.33333333 }).width).toBe(3.3)
    expect(sanitizeFrame({ border: 1.1 }).border).toBe(1)
  })

  it('cadre effectif : réglage de l’utilisateur, puis style du modèle, puis défaut', () => {
    expect(resolveFrame({ shape: 'circle', width: 2.8 }, { width: 3.4 })).toMatchObject({ shape: 'circle', width: 3.4, height: 3.4 })
    expect(resolveFrame(undefined, undefined)).toEqual(DEFAULT_FRAME)
  })

  it('résumé lisible, sans retour à la ligne (commentaire LaTeX sur une ligne)', () => {
    const text = frameSummary(sanitizeFrame({ shape: 'square', width: 3, radius: 12, border: 1.5, borderColor: 'accent', position: 'left' }))
    expect(text).toBe('carré 3.0 × 3.0 cm, angles arrondis 12 %, bordure 1.5 pt couleur d’accent, à gauche')
    expect(text).not.toMatch(/\n/)
  })

  it('image produite : 300 dpi, côté le plus long ≤ 1200 px', () => {
    expect(photoPixels({ ...DEFAULT_FRAME, shape: 'square', width: 2.54, height: 2.54 })).toEqual({ width: 300, height: 300 })
    const big = photoPixels(sanitizeFrame({ shape: 'free', width: 5, height: 6 }))
    expect(Math.max(big.width, big.height)).toBe(709)
  })
})

describe('cadrage : l’image couvre toujours tout le cadre', () => {
  const [iw, ih, fw, fh] = [2000, 1500, 350, 450]

  it('échelle de couverture, avec et sans rotation', () => {
    expect(coverScale(iw, ih, fw, fh, 0)).toBeCloseTo(Math.max(fw / iw, fh / ih))
    // Tournée de 90° : largeur et hauteur de l'image échangées
    expect(coverScale(iw, ih, fw, fh, 90)).toBeCloseTo(Math.max(fw / ih, fh / iw))
    expect(coverScale(iw, ih, fw, fh, 30)).toBeGreaterThan(coverScale(iw, ih, fw, fh, 0))
  })

  it('cadrage d’origine valide ; déplacement excessif ramené à la limite, jamais au-delà', () => {
    expect(covers(IDENTITY, iw, ih, fw, fh)).toBe(true)
    const t = clampTransform({ zoom: 1, rotation: 0, x: 3, y: 0 }, iw, ih, fw, fh)
    expect(covers(t, iw, ih, fw, fh)).toBe(true)
    expect(t.x).toBeGreaterThan(0)
    expect(covers({ ...t, x: t.x + 0.01 }, iw, ih, fw, fh)).toBe(false)
  })

  it('zoom borné, angle ramené entre −180 et 180, valeurs non numériques neutralisées', () => {
    expect(clampTransform({ zoom: 0.2, rotation: 0, x: 0, y: 0 }, iw, ih, fw, fh).zoom).toBe(1)
    expect(clampTransform({ zoom: 99, rotation: 0, x: 0, y: 0 }, iw, ih, fw, fh).zoom).toBe(ZOOM_MAX)
    expect(clampTransform({ zoom: 1, rotation: 270, x: 0, y: 0 }, iw, ih, fw, fh).rotation).toBe(-90)
    expect(clampTransform({ zoom: NaN, rotation: Infinity, x: NaN, y: 0 }, iw, ih, fw, fh)).toEqual(IDENTITY)
  })

  it('avec rotation et zoom, tout déplacement borné reste valide', () => {
    for (const rotation of [-170, -45, 15, 90, 133]) {
      for (const zoom of [1, 1.7, 4]) {
        for (const [x, y] of [[2, 2], [-3, 0.4], [0.1, -5]]) {
          const t = clampTransform({ zoom, rotation, x, y }, iw, ih, fw, fh)
          expect(covers(t, iw, ih, fw, fh)).toBe(true)
        }
      }
    }
  })
})

describe('fichier choisi : format reconnu par sa signature', () => {
  const bytes = (...b: number[]) => new Uint8Array(b)
  it('JPEG, PNG et WebP acceptés ; SVG, GIF, HTML et fichiers renommés refusés', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg')
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png')
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp')
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('GIF89a'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('<html><script>'))).toBeNull()
    expect(sniffImage(bytes())).toBeNull()
  })
})

describe('cadre dans le code LaTeX des modèles', () => {
  const cv = sampleCv('long')
  const withPhoto = TEMPLATE_LIBRARY.filter(t => t.supports.photo)

  it.each(withPhoto.map(t => [t.name, t.id]))('%s : colonne de la photo à la largeur du cadre, à droite ou à gauche', (_n, id) => {
    const right = renderCv(id, cv, { photo: true, photoFrames: { [id]: { shape: 'square', width: 2.6 } } })
    expect(right).toContain('\\begin{minipage}[t]{2.6cm}\\vspace{0pt}\\raggedleft\n% Photo : carré 2.6 × 2.6 cm')
    expect(right).toContain('\\linewidth-2.6cm-0.4cm')
    expect(right.indexOf('%%PHOTO%%')).toBeGreaterThan(right.indexOf('\\cvname') > 0 ? right.indexOf('\\cvname') : 0)
    const left = renderCv(id, cv, { photo: true, photoFrames: { [id]: { position: 'left' } } })
    expect(left).toMatch(/\\raggedright\n% Photo : [^\n]*à gauche\n%%PHOTO%%\n\\end\{minipage\}\\hfill\n\\begin\{minipage\}\[t\]\{\\dimexpr\\linewidth-[\d.]+cm-0\.4cm\\relax\}/)
  })

  it('sans réglage : cadre du modèle (Modern Creative rond et cerclé de blanc sur le bandeau)', () => {
    const creative = photoSetup('modern-creative', { ...TEMPLATE_LIBRARY.find(t => t.id === 'modern-creative')!.defaults, accent: '7c3aed' })
    expect(creative.frame).toMatchObject({ shape: 'circle', width: 2.8, border: 1.5, borderColor: 'FFFFFF' })
    expect(creative.colors).toEqual({ matte: '7C3AED', border: 'FFFFFF' })
    const sv = photoSetup('silicon-valley', { ...TEMPLATE_LIBRARY[0].defaults, accent: '0B57D0', photoFrames: { 'silicon-valley': { border: 1 } } })
    expect(sv.colors).toEqual({ matte: 'FFFFFF', border: '0B57D0' })
  })

  it('chaque modèle garde son cadre : il est retrouvé au retour sur le modèle', () => {
    const frames = { 'silicon-valley': { shape: 'circle' as const }, 'executive-prestige': { width: 4 } }
    const next = choiceForTemplate('executive-prestige', { ...TEMPLATE_LIBRARY[0].defaults, photo: true, photoFrames: frames })!
    expect(next.options.photoFrames).toEqual(frames)
    expect(photoSetup(next.id, next.options).frame.width).toBe(4)
    expect(photoSetup('silicon-valley', next.options).frame.shape).toBe('circle')
  })

  it('Minimal ATS : aucune photo, quel que soit le réglage', () => {
    expect(renderCv('minimal-ats', cv, { photo: true })).not.toContain('%%PHOTO%%')
  })

  it('photo absente : cadre vide à la taille exacte du cadre', () => {
    const code = renderCv('silicon-valley', cv, { photo: true, photoFrames: { 'silicon-valley': { shape: 'landscape', width: 4 } } })
    const out = buildFinalLatex(code, false, 4, 3)
    expect(out).toContain('\\parbox[c][\\dimexpr3.0cm-2\\fboxsep\\relax][c]{\\dimexpr4.0cm-2\\fboxsep\\relax}')
    // Ancien générateur de CV : cadre d'origine inchangé
    expect(photoPlaceholder('\\usepackage{graphicx}')).toContain('\\parbox[c][3.8cm][c]{3.2cm}')
  })

  it('photo présente : largeur du cadre ; numéros de ligne inchangés', () => {
    const code = renderCv('silicon-valley', cv, { photo: true, photoFrames: { 'silicon-valley': { width: 3.7 } } })
    const out = buildFinalLatex(code, true, 3.7, 4.8)
    expect(out).toContain('\\includegraphics[width=3.7cm,keepaspectratio]{photo.jpg}')
    expect(out.split('\n')).toHaveLength(code.split('\n').length)
  })

  it('réglage hostile : rien d’injecté dans le code', () => {
    const code = renderCv('silicon-valley', cv, { photo: true, photoFrames: { 'silicon-valley': { borderColor: '}\\input{x}', border: 2, width: '3cm}\\write18{x}' as unknown as number } } })
    expect(code).not.toMatch(/\\input\{|\\write18/)
  })
})
