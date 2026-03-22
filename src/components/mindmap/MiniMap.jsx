import React, { useRef, useEffect } from 'react';

const MINIMAP_W = 180;
const MINIMAP_H = 120;

export function MiniMap({ nodes, edges, viewport, containerW, containerH, onViewportChange }) {
  const canvasRef = useRef(null);

  const nodeList = Object.values(nodes);
  if (!nodeList.length) return null;

  const minX = Math.min(...nodeList.map(n => n.x)) - 40;
  const maxX = Math.max(...nodeList.map(n => n.x + (n.width || 160))) + 40;
  const minY = Math.min(...nodeList.map(n => n.y)) - 40;
  const maxY = Math.max(...nodeList.map(n => n.y + (n.height || 60))) + 40;

  const worldW = maxX - minX;
  const worldH = maxY - minY;
  const scaleX = MINIMAP_W / worldW;
  const scaleY = MINIMAP_H / worldH;
  const miniScale = Math.min(scaleX, scaleY);

  const toMini = (x, y) => ({
    x: (x - minX) * miniScale + (MINIMAP_W - worldW * miniScale) / 2,
    y: (y - minY) * miniScale + (MINIMAP_H - worldH * miniScale) / 2,
  });

  // Viewport rect in minimap
  const vpWorldX = -viewport.x / viewport.scale;
  const vpWorldY = -viewport.y / viewport.scale;
  const vpWorldW = containerW / viewport.scale;
  const vpWorldH = containerH / viewport.scale;
  const vpMini = toMini(vpWorldX, vpWorldY);
  const vpMiniW = vpWorldW * miniScale;
  const vpMiniH = vpWorldH * miniScale;

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = (mx - (MINIMAP_W - worldW * miniScale) / 2) / miniScale + minX;
    const worldY = (my - (MINIMAP_H - worldH * miniScale) / 2) / miniScale + minY;
    onViewportChange({
      ...viewport,
      x: -(worldX * viewport.scale) + containerW / 2,
      y: -(worldY * viewport.scale) + containerH / 2,
    });
  };

  return (
    <div style={{
      position: 'absolute', bottom: 80, right: 16,
      width: MINIMAP_W, height: MINIMAP_H,
      background: 'rgba(10,10,26,0.88)',
      border: '1px solid rgba(110,231,247,0.15)',
      borderRadius: 10, overflow: 'hidden',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      cursor: 'pointer', zIndex: 80,
    }} onClick={handleClick}>
      <svg width={MINIMAP_W} height={MINIMAP_H} style={{ display: 'block' }}>
        {/* Edges */}
        {edges.map(edge => {
          const from = nodes[edge.from];
          const to = nodes[edge.to];
          if (!from || !to) return null;
          const f = toMini(from.x + (from.width || 160) / 2, from.y + (from.height || 60) / 2);
          const t = toMini(to.x + (to.width || 160) / 2, to.y + (to.height || 60) / 2);
          return (
            <line key={edge.id}
              x1={f.x} y1={f.y} x2={t.x} y2={t.y}
              stroke="rgba(110,231,247,0.2)" strokeWidth={1} />
          );
        })}

        {/* Nodes */}
        {nodeList.map(n => {
          const pos = toMini(n.x, n.y);
          const w = Math.max(4, (n.width || 160) * miniScale);
          const h = Math.max(3, (n.height || 60) * miniScale);
          return (
            <rect key={n.id}
              x={pos.x} y={pos.y} width={w} height={h}
              rx={2} fill={n.color} opacity={n.isRoot ? 0.9 : 0.6} />
          );
        })}

        {/* Viewport rect */}
        <rect
          x={vpMini.x} y={vpMini.y}
          width={Math.max(10, vpMiniW)} height={Math.max(8, vpMiniH)}
          fill="rgba(110,231,247,0.08)"
          stroke="rgba(110,231,247,0.6)"
          strokeWidth={1}
          rx={2}
        />
      </svg>
      <div style={{ position: 'absolute', bottom: 4, left: 6, fontSize: 9, color: '#334155', fontWeight: 600, letterSpacing: 1 }}>MINIMAP</div>
    </div>
  );
}
