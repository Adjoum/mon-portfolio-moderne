import React from 'react';
import { TEMPLATE_META } from '../../utils/diagramTemplates';

export function StatusBar({ nodes, edges, selected, viewport, diagramMode }) {
  const nodeCount  = Object.keys(nodes).length;
  const edgeCount  = edges.length;
  const selectedNode = selected ? nodes[selected] : null;
  const meta = TEMPLATE_META[diagramMode];

  return (
    <div style={{
      position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 16,
      background: 'rgba(8,8,22,0.9)', backdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.055)', borderRadius: 30,
      padding: '5px 18px', fontSize: 11, color: '#475569',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      zIndex: 80,
      fontFamily: "'Space Mono', monospace",
    }}>
      <Stat icon="◉" value={nodeCount} label="nœuds" />
      <Sep />
      <Stat icon="⟿" value={edgeCount} label="liens" />
      <Sep />
      <Stat icon="🔭" value={`${Math.round(viewport.scale * 100)}%`} label="" />
      <Sep />
      {/* Diagram mode badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        color: meta?.color || '#6EE7F7',
        fontWeight: 700, fontSize: 10,
        letterSpacing: 0.5,
      }}>
        <span>{meta?.icon || '🧠'}</span>
        <span>{meta?.label || diagramMode}</span>
      </div>
      {selectedNode && (
        <>
          <Sep />
          <div style={{
            color: '#94a3b8', maxWidth: 150,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ color: selectedNode.color, fontSize: 12 }}>◆</span>
            <span style={{ color: selectedNode.color, fontWeight: 600 }}>
              {selectedNode.label?.slice(0, 22)}{selectedNode.label?.length > 22 ? '…' : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const Stat = ({ icon, value, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <span style={{ opacity: 0.4, fontSize: 10 }}>{icon}</span>
    <span style={{ color: '#94a3b8', fontWeight: 700 }}>{value}</span>
    {label && <span style={{ fontSize: 10 }}>{label}</span>}
  </div>
);

const Sep = () => (
  <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.07)' }} />
);
