// src/components/mindmap/CanvasBackground.jsx
// Rend le fond du canvas (points / grille / lignes / carreaux / aucun)
// sur un <canvas> HTML 2D — zéro nœud React DOM, 60fps garanti.
import React, { useRef, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';

const GRID = 40;

export const CanvasBackground = React.memo(function CanvasBackground({ viewport, width, height }) {
  const canvasRef = useRef(null);
  const { bgMode, palette } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bgMode === 'none') return;
    const ctx = canvas.getContext('2d');
    const { x: vx, y: vy, scale: s } = viewport;
    ctx.clearRect(0, 0, width, height);

    const step = GRID * s;
    if (step < 6) return;

    const ox = ((vx % step) + step) % step;
    const oy = ((vy % step) + step) % step;

    switch (bgMode) {

      case 'dots': {
        const r = Math.max(0.7, 1.1 * s);
        ctx.fillStyle = palette.gridDot;
        for (let x = ox; x < width; x += step)
          for (let y = oy; y < height; y += step) {
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
          }
        break;
      }

      case 'grid': {
        ctx.strokeStyle = palette.gridLine;
        ctx.lineWidth   = Math.max(0.4, 0.6 * s);
        ctx.beginPath();
        for (let x = ox; x < width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = oy; y < height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();
        break;
      }

      case 'lines': {
        // Horizontal lines only — like a ruled notebook
        ctx.strokeStyle = palette.gridLine;
        ctx.lineWidth   = Math.max(0.4, 0.5 * s);
        ctx.beginPath();
        for (let y = oy; y < height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();
        break;
      }

      case 'chess': {
        // Alternating filled squares — like millimeter paper
        const sz   = step;
        const col1 = palette.gridDot;
        const col2 = palette.gridLine;
        let row = 0;
        for (let y = oy - sz; y < height + sz; y += sz, row++) {
          let col = row % 2;
          for (let x = ox - sz; x < width + sz; x += sz, col++) {
            ctx.fillStyle = col % 2 === 0 ? col1 : col2;
            ctx.fillRect(x, y, sz, sz);
          }
        }
        break;
      }

      default: break;
    }
  }, [viewport, width, height, bgMode, palette]);

  if (bgMode === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
});
