/**
 * InkSpace v3 — Renderer
 * Dessine tous les objets de la Scene en appliquant le Viewport
 */

'use strict';

const Renderer = {
  gridType: 'lines',
  canvasBg: '#faf9f6',

  // ── Rendu principal ──
  render(gCtx, mCtx, oCtx, width, height, state) {
    this.drawBackground(gCtx, width, height);
    this.drawGrid(gCtx, width, height);

    mCtx.clearRect(0, 0, width, height);
    Viewport.apply(mCtx);
    Scene.objects.forEach(obj => this.drawObject(mCtx, obj, state));
    Viewport.reset(mCtx);

    oCtx.clearRect(0, 0, width, height);
  },

  // ── Fond ──
  drawBackground(ctx, w, h) {
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = this.canvasBg;
    ctx.fillRect(0,0,w,h);
  },

  // ── Grille ──
  drawGrid(ctx, w, h) {
    if(this.gridType === 'none') return;
    const step = 28 * Viewport.zoom;
    const offX = ((Viewport.panX % step) + step) % step;
    const offY = ((Viewport.panY % step) + step) % step;
    const darkMode = document.body.dataset.theme === 'midnight';
    const col = darkMode ? '#1a1a3a' : (document.body.dataset.theme === 'light' ? '#e8e7f5' : '#e4e3dc');

    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;

    if(this.gridType === 'lines') {
      ctx.lineWidth = 0.5;
      for(let x=offX; x<w; x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
      for(let y=offY; y<h; y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    } else if(this.gridType === 'dots') {
      for(let x=offX; x<w; x+=step)
        for(let y=offY; y<h; y+=step){
          ctx.beginPath(); ctx.arc(x,y,1,0,Math.PI*2); ctx.fill();
        }
    } else if(this.gridType === 'cross') {
      ctx.lineWidth = 0.5;
      const cs = 4;
      for(let x=offX; x<w; x+=step)
        for(let y=offY; y<h; y+=step){
          ctx.beginPath(); ctx.moveTo(x-cs,y); ctx.lineTo(x+cs,y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x,y-cs); ctx.lineTo(x,y+cs); ctx.stroke();
        }
    } else if(this.gridType === 'isometric') {
      ctx.lineWidth = 0.4;
      const a = step * 1.2;
      for(let x=-h; x<w+h; x+=a){
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+h,h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x-h,h); ctx.stroke();
      }
    }
    ctx.restore();
  },

  // ── Dessine un objet ──
  drawObject(ctx, o, state) {
    if(o.hidden) return;
    ctx.save();
    ctx.globalAlpha = o.opacity != null ? o.opacity : 1;

    const selected = state && state.selectedIds && state.selectedIds.has(o.id);

    switch(o.type) {
      case 'path':       this.drawPath(ctx, o); break;
      case 'line':       this.drawLine(ctx, o); break;
      case 'arrow':      this.drawArrow(ctx, o, false); break;
      case 'dblarrow':   this.drawArrow(ctx, o, true); break;
      case 'rect':       this.drawRect(ctx, o, false); break;
      case 'rect-fill':  this.drawRect(ctx, o, true); break;
      case 'circle':     this.drawEllipse(ctx, o, false); break;
      case 'circle-fill':this.drawEllipse(ctx, o, true); break;
      case 'triangle':   this.drawPoly(ctx, o, trianglePoints(o)); break;
      case 'diamond':    this.drawPoly(ctx, o, diamondPoints(o)); break;
      case 'parallelogram': this.drawPoly(ctx, o, parallelogramPoints(o)); break;
      case 'pentagon':   this.drawPoly(ctx, o, regularPolyPoints(o,5)); break;
      case 'hexagon':    this.drawPoly(ctx, o, regularPolyPoints(o,6)); break;
      case 'star':       this.drawPoly(ctx, o, starPoints(o,5)); break;
      case 'cube':       this.drawCube(ctx, o); break;
      case 'prism':      this.drawPrism(ctx, o); break;
      case 'cylinder':   this.drawCylinder(ctx, o); break;
      case 'bezier':     this.drawBezier(ctx, o); break;
      case 'text':       this.drawText(ctx, o); break;
      case 'formula':    this.drawFormula(ctx, o); break;
      case 'sticker':    this.drawSticker(ctx, o); break;
      case 'image':      this.drawImage(ctx, o); break;
      case 'graph-node': this.drawGraphNode(ctx, o); break;
      case 'graph-edge': this.drawGraphEdge(ctx, o); break;
      case 'angle':      this.drawAngle(ctx, o); break;
    }

    // Highlight sélection
    if(selected) this.drawSelectionHandle(ctx, o);

    ctx.restore();
  },

  // ── Styles communs ──
  applyStroke(ctx, o) {
    ctx.strokeStyle = o.color || '#333';
    ctx.lineWidth = o.size || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(o.dash || []);
  },

  // ── Types de tracé ──
  drawPath(ctx, o) {
    if(!o.points || o.points.length < 2) return;
    ctx.beginPath();
    if(o.tool === 'marker') {
      ctx.globalAlpha *= 0.35;
      ctx.lineWidth = (o.size||2) * 5;
      ctx.lineCap = 'square';
    } else {
      ctx.lineWidth = o.size || 2;
      ctx.lineCap = 'round';
    }
    ctx.strokeStyle = o.color || '#333';
    ctx.lineJoin = 'round';
    ctx.moveTo(o.points[0].x, o.points[0].y);
    if(o.smooth) {
      for(let i=1; i<o.points.length-1; i++) {
        const mx = (o.points[i].x+o.points[i+1].x)/2;
        const my = (o.points[i].y+o.points[i+1].y)/2;
        ctx.quadraticCurveTo(o.points[i].x,o.points[i].y,mx,my);
      }
    } else {
      for(let i=1; i<o.points.length; i++) ctx.lineTo(o.points[i].x,o.points[i].y);
    }
    ctx.stroke();
  },

  drawLine(ctx, o) {
    this.applyStroke(ctx, o);
    ctx.beginPath(); ctx.moveTo(o.x1,o.y1); ctx.lineTo(o.x2,o.y2); ctx.stroke();
  },

  drawArrow(ctx, o, double) {
    this.applyStroke(ctx, o);
    ctx.beginPath(); ctx.moveTo(o.x1,o.y1); ctx.lineTo(o.x2,o.y2); ctx.stroke();
    const a = Math.atan2(o.y2-o.y1, o.x2-o.x1);
    const len = Math.max(10, (o.size||2)*4);
    this._arrowHead(ctx, o.x2,o.y2,a,len);
    if(double) this._arrowHead(ctx, o.x1,o.y1,a+Math.PI,len);
  },

  _arrowHead(ctx, x,y,angle,len) {
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x-len*Math.cos(angle-0.4), y-len*Math.sin(angle-0.4));
    ctx.moveTo(x,y);
    ctx.lineTo(x-len*Math.cos(angle+0.4), y-len*Math.sin(angle+0.4));
    ctx.stroke();
  },

  drawRect(ctx, o, filled) {
    this.applyStroke(ctx, o);
    if(filled) {
      ctx.fillStyle = o.color;
      ctx.globalAlpha *= 0.25;
      ctx.fillRect(o.x1,o.y1,o.x2-o.x1,o.y2-o.y1);
      ctx.globalAlpha /= 0.25;
    }
    ctx.beginPath(); ctx.rect(o.x1,o.y1,o.x2-o.x1,o.y2-o.y1); ctx.stroke();
  },

  drawEllipse(ctx, o, filled) {
    this.applyStroke(ctx, o);
    const rx=Math.abs(o.x2-o.x1)/2, ry=Math.abs(o.y2-o.y1)/2;
    const cx=(o.x1+o.x2)/2, cy=(o.y1+o.y2)/2;
    ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
    if(filled) { ctx.fillStyle=o.color; ctx.globalAlpha*=0.25; ctx.fill(); ctx.globalAlpha/=0.25; }
    ctx.stroke();
  },

  drawPoly(ctx, o, pts) {
    this.applyStroke(ctx, o);
    if(!pts.length) return;
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1; i<pts.length; i++) ctx.lineTo(pts[i].x,pts[i].y);
    ctx.closePath();
    if(o.filled) { ctx.fillStyle=o.color; ctx.globalAlpha*=0.25; ctx.fill(); ctx.globalAlpha/=0.25; }
    ctx.stroke();
  },

  // ─── Formes 3D ───
  drawCube(ctx, o) {
    this.applyStroke(ctx, o);
    const x1=Math.min(o.x1,o.x2), y1=Math.min(o.y1,o.y2);
    const x2=Math.max(o.x1,o.x2), y2=Math.max(o.y1,o.y2);
    const w=x2-x1, h=y2-y1;
    const d=Math.min(w,h)*0.3; // depth offset

    // face avant
    ctx.beginPath(); ctx.rect(x1,y1+d,w-d,h-d); ctx.stroke();
    // face dessus
    ctx.beginPath(); ctx.moveTo(x1,y1+d); ctx.lineTo(x1+d,y1); ctx.lineTo(x2,y1); ctx.lineTo(x2,y1+d); ctx.stroke();
    // face droite
    ctx.beginPath(); ctx.moveTo(x2,y1+d); ctx.lineTo(x2,y1); ctx.lineTo(x2+d-d,y1); ctx.moveTo(x2,y1+d); ctx.lineTo(x2,y2); ctx.stroke();
    // arête diagonale
    ctx.beginPath(); ctx.moveTo(x1+d,y1); ctx.lineTo(x1+d,y1+h-d); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1+d,y1+h-d); ctx.lineTo(x2,y2); ctx.stroke();

    // face dessus remplie légèrement
    ctx.fillStyle = o.color;
    ctx.globalAlpha *= 0.1;
    ctx.beginPath(); ctx.moveTo(x1,y1+d); ctx.lineTo(x1+d,y1); ctx.lineTo(x2,y1); ctx.lineTo(x2,y1+d); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= 0.1;
  },

  drawPrism(ctx, o) {
    this.applyStroke(ctx, o);
    const x1=Math.min(o.x1,o.x2), y1=Math.min(o.y1,o.y2);
    const x2=Math.max(o.x1,o.x2), y2=Math.max(o.y1,o.y2);
    const w=x2-x1, h=y2-y1;
    const d = w*0.25;
    const mx = (x1+x2)/2;

    // Triangle avant
    ctx.beginPath(); ctx.moveTo(mx,y1); ctx.lineTo(x2,y2); ctx.lineTo(x1,y2); ctx.closePath(); ctx.stroke();
    // Triangle arrière (décalé)
    ctx.beginPath(); ctx.moveTo(mx+d,y1-d*0.5); ctx.lineTo(x2+d,y2-d*0.5); ctx.lineTo(x1+d,y2-d*0.5); ctx.closePath();
    ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
    // Arêtes reliant
    [[mx,y1,mx+d,y1-d*0.5],[x2,y2,x2+d,y2-d*0.5],[x1,y2,x1+d,y2-d*0.5]].forEach(([ax,ay,bx,by])=>{
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
    });
  },

  drawCylinder(ctx, o) {
    this.applyStroke(ctx, o);
    const x1=Math.min(o.x1,o.x2), y1=Math.min(o.y1,o.y2);
    const x2=Math.max(o.x1,o.x2), y2=Math.max(o.y1,o.y2);
    const w=x2-x1, h=y2-y1;
    const rx=w/2, ry=Math.min(h*0.15,20);
    const cx=(x1+x2)/2;

    // Ellipse du bas
    ctx.beginPath(); ctx.ellipse(cx,y2,rx,ry,0,0,Math.PI*2); ctx.stroke();
    // Ellipse du haut (demi)
    ctx.beginPath(); ctx.ellipse(cx,y1,rx,ry,0,Math.PI,0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx,y1,rx,ry,0,0,Math.PI);
    ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
    // Côtés
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x1,y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2,y1); ctx.lineTo(x2,y2); ctx.stroke();
    // Remplissage léger
    ctx.fillStyle = o.color; ctx.globalAlpha *= 0.08;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x1,y2);
    ctx.ellipse(cx,y2,rx,ry,0,Math.PI,0); ctx.lineTo(x2,y1);
    ctx.ellipse(cx,y1,rx,ry,0,0,Math.PI); ctx.fill();
    ctx.globalAlpha /= 0.08;
  },

  drawBezier(ctx, o) {
    this.applyStroke(ctx, o);
    ctx.beginPath();
    ctx.moveTo(o.p0.x,o.p0.y);
    ctx.bezierCurveTo(o.p1.x,o.p1.y, o.p2.x,o.p2.y, o.p3.x,o.p3.y);
    ctx.stroke();
  },

  drawText(ctx, o) {
    const fs = o.fontSize || 18;
    const weight = o.bold ? '700' : '400';
    const style  = o.italic ? 'italic ' : '';
    const family = o.fontFamily || 'Cabinet Grotesk, sans-serif';
    ctx.font = `${style}${weight} ${fs}px ${family}`;
    ctx.fillStyle = o.color || '#222';
    ctx.textAlign = o.align || 'left';

    const lines = (o.text || '').split('\n');
    lines.forEach((line, i) => {
      const yPos = o.y + i * fs * 1.35;
      ctx.fillText(line, o.x, yPos);
      if(o.underline) {
        const w = ctx.measureText(line).width;
        const xOff = o.align === 'center' ? -w/2 : o.align === 'right' ? -w : 0;
        ctx.fillRect(o.x + xOff, yPos + 3, w, 1.5);
      }
    });
    // Pour le hit test
    ctx.textAlign = 'left';
    o.textWidth = ctx.measureText(o.text || '').width;
  },

  drawFormula(ctx, o) {
    const fs = o.fontSize || 20;
    ctx.fillStyle = o.color || '#222';
    ctx.font = `italic ${fs}px Georgia, serif`;
    // fraction
    const fm = (o.raw||'').match(/\\frac\{([^}]+)\}\{([^}]+)\}/);
    if(fm) {
      const [,num,den] = fm;
      const prefix = latexToText((o.raw||'').split(fm[0])[0]);
      const suffix = latexToText(((o.raw||'').split(fm[0])[1])||'');
      let px = o.x;
      if(prefix) { ctx.fillText(prefix,px,o.y); px+=ctx.measureText(prefix).width+3; }
      const nw=ctx.measureText(num).width, dw=ctx.measureText(den).width;
      const fw=Math.max(nw,dw)+8;
      ctx.fillText(num, px+(fw-nw)/2, o.y-fs*0.25);
      ctx.fillRect(px, o.y+2, fw, 1.5);
      ctx.fillText(den, px+(fw-dw)/2, o.y+fs*0.85);
      px+=fw+3;
      if(suffix) ctx.fillText(suffix,px,o.y);
    } else {
      const display = latexToText(o.raw||'');
      display.split('\n').forEach((line,i)=>ctx.fillText(line,o.x,o.y+i*fs*1.3));
    }
    o.textWidth = ctx.measureText(latexToText(o.raw||'')).width + 60;
  },

  // ─── Moteur de rendu mathématique ───
  // Retourne {width} après dessin
  _mathDraw(ctx, raw, x, y, fs, color) {
    return renderMathExpr(ctx, raw, x, y, fs, color);
  },

  drawSticker(ctx, o) {
    ctx.font = `${o.fontSize||28}px serif`;
    ctx.fillText(o.text, o.x, o.y);
  },

  drawImage(ctx, o) {
    if(o._img) {
      ctx.drawImage(o._img, o.x, o.y, o.w, o.h);
    }
  },

  // ─── GRAPHES ───
  drawGraphNode(ctx, o) {
    const r = o.r || 20;
    // Cercle
    ctx.beginPath(); ctx.arc(o.x,o.y,r,0,Math.PI*2);
    ctx.fillStyle = o.fillColor || '#6c63ff22';
    ctx.fill();
    ctx.strokeStyle = o.color || '#6c63ff';
    ctx.lineWidth = o.size || 2;
    ctx.stroke();
    // Label
    if(o.label) {
      ctx.fillStyle = o.color || '#6c63ff';
      ctx.font = `700 ${r*0.8}px Cabinet Grotesk, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(o.label, o.x, o.y);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  },

  drawGraphEdge(ctx, o) {
    this.applyStroke(ctx, o);
    const dx=o.x2-o.x1, dy=o.y2-o.y1;
    const len=Math.hypot(dx,dy);
    if(len===0) return;

    // Si self-loop
    if(o.selfLoop) {
      const r=o.r||20;
      ctx.beginPath(); ctx.arc(o.x1+r*1.5,o.y1-r*1.5,r,0,Math.PI*2); ctx.stroke();
      return;
    }

    // Raccourcir pour ne pas traverser les nœuds
    const nr = (o.nodeRadius||20) + 3;
    const sx = o.x1 + (dx/len)*nr, sy = o.y1 + (dy/len)*nr;
    const ex = o.x2 - (dx/len)*nr, ey = o.y2 - (dy/len)*nr;

    // Courbure pour éviter chevauchement si bidirectionnel
    if(o.curved) {
      const mx=(sx+ex)/2+dy*0.2, my=(sy+ey)/2-dx*0.2;
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(mx,my,ex,ey); ctx.stroke();
      if(o.directed) this._arrowHead(ctx,ex,ey,Math.atan2(ey-my,ex-mx),12);
    } else {
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
      if(o.directed) this._arrowHead(ctx,ex,ey,Math.atan2(dy,dx),12);
    }

    // Poids / label
    if(o.weight != null) {
      const mx=(o.x1+o.x2)/2, my=(o.y1+o.y2)/2;
      ctx.fillStyle='#fff'; ctx.fillRect(mx-10,my-9,20,14);
      ctx.fillStyle=o.color||'#333';
      ctx.font='bold 11px DM Mono, monospace';
      ctx.textAlign='center'; ctx.fillText(o.weight,mx,my+2); ctx.textAlign='left';
    }
  },

  // ─── ANGLE ───
  drawAngle(ctx, o) {
    this.applyStroke(ctx, o);
    // Deux segments
    ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(o.x1,o.y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(o.x2,o.y2); ctx.stroke();

    // Arc d'angle
    const a1 = Math.atan2(o.y1-o.y, o.x1-o.x);
    const a2 = Math.atan2(o.y2-o.y, o.x2-o.x);
    const arcR = 30;
    ctx.beginPath(); ctx.arc(o.x,o.y,arcR,a1,a2);
    ctx.setLineDash([]); ctx.stroke();

    // Degrés
    const deg = angleBetween(o.x1-o.x,o.y1-o.y, o.x2-o.x,o.y2-o.y);
    const midA = (a1+a2)/2;
    const tx = o.x + (arcR+16)*Math.cos(midA);
    const ty = o.y + (arcR+16)*Math.sin(midA);
    ctx.fillStyle = o.color || '#e63946';
    ctx.font = 'bold 13px DM Mono, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(deg.toFixed(1)+'°', tx, ty);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    o.degreeValue = deg; // pour infobulle
  },

  // ─── Sélection ───
  /*drawSelectionHandle(ctx, o) {
    const bb = getBoundingBox(o);
    if(!bb) return;
    ctx.save();
    ctx.strokeStyle = '#6c63ff';
    ctx.lineWidth = 1.5 / Viewport.zoom;
    ctx.setLineDash([5/Viewport.zoom, 3/Viewport.zoom]);
    const pad = 8 / Viewport.zoom;
    ctx.strokeRect(bb.x-pad, bb.y-pad, bb.w+pad*2, bb.h+pad*2);
    ctx.setLineDash([]);

    // Poignées
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#6c63ff';
    ctx.lineWidth = 1.5/Viewport.zoom;
    const hs = 6/Viewport.zoom;
    [[bb.x-pad,bb.y-pad],[bb.x+bb.w/2,bb.y-pad],[bb.x+bb.w+pad,bb.y-pad],
     [bb.x-pad,bb.y+bb.h+pad],[bb.x+bb.w+pad,bb.y+bb.h+pad]].forEach(([hx,hy])=>{
      ctx.fillRect(hx-hs/2,hy-hs/2,hs,hs); ctx.strokeRect(hx-hs/2,hy-hs/2,hs,hs);
    });
    ctx.restore();
  },   */
  drawSelectionHandle(ctx, o) {
    const bb = getBoundingBox(o);
    if(!bb) return;
    ctx.save();
    const pad = 6 / Viewport.zoom;
    const hs  = 7 / Viewport.zoom;

    // Bordure pointillée
    ctx.strokeStyle = '#6c63ff';
    ctx.lineWidth = 1.5 / Viewport.zoom;
    ctx.setLineDash([5/Viewport.zoom, 3/Viewport.zoom]);
    ctx.strokeRect(bb.x-pad, bb.y-pad, bb.w+pad*2, bb.h+pad*2);
    ctx.setLineDash([]);

    // 8 poignées : 4 coins + 4 milieux
    // Pour les images : coins en accent2 (rose) pour signaler le resize
    const isImg = o.type === 'image';
    const handles = getHandlePositions(bb, pad);
    handles.forEach((h, i) => {
      ctx.fillStyle   = isImg && i < 4 ? '#ff6b9d' : '#fff';
      ctx.strokeStyle = isImg && i < 4 ? '#ff6b9d' : '#6c63ff';
      ctx.lineWidth   = 1.5 / Viewport.zoom;
      ctx.beginPath();
      if(isImg && i < 4) {
        // Coins image : rond
        ctx.arc(h.x, h.y, hs*0.7, 0, Math.PI*2);
      } else {
        ctx.rect(h.x - hs/2, h.y - hs/2, hs, hs);
      }
      ctx.fill(); ctx.stroke();
    });

    // Label dimensions pour les images
    if(isImg) {
      ctx.fillStyle = '#6c63ff';
      ctx.font = `${11/Viewport.zoom}px DM Mono, monospace`;
      ctx.fillText(`${Math.round(o.w)}×${Math.round(o.h)}`, bb.x, bb.y - pad - 4/Viewport.zoom);
    }
    ctx.restore();
  },
};

// ── Bounding box d'un objet ──
function getBoundingBox(o) {
  switch(o.type) {
    case 'line': case 'arrow': case 'dblarrow':
      return {x:Math.min(o.x1,o.x2),y:Math.min(o.y1,o.y2),w:Math.abs(o.x2-o.x1),h:Math.abs(o.y2-o.y1)};
    case 'rect': case 'rect-fill': case 'circle': case 'circle-fill':
    case 'triangle': case 'diamond': case 'parallelogram': case 'pentagon':
    case 'hexagon': case 'star': case 'cube': case 'prism': case 'cylinder':
      return {x:Math.min(o.x1,o.x2),y:Math.min(o.y1,o.y2),w:Math.abs(o.x2-o.x1),h:Math.abs(o.y2-o.y1)};
    case 'path':
      if(!o.points||!o.points.length) return null;
      const xs=o.points.map(p=>p.x), ys=o.points.map(p=>p.y);
      const minX=Math.min(...xs),minY=Math.min(...ys);
      return {x:minX,y:minY,w:Math.max(...xs)-minX,h:Math.max(...ys)-minY};
    case 'text': case 'formula': case 'sticker':
      return {x:o.x,y:o.y-(o.fontSize||18),w:o.textWidth||100,h:(o.fontSize||18)*1.5};
    case 'image':
      return {x:o.x,y:o.y,w:o.w||100,h:o.h||100};
    case 'graph-node':
      return {x:o.x-(o.r||20),y:o.y-(o.r||20),w:(o.r||20)*2,h:(o.r||20)*2};
    default: return null;
  }
}

// 8 poignées : index 0-3 = coins (TL,TR,BR,BL), 4-7 = milieux (T,R,B,L)
function getHandlePositions(bb, pad) {
  const x = bb.x - pad, y = bb.y - pad;
  const w = bb.w + pad*2, h = bb.h + pad*2;
  return [
    {x: x,     y: y,     cursor:'nw-resize', corner:'TL'}, // 0 TL
    {x: x+w,   y: y,     cursor:'ne-resize', corner:'TR'}, // 1 TR
    {x: x+w,   y: y+h,   cursor:'se-resize', corner:'BR'}, // 2 BR
    {x: x,     y: y+h,   cursor:'sw-resize', corner:'BL'}, // 3 BL
    {x: x+w/2, y: y,     cursor:'n-resize',  corner:'T'},  // 4 T
    {x: x+w,   y: y+h/2, cursor:'e-resize',  corner:'R'},  // 5 R
    {x: x+w/2, y: y+h,   cursor:'s-resize',  corner:'B'},  // 6 B
    {x: x,     y: y+h/2, cursor:'w-resize',  corner:'L'},  // 7 L
  ];
}

// Trouve si un point monde est sur une poignée de resize d'un objet sélectionné
function getResizeHandle(wx, wy) {
  for(const id of Tools._selectedIds) {
    const o = Scene.objects.find(obj => obj.id === id);
    if(!o || o.type !== 'image') continue;
    const bb = getBoundingBox(o);
    if(!bb) continue;
    const pad = 6 / Viewport.zoom;
    const handles = getHandlePositions(bb, pad);
    const hitR = 10 / Viewport.zoom;
    for(let i = 0; i < handles.length; i++) {
      if(Math.hypot(handles[i].x - wx, handles[i].y - wy) <= hitR) {
        return { obj: o, handleIdx: i, corner: handles[i].corner };
      }
    }
  }
  return null;
}

// ── Angle entre deux vecteurs ──
function angleBetween(ax,ay,bx,by) {
  const dot = ax*bx + ay*by;
  const magA = Math.hypot(ax,ay), magB = Math.hypot(bx,by);
  if(magA===0||magB===0) return 0;
  return Math.acos(Math.max(-1,Math.min(1,dot/(magA*magB)))) * 180/Math.PI;
}

// ── LaTeX → texte simple (partagé) ──
function latexToText(s) {
  if(!s) return '';
  return s
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g,'($1)/($2)')
    .replace(/\\hat\{([^}]+)\}/g,'$1̂').replace(/\\bar\{([^}]+)\}/g,'$1̄')
    .replace(/\\sqrt\{([^}]+)\}/g,'√($1)')
    .replace(/\\sum_\{[^}]+\}\^\{[^}]+\}/g,'∑').replace(/\\sum/g,'∑')
    .replace(/\\int/g,'∫').replace(/\\times/g,'×').replace(/\\cdot/g,'·')
    .replace(/\\leq/g,'≤').replace(/\\geq/g,'≥').replace(/\\neq/g,'≠')
    .replace(/\\alpha/g,'α').replace(/\\beta/g,'β').replace(/\\gamma/g,'γ')
    .replace(/\\delta/g,'δ').replace(/\\sigma/g,'σ').replace(/\\mu/g,'μ')
    .replace(/\\lambda/g,'λ').replace(/\\pi/g,'π').replace(/\\theta/g,'θ')
    .replace(/\\phi/g,'φ').replace(/\\infty/g,'∞').replace(/\\pm/g,'±')
    .replace(/\\approx/g,'≈').replace(/\\in/g,'∈').replace(/\\rho/g,'ρ')
    .replace(/\^2/g,'²').replace(/\^3/g,'³')
    .replace(/\\\{/g,'{').replace(/\\\}/g,'}')
    .replace(/\\[a-z]+/g,'');
}
