// src/components/mindmap/IshikawaOverlay.jsx
// Épine Ishikawa data-driven.
// Règle : le nœud "effet" DOIT avoir isEffect:true dans le template.
// L'overlay ne touche PAS aux arêtes normales — il dessine par-dessus.

import React from 'react';

export const IshikawaOverlay = React.memo(function IshikawaOverlay({ nodes, edges, viewport }) {
  const { scale: s, x: vx, y: vy } = viewport;
  const nodeList = Object.values(nodes);

  // ── Trouver le nœud effet ─────────────────────────────────
  // Priorité : isEffect > (isRoot ET connecté par des arêtes depuis plusieurs nœuds)
  let effectNode = nodeList.find(n => n.isEffect);
  if (!effectNode) {
    // Fallback : le nœud avec le plus d'arêtes entrantes qui a isRoot
    effectNode = nodeList.find(n => n.isRoot);
  }
  if (!effectNode) return null;

  // Centre et bord gauche du nœud effet
  const eLeft = effectNode.x * s + vx;
  const ecy   = effectNode.y * s + vy + (effectNode.height || 80) * s / 2;

  // ── Catégories = nœuds directement reliés au nœud effet ──
  const catIds = new Set(
    edges
      .filter(e => e.to === effectNode.id || e.from === effectNode.id)
      .map(e => e.to === effectNode.id ? e.from : e.to)
      .filter(id => id !== effectNode.id)
  );
  const categories = [...catIds].map(id => nodes[id]).filter(Boolean);
  if (!categories.length) return null;

  // Début de l'épine : 80px à gauche du nœud le plus à gauche
  const leftmost  = Math.min(...categories.map(n => n.x * s + vx));
  const spineX0   = Math.min(leftmost - 80 * s, eLeft - 120 * s);
  const spineX1   = eLeft;     // bord gauche du nœud effet
  const spineY    = ecy;       // hauteur de l'épine = centre Y de l'effet

  // Sous-causes par catégorie
  const subsOf = (catId) => edges
    .filter(e =>
      (e.from === catId || e.to === catId) &&
      e.from !== effectNode.id && e.to !== effectNode.id
    )
    .map(e => e.to === catId ? e.from : e.to)
    .filter(id => id !== catId && nodes[id])
    .map(id => nodes[id]);

  const SPINE = '#c084fc';

  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        <marker id="ishi-head" markerWidth="10" markerHeight="10"
          refX="9" refY="4" orient="auto">
          <path d="M0 0 L0 8 L10 4Z" fill={SPINE} />
        </marker>
        <filter id="ishi-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={1.8 * s} result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* ── Épine dorsale ─────────────────────────────────── */}
      <line
        x1={spineX0} y1={spineY}
        x2={spineX1} y2={spineY}
        stroke={SPINE}
        strokeWidth={4 * s}
        markerEnd="url(#ishi-head)"
        filter="url(#ishi-glow)"
      />

      {/* ── Branches catégories ───────────────────────────── */}
      {categories.map(cat => {
        const ccx  = cat.x * s + vx + (cat.width  || 175) * s / 2;
        const ccy  = cat.y * s + vy + (cat.height ||  64) * s / 2;
        // Point de jonction sur l'épine (même abscisse que le centre de la catégorie)
        const jx   = ccx;
        const jy   = spineY;
        const subs = subsOf(cat.id);
        const bc   = cat.color || SPINE;

        return (
          <g key={cat.id}>
            {/* Branche principale catégorie → jonction épine */}
            <line
              x1={ccx} y1={ccy} x2={jx} y2={jy}
              stroke={bc}
              strokeWidth={2.8 * s}
              opacity={0.9}
              style={{ filter: `drop-shadow(0 0 ${2.5 * s}px ${bc}99)` }}
            />

            {/* Sous-causes → point sur la branche principale */}
            {subs.map((sub, i) => {
              const sx2 = sub.x * s + vx + (sub.width  || 128) * s / 2;
              const sy2 = sub.y * s + vy + (sub.height ||  46) * s / 2;
              // Paramètre sur la branche (0 = cat, 1 = épine)
              const t   = Math.min(0.70, 0.18 + i * 0.20);
              const mx  = ccx + (jx - ccx) * t;
              const my  = ccy + (jy - ccy) * t;
              return (
                <line key={sub.id}
                  x1={sx2} y1={sy2} x2={mx} y2={my}
                  stroke={bc}
                  strokeWidth={1.7 * s}
                  opacity={0.65}
                  strokeDasharray={`${4.5 * s} ${2.5 * s}`}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
});
