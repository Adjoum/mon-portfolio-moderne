// pages/CodeVaultPage.tsx
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/tools/ToastContainer';
import type { CodeSnippet, SnippetLanguage } from '../types/tools';

const LANG_META: Record<SnippetLanguage, { label: string; color: string; icon: string }> = {
  javascript: { label: 'JavaScript', color: '#ecc94b', icon: 'JS' },
  typescript: { label: 'TypeScript', color: '#63b3ed', icon: 'TS' },
  python:     { label: 'Python',     color: '#48bb78', icon: 'PY' },
  react:      { label: 'React/JSX',  color: '#63b3ed', icon: '⚛' },
  html:       { label: 'HTML',       color: '#fc8181', icon: '</>' },
  css:        { label: 'CSS',        color: '#ed64a6', icon: 'CSS' },
  sql:        { label: 'SQL',        color: '#9f7aea', icon: 'DB' },
  bash:       { label: 'Bash/Shell', color: '#a0aec0', icon: '$_' },
  c:          { label: 'C / C++',    color: '#68d391', icon: 'C' },
  dart:       { label: 'Dart/Flutter', color: '#63b3ed', icon: '🎯' },
  json:       { label: 'JSON',       color: '#ecc94b', icon: '{}' },
  php:        { label: 'PHP',        color: '#9f7aea', icon: 'PHP' },
  other:      { label: 'Autre',      color: '#718096', icon: '◻' },
};

const LANGUAGES = Object.keys(LANG_META) as SnippetLanguage[];

const genId = () => `snip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

// ── Snippet form ──────────────────────────────────────────────
const SnippetForm: React.FC<{
  snippet?: CodeSnippet | null;
  onSave: (s: CodeSnippet) => void;
  onCancel: () => void;
}> = ({ snippet, onSave, onCancel }) => {
  const [title, setTitle] = useState(snippet?.title || '');
  const [description, setDescription] = useState(snippet?.description || '');
  const [code, setCode] = useState(snippet?.code || '');
  const [language, setLanguage] = useState<SnippetLanguage>(snippet?.language || 'javascript');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(snippet?.tags || []);

  const handleSave = () => {
    if (!title.trim() || !code.trim()) return;
    const now_ = now();
    onSave({
      id: snippet?.id || genId(),
      title: title.trim(),
      description: description.trim(),
      code,
      language,
      tags,
      folderId: snippet?.folderId,
      createdAt: snippet?.createdAt || now_,
      updatedAt: now_,
      isFavorite: snippet?.isFavorite || false,
      usageCount: snippet?.usageCount || 0,
    });
  };

  const lm = LANG_META[language];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9990,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 700,
          background: 'rgba(10,10,26,0.98)',
          border: `1px solid rgba(${hexToRgb(lm.color)}, 0.25)`,
          borderRadius: 20,
          boxShadow: `0 30px 80px rgba(0,0,0,0.8)`,
          overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: `rgba(${hexToRgb(lm.color)}, 0.06)`,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 800,
            background: `rgba(${hexToRgb(lm.color)}, 0.15)`,
            border: `1px solid rgba(${hexToRgb(lm.color)}, 0.3)`,
            color: lm.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Space Mono', monospace",
          }}>{lm.icon}</div>
          <div style={{ fontWeight: 800, fontSize: 17, fontFamily: "'Syne', sans-serif", color: '#e2e8f0' }}>
            {snippet ? 'Modifier le snippet' : 'Nouveau snippet'}
          </div>
          <button onClick={onCancel} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#718096', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Row 1: Title + Language */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
            <div>
              <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: .6, textTransform: 'uppercase' }}>Titre *</div>
              <input className="tools-input" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Fetch avec async/await…" autoFocus />
            </div>
            <div>
              <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: .6, textTransform: 'uppercase' }}>Langage</div>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as SnippetLanguage)}
                className="tools-input"
                style={{ width: 160 }}
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{LANG_META[l].label}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: .6, textTransform: 'uppercase' }}>Description</div>
            <input className="tools-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="À quoi sert ce snippet ?" />
          </div>

          {/* Code editor */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase' }}>Code *</div>
              <div style={{ fontSize: 11, color: '#4a5568' }}>{code.split('\n').length} lignes · {code.length} chars</div>
            </div>
            <div style={{ position: 'relative' }}>
              <textarea
                className="tools-input tools-scroll"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="// Collez votre code ici…"
                style={{
                  fontFamily: "'Space Mono', 'Courier New', monospace",
                  fontSize: 12.5, minHeight: 200, lineHeight: 1.7,
                  background: 'rgba(0,0,0,0.5)', borderColor: `rgba(${hexToRgb(lm.color)}, 0.2)`,
                  resize: 'vertical',
                }}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: .6, textTransform: 'uppercase' }}>Tags</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="tools-input" value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const t = tagInput.trim(); if (t && !tags.includes(t)) setTags(p => [...p, t]); setTagInput(''); } }}
                placeholder="Ajouter un tag…" style={{ flex: 1 }} />
            </div>
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {tags.map(t => (
                  <span key={t} className="tools-badge tools-badge-cyan" style={{ cursor: 'pointer' }}
                    onClick={() => setTags(p => p.filter(x => x !== t))}>#{t} ×</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '14px 22px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button className="tools-btn tools-btn-ghost" onClick={onCancel}>Annuler</button>
          <button className="tools-btn tools-btn-primary" onClick={handleSave} disabled={!title.trim() || !code.trim()} style={{ opacity: title.trim() && code.trim() ? 1 : 0.5 }}>
            {snippet ? 'Enregistrer' : 'Créer le snippet'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Snippet card ──────────────────────────────────────────────
const SnippetCard: React.FC<{
  snippet: CodeSnippet;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
  onCopy: () => void;
}> = ({ snippet, onEdit, onDelete, onToggleFav, onCopy }) => {
  const [expanded, setExpanded] = useState(false);
  const lm = LANG_META[snippet.language];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="tools-glass"
      style={{ overflow: 'hidden' }}
    >
      {/* Card header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
        display: 'flex', alignItems: 'flex-start', gap: 12,
        cursor: 'pointer',
      }} onClick={() => setExpanded(p => !p)}>
        {/* Lang badge */}
        <div style={{
          width: 38, height: 38, borderRadius: 9, fontSize: 11, fontWeight: 800,
          background: `rgba(${hexToRgb(lm.color)}, 0.12)`,
          border: `1px solid rgba(${hexToRgb(lm.color)}, 0.25)`,
          color: lm.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontFamily: "'Space Mono', monospace",
        }}>{lm.icon}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', fontFamily: "'Syne', sans-serif" }}>
              {snippet.title}
            </span>
            {snippet.isFavorite && <span style={{ color: '#ecc94b', fontSize: 14 }}>★</span>}
          </div>
          {snippet.description && (
            <div style={{ fontSize: 12, color: '#718096', marginBottom: 6, lineHeight: 1.4 }}>{snippet.description}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            <span className="tools-badge" style={{ background: `rgba(${hexToRgb(lm.color)}, 0.1)`, color: lm.color, border: `1px solid rgba(${hexToRgb(lm.color)}, 0.2)`, fontSize: 10 }}>
              {lm.label}
            </span>
            {snippet.tags.slice(0, 3).map(t => (
              <span key={t} className="tools-badge tools-badge-violet" style={{ fontSize: 10 }}>#{t}</span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onCopy(); }}
            className="tools-btn tools-btn-ghost" style={{ padding: '5px 10px', fontSize: 14 }} title="Copier">⧉</button>
          <button onClick={e => { e.stopPropagation(); onToggleFav(); }}
            style={{ padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
              color: snippet.isFavorite ? '#ecc94b' : '#4a5568' }}>★</button>
          <button onClick={e => { e.stopPropagation(); onEdit(); }}
            className="tools-btn tools-btn-ghost" style={{ padding: '5px 10px', fontSize: 14 }}>✏️</button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{ padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#fc8181' }}>×</button>
        </div>
      </div>

      {/* Code */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <pre style={{
              margin: 0, padding: '16px 18px',
              fontFamily: "'Space Mono', monospace", fontSize: 12,
              lineHeight: 1.75, color: '#e2e8f0',
              background: 'rgba(0,0,0,0.4)',
              overflowX: 'auto',
              maxHeight: 340,
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <code>{snippet.code}</code>
            </pre>
            <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#4a5568' }}>
                {new Date(snippet.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                {' · '}{snippet.usageCount} copie{snippet.usageCount !== 1 ? 's' : ''}
              </span>
              <button className="tools-btn tools-btn-ghost" style={{ fontSize: 12, padding: '5px 14px' }} onClick={onCopy}>
                ⧉ Copier le code
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Main Page ─────────────────────────────────────────────────
const CodeVaultPage: React.FC = () => {
  const [snippets, setSnippets] = useLocalStorage<CodeSnippet[]>('adj_code_snippets', []);
  const [showForm, setShowForm] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<CodeSnippet | null>(null);
  const [search, setSearch] = useState('');
  const [filterLang, setFilterLang] = useState<SnippetLanguage | 'all'>('all');
  const [filterFav, setFilterFav] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'usage'>('date');
  const { toasts, addToast, removeToast } = useToast();

  const filtered = useMemo(() => {
    let list = [...snippets];
    if (filterFav) list = list.filter(s => s.isFavorite);
    if (filterLang !== 'all') list = list.filter(s => s.language === filterLang);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.tags.some(t => t.includes(q)) ||
        s.code.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'date') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return b.usageCount - a.usageCount;
    });
    return list;
  }, [snippets, filterFav, filterLang, search, sortBy]);

  const handleSave = (s: CodeSnippet) => {
    setSnippets(prev => {
      const exists = prev.find(x => x.id === s.id);
      if (exists) return prev.map(x => x.id === s.id ? s : x);
      return [s, ...prev];
    });
    addToast(editingSnippet ? 'Snippet modifié ✅' : 'Snippet créé 🎉', 'success');
    setShowForm(false);
    setEditingSnippet(null);
  };

  const handleCopy = (snippet: CodeSnippet) => {
    navigator.clipboard.writeText(snippet.code);
    setSnippets(prev => prev.map(s => s.id === snippet.id ? { ...s, usageCount: s.usageCount + 1 } : s));
    addToast('Code copié dans le presse-papier ⧉', 'success');
  };

  const usedLangs = useMemo(() => {
    const counts: Partial<Record<SnippetLanguage, number>> = {};
    snippets.forEach(s => { counts[s.language] = (counts[s.language] || 0) + 1; });
    return counts;
  }, [snippets]);

  return (
    <div className="tools-page" style={{ fontFamily: "'Syne', sans-serif" }}>
      <div className="tools-starfield" />
      <div className="tools-nebula" />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div className="tools-badge tools-badge-green" style={{ marginBottom: 12, display: 'inline-flex' }}>🗄️ Code Vault</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 'clamp(26px, 5vw, 42px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 8 }}>
                Ma <span className="tools-gradient-text">Bibliothèque</span> de Code
              </h1>
              <p style={{ color: '#718096', fontSize: 15 }}>
                {snippets.length} snippet{snippets.length !== 1 ? 's' : ''} · {snippets.filter(s => s.isFavorite).length} favoris
              </p>
            </div>
            <button className="tools-btn tools-btn-primary" onClick={() => { setEditingSnippet(null); setShowForm(true); }}>
              + Nouveau snippet
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="tools-glass" style={{ padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="tools-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Rechercher…" style={{ maxWidth: 220 }} />

            <select className="tools-input" value={filterLang} onChange={e => setFilterLang(e.target.value as any)}
              style={{ width: 160 }}>
              <option value="all">Tous les langages ({snippets.length})</option>
              {LANGUAGES.filter(l => usedLangs[l]).map(l => (
                <option key={l} value={l}>{LANG_META[l].label} ({usedLangs[l]})</option>
              ))}
            </select>

            <button className="tools-btn" onClick={() => setFilterFav(p => !p)}
              style={{
                background: filterFav ? 'rgba(236,201,75,.14)' : 'rgba(255,255,255,.04)',
                color: filterFav ? '#ecc94b' : '#718096',
                border: `1px solid ${filterFav ? 'rgba(236,201,75,.3)' : 'rgba(255,255,255,.07)'}`,
              }}>
              ★ Favoris
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: '#4a5568', fontSize: 12 }}>Trier :</span>
              {[['date', '📅 Date'], ['title', '🔤 Titre'], ['usage', '⚡ Usage']].map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key as any)}
                  className="tools-btn"
                  style={{
                    padding: '5px 12px', fontSize: 12,
                    background: sortBy === key ? 'rgba(99,179,237,.14)' : 'rgba(255,255,255,.04)',
                    color: sortBy === key ? '#63b3ed' : '#718096',
                    border: `1px solid ${sortBy === key ? 'rgba(99,179,237,.3)' : 'rgba(255,255,255,.07)'}`,
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <AnimatePresence mode="popLayout">
            {filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ textAlign: 'center', padding: '70px 0', color: '#4a5568' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🗄️</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#718096', marginBottom: 8 }}>
                  {search || filterLang !== 'all' || filterFav ? 'Aucun snippet trouvé' : 'Bibliothèque vide'}
                </div>
                <div style={{ fontSize: 14, marginBottom: 20 }}>
                  {!search && !filterFav && filterLang === 'all' && 'Commencez par créer votre premier snippet'}
                </div>
                {!search && !filterFav && filterLang === 'all' && (
                  <button className="tools-btn tools-btn-primary" onClick={() => setShowForm(true)}>
                    + Créer un snippet
                  </button>
                )}
              </motion.div>
            ) : (
              filtered.map(s => (
                <SnippetCard
                  key={s.id}
                  snippet={s}
                  onEdit={() => { setEditingSnippet(s); setShowForm(true); }}
                  onDelete={() => { setSnippets(prev => prev.filter(x => x.id !== s.id)); addToast('Snippet supprimé', 'info'); }}
                  onToggleFav={() => { setSnippets(prev => prev.map(x => x.id === s.id ? { ...x, isFavorite: !x.isFavorite } : x)); }}
                  onCopy={() => handleCopy(s)}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <SnippetForm
            snippet={editingSnippet}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingSnippet(null); }}
          />
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '99,179,237';
}

export default CodeVaultPage;
