import React, { useState } from 'react';
import { TEMPLATE_META } from '../../utils/diagramTemplates';
import {
  exportToJSON, exportToSVG, exportToPNG,
  exportToMarkdown, importFromJSON, generateShareLink,
} from '../../utils/exportUtils';

// ── Sub-components ────────────────────────────────────────────
const ToolButton = ({ icon, label, onClick, active, danger, disabled, highlight, pulse }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={label}
    style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '6px 9px', borderRadius: 10, border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: active
        ? 'rgba(110,231,247,0.14)'
        : highlight
          ? 'rgba(167,139,250,0.12)'
          : 'transparent',
      color: danger
        ? '#F87171'
        : highlight
          ? '#A78BFA'
          : active
            ? '#6EE7F7'
            : '#7d8fa5',
      fontSize: 10, fontWeight: 600,
      transition: 'all 0.18s', minWidth: 42,
      opacity: disabled ? 0.35 : 1,
      outline: active
        ? '1px solid rgba(110,231,247,0.35)'
        : highlight
          ? '1px solid rgba(167,139,250,0.3)'
          : 'none',
      fontFamily: "'Space Grotesk', Syne, sans-serif",
      position: 'relative',
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.065)'; }}
    onMouseLeave={e => {
      e.currentTarget.style.background = active
        ? 'rgba(110,231,247,0.14)'
        : highlight ? 'rgba(167,139,250,0.12)' : 'transparent';
    }}
  >
    {pulse && (
      <span style={{
        position: 'absolute', top: 4, right: 4,
        width: 6, height: 6, borderRadius: '50%',
        background: '#A78BFA',
        boxShadow: '0 0 8px #A78BFA',
        animation: 'pulse-dot 1.5s ease-in-out infinite',
      }} />
    )}
    <span style={{ fontSize: 16 }}>{icon}</span>
    <span style={{ whiteSpace: 'nowrap', letterSpacing: 0.2 }}>{label}</span>
  </button>
);

const Divider = () => (
  <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.07)', margin: '0 2px', flexShrink: 0 }} />
);

const InlineToast = ({ msg, visible }) => (
  <div style={{
    position: 'absolute', top: 'calc(100% + 10px)', left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(8,8,22,0.97)',
    border: '1px solid rgba(167,139,250,0.35)',
    borderRadius: 30, padding: '8px 18px',
    fontSize: 12, color: '#e2e8f0',
    whiteSpace: 'nowrap', pointerEvents: 'none',
    opacity: visible ? 1 : 0,
    transition: 'opacity 0.22s',
    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
    zIndex: 9999,
  }}>{msg}</div>
);

// ── AI Generate Panel ─────────────────────────────────────────
function AIPanel({ onGenerate, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const presets = [
    'Causes de la déforestation en Côte d\'Ivoire',
    'Analyse SWOT d\'une startup fintech',
    'Processus de développement logiciel agile',
    'Stratégies de réduction des coûts en entreprise',
    'Impact du changement climatique sur l\'agriculture',
  ];

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    try {
      await onGenerate(prompt);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 12px)', left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(8,8,22,0.98)',
      border: '1px solid rgba(167,139,250,0.3)',
      borderRadius: 16, padding: 18,
      width: 380, zIndex: 300,
      boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 40px rgba(167,139,250,0.08)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>✨</span>
          <div>
            <div style={{ color: '#A78BFA', fontWeight: 700, fontSize: 13 }}>NovaMind AI</div>
            <div style={{ color: '#475569', fontSize: 10 }}>Génère un diagramme depuis votre texte</div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#475569',
          cursor: 'pointer', fontSize: 18, lineHeight: 1,
        }}>×</button>
      </div>

      {/* Textarea */}
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
        placeholder="Ex: Analyse les causes principales du fort taux d'abandon scolaire en milieu rural..."
        rows={4}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(167,139,250,0.25)',
          borderRadius: 10, padding: '10px 12px',
          color: '#e2e8f0', fontSize: 13, resize: 'vertical',
          outline: 'none', boxSizing: 'border-box',
          fontFamily: 'inherit', lineHeight: 1.55,
          marginBottom: 12,
        }}
      />

      {/* Presets */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#475569', fontSize: 10, fontWeight: 600, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
          Exemples rapides
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {presets.map(p => (
            <button key={p} onClick={() => setPrompt(p)}
              style={{
                padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(167,139,250,0.2)',
                background: 'rgba(167,139,250,0.08)', color: '#94a3b8',
                fontSize: 11, cursor: 'pointer', transition: 'all .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#A78BFA'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.45)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.2)'; }}
            >
              {p.length > 35 ? p.slice(0, 32) + '…' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!prompt.trim() || loading}
        style={{
          width: '100%', padding: '11px 0',
          borderRadius: 10, border: 'none',
          background: loading || !prompt.trim()
            ? 'rgba(167,139,250,0.15)'
            : 'linear-gradient(135deg, rgba(167,139,250,0.9), rgba(110,231,247,0.7))',
          color: loading || !prompt.trim() ? '#475569' : '#0a0a1e',
          fontWeight: 700, fontSize: 13, cursor: !prompt.trim() || loading ? 'not-allowed' : 'pointer',
          transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {loading ? (
          <>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
            Génération en cours…
          </>
        ) : (
          <><span>✨</span> Générer le diagramme</>
        )}
      </button>
      <div style={{ color: '#334155', fontSize: 10, textAlign: 'center', marginTop: 8 }}>Ctrl+Enter pour générer rapidement</div>
    </div>
  );
}

// ── Main Toolbar ──────────────────────────────────────────────
export function Toolbar({
  onAddNode, onDelete, onUndo, onRedo,
  canUndo, canRedo,
  selected, nodes,
  loadTemplate, diagramMode,
  exportData, importData,
  showGrid, onToggleGrid,
  onZoomFit, onResetView,
  onClearAll,
  zoom, onZoom,
  svgRef,
  onAIGenerate,
}) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [showExport,    setShowExport]    = useState(false);
  const [showAI,        setShowAI]        = useState(false);
  const [exporting,     setExporting]     = useState(false);
  const [toastMsg,      setToastMsg]      = useState('');
  const [toastVisible,  setToastVisible]  = useState(false);

  const toast = (msg) => {
    setToastMsg(msg); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2400);
  };
  const closeAll = () => { setShowTemplates(false); setShowExport(false); setShowAI(false); };

  const handleExportPNG = async () => {
    if (!svgRef?.current) { toast('❌ Canvas SVG introuvable'); return; }
    setExporting(true); closeAll();
    try {
      await exportToPNG(svgRef.current, 'novamind.png', 2);
      toast('✅ PNG exporté !');
    } catch { toast('❌ Erreur export PNG'); }
    finally { setExporting(false); }
  };

  return (
    <div style={{
      position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 100, display: 'flex', alignItems: 'center', gap: 0,
      background: 'rgba(8,8,22,0.95)',
      backdropFilter: 'blur(24px)',
      border: '1px solid rgba(110,231,247,0.12)',
      borderRadius: 14, padding: '4px 6px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
    }}>

      {/* Node actions */}
      <ToolButton icon="➕" label="Ajouter" onClick={() => selected && onAddNode(selected)} disabled={!selected} />
      <ToolButton icon="🗑️" label="Suppr." onClick={onDelete} disabled={!selected} danger />

      <Divider />

      {/* Templates */}
      <div style={{ position: 'relative' }}>
        <ToolButton icon="📐" label="Templates"
          onClick={() => { setShowTemplates(p => !p); setShowExport(false); setShowAI(false); }}
          active={showTemplates} />
        {showTemplates && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 12px)', left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(8,8,22,0.99)',
            border: '1px solid rgba(110,231,247,0.18)',
            borderRadius: 16, padding: 10, minWidth: 280,
            boxShadow: '0 24px 70px rgba(0,0,0,0.9)', zIndex: 200,
          }}>
            <div style={{ color: '#6EE7F7', fontSize: 10, fontWeight: 700, padding: '3px 10px 10px', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              📐 Types de diagrammes
            </div>
            {Object.entries(TEMPLATE_META).map(([key, meta]) => (
              <button key={key}
                onClick={() => { loadTemplate(key); setShowTemplates(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: diagramMode === key ? `rgba(${hexToRgb(meta.color || '#6EE7F7')},0.12)` : 'transparent',
                  color: diagramMode === key ? meta.color || '#6EE7F7' : '#cbd5e1',
                  fontSize: 13, textAlign: 'left', transition: 'all .15s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = diagramMode === key ? `rgba(${hexToRgb(meta.color || '#6EE7F7')},0.12)` : 'transparent'}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: `rgba(${hexToRgb(meta.color || '#6EE7F7')},0.14)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>{meta.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>{meta.desc}</div>
                </div>
                {diagramMode === key && (
                  <span style={{ marginLeft: 'auto', fontSize: 14, color: meta.color || '#6EE7F7', flexShrink: 0 }}>✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* AI Generate */}
      <div style={{ position: 'relative' }}>
        <ToolButton icon="✨" label="AI" highlight pulse
          onClick={() => { setShowAI(p => !p); setShowTemplates(false); setShowExport(false); }}
          active={showAI} />
        {showAI && (
          <AIPanel
            onGenerate={onAIGenerate || (() => {})}
            onClose={() => setShowAI(false)}
          />
        )}
      </div>

      <Divider />

      {/* History */}
      <ToolButton icon="↩" label="Annuler" onClick={onUndo} disabled={!canUndo} />
      <ToolButton icon="↪" label="Rétablir" onClick={onRedo} disabled={!canRedo} />

      <Divider />

      {/* View */}
      <ToolButton icon="⊞" label="Fit" onClick={onZoomFit} />
      <ToolButton icon="⌖" label="Reset" onClick={onResetView} />
      <ToolButton icon={showGrid ? '▦' : '▢'} label="Grille" onClick={onToggleGrid} active={showGrid} />

      <Divider />

      {/* Zoom */}
      <ToolButton icon="⊕" label="Zoom+" onClick={() => onZoom(1)} />
      <ToolButton icon="⊖" label="Zoom-" onClick={() => onZoom(-1)} />
      <div style={{
        padding: '2px 8px', borderRadius: 6,
        background: 'rgba(255,255,255,0.04)',
        color: '#64748b', fontSize: 10, fontWeight: 700,
        fontFamily: 'monospace', minWidth: 38, textAlign: 'center',
      }}>
        {Math.round((zoom || 1) * 100)}%
      </div>

      <Divider />

      {/* Share */}
      <ToolButton icon="🔗" label="Partager" highlight
        onClick={() => {
          const url = generateShareLink(exportData());
          if (url) toast('🔗 Lien copié !'); else toast('❌ Erreur lien');
          closeAll();
        }} />

      {/* Export */}
      <div style={{ position: 'relative' }}>
        <ToolButton icon={exporting ? '⏳' : '💾'} label="Export"
          onClick={() => { setShowExport(p => !p); setShowTemplates(false); setShowAI(false); }}
          active={showExport} disabled={exporting} />
        {showExport && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 12px)', right: 0,
            background: 'rgba(8,8,22,0.99)',
            border: '1px solid rgba(110,231,247,0.18)',
            borderRadius: 16, padding: 10, minWidth: 220,
            boxShadow: '0 24px 70px rgba(0,0,0,0.9)', zIndex: 200,
          }}>
            {[
              { icon: '🖼️', label: 'Image PNG (×2)',  fn: handleExportPNG, hi: true },
              { icon: '📐', label: 'Fichier SVG',     fn: () => { exportToSVG(svgRef?.current, 'novamind.svg'); toast('✅ SVG exporté !'); closeAll(); } },
              { icon: '📄', label: 'Données JSON',    fn: () => { exportToJSON(exportData(), 'novamind.json'); toast('✅ JSON exporté !'); closeAll(); } },
              { icon: '📝', label: 'Markdown',        fn: () => { const d = exportData(); exportToMarkdown(d.nodes, d.edges); toast('✅ MD exporté !'); closeAll(); } },
            ].map(item => (
              <button key={item.label} onClick={item.fn}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: item.hi ? 'rgba(110,231,247,0.06)' : 'transparent',
                  color: item.hi ? '#6EE7F7' : '#cbd5e1',
                  fontSize: 13, textAlign: 'left', fontFamily: 'inherit', transition: 'background .12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                onMouseLeave={e => e.currentTarget.style.background = item.hi ? 'rgba(110,231,247,0.06)' : 'transparent'}
              >
                <span style={{ fontSize: 17 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '6px 0' }} />
            <button
              onClick={() => { importFromJSON(importData); closeAll(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: 'transparent', color: '#94a3b8', fontSize: 13,
                textAlign: 'left', fontFamily: 'inherit',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 17 }}>📂</span> Ouvrir JSON
            </button>
          </div>
        )}
      </div>

      {/* Clear */}
      <ToolButton icon="⟳" label="Vider" onClick={onClearAll} danger />

      <InlineToast msg={toastMsg} visible={toastVisible} />

      <style>{`
        @keyframes pulse-dot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.75); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '110,231,247';
}
