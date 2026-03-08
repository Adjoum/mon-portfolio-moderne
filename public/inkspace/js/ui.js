/**
 * InkSpace v3 — UI Layer
 * Gère l'interface : barre d'outils, panneaux, modaux, toast, palette de commandes
 */

'use strict';

const UI = {
  // ── Toolbar ──
  updateToolbar(tool) {
    document.querySelectorAll('.tbtn[data-tool]').forEach(b => b.classList.remove('active'));
    const b = document.getElementById('tool-'+tool);
    if(b) b.classList.add('active');
  },

  updateCursor(tool) {
    const wrap = document.getElementById('canvas-wrap');
    wrap.className = '';
    const map = {
      pen:'crosshair-c',brush:'crosshair-c',marker:'crosshair-c',calligraphy:'crosshair-c',
      line:'crosshair-c',arrow:'crosshair-c',dblarrow:'crosshair-c',
      rect:'crosshair-c','rect-fill':'crosshair-c',
      circle:'crosshair-c','circle-fill':'crosshair-c',
      triangle:'crosshair-c',diamond:'crosshair-c',parallelogram:'crosshair-c',
      pentagon:'crosshair-c',hexagon:'crosshair-c',star:'crosshair-c',
      cube:'crosshair-c',prism:'crosshair-c',cylinder:'crosshair-c',
      bezier:'crosshair-c',angle:'crosshair-c',
      'graph-node':'cell-c','graph-edge':'cell-c',
      text:'text-c',formula:'crosshair-c',image:'cell-c',sticker:'cell-c',
      select:'default',pan:'grab-c',laser:'none',eraser:'eraser-c',
    };
    if(map[tool]) wrap.classList.add(map[tool]);
  },

  // ── Zoom ──
  updateZoomDisplay() {
    document.getElementById('zoom-val').textContent = Viewport.getPercent() + '%';
  },

  // ── Infobulle au survol ──
  _tooltip: null,
  showTooltip(obj, sx, sy) {
    let text = this._getTooltipText(obj);
    if(!text) return;
    let el = document.getElementById('hover-tooltip');
    if(!el) {
      el = document.createElement('div');
      el.id = 'hover-tooltip';
      el.style.cssText = `position:fixed;z-index:2000;background:var(--surface);border:1px solid var(--border2);
        border-radius:8px;padding:5px 10px;font-size:11px;font-family:var(--font-mono);
        color:var(--text);pointer-events:none;box-shadow:var(--shadow);max-width:220px;
        white-space:pre-line;line-height:1.5;`;
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.left = (sx+14)+'px';
    el.style.top  = (sy-10)+'px';
    el.style.display = 'block';
  },
  hideTooltip() {
    const el = document.getElementById('hover-tooltip');
    if(el) el.style.display = 'none';
  },
  
  _getTooltipText(o) {
    const labels = {
      path:`✏️ Tracé libre\nOutil: ${o.tool||'pen'}\nCouleur: ${o.color}\nTaille: ${o.size}px`,
      line:`— Ligne droite\nCouleur: ${o.color}`,
      arrow:`→ Flèche\nCouleur: ${o.color}`,
      dblarrow:`↔ Double flèche`,
      rect:`▭ Rectangle\nDimension: ${Math.abs((o.x2-o.x1)||0).toFixed(0)}×${Math.abs((o.y2-o.y1)||0).toFixed(0)}`,
      'rect-fill':`▬ Rectangle plein\nDimension: ${Math.abs((o.x2-o.x1)||0).toFixed(0)}×${Math.abs((o.y2-o.y1)||0).toFixed(0)}`,
      circle:`○ Ellipse\nRx: ${(Math.abs((o.x2-o.x1)||0)/2).toFixed(0)}  Ry: ${(Math.abs((o.y2-o.y1)||0)/2).toFixed(0)}`,
      'circle-fill':`● Cercle plein`,
      triangle:`△ Triangle`,
      diamond:`◇ Losange`,
      parallelogram:`▱ Parallélogramme`,
      pentagon:`⬠ Pentagone`,
      hexagon:`⬡ Hexagone`,
      star:`★ Étoile`,
      cube:`⬛ Cube 3D`,
      prism:`🔺 Prisme 3D`,
      cylinder:`🥫 Cylindre 3D`,
      bezier:`〜 Courbe de Bézier`,
      text:`T Texte: "${(o.text||'').slice(0,30)}"`,
      formula:`fx Formule: ${(o.raw||'').slice(0,30)}`,
      sticker:`😊 Sticker: ${o.text}`,
      image:`🖼 Image (${(o.w||0).toFixed(0)}×${(o.h||0).toFixed(0)})`,
      'graph-node':`⬤ Nœud graphe: ${o.label||'?'}\nPosition: (${(o.x||0).toFixed(0)}, ${(o.y||0).toFixed(0)})`,
      'graph-edge':`→ Arête\n${o.directed?'Orientée':'Non orientée'}${o.weight!=null?' | Poids: '+o.weight:''}`,
      angle:`∠ Angle: ${o.degreeValue?.toFixed(2)||'?'}°`,
      // ── Nouveaux types ──
      code: `</> Code: ${o.title||'Sans titre'}\nLangage: ${o.lang||'pseudo'}`,
    };
    // Guard finale — évite le crash si type inconnu ou props manquantes
    return labels[o.type] || `📦 ${o.type||'Objet'}`;
  },

  // ── Curseur gomme ──
  moveEraserCursor(sx, sy) {
    const ec = document.getElementById('eraser-cursor');
    if(!ec) return;
    const s = (Tools.size * 3);
    ec.style.display = 'block';
    ec.style.width = s+'px'; ec.style.height = s+'px';
    ec.style.left = sx+'px'; ec.style.top = sy+'px';
  },

  // ── Laser ──
  moveLaser(sx, sy) {
    const l = document.getElementById('laser');
    if(l) { l.style.left=sx+'px'; l.style.top=sy+'px'; }
  },

  // ── Boîte de sélection (overlay DOM) ──
  drawSelectionBox(sx1, sy1, sx2, sy2) {
    const box = document.getElementById('sel-box');
    if(!box) return;
    box.style.display = 'block';
    box.style.left   = Math.min(sx1,sx2)+'px';
    box.style.top    = Math.min(sy1,sy2)+'px';
    box.style.width  = Math.abs(sx2-sx1)+'px';
    box.style.height = Math.abs(sy2-sy1)+'px';
  },
  hideSelectionBox() {
    const box = document.getElementById('sel-box');
    if(box) box.style.display = 'none';
  },

  // ── TEXT INPUT ──
  openTextInput(wx, wy) {
    const box = document.getElementById('text-box');
    const ta  = document.getElementById('text-ta');
    const { x: sx, y: sy } = Viewport.worldToScreen(wx, wy);
    box.style.display = 'block';
    box.style.left = Math.min(sx, window.innerWidth - 340) + 'px';
    box.style.top  = Math.max(10, sy - 90) + 'px';
    box.dataset.wx = wx;
    box.dataset.wy = wy;
    // Appliquer les paramètres courants
    _txtState.size   = Math.max(13, Tools.size * 2.5);
    _txtState.color  = Tools.color;
    _txtState.bold   = false;
    _txtState.italic = false;
    _txtState.under  = false;
    _txtState.align  = 'left';
    _txtState.font   = 'Cabinet Grotesk, sans-serif';
    _applyTxtState();
    ta.value = '';
    ta.focus();
  },

  confirmText() {
    const box = document.getElementById('text-box');
    const ta  = document.getElementById('text-ta');
    const txt = ta.value.trim();
    const editingId = box.dataset.editingId ? parseInt(box.dataset.editingId) : null;

    if(editingId) {
      // Mode édition : mettre à jour l'objet existant
      const obj = Scene.objects.find(o => o.id === editingId);
      if(obj) {
        if(txt) {
          obj.text       = txt;
          obj.fontSize   = _txtState.size;
          obj.color      = _txtState.color;
          obj.bold       = _txtState.bold;
          obj.italic     = _txtState.italic;
          obj.underline  = _txtState.under;
          obj.align      = _txtState.align;
          obj.fontFamily = _txtState.font;
          obj.hidden     = false;
        } else {
          // Texte vide → supprimer l'objet
          Scene.remove(editingId);
        }
      }
      delete box.dataset.editingId;
    } else if(txt) {
      // Mode création
      const wx = parseFloat(box.dataset.wx);
      const wy = parseFloat(box.dataset.wy);
      Scene.add({
        type:'text', x:wx, y:wy + _txtState.size,
        text:txt, fontSize:_txtState.size, color:_txtState.color,
        bold:_txtState.bold, italic:_txtState.italic, underline:_txtState.under,
        align:_txtState.align, fontFamily:_txtState.font, opacity:Tools.opacity,
      });
    }

    box.style.display = 'none';
    // Réafficher si on avait caché pendant l'édition
    Scene.objects.forEach(o => { if(o.hidden) o.hidden = false; });
    App.render(); App.pushUndo(); App.scheduleSave();
  },

  // ── FORMULA INPUT ──
  _fxWx: 0, _fxWy: 0,
  openFxInput(wx, wy) {
    this._fxWx = wx; this._fxWy = wy;
    const box = document.getElementById('formula-box');
    const { x: sx, y: sy } = Viewport.worldToScreen(wx, wy);
    box.style.display = 'block';
    box.style.left = Math.min(sx, window.innerWidth-350)+'px';
    box.style.top  = Math.min(sy, window.innerHeight-280)+'px';
    document.getElementById('formula-input').value = '';
    document.getElementById('fx-preview').textContent = 'Prévisualisation...';
    document.getElementById('formula-input').focus();
  },
  confirmFx() {
    const raw = document.getElementById('formula-input').value.trim();
    if(raw) {
      const fs = Math.max(16, Tools.size*2.5);
      Scene.add({ type:'formula', x:this._fxWx, y:this._fxWy+fs, raw, fontSize:fs,
        color:Tools.color, opacity:Tools.opacity });
      App.render(); App.pushUndo(); App.scheduleSave();
    }
    document.getElementById('formula-box').style.display = 'none';
  },
  cancelFx() { document.getElementById('formula-box').style.display = 'none'; },

  // ── STICKER PICKER ──
  showStickerPicker(wx, wy, sx, sy) {
    const picker = document.getElementById('sticker-picker');
    picker.style.display = 'block';
    picker.style.left = Math.min(sx, window.innerWidth-250)+'px';
    picker.style.top  = Math.min(sy, window.innerHeight-200)+'px';
    picker.dataset.wx = wx; picker.dataset.wy = wy;
  },
  placeSticker(emoji) {
    const picker = document.getElementById('sticker-picker');
    const wx = parseFloat(picker.dataset.wx);
    const wy = parseFloat(picker.dataset.wy);
    const fs = Math.max(24, Tools.size*6);
    Scene.add({ type:'sticker', x:wx, y:wy, text:emoji, fontSize:fs, opacity:Tools.opacity });
    picker.style.display = 'none';
    App.render(); App.pushUndo(); App.scheduleSave();
  },

  // ── IMAGE ──
  triggerImageUpload() { document.getElementById('img-upload').click(); },

  // ── GRAPH PANEL ──
  showGraphPanel() { togglePanel('graph-panel'); },

  // ── TOAST ──
  toast(msg, type='info') {
    const c = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<span class="ti">${{success:'✓',error:'✕',info:'ℹ'}[type]||'ℹ'}</span>${msg}`;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(30px)'; el.style.transition='all .3s'; setTimeout(()=>el.remove(),300); }, 2500);
  },

  // ── CONFETTI ──
  launchConfetti() {
    const colors = ['#6c63ff','#ff6b9d','#ffd166','#00d4aa','#e63946','#00b4d8'];
    for(let i=0;i<90;i++) {
      const el = document.createElement('div');
      el.className = 'confetto';
      el.style.cssText = `left:${Math.random()*100}vw;top:-20px;width:${4+Math.random()*8}px;height:${8+Math.random()*12}px;background:${colors[Math.floor(Math.random()*colors.length)]};animation-duration:${1.5+Math.random()*2.5}s;animation-delay:${Math.random()*0.8}s;`;
      document.body.appendChild(el);
      el.addEventListener('animationend',()=>el.remove());
    }
    this.toast('🎉 Célébration !','success');
  },

  // ── CONTEXT MENU ──
  /*showCtxMenu(cx, cy) {
    const m = document.getElementById('ctx-menu');
    m.style.display = 'block';
    m.style.left = Math.min(cx, window.innerWidth-190)+'px';
    m.style.top  = Math.min(cy, window.innerHeight-260)+'px';
  },  */
  showCtxMenu(cx, cy) {
    updateCtxMenuForSelection();
    const m = document.getElementById('ctx-menu');
    m.style.display = 'block';
    m.style.left = Math.min(cx, window.innerWidth-200)+'px';
    m.style.top  = Math.min(cy, window.innerHeight-280)+'px';
  },
  hideCtxMenu() { document.getElementById('ctx-menu').style.display = 'none'; },

  // ── COMMAND PALETTE ──
  openCmd() {
    const overlay = document.getElementById('cmd-overlay');
    overlay.classList.add('show');
    const inp = document.getElementById('cmd-input');
    inp.value=''; inp.focus();
    filterCmd('');
  },
  closeCmd(e) {
    if(e && e.target.id !== 'cmd-overlay') return;
    document.getElementById('cmd-overlay').classList.remove('show');
  },

  // ── PANELS ──
  closeAll() {
    document.querySelectorAll('.side-panel').forEach(p=>p.classList.remove('open'));
    document.getElementById('panel-overlay').classList.remove('show');
    document.getElementById('formula-box').style.display='none';
    document.getElementById('text-box').style.display='none';
    document.getElementById('sticker-picker').style.display='none';
    this.hideCtxMenu();
    this.hideTooltip();
    document.getElementById('cmd-overlay').classList.remove('show');
  },

  // ── MODALS ──
  openRename(id) {
    window._renamingId = id;
    const ws = App.state.workspaces.find(w=>w.id===id);
    document.getElementById('rename-input').value = ws?.name||'';
    document.getElementById('rename-modal').classList.add('show');
    document.getElementById('rename-input').focus();
  },
  closeRename() { document.getElementById('rename-modal').classList.remove('show'); },
  confirmRename() {
    const ws = App.state.workspaces.find(w=>w.id===window._renamingId);
    const v = document.getElementById('rename-input').value.trim();
    if(ws&&v) { ws.name=v; App.renderTabs(); App.scheduleSave(); this.toast('Renommé ✓','success'); }
    this.closeRename();
  },

  openShare() {
    const link='https://inkspace.io/board/'+btoa(App.state.activeId||'').slice(0,12);
    document.getElementById('share-link-input').value=link;
    document.getElementById('share-modal').classList.add('show');
  },
  copyShareLink() {
    navigator.clipboard?.writeText(document.getElementById('share-link-input').value);
    this.toast('Lien copié ✓','success');
  },
};

// ── Panels toggle ──
const PANELS = ['ai-panel','tmpl-panel','theme-panel','doc-panel','graph-panel'];
function togglePanel(id) {
  const p = document.getElementById(id);
  const wasOpen = p.classList.contains('open');
  PANELS.forEach(pid => document.getElementById(pid)?.classList.remove('open'));
  if(!wasOpen) p.classList.add('open');
  document.getElementById('panel-overlay').classList.toggle('show', !wasOpen);
}
function closePanel(id) {
  document.getElementById(id)?.classList.remove('open');
  const anyOpen = PANELS.some(pid => document.getElementById(pid)?.classList.contains('open'));
  if(!anyOpen) document.getElementById('panel-overlay').classList.remove('show');
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('panel-overlay').onclick = () => {
    PANELS.forEach(pid => document.getElementById(pid)?.classList.remove('open'));
    document.getElementById('panel-overlay').classList.remove('show');
  };
});

// ── Command palette ──
let _cmdFiltered=[], _cmdFocused=0;
const CMD_ITEMS = [
  {icon:'✏️',label:'Stylo',sub:'P',action:()=>Tools.set('pen')},
  {icon:'🖌',label:'Pinceau',sub:'B',action:()=>Tools.set('brush')},
  {icon:'🖊',label:'Marqueur',sub:'M',action:()=>Tools.set('marker')},
  {icon:'✒️',label:'Calligraphie',sub:'G',action:()=>Tools.set('calligraphy')},
  {icon:'⬜',label:'Gomme',sub:'E',action:()=>Tools.set('eraser')},
  {icon:'→',label:'Flèche',sub:'A',action:()=>Tools.set('arrow')},
  {icon:'▭',label:'Rectangle',sub:'R',action:()=>Tools.set('rect')},
  {icon:'○',label:'Cercle',sub:'C',action:()=>Tools.set('circle')},
  {icon:'△',label:'Triangle',sub:'—',action:()=>Tools.set('triangle')},
  {icon:'◇',label:'Losange',sub:'—',action:()=>Tools.set('diamond')},
  {icon:'▱',label:'Parallélogramme',sub:'—',action:()=>Tools.set('parallelogram')},
  {icon:'⬡',label:'Hexagone',sub:'—',action:()=>Tools.set('hexagon')},
  {icon:'★',label:'Étoile',sub:'—',action:()=>Tools.set('star')},
  {icon:'⬛',label:'Cube 3D',sub:'—',action:()=>Tools.set('cube')},
  {icon:'🔺',label:'Prisme 3D',sub:'—',action:()=>Tools.set('prism')},
  {icon:'🥫',label:'Cylindre 3D',sub:'—',action:()=>Tools.set('cylinder')},
  {icon:'〜',label:'Courbe de Bézier',sub:'—',action:()=>Tools.set('bezier')},
  {icon:'T',label:'Texte',sub:'T',action:()=>Tools.set('text')},
  {icon:'fx',label:'Formule',sub:'F',action:()=>Tools.set('formula')},
  {icon:'∠',label:'Angle (mesure auto)',sub:'Q',action:()=>Tools.set('angle')},
  {icon:'⬤',label:'Nœud de graphe',sub:'—',action:()=>Tools.set('graph-node')},
  {icon:'→',label:'Arête de graphe',sub:'—',action:()=>Tools.set('graph-edge')},
  {icon:'⬚',label:'Sélectionner',sub:'S',action:()=>Tools.set('select')},
  {icon:'✋',label:'Déplacer',sub:'V',action:()=>Tools.set('pan')},
  {icon:'🔴',label:'Pointeur laser',sub:'K',action:()=>Tools.set('laser')},
  {icon:'↩',label:'Annuler',sub:'Ctrl+Z',action:()=>App.undo()},
  {icon:'↪',label:'Refaire',sub:'Ctrl+Y',action:()=>App.redo()},
  {icon:'🗑',label:'Effacer tout',sub:'—',action:()=>App.clearCanvas()},
  {icon:'⬇',label:'Exporter PNG',sub:'Ctrl+E',action:()=>App.exportPNG()},
  {icon:'📐',label:'Export SVG',sub:'—',action:()=>App.exportSVG()},
  {icon:'🖨',label:'Imprimer',sub:'—',action:()=>App.printCanvas()},
  {icon:'📤',label:'Partager',sub:'—',action:()=>UI.openShare()},
  {icon:'📺',label:'Présentation',sub:'—',action:()=>App.startPresentation()},
  {icon:'🗺',label:'Minimap',sub:'—',action:()=>App.toggleMinimap()},
  {icon:'🎉',label:'Confettis',sub:'Ctrl+⇧+C',action:()=>UI.launchConfetti()},
  {icon:'+',label:'Nouveau tableau',sub:'Ctrl+T',action:()=>App.newWorkspace()},
  {icon:'🌙',label:'Thème Dark',sub:'—',action:()=>App.setTheme('dark')},
  {icon:'☀️',label:'Thème Light',sub:'—',action:()=>App.setTheme('light')},
  {icon:'🌌',label:'Thème Midnight',sub:'—',action:()=>App.setTheme('midnight')},
  {icon:'🌊',label:'Thème Solarized',sub:'—',action:()=>App.setTheme('solarized')},
  {icon:'•',label:'Grille — Lignes',sub:'—',action:()=>App.setGrid('lines')},
  {icon:'·',label:'Grille — Points',sub:'—',action:()=>App.setGrid('dots')},
  {icon:'+',label:'Grille — Isométrique',sub:'—',action:()=>App.setGrid('isometric')},
  {icon:'○',label:'Grille — Aucune',sub:'—',action:()=>App.setGrid('none')},
];

function filterCmd(q) {
  const list = q ? CMD_ITEMS.filter(c=>c.label.toLowerCase().includes(q.toLowerCase())) : CMD_ITEMS;
  _cmdFiltered = list; _cmdFocused = 0;
  const res = document.getElementById('cmd-results');
  res.innerHTML = '';
  if(!q) { const s=document.createElement('div'); s.className='cmd-section'; s.textContent='Toutes les commandes'; res.appendChild(s); }
  list.forEach((c,i) => {
    const el = document.createElement('div');
    el.className='cmd-item'+(i===0?' focused':'');
    el.innerHTML=`<span class="cmd-icon">${c.icon}</span><span class="cmd-label">${c.label}</span><span class="cmd-sub">${c.sub}</span>`;
    el.onclick=()=>{ c.action(); document.getElementById('cmd-overlay').classList.remove('show'); };
    res.appendChild(el);
  });
}
function cmdKey(e) {
  const items = document.querySelectorAll('.cmd-item');
  if(e.key==='ArrowDown') _cmdFocused=Math.min(_cmdFocused+1,_cmdFiltered.length-1);
  else if(e.key==='ArrowUp') _cmdFocused=Math.max(_cmdFocused-1,0);
  else if(e.key==='Enter') { if(_cmdFiltered[_cmdFocused]){_cmdFiltered[_cmdFocused].action();document.getElementById('cmd-overlay').classList.remove('show');} return; }
  else if(e.key==='Escape') { document.getElementById('cmd-overlay').classList.remove('show'); return; }
  items.forEach((el,i)=>el.classList.toggle('focused',i===_cmdFocused));
  items[_cmdFocused]?.scrollIntoView({block:'nearest'});
}
