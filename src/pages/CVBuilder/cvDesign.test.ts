import { describe, it, expect } from 'vitest'
import { renderTemplate, TEMPLATE_META } from './CVGeneratorPro_part2'
import type { DesignConfig, GeneratedCV, TemplateId } from './CVGeneratorPro_part1'
import {
  DESIGN_DEFAULTS, DESIGN_PALETTES, TEMPLATE_CAPS, contrastRatio, designCss, loadPresets, normalizeDesign, parseHex, savePresets,
} from './cvDesign'

// CV fictif (aucune donnée réelle)
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
export const SAMPLE_CV: GeneratedCV = {
  personal: {
    name: 'Awa Konan', title: 'Data Analyst', email: 'awa.konan@example.test', phone: '+225 00 00 00 00', city: 'Abidjan',
    linkedin: 'linkedin.com/in/exemple', github: 'github.com/exemple', website: '', summary: 'Analyste de données orientée impact.', photo: PHOTO,
  },
  experience: [
    { role: 'Data Analyst', company: 'Entreprise A', location: 'Abidjan', start: '2023', end: 'présent', current: true, bullets: ['Tableaux de bord', 'Automatisation'], techs: ['Python', 'SQL'] },
    { role: 'Stagiaire', company: 'Entreprise B', location: 'Yamoussoukro', start: '2022', end: '2023', current: false, bullets: ['Collecte'], techs: ['Excel'] },
  ],
  education: [{ degree: 'Licence', field: 'Statistique', school: 'Université X', city: 'Abidjan', year: '2022', mention: '' }],
  skills: [{ cat: 'Data', items: ['Python', 'SQL'] }, { cat: 'Outils', items: ['Excel'] }],
  languages: [{ lang: 'Français', level: 'Natif' }],
  projects: [{ name: 'Projet A', desc: 'Description', impact: '', techs: ['React'], link: '', github: '' }],
  interests: ['Lecture'],
} as unknown as GeneratedCV

const IDS = TEMPLATE_META.map(t => t.id)
const render = (id: TemplateId, patch: Partial<DesignConfig> = {}) => renderTemplate(SAMPLE_CV, id, { ...DESIGN_DEFAULTS, ...patch } as DesignConfig, 'fr')
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length

describe('repères posés dans les 8 modèles', () => {
  it.each(IDS)('%s : nom, intitulé, sections, entrées, photo encadrée', id => {
    const html = render(id)
    expect(count(html, /class="cv-name"/g)).toBe(1)
    expect(count(html, /class="cv-role"/g)).toBe(1)
    expect(count(html, /cv-section-title/g)).toBeGreaterThanOrEqual(3)
    expect(count(html, /class="[^"]*\bcv-section\b/g)).toBeGreaterThanOrEqual(3)
    expect(count(html, /class="cv-entry"/g)).toBeGreaterThanOrEqual(3)          // 2 expériences + formation ou projet
    expect(count(html, /class="cv-photo-frame"/g)).toBe(1)
    expect(html.includes('class="cv-header"')).toBe(TEMPLATE_CAPS[id].header)
    expect(html.includes('var(--cv-side,')).toBe(TEMPLATE_CAPS[id].sidebar !== null)
    expect(html).toContain('<style id="cv-design">')
  })

  it.each(IDS)('%s : toutes les tailles en pt deviennent réglables, le texte du CV reste intact', id => {
    const html = render(id)
    expect(html).not.toMatch(/style="[^"]*font-size:\s*[\d.]+pt(?!\s*\*)/)
    expect(html).toContain('Analyste de données orientée impact.')
  })
})

describe('chaque réglage modifie réellement le rendu de chaque modèle', () => {
  const cases: [string, Partial<DesignConfig>, (html: string, id: TemplateId) => boolean][] = [
    ['taille du nom', { nameScale: 1.3 }, h => h.includes('.cv-name{--cv-fs:1.3}')],
    ['taille des titres', { titleScale: 1.2 }, h => h.includes('.cv-section-title{--cv-fs:1.2}')],
    ['taille du texte', { textScale: 1.1 }, h => h.includes('--cv-fs:1.1;')],
    ['hauteur de ligne', { lineHeight: 1.2 }, h => h.includes('--cv-lh:1.2;')],
    ['épaisseur des titres', { headingWeight: 900 }, h => h.includes('font-weight:900 !important')],
    ['espacement des lettres', { letterSpacing: 0.1 }, h => h.includes('letter-spacing:0.1em !important')],
    ['alignement des titres', { titleAlign: 'center' }, h => h.includes('text-align:center !important')],
    ['police', { fontFamily: "Georgia,'Times New Roman',serif" }, h => h.includes("body{font-family:Georgia,'Times New Roman',serif !important}")],
    ['marges du document', { marginMm: 12 }, h => h.includes('@page{margin:12mm}') && h.includes('html{padding:12mm')],
    ['espacement entre sections', { sectionGap: 1.6 }, h => h.includes('--cv-sec:1.6;') && /class="[^"]*cv-section[^"]*"[^>]*style="[^"]*margin[^"]*var\(--cv-sec/.test(h)],
    ['espacement entre expériences', { entryGap: 0.5 }, h => h.includes('--cv-entry:0.5;') && /class="cv-entry"[^>]*style="[^"]*var\(--cv-entry/.test(h)],
    ['densité', { spacing: 'compact' }, h => h.includes('--cv-sec:0.8;')],
    ['couleur des titres', { titleColor: '#aa0000' }, h => h.includes('.cv-section-title{color:#aa0000 !important}')],
    ['couleur secondaire', { secondaryColor: '#00aa00' }, h => h.includes('.cv-role{color:#00aa00 !important')],
    ['couleur du texte', { textColor: '#123456' }, h => h.includes('color:#123456')],
    ['couleur principale', { primaryColor: '#0b57d0' }, h => h.toLowerCase().includes('#0b57d0')],
    ['séparateurs', { separatorStyle: 'dashed', separatorWidth: 2, separatorColor: '#999999' }, h => /dashed/.test(h.split('<style id="cv-design">')[1])],
    ['photo : forme portrait', { photoShape: 'portrait', photoSize: 90 }, h => /cv-photo-frame" style="[^"]*width:90px;height:120px/.test(h)],
    ['photo : bordure', { photoBorder: 4, photoBorderColor: '#ff0000' }, h => /cv-photo-frame" style="[^"]*border:4px solid #ff0000/.test(h)],
    ['photo : arrondi', { photoShape: 'square', photoRadius: 12 }, h => /cv-photo-frame" style="[^"]*border-radius:12px/.test(h)],
    ['photo : zoom et cadrage', { photoZoom: 1.8, photoX: 30, photoY: 10 }, h => /class="cv-photo"[^>]*transform:scale\(1\.8\);transform-origin:30% 10%/.test(h)],
    ['sauts de page', { avoidBreaks: true }, h => h.includes('.cv-entry{break-inside:avoid')],
  ]
  for (const id of IDS) {
    it.each(cases)(`${id} : %s`, (_label, patch, ok) => {
      const before = render(id)
      const after = render(id, patch)
      expect(ok(after, id)).toBe(true)
      if (!('avoidBreaks' in patch)) expect(after).not.toBe(before)
    })
  }

  it('en-tête dégradé ou minimal : modèles à bandeau seulement', () => {
    for (const id of IDS) {
      const css = designCss(normalizeDesign({ ...DESIGN_DEFAULTS, headerStyle: 'gradient' }), id)
      expect(css.includes('.cv-header{background:linear-gradient')).toBe(TEMPLATE_CAPS[id].header)
    }
  })

  it('largeur de colonne : modèles à colonne latérale seulement', () => {
    for (const id of IDS) {
      const html = render(id, { sidebarWidth: 260 })
      expect(html.includes('--cv-side:260px')).toBe(true)
      expect(html.includes('var(--cv-side,')).toBe(TEMPLATE_CAPS[id].sidebar !== null)
    }
  })

  it('OpenAI Dark et Amazon Bold : palette d’origine par défaut, couleurs choisies sinon', () => {
    expect(render('openai-dark')).toContain('#6366f1')
    expect(render('amazon-bold')).toContain('#ff9900')
    expect(render('openai-dark', { primaryColor: '#0b57d0', accentColor: '#0e7490' })).not.toContain('#6366f1')
    expect(render('amazon-bold', { primaryColor: '#0b57d0', accentColor: '#0e7490' })).not.toContain('#ff9900')
  })

  it('couleur du texte : jamais appliquée aux fonds (background-color)', () => {
    const html = render('cascade', { textColor: '#123456' })
    expect(html).not.toMatch(/background-color:#123456/)
  })
})

describe('validation et compatibilité', () => {
  it('saisie hexadécimale sécurisée', () => {
    expect(parseHex('#ABC')).toBe('#abc')
    expect(parseHex('0b57d0')).toBe('#0b57d0')
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('red;background:url(x)')).toBeNull()
    expect(parseHex('#zzzzzz')).toBeNull()
  })

  it('valeurs hors bornes ramenées, injections refusées', () => {
    const d = normalizeDesign({ designVersion: 2, nameScale: 99, marginMm: -5, primaryColor: '</style><script>', fontFamily: 'x;}body{display:none', headingWeight: 123 })
    expect(d.nameScale).toBe(1.6)
    expect(d.marginMm).toBe(0)
    expect(d.primaryColor).toBe(DESIGN_DEFAULTS.primaryColor)
    expect(d.fontFamily).toBe(DESIGN_DEFAULTS.fontFamily)
    expect(d.headingWeight).toBeNull()
  })

  it('design enregistré avant la version 2 : la forme de la photo reprend celle du modèle', () => {
    const legacy = { primaryColor: '#7f1d1d', accentColor: '#f87171', fontFamily: "'Georgia','Times New Roman',serif", spacing: 'compact', headerStyle: 'gradient', showPhoto: true, showBars: false, photoShape: 'circle', photoX: 40, photoY: 20 }
    const d = normalizeDesign(legacy)
    expect(d.photoShape).toBe('template')
    expect([d.primaryColor, d.spacing, d.headerStyle, d.showBars, d.photoX]).toEqual(['#7f1d1d', 'compact', 'gradient', false, 40])
    expect(d.fontFamily).toContain('Georgia')
    expect(d.nameScale).toBe(1)
  })

  it('palettes complètes du studio LaTeX', () => {
    expect(DESIGN_PALETTES.length).toBe(8)
    for (const p of DESIGN_PALETTES.slice(1)) expect(Object.values(p.colors).every(c => parseHex(c) !== null)).toBe(true)
  })

  it('contraste calculé (avertissement d’accessibilité)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#1f2937', '#0d1117')).toBeLessThan(2)
  })

  it('presets : enregistrés, relus et normalisés', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } }
    savePresets([{ id: 'p1', name: 'Mon style', savedAt: 1, design: normalizeDesign({ designVersion: 2, nameScale: 1.2, photoShape: 'portrait' }) }], storage)
    const [p] = loadPresets(storage)
    expect(p.name).toBe('Mon style')
    expect(p.design.nameScale).toBe(1.2)
    expect(p.design.photoShape).toBe('portrait')
    store.set('cvgenpro:design-presets:v1', '{pas du json')
    expect(loadPresets(storage)).toEqual([])
  })
})
