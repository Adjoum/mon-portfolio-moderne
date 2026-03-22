// pages/WorkspacePage.tsx
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/tools/ToastContainer';
import type { WorkspaceFolder, FolderColor, ToolId } from '../types/tools';
import { TOOLS_REGISTRY } from './ToolsHubPage';

// ── Constants ─────────────────────────────────────────────────
const FOLDER_COLORS: Record<FolderColor, { bg: string; border: string; text: string; glow: string }> = {
  cyan:    { bg: 'rgba(99,179,237,.1)',  border: 'rgba(99,179,237,.3)',  text: '#63b3ed', glow: 'rgba(99,179,237,.2)' },
  violet:  { bg: 'rgba(159,122,234,.1)', border: 'rgba(159,122,234,.3)', text: '#9f7aea', glow: 'rgba(159,122,234,.2)' },
  pink:    { bg: 'rgba(237,100,166,.1)', border: 'rgba(237,100,166,.3)', text: '#ed64a6', glow: 'rgba(237,100,166,.2)' },
  emerald: { bg: 'rgba(72,187,120,.1)',  border: 'rgba(72,187,120,.3)',  text: '#48bb78', glow: 'rgba(72,187,120,.2)' },
  amber:   { bg: 'rgba(236,201,75,.1)',  border: 'rgba(236,201,75,.3)',  text: '#ecc94b', glow: 'rgba(236,201,75,.2)' },
  red:     { bg: 'rgba(252,129,129,.1)', border: 'rgba(252,129,129,.3)', text: '#fc8181', glow: 'rgba(252,129,129,.2)' },
  blue:    { bg: 'rgba(66,153,225,.1)',  border: 'rgba(66,153,225,.3)',  text: '#4299e1', glow: 'rgba(66,153,225,.2)' },
  orange:  { bg: 'rgba(237,137,54,.1)',  border: 'rgba(237,137,54,.3)',  text: '#ed8936', glow: 'rgba(237,137,54,.2)' },
};

const FOLDER_ICONS = ['📁','🚀','💡','🔬','🎨','⚙️','📊','🌐','🔐','📱','🎯','🧩','💎','🌟','🏗️','📚'];
const COLOR_KEYS = Object.keys(FOLDER_COLORS) as FolderColor[];

const genId = () => `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

// ── Sub-components ────────────────────────────────────────────
interface FolderCardProps {
  folder: WorkspaceFolder;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: (toolId: ToolId) => void;
}

const FolderCard: React.FC<FolderCardProps> = ({ folder, onOpen, onEdit, onDelete }) => {
  const c = FOLDER_COLORS[folder.color];
  const [hovered, setHovered] = useState(false);
  const [showCtx, setShowCtx] = useState(false);
  const [ctxPos, setCtxPos] = useState({ x: 0, y: 0 });

  const handleCtx = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxPos({ x: e.clientX, y: e.clientY });
    setShowCtx(true);
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.22 }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onContextMenu={handleCtx}
        onClick={onOpen}
        style={{
          background: hovered ? c.bg : 'rgba(14,14,32,0.85)',
          border: `1px solid ${hovered ? c.border : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 18,
          padding: '22px 20px',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          backdropFilter: 'blur(14px)',
          boxShadow: hovered
            ? `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${c.border}, 0 0 30px ${c.glow}`
            : '0 4px 20px rgba(0,0,0,0.3)',
          transition: 'all .25s',
        }}
      >
        {/* Glow stripe top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${c.text}, transparent)`,
          opacity: hovered ? 1 : 0.4,
          transition: 'opacity .25s',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: c.bg, border: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
            boxShadow: `0 0 16px ${c.glow}`,
          }}>
            {folder.icon}
          </div>
          <button
            onClick={e => { e.stopPropagation(); handleCtx(e as any); }}
            style={{
              background: 'transparent', border: 'none', color: '#718096',
              cursor: 'pointer', fontSize: 18, padding: 4, borderRadius: 6,
              opacity: hovered ? 1 : 0, transition: 'opacity .2s',
            }}
          >⋯</button>
        </div>

        {/* Name */}
        <div style={{
          fontWeight: 700, fontSize: 16,
          color: hovered ? c.text : '#e2e8f0',
          marginBottom: 6, transition: 'color .2s',
          fontFamily: "'Syne', sans-serif",
        }}>
          {folder.name}
        </div>

        {/* Description */}
        {folder.description && (
          <div style={{ fontSize: 12, color: '#718096', marginBottom: 12, lineHeight: 1.5 }}>
            {folder.description}
          </div>
        )}

        {/* Tags */}
        {folder.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {folder.tags.slice(0, 3).map(tag => (
              <span key={tag} className="tools-badge tools-badge-cyan" style={{ fontSize: 10 }}>#{tag}</span>
            ))}
          </div>
        )}

        {/* Pinned tools */}
        {folder.pinnedTools.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {folder.pinnedTools.map(tid => {
              const tool = TOOLS_REGISTRY.find(t => t.id === tid);
              return tool ? (
                <span key={tid} title={tool.name} style={{
                  fontSize: 18,
                  filter: 'drop-shadow(0 0 4px currentColor)',
                }}>{tool.icon}</span>
              ) : null;
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontSize: 11, color: '#4a5568' }}>
            {new Date(folder.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </span>
          <span style={{ fontSize: 11, color: c.text, fontWeight: 600 }}>
            {folder.pinnedTools.length} outil{folder.pinnedTools.length !== 1 ? 's' : ''}
          </span>
        </div>
      </motion.div>

      {/* Context menu */}
      <AnimatePresence>
        {showCtx && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowCtx(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              className="tools-ctx-menu"
              style={{ left: ctxPos.x, top: ctxPos.y, zIndex: 9999 }}
            >
              <button className="tools-ctx-item" onClick={() => { onOpen(); setShowCtx(false); }}>📂 Ouvrir le dossier</button>
              <button className="tools-ctx-item" onClick={() => { onEdit(); setShowCtx(false); }}>✏️ Renommer / Modifier</button>
              <div className="tools-ctx-sep" />
              <button className="tools-ctx-item danger" onClick={() => { onDelete(); setShowCtx(false); }}>🗑️ Supprimer</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

// ── Folder Modal ──────────────────────────────────────────────
interface FolderModalProps {
  folder?: WorkspaceFolder | null;
  onSave: (f: WorkspaceFolder) => void;
  onClose: () => void;
}

const FolderModal: React.FC<FolderModalProps> = ({ folder, onSave, onClose }) => {
  const [name, setName] = useState(folder?.name || '');
  const [description, setDescription] = useState(folder?.description || '');
  const [color, setColor] = useState<FolderColor>(folder?.color || 'cyan');
  const [icon, setIcon] = useState(folder?.icon || '📁');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(folder?.tags || []);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const now_ = now();
    onSave({
      id: folder?.id || genId(),
      name: name.trim(),
      description: description.trim(),
      color,
      icon,
      tags,
      pinnedTools: folder?.pinnedTools || [],
      notes: folder?.notes || '',
      createdAt: folder?.createdAt || now_,
      updatedAt: now_,
    });
  };

  const c = FOLDER_COLORS[color];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9990,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 500,
          background: 'rgba(10,10,26,0.98)',
          border: `1px solid ${c.border}`,
          borderRadius: 20, overflow: 'hidden',
          boxShadow: `0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)`,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          background: c.bg,
          borderBottom: `1px solid ${c.border}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 28 }}>{icon}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: c.text, fontFamily: "'Syne', sans-serif" }}>
              {folder ? 'Modifier le dossier' : 'Nouveau dossier'}
            </div>
            <div style={{ fontSize: 12, color: '#718096' }}>Organisez vos projets et outils</div>
          </div>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            color: '#718096', fontSize: 20, cursor: 'pointer',
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Name */}
          <div>
            <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 7, letterSpacing: .6, textTransform: 'uppercase' }}>Nom *</div>
            <input
              ref={inputRef}
              autoFocus
              className="tools-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Projet INP-HB, Stage Côte d'Ivoire…"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* Description */}
          <div>
            <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 7, letterSpacing: .6, textTransform: 'uppercase' }}>Description</div>
            <input
              className="tools-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brève description du projet…"
            />
          </div>

          {/* Icon picker */}
          <div>
            <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 9, letterSpacing: .6, textTransform: 'uppercase' }}>Icône</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {FOLDER_ICONS.map(ic => (
                <button key={ic} onClick={() => setIcon(ic)}
                  style={{
                    width: 40, height: 40, fontSize: 20, borderRadius: 10,
                    border: `2px solid ${icon === ic ? c.text : 'transparent'}`,
                    background: icon === ic ? c.bg : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                >{ic}</button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 9, letterSpacing: .6, textTransform: 'uppercase' }}>Couleur</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {COLOR_KEYS.map(c_ => (
                <button key={c_} onClick={() => setColor(c_)}
                  style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: FOLDER_COLORS[c_].text,
                    border: color === c_ ? '3px solid white' : '3px solid transparent',
                    boxShadow: color === c_ ? `0 0 12px ${FOLDER_COLORS[c_].glow}` : 'none',
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 7, letterSpacing: .6, textTransform: 'uppercase' }}>Tags</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="tools-input"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Ajouter un tag…"
                style={{ flex: 1 }}
              />
              <button className="tools-btn tools-btn-ghost" onClick={addTag}>+</button>
            </div>
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {tags.map(t => (
                  <span key={t} className="tools-badge tools-badge-cyan" style={{ cursor: 'pointer' }}
                    onClick={() => setTags(prev => prev.filter(x => x !== t))}>
                    #{t} ×
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px 20px',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <button className="tools-btn tools-btn-ghost" onClick={onClose}>Annuler</button>
          <button
            className="tools-btn tools-btn-primary"
            onClick={handleSave}
            disabled={!name.trim()}
            style={{ opacity: name.trim() ? 1 : 0.5 }}
          >
            {folder ? 'Enregistrer' : 'Créer le dossier'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Folder Detail View ────────────────────────────────────────
const FolderDetailView: React.FC<{
  folder: WorkspaceFolder;
  onBack: () => void;
  onToggleTool: (toolId: ToolId) => void;
  onUpdateNotes: (notes: string) => void;
}> = ({ folder, onBack, onToggleTool, onUpdateNotes }) => {
  const c = FOLDER_COLORS[folder.color];
  const [notes, setNotes] = useState(folder.notes || '');

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Back button + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#718096', borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontFamily: 'inherit',
          }}
        >← Retour</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 12, fontSize: 24,
            background: c.bg, border: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{folder.icon}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color: c.text, fontFamily: "'Syne', sans-serif" }}>{folder.name}</div>
            {folder.description && <div style={{ color: '#718096', fontSize: 13 }}>{folder.description}</div>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        {/* Tools grid */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#a0aec0', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            🛠️ Outils épinglés
            <span className="tools-badge tools-badge-cyan">{folder.pinnedTools.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {TOOLS_REGISTRY.map(tool => {
              const pinned = folder.pinnedTools.includes(tool.id);
              return (
                <motion.div
                  key={tool.id}
                  whileHover={{ y: -3 }}
                  onClick={() => onToggleTool(tool.id)}
                  style={{
                    padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                    background: pinned ? c.bg : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${pinned ? c.border : 'rgba(255,255,255,0.07)'}`,
                    transition: 'all .2s',
                    position: 'relative',
                  }}
                >
                  {pinned && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 8, height: 8, borderRadius: '50%',
                      background: c.text,
                      boxShadow: `0 0 6px ${c.glow}`,
                    }} />
                  )}
                  <div style={{ fontSize: 26, marginBottom: 8 }}>{tool.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: pinned ? c.text : '#e2e8f0', marginBottom: 4 }}>{tool.name}</div>
                  <div style={{ fontSize: 11, color: '#718096', lineHeight: 1.4 }}>{tool.description}</div>
                  <div style={{ marginTop: 8 }}>
                    <span className={`tools-badge tools-badge-${pinned ? 'cyan' : 'cyan'}`} style={{ fontSize: 10, opacity: pinned ? 1 : 0.4 }}>
                      {pinned ? '📌 Épinglé' : '+ Épingler'}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Notes panel */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#a0aec0', marginBottom: 14 }}>📝 Notes du projet</div>
          <textarea
            className="tools-input tools-scroll"
            value={notes}
            onChange={e => { setNotes(e.target.value); onUpdateNotes(e.target.value); }}
            placeholder="Prises de notes, TODO, idées…"
            style={{ width: '100%', minHeight: 300, fontFamily: "'Space Mono', monospace", fontSize: 12, lineHeight: 1.7 }}
          />
          {folder.tags.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: '#718096', fontSize: 11, marginBottom: 7 }}>Tags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {folder.tags.map(t => <span key={t} className="tools-badge tools-badge-violet">#{t}</span>)}
              </div>
            </div>
          )}
          <div style={{ marginTop: 14, color: '#4a5568', fontSize: 11 }}>
            Modifié {new Date(folder.updatedAt).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────
const WorkspacePage: React.FC = () => {
  const [folders, setFolders] = useLocalStorage<WorkspaceFolder[]>('adj_workspace_folders', []);
  const [showModal, setShowModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<WorkspaceFolder | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { toasts, addToast, removeToast } = useToast();

  const openFolder = folders.find(f => f.id === openFolderId);

  const handleCreate = (f: WorkspaceFolder) => {
    setFolders(prev => {
      const exists = prev.find(x => x.id === f.id);
      if (exists) return prev.map(x => x.id === f.id ? f : x);
      return [...prev, f];
    });
    addToast(editingFolder ? `"${f.name}" modifié` : `Dossier "${f.name}" créé 🎉`, 'success');
    setShowModal(false);
    setEditingFolder(null);
  };

  const handleDelete = (id: string) => {
    const folder = folders.find(f => f.id === id);
    setFolders(prev => prev.filter(f => f.id !== id));
    addToast(`"${folder?.name}" supprimé`, 'info');
  };

  const handleToggleTool = (toolId: ToolId) => {
    if (!openFolderId) return;
    setFolders(prev => prev.map(f => {
      if (f.id !== openFolderId) return f;
      const has = f.pinnedTools.includes(toolId);
      return {
        ...f,
        pinnedTools: has ? f.pinnedTools.filter(t => t !== toolId) : [...f.pinnedTools, toolId],
        updatedAt: new Date().toISOString(),
      };
    }));
  };

  const handleUpdateNotes = (notes: string) => {
    if (!openFolderId) return;
    setFolders(prev => prev.map(f =>
      f.id === openFolderId ? { ...f, notes, updatedAt: new Date().toISOString() } : f
    ));
  };

  const filtered = folders.filter(f =>
    !searchQuery ||
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.tags.some(t => t.includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="tools-page" style={{ fontFamily: "'Syne', 'Space Mono', sans-serif" }}>
      <div className="tools-starfield" />
      <div className="tools-nebula" />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
        {/* ── Header ── */}
        {!openFolder ? (
          <>
            <div style={{ paddingTop: 48, marginBottom: 40 }}>
              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="tools-badge tools-badge-violet" style={{ marginBottom: 14, display: 'inline-flex' }}>
                  🗂️ Workspace
                </div>
                <h1 style={{
                  fontSize: 'clamp(28px, 5vw, 48px)',
                  fontWeight: 800,
                  lineHeight: 1.1,
                  marginBottom: 12,
                }}>
                  Mes <span className="tools-gradient-text">Espaces de Travail</span>
                </h1>
                <p style={{ color: '#718096', fontSize: 16, maxWidth: 500 }}>
                  Organisez vos projets, épinglez vos outils favoris et gardez vos notes au même endroit.
                </p>
              </motion.div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
              <input
                className="tools-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="🔍 Rechercher un dossier…"
                style={{ maxWidth: 300 }}
              />
              <button
                className="tools-btn tools-btn-primary"
                onClick={() => { setEditingFolder(null); setShowModal(true); }}
              >
                + Nouveau dossier
              </button>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 32, flexWrap: 'wrap' }}>
              {[
                { label: 'Dossiers', value: folders.length, color: 'cyan' },
                { label: 'Outils épinglés', value: folders.reduce((a, f) => a + f.pinnedTools.length, 0), color: 'violet' },
                { label: 'Tags', value: new Set(folders.flatMap(f => f.tags)).size, color: 'pink' },
              ].map(s => (
                <div key={s.label} className="tools-glass-sm" style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`tools-badge tools-badge-${s.color}`} style={{ fontSize: 16, padding: '2px 8px' }}>{s.value}</span>
                  <span style={{ color: '#718096', fontSize: 13 }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Grid */}
            <AnimatePresence mode="popLayout">
              {filtered.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ textAlign: 'center', padding: '80px 0', color: '#4a5568' }}
                >
                  <div style={{ fontSize: 56, marginBottom: 16 }}>🗂️</div>
                  <div style={{ fontWeight: 700, fontSize: 20, color: '#718096', marginBottom: 8 }}>
                    {searchQuery ? 'Aucun dossier trouvé' : 'Aucun espace de travail'}
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 24 }}>
                    {searchQuery ? 'Essayez un autre terme' : 'Créez votre premier dossier pour commencer'}
                  </div>
                  {!searchQuery && (
                    <button className="tools-btn tools-btn-primary" onClick={() => setShowModal(true)}>
                      + Créer mon premier espace
                    </button>
                  )}
                </motion.div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: 18,
                }}>
                  {filtered.map(folder => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      onOpen={() => setOpenFolderId(folder.id)}
                      onEdit={() => { setEditingFolder(folder); setShowModal(true); }}
                      onDelete={() => handleDelete(folder.id)}
                      onPin={(tid) => handleToggleTool(tid)}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>
          </>
        ) : (
          /* Detail view */
          <FolderDetailView
            folder={openFolder}
            onBack={() => setOpenFolderId(null)}
            onToggleTool={handleToggleTool}
            onUpdateNotes={handleUpdateNotes}
          />
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <FolderModal
            folder={editingFolder}
            onSave={handleCreate}
            onClose={() => { setShowModal(false); setEditingFolder(null); }}
          />
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default WorkspacePage;