// src/components/mindmap/NodeCard.jsx  — NovaMind v3.2
// CRITICAL FIX: stopPropagation on ALL events so canvas mousedown
//               never deselects after the node was just selected.
// NEW: clicking a connection handle creates a new child node (not just starts a drag-connect)

import React, { useRef, useEffect, useState, useCallback } from 'react';

const PRIORITY_COLORS = {
  low: '#34D399', normal: '#6EE7F7', high: '#FBBF24', critical: '#F87171',
};

// ── Connection Handles ────────────────────────────────────────
const ConnectionHandles = React.memo(function ConnectionHandles({
  sx, sy, sw, sh, scale, nodeId, color, onConnectStart, onClickHandle,
}) {
  const r    = Math.max(5, 7 * scale);
  const half = Math.max(3, 4 * scale);

  const handles = [
    { id: 'e', cx: sx + sw,      cy: sy + sh / 2 },
    { id: 'w', cx: sx,           cy: sy + sh / 2 },
    { id: 's', cx: sx + sw / 2,  cy: sy + sh     },
    { id: 'n', cx: sx + sw / 2,  cy: sy          },
  ];

  return (
    <>
      {handles.map(h => (
        <g key={h.id}>
          {/* Large invisible hit area */}
          <circle cx={h.cx} cy={h.cy} r={r * 2.4} fill="transparent"
            style={{ cursor: 'crosshair' }}
            onMouseDown={(e) => {
              e.stopPropagation(); e.preventDefault();
              onConnectStart(nodeId, e, h.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Click (no drag) on a handle → create new connected node
              onClickHandle && onClickHandle(nodeId, h.id);
            }}
          />
          {/* Visual ring */}
          <circle cx={h.cx} cy={h.cy} r={r}
            fill={color}
            stroke="rgba(255,255,255,0.6)" strokeWidth={1.5 * scale}
            style={{ pointerEvents: 'none', filter: `drop-shadow(0 0 ${4*scale}px ${color})` }}
          />
          {/* Inner dot */}
          <circle cx={h.cx} cy={h.cy} r={r * 0.38}
            fill="white" opacity={0.85}
            style={{ pointerEvents: 'none' }}
          />
          {/* Plus sign hint */}
          <text x={h.cx} y={h.cy + half * 0.42} fontSize={half * 1.4}
            fill="white" textAnchor="middle" opacity={0.7}
            style={{ pointerEvents: 'none', userSelect: 'none', fontWeight: 700 }}>
            +
          </text>
        </g>
      ))}
    </>
  );
});

// ── NodeCard ──────────────────────────────────────────────────
export const NodeCard = React.memo(function NodeCard({
  node, isSelected, isEditing,
  viewport, diagramMode,
  onSelect, onEdit, onUpdate, onDragStart, onConnectStart,
  onClickHandle,  // NEW: (nodeId, handleId) → add child at that side
}) {
  const inputRef  = useRef(null);
  const [hovered, setHovered] = useState(false);
  const clickRef  = useRef(false); // prevents double-fire on drag

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const { scale: s, x: vx, y: vy } = viewport;
  const sx = node.x * s + vx;
  const sy = node.y * s + vy;
  const sw = (node.width  || 160) * s;
  const sh = (node.height ||  60) * s;

  const fontSize  = Math.max(8,  Math.min(14, 13 * s));
  const iconSize  = Math.max(11, Math.min(22, 20 * s));
  const isRoot    = node.isRoot;
  const isEffect  = node.isEffect;
  const rgb       = hexToRgb(node.color);
  const showHandles = (isSelected || hovered) && !isEditing;

  const rx = (isRoot || isEffect ? 16 : 12) * s;

  const handleMouseDown = useCallback((e) => {
    // CRITICAL: stopPropagation prevents canvas mousedown from running
    // its "deselect if clicking on rect" logic AFTER this selection.
    e.stopPropagation();
    clickRef.current = true;
    onSelect(node.id);
    onDragStart(node.id, e);
  }, [node.id, onSelect, onDragStart]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const handleDblClick = useCallback((e) => {
    e.stopPropagation();
    onEdit(node.id);
  }, [node.id, onEdit]);

  const truncatedLabel = truncate(node.label, sw, s, fontSize);

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Selection glow aura */}
      {isSelected && (
        <ellipse
          cx={sx + sw / 2} cy={sy + sh / 2}
          rx={sw * 0.66} ry={sh * 0.66}
          fill="none"
          stroke={node.color}
          strokeWidth={2.2 * s}
          opacity={0.22}
          style={{ filter: `blur(${7*s}px)`, pointerEvents: 'none' }}
        />
      )}

      {/* Hover ring */}
      {hovered && !isSelected && (
        <rect
          x={sx - 3*s} y={sy - 3*s}
          width={sw + 6*s} height={sh + 6*s}
          rx={rx + 3*s}
          fill="none"
          stroke={`rgba(${rgb},0.22)`}
          strokeWidth={3 * s}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* isEffect: dashed outer ring */}
      {isEffect && (
        <rect
          x={sx - 4*s} y={sy - 4*s}
          width={sw + 8*s} height={sh + 8*s}
          rx={rx + 4*s}
          fill="none"
          stroke={`rgba(${rgb},0.32)`}
          strokeWidth={1.8 * s}
          strokeDasharray={`${5*s} ${3*s}`}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* ── Main card rect ── */}
      <rect
        x={sx} y={sy} width={sw} height={sh} rx={rx}
        fill={
          isSelected
            ? `rgba(${rgb},0.20)`
            : isRoot || isEffect
              ? `rgba(${rgb},0.13)`
              : 'rgba(10,10,28,0.88)'
        }
        stroke={
          isSelected ? node.color
            : hovered  ? `rgba(${rgb},0.72)`
            : `rgba(${rgb},0.42)`
        }
        strokeWidth={(isSelected ? 2.2 : 1.5) * s}
        style={{
          cursor: 'grab',
          filter: isRoot || isEffect
            ? `drop-shadow(0 0 ${10*s}px rgba(${rgb},0.5))`
            : isSelected
              ? `drop-shadow(0 0 ${5*s}px rgba(${rgb},0.35))`
              : 'none',
          transition: 'stroke .14s',
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDblClick}
      />

      {/* Priority stripe */}
      {node.priority !== 'normal' && (
        <rect
          x={sx} y={sy} width={4*s} height={sh} rx={2*s}
          fill={PRIORITY_COLORS[node.priority] || node.color}
          opacity={0.85}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Icon */}
      {s > 0.3 && (
        <text
          x={sx + (isRoot || isEffect ? 18 : 13) * s}
          y={sy + sh / 2 + iconSize * 0.36}
          fontSize={iconSize}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {node.icon || '💡'}
        </text>
      )}

      {/* Label / inline edit */}
      {isEditing ? (
        <foreignObject
          x={sx + 36*s} y={sy + sh/2 - 14*s}
          width={sw - 50*s} height={28*s}
        >
          <input
            ref={inputRef}
            value={node.label}
            onChange={e => onUpdate(node.id, { label: e.target.value })}
            onBlur={() => onEdit(null)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Escape') onEdit(null);
              e.stopPropagation();
            }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: 'transparent',
              border: 'none', outline: 'none',
              color: node.color, fontSize,
              fontWeight: 600, fontFamily: 'Syne, sans-serif',
            }}
          />
        </foreignObject>
      ) : (
        <text
          x={sx + (s > 0.3 ? 36 : 8) * s}
          y={sy + sh / 2 + fontSize * 0.37}
          fontSize={fontSize}
          fontWeight={isRoot || isEffect ? 700 : 600}
          fill={isRoot || isEffect ? node.color : '#dde5f0'}
          fontFamily="Syne, sans-serif"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {truncatedLabel}
        </text>
      )}

      {/* Notes dot */}
      {node.notes && s > 0.45 && (
        <circle cx={sx + sw - 8*s} cy={sy + sh - 8*s}
          r={4*s} fill="#FBBF24" opacity={0.85}
          style={{ pointerEvents: 'none' }} />
      )}

      {/* Tags badge */}
      {node.tags?.length > 0 && s > 0.45 && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={sx + sw - 22*s} y={sy + 4*s}
            width={18*s} height={11*s} rx={5*s}
            fill={node.color} opacity={0.7} />
          <text x={sx + sw - 13*s} y={sy + 12*s}
            fontSize={7*s} fill="#0a0a1e" textAnchor="middle" fontWeight="800">
            {node.tags.length}
          </text>
        </g>
      )}

      {/* Connection handles — shown on hover or selection */}
      {showHandles && (
        <ConnectionHandles
          sx={sx} sy={sy} sw={sw} sh={sh}
          scale={s}
          nodeId={node.id}
          color={node.color}
          onConnectStart={onConnectStart}
          onClickHandle={onClickHandle}
        />
      )}
    </g>
  );
});

// ── Helpers ───────────────────────────────────────────────────
function truncate(str, nodeWidthPx, scale, fontSize) {
  if (!str) return '';
  const iconArea  = 38 * scale;
  const rightPad  = 14 * scale;
  const available = nodeWidthPx - iconArea - rightPad;
  const charW     = fontSize * 0.58;
  const maxChars  = Math.max(1, Math.floor(available / charW));
  if (str.length <= maxChars) return str;
  if (maxChars <= 2) return '…';
  return str.slice(0, maxChars - 1) + '…';
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '110,231,247';
}
