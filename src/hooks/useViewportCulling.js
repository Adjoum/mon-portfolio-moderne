// src/hooks/useViewportCulling.js
// ─────────────────────────────────────────────────────────────
//  Filtre les nœuds et arêtes hors de l'écran.
//  Amélioration de perf majeure pour les grands graphes (100+ nœuds).
//  Marge de 200px pour éviter le pop-in lors du panoramique.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';

const MARGIN = 200; // px de marge au-delà de l'écran

export function useViewportCulling(nodes, edges, viewport, containerW, containerH) {
  const visibleNodes = useMemo(() => {
    const { x: vx, y: vy, scale: s } = viewport;

    // Bounds de l'écran en coordonnées monde
    const worldLeft   = (-vx - MARGIN) / s;
    const worldTop    = (-vy - MARGIN) / s;
    const worldRight  = (containerW - vx + MARGIN) / s;
    const worldBottom = (containerH - vy + MARGIN) / s;

    const visible = {};
    for (const [id, node] of Object.entries(nodes)) {
      const nRight  = node.x + (node.width  || 160);
      const nBottom = node.y + (node.height || 60);
      if (
        nRight  >= worldLeft  &&
        node.x  <= worldRight &&
        nBottom >= worldTop   &&
        node.y  <= worldBottom
      ) {
        visible[id] = node;
      }
    }
    return visible;
  }, [nodes, viewport, containerW, containerH]);

  const visibleEdges = useMemo(() => {
    // An edge is visible if at least one of its endpoints is visible
    const visibleIds = new Set(Object.keys(visibleNodes));
    return edges.filter(e => visibleIds.has(e.from) || visibleIds.has(e.to));
  }, [edges, visibleNodes]);

  return { visibleNodes, visibleEdges };
}
