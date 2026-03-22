// src/components/mindmap/GridCanvas.jsx
// ─────────────────────────────────────────────────────────────
//  Remplace renderGrid() SVG (O(n) DOM nodes) par un <canvas>
//  2D dessiné en une seule passe. Résultat : 0 nœud React,
//  60 fps stable même à faible zoom (800+ points sinon).
// ─────────────────────────────────────────────────────────────
import React, { useRef, useEffect, useCallback } from 'react';

const GRID_SIZE = 40;

export const GridCanvas = React.memo(function GridCanvas({ viewport, width, height }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x: vx, y: vy, scale: s } = viewport;

    // Clear
    ctx.clearRect(0, 0, width, height);

    const step = GRID_SIZE * s;
    if (step < 8) return; // too small to be useful

    const ox = ((vx % step) + step) % step;
    const oy = ((vy % step) + step) % step;

    ctx.fillStyle = `rgba(110,231,247,0.055)`;
    const r = Math.max(0.8, 1.2 * s);

    for (let x = ox; x < width; x += step) {
      for (let y = oy; y < height; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [viewport, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
});
