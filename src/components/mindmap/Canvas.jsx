// src/components/mindmap/Canvas.jsx  — NovaMind v3.2
// CRITICAL FIX: Deselection only happens when clicking the canvas BACKGROUND,
//               NOT on any node rect. We detect via data-canvas-bg attribute.
//
// NEW: onDrop support for DrawingToolbar drag-and-drop
//      IshikawaOverlay rendered over Ishikawa edges (not instead of them)

import React, { useRef, useState, useCallback } from 'react';
import { NodeCard }         from './NodeCard';
import { CanvasBackground } from './CanvasBackground';
import { IshikawaOverlay }  from './IshikawaOverlay';
import { useTheme }         from '../../context/ThemeContext';

const EDGE_STYLES = ['curve', 'straight', 'elbow'];

// ── Geometry ─────────────────────────────────────────────────
function getHandlePoint(node, handleId, s, vx, vy) {
  const nx = node.x*s+vx, ny = node.y*s+vy;
  const nw = (node.width||160)*s, nh = (node.height||60)*s;
  switch(handleId){
    case 'e': return { x: nx+nw,     y: ny+nh/2 };
    case 'w': return { x: nx,        y: ny+nh/2 };
    case 's': return { x: nx+nw/2,   y: ny+nh   };
    case 'n': return { x: nx+nw/2,   y: ny      };
    default:  return { x: nx+nw,     y: ny+nh/2 };
  }
}

function bestHandle(a, b, s, vx, vy) {
  const ax=a.x*s+vx+(a.width||160)*s/2, ay=a.y*s+vy+(a.height||60)*s/2;
  const bx=b.x*s+vx+(b.width||160)*s/2, by=b.y*s+vy+(b.height||60)*s/2;
  const dx=bx-ax, dy=by-ay;
  return Math.abs(dx)>=Math.abs(dy)
    ? {from:dx>0?'e':'w', to:dx>0?'w':'e'}
    : {from:dy>0?'s':'n', to:dy>0?'n':'s'};
}

function buildEdgePath(edge, fn, tn, s, vx, vy) {
  const h = bestHandle(fn,tn,s,vx,vy);
  const fh=edge.fromHandle||h.from, th=edge.toHandle||h.to;
  const f=getHandlePoint(fn,fh,s,vx,vy), t=getHandlePoint(tn,th,s,vx,vy);
  const style=edge.style||'curve';
  if(style==='straight') return `M ${f.x} ${f.y} L ${t.x} ${t.y}`;
  if(style==='elbow'){
    const mx=(f.x+t.x)/2;
    if(fh==='e'||fh==='w') return `M ${f.x} ${f.y} L ${mx} ${f.y} L ${mx} ${t.y} L ${t.x} ${t.y}`;
    const my=(f.y+t.y)/2;
    return `M ${f.x} ${f.y} L ${f.x} ${my} L ${t.x} ${my} L ${t.x} ${t.y}`;
  }
  const dx=t.x-f.x, dy=t.y-f.y;
  const ten=Math.max(60*s,Math.min(Math.abs(dx)*0.5,Math.abs(dy)*0.5,200*s));
  let c1x=f.x,c1y=f.y,c2x=t.x,c2y=t.y;
  if(fh==='e') c1x+=ten; if(fh==='w') c1x-=ten;
  if(fh==='s') c1y+=ten; if(fh==='n') c1y-=ten;
  if(th==='e') c2x+=ten; if(th==='w') c2x-=ten;
  if(th==='s') c2y+=ten; if(th==='n') c2y-=ten;
  return `M ${f.x} ${f.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${t.x} ${t.y}`;
}

function getMid(edge, fn, tn, s, vx, vy) {
  const h=bestHandle(fn,tn,s,vx,vy);
  const f=getHandlePoint(fn,edge.fromHandle||h.from,s,vx,vy);
  const t=getHandlePoint(tn,edge.toHandle||h.to,s,vx,vy);
  return {x:(f.x+t.x)/2, y:(f.y+t.y)/2};
}

// ── EdgeLine ──────────────────────────────────────────────────
const EdgeLine = React.memo(function EdgeLine({
  edge, fromNode, toNode, viewport, isSelected, onClick, onDeleteEdge, onChangeStyle,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const {scale:s, x:vx, y:vy} = viewport;
  const path = buildEdgePath(edge, fromNode, toNode, s, vx, vy);
  const mid  = getMid(edge, fromNode, toNode, s, vx, vy);
  const rgb  = hexToRgb(fromNode.color);

  React.useEffect(()=>{ if(!isSelected) setShowMenu(false); }, [isSelected]);

  return (
    <g>
      <path d={path} stroke="transparent" strokeWidth={16} fill="none"
        style={{cursor:'pointer'}}
        onClick={e=>{e.stopPropagation(); onClick();}} />
      <path d={path}
        stroke={isSelected ? fromNode.color : `rgba(${rgb},0.38)`}
        strokeWidth={(isSelected?2.5:1.8)*s}
        fill="none"
        strokeDasharray={edge.dashed?`${6*s} ${3*s}`:'none'}
        markerEnd={`url(#arrow-${isSelected?'sel':'normal'})`}
        style={{
          pointerEvents:'none',
          filter:isSelected
            ? `drop-shadow(0 0 ${5*s}px rgba(${rgb},0.7))`
            : `drop-shadow(0 0 ${2*s}px rgba(${rgb},0.2))`,
          transition:'stroke .14s',
        }}
      />
      {isSelected && (
        <g>
          <circle cx={mid.x} cy={mid.y} r={10*s}
            fill={`rgba(${rgb},0.13)`} stroke={fromNode.color} strokeWidth={1.5*s}
            style={{cursor:'pointer'}}
            onClick={e=>{e.stopPropagation(); setShowMenu(p=>!p);}}
          />
          <text x={mid.x} y={mid.y+4*s} fontSize={11*s}
            fill={fromNode.color} textAnchor="middle"
            style={{pointerEvents:'none',userSelect:'none',fontWeight:700}}>⋯</text>
          {showMenu && (
            <foreignObject x={mid.x-72*s} y={mid.y-112*s} width={144*s} height={112*s}>
              <div style={{
                background:'rgba(6,6,18,0.99)',
                border:'1px solid rgba(110,231,247,0.2)',
                borderRadius:10, padding:5, fontSize:11,
                boxShadow:'0 12px 36px rgba(0,0,0,0.85)',
                display:'flex', flexDirection:'column', gap:3,
              }}>
                {EDGE_STYLES.map(st=>(
                  <button key={st}
                    onClick={e=>{e.stopPropagation(); onChangeStyle(edge.id,st); setShowMenu(false);}}
                    style={{
                      padding:'5px 9px', borderRadius:6, border:'none',
                      background:edge.style===st?'rgba(110,231,247,0.15)':'transparent',
                      color:edge.style===st?'#6EE7F7':'#94a3b8',
                      cursor:'pointer', textAlign:'left', fontFamily:'inherit', fontSize:11,
                    }}>
                    {st==='curve'?'〜 Courbe':st==='straight'?'— Droite':'⌐ Coude'}
                  </button>
                ))}
                <button onClick={e=>{e.stopPropagation(); onDeleteEdge(edge.id); setShowMenu(false);}}
                  style={{padding:'5px 9px',borderRadius:6,border:'none',
                    background:'rgba(248,113,113,0.1)',color:'#F87171',
                    cursor:'pointer',textAlign:'left',fontFamily:'inherit',fontSize:11}}>
                  🗑️ Supprimer
                </button>
              </div>
            </foreignObject>
          )}
        </g>
      )}
    </g>
  );
});

// ── Canvas ────────────────────────────────────────────────────
export function Canvas({
  nodes, edges,
  selected, editingId,
  viewport, svgRef,
  showGrid, diagramMode,
  onSelectNode, onEditNode, onUpdateNode,
  onNodeDragStart, onConnectStart, onClickHandle,
  onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp,
  isPanning, connectingFrom, mousePos,
  selectionBox,
  onDeleteEdge, onChangeEdgeStyle,
  selectedEdge, onSelectEdge,
  onDropTool,       // NEW: (toolType, worldX, worldY) called when tool dropped on canvas
  screenToWorld,    // needed for drop coord conversion
}) {
  const containerRef = useRef(null);
  const { scale:s, x:vx, y:vy } = viewport;
  const { palette } = useTheme();

  const containerW = containerRef.current?.clientWidth  || 1400;
  const containerH = containerRef.current?.clientHeight || 900;

  const isIshikawa = diagramMode === 'ishikawa';

  // ── Drag & Drop from DrawingToolbar ──────────────────────
  const handleDragOver = useCallback((e) => {
    if (e.dataTransfer.types.includes('tool-type')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const toolType = e.dataTransfer.getData('tool-type');
    if (!toolType || !onDropTool) return;
    const rect  = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const worldX  = (clientX - viewport.x) / viewport.scale;
    const worldY  = (clientY - viewport.y) / viewport.scale;
    onDropTool(toolType, worldX, worldY);
  }, [onDropTool, viewport]);

  const renderConnecting = () => {
    if (!connectingFrom || !mousePos) return null;
    const fn = nodes[connectingFrom];
    if (!fn) return null;
    const fx = fn.x*s+vx+(fn.width||160)*s;
    const fy = fn.y*s+vy+(fn.height||60)*s/2;
    return (
      <g style={{pointerEvents:'none'}}>
        <line x1={fx} y1={fy} x2={mousePos.x} y2={mousePos.y}
          stroke="#6EE7F7" strokeWidth={2} strokeDasharray="8 4" opacity={0.75}/>
        <circle cx={mousePos.x} cy={mousePos.y} r={7}
          fill="none" stroke="#6EE7F7" strokeWidth={1.5} opacity={0.9}/>
      </g>
    );
  };

  return (
    <div ref={containerRef}
      style={{ width:'100%', height:'100%', overflow:'hidden', position:'relative' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Canvas background (dots/grid/lines/chess) */}
      <CanvasBackground viewport={viewport} width={containerW} height={containerH} />

      <svg ref={svgRef} width="100%" height="100%"
        style={{ display:'block', cursor:isPanning?'grabbing':'default', position:'relative', zIndex:1 }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseUp}
        onClick={e => {
          // Only deselect edge on bare SVG click
          if (e.target.dataset.canvasBg) onSelectEdge?.(null);
        }}
      >
        <defs>
          {/* Background gradient */}
          <radialGradient id="cosmos-bg" cx="40%" cy="40%" r="75%">
            <stop offset="0%"   stopColor={palette.canvasBg2}/>
            <stop offset="100%" stopColor={palette.canvasBg}/>
          </radialGradient>
          {/* Arrows */}
          <marker id="arrow-normal" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M 0 0 L 0 6 L 8 3 z" fill="rgba(110,231,247,0.45)"/>
          </marker>
          <marker id="arrow-sel" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M 0 0 L 0 6 L 8 3 z" fill="#6EE7F7"/>
          </marker>
        </defs>

        {/* ── CRITICAL FIX: Background rect carries data-canvas-bg
             NodeCard rects do NOT have this attribute.
             handleCanvasMouseDown checks e.target.dataset.canvasBg
             instead of tagName — so clicking a node never deselects. ── */}
        <rect
          width="100%" height="100%"
          fill="url(#cosmos-bg)"
          data-canvas-bg="true"
        />

        {/* Edges */}
        <g>
          {edges.map(edge => {
            // In Ishikawa mode, hide structural edges (overlay draws them)
            if (isIshikawa && edge.isIshikawa) return null;
            const fn=nodes[edge.from], tn=nodes[edge.to];
            if (!fn||!tn) return null;
            return (
              <EdgeLine key={edge.id}
                edge={edge} fromNode={fn} toNode={tn}
                viewport={viewport}
                isSelected={selectedEdge===edge.id}
                onClick={()=>onSelectEdge?.(edge.id)}
                onDeleteEdge={onDeleteEdge}
                onChangeStyle={onChangeEdgeStyle}
              />
            );
          })}
        </g>

        {/* Ishikawa spine overlay */}
        {isIshikawa && (
          <IshikawaOverlay nodes={nodes} edges={edges} viewport={viewport}/>
        )}

        {/* Nodes */}
        {Object.values(nodes).map(node=>(
          <NodeCard
            key={node.id}
            node={node}
            isSelected={selected===node.id}
            isEditing={editingId===node.id}
            viewport={viewport}
            diagramMode={diagramMode}
            onSelect={onSelectNode}
            onEdit={onEditNode}
            onUpdate={onUpdateNode}
            onDragStart={onNodeDragStart}
            onConnectStart={onConnectStart}
            onClickHandle={onClickHandle}
          />
        ))}

        {renderConnecting()}

        {selectionBox && (
          <rect
            x={Math.min(selectionBox.x1,selectionBox.x2)}
            y={Math.min(selectionBox.y1,selectionBox.y2)}
            width={Math.abs(selectionBox.x2-selectionBox.x1)}
            height={Math.abs(selectionBox.y2-selectionBox.y1)}
            fill="rgba(110,231,247,0.04)"
            stroke="rgba(110,231,247,0.45)"
            strokeWidth={1} strokeDasharray="5 3"
          />
        )}
      </svg>
    </div>
  );
}

function hexToRgb(hex){
  const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r?`${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}`:'110,231,247';
}
