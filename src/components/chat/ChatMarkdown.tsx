// Rendu Markdown des réponses du Clone IA, chargé à la demande (src/components/AIAgent.tsx).
// Réponses du fournisseur IA = données non fiables : HTML affiché comme du texte, liste blanche
// stricte (rehype-sanitize), adresses filtrées, aucune image distante chargée, aucun
// dangerouslySetInnerHTML.
import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink, Image as ImageIcon } from 'lucide-react'
import {
  CHAT_SANITIZE_SCHEMA, clampForDisplay, codeLanguage, hastText, isInternalPath, rehypeRawAsText, safeChatUrl,
} from './markdownRules'
import './chatMarkdown.css'

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // contexte non sécurisé ou permission refusée : repli ci-dessous
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  return ok
}

function CodeBlock({ language, code, children }: { language: string | null; code: string; children: ReactNode }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    setState((await copyText(code)) ? 'copied' : 'failed')
    window.setTimeout(() => setState('idle'), 2000)
  }
  return (
    <div className="ai-md-code">
      <div className="ai-md-code-bar">
        <span className="ai-md-code-lang">{language ?? 'code'}</span>
        <button type="button" className="ai-md-copy" onClick={() => void copy()} aria-label={state === 'copied' ? 'Code copié' : 'Copier le code'}>
          {state === 'copied' ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          <span aria-hidden="true">{state === 'copied' ? 'Copié' : state === 'failed' ? 'Échec' : 'Copier'}</span>
        </button>
        <span className="sr-only" role="status">{state === 'copied' ? 'Code copié dans le presse-papiers' : state === 'failed' ? 'Copie impossible' : ''}</span>
      </div>
      <pre tabIndex={0}>{children}</pre>
    </div>
  )
}

// Titres décalés : la conversation est une région de la page, pas un document à part
const heading = (level: 3 | 4 | 5 | 6) => {
  const Tag = `h${level}` as const
  return ({ children }: { children?: ReactNode }) => <Tag className={`ai-md-h ai-md-h${level}`}>{children}</Tag>
}

const COMPONENTS: Components = {
  h1: heading(3), h2: heading(4), h3: heading(5), h4: heading(6), h5: heading(6), h6: heading(6),
  a: ({ href, children, title }) => {
    const url = href ? safeChatUrl(href) : null
    if (!url) return <span className="ai-md-link-off">{children}</span>
    if (isInternalPath(url)) return <Link to={url} title={title}>{children}</Link>
    const external = !url.startsWith('mailto:')
    return (
      <a href={url} title={title} {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } : {})}>
        {children}
        {external && <><ExternalLink size={11} className="ai-md-ext" aria-hidden="true" /><span className="sr-only"> (nouvel onglet)</span></>}
      </a>
    )
  },
  // Aucune image distante chargée (vie privée du visiteur) : lien explicite à la place
  img: ({ src, alt }) => {
    const url = typeof src === 'string' ? safeChatUrl(src) : null
    const label = alt?.trim() || 'image'
    if (!url || isInternalPath(url)) return <span className="ai-md-img">[{label}]</span>
    return (
      <a className="ai-md-img" href={url} target="_blank" rel="noopener noreferrer nofollow ugc">
        <ImageIcon size={12} aria-hidden="true" /> Image : {label}
      </a>
    )
  },
  pre: ({ node, children }) => {
    const code = node?.children?.[0] as Parameters<typeof hastText>[0] | undefined
    return <CodeBlock language={codeLanguage(code)} code={hastText(code).replace(/\n$/, '')}>{children}</CodeBlock>
  },
  table: ({ children }) => (
    <div className="ai-md-table" role="region" aria-label="Tableau, défilable horizontalement" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
}

function ChatMarkdown({ content }: { content: string }) {
  const { text, truncated } = clampForDisplay(content)
  return (
    <div className="ai-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRawAsText, [rehypeSanitize, CHAT_SANITIZE_SCHEMA]]}
        urlTransform={url => safeChatUrl(url) ?? ''}
        components={COMPONENTS}
      >
        {text}
      </ReactMarkdown>
      {truncated && <p className="ai-md-truncated">Réponse tronquée à l’affichage (trop longue).</p>}
    </div>
  )
}

export default memo(ChatMarkdown)
