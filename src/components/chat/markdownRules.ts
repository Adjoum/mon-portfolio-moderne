// Règles de rendu des réponses du Clone IA (données non fiables du fournisseur IA).
// Séparées du composant pour être testées sans navigateur.
import { defaultSchema } from 'rehype-sanitize'
import type { Options as SanitizeSchema } from 'rehype-sanitize'

/** Au-delà, la réponse est tronquée à l'affichage (protection contre un texte démesuré) */
export const MAX_RENDERED_CHARS = 24_000

/**
 * Adresse d'un lien ou d'une image : http(s), mailto et chemins internes (« /projects ») seulement.
 * Tout le reste (javascript:, data:, vbscript:, file:, adresses relatives ambiguës) est retiré.
 */
export function safeChatUrl(url: string): string | null {
  const value = url.trim()
  if (!value) return null
  // Chemin interne au site ; « // » et « /\ » désigneraient un autre hôte
  if (/^\/(?![/\\])/.test(value)) return /[\s<>"]/.test(value) ? null : value
  try {
    const parsed = new URL(value)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}

export const isInternalPath = (href: string) => /^\/(?![/\\])/.test(href)

/**
 * Liste blanche des éléments et attributs, appliquée après la conversion du HTML brut en texte :
 * seuls les éléments produits par la syntaxe Markdown (GFM) passent, sans style, identifiant ni
 * gestionnaire d'événement.
 */
export const CHAT_SANITIZE_SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    'p', 'br', 'strong', 'em', 'del', 'a', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input', 'img',
  ],
  attributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title'],
    code: [['className', /^language-[\w+#.-]{1,32}$/]],
    ol: ['start'],
    ul: [['className', 'contains-task-list']],
    li: [['className', 'task-list-item']],
    input: [['type', 'checkbox'], ['disabled', true], 'checked'],
    th: ['align'],
    td: ['align'],
  },
  protocols: { href: ['http', 'https', 'mailto'], src: ['http', 'https'] },
  strip: ['script', 'style'],
  clobberPrefix: 'ai-md-',
  required: { input: { type: 'checkbox', disabled: true } },
}

type HastNode = { type: string; value?: string; children?: HastNode[]; tagName?: string; properties?: Record<string, unknown> }

/**
 * Le HTML écrit par l'IA est affiché tel quel, comme du texte : jamais interprété, jamais exécuté
 * (aucun rehype-raw). Appliqué avant la liste blanche.
 */
export function rehypeRawAsText() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      for (const child of node.children ?? []) {
        if (child.type === 'raw') {
          child.type = 'text'
        } else {
          visit(child)
        }
      }
    }
    visit(tree)
  }
}

/** Texte brut d'un nœud (contenu d'un bloc de code, pour le bouton Copier) */
export function hastText(node: HastNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value ?? ''
  return (node.children ?? []).map(hastText).join('')
}

/** Langage d'un bloc de code (« language-ts » → « ts ») */
export function codeLanguage(node: HastNode | undefined): string | null {
  const className = node?.properties?.className
  const list = Array.isArray(className) ? className : typeof className === 'string' ? className.split(' ') : []
  const lang = list.map(String).find(c => c.startsWith('language-'))?.slice('language-'.length)
  return lang && /^[\w+#.-]{1,32}$/.test(lang) ? lang : null
}

/** Réponse tronquée si démesurée (le texte complet reste dans l'historique de la conversation) */
export function clampForDisplay(content: string): { text: string; truncated: boolean } {
  if (content.length <= MAX_RENDERED_CHARS) return { text: content, truncated: false }
  return { text: content.slice(0, MAX_RENDERED_CHARS), truncated: true }
}
