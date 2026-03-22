// pages/ToolsHubPage.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { ToolMeta, ToolCategory } from '../types/tools';

// ── Registry (exported for use in Workspace) ──────────────────
export const TOOLS_REGISTRY: ToolMeta[] = [
  {
    id: 'novamind',
    name: 'NovaMind',
    description: 'Cartes mentales & diagrammes infinis style cosmos',
    icon: '🧠',
    category: 'Créativité',
    badge: 'Nouveau',
    color: '#63b3ed',
    path: '/tools/novamind',
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro Pro',
    description: 'Minuteur focus avec sessions & analytics',
    icon: '⏱️',
    category: 'Productivité',
    color: '#fc8181',
    path: '/tools/pomodoro',
  },
  {
    id: 'snippets',
    name: 'Code Vault',
    description: 'Bibliothèque de snippets multi-langages',
    icon: '🗄️',
    category: 'Développement',
    badge: 'Pro',
    color: '#48bb78',
    path: '/tools/snippets',
  },
  {
    id: 'markdown',
    name: 'MarkPad',
    description: 'Éditeur Markdown avec prévisualisation live',
    icon: '📝',
    category: 'Productivité',
    color: '#ecc94b',
    path: '/tools/markdown',
  },
  {
    id: 'color-picker',
    name: 'Chroma Lab',
    description: 'Générateur de palettes & conversion couleurs',
    icon: '🎨',
    category: 'Créativité',
    color: '#ed64a6',
    path: '/tools/colors',
  },
  {
    id: 'json-viewer',
    name: 'JSON Forge',
    description: 'Visualiseur, formateur et validateur JSON',
    icon: '🔍',
    category: 'Développement',
    color: '#9f7aea',
    path: '/tools/json',
  },
  {
    id: 'regex-tester',
    name: 'RegEx Lab',
    description: 'Testeur d\'expressions régulières en live',
    icon: '⚡',
    category: 'Développement',
    color: '#ecc94b',
    path: '/tools/regex',
  },
  {
    id: 'base64',
    name: 'Codec Pro',
    description: 'Encodeur/Décodeur Base64, URL, HTML entities',
    icon: '🔐',
    category: 'Utilitaires',
    color: '#63b3ed',
    path: '/tools/codec',
  },
  {
    id: 'lorem-ipsum',
    name: 'TextFiller',
    description: 'Générateur de texte Lorem Ipsum & faux data',
    icon: '📄',
    category: 'Utilitaires',
    color: '#a0aec0',
    path: '/tools/lorem',
  },
  {
    id: 'diff-viewer',
    name: 'DiffScope',
    description: 'Comparateur de texte et code côte-à-côte',
    icon: '🔀',
    category: 'Développement',
    color: '#48bb78',
    path: '/tools/diff',
  },
];

const CATEGORIES: ToolCategory[] = ['Créativité', 'Productivité', 'Développement', 'Utilitaires'];

const CAT_ICONS: Record<ToolCategory, string> = {
  'Créativité':    '🎨',
  'Productivité':  '⚡',
  'Développement': '💻',
  'Utilitaires':   '🔧',
};

// ── Tool Card ─────────────────────────────────────────────────
const ToolCard: React.FC<{ tool: ToolMeta; index: number }> = ({ tool, index }) => {
  const [hovered, setHovered] = useState(false);
  const rgb = hexToRgb(tool.color);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
    >
      <Link to={tool.path} style={{ textDecoration: 'none' }}>
        <motion.div
          whileHover={{ y: -6, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onHoverStart={() => setHovered(true)}
          onHoverEnd={() => setHovered(false)}
          style={{
            padding: '22px 20px',
            borderRadius: 18,
            background: hovered ? `rgba(${rgb}, 0.1)` : 'rgba(14,14,32,0.85)',
            border: `1px solid ${hovered ? `rgba(${rgb}, 0.35)` : 'rgba(255,255,255,0.07)'}`,
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            backdropFilter: 'blur(12px)',
            boxShadow: hovered
              ? `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(${rgb}, 0.2), 0 0 30px rgba(${rgb}, 0.15)`
              : '0 4px 16px rgba(0,0,0,0.3)',
            transition: 'all .25s',
          }}
        >
          {/* Gradient stripe */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, ${tool.color}, transparent)`,
            opacity: hovered ? 1 : 0.4, transition: 'opacity .25s',
          }} />

          {/* Badge */}
          {tool.badge && (
            <div style={{
              position: 'absolute', top: 14, right: 14,
              background: tool.badge === 'Nouveau' ? 'rgba(99,179,237,.15)' : 'rgba(159,122,234,.15)',
              border: `1px solid ${tool.badge === 'Nouveau' ? 'rgba(99,179,237,.3)' : 'rgba(159,122,234,.3)'}`,
              color: tool.badge === 'Nouveau' ? '#63b3ed' : '#9f7aea',
              borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700,
            }}>{tool.badge}</div>
          )}

          {/* Icon */}
          <div style={{
            width: 54, height: 54, borderRadius: 14,
            background: `rgba(${rgb}, 0.12)`,
            border: `1px solid rgba(${rgb}, 0.25)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, marginBottom: 14,
            boxShadow: hovered ? `0 0 20px rgba(${rgb}, 0.3)` : 'none',
            transition: 'box-shadow .25s',
          }}>{tool.icon}</div>

          <div style={{
            fontWeight: 700, fontSize: 16,
            color: hovered ? tool.color : '#e2e8f0',
            marginBottom: 6, transition: 'color .2s',
            fontFamily: "'Syne', sans-serif",
          }}>{tool.name}</div>

          <div style={{ fontSize: 12, color: '#718096', lineHeight: 1.5, marginBottom: 14 }}>
            {tool.description}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="tools-badge" style={{
              background: `rgba(${rgb}, 0.1)`,
              color: tool.color,
              border: `1px solid rgba(${rgb}, 0.2)`,
              fontSize: 10,
            }}>
              {CAT_ICONS[tool.category]} {tool.category}
            </span>
            <span style={{
              color: hovered ? tool.color : '#4a5568',
              fontSize: 18, transition: 'all .2s',
              transform: hovered ? 'translateX(3px)' : 'none',
              display: 'inline-block',
            }}>→</span>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
};

// ── Main Page ─────────────────────────────────────────────────
const ToolsHubPage: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<ToolCategory | 'Tous'>('Tous');
  const [search, setSearch] = useState('');

  const filtered = TOOLS_REGISTRY.filter(t => {
    const matchCat = activeCategory === 'Tous' || t.category === activeCategory;
    const matchSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="tools-page" style={{ fontFamily: "'Syne', sans-serif" }}>
      <div className="tools-starfield" />
      <div className="tools-nebula" />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
        {/* Header */}
        <div style={{ paddingTop: 48, marginBottom: 48, textAlign: 'center' }}>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="tools-badge tools-badge-cyan" style={{ marginBottom: 16, display: 'inline-flex' }}>
              🛠️ Boîte à outils
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 800, lineHeight: 1.08, marginBottom: 16 }}>
              Mes <span className="tools-gradient-text">Outils</span>
            </h1>
            <p style={{ color: '#718096', fontSize: 17, maxWidth: 540, margin: '0 auto 28px' }}>
              Un écosystème d'outils taillés pour les développeurs créatifs. Tous intégrés, tous personnalisables.
            </p>
            <Link to="/workspace">
              <motion.button
                whileHover={{ scale: 1.04 }}
                className="tools-btn tools-btn-ghost"
                style={{ marginRight: 10 }}
              >
                🗂️ Mes Workspaces
              </motion.button>
            </Link>
          </motion.div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="tools-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher un outil…"
            style={{ maxWidth: 260 }}
          />
          {(['Tous', ...CATEGORIES] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat as any)}
              className="tools-btn"
              style={{
                background: activeCategory === cat ? 'rgba(99,179,237,.14)' : 'rgba(255,255,255,.04)',
                color: activeCategory === cat ? '#63b3ed' : '#718096',
                border: `1px solid ${activeCategory === cat ? 'rgba(99,179,237,.3)' : 'rgba(255,255,255,.07)'}`,
                padding: '7px 14px', fontSize: 13,
              }}
            >
              {cat === 'Tous' ? '⚡ Tous' : `${CAT_ICONS[cat as ToolCategory]} ${cat}`}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 18,
        }}>
          {filtered.map((tool, i) => (
            <ToolCard key={tool.id} tool={tool} index={i} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#4a5568' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#718096' }}>Aucun outil trouvé</div>
          </div>
        )}
      </div>
    </div>
  );
};

function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '99,179,237';
}

export default ToolsHubPage;
