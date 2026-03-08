/**
 * InkSpace v3 — Engine Core
 * Scene graph + viewport transform system
 * Tous les objets sont stockés en coordonnées "monde"
 * Le viewport applique zoom+pan à TOUT le rendu
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  VIEWPORT — gère le zoom et le pan globaux
// ═══════════════════════════════════════════════════════════════
const Viewport = {
  zoom: 1,
  panX: 0,
  panY: 0,
  MIN_ZOOM: 0.05,
  MAX_ZOOM: 10,

  // Transforme coord écran → monde
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.panX) / this.zoom,
      y: (sy - this.panY) / this.zoom,
    };
  },

  // Transforme coord monde → écran
  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoom + this.panX,
      y: wy * this.zoom + this.panY,
    };
  },

  // Applique la transformation au contexte avant tout dessin
  apply(ctx) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
  },

  // Reset du contexte
  reset(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  // Zoom centré sur un point écran
  zoomAt(screenX, screenY, delta) {
    const wBefore = this.screenToWorld(screenX, screenY);
    this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * (1 + delta)));
    const wAfter = this.screenToWorld(screenX, screenY);
    this.panX += (wAfter.x - wBefore.x) * this.zoom;
    this.panY += (wAfter.y - wBefore.y) * this.zoom;
  },

  zoomIn()  { this.zoom = Math.min(this.MAX_ZOOM, this.zoom * 1.12); },
  zoomOut() { this.zoom = Math.max(this.MIN_ZOOM, this.zoom / 1.12); },
  reset2()  { this.zoom = 1; this.panX = 0; this.panY = 0; },

  getPercent() { return Math.round(this.zoom * 100); },
};

// ═══════════════════════════════════════════════════════════════
//  SCENE — liste d'objets vectoriels
// ═══════════════════════════════════════════════════════════════
const Scene = {
  objects: [],   // tableau d'objets
  _nextId: 1,

  add(obj) {
    obj.id = this._nextId++;
    this.objects.push(obj);
    return obj;
  },

  remove(id) {
    this.objects = this.objects.filter(o => o.id !== id);
  },

  clear() { this.objects = []; this._nextId = 1; },

  // Retourne les objets sous un point monde (du dessus vers le bas)
  hitTest(wx, wy, margin = 8) {
    const hits = [];
    for(let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if(objectHitTest(o, wx, wy, margin)) hits.push(o);
    }
    return hits;
  },

  serialize() {
    return JSON.stringify(this.objects.map(o => ({...o})));
  },

  deserialize(json) {
    try {
      const arr = JSON.parse(json);
      this.objects = arr;
      this._nextId = arr.reduce((m,o) => Math.max(m, o.id||0), 0) + 1;
    } catch(e) { console.error('Scene.deserialize:', e); }
  },
};

// ═══════════════════════════════════════════════════════════════
//  HIT TESTING par type d'objet
// ═══════════════════════════════════════════════════════════════
function objectHitTest(o, wx, wy, margin) {
  switch(o.type) {
    case 'path':     return pathHitTest(o, wx, wy, margin);
    case 'line':     return lineHitTest(o.x1,o.y1,o.x2,o.y2, wx,wy, margin);
    case 'arrow':
    case 'dblarrow': return lineHitTest(o.x1,o.y1,o.x2,o.y2, wx,wy, margin);
    case 'rect':
    case 'rect-fill':return rectHitTest(o, wx, wy, margin);
    case 'circle':
    case 'circle-fill': return ellipseHitTest(o, wx, wy, margin);
    case 'triangle': return polyHitTest(trianglePoints(o), wx, wy, margin);
    case 'diamond':  return polyHitTest(diamondPoints(o), wx, wy, margin);
    case 'parallelogram': return polyHitTest(parallelogramPoints(o), wx, wy, margin);
    case 'pentagon': return polyHitTest(regularPolyPoints(o,5), wx, wy, margin);
    case 'hexagon':  return polyHitTest(regularPolyPoints(o,6), wx, wy, margin);
    case 'star':     return polyHitTest(starPoints(o,5), wx, wy, margin);
    case 'cube':     return rectHitTest({x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2}, wx, wy, margin+10);
    case 'prism':    return rectHitTest({x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2}, wx, wy, margin+10);
    case 'cylinder': return rectHitTest({x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2}, wx, wy, margin+10);
    case 'bezier':   return lineHitTest(o.p0.x,o.p0.y,o.p3.x,o.p3.y, wx,wy, margin+10);
    case 'text':     return textHitTest(o, wx, wy);
    case 'formula':  return textHitTest(o, wx, wy);
    case 'sticker':  return textHitTest(o, wx, wy);
    case 'image':    return rectHitTest({x1:o.x,y1:o.y,x2:o.x+o.w,y2:o.y+o.h}, wx, wy, margin);
    case 'graph-node': return dist(o.x,o.y,wx,wy) <= (o.r||20) + margin;
    case 'graph-edge': return lineHitTest(o.x1,o.y1,o.x2,o.y2, wx,wy, margin);
    case 'angle':    return lineHitTest(o.x1,o.y1,o.x,o.y, wx,wy, margin) || lineHitTest(o.x,o.y,o.x2,o.y2, wx,wy, margin);
    case 'code': return wx >= o.x && wx <= o.x + (o.w||520) 
                 && wy >= o.y && wy <= o.y + (o.h||200);
    default: return false;
  }
}

function dist(ax,ay,bx,by) { return Math.hypot(bx-ax, by-ay); }

function pathHitTest(o, wx, wy, margin) {
  const pts = o.points;
  if(!pts || pts.length < 2) return false;
  for(let i=1; i<pts.length; i++) {
    if(pointToSegDist(pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y,wx,wy) < margin + o.size/2)
      return true;
  }
  return false;
}

function lineHitTest(x1,y1,x2,y2,wx,wy,margin) {
  return pointToSegDist(x1,y1,x2,y2,wx,wy) < margin;
}

function rectHitTest(o, wx, wy, margin) {
  const minX = Math.min(o.x1,o.x2)-margin, maxX = Math.max(o.x1,o.x2)+margin;
  const minY = Math.min(o.y1,o.y2)-margin, maxY = Math.max(o.y1,o.y2)+margin;
  return wx>=minX && wx<=maxX && wy>=minY && wy<=maxY;
}

function ellipseHitTest(o, wx, wy, margin) {
  const rx = Math.abs(o.x2-o.x1)/2 + margin;
  const ry = Math.abs(o.y2-o.y1)/2 + margin;
  const cx = (o.x1+o.x2)/2, cy = (o.y1+o.y2)/2;
  return ((wx-cx)**2)/(rx**2) + ((wy-cy)**2)/(ry**2) <= 1;
}

function textHitTest(o, wx, wy) {
  const fs = o.fontSize || 18;
  return wx >= o.x - 5 && wx <= o.x + (o.textWidth||120) + 5
      && wy >= o.y - fs - 5 && wy <= o.y + 10;
}

function polyHitTest(pts, wx, wy, margin) {
  for(let i=0; i<pts.length; i++) {
    const next = pts[(i+1)%pts.length];
    if(pointToSegDist(pts[i].x,pts[i].y,next.x,next.y,wx,wy) < margin) return true;
  }
  return false;
}

function pointToSegDist(ax,ay,bx,by,px,py) {
  const dx=bx-ax, dy=by-ay;
  const lenSq = dx*dx+dy*dy;
  if(lenSq===0) return dist(ax,ay,px,py);
  let t = ((px-ax)*dx+(py-ay)*dy)/lenSq;
  t = Math.max(0,Math.min(1,t));
  return dist(ax+t*dx, ay+t*dy, px, py);
}

// ── Helpers géométriques pour les formes ──
function trianglePoints(o) {
  return [{x:(o.x1+o.x2)/2,y:o.y1},{x:o.x2,y:o.y2},{x:o.x1,y:o.y2}];
}
function diamondPoints(o) {
  const mx=(o.x1+o.x2)/2, my=(o.y1+o.y2)/2;
  return [{x:mx,y:o.y1},{x:o.x2,y:my},{x:mx,y:o.y2},{x:o.x1,y:my}];
}
function parallelogramPoints(o) {
  const off = (o.x2-o.x1)*0.2;
  return [{x:o.x1+off,y:o.y1},{x:o.x2,y:o.y1},{x:o.x2-off,y:o.y2},{x:o.x1,y:o.y2}];
}
function regularPolyPoints(o, n) {
  const cx=(o.x1+o.x2)/2, cy=(o.y1+o.y2)/2;
  const r=Math.min(Math.abs(o.x2-o.x1),Math.abs(o.y2-o.y1))/2;
  return Array.from({length:n},(_,i)=>{
    const a=(i/n)*Math.PI*2 - Math.PI/2;
    return {x:cx+Math.cos(a)*r, y:cy+Math.sin(a)*r};
  });
}
function starPoints(o, n) {
  const cx=(o.x1+o.x2)/2, cy=(o.y1+o.y2)/2;
  const R=Math.min(Math.abs(o.x2-o.x1),Math.abs(o.y2-o.y1))/2;
  const r=R*0.4;
  const pts=[];
  for(let i=0;i<n*2;i++){
    const a=(i/(n*2))*Math.PI*2 - Math.PI/2;
    const rad=i%2===0?R:r;
    pts.push({x:cx+Math.cos(a)*rad, y:cy+Math.sin(a)*rad});
  }
  return pts;
}
