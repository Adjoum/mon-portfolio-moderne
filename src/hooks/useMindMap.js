// src/hooks/useMindMap.js  — NovaMind v3.1
// Fix 1: histIdx in useRef → no stale-closure race in pushHistory
// Fix 2: updateNode({ commit: true }) for drag-end history commit
// Fix 3: isEffect awareness (does not block delete unlike isRoot)

import { useState, useCallback, useRef } from 'react';
import { DIAGRAM_TEMPLATES } from '../utils/diagramTemplates';

const COLORS = [
  '#6EE7F7','#A78BFA','#F472B6','#34D399',
  '#FBBF24','#F87171','#60A5FA','#C084FC',
  '#FB923C','#4ADE80',
];

let _counter = 1000;
const genId = () => `n${++_counter}_${Date.now().toString(36)}`;

const createNode = (x, y, label = 'Nouvelle idée', color = COLORS[0], extra = {}) => ({
  id: genId(), x, y, label, color,
  width:  extra.width  || 160,
  height: extra.height || 60,
  collapsed: false, notes: '', tags: [], priority: 'normal', icon: '💡',
  ...extra,
});

export function useMindMap() {
  const [nodes, setNodes] = useState(() => {
    const root = createNode(window.innerWidth/2 - 100, window.innerHeight/2 - 40,
      'Idée Centrale', '#6EE7F7', { isRoot: true, width: 200, height: 80, icon: '🧠' });
    return { [root.id]: root };
  });
  const [edges,        setEdges]        = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [editingId,    setEditingId]    = useState(null);
  const [diagramMode,  setDiagramMode]  = useState('mind');
  const [showGrid,     setShowGrid]     = useState(true);

  // ── History — ref-based to avoid stale closures ───────────
  const histRef    = useRef([]);
  const histIdxRef = useRef(-1);
  const [histDisplay, setHistDisplay] = useState({ len: 0, pos: -1 });

  const syncHist = () => setHistDisplay({ len: histRef.current.length, pos: histIdxRef.current });

  const pushHistory = useCallback((ns, es) => {
    const snap = JSON.stringify({ nodes: ns, edges: es });
    histRef.current = histRef.current.slice(0, histIdxRef.current + 1);
    histRef.current.push(snap);
    if (histRef.current.length > 80) histRef.current.shift();
    histIdxRef.current = histRef.current.length - 1;
    syncHist();
  }, []);

  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    const s = JSON.parse(histRef.current[histIdxRef.current]);
    setNodes(s.nodes); setEdges(s.edges);
    setSelected(null); setSelectedEdge(null);
    syncHist();
  }, []);

  const redo = useCallback(() => {
    if (histIdxRef.current >= histRef.current.length - 1) return;
    histIdxRef.current++;
    const s = JSON.parse(histRef.current[histIdxRef.current]);
    setNodes(s.nodes); setEdges(s.edges);
    syncHist();
  }, []);

  // ── Nodes ─────────────────────────────────────────────────
  const addNode = useCallback((parentId, overrides = {}) => {
    const parent = nodes[parentId];
    if (!parent) return;
    const angle    = Math.random() * Math.PI * 2;
    const dist     = 220 + Math.random() * 80;
    const colorIdx = Object.keys(nodes).length % COLORS.length;
    const child    = createNode(
      parent.x + Math.cos(angle) * dist,
      parent.y + Math.sin(angle) * dist,
      overrides.label || 'Sous-idée', COLORS[colorIdx], overrides
    );
    const newEdge = { id: `e${genId()}`, from: parentId, to: child.id, style: 'curve' };
    const ns = { ...nodes, [child.id]: child };
    const es = [...edges, newEdge];
    setNodes(ns); setEdges(es); setSelected(child.id);
    pushHistory(ns, es);
    setTimeout(() => setEditingId(child.id), 50);
  }, [nodes, edges, pushHistory]);

  // opts.commit = true → call this once at drag-end to record history
  const updateNode = useCallback((id, changes, opts = {}) => {
    setNodes(prev => {
      const updated = { ...prev, [id]: { ...prev[id], ...changes } };
      if (opts.commit) {
        setEdges(es => { pushHistory(updated, es); return es; });
      }
      return updated;
    });
  }, [pushHistory]);

  const deleteNode = useCallback((id) => {
    // isRoot = centre mindmap (non-deletable), isEffect = Ishikawa effect (deletable)
    if (!nodes[id] || nodes[id].isRoot) return;
    const ns = { ...nodes };
    delete ns[id];
    const es = edges.filter(e => e.from !== id && e.to !== id);
    setNodes(ns); setEdges(es); setSelected(null);
    pushHistory(ns, es);
  }, [nodes, edges, pushHistory]);

  // ── Edges ─────────────────────────────────────────────────
  const connectNodes = useCallback((fromId, toId) => {
    if (fromId === toId) return;
    const exists = edges.find(e =>
      (e.from===fromId && e.to===toId)||(e.from===toId && e.to===fromId));
    if (exists) return;
    const es = [...edges, { id: `e${genId()}`, from: fromId, to: toId, style: 'curve' }];
    setEdges(es); pushHistory(nodes, es);
  }, [edges, nodes, pushHistory]);

  const deleteEdge = useCallback((edgeId) => {
    const es = edges.filter(e => e.id !== edgeId);
    setEdges(es); setSelectedEdge(null); pushHistory(nodes, es);
  }, [edges, nodes, pushHistory]);

  const changeEdgeStyle = useCallback((edgeId, style) => {
    const es = edges.map(e => e.id === edgeId ? { ...e, style } : e);
    setEdges(es); pushHistory(nodes, es);
  }, [edges, nodes, pushHistory]);

  // ── Templates ─────────────────────────────────────────────
  const loadTemplate = useCallback((key) => {
    const tpl = DIAGRAM_TEMPLATES[key];
    if (!tpl) return;
    const { nodes: ns, edges: es } = tpl();
    setNodes(ns); setEdges(es);
    setSelected(null); setSelectedEdge(null);
    setDiagramMode(key); pushHistory(ns, es);
  }, [pushHistory]);

  // ── Import / Export ───────────────────────────────────────
  const exportData = useCallback(() => ({
    nodes, edges, diagramMode,
    meta: { exportedAt: new Date().toISOString(), version: '3.1' },
  }), [nodes, edges, diagramMode]);

  const importData = useCallback((data) => {
    if (!data?.nodes || !data?.edges) return;
    setNodes(data.nodes); setEdges(data.edges);
    if (data.diagramMode) setDiagramMode(data.diagramMode);
    setSelected(null); setSelectedEdge(null);
  }, []);

  const clearAll = useCallback(() => {
    const root = createNode(window.innerWidth/2-100, window.innerHeight/2-40,
      'Idée Centrale', '#6EE7F7', { isRoot: true, width: 200, height: 80, icon: '🧠' });
    const ns = { [root.id]: root };
    setNodes(ns); setEdges([]);
    setSelected(null); setSelectedEdge(null);
    setDiagramMode('mind'); pushHistory(ns, []);
  }, [pushHistory]);

  return {
    nodes, edges,
    selected, setSelected,
    selectedEdge, setSelectedEdge,
    editingId, setEditingId,
    diagramMode, setDiagramMode,
    showGrid, setShowGrid,
    addNode, updateNode, deleteNode,
    connectNodes, deleteEdge, changeEdgeStyle,
    loadTemplate, exportData, importData, clearAll,
    canUndo: histDisplay.pos > 0,
    canRedo: histDisplay.pos < histDisplay.len - 1,
    undo, redo, COLORS,
  };
}
