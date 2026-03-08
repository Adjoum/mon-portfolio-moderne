/**
 * InkSpace v3 — Tools & Interactions
 * Gère tous les outils : dessin, sélection, graphes, angles
 */

'use strict';

const Tools = {
  current: 'pen',
  color: '#1a1a2a',
  size: 3,
  opacity: 1,

  // ── état temporaire ──
  _drawing: false,
  _panning: false,
  _currentObj: null,   // objet en cours de création
  _bezierPts: [],
  _spaceHeld: false,
  _graphMode: null,    // 'node' | 'edge' | null
  _pendingEdgeFrom: null,
  _anglePhase: 0,      // 0=centre, 1=premier bras, 2=second bras
  _angleObj: null,
  _stickerPos: null,

  // sélection
  _selectedIds: new Set(),
  _dragOffsets: [],    // [{id, dx, dy}]
  _isDraggingSelection: false,
  _selBoxStart: null,

  // ── Init ──
  init(canvas) {
    this._canvas = canvas;
    canvas.addEventListener('mousedown',  e => this.onDown(e));
    canvas.addEventListener('mousemove',  e => this.onMove(e));
    canvas.addEventListener('mouseup',    e => this.onUp(e));
    canvas.addEventListener('mouseleave', e => this.onUp(e));
    canvas.addEventListener('contextmenu',e => this.onCtxMenu(e));
    canvas.addEventListener('wheel',      e => this.onWheel(e), {passive:false});
    canvas.addEventListener('touchstart', e => { e.preventDefault(); this.onDown(this._touchEvt(e)); }, {passive:false});
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); this.onMove(this._touchEvt(e)); }, {passive:false});
    canvas.addEventListener('touchend',   e => { e.preventDefault(); this.onUp(this._touchEvt(e)); }, {passive:false});

    // Drag & drop image
    canvas.parentElement.addEventListener('dragover', e => { e.preventDefault(); canvas.parentElement.classList.add('drag-over'); });
    canvas.parentElement.addEventListener('dragleave', () => canvas.parentElement.classList.remove('drag-over'));
    canvas.parentElement.addEventListener('drop', e => this.onDrop(e));

    // Clavier
    document.addEventListener('keydown', e => this.onKeyDown(e));
    document.addEventListener('keyup',   e => this.onKeyUp(e));
  },

  _touchEvt(e) { return { clientX:e.touches[0]?.clientX||e.changedTouches[0]?.clientX, clientY:e.touches[0]?.clientY||e.changedTouches[0]?.clientY, button:0, preventDefault:()=>e.preventDefault() }; },

  // ── Pos helpers ──
  _screen(e) {
    const r = this._canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  },
  _world(e) {
    const { sx, sy } = this._screen(e);
    return Viewport.screenToWorld(sx, sy);
  },

  // ── Outil actif ──
  set(tool) {
    this.current = tool;
    this._bezierPts = [];
    this._pendingEdgeFrom = null;
    this._anglePhase = 0;
    this._angleObj = null;
    this._graphMode = ['graph-node','graph-edge'].includes(tool) ? tool.replace('graph-','') : null;
    UI.updateToolbar(tool);
    UI.updateCursor(tool);
  },

  // ════════════════════════════════════════════
  //  EVENTS
  // ════════════════════════════════════════════
    onDown(e) {
    if(e.button === 1) { this._startPan(e); return; }
    if(e.button !== 0) return;
    UI.hideCtxMenu();
    const { sx, sy } = this._screen(e);
    const { x: wx, y: wy } = Viewport.screenToWorld(sx, sy);

    if(this._spaceHeld || this.current === 'pan') { this._startPan(e); return; }
    if(this.current === 'text')    { UI.openTextInput(wx, wy); return; }
    if(this.current === 'formula') { UI.openFxInput(wx, wy); return; }
    if(this.current === 'sticker') { UI.showStickerPicker(wx, wy, sx, sy); return; }
    if(this.current === 'image')   { UI.triggerImageUpload(); return; }
    if(this.current === 'select')  { this._startSelect(e, wx, wy); return; }
    if(this.current === 'graph-node') { this._placeGraphNode(wx, wy); return; }
    if(this.current === 'graph-edge') { this._startGraphEdge(wx, wy); return; }
    /*if(this.current === 'angle')   { this._handleAngleClick(wx, wy); return; }
    if(this.current === 'bezier')  { this._handleBezierClick(wx, wy); return; }  */
    if(this.current === 'angle' || this.current === 'bezier') {
      // Dessin à main levée — démarrer le tracé
      this._drawing = true;
      this._startX = wx; this._startY = wy;
      this._currentObj = {
        type: 'path', tool: 'pen',
        color: this.color, size: this.size,
        opacity: this.opacity, smooth: true,
        points: [{x:wx, y:wy}],
      };
      return;
    }

    this._drawing = true;
    this._startX = wx; this._startY = wy;
    this._currentObj = null; // reset

    const FREE_TOOLS = ['pen','brush','marker','calligraphy','eraser'];
    if(FREE_TOOLS.includes(this.current)) {
      this._currentObj = {
        type: 'path', tool: this.current,
        color: this.current === 'eraser' ? '#eraser' : this.color,
        size: this.size,
        opacity: this.current === 'eraser' ? 1 : this.opacity,
        smooth: true,
        eraser: this.current === 'eraser',
        points: [{x:wx,y:wy}],
      };
    }
    // Pour les shapes : _currentObj reste null, on le construit dans onMove
  },

    onMove(e) {
    const { sx, sy } = this._screen(e);
    const { x: wx, y: wy } = Viewport.screenToWorld(sx, sy);

    if(this.current === 'laser') { UI.moveLaser(sx, sy); return; }
    if(this.current === 'eraser') UI.moveEraserCursor(sx, sy);

    this._handleHover(wx, wy, sx, sy);

    if(this._panning) {
      Viewport.panX = sx - this._panStartSX;
      Viewport.panY = sy - this._panStartSY;
      App.render(); return;
    }

    // ── Resize image ──
    if(this._resizing && this._resizeObj) {
      const o = this._resizeObj;
      const dx = wx - this._resizeStartWx;
      const dy = wy - this._resizeStartWy;
      const c  = this._resizeCorner;
      const MIN = 20;

      if(c === 'BR') {
        o.w = Math.max(MIN, this._resizeOrigW + dx);
        o.h = Math.max(MIN, this._resizeOrigH + dy);
      } else if(c === 'TR') {
        o.w = Math.max(MIN, this._resizeOrigW + dx);
        const newH = Math.max(MIN, this._resizeOrigH - dy);
        o.y = this._resizeOrigY + (this._resizeOrigH - newH);
        o.h = newH;
      } else if(c === 'TL') {
        const newW = Math.max(MIN, this._resizeOrigW - dx);
        const newH = Math.max(MIN, this._resizeOrigH - dy);
        o.x = this._resizeOrigX + (this._resizeOrigW - newW);
        o.y = this._resizeOrigY + (this._resizeOrigH - newH);
        o.w = newW; o.h = newH;
      } else if(c === 'BL') {
        const newW = Math.max(MIN, this._resizeOrigW - dx);
        o.x = this._resizeOrigX + (this._resizeOrigW - newW);
        o.w = newW;
        o.h = Math.max(MIN, this._resizeOrigH + dy);
      } else if(c === 'R') {
        o.w = Math.max(MIN, this._resizeOrigW + dx);
      } else if(c === 'L') {
        const newW = Math.max(MIN, this._resizeOrigW - dx);
        o.x = this._resizeOrigX + (this._resizeOrigW - newW);
        o.w = newW;
      } else if(c === 'B') {
        o.h = Math.max(MIN, this._resizeOrigH + dy);
      } else if(c === 'T') {
        const newH = Math.max(MIN, this._resizeOrigH - dy);
        o.y = this._resizeOrigY + (this._resizeOrigH - newH);
        o.h = newH;
      }

      // Shift = proportionnel
      if(e.shiftKey && (c==='BR'||c==='TR'||c==='TL'||c==='BL')) {
        const ratio = this._resizeOrigW / this._resizeOrigH;
        if(Math.abs(dx) > Math.abs(dy)) o.h = o.w / ratio;
        else o.w = o.h * ratio;
      }

      App.render(); return;
    }

    // ── Curseur adaptatif sur les poignées ──
    if(this.current === 'select' && !this._isDraggingSelection) {
      const rh = getResizeHandle(wx, wy);
      if(rh) {
        const cursors = {TL:'nw-resize',TR:'ne-resize',BR:'se-resize',BL:'sw-resize',T:'n-resize',R:'e-resize',B:'s-resize',L:'w-resize'};
        document.getElementById('canvas-wrap').style.cursor = cursors[rh.corner] || 'crosshair';
      } else {
        const hits = Scene.hitTest(wx, wy, 8/Viewport.zoom);
        document.getElementById('canvas-wrap').style.cursor = hits.length ? 'move' : 'default';
      }
    }

    if(!this._drawing) {
      if(this._isDraggingSelection) {
        this._dragOffsets.forEach(({id, dx, dy}) => {
          const o = Scene.objects.find(obj => obj.id === id);
          if(o) moveObject(o, wx + dx, wy + dy);
        });
        App.render(); return;
      }
      if(this._selBoxStart) {
        UI.drawSelectionBox(this._selBoxStart.sx, this._selBoxStart.sy, sx, sy);
        return;
      }
      return;
    }

    const SHAPE_TOOLS = ['line','arrow','dblarrow','rect','rect-fill','circle','circle-fill',
        'triangle','diamond','parallelogram','pentagon','hexagon','star','cube','prism','cylinder'];

    if(this._currentObj && !SHAPE_TOOLS.includes(this.current)) {
      // Tracé libre : ajouter le point
      if(this.current === 'calligraphy') {
        const last = this._currentObj.points[this._currentObj.points.length-1];
        const angle = Math.atan2(wy-last.y, wx-last.x);
        const w = Math.max(1, this.size * Math.abs(Math.cos(angle - Math.PI/4)) * 4 + 1);
        this._currentObj.points.push({x:wx, y:wy, w});
      } else {
        this._currentObj.points.push({x:wx, y:wy});
      }
    }

    if(SHAPE_TOOLS.includes(this.current)) {
      // Construire l'objet shape en temps réel pour la preview
      this._currentObj = this._buildShapeObj(this._startX, this._startY, wx, wy);
    }

    // Rendu : scène + objet courant en overlay
    App.render();
    if(this._currentObj) {
      const oCtx = App.getOverlayCtx();
      Renderer.drawObject(oCtx, this._currentObj, {});
      Viewport.reset(oCtx);
    }
  },

  onUp(e) {
    const { sx, sy } = this._screen(e);
    const { x: wx, y: wy } = Viewport.screenToWorld(sx, sy);

    if(this._panning) {
      this._panning = false;
      this._canvas.parentElement.classList.remove('grabbing');
      UI.updateCursor(this.current); return;
    }

    if(this._resizing) {
      this._resizing = false;
      this._resizeObj = null;
      App.pushUndo(); App.scheduleSave();
      return;
    }

    if(this._isDraggingSelection) {
      this._isDraggingSelection = false;
      App.pushUndo(); App.scheduleSave(); return;
    }

    if(this._selBoxStart) {
      this._finishSelectionBox(wx, wy);
      this._selBoxStart = null;
      UI.hideSelectionBox();
      App.render(); return;
    }

    if(!this._drawing) return;
    this._drawing = false;

    const SHAPE_TOOLS = ['line','arrow','dblarrow','rect','rect-fill','circle','circle-fill',
      'triangle','diamond','parallelogram','pentagon','hexagon','star','cube','prism','cylinder'];

    if(this._currentObj) {
      if(this._currentObj.eraser) {
        this._applyEraser(this._currentObj.points);
      } else if(SHAPE_TOOLS.includes(this.current)) {
        const final = this._buildShapeObj(this._startX, this._startY, wx, wy);
        if(final && (Math.abs(wx - this._startX) > 3 || Math.abs(wy - this._startY) > 3)) {
          Scene.add(final);
        }
      } else if(this.current === 'angle') {
        // Détecter le sommet et créer l'objet angle
        this._finalizeAngleFreehand(this._currentObj.points);
      } else if(this.current === 'bezier') {
        // Fitter une courbe de Bézier sur le tracé
        this._finalizeBezierFreehand(this._currentObj.points);
      } else {
        if(this._currentObj.points && this._currentObj.points.length > 1) {
          Scene.add(this._currentObj);
        } else if(this._currentObj.points && this._currentObj.points.length === 1) {
          this._currentObj.points.push({x: wx+1, y: wy+1});
          Scene.add(this._currentObj);
        }
      }
    }

    this._currentObj = null;
    App.render();
    App.pushUndo(); App.scheduleSave();
  },

  // ── Hover → infobulle ──
  _hoverTimer: null,
  _handleHover(wx, wy, sx, sy) {
    clearTimeout(this._hoverTimer);
    const hits = Scene.hitTest(wx, wy, 8/Viewport.zoom);
    if(hits.length) {
      this._hoverTimer = setTimeout(() => {
        UI.showTooltip(hits[0], sx, sy);
      }, 400);
    } else {
      UI.hideTooltip();
    }
  },

  onWheel(e) {
    e.preventDefault();
    const { sx, sy } = this._screen(e);
    const factor = e.deltaY < 0 ? 0.1 : -0.1;
    Viewport.zoomAt(sx, sy, factor);
    UI.updateZoomDisplay();
    App.render();
  },

  onCtxMenu(e) { e.preventDefault(); UI.showCtxMenu(e.clientX, e.clientY); },

  onDrop(e) {
    e.preventDefault();
    document.getElementById('canvas-wrap').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if(file?.type.startsWith('image/')) {
      const r = this._canvas.getBoundingClientRect();
      const { x: wx, y: wy } = Viewport.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      App.insertImageFile(file, wx, wy);
    }
  },

  // ════════════════════════════════════════════
  //  PAN
  // ════════════════════════════════════════════
  _startPan(e) {
    const { sx, sy } = this._screen(e);
    this._panning = true;
    this._panStartSX = sx - Viewport.panX;
    this._panStartSY = sy - Viewport.panY;
    this._canvas.parentElement.classList.add('grabbing');
  },

  // ════════════════════════════════════════════
  //  SHAPES PREVIEW & BUILD
  // ════════════════════════════════════════════
  _previewShape(wx, wy) {
    const o = this._buildShapeObj(this._startX, this._startY, wx, wy);
    if(o) this._currentObj = o;
  },

  _buildShapeObj(x1, y1, x2, y2) {
    const base = { color: this.color, size: this.size, opacity: this.opacity, x1, y1, x2, y2 };
    const t = this.current;
    if(['line','arrow','dblarrow','rect','rect-fill','circle','circle-fill',
        'triangle','diamond','parallelogram','pentagon','hexagon','star',
        'cube','prism','cylinder'].includes(t))
      return { ...base, type: t };
    return null;
  },

  // ════════════════════════════════════════════
  //  SELECTION
  // ════════════════════════════════════════════

  _startSelect(e, wx, wy) {
    const { sx, sy } = this._screen(e);

    // Double-clic → éditer le texte
    if(e.detail === 2) {
      const hits = Scene.hitTest(wx, wy, 8/Viewport.zoom);
      const textObj = hits.find(o => o.type === 'text');
      if(textObj) { this._editTextObject(textObj); return; };
      const codeObj = hits.find(o => o.type === 'code');
      if(codeObj) { openCodeModal(codeObj); return; }
    }

    // Vérifier d'abord si on clique sur une poignée de resize
    const resizeH = getResizeHandle(wx, wy);
    if(resizeH) {
      this._resizing = true;
      this._resizeObj = resizeH.obj;
      this._resizeCorner = resizeH.corner;
      this._resizeStartWx = wx;
      this._resizeStartWy = wy;
      this._resizeOrigX = resizeH.obj.x;
      this._resizeOrigY = resizeH.obj.y;
      this._resizeOrigW = resizeH.obj.w;
      this._resizeOrigH = resizeH.obj.h;
      return;
    }

    const hits = Scene.hitTest(wx, wy, 8/Viewport.zoom);
    if(hits.length) {
      const topObj = hits[0];
      if(!this._selectedIds.has(topObj.id)) {
        this._selectedIds = new Set([topObj.id]);
      }
      this._isDraggingSelection = true;
      this._dragOffsets = [];
      this._selectedIds.forEach(id => {
        const o = Scene.objects.find(obj => obj.id === id);
        if(o) {
          const c = getCenter(o);
          if(c) this._dragOffsets.push({ id, dx: c.cx - wx, dy: c.cy - wy });
        }
      });
    } else {
      this._selectedIds = new Set();
      this._selBoxStart = { sx, sy, wx, wy };
    }
    App.render();
  },

  _editTextObject(obj) {
    // Stocker la référence à l'objet en cours d'édition
    this._editingId = obj.id;
    // Cacher l'objet pendant l'édition
    obj.hidden = true;
    App.render();

    const { x: sx, y: sy } = Viewport.worldToScreen(obj.x, obj.y - (obj.fontSize||18));
    const box = document.getElementById('text-box');
    const ta  = document.getElementById('text-ta');

    box.style.display = 'block';
    box.style.left = Math.min(sx, window.innerWidth - 340) + 'px';
    box.style.top  = Math.max(10, sy - 60) + 'px';
    box.dataset.wx = obj.x;
    box.dataset.wy = obj.y - (obj.fontSize||18);
    box.dataset.editingId = obj.id;

    // Restaurer les paramètres de l'objet
    _txtState.size   = obj.fontSize || 18;
    _txtState.color  = obj.color || '#1a1a2a';
    _txtState.bold   = obj.bold   || false;
    _txtState.italic = obj.italic || false;
    _txtState.under  = obj.underline || false;
    _txtState.align  = obj.align  || 'left';
    _txtState.font   = obj.fontFamily || 'Cabinet Grotesk, sans-serif';
    _applyTxtState();

    ta.value = obj.text || '';
    ta.focus();
    ta.select();
  },
  _finishSelectionBox(wx2, wy2) {
    const { wx: wx1, wy: wy1 } = this._selBoxStart;
    const minX=Math.min(wx1,wx2), maxX=Math.max(wx1,wx2);
    const minY=Math.min(wy1,wy2), maxY=Math.max(wy1,wy2);
    this._selectedIds = new Set();
    Scene.objects.forEach(o => {
      const bb = getBoundingBox(o);
      if(bb && bb.x>=minX && bb.x+bb.w<=maxX && bb.y>=minY && bb.y+bb.h<=maxY)
        this._selectedIds.add(o.id);
    });
  },

  deleteSelected() {
    if(!this._selectedIds.size) return;
    this._selectedIds.forEach(id => Scene.remove(id));
    this._selectedIds = new Set();
    App.render(); App.pushUndo(); App.scheduleSave();
    UI.toast('Éléments supprimés', 'info');
  },

  // ════════════════════════════════════════════
  //  GRAPHES
  // ════════════════════════════════════════════
  _nodeCounter: 1,

  _placeGraphNode(wx, wy) {
    const label = String.fromCharCode(64 + this._nodeCounter);
    this._nodeCounter++;
    const obj = Scene.add({
      type: 'graph-node',
      x: wx, y: wy, r: 22,
      label,
      color: this.color,
      fillColor: this.color + '22',
      size: this.size,
      opacity: this.opacity,
    });
    App.render(); App.pushUndo(); App.scheduleSave();
    UI.toast(`Nœud ${label} placé`, 'info');
  },

  _startGraphEdge(wx, wy) {
    // Cherche un nœud proche
    const node = Scene.objects.find(o => o.type==='graph-node' && Math.hypot(o.x-wx,o.y-wy) <= (o.r||22)+10);
    if(!node) { UI.toast('Cliquez sur un nœud existant pour commencer l\'arête', 'error'); return; }

    if(!this._pendingEdgeFrom) {
      this._pendingEdgeFrom = node;
      UI.toast(`Arête depuis ${node.label} — cliquez sur le nœud cible`, 'info');
    } else {
      const from = this._pendingEdgeFrom, to = node;
      const directed = document.getElementById('chk-directed')?.checked ?? true;
      const weightVal = document.getElementById('edge-weight')?.value;
      const weight = weightVal ? parseFloat(weightVal) : null;

      // Vérifie si une arête existe déjà dans l'autre sens (pour courbure)
      const reverse = Scene.objects.find(o =>
        o.type==='graph-edge' && o.fromId===to.id && o.toId===from.id
      );

      Scene.add({
        type: 'graph-edge',
        fromId: from.id, toId: to.id,
        x1: from.x, y1: from.y,
        x2: to.x, y2: to.y,
        nodeRadius: from.r||22,
        directed,
        curved: !!reverse,
        weight,
        selfLoop: from.id === to.id,
        color: this.color,
        size: this.size,
        opacity: this.opacity,
      });
      this._pendingEdgeFrom = null;
      App.render(); App.pushUndo(); App.scheduleSave();
      UI.toast('Arête créée ✓', 'success');
    }
  },

  // Met à jour les positions des arêtes si un nœud est déplacé
  syncEdges() {
    Scene.objects.forEach(o => {
      if(o.type !== 'graph-edge') return;
      const from = Scene.objects.find(n => n.id === o.fromId);
      const to   = Scene.objects.find(n => n.id === o.toId);
      if(from) { o.x1 = from.x; o.y1 = from.y; }
      if(to)   { o.x2 = to.x;   o.y2 = to.y;   }
    });
  },

  // ════════════════════════════════════════════
  //  ANGLE TOOL  (3 clics : centre, bras1, bras2)
  // ════════════════════════════════════════════
  _handleAngleClick(wx, wy) {
    if(this._anglePhase === 0) {
      this._angleObj = { type:'angle', x:wx, y:wy, x1:wx, y1:wy-60, x2:wx+60, y2:wy, color:this.color, size:this.size, opacity:this.opacity };
      this._anglePhase = 1;
      UI.toast('Cliquez pour le premier bras de l\'angle', 'info');
    } else if(this._anglePhase === 1) {
      this._angleObj.x1 = wx; this._angleObj.y1 = wy;
      this._anglePhase = 2;
      UI.toast('Cliquez pour le second bras de l\'angle', 'info');
    } else {
      this._angleObj.x2 = wx; this._angleObj.y2 = wy;
      Scene.add(this._angleObj);
      this._anglePhase = 0; this._angleObj = null;
      App.render(); App.pushUndo(); App.scheduleSave();
      UI.toast('Angle tracé ✓', 'success');
    }
  },

  // ════════════════════════════════════════════
  //  BÉZIER TOOL  (4 clics)
  // ════════════════════════════════════════════
  _handleBezierClick(wx, wy) {
    this._bezierPts.push({x:wx,y:wy});
    const n = this._bezierPts.length;
    const labels = ['Point de départ','Point de contrôle 1','Point de contrôle 2','Point d\'arrivée — Courbe tracée !'];
    UI.toast(labels[n-1]||'', 'info');
    if(n === 4) {
      const [p0,p1,p2,p3] = this._bezierPts;
      Scene.add({ type:'bezier', p0,p1,p2,p3, color:this.color, size:this.size, opacity:this.opacity });
      this._bezierPts = [];
      App.render(); App.pushUndo(); App.scheduleSave();
    }
  },

  // ── Angle à main levée ──
  // Algorithme : trouver le point de courbure maximale = sommet
  _finalizeAngleFreehand(points) {
    if(points.length < 6) {
      UI.toast('Tracé trop court pour détecter un angle', 'error');
      return;
    }

    // Sous-échantillonner pour robustesse
    const pts = subsample(points, 40);

    // Trouver le point avec la courbure maximale
    // = là où le vecteur change de direction le plus brusquement
    let maxCurv = -1, apexIdx = Math.floor(pts.length / 2);
    for(let i = 2; i < pts.length - 2; i++) {
      const prev = pts[i - 2], curr = pts[i], next = pts[i + 2];
      // Vecteur entrant et sortant
      const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
      const v2x = next.x - curr.x, v2y = next.y - curr.y;
      const len1 = Math.hypot(v1x, v1y), len2 = Math.hypot(v2x, v2y);
      if(len1 < 1 || len2 < 1) continue;
      // Cosinus de l'angle entre les deux vecteurs
      const dot = (v1x*v2x + v1y*v2y) / (len1 * len2);
      const curv = 1 - Math.max(-1, Math.min(1, dot)); // 0=droit, 2=demi-tour
      if(curv > maxCurv) { maxCurv = curv; apexIdx = i; }
    }

    const apex  = pts[apexIdx];
    const start = pts[0];
    const end   = pts[pts.length - 1];

    // Créer l'objet angle
    const obj = {
      type: 'angle',
      x: apex.x, y: apex.y,   // sommet
      x1: start.x, y1: start.y, // bras 1
      x2: end.x,   y2: end.y,   // bras 2
      color: this.color,
      size: this.size,
      opacity: this.opacity,
    };

    Scene.add(obj);
    App.render();
    App.pushUndo(); App.scheduleSave();

    // Toast avec la valeur
    const deg = angleBetween(
      start.x - apex.x, start.y - apex.y,
      end.x   - apex.x, end.y   - apex.y
    );
    UI.toast(`Angle détecté : ${deg.toFixed(1)}°`, 'success');
  },

  // ── Bézier à main levée ──
  // Algorithme : fit cubique de Schneider (simplifié)
  // On prend 4 points clés : début, 1/3, 2/3, fin
  // et on calcule les points de contrôle pour coller au tracé
  _finalizeBezierFreehand(points) {
    if(points.length < 4) {
      UI.toast('Tracé trop court', 'error');
      return;
    }

    const pts = subsample(points, 60);
    const n = pts.length - 1;

    const p0 = pts[0];
    const p3 = pts[n];

    // Points 1/3 et 2/3 du tracé
    const t1 = pts[Math.floor(n * 0.33)];
    const t2 = pts[Math.floor(n * 0.66)];

    // Résolution du système linéaire pour trouver p1 et p2
    // B(t) = (1-t)³p0 + 3t(1-t)²p1 + 3t²(1-t)p2 + t³p3
    // À t=1/3 : B(1/3) ≈ t1  →  p1 et p2 inconnus
    // À t=2/3 : B(2/3) ≈ t2
    const solve = (t, q0, q3, qt) => {
      // Coefficients pour p1 et p2
      const c1 = 3 * t * (1-t) * (1-t);
      const c2 = 3 * t * t * (1-t);
      const rhs = qt - Math.pow(1-t,3)*q0 - Math.pow(t,3)*q3;
      return { c1, c2, rhs };
    };

    const ex1 = solve(1/3, p0.x, p3.x, t1.x);
    const ey1 = solve(1/3, p0.y, p3.y, t1.y);
    const ex2 = solve(2/3, p0.x, p3.x, t2.x);
    const ey2 = solve(2/3, p0.y, p3.y, t2.y);

    // Résoudre le système 2x2 : ex1.c1*p1x + ex1.c2*p2x = ex1.rhs
    //                            ex2.c1*p1x + ex2.c2*p2x = ex2.rhs
    const detX = ex1.c1*ex2.c2 - ex1.c2*ex2.c1;
    const detY = ey1.c1*ey2.c2 - ey1.c2*ey2.c1;

    let p1, p2;
    if(Math.abs(detX) < 0.001 || Math.abs(detY) < 0.001) {
      // Dégénéré → points de contrôle simples aux tiers
      p1 = { x: p0.x + (p3.x-p0.x)/3, y: p0.y + (p3.y-p0.y)/3 };
      p2 = { x: p0.x + (p3.x-p0.x)*2/3, y: p0.y + (p3.y-p0.y)*2/3 };
    } else {
      p1 = {
        x: (ex1.rhs*ex2.c2 - ex1.c2*ex2.rhs) / detX,
        y: (ey1.rhs*ey2.c2 - ey1.c2*ey2.rhs) / detY,
      };
      p2 = {
        x: (ex1.c1*ex2.rhs - ex1.rhs*ex2.c1) / detX,
        y: (ey1.c1*ey2.rhs - ey1.rhs*ey2.c1) / detY,
      };
    }

    Scene.add({
      type: 'bezier',
      p0, p1, p2, p3,
      color: this.color,
      size: this.size,
      opacity: this.opacity,
    });

    App.render();
    App.pushUndo(); App.scheduleSave();
    UI.toast('Courbe de Bézier ajustée ✓', 'success');
  },

  // ════════════════════════════════════════════
  //  ERASER
  // ════════════════════════════════════════════
  _applyEraser(pts) {
    const margin = (this.size * 3) / Viewport.zoom;
    const toRemove = new Set();
    pts.forEach(p => {
      Scene.objects.forEach(o => {
        if(objectHitTest(o, p.x, p.y, margin)) toRemove.add(o.id);
      });
    });
    toRemove.forEach(id => Scene.remove(id));
    if(toRemove.size) { App.pushUndo(); App.scheduleSave(); }
  },

  // ════════════════════════════════════════════
  //  KEYBOARD
  // ════════════════════════════════════════════
  onKeyDown(e) {
    const tag = e.target.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA') return;

    if(e.ctrlKey||e.metaKey) {
      if(e.key==='z') { e.preventDefault(); App.undo(); return; }
      if(e.key==='y'||(e.shiftKey&&e.key==='Z')) { e.preventDefault(); App.redo(); return; }
      if(e.key==='k') { e.preventDefault(); UI.openCmd(); return; }
      if(e.key==='t') { e.preventDefault(); App.newWorkspace(); return; }
      if(e.key==='g') { e.preventDefault(); App.cycleGrid(); return; }
      if(e.key==='s') { e.preventDefault(); App.scheduleSave(); return; }
      if(e.key==='e') { e.preventDefault(); App.exportPNG(); return; }
      if(e.key==='a') { e.preventDefault(); this._selectAll(); return; }
      if(e.shiftKey&&e.key==='C') { UI.launchConfetti(); return; }
    }
    if(e.key===' ') { e.preventDefault(); this._spaceHeld=true; this._canvas.parentElement.classList.add('grab'); }
    if(e.key==='Escape') { this._bezierPts=[]; this._anglePhase=0; this._selectedIds=new Set(); this._pendingEdgeFrom=null; UI.closeAll(); App.render(); }
    if(e.key==='Delete'||e.key==='Backspace') this.deleteSelected();
    if(e.key==='+'||e.key==='=') { Viewport.zoomIn(); UI.updateZoomDisplay(); App.render(); }
    if(e.key==='-') { Viewport.zoomOut(); UI.updateZoomDisplay(); App.render(); }

    const map={p:'pen',b:'brush',m:'marker',g:'calligraphy',e:'eraser',l:'line',a:'arrow',r:'rect',c:'circle',t:'text',f:'formula',s:'select',v:'pan',k:'laser',q:'angle'};
    const k=e.key.toLowerCase();
    if(map[k]) this.set(map[k]);
  },

  onKeyUp(e) {
    if(e.key===' ') {
      this._spaceHeld=false;
      this._canvas.parentElement.classList.remove('grab');
      if(this.current!=='pan') UI.updateCursor(this.current);
    }
  },

  _selectAll() {
    this._selectedIds = new Set(Scene.objects.map(o=>o.id));
    App.render();
  },
};

// ── Déplacer un objet vers (cx, cy) ──
function moveObject(o, cx, cy) {
  const c = getCenter(o);
  if(!c) return;
  const dx = cx - c.cx, dy = cy - c.cy;
  shiftObject(o, dx, dy);
  // Si c'est un nœud, on synchronise ses arêtes
  if(o.type === 'graph-node') Tools.syncEdges();
}

function getCenter(o) {
  const bb = getBoundingBox(o);
  if(bb) return { cx: bb.x + bb.w/2, cy: bb.y + bb.h/2 };
  if(o.type==='graph-node') return {cx:o.x,cy:o.y};
  return null;
}

function shiftObject(o, dx, dy) {
  if(o.type==='path') { o.points.forEach(p=>{p.x+=dx;p.y+=dy;}); return; }
  if(o.type==='graph-node') { o.x+=dx; o.y+=dy; return; }
  if(o.type==='bezier') { ['p0','p1','p2','p3'].forEach(k=>{o[k].x+=dx;o[k].y+=dy;}); return; }
  if(o.type==='image') { o.x+=dx; o.y+=dy; return; }
  if(o.type==='code')  { o.x+=dx; o.y+=dy; return; } 
  if('x1' in o) { o.x1+=dx; o.x2+=dx; o.y1+=dy; o.y2+=dy; return; }
  if('x' in o) { o.x+=dx; o.y+=dy; }
}
