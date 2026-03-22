import { useState, useRef, useCallback, useEffect } from 'react';

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.12;

export function useCanvas() {
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectionBox, setSelectionBox] = useState(null);

  const panStart = useRef(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const svgRef = useRef(null);

  const screenToWorld = useCallback((sx, sy) => {
    const v = viewportRef.current;
    return {
      x: (sx - v.x) / v.scale,
      y: (sy - v.y) / v.scale,
    };
  }, []);

  const worldToScreen = useCallback((wx, wy) => {
    const v = viewportRef.current;
    return {
      x: wx * v.scale + v.x,
      y: wy * v.scale + v.y,
    };
  }, []);

  const zoom = useCallback((delta, centerX, centerY) => {
    setViewport(prev => {
      const factor = delta > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP;
      const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.scale * factor));
      const scaleRatio = newScale / prev.scale;
      const cx = centerX ?? 0;
      const cy = centerY ?? 0;
      return {
        scale: newScale,
        x: cx - (cx - prev.x) * scaleRatio,
        y: cy - (cy - prev.y) * scaleRatio,
      };
    });
  }, []);

  const zoomToFit = useCallback((nodes, containerW, containerH) => {
    const nodeList = Object.values(nodes);
    if (!nodeList.length) return;

    const minX = Math.min(...nodeList.map(n => n.x));
    const maxX = Math.max(...nodeList.map(n => n.x + (n.width || 160)));
    const minY = Math.min(...nodeList.map(n => n.y));
    const maxY = Math.max(...nodeList.map(n => n.y + (n.height || 60)));

    const padding = 80;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const scaleX = containerW / contentW;
    const scaleY = containerH / contentH;
    const newScale = Math.max(ZOOM_MIN, Math.min(1.2, Math.min(scaleX, scaleY)));

    setViewport({
      scale: newScale,
      x: (containerW - contentW * newScale) / 2 - (minX - padding) * newScale,
      y: (containerH - contentH * newScale) / 2 - (minY - padding) * newScale,
    });
  }, []);

  const resetView = useCallback(() => {
    setViewport({ x: 0, y: 0, scale: 1 });
  }, []);

  const startPan = useCallback((e) => {
    panStart.current = {
      x: e.clientX - viewportRef.current.x,
      y: e.clientY - viewportRef.current.y,
    };
    setIsPanning(true);
  }, []);

  const updatePan = useCallback((e) => {
    const pan = panStart.current;
    if (!pan) return;
    const newX = e.clientX - pan.x;
    const newY = e.clientY - pan.y;
    setViewport(prev => ({ ...prev, x: newX, y: newY }));
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const endPan = useCallback(() => {
    panStart.current = null;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      zoom(-e.deltaY, cx, cy);
    };

    const el = svgRef.current;
    if (el) el.addEventListener('wheel', handleWheel, { passive: false });
    return () => { if (el) el.removeEventListener('wheel', handleWheel); };
  }, [zoom]);

  return {
    viewport, setViewport,
    isPanning, setIsPanning,
    isDraggingNode, setIsDraggingNode,
    connectingFrom, setConnectingFrom,
    mousePos, setMousePos,
    selectionBox, setSelectionBox,
    svgRef,
    screenToWorld, worldToScreen,
    zoom, zoomToFit, resetView,
    startPan, updatePan, endPan,
  };
}
