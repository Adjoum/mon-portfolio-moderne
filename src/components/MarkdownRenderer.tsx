// src/components/MarkdownRenderer.tsx
// Renderer Markdown complet avec react-markdown + tous les plugins
// npm install react-markdown remark-gfm remark-breaks remark-math
//             rehype-highlight rehype-raw rehype-slug rehype-autolink-headings
//             rehype-katex rehype-sanitize

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';

// ── Types ──────────────────────────────────────────────────────
interface MarkdownRendererProps {
  content: string;
  /** Mode preview dans l'éditeur — styles légèrement différents */
  preview?: boolean;
}

// ── Copy button for code blocks ────────────────────────────────
const CopyButton: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} style={{
      position: 'absolute', top: 10, right: 10,
      background: copied ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)',
      border: `1px solid ${copied ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 5, padding: '3px 10px', cursor: 'pointer',
      color: copied ? '#00ff88' : 'rgba(200,210,255,0.5)',
      fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
      transition: 'all 0.2s',
    }}>{copied ? '✓ Copié' : 'Copier'}</button>
  );
};

// ── Custom components ──────────────────────────────────────────
const buildComponents = (preview: boolean): Components => ({

  // ── Headings avec ancres cliquables ──
  h1: ({ children, id }) => (
    <h1 id={id} style={{
      fontFamily: '"Syne", sans-serif', fontSize: preview ? 28 : 38,
      fontWeight: 800, color: '#f0f4ff', margin: '36px 0 18px',
      letterSpacing: -1, lineHeight: 1.15, scrollMarginTop: 80,
    }}>
      {children}
      {id && <a href={`#${id}`} style={{ marginLeft: 10, fontSize: '0.6em', color: 'rgba(0,255,136,0.3)', textDecoration: 'none' }}>¶</a>}
    </h1>
  ),
  h2: ({ children, id }) => (
    <h2 id={id} style={{
      fontFamily: '"Syne", sans-serif', fontSize: preview ? 22 : 28,
      fontWeight: 700, color: '#c8d2ff',
      borderLeft: '3px solid #00ff88', paddingLeft: 16,
      margin: '32px 0 14px', lineHeight: 1.3, scrollMarginTop: 80,
    }}>
      {children}
      {id && <a href={`#${id}`} style={{ marginLeft: 8, fontSize: '0.6em', color: 'rgba(0,255,136,0.3)', textDecoration: 'none' }}>¶</a>}
    </h2>
  ),
  h3: ({ children, id }) => (
    <h3 id={id} style={{
      fontFamily: '"Syne", sans-serif', fontSize: preview ? 18 : 22,
      fontWeight: 600, color: '#a0b0e0', margin: '24px 0 12px', scrollMarginTop: 80,
    }}>
      {children}
      {id && <a href={`#${id}`} style={{ marginLeft: 8, fontSize: '0.6em', color: 'rgba(0,255,136,0.3)', textDecoration: 'none' }}>¶</a>}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ fontFamily: '"Syne", sans-serif', fontSize: 18, fontWeight: 600, color: '#8090c0', margin: '20px 0 10px' }}>{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 style={{ fontFamily: '"Syne", sans-serif', fontSize: 16, fontWeight: 600, color: '#7080b0', margin: '16px 0 8px' }}>{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 style={{ fontFamily: '"Syne", sans-serif', fontSize: 14, fontWeight: 600, color: '#6070a0', margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>{children}</h6>
  ),

  // ── Paragraphe ──
  p: ({ children }) => (
    <p style={{
      color: 'rgba(200,210,255,0.78)', lineHeight: 1.9, fontSize: preview ? 14 : 16,
      margin: '0 0 18px', fontFamily: '"Lora", serif',
    }}>{children}</p>
  ),

  // ── Bloc de code avec coloration + bouton copier ──
  code: ({ children, className, ...props }) => {
    const isBlock = !!className;
    const lang    = className?.replace('language-', '') || '';
    const code    = String(children).replace(/\n$/, '');

    if (!isBlock) {
      return (
        <code style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: '0.88em',
          background: 'rgba(0,255,136,0.1)', color: '#00ff88',
          padding: '2px 7px', borderRadius: 5,
          border: '1px solid rgba(0,255,136,0.2)',
        }}>{children}</code>
      );
    }

    return (
      <div style={{ position: 'relative', margin: '24px 0' }}>
        {/* Language badge */}
        {lang && (
          <div style={{
            position: 'absolute', top: 0, left: 0,
            background: 'rgba(0,255,136,0.15)',
            color: '#00ff88', fontSize: 10,
            fontFamily: '"JetBrains Mono", monospace',
            padding: '3px 12px', borderRadius: '10px 0 6px 0',
            letterSpacing: 2, textTransform: 'uppercase',
            zIndex: 1,
          }}>{lang}</div>
        )}
        <CopyButton code={code} />
        <pre style={{
          background: '#0d1117',
          border: '1px solid rgba(0,255,136,0.12)',
          borderRadius: 10, padding: lang ? '36px 20px 20px' : '20px',
          overflowX: 'auto', margin: 0,
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}>
          <code className={className} style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 13, lineHeight: 1.8, color: '#e2e8f0',
          }} {...props}>{children}</code>
        </pre>
      </div>
    );
  },

  // ── Citation ──
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid #00ff88', margin: '24px 0',
      padding: '14px 20px',
      background: 'rgba(0,255,136,0.04)',
      borderRadius: '0 10px 10px 0',
      color: 'rgba(200,210,255,0.65)', fontStyle: 'italic',
      fontFamily: '"Lora", serif', fontSize: 15,
    }}>{children}</blockquote>
  ),

  // ── Listes ──
  ul: ({ children }) => (
    <ul style={{ margin: '12px 0 18px', paddingLeft: 24, listStyle: 'none' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: '12px 0 18px', paddingLeft: 24 }}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li 
      {...props}
      style={{
        color: 'rgba(200,210,255,0.72)', lineHeight: 1.8, marginBottom: 6,
        fontFamily: '"Lora", serif', fontSize: preview ? 13 : 15,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
      <span style={{ color: '#00ff88', marginTop: 4, flexShrink: 0, fontSize: 12 }}>▸</span>
      <span>{children}</span>
    </li>
  ),

  // ── Tableau GitHub Flavored ──
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '24px 0' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontFamily: '"JetBrains Mono", monospace', fontSize: 13,
      }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: 'rgba(0,255,136,0.08)' }}>{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{children}</tr>
  ),
  th: ({ children }) => (
    <th style={{
      padding: '10px 14px', textAlign: 'left',
      color: '#00ff88', fontWeight: 700,
      borderBottom: '2px solid rgba(0,255,136,0.2)',
      whiteSpace: 'nowrap',
    }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{
      padding: '9px 14px', color: 'rgba(200,210,255,0.72)',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>{children}</td>
  ),

  // ── Image ──
  img: ({ src, alt }) => (
    <figure style={{ margin: '28px 0', textAlign: 'center' }}>
      <img
        src={src} alt={alt}
        loading="lazy"
        style={{
          maxWidth: '100%', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      {alt && (
        <figcaption style={{
          marginTop: 10, fontSize: 12, color: 'rgba(200,210,255,0.4)',
          fontStyle: 'italic', fontFamily: '"Lora", serif',
        }}>{alt}</figcaption>
      )}
    </figure>
  ),

  // ── Lien ──
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      color: '#00ff88', textDecoration: 'none',
      borderBottom: '1px solid rgba(0,255,136,0.3)',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderBottomColor = '#00ff88')}
      onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'rgba(0,255,136,0.3)')}
    >{children}</a>
  ),

  // ── Séparateur ──
  hr: () => (
    <hr style={{
      border: 'none',
      height: 1,
      background: 'linear-gradient(to right, transparent, rgba(0,255,136,0.3), transparent)',
      margin: '36px 0',
    }} />
  ),

  // ── Gras / Italique / Barré ──
  strong: ({ children }) => (
    <strong style={{ color: '#f0f4ff', fontWeight: 700 }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: 'rgba(200,210,255,0.85)', fontStyle: 'italic' }}>{children}</em>
  ),
  del: ({ children }) => (
    <del style={{ color: 'rgba(200,210,255,0.4)', textDecoration: 'line-through' }}>{children}</del>
  ),

  // ── Checkbox dans les task lists ──
  input: ({ type, checked }) => {
    if (type === 'checkbox') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, marginRight: 8, borderRadius: 4,
          background: checked ? 'rgba(0,255,136,0.2)' : 'transparent',
          border: `2px solid ${checked ? '#00ff88' : 'rgba(200,210,255,0.3)'}`,
          color: '#00ff88', fontSize: 10, verticalAlign: 'middle',
          flexShrink: 0,
        }}>
          {checked ? '✓' : ''}
        </span>
      );
    }
    return null;
  },

  // ── Footnote ref ──
  sup: ({ children }) => (
    <sup style={{ color: '#00ff88', fontSize: '0.75em', verticalAlign: 'super' }}>{children}</sup>
  ),

  // ── Definition / Abbr ──
  abbr: ({ children, title }) => (
    <abbr title={title} style={{
      textDecoration: 'underline dotted rgba(0,255,136,0.5)',
      cursor: 'help', color: 'inherit',
    }}>{children}</abbr>
  ),
});

// ── Main component ─────────────────────────────────────────────
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, preview = false }) => {
  return (
    <>
      {/* Highlight.js theme — injected once */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        /* highlight.js custom dark theme */
        .hljs                { color:#abb2bf; }
        .hljs-keyword        { color:#c678dd; font-weight:500; }
        .hljs-built_in       { color:#e6c07b; }
        .hljs-type           { color:#e5c07b; }
        .hljs-literal        { color:#56b6c2; }
        .hljs-number         { color:#d19a66; }
        .hljs-string         { color:#98c379; }
        .hljs-comment        { color:#5c6370; font-style:italic; }
        .hljs-subst          { color:#abb2bf; }
        .hljs-regexp         { color:#98c379; }
        .hljs-symbol         { color:#e06c75; }
        .hljs-variable       { color:#e06c75; }
        .hljs-attr           { color:#d19a66; }
        .hljs-attribute      { color:#e06c75; }
        .hljs-function       { color:#61afef; }
        .hljs-title          { color:#61afef; font-weight:500; }
        .hljs-params         { color:#abb2bf; }
        .hljs-operator       { color:#56b6c2; }
        .hljs-punctuation    { color:#abb2bf; }
        .hljs-property       { color:#e06c75; }
        .hljs-class          { color:#e5c07b; }
        .hljs-tag            { color:#e06c75; }
        .hljs-name           { color:#e06c75; }
        .hljs-selector-tag   { color:#e06c75; }
        .hljs-selector-id    { color:#61afef; }
        .hljs-selector-class { color:#e6c07b; }
        .hljs-meta           { color:#e06c75; }
        .hljs-doctag         { color:#c678dd; }
        .hljs-strong         { font-weight:bold; }
        .hljs-emphasis       { font-style:italic; }
        .hljs-deletion       { background:rgba(224,108,117,.15); color:#e06c75; }
        .hljs-addition       { background:rgba(152,195,121,.1); color:#98c379; }
        .hljs-section        { color:#e06c75; font-weight:bold; }
        .hljs-link           { color:#61afef; text-decoration:underline; }

        /* KaTeX math */
        .katex { color:#e5c07b; font-size:1.1em; }
        .katex-display { margin:24px 0; text-align:center; overflow-x:auto; }

        /* GFM task list */
        .contains-task-list { list-style:none; padding-left:0; }

        /* Table zebra */
        tbody tr:nth-child(even) { background:rgba(255,255,255,0.02); }
        tbody tr:hover            { background:rgba(0,255,136,0.04); }
      `}</style>

      <div style={{ lineHeight: 1.8 }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
          rehypePlugins={[
            [rehypeHighlight, { detect: true, ignoreMissing: true }],
            rehypeSlug,
            [rehypeAutolinkHeadings, { behavior: 'append' }],
            rehypeKatex,
            rehypeRaw,
          ]}
          components={buildComponents(preview)}
        >
          {content}
        </ReactMarkdown>
      </div>
    </>
  );
};

export default MarkdownRenderer;























// // src/components/MarkdownRenderer.tsx
// // Renderer Markdown complet avec react-markdown + tous les plugins
// // npm install react-markdown remark-gfm remark-breaks remark-math
// //             rehype-highlight rehype-raw rehype-slug rehype-autolink-headings
// //             rehype-katex rehype-sanitize

// import React, { useState } from 'react';
// import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';
// import remarkBreaks from 'remark-breaks';
// import remarkMath from 'remark-math';
// import rehypeHighlight from 'rehype-highlight';
// import rehypeSlug from 'rehype-slug';
// import rehypeAutolinkHeadings from 'rehype-autolink-headings';
// import rehypeKatex from 'rehype-katex';
// import rehypeRaw from 'rehype-raw';
// import type { Components } from 'react-markdown';

// // ── Types ──────────────────────────────────────────────────────
// interface MarkdownRendererProps {
//   content: string;
//   /** Mode preview dans l'éditeur — styles légèrement différents */
//   preview?: boolean;
// }

// // ── Copy button for code blocks ────────────────────────────────
// const CopyButton: React.FC<{ code: string }> = ({ code }) => {
//   const [copied, setCopied] = useState(false);
//   const copy = () => {
//     navigator.clipboard.writeText(code);
//     setCopied(true);
//     setTimeout(() => setCopied(false), 2000);
//   };
//   return (
//     <button onClick={copy} style={{
//       position: 'absolute', top: 10, right: 10,
//       background: copied ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)',
//       border: `1px solid ${copied ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.1)'}`,
//       borderRadius: 5, padding: '3px 10px', cursor: 'pointer',
//       color: copied ? '#00ff88' : 'rgba(200,210,255,0.5)',
//       fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
//       transition: 'all 0.2s',
//     }}>{copied ? '✓ Copié' : 'Copier'}</button>
//   );
// };

// // ── Custom components ──────────────────────────────────────────
// const buildComponents = (preview: boolean): Components => ({

//   // ── Headings avec ancres cliquables ──
//   h1: ({ children, id }) => (
//     <h1 id={id} style={{
//       fontFamily: '"Syne", sans-serif', fontSize: preview ? 28 : 38,
//       fontWeight: 800, color: '#f0f4ff', margin: '36px 0 18px',
//       letterSpacing: -1, lineHeight: 1.15, scrollMarginTop: 80,
//     }}>
//       {children}
//       {id && <a href={`#${id}`} style={{ marginLeft: 10, fontSize: '0.6em', color: 'rgba(0,255,136,0.3)', textDecoration: 'none' }}>¶</a>}
//     </h1>
//   ),
//   h2: ({ children, id }) => (
//     <h2 id={id} style={{
//       fontFamily: '"Syne", sans-serif', fontSize: preview ? 22 : 28,
//       fontWeight: 700, color: '#c8d2ff',
//       borderLeft: '3px solid #00ff88', paddingLeft: 16,
//       margin: '32px 0 14px', lineHeight: 1.3, scrollMarginTop: 80,
//     }}>
//       {children}
//       {id && <a href={`#${id}`} style={{ marginLeft: 8, fontSize: '0.6em', color: 'rgba(0,255,136,0.3)', textDecoration: 'none' }}>¶</a>}
//     </h2>
//   ),
//   h3: ({ children, id }) => (
//     <h3 id={id} style={{
//       fontFamily: '"Syne", sans-serif', fontSize: preview ? 18 : 22,
//       fontWeight: 600, color: '#a0b0e0', margin: '24px 0 12px', scrollMarginTop: 80,
//     }}>
//       {children}
//       {id && <a href={`#${id}`} style={{ marginLeft: 8, fontSize: '0.6em', color: 'rgba(0,255,136,0.3)', textDecoration: 'none' }}>¶</a>}
//     </h3>
//   ),
//   h4: ({ children }) => (
//     <h4 style={{ fontFamily: '"Syne", sans-serif', fontSize: 18, fontWeight: 600, color: '#8090c0', margin: '20px 0 10px' }}>{children}</h4>
//   ),
//   h5: ({ children }) => (
//     <h5 style={{ fontFamily: '"Syne", sans-serif', fontSize: 16, fontWeight: 600, color: '#7080b0', margin: '16px 0 8px' }}>{children}</h5>
//   ),
//   h6: ({ children }) => (
//     <h6 style={{ fontFamily: '"Syne", sans-serif', fontSize: 14, fontWeight: 600, color: '#6070a0', margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>{children}</h6>
//   ),

//   // ── Paragraphe ──
//   p: ({ children }) => (
//     <p style={{
//       color: 'rgba(200,210,255,0.78)', lineHeight: 1.9, fontSize: preview ? 14 : 16,
//       margin: '0 0 18px', fontFamily: '"Lora", serif',
//     }}>{children}</p>
//   ),

//   // ── Bloc de code avec coloration + bouton copier ──
//   code: ({ children, className, ...props }) => {
//     const isBlock = !!className;
//     const lang    = className?.replace('language-', '') || '';
//     const code    = String(children).replace(/\n$/, '');

//     if (!isBlock) {
//       return (
//         <code style={{
//           fontFamily: '"JetBrains Mono", monospace', fontSize: '0.88em',
//           background: 'rgba(0,255,136,0.1)', color: '#00ff88',
//           padding: '2px 7px', borderRadius: 5,
//           border: '1px solid rgba(0,255,136,0.2)',
//         }}>{children}</code>
//       );
//     }

//     return (
//       <div style={{ position: 'relative', margin: '24px 0' }}>
//         {/* Language badge */}
//         {lang && (
//           <div style={{
//             position: 'absolute', top: 0, left: 0,
//             background: 'rgba(0,255,136,0.15)',
//             color: '#00ff88', fontSize: 10,
//             fontFamily: '"JetBrains Mono", monospace',
//             padding: '3px 12px', borderRadius: '10px 0 6px 0',
//             letterSpacing: 2, textTransform: 'uppercase',
//             zIndex: 1,
//           }}>{lang}</div>
//         )}
//         <CopyButton code={code} />
//         <pre style={{
//           background: '#0d1117',
//           border: '1px solid rgba(0,255,136,0.12)',
//           borderRadius: 10, padding: lang ? '36px 20px 20px' : '20px',
//           overflowX: 'auto', margin: 0,
//           boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
//         }}>
//           <code className={className} style={{
//             fontFamily: '"JetBrains Mono", monospace',
//             fontSize: 13, lineHeight: 1.8, color: '#e2e8f0',
//           }} {...props}>{children}</code>
//         </pre>
//       </div>
//     );
//   },

//   // ── Citation ──
//   blockquote: ({ children }) => (
//     <blockquote style={{
//       borderLeft: '3px solid #00ff88', margin: '24px 0',
//       padding: '14px 20px',
//       background: 'rgba(0,255,136,0.04)',
//       borderRadius: '0 10px 10px 0',
//       color: 'rgba(200,210,255,0.65)', fontStyle: 'italic',
//       fontFamily: '"Lora", serif', fontSize: 15,
//     }}>{children}</blockquote>
//   ),

//   // ── Listes ──
//   ul: ({ children }) => (
//     <ul style={{ margin: '12px 0 18px', paddingLeft: 24, listStyle: 'none' }}>{children}</ul>
//   ),
//   ol: ({ children }) => (
//     <ol style={{ margin: '12px 0 18px', paddingLeft: 24 }}>{children}</ol>
//   ),
//   li: ({ children, ...props }) => (
//     <li style={{
//       color: 'rgba(200,210,255,0.72)', lineHeight: 1.8, marginBottom: 6,
//       fontFamily: '"Lora", serif', fontSize: preview ? 13 : 15,
//       display: 'flex', alignItems: 'flex-start', gap: 10,
//     }}>
//       <span style={{ color: '#00ff88', marginTop: 4, flexShrink: 0, fontSize: 12 }}>▸</span>
//       <span>{children}</span>
//     </li>
//   ),

//   // ── Tableau GitHub Flavored ──
//   table: ({ children }) => (
//     <div style={{ overflowX: 'auto', margin: '24px 0' }}>
//       <table style={{
//         width: '100%', borderCollapse: 'collapse',
//         fontFamily: '"JetBrains Mono", monospace', fontSize: 13,
//       }}>{children}</table>
//     </div>
//   ),
//   thead: ({ children }) => (
//     <thead style={{ background: 'rgba(0,255,136,0.08)' }}>{children}</thead>
//   ),
//   tbody: ({ children }) => <tbody>{children}</tbody>,
//   tr: ({ children }) => (
//     <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{children}</tr>
//   ),
//   th: ({ children }) => (
//     <th style={{
//       padding: '10px 14px', textAlign: 'left',
//       color: '#00ff88', fontWeight: 700,
//       borderBottom: '2px solid rgba(0,255,136,0.2)',
//       whiteSpace: 'nowrap',
//     }}>{children}</th>
//   ),
//   td: ({ children }) => (
//     <td style={{
//       padding: '9px 14px', color: 'rgba(200,210,255,0.72)',
//       borderBottom: '1px solid rgba(255,255,255,0.04)',
//     }}>{children}</td>
//   ),

//   // ── Image ──
//   img: ({ src, alt }) => (
//     <figure style={{ margin: '28px 0', textAlign: 'center' }}>
//       <img
//         src={src} alt={alt}
//         loading="lazy"
//         style={{
//           maxWidth: '100%', borderRadius: 10,
//           border: '1px solid rgba(255,255,255,0.08)',
//           boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
//         }}
//         onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
//       />
//       {alt && (
//         <figcaption style={{
//           marginTop: 10, fontSize: 12, color: 'rgba(200,210,255,0.4)',
//           fontStyle: 'italic', fontFamily: '"Lora", serif',
//         }}>{alt}</figcaption>
//       )}
//     </figure>
//   ),

//   // ── Lien ──
//   a: ({ href, children }) => (
//     <a href={href} target="_blank" rel="noopener noreferrer" style={{
//       color: '#00ff88', textDecoration: 'none',
//       borderBottom: '1px solid rgba(0,255,136,0.3)',
//       transition: 'border-color 0.2s',
//     }}
//       onMouseEnter={e => (e.currentTarget.style.borderBottomColor = '#00ff88')}
//       onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'rgba(0,255,136,0.3)')}
//     >{children}</a>
//   ),

//   // ── Séparateur ──
//   hr: () => (
//     <hr style={{
//       border: 'none',
//       height: 1,
//       background: 'linear-gradient(to right, transparent, rgba(0,255,136,0.3), transparent)',
//       margin: '36px 0',
//     }} />
//   ),

//   // ── Gras / Italique / Barré ──
//   strong: ({ children }) => (
//     <strong style={{ color: '#f0f4ff', fontWeight: 700 }}>{children}</strong>
//   ),
//   em: ({ children }) => (
//     <em style={{ color: 'rgba(200,210,255,0.85)', fontStyle: 'italic' }}>{children}</em>
//   ),
//   del: ({ children }) => (
//     <del style={{ color: 'rgba(200,210,255,0.4)', textDecoration: 'line-through' }}>{children}</del>
//   ),

//   // ── Checkbox dans les task lists ──
//   input: ({ type, checked }) => {
//     if (type === 'checkbox') {
//       return (
//         <span style={{
//           display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
//           width: 16, height: 16, marginRight: 8, borderRadius: 4,
//           background: checked ? 'rgba(0,255,136,0.2)' : 'transparent',
//           border: `2px solid ${checked ? '#00ff88' : 'rgba(200,210,255,0.3)'}`,
//           color: '#00ff88', fontSize: 10, verticalAlign: 'middle',
//           flexShrink: 0,
//         }}>
//           {checked ? '✓' : ''}
//         </span>
//       );
//     }
//     return null;
//   },

//   // ── Footnote ref ──
//   sup: ({ children }) => (
//     <sup style={{ color: '#00ff88', fontSize: '0.75em', verticalAlign: 'super' }}>{children}</sup>
//   ),

//   // ── Definition / Abbr ──
//   abbr: ({ children, title }) => (
//     <abbr title={title} style={{
//       textDecoration: 'underline dotted rgba(0,255,136,0.5)',
//       cursor: 'help', color: 'inherit',
//     }}>{children}</abbr>
//   ),
// });

// // ── Main component ─────────────────────────────────────────────
// const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, preview = false }) => {
//   return (
//     <>
//       {/* Highlight.js theme — injected once */}
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap');

//         /* highlight.js custom dark theme */
//         .hljs                { color:#abb2bf; }
//         .hljs-keyword        { color:#c678dd; font-weight:500; }
//         .hljs-built_in       { color:#e6c07b; }
//         .hljs-type           { color:#e5c07b; }
//         .hljs-literal        { color:#56b6c2; }
//         .hljs-number         { color:#d19a66; }
//         .hljs-string         { color:#98c379; }
//         .hljs-comment        { color:#5c6370; font-style:italic; }
//         .hljs-subst          { color:#abb2bf; }
//         .hljs-regexp         { color:#98c379; }
//         .hljs-symbol         { color:#e06c75; }
//         .hljs-variable       { color:#e06c75; }
//         .hljs-attr           { color:#d19a66; }
//         .hljs-attribute      { color:#e06c75; }
//         .hljs-function       { color:#61afef; }
//         .hljs-title          { color:#61afef; font-weight:500; }
//         .hljs-params         { color:#abb2bf; }
//         .hljs-operator       { color:#56b6c2; }
//         .hljs-punctuation    { color:#abb2bf; }
//         .hljs-property       { color:#e06c75; }
//         .hljs-class          { color:#e5c07b; }
//         .hljs-tag            { color:#e06c75; }
//         .hljs-name           { color:#e06c75; }
//         .hljs-selector-tag   { color:#e06c75; }
//         .hljs-selector-id    { color:#61afef; }
//         .hljs-selector-class { color:#e6c07b; }
//         .hljs-meta           { color:#e06c75; }
//         .hljs-doctag         { color:#c678dd; }
//         .hljs-strong         { font-weight:bold; }
//         .hljs-emphasis       { font-style:italic; }
//         .hljs-deletion       { background:rgba(224,108,117,.15); color:#e06c75; }
//         .hljs-addition       { background:rgba(152,195,121,.1); color:#98c379; }
//         .hljs-section        { color:#e06c75; font-weight:bold; }
//         .hljs-link           { color:#61afef; text-decoration:underline; }

//         /* KaTeX math */
//         .katex { color:#e5c07b; font-size:1.1em; }
//         .katex-display { margin:24px 0; text-align:center; overflow-x:auto; }

//         /* GFM task list */
//         .contains-task-list { list-style:none; padding-left:0; }

//         /* Table zebra */
//         tbody tr:nth-child(even) { background:rgba(255,255,255,0.02); }
//         tbody tr:hover            { background:rgba(0,255,136,0.04); }
//       `}</style>

//       <div style={{ lineHeight: 1.8 }}>
//         <ReactMarkdown
//           remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
//           rehypePlugins={[
//             rehypeHighlight,
//             rehypeSlug,
//             [rehypeAutolinkHeadings, { behavior: 'append' }],
//             rehypeKatex,
//             rehypeRaw,
//           ]}
//           components={buildComponents(preview)}
//         >
//           {content}
//         </ReactMarkdown>
//       </div>
//     </>
//   );
// };

// export default MarkdownRenderer;