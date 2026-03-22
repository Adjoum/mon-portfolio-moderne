import React, { useState } from 'react';

const COLORS = [
  '#6EE7F7', '#A78BFA', '#F472B6', '#34D399',
  '#FBBF24', '#F87171', '#60A5FA', '#C084FC',
  '#FB923C', '#4ADE80', '#38BDF8', '#E879F9',
];

const ICONS = ['💡', '🧠', '⚠️', '✅', '❓', '🎯', '🚀', '💎', '🔧', '📊', '🌟', '⚡', '🔥', '💫', '🎨', '📌', '🏆', '📍'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];
const PRIORITY_LABELS = { low: '🟢 Faible', normal: '🔵 Normal', high: '🟡 Élevé', critical: '🔴 Critique' };

export function PropertiesPanel({ node, onUpdate, onDelete, onAddChild }) {
  const [tagInput, setTagInput] = useState('');

  if (!node) {
    return (
      <div style={{
        position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
        width: 220, background: 'rgba(10,10,26,0.7)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16,
        padding: 20, color: '#475569', fontSize: 13, textAlign: 'center',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🖱️</div>
        <div>Sélectionnez un nœud pour éditer ses propriétés</div>
        <div style={{ marginTop: 12, fontSize: 11, color: '#334155' }}>
          Double-clic pour renommer<br />
          Clic droit pour options
        </div>
      </div>
    );
  }

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || node.tags?.includes(tag)) return;
    onUpdate({ tags: [...(node.tags || []), tag] });
    setTagInput('');
  };

  const removeTag = (tag) => {
    onUpdate({ tags: node.tags.filter(t => t !== tag) });
  };

  return (
    <div style={{
      position: 'absolute', right: 16, top: 80,
      width: 240, background: 'rgba(10,10,26,0.92)',
      border: '1px solid rgba(110,231,247,0.12)', borderRadius: 16,
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      overflow: 'hidden', zIndex: 90,
    }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, rgba(${hexToRgb(node.color)},0.2), rgba(${hexToRgb(node.color)},0.05))`,
        borderBottom: `1px solid rgba(${hexToRgb(node.color)},0.2)`,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 22 }}>{node.icon}</span>
        <div>
          <div style={{ color: node.color, fontWeight: 700, fontSize: 13 }}>Propriétés</div>
          <div style={{ color: '#475569', fontSize: 11 }}>Nœud sélectionné</div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
        {/* Label */}
        <div>
          <Label>Libellé</Label>
          <input
            value={node.label}
            onChange={e => onUpdate({ label: e.target.value })}
            style={inputStyle}
          />
        </div>

        {/* Icon picker */}
        <div>
          <Label>Icône</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ICONS.map(ic => (
              <button key={ic} onClick={() => onUpdate({ icon: ic })}
                style={{
                  width: 32, height: 32, fontSize: 16, border: 'none', borderRadius: 8,
                  cursor: 'pointer', background: node.icon === ic ? 'rgba(110,231,247,0.2)' : 'rgba(255,255,255,0.04)',
                  outline: node.icon === ic ? '1px solid rgba(110,231,247,0.5)' : 'none',
                  transition: 'all 0.15s',
                }}>
                {ic}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <Label>Couleur</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => onUpdate({ color: c })}
                style={{
                  width: 26, height: 26, borderRadius: '50%', background: c,
                  border: node.color === c ? `3px solid white` : '3px solid transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: node.color === c ? `0 0 10px ${c}` : 'none',
                }} />
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <Label>Priorité</Label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {PRIORITIES.map(p => (
              <button key={p} onClick={() => onUpdate({ priority: p })}
                style={{
                  padding: '4px 10px', borderRadius: 20, border: 'none', fontSize: 11,
                  cursor: 'pointer', fontWeight: 500,
                  background: node.priority === p ? 'rgba(110,231,247,0.15)' : 'rgba(255,255,255,0.04)',
                  color: node.priority === p ? '#6EE7F7' : '#64748b',
                  outline: node.priority === p ? '1px solid rgba(110,231,247,0.3)' : 'none',
                }}>
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label>Notes</Label>
          <textarea
            value={node.notes || ''}
            onChange={e => onUpdate({ notes: e.target.value })}
            placeholder="Ajouter des notes..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', height: 'auto', lineHeight: 1.6 }}
          />
        </div>

        {/* Tags */}
        <div>
          <Label>Tags</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="Nouveau tag..."
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
            />
            <button onClick={addTag} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(110,231,247,0.15)', color: '#6EE7F7', cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>
          {node.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {node.tags.map(tag => (
                <span key={tag} style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11,
                  background: 'rgba(167,139,250,0.15)', color: '#A78BFA',
                  border: '1px solid rgba(167,139,250,0.3)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {tag}
                  <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Size */}
        <div>
          <Label>Taille</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#475569', fontSize: 10, marginBottom: 4 }}>Largeur</div>
              <input type="range" min={100} max={300} value={node.width || 160}
                onChange={e => onUpdate({ width: Number(e.target.value) })}
                style={{ width: '100%', accentColor: '#6EE7F7' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#475569', fontSize: 10, marginBottom: 4 }}>Hauteur</div>
              <input type="range" min={40} max={120} value={node.height || 60}
                onChange={e => onUpdate({ height: Number(e.target.value) })}
                style={{ width: '100%', accentColor: '#6EE7F7' }} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <button onClick={() => onAddChild(node.id)} style={actionBtn('#6EE7F7')}>
            ➕ Enfant
          </button>
          {!node.isRoot && (
            <button onClick={() => onDelete(node.id)} style={actionBtn('#F87171')}>
              🗑️ Suppr.
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const Label = ({ children }) => (
  <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
    {children}
  </div>
);

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const actionBtn = (color) => ({
  flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid rgba(${hexToRgb(color)},0.3)`,
  background: `rgba(${hexToRgb(color)},0.08)`, color, cursor: 'pointer', fontSize: 12, fontWeight: 600,
});

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}` : '110,231,247';
}
