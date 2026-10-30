// P0.A3 — S4 : aucune valeur d'un CV (saisie, importée ou issue du LLM) ne peut sortir
// de son contexte HTML dans l'un des 8 templates, ni produire un lien exécutable.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderTemplate, esc, safeUrl, safeImageSrc, safeColor } from '../../src/pages/CVBuilder/CVGeneratorPro_part2'
import type { DesignConfig, GeneratedCV, TemplateId } from '../../src/pages/CVBuilder/CVGeneratorPro_part1'

const ROOT = path.resolve(__dirname, '..', '..')
const TEMPLATES: TemplateId[] = ['cascade', 'moderne', 'classique', 'stanford', 'openai-dark', 'amazon-bold', 'google-chip', 'faang-minimal']

const BREAKOUT = `x" onmouseover="alert(1)" '><img src=x onerror=alert(2)><script>alert(3)</script></style>`
const JS_URL = 'javascript:alert(document.domain)'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({
  primaryColor: '#123456', accentColor: '#654321', fontFamily: 'Calibri', spacing: 'normal',
  headerStyle: 'gradient', showPhoto: true, showBars: true, photoShape: 'circle', photoX: 50, photoY: 50, ...over,
})

/** CV dont chaque champ contient la même charge */
function poisonedCv(value: string, photo = value): GeneratedCV {
  const entry = {
    role: value, company: value, location: value, start: value, end: value, bullets: [value, value], techs: [value],
    degree: value, field: value, school: value, city: value, year: value, mention: value, thesis: value,
    name: value, level: value, cat: value, items: [value], desc: value, impact: value, link: value, github: value,
    title: value, venue: value, org: value, issuer: value, url: value, authors: value,
  }
  return {
    personal: {
      name: value, title: value, email: value, phone: value, city: value, linkedin: value,
      github: value, website: value, summary: value, photo,
    },
    experience: [entry], education: [entry], skills: [entry], languages: [entry], projects: [entry],
    publications: [entry], interests: [value], targetRole: value, certifications: [entry], awards: [entry],
  } as unknown as GeneratedCV
}

describe.each(TEMPLATES)('template %s', (id) => {
  it('aucune charge ne sort de son contexte HTML', () => {
    const html = renderTemplate(poisonedCv(BREAKOUT), id, design(), 'fr')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script')
    // Balises réellement émises : un attribut on… n'y figure jamais (le texte échappé reste inerte)
    const tags = html.match(/<[a-z][^<>]*>/gi) ?? []
    expect(tags.length).toBeGreaterThan(5)
    for (const tag of tags) expect(tag.replace(/"[^"]*"/g, '""')).not.toMatch(/\son[a-z]+\s*=/i)
    expect(html).not.toContain('</style><')
  })

  it('aucun lien javascript:', () => {
    const html = renderTemplate(poisonedCv(JS_URL), id, design(), 'fr')
    expect(html).not.toMatch(/(?:href|src)="\s*javascript:/i)
  })

  it('un design corrompu ne peut pas injecter de CSS ni de HTML', () => {
    const html = renderTemplate(poisonedCv('Awa'), id, design({
      primaryColor: `red;}</style><script>alert(1)</script>`,
      accentColor: `"><img src=x onerror=alert(2)>`,
      fontFamily: `x}</style><script>alert(3)</script>`,
      photoX: `1%"><img src=x onerror=alert(4)>` as unknown as number,
    }), 'fr')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img src=x')
  })

  it('les données légitimes restent affichées', () => {
    const cv = poisonedCv('Awa Koné', 'data:image/png;base64,iVBORw0KGgo=')
    cv.personal.linkedin = 'https://linkedin.com/in/awa'
    const html = renderTemplate(cv, id, design(), 'fr')
    expect(html).toContain('Awa Koné')
    expect(html).toContain('data:image/png;base64,iVBORw0KGgo=')
  })

  it('le document interdit tout script (fichier téléchargé compris)', () => {
    const html = renderTemplate(poisonedCv('Awa'), id, design(), 'fr')
    expect(html).toContain(`http-equiv="Content-Security-Policy" content="default-src 'none'`)
  })
})

describe('fonctions de filtrage', () => {
  it('esc couvre les cinq caractères sensibles', () => {
    expect(esc(`<a href="x" title='y'>&`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;')
    expect(esc(undefined)).toBe('')
    expect(esc(12)).toBe('12')
  })

  it.each([
    ['javascript:alert(1)'], ['JaVaScRiPt:alert(1)'], [' javascript:alert(1)'], ['java\nscript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'], ['vbscript:x'], ['file:///etc/passwd'], ['https://ok.dev" onmouseover="x'],
  ])('safeUrl refuse %j', (url) => {
    expect(safeUrl(url)).toBe('')
  })

  it('safeUrl accepte http, https, mailto et complète un site sans schéma', () => {
    expect(safeUrl('https://ok.dev/a?b=1')).toBe('https://ok.dev/a?b=1')
    expect(safeUrl('mailto:a@b.co')).toBe('mailto:a@b.co')
    expect(safeUrl('linkedin.com/in/awa')).toBe('https://linkedin.com/in/awa')
    expect(safeUrl('')).toBe('')
  })

  it('safeImageSrc n’accepte que le base64 d’image et https', () => {
    expect(safeImageSrc('data:image/jpeg;base64,/9j/4AAQ')).toBe('data:image/jpeg;base64,/9j/4AAQ')
    expect(safeImageSrc('https://ok.dev/a.png')).toBe('https://ok.dev/a.png')
    expect(safeImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBe('')
    expect(safeImageSrc('javascript:alert(1)')).toBe('')
    expect(safeImageSrc('" onerror="alert(1)')).toBe('')
  })

  it('safeColor n’accepte que l’hexadécimal', () => {
    expect(safeColor('#abc', '#000')).toBe('#abc')
    expect(safeColor('#AABBCC', '#000')).toBe('#AABBCC')
    expect(safeColor('red;}', '#000')).toBe('#000')
  })
})

describe('export et autres points d’injection', () => {
  const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

  it('le CV n’est plus écrit dans une fenêtre de même origine', () => {
    const code = read('src/pages/CVBuilder/CVGenerator.tsx')
    expect(code).not.toContain('document.write')
    expect(code).not.toContain("window.open('', '_blank')")
    expect(read('src/pages/CVBuilder/cvPrint.ts')).toMatch(/'sandbox', 'allow-same-origin allow-modals'/)
  })

  it('InkSpace n’interprète ni la sortie du LLM ni les messages comme du HTML', () => {
    const app = read('public/inkspace/js/app.js')
    expect(app).not.toMatch(/out\.innerHTML/)
    expect(app).not.toMatch(/innerHTML\s*=\s*`[^`]*\$\{ws\./)
    expect(read('public/inkspace/js/ui.js')).not.toMatch(/innerHTML\s*=\s*`[^`]*\$\{msg\}/)
  })

  it('l’erreur LaTeX n’est pas interprétée comme du HTML', () => {
    expect(read('src/pages/CVBuilder/LaTeXViewer.tsx')).not.toContain('${err.message}')
  })

  it('pdf.js est en version corrigée (GHSA-hq66-cqwq-w95j), sans évaluation dynamique', () => {
    const { version } = JSON.parse(read('node_modules/pdfjs-dist/package.json'))
    const [major, minor] = version.split('.').map(Number)
    expect(major > 6 || (major === 6 && minor >= 2)).toBe(true)
    expect(read('node_modules/pdfjs-dist/build/pdf.worker.mjs')).not.toContain('new Function(')
  })

  it('le HTML d’un fichier converti est assaini avant insertion dans la page', () => {
    expect(read('src/types/fileConverters.ts')).toContain('DOMPurify.sanitize(innerHtml)')
  })
})
