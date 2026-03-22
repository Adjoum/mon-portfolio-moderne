// src/pages/MindMapPage.jsx — NovaMind v3.2 + AI
// Base : version v3.2 (DrawingToolbar, ThemeProvider, fix déselection, handle click)
// Ajout : génération de diagramme par IA (Claude API)
//   • clearAll() appelé AVANT injection → pas de superposition avec le diagramme précédent
//   • Overlay de chargement pendant la génération
//   • Toast d'erreur si l'API échoue
//   • onAIGenerate passé au Toolbar (bouton ✨ AI)

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useMindMap }         from '../hooks/useMindMap';
import { useCanvas }          from '../hooks/useCanvas';
import { Canvas }             from '../components/mindmap/Canvas';
import { Toolbar }            from '../components/mindmap/Toolbar';
import { MiniMap }            from '../components/mindmap/MiniMap';
import { StatusBar }          from '../components/mindmap/StatusBar';
import { PropertiesPanel }    from '../components/mindmap/PropertiesPanel';
import { DrawingToolbar, TOOL_TYPES, SHAPE_DEFAULTS } from '../components/mindmap/DrawingToolbar';
import { ThemePanel }         from '../components/mindmap/ThemePanel';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { loadFromShareLink, clearShareParam } from '../utils/exportUtils';

const DRAG_THRESHOLD = 3;

let _nodeIdCounter = 9000;
const genId = () => `u${++_nodeIdCounter}_${Date.now().toString(36)}`;

// ═══════════════════════════════════════════════════════════════
//  IA — Génération de diagramme via Claude API
// ═══════════════════════════════════════════════════════════════
//  • Prompt système strict : retourne UNIQUEMENT du JSON brut
//  • isEffect:true pour le nœud effet Ishikawa (jamais isRoot:true)
//  • IDs courts (n1, n2…) pour éviter les collisions
// ───────────────────────────────────────────────────────────────
/*const AI_SYSTEM = `Tu es un expert en diagrammes d'analyse (mind map, Ishikawa, SWOT, 5 Pourquoi…).
Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans \`\`\`json, sans commentaires.

Format EXACT — respecte chaque champ :
{
  "diagramType": "mind",
  "nodes": {
    "n1": {
      "id": "n1", "x": 600, "y": 400,
      "label": "Idée centrale", "color": "#6EE7F7",
      "width": 200, "height": 80, "icon": "🧠",
      "isRoot": true, "isEffect": false,
      "notes": "", "tags": [], "priority": "normal", "collapsed": false
    },
    "n2": {
      "id": "n2", "x": 350, "y": 250,
      "label": "Branche A", "color": "#A78BFA",
      "width": 160, "height": 60, "icon": "💡",
      "isRoot": false, "isEffect": false,
      "notes": "", "tags": [], "priority": "normal", "collapsed": false
    }
  },
  "edges": [
    { "id": "e1", "from": "n1", "to": "n2", "style": "curve", "dashed": false }
  ]
}

Règles :
- diagramType : "mind" | "ishikawa" | "swot" | "five_why" | "tree" | "concept"
- Ishikawa : nœud problème → isEffect:true, isRoot:false (JAMAIS isRoot:true pour Ishikawa)
  Les 6 catégories sont reliées directement au nœud problème par des arêtes.
- 8 à 14 nœuds selon la complexité
- Positions : x ∈ [100, 1200], y ∈ [80, 780]
- Couleurs : #6EE7F7 #A78BFA #F472B6 #34D399 #FBBF24 #F87171 #60A5FA #C084FC
- IDs : "n1", "n2"… et "e1", "e2"… (courts, sans espaces)
- Réponds UNIQUEMENT avec le JSON — rien avant, rien après.`;

async function aiGenerateDiagram(userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1400,
      system:     AI_SYSTEM,
      messages:   [{ role: 'user', content: `Génère un diagramme sur : ${userPrompt}` }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erreur API ${response.status}`);
  }

  const data = await response.json();
  // Extraire le texte brut de la réponse
  const raw   = (data.content || []).map(b => b.text || '').join('').trim();
  // Nettoyer d'éventuels backticks résiduels
  const clean = raw
  //  .replace(/^```[a-zA-Z]*\s*/ //i, '')
  //  .replace(/\s*```\s*$/i, '')
  //  .trim();

  /*const parsed = JSON.parse(clean);

  // Validation minimale
  if (!parsed.nodes || typeof parsed.nodes !== 'object')
    throw new Error('JSON invalide : champ "nodes" manquant');
  if (!Array.isArray(parsed.edges))
    throw new Error('JSON invalide : champ "edges" manquant');

  return parsed;
}  */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function aiGenerateDiagram(userPrompt) {
  const response = await fetch(`${API_URL}/api/groq/generate-diagram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: userPrompt }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `Erreur API ${response.status}`);
  }

  const parsed = await response.json();

  // Validation minimale
  if (!parsed.nodes || typeof parsed.nodes !== 'object')
    throw new Error('JSON invalide : champ "nodes" manquant');
  if (!Array.isArray(parsed.edges))
    throw new Error('JSON invalide : champ "edges" manquant');

  return parsed;
}

// ═══════════════════════════════════════════════════════════════
//  Composant interne (a besoin du ThemeProvider)
// ═══════════════════════════════════════════════════════════════
function MindMapInner() {
  const mindmap = useMindMap();
  const canvas  = useCanvas();
  const { palette } = useTheme();

  const {
    nodes, edges,
    selected, setSelected,
    selectedEdge, setSelectedEdge,
    editingId, setEditingId,
    diagramMode, setDiagramMode,
    showGrid, setShowGrid,
    addNode, updateNode, deleteNode,
    connectNodes, deleteEdge, changeEdgeStyle,
    loadTemplate, exportData, importData, clearAll,
    canUndo, canRedo, undo, redo,
    COLORS,
  } = mindmap;

  const {
    viewport, setViewport,
    isPanning, setIsPanning,
    connectingFrom, setConnectingFrom,
    mousePos, setMousePos,
    selectionBox,
    svgRef,
    screenToWorld, zoom, zoomToFit, resetView,
    startPan, updatePan, endPan,
  } = canvas;

  const dragRef      = useRef(null);
  const containerRef = useRef(null);

  const [contextMenu,   setContextMenu]   = useState(null);
  const [showHelp,      setShowHelp]      = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [activeTool,    setActiveTool]    = useState(TOOL_TYPES.SELECT);
  const [showTheme,     setShowTheme]     = useState(false);

  // ── État IA ─────────────────────────────────────────────────
  const [aiState, setAiState] = useState({
    loading: false,   // true pendant la requête
    error:   null,    // string | null
  });

  // ── Init ────────────────────────────────────────────────────
  useEffect(() => {
    const shared = loadFromShareLink();
    if (shared) { importData(shared); clearShareParam(); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSplashVisible(false), 2000);
    return () => clearTimeout(t);
  }, []);

  // ── Raccourcis clavier ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (editingId) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'z') { e.preventDefault(); undo(); }
      if (ctrl && e.key === 'y') { e.preventDefault(); redo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedEdge) { deleteEdge(selectedEdge); return; }
        if (selected) deleteNode(selected);
      }
      if (e.key === 'Tab'   && selected) { e.preventDefault(); addNode(selected); }
      if (e.key === 'Enter' && selected) setEditingId(selected);
      if (e.key === 'Escape') {
        setSelected(null); setSelectedEdge(null);
        setEditingId(null); setContextMenu(null);
        setActiveTool(TOOL_TYPES.SELECT);
      }
      if ((e.key === 'f' || e.key === 'F') && !ctrl) handleZoomFit();
      if (e.key === '?') setShowHelp(p => !p);
      if (e.key === 'v') setActiveTool(TOOL_TYPES.SELECT);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, selectedEdge, editingId, undo, redo, deleteNode, deleteEdge, addNode]);

  const handleZoomFit = useCallback(() => {
    const c = containerRef.current;
    if (c) zoomToFit(nodes, c.clientWidth, c.clientHeight);
  }, [nodes, zoomToFit]);

  // ── Génération IA ────────────────────────────────────────────
  // clearAll() vide le canvas AVANT l'injection → pas de superposition
  const handleAIGenerate = useCallback(async (prompt) => {
    if (!prompt?.trim() || aiState.loading) return;

    setAiState({ loading: true, error: null });

    try {
      const result = await aiGenerateDiagram(prompt.trim());

      // ── Vider le canvas existant d'abord ──────────────────
      // Sans ce clearAll(), les anciens nœuds restent et se superposent.
      clearAll();

      // ── Injecter le nouveau diagramme ─────────────────────
      // Petit délai pour laisser clearAll() se propager dans React
      await new Promise(r => setTimeout(r, 50));

      importData({
        nodes:       result.nodes,
        edges:       result.edges,
        diagramMode: result.diagramType || 'mind',
      });
      setDiagramMode(result.diagramType || 'mind');
      setSelected(null);
      setSelectedEdge(null);
      setAiState({ loading: false, error: null });

      // ── Adapter la vue après le rendu ─────────────────────
      setTimeout(() => {
        const c = containerRef.current;
        if (c) zoomToFit(result.nodes, c.clientWidth, c.clientHeight);
      }, 120);

    } catch (err) {
      console.error('[NovaMind AI]', err);
      setAiState({
        loading: false,
        error: err.message || 'Erreur lors de la génération',
      });
      // Auto-dismiss de l'erreur après 5 secondes
      setTimeout(() => setAiState(s => ({ ...s, error: null })), 5000);
    }
  }, [aiState.loading, clearAll, importData, setDiagramMode,
      setSelected, setSelectedEdge, zoomToFit]);

  // ── Drop outil depuis DrawingToolbar ─────────────────────────
  const handleDropTool = useCallback((toolType, worldX, worldY) => {
    if (toolType === TOOL_TYPES.SELECT || toolType === TOOL_TYPES.ARROW) return;

    const defaults = SHAPE_DEFAULTS[toolType] || {};
    const color = COLORS[Object.keys(nodes).length % COLORS.length];

    const newNode = {
      id:    genId(),
      x:     worldX - (defaults.width  || 160) / 2,
      y:     worldY - (defaults.height || 60)  / 2,
      label: defaults.label || 'Nouveau nœud',
      color,
      width:  defaults.width  || 160,
      height: defaults.height || 60,
      icon:   defaults.icon   || '💡',
      shape:  defaults.shape  || 'rect',
      notes: '', tags: [], priority: 'normal', collapsed: false,
    };

    const updatedNodes = { ...nodes, [newNode.id]: newNode };
    mindmap.importData({ nodes: updatedNodes, edges, diagramMode });
    setSelected(newNode.id);
    setTimeout(() => setEditingId(newNode.id), 60);
  }, [nodes, edges, diagramMode, mindmap, setSelected, setEditingId, COLORS]);

  // ── Clic sur handle → créer nœud enfant ─────────────────────
  const handleClickHandle = useCallback((nodeId, handleId) => {
    const parent = nodes[nodeId];
    if (!parent) return;

    const OFFSET = 220;
    const dirs   = { e: [1,0], w: [-1,0], s: [0,1], n: [0,-1] };
    const [dx, dy] = dirs[handleId] || [1, 0];
    const color = COLORS[Object.keys(nodes).length % COLORS.length];

    const newNode = {
      id:     genId(),
      x:      parent.x + dx * OFFSET - 80,
      y:      parent.y + dy * OFFSET - 30,
      label:  'Sous-idée',
      color,
      width: 160, height: 60, icon: '💡',
      notes: '', tags: [], priority: 'normal', collapsed: false,
    };

    const newEdge = {
      id:    `e${genId()}`,
      from:  nodeId,
      to:    newNode.id,
      style: 'curve',
    };

    const updatedNodes = { ...nodes, [newNode.id]: newNode };
    const updatedEdges = [...edges, newEdge];
    mindmap.importData({ nodes: updatedNodes, edges: updatedEdges, diagramMode });
    setSelected(newNode.id);
    setTimeout(() => setEditingId(newNode.id), 60);
  }, [nodes, edges, diagramMode, mindmap, setSelected, setEditingId, COLORS]);

  // ── Canvas mouse events ──────────────────────────────────────
  const handleCanvasMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault(); startPan(e); return;
    }
    if (e.button === 0) {
      // Déselection UNIQUEMENT sur le fond (data-canvas-bg="true" ou SVG direct)
      const isBackground = e.target.dataset?.canvasBg === 'true'
        || e.target.tagName.toLowerCase() === 'svg';
      if (isBackground) {
        setSelected(null);
        setSelectedEdge(null);
        setEditingId(null);
        setShowTheme(false);
      }
      if (!e.altKey) startPan(e);
    }
    setContextMenu(null);
  }, [startPan, setSelected, setSelectedEdge, setEditingId]);

  const handleCanvasMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (isPanning) { updatePan(e); return; }
    if (dragRef.current) {
      const { nodeId, startX, startY, ox, oy } = dragRef.current;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragRef.current.moved = true;
        updateNode(nodeId, {
          x: ox + dx / viewport.scale,
          y: oy + dy / viewport.scale,
        });
      }
    }
  }, [isPanning, updatePan, viewport.scale, updateNode, setMousePos]);

  const handleCanvasMouseUp = useCallback((e) => {
    endPan();
    setIsPanning(false);
    if (dragRef.current) { dragRef.current = null; }
    if (connectingFrom) {
      const world  = screenToWorld(e.clientX, e.clientY);
      const target = Object.values(nodes).find(n =>
        world.x >= n.x && world.x <= n.x + (n.width  || 160) &&
        world.y >= n.y && world.y <= n.y + (n.height || 60)
      );
      if (target && target.id !== connectingFrom) connectNodes(connectingFrom, target.id);
      setConnectingFrom(null);
    }
  }, [endPan, setIsPanning, connectingFrom, screenToWorld, nodes,
      connectNodes, setConnectingFrom]);

  const handleNodeDragStart = useCallback((nodeId, e) => {
    const nd = nodes[nodeId];
    if (!nd) return;
    dragRef.current = {
      nodeId, startX: e.clientX, startY: e.clientY,
      ox: nd.x, oy: nd.y, moved: false,
    };
  }, [nodes]);

  const handleConnectStart = useCallback((nodeId, e) => {
    e.preventDefault(); e.stopPropagation();
    setConnectingFrom(nodeId);
  }, [setConnectingFrom]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const world  = screenToWorld(e.clientX, e.clientY);
    const target = Object.values(nodes).find(n =>
      world.x >= n.x && world.x <= n.x + (n.width  || 160) &&
      world.y >= n.y && world.y <= n.y + (n.height || 60)
    );
    if (target) setSelected(target.id);
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: target?.id });
  }, [screenToWorld, nodes, setSelected]);

  const containerW = containerRef.current?.clientWidth  || 1200;
  const containerH = containerRef.current?.clientHeight || 800;

  return (
    <div
      className="mindmap-root"
      ref={containerRef}
      onContextMenu={handleContextMenu}
      style={{ background: palette.canvasBg }}
    >
      {/* ── Splash ─────────────────────────────────────────── */}
      {splashVisible && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1000,
          background: `radial-gradient(ellipse at 40% 40%, ${palette.canvasBg2} 0%, ${palette.canvasBg} 100%)`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          {[80, 120, 160].map((sz, i) => (
            <div key={i} style={{
              position: 'absolute', width: sz, height: sz, borderRadius: '50%',
              border: `1px solid rgba(110,231,247,${0.08 - i * 0.02})`,
              animation: `ring-expand 3s ${i * 0.4}s ease-in-out infinite`,
            }} />
          ))}
          <div style={{ fontSize: 50, filter: 'drop-shadow(0 0 22px #6EE7F7)', zIndex: 1, marginBottom: 14 }}>🧠</div>
          <div style={{ fontWeight: 800, fontSize: 32, color: palette.accent, letterSpacing: -1.2, fontFamily: 'Syne,sans-serif', zIndex: 1 }}>
            Nova<span style={{ color: palette.accentSecond }}>Mind</span>
          </div>
          <div style={{ color: palette.textSubtle, marginTop: 6, fontSize: 11, letterSpacing: 2.5, textTransform: 'uppercase', zIndex: 1 }}>
            Infinite Canvas · v3.2
          </div>
          <style>{`
            @keyframes ring-expand { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.4);opacity:0} }
          `}</style>
        </div>
      )}

      {/* ── Canvas ─────────────────────────────────────────── */}
      <div className="mindmap-canvas-container">
        <Canvas
          nodes={nodes}
          edges={edges}
          selected={selected}
          editingId={editingId}
          viewport={viewport}
          svgRef={svgRef}
          showGrid={showGrid}
          diagramMode={diagramMode}
          onSelectNode={id => { setSelected(id); setSelectedEdge(null); }}
          onEditNode={id => setEditingId(id)}
          onUpdateNode={updateNode}
          onNodeDragStart={handleNodeDragStart}
          onConnectStart={handleConnectStart}
          onClickHandle={handleClickHandle}
          onCanvasMouseDown={handleCanvasMouseDown}
          onCanvasMouseMove={handleCanvasMouseMove}
          onCanvasMouseUp={handleCanvasMouseUp}
          isPanning={isPanning}
          connectingFrom={connectingFrom}
          mousePos={mousePos}
          selectionBox={selectionBox}
          selectedEdge={selectedEdge}
          onSelectEdge={id => { setSelectedEdge(id); setSelected(null); }}
          onDeleteEdge={deleteEdge}
          onChangeEdgeStyle={changeEdgeStyle}
          onDropTool={handleDropTool}
          screenToWorld={screenToWorld}
        />
      </div>

      {/* ── Toolbar (haut) ─────────────────────────────────── */}
      <Toolbar
        onAddNode={id => addNode(id)}
        onDelete={() => {
          if (selectedEdge) { deleteEdge(selectedEdge); return; }
          if (selected)     { deleteNode(selected); }
        }}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        selected={selected}
        nodes={nodes}
        loadTemplate={loadTemplate}
        diagramMode={diagramMode}
        exportData={exportData}
        importData={importData}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(p => !p)}
        onZoomFit={handleZoomFit}
        onResetView={resetView}
        onClearAll={clearAll}
        zoom={viewport.scale}
        onZoom={dir => {
          const c = containerRef.current;
          zoom(dir, (c?.clientWidth || 1200) / 2, (c?.clientHeight || 800) / 2);
        }}
        svgRef={svgRef}
        onAIGenerate={handleAIGenerate}       // ← IA connectée ici
        aiLoading={aiState.loading}           // ← désactive le bouton pendant génération
      />

      {/* ── DrawingToolbar (gauche) ────────────────────────── */}
      <DrawingToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onDropTool={handleDropTool}
      />

      {/* ── Properties Panel (droite) ──────────────────────── */}
      <PropertiesPanel
        node={selected ? nodes[selected] : null}
        onUpdate={changes => selected && updateNode(selected, changes)}
        onDelete={deleteNode}
        onAddChild={addNode}
      />

      {/* ── MiniMap ────────────────────────────────────────── */}
      <MiniMap
        nodes={nodes}
        edges={edges}
        viewport={viewport}
        containerW={containerW}
        containerH={containerH}
        onViewportChange={setViewport}
      />

      {/* ── Status Bar ─────────────────────────────────────── */}
      <StatusBar
        nodes={nodes}
        edges={edges}
        selected={selected}
        viewport={viewport}
        diagramMode={diagramMode}
      />

      {/* ── Theme Panel ────────────────────────────────────── */}
      {showTheme && (
        <ThemePanel onClose={() => setShowTheme(false)} />
      )}

      {/* ── Boutons bas-gauche (thème + aide) ──────────────── */}
      <div style={{
        position: 'absolute', bottom: 80, left: 16, zIndex: 80,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <button
          onClick={() => setShowTheme(p => !p)}
          title="Thème et fond du canvas"
          style={{
            width: 34, height: 34, borderRadius: '50%',
            border: `1px solid ${palette.border}`,
            background: showTheme ? `${palette.accent}22` : palette.surface,
            color: showTheme ? palette.accent : palette.textMuted,
            fontSize: 16, cursor: 'pointer', backdropFilter: 'blur(10px)',
          }}
        >🎨</button>
        <button
          onClick={() => setShowHelp(p => !p)}
          title="Raccourcis clavier"
          style={{
            width: 34, height: 34, borderRadius: '50%',
            border: `1px solid ${palette.border}`,
            background: palette.surface,
            color: palette.accent,
            fontSize: 14, cursor: 'pointer', backdropFilter: 'blur(10px)', fontWeight: 700,
          }}
        >?</button>
      </div>

      {/* ── Panneau d'aide ─────────────────────────────────── */}
      {showHelp && (
        <div style={{
          position: 'absolute', bottom: 90, left: 60, width: 260,
          background: palette.surface,
          border: `1px solid ${palette.border}`,
          borderRadius: 14, padding: 16,
          backdropFilter: 'blur(16px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.75)',
          fontSize: 12, zIndex: 200,
        }}>
          <div style={{ color: palette.accent, fontWeight: 700, marginBottom: 10, fontSize: 12 }}>⌨️ Raccourcis</div>
          {[
            ['Tab',         'Ajouter nœud enfant'],
            ['Enter',       'Renommer nœud'],
            ['Delete',      'Supprimer sélection'],
            ['Ctrl+Z / Y',  'Annuler / Rétablir'],
            ['F',           'Adapter la vue'],
            ['V',           'Outil sélection'],
            ['Scroll',      'Zoomer'],
            ['Alt+Drag',    'Panoramique'],
            ['Dbl-Clic',    'Éditer nœud'],
            ['Clic handle', 'Créer nœud enfant'],
            ['Drag handle', 'Connecter deux nœuds'],
            ['✨ AI',       'Générer par IA'],
          ].map(([k, v]) => (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '4px 0',
              borderBottom: `1px solid ${palette.border}`,
            }}>
              <kbd style={{
                background: `${palette.accent}18`,
                border: `1px solid ${palette.accent}44`,
                borderRadius: 5, padding: '2px 7px',
                fontFamily: 'monospace', fontSize: 10,
                color: palette.accent, whiteSpace: 'nowrap',
                flexShrink: 0, minWidth: 72, textAlign: 'center',
              }}>{k}</kbd>
              <span style={{ color: palette.textMuted, fontSize: 11 }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          IA — Overlay de chargement
          Bloque les interactions pendant la génération.
          Affiché seulement quand aiState.loading === true.
      ════════════════════════════════════════════════════════ */}
      {aiState.loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 900,
          background: 'rgba(4,4,14,0.72)',
          backdropFilter: 'blur(5px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 18,
        }}>
          {/* Spinner rotatif */}
          <div style={{
            fontSize: 44,
            animation: 'nm-ai-spin 1.4s linear infinite',
            filter: 'drop-shadow(0 0 16px #A78BFA)',
          }}>✨</div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#A78BFA', fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
              NovaMind AI génère votre diagramme…
            </div>
            <div style={{ color: '#475569', fontSize: 13 }}>
              5 à 15 secondes
            </div>
          </div>

          {/* Barre de progression indéterminée */}
          <div style={{
            width: 220, height: 3, borderRadius: 2,
            background: 'rgba(167,139,250,0.15)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: '40%', height: '100%',
              background: 'linear-gradient(90deg, transparent, #A78BFA, transparent)',
              animation: 'nm-ai-bar 1.6s ease-in-out infinite',
              borderRadius: 2,
            }} />
          </div>

          <style>{`
            @keyframes nm-ai-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes nm-ai-bar  { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
          `}</style>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          IA — Toast d'erreur
          Auto-dismiss après 5 secondes (géré dans handleAIGenerate).
      ════════════════════════════════════════════════════════ */}
      {aiState.error && !aiState.loading && (
        <div style={{
          position: 'absolute', bottom: 68, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(248,113,113,0.12)',
          border: '1px solid rgba(248,113,113,0.42)',
          borderRadius: 30,
          padding: '10px 22px',
          fontSize: 13, color: '#F87171',
          zIndex: 400,
          boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
          whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>❌</span>
          <span>{aiState.error}</span>
          <button
            onClick={() => setAiState(s => ({ ...s, error: null }))}
            style={{
              marginLeft: 4, background: 'none', border: 'none',
              color: '#F87171', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
            }}
          >×</button>
        </div>
      )}

      {/* ── Context Menu ───────────────────────────────────── */}
      {contextMenu && (
        <div
          className="mindmap-ctx-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenu.nodeId ? (
            <>
              <button className="mindmap-ctx-item" onClick={() => { addNode(contextMenu.nodeId); setContextMenu(null); }}>➕ Ajouter nœud enfant</button>
              <button className="mindmap-ctx-item" onClick={() => { setEditingId(contextMenu.nodeId); setContextMenu(null); }}>✏️ Renommer</button>
              <button className="mindmap-ctx-item" onClick={() => {
                updateNode(contextMenu.nodeId, { collapsed: !nodes[contextMenu.nodeId]?.collapsed });
                setContextMenu(null);
              }}>🔽 Réduire / Développer</button>
              <div className="mindmap-ctx-sep" />
              <button className="mindmap-ctx-item" onClick={() => {
                updateNode(contextMenu.nodeId, {
                  icon: ['💡','🎯','⚠️','✅','🚀','💎','🔥','⚡'][Math.floor(Math.random() * 8)],
                });
                setContextMenu(null);
              }}>🎲 Icône aléatoire</button>
              <div className="mindmap-ctx-sep" />
              {!nodes[contextMenu.nodeId]?.isRoot && (
                <button className="mindmap-ctx-item danger" onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); }}>🗑️ Supprimer</button>
              )}
            </>
          ) : (
            <>
              <button className="mindmap-ctx-item" onClick={() => { handleZoomFit(); setContextMenu(null); }}>🔭 Adapter vue</button>
              <button className="mindmap-ctx-item" onClick={() => { undo(); setContextMenu(null); }}>↩ Annuler</button>
              <button className="mindmap-ctx-item" onClick={() => { resetView(); setContextMenu(null); }}>⌖ Réinitialiser vue</button>
            </>
          )}
        </div>
      )}

      {/* ── Branding ───────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 14, left: 70, zIndex: 90,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: `linear-gradient(135deg,${palette.accent}28,${palette.accentSecond}20)`,
          border: `1px solid ${palette.accent}38`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, backdropFilter: 'blur(10px)',
        }}>🧠</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: palette.accent, lineHeight: 1.1, fontFamily: 'Syne,sans-serif' }}>
            Nova<span style={{ color: palette.accentSecond }}>Mind</span>
          </div>
          <div style={{ fontSize: 9, color: palette.textSubtle, letterSpacing: 1.8, textTransform: 'uppercase' }}>
            Infinite Canvas
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Export avec ThemeProvider ─────────────────────────────────
export default function MindMapPage() {
  return (
    <ThemeProvider>
      <MindMapInner />
    </ThemeProvider>
  );
}