// src/pages/KnowledgeAdmin.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Brain, Upload, Type, Search, Trash2,
  FileText, RefreshCw, CheckCircle, AlertCircle,
  Tag, BookOpen, User, Code, Database, Layers,
  X, Plus, Sparkles,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const CATEGORIES = [
  { value: 'biographie',   label: 'Biographie',   icon: User,     color: '#6EE7F7' },
  { value: 'compétences',  label: 'Compétences',  icon: Code,     color: '#A78BFA' },
  { value: 'projets',      label: 'Projets',      icon: Layers,   color: '#34D399' },
  { value: 'formation',    label: 'Formation',    icon: BookOpen, color: '#FBBF24' },
  { value: 'contact',      label: 'Contact',      icon: Tag,      color: '#F472B6' },
  { value: 'expérience',   label: 'Expérience',   icon: Database, color: '#F87171' },
  { value: 'général',      label: 'Général',      icon: FileText, color: '#60A5FA' },
];

const QUICK_TEMPLATES = [
  {
    label: 'À propos',
    category: 'biographie',
    text: `Je suis Adjoumani Koffi Wilfried, développeur Full Stack passionné basé en Côte d'Ivoire. 
Je suis étudiant en Master 1 Big Data Analytics à l'UVCI/INP-HB (2025-2026).
Je maîtrise React, TypeScript, Node.js, Python, FastAPI, Flutter et PHP.
Je suis disponible pour des missions freelance et des opportunités d'emploi.`,
  },
  {
    label: 'Contact',
    category: 'contact',
    text: `Contact d'Adjoumani Koffi Wilfried :
Email : contact@adjoumani-koffi.com
Téléphone : +225 07 78 28 88 68
Site web : https://adjoumani-koffi.com
GitHub : https://github.com/Adjoum
LinkedIn : https://linkedin.com/in/koffi-wilfried-adjoumani
Localisation : San-Pedro, Côte d'Ivoire`,
  },
  {
    label: 'Stack technique',
    category: 'compétences',
    text: `Compétences techniques d'Adjoumani :
Frontend : React, TypeScript, Next.js, Vite, TailwindCSS, Framer Motion
Backend : Node.js, Express, Python, FastAPI, PHP
Mobile : Flutter, Dart
Data : Talend, Apache Spark, Power BI, Python (Pandas, Scikit-learn)
Bases de données : MongoDB, MySQL, SQLite, PostgreSQL, Supabase
Cloud : Oracle Cloud, Vercel, Render, Docker
Outils : Git, VS Code, Figma`,
  },
];

interface Entry {
  id: string;
  text: string;
  source: string;
  category: string;
  date: string;
  score?: number;
}

interface Toast {
  type: 'success' | 'error' | 'loading';
  message: string;
}

export default function KnowledgeAdmin() {
  const navigate = useNavigate();
  const fileRef  = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────────────────
  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [totalVectors, setTotalVectors] = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [toast,        setToast]        = useState<Toast | null>(null);
  const [activeTab,    setActiveTab]    = useState<'text' | 'file' | 'search' | 'list'>('text');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchResults,setSearchResults]= useState<Entry[]>([]);
  const [searching,    setSearching]    = useState(false);

  // Formulaire texte
  const [textForm, setTextForm] = useState({
    text:     '',
    category: 'biographie',
    source:   'dashboard',
  });

  // Upload fichier
  const [fileForm, setFileForm] = useState({
    category: 'document',
    source:   '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver,     setDragOver]     = useState(false);

  // ── Toast helper ───────────────────────────────────────────
  const showToast = (type: Toast['type'], message: string) => {
    setToast({ type, message });
    if (type !== 'loading') setTimeout(() => setToast(null), 4000);
  };

  // ── Load entries ───────────────────────────────────────────
  const loadEntries = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/agent/knowledge/list`);
      const data = await res.json();
      setEntries(data.entries || []);
      setTotalVectors(data.totalVectors || 0);
    } catch {
      showToast('error', 'Impossible de charger les entrées');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEntries(); }, []);

  // ── Add text ───────────────────────────────────────────────
  const handleAddText = async () => {
    if (!textForm.text.trim()) return showToast('error', 'Texte vide');
    showToast('loading', 'Indexation en cours...');
    try {
      const res  = await fetch(`${API_URL}/agent/knowledge/add-text`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(textForm),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('success', `✅ ${data.chunksIndexed} chunk(s) indexé(s) !`);
      setTextForm(prev => ({ ...prev, text: '' }));
      loadEntries();
    } catch (e: any) {
      showToast('error', e.message);
    }
  };

  // ── Upload file ────────────────────────────────────────────
  const handleUploadFile = async () => {
    if (!selectedFile) return showToast('error', 'Aucun fichier sélectionné');
    showToast('loading', `Traitement de ${selectedFile.name}...`);
    const form = new FormData();
    form.append('file',     selectedFile);
    form.append('category', fileForm.category);
    form.append('source',   fileForm.source || selectedFile.name);
    try {
      const res  = await fetch(`${API_URL}/agent/knowledge/upload-file`, {
        method: 'POST',
        body:   form,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('success', `✅ ${data.chunksIndexed} chunks extraits de ${data.filename}`);
      setSelectedFile(null);
      loadEntries();
    } catch (e: any) {
      showToast('error', e.message);
    }
  };

  // ── Search ─────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res  = await fetch(`${API_URL}/agent/knowledge/search`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      showToast('error', 'Erreur de recherche');
    } finally {
      setSearching(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette entrée ?')) return;
    try {
      await fetch(`${API_URL}/agent/knowledge/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      showToast('success', 'Entrée supprimée');
      loadEntries();
    } catch {
      showToast('error', 'Erreur lors de la suppression');
    }
  };

  // ── Drag & Drop ────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const getCategoryInfo = (value: string) =>
    CATEGORIES.find(c => c.value === value) || CATEGORIES[6];

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="ka-root">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="ka-header">
        <motion.button
          onClick={() => navigate('/admin')}
          whileHover={{ x: -4 }}
          className="ka-back-btn"
        >
          <ArrowLeft size={18} />
          Dashboard
        </motion.button>

        <div className="ka-header-center">
          <div className="ka-logo">
            <Brain size={22} />
          </div>
          <div>
            <h1 className="ka-title">Knowledge Base</h1>
            <p className="ka-subtitle">Gestion du contenu IA · Pinecone</p>
          </div>
        </div>

        <div className="ka-stats-pill">
          <Database size={14} />
          <span>{totalVectors} vecteurs</span>
          <motion.button
            onClick={loadEntries}
            whileTap={{ rotate: 360 }}
            transition={{ duration: 0.5 }}
            className="ka-refresh"
          >
            <RefreshCw size={13} />
          </motion.button>
        </div>
      </div>

      {/* ── Toast ───────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`ka-toast ka-toast-${toast.type}`}
          >
            {toast.type === 'success'  && <CheckCircle size={16} />}
            {toast.type === 'error'    && <AlertCircle size={16} />}
            {toast.type === 'loading'  && <RefreshCw size={16} className="ka-spin" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ka-body">
        {/* ── Sidebar tabs ──────────────────────────────────── */}
        <div className="ka-sidebar">
          {[
            { id: 'text',   icon: Type,     label: 'Ajouter texte'   },
            { id: 'file',   icon: Upload,   label: 'Upload fichier'  },
            { id: 'search', icon: Search,   label: 'Rechercher'      },
            { id: 'list',   icon: Database, label: `Entrées (${entries.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`ka-tab ${activeTab === tab.id ? 'ka-tab-active' : ''}`}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
            </button>
          ))}

          {/* ── Category legend ───────────────────────────── */}
          <div className="ka-legend">
            <div className="ka-legend-title">Catégories</div>
            {CATEGORIES.map(cat => (
              <div key={cat.value} className="ka-legend-item">
                <span className="ka-legend-dot" style={{ background: cat.color }} />
                <span>{cat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────── */}
        <div className="ka-main">
          <AnimatePresence mode="wait">

            {/* ── TAB : Ajouter texte ───────────────────────── */}
            {activeTab === 'text' && (
              <motion.div key="text"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="ka-panel"
              >
                <h2 className="ka-panel-title">
                  <Type size={20} /> Ajouter du texte
                </h2>

                {/* Templates rapides */}
                <div className="ka-templates">
                  <div className="ka-templates-label">
                    <Sparkles size={13} /> Templates rapides
                  </div>
                  <div className="ka-templates-grid">
                    {QUICK_TEMPLATES.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => setTextForm(prev => ({
                          ...prev, text: t.text, category: t.category
                        }))}
                        className="ka-template-chip"
                      >
                        <Plus size={12} /> {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Catégorie */}
                <div className="ka-field">
                  <label className="ka-label">Catégorie</label>
                  <div className="ka-category-grid">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.value}
                        onClick={() => setTextForm(prev => ({ ...prev, category: cat.value }))}
                        className={`ka-cat-btn ${textForm.category === cat.value ? 'ka-cat-active' : ''}`}
                        style={textForm.category === cat.value ? {
                          borderColor: cat.color,
                          background: `${cat.color}18`,
                          color: cat.color,
                        } : {}}
                      >
                        <cat.icon size={14} />
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Source */}
                <div className="ka-field">
                  <label className="ka-label">Source <span className="ka-optional">(optionnel)</span></label>
                  <input
                    value={textForm.source}
                    onChange={e => setTextForm(prev => ({ ...prev, source: e.target.value }))}
                    placeholder="ex: LinkedIn, CV, entretien..."
                    className="ka-input"
                  />
                </div>

                {/* Texte */}
                <div className="ka-field">
                  <label className="ka-label">
                    Contenu
                    <span className="ka-char-count">{textForm.text.length} caractères</span>
                  </label>
                  <textarea
                    value={textForm.text}
                    onChange={e => setTextForm(prev => ({ ...prev, text: e.target.value }))}
                    placeholder="Écris ici les informations à indexer dans la base de connaissances IA..."
                    className="ka-textarea"
                    rows={10}
                  />
                </div>

                <motion.button
                  onClick={handleAddText}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="ka-submit-btn"
                  disabled={!textForm.text.trim()}
                >
                  <Brain size={18} />
                  Indexer dans Pinecone
                </motion.button>
              </motion.div>
            )}

            {/* ── TAB : Upload fichier ──────────────────────── */}
            {activeTab === 'file' && (
              <motion.div key="file"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="ka-panel"
              >
                <h2 className="ka-panel-title">
                  <Upload size={20} /> Upload de fichier
                </h2>

                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => fileRef.current?.click()}
                  className={`ka-dropzone ${dragOver ? 'ka-dropzone-over' : ''} ${selectedFile ? 'ka-dropzone-filled' : ''}`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                  />
                  {selectedFile ? (
                    <div className="ka-file-selected">
                      <FileText size={32} style={{ color: '#6366f1' }} />
                      <div className="ka-file-name">{selectedFile.name}</div>
                      <div className="ka-file-size">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedFile(null); }}
                        className="ka-file-remove"
                      >
                        <X size={14} /> Retirer
                      </button>
                    </div>
                  ) : (
                    <div className="ka-dropzone-content">
                      <Upload size={36} style={{ color: '#6366f1', opacity: 0.7 }} />
                      <div className="ka-dropzone-text">
                        Glisse ton fichier ici ou <span>clique pour parcourir</span>
                      </div>
                      <div className="ka-dropzone-formats">
                        PDF · DOCX · TXT · Markdown
                      </div>
                    </div>
                  )}
                </div>

                <div className="ka-row">
                  <div className="ka-field">
                    <label className="ka-label">Catégorie</label>
                    <select
                      value={fileForm.category}
                      onChange={e => setFileForm(prev => ({ ...prev, category: e.target.value }))}
                      className="ka-select"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="ka-field">
                    <label className="ka-label">Source <span className="ka-optional">(optionnel)</span></label>
                    <input
                      value={fileForm.source}
                      onChange={e => setFileForm(prev => ({ ...prev, source: e.target.value }))}
                      placeholder="Nom de la source..."
                      className="ka-input"
                    />
                  </div>
                </div>

                <motion.button
                  onClick={handleUploadFile}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="ka-submit-btn"
                  disabled={!selectedFile}
                >
                  <Upload size={18} />
                  Extraire et indexer
                </motion.button>
              </motion.div>
            )}

            {/* ── TAB : Recherche ───────────────────────────── */}
            {activeTab === 'search' && (
              <motion.div key="search"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="ka-panel"
              >
                <h2 className="ka-panel-title">
                  <Search size={20} /> Tester la recherche sémantique
                </h2>

                <div className="ka-search-bar">
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Ex: Quelles sont tes compétences React ?"
                    className="ka-search-input"
                  />
                  <motion.button
                    onClick={handleSearch}
                    whileTap={{ scale: 0.95 }}
                    className="ka-search-btn"
                    disabled={searching}
                  >
                    {searching
                      ? <RefreshCw size={18} className="ka-spin" />
                      : <Search size={18} />
                    }
                  </motion.button>
                </div>

                <div className="ka-results">
                  {searchResults.map((r, i) => {
                    const cat = getCategoryInfo(r.category);
                    return (
                      <motion.div
                        key={r.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="ka-result-card"
                      >
                        <div className="ka-result-header">
                          <span className="ka-result-cat"
                            style={{ color: cat.color, background: `${cat.color}18` }}>
                            {cat.label}
                          </span>
                          <span className="ka-result-score"
                            style={{ color: (r.score || 0) > 0.8 ? '#34D399' : '#FBBF24' }}>
                            {((r.score || 0) * 100).toFixed(0)}% match
                          </span>
                        </div>
                        <p className="ka-result-text">{r.text}</p>
                        <div className="ka-result-meta">
                          <span>Source : {r.source}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                  {searchResults.length === 0 && searchQuery && !searching && (
                    <div className="ka-empty">Aucun résultat trouvé</div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── TAB : Liste ───────────────────────────────── */}
            {activeTab === 'list' && (
              <motion.div key="list"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="ka-panel"
              >
                <div className="ka-list-header">
                  <h2 className="ka-panel-title">
                    <Database size={20} /> Entrées indexées
                  </h2>
                  <span className="ka-badge">{entries.length} entrées</span>
                </div>

                {loading ? (
                  <div className="ka-loading">
                    <RefreshCw size={24} className="ka-spin" />
                    <span>Chargement...</span>
                  </div>
                ) : (
                  <div className="ka-entries">
                    {entries.map((entry, i) => {
                      const cat = getCategoryInfo(entry.category);
                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className="ka-entry-card"
                          style={{ borderLeft: `3px solid ${cat.color}` }}
                        >
                          <div className="ka-entry-top">
                            <span className="ka-entry-cat"
                              style={{ color: cat.color }}>
                              {cat.label}
                            </span>
                            <span className="ka-entry-source">{entry.source}</span>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="ka-entry-delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <p className="ka-entry-text">{entry.text}</p>
                          <div className="ka-entry-id">{entry.id}</div>
                        </motion.div>
                      );
                    })}
                    {entries.length === 0 && (
                      <div className="ka-empty">
                        <Brain size={48} style={{ opacity: 0.2 }} />
                        <p>Aucune entrée indexée</p>
                        <p style={{ fontSize: 13, color: '#475569' }}>
                          Commence par ajouter du texte ou uploader un fichier
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ── Styles ──────────────────────────────────────────── */}
      <style>{`
        .ka-root {
          min-height: 100vh;
          background: linear-gradient(135deg, #04040e 0%, #0a0a1f 50%, #04040e 100%);
          color: #e2e8f0;
          font-family: 'Inter', sans-serif;
        }
        .ka-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 28px;
          background: rgba(10,10,30,0.9);
          border-bottom: 1px solid rgba(99,102,241,0.2);
          backdrop-filter: blur(20px);
          position: sticky; top: 0; z-index: 100;
        }
        .ka-back-btn {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          color: #94a3b8; border-radius: 10px; padding: 8px 14px;
          cursor: pointer; font-size: 13px; transition: .2s;
        }
        .ka-back-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
        .ka-header-center { display: flex; align-items: center; gap: 12px; }
        .ka-logo {
          width: 40px; height: 40px; border-radius: 12px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 20px rgba(99,102,241,0.4);
        }
        .ka-title { font-size: 18px; font-weight: 800; color: #fff; margin: 0; }
        .ka-subtitle { font-size: 11px; color: #6366f1; letter-spacing: 1px; margin: 0; }
        .ka-stats-pill {
          display: flex; align-items: center; gap: 7px;
          background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.3);
          border-radius: 20px; padding: 6px 14px; font-size: 13px; color: #a5b4fc;
        }
        .ka-refresh { background: none; border: none; color: #6366f1; cursor: pointer; padding: 2px; }
        .ka-toast {
          position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
          padding: 10px 22px; border-radius: 24px; font-size: 13px; font-weight: 600;
          display: flex; align-items: center; gap: 8px; z-index: 999;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .ka-toast-success { background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.4); color: #34D399; }
        .ka-toast-error   { background: rgba(248,113,113,0.15); border: 1px solid rgba(248,113,113,0.4); color: #F87171; }
        .ka-toast-loading { background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.4); color: #a5b4fc; }
        .ka-spin { animation: ka-rotate 1s linear infinite; }
        @keyframes ka-rotate { to { transform: rotate(360deg); } }

        .ka-body { display: flex; min-height: calc(100vh - 65px); }

        .ka-sidebar {
          width: 220px; flex-shrink: 0;
          padding: 20px 12px;
          background: rgba(4,4,14,0.6);
          border-right: 1px solid rgba(99,102,241,0.15);
          display: flex; flex-direction: column; gap: 4px;
        }
        .ka-tab {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-radius: 10px; border: none;
          background: none; color: #64748b; cursor: pointer;
          font-size: 13px; text-align: left; transition: .2s; width: 100%;
        }
        .ka-tab:hover { color: #94a3b8; background: rgba(255,255,255,0.04); }
        .ka-tab-active { color: #a5b4fc !important; background: rgba(99,102,241,0.15) !important; }
        .ka-legend { margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(99,102,241,0.1); }
        .ka-legend-title { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; padding: 0 4px; }
        .ka-legend-item  { display: flex; align-items: center; gap: 8px; padding: 4px; font-size: 12px; color: #64748b; }
        .ka-legend-dot   { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        .ka-main { flex: 1; padding: 28px; overflow-y: auto; }
        .ka-panel { max-width: 780px; }
        .ka-panel-title {
          display: flex; align-items: center; gap: 10px;
          font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 24px;
        }
        .ka-field { margin-bottom: 18px; }
        .ka-label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 8px; font-weight: 500; }
        .ka-optional { color: #475569; font-weight: 400; margin-left: 4px; }
        .ka-char-count { float: right; color: #475569; font-weight: 400; }
        .ka-input, .ka-select {
          width: 100%; padding: 10px 14px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(99,102,241,0.2);
          border-radius: 10px; color: #e2e8f0; font-size: 14px; outline: none; transition: .2s;
        }
        .ka-input:focus, .ka-select:focus { border-color: #6366f1; background: rgba(99,102,241,0.08); }
        .ka-textarea {
          width: 100%; padding: 12px 14px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(99,102,241,0.2);
          border-radius: 12px; color: #e2e8f0; font-size: 14px; outline: none;
          resize: vertical; font-family: inherit; transition: .2s; line-height: 1.6;
          box-sizing: border-box;
        }
        .ka-textarea:focus { border-color: #6366f1; background: rgba(99,102,241,0.07); }
        .ka-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }

        .ka-templates { margin-bottom: 22px; }
        .ka-templates-label { font-size: 11px; color: #6366f1; display: flex; align-items: center; gap: 5px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .ka-templates-grid  { display: flex; flex-wrap: wrap; gap: 8px; }
        .ka-template-chip {
          display: flex; align-items: center; gap: 5px;
          background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.25);
          color: #a5b4fc; border-radius: 20px; padding: 5px 12px;
          font-size: 12px; cursor: pointer; transition: .2s;
        }
        .ka-template-chip:hover { background: rgba(99,102,241,0.2); }

        .ka-category-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .ka-cat-btn {
          display: flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          color: #64748b; border-radius: 8px; padding: 6px 12px;
          font-size: 12px; cursor: pointer; transition: .2s;
        }
        .ka-cat-btn:hover { color: #94a3b8; }

        .ka-submit-btn {
          display: flex; align-items: center; gap: 10px;
          padding: 13px 28px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff; font-size: 15px; font-weight: 700; cursor: pointer;
          box-shadow: 0 4px 20px rgba(99,102,241,0.4); transition: .2s; margin-top: 8px;
        }
        .ka-submit-btn:disabled { opacity: .4; cursor: not-allowed; }
        .ka-submit-btn:not(:disabled):hover { box-shadow: 0 6px 28px rgba(99,102,241,0.6); }

        .ka-dropzone {
          border: 2px dashed rgba(99,102,241,0.3); border-radius: 16px;
          padding: 48px 24px; text-align: center; cursor: pointer;
          transition: .2s; margin-bottom: 20px;
          background: rgba(99,102,241,0.04);
        }
        .ka-dropzone:hover, .ka-dropzone-over { border-color: #6366f1; background: rgba(99,102,241,0.1); }
        .ka-dropzone-filled { border-color: #34D399; background: rgba(52,211,153,0.05); }
        .ka-dropzone-content { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .ka-dropzone-text { color: #94a3b8; font-size: 14px; }
        .ka-dropzone-text span { color: #6366f1; text-decoration: underline; }
        .ka-dropzone-formats { font-size: 12px; color: #475569; letter-spacing: 1px; }
        .ka-file-selected { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .ka-file-name { color: #fff; font-weight: 600; font-size: 15px; }
        .ka-file-size { color: #64748b; font-size: 13px; }
        .ka-file-remove {
          display: flex; align-items: center; gap: 5px;
          background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.3);
          color: #F87171; border-radius: 8px; padding: 4px 10px;
          font-size: 12px; cursor: pointer; margin-top: 4px;
        }

        .ka-search-bar  { display: flex; gap: 10px; margin-bottom: 20px; }
        .ka-search-input {
          flex: 1; padding: 12px 16px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(99,102,241,0.25);
          border-radius: 12px; color: #e2e8f0; font-size: 14px; outline: none;
        }
        .ka-search-btn {
          width: 46px; height: 46px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .ka-results { display: flex; flex-direction: column; gap: 12px; }
        .ka-result-card {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(99,102,241,0.15);
          border-radius: 12px; padding: 14px 16px;
        }
        .ka-result-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .ka-result-cat  { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .ka-result-score{ margin-left: auto; font-size: 12px; font-weight: 700; }
        .ka-result-text { color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 8px; }
        .ka-result-meta { font-size: 11px; color: #475569; }

        .ka-list-header  { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .ka-badge {
          background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3);
          color: #a5b4fc; border-radius: 20px; padding: 3px 12px; font-size: 12px;
        }
        .ka-entries { display: flex; flex-direction: column; gap: 10px; }
        .ka-entry-card {
          background: rgba(255,255,255,0.04); border-radius: 10px;
          padding: 12px 16px; transition: .2s;
        }
        .ka-entry-card:hover { background: rgba(255,255,255,0.06); }
        .ka-entry-top   { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .ka-entry-cat   { font-size: 11px; font-weight: 600; }
        .ka-entry-source{ font-size: 11px; color: #475569; margin-left: auto; }
        .ka-entry-delete{
          background: none; border: none; color: #475569; cursor: pointer; padding: 2px; transition: .2s;
        }
        .ka-entry-delete:hover { color: #F87171; }
        .ka-entry-text  { color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0 0 6px; }
        .ka-entry-id    { font-size: 10px; color: #334155; font-family: monospace; }

        .ka-loading { display: flex; align-items: center; gap: 12px; color: #64748b; padding: 40px; }
        .ka-empty   {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 60px; color: #64748b; text-align: center;
        }

        /* ── Responsive ──────────────────────────────────── */
        @media (max-width: 768px) {
          .ka-body     { flex-direction: column; }
          .ka-sidebar  { width: 100%; flex-direction: row; overflow-x: auto; padding: 12px; border-right: none; border-bottom: 1px solid rgba(99,102,241,0.15); }
          .ka-legend   { display: none; }
          .ka-tab      { white-space: nowrap; flex-shrink: 0; }
          .ka-row      { grid-template-columns: 1fr; }
          .ka-main     { padding: 16px; }
          .ka-header   { padding: 12px 16px; }
          .ka-stats-pill span { display: none; }
        }
      `}</style>
    </div>
  );
}