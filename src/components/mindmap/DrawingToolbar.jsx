// src/components/mindmap/DrawingToolbar.jsx
// Barre d'outils latérale gauche avec outils draggables dans le canvas.
// Chaque outil déposé crée un nœud ou une arête selon son type.

import React, { useState } from 'react';

export const TOOL_TYPES = {
  SELECT:   'select',
  RECT:     'rect',
  DIAMOND:  'diamond',
  TEXT:     'text',
  CIRCLE:   'circle',
  STICKY:   'sticky',
  ARROW:    'arrow',
  SPINE:    'spine',     // Épine Ishikawa
};

const TOOLS = [
  { type: TOOL_TYPES.SELECT,  icon: '↖',  label: 'Sélection',    group: 'nav' },
  { type: TOOL_TYPES.RECT,    icon: '▭',  label: 'Rectangle',    group: 'shape' },
  { type: TOOL_TYPES.DIAMOND, icon: '◇',  label: 'Losange',      group: 'shape' },
  { type: TOOL_TYPES.CIRCLE,  icon: '○',  label: 'Ellipse',      group: 'shape' },
  { type: TOOL_TYPES.TEXT,    icon: 'T',  label: 'Texte',        group: 'shape' },
  { type: TOOL_TYPES.STICKY,  icon: '📝', label: 'Note',         group: 'shape' },
  { type: TOOL_TYPES.ARROW,   icon: '→',  label: 'Flèche',       group: 'connect' },
  { type: TOOL_TYPES.SPINE,   icon: '🐟', label: 'Épine Ishi.', group: 'special' },
];

const SHAPE_DEFAULTS = {
  [TOOL_TYPES.RECT]:    { width: 160, height: 60,  icon: '💡', shape: 'rect'    },
  [TOOL_TYPES.DIAMOND]: { width: 160, height: 80,  icon: '◇',  shape: 'diamond' },
  [TOOL_TYPES.CIRCLE]:  { width: 120, height: 120, icon: '○',  shape: 'circle'  },
  [TOOL_TYPES.TEXT]:    { width: 140, height: 44,  icon: 'T',  shape: 'text',   label: 'Texte' },
  [TOOL_TYPES.STICKY]:  { width: 160, height: 100, icon: '📝', shape: 'sticky', label: 'Note' },
};

export function DrawingToolbar({ activeTool, onToolChange, onDropTool }) {
  const [draggingTool, setDraggingTool] = useState(null);

  const handleDragStart = (e, tool) => {
    setDraggingTool(tool);
    e.dataTransfer.setData('tool-type', tool.type);
    e.dataTransfer.effectAllowed = 'copy';
    // Custom ghost image
    const ghost = document.createElement('div');
    ghost.textContent = tool.icon;
    ghost.style.cssText = `
      position:fixed; top:-100px; left:-100px;
      width:44px; height:44px; display:flex;
      align-items:center; justify-content:center;
      border-radius:10px; font-size:22px;
      background:rgba(110,231,247,0.2);
      border:1px solid rgba(110,231,247,0.5);
    `;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 22, 22);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragEnd = () => setDraggingTool(null);

  const groups = [
    { key: 'nav',     label: null },
    { key: 'shape',   label: 'Formes' },
    { key: 'connect', label: 'Connexions' },
    { key: 'special', label: 'Spécial' },
  ];

  return (
    <div style={{
      position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
      zIndex: 90,
      display: 'flex', flexDirection: 'column', gap: 4,
      background: 'rgba(8,8,22,0.94)',
      border: '1px solid rgba(110,231,247,0.12)',
      borderRadius: 16, padding: '10px 8px',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    }}>
      {groups.map(group => {
        const groupTools = TOOLS.filter(t => t.group === group.key);
        if (!groupTools.length) return null;
        return (
          <React.Fragment key={group.key}>
            {group.label && (
              <div style={{
                fontSize: 9, color: '#334155', letterSpacing: 1,
                textTransform: 'uppercase', textAlign: 'center',
                padding: '4px 0 2px',
              }}>
                {group.label}
              </div>
            )}
            {groupTools.map(tool => (
              <ToolButton
                key={tool.type}
                tool={tool}
                isActive={activeTool === tool.type}
                isDragging={draggingTool?.type === tool.type}
                onClick={() => onToolChange(tool.type)}
                onDragStart={(e) => handleDragStart(e, tool)}
                onDragEnd={handleDragEnd}
              />
            ))}
            {group.key !== 'special' && (
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ToolButton({ tool, isActive, isDragging, onClick, onDragStart, onDragEnd }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      draggable
      title={`${tool.label} — glisser dans le canvas`}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 40, height: 40,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 2,
        border: isActive
          ? '1px solid rgba(110,231,247,0.5)'
          : '1px solid transparent',
        borderRadius: 10,
        background: isActive
          ? 'rgba(110,231,247,0.14)'
          : hovered
            ? 'rgba(255,255,255,0.07)'
            : 'transparent',
        color: isActive ? '#6EE7F7' : hovered ? '#e2e8f0' : '#64748b',
        cursor: isDragging ? 'grabbing' : 'grab',
        fontSize: 16,
        transition: 'all .15s',
        userSelect: 'none',
      }}
    >
      <span style={{ lineHeight: 1, fontFamily: tool.icon === 'T' || tool.icon === '→' || tool.icon === '↖' ? 'sans-serif' : 'inherit', fontWeight: tool.icon === 'T' ? 700 : 400 }}>
        {tool.icon}
      </span>
    </button>
  );
}

// Export defaults so Canvas can use them when a tool is dropped
export { SHAPE_DEFAULTS };
