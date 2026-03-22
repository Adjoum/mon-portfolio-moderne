/**
 * InkSpace v3 — App Core
 * Workspaces, Undo/Redo, Save, Export, Templates, AI
 */

'use strict';

const App = {
  state: {
    workspaces: [],
    activeId: null,
  },
  _undoStack: [],
  _redoStack: [],
  _saveTimer: null,
  _minimapVisible: false,
  _gCtx: null, _mCtx: null, _oCtx: null,
  _W: 0, _H: 0,
  _imageCache: {},  // id → HTMLImageElement

  // ════════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════════
  init() {
    const gC = document.getElementById('grid-c');
    const mC = document.getElementById('main-c');
    const oC = document.getElementById('overlay-c');
    this._gCtx = gC.getContext('2d');
    this._mCtx = mC.getContext('2d');
    this._oCtx = oC.getContext('2d');

    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Charger données
    if(!this._load()) {
      const id = this._newWs('Mon Tableau');
      this.state.activeId = id;
    }

    // Thème
    const savedTheme = localStorage.getItem('inkspace_theme') || 'dark';
    this.setTheme(savedTheme);

    this.renderTabs();
    Tools.init(oC);
    Tools.set('pen');
    this.render();

    // Splash
    setTimeout(() => document.getElementById('splash').classList.add('hidden'), 2000);
    setTimeout(() => UI.toast('Bienvenue sur InkSpace v3.0 ✨', 'success'), 2300);

    // Formule preview
    document.getElementById('formula-input').addEventListener('input', function() {
      document.getElementById('fx-preview').textContent = latexToText(this.value) || 'Prévisualisation...';
    });

    // Text confirm
    document.getElementById('text-ta').addEventListener('keydown', e => {
      if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) UI.confirmText();
      if(e.key==='Escape') document.getElementById('text-box').style.display='none';
    });
    //document.getElementById('text-confirm').onclick = () => UI.confirmText();
    const _tc = document.getElementById('text-confirm');
    if(_tc) _tc.onclick = () => UI.confirmText();

    // Clic global ferme menus
    document.addEventListener('click', e => {
      if(!e.target.closest('#ctx-menu')) UI.hideCtxMenu();
      if(!e.target.closest('#hover-tooltip')) UI.hideTooltip();
    });
  },

  // ════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════
  render() {
    const state = { selectedIds: Tools._selectedIds };
    Renderer.render(this._gCtx, this._mCtx, this._oCtx, this._W, this._H, state);
    this._updateMinimap();
  },

  getOverlayCtx() {
    Viewport.apply(this._oCtx);
    return this._oCtx;
  },

  _resize() {
    const wrap = document.getElementById('canvas-wrap');
    this._W = wrap.clientWidth; this._H = wrap.clientHeight;
    ['grid-c','main-c','overlay-c'].forEach(id => {
      const c = document.getElementById(id);
      c.width = this._W; c.height = this._H;
    });
    // Spotlight
    const sp = document.getElementById('spotlight');
    if(sp) { sp.width=this._W; sp.height=this._H; }
    this.render();
  },

  // ════════════════════════════════════════════
  //  WORKSPACES
  // ════════════════════════════════════════════
  _WS_COLORS: ['#6c63ff','#ff6b9d','#00d4aa','#ffd166','#e63946','#00b4d8','#f77f00','#a8dadc'],

  _newWs(name) {
    const id = 'ws_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
    const color = this._WS_COLORS[this.state.workspaces.length % this._WS_COLORS.length];
    this.state.workspaces.push({ id, name: name||'Tableau '+(this.state.workspaces.length+1), color, sceneData: null });
    return id;
  },

  newWorkspace() {
    const id = this._newWs();
    this._switchWs(id);
    UI.toast('Nouveau tableau créé ✨','success');
  },

  _switchWs(id) {
    this._saveCurrentScene();
    this.state.activeId = id;
    this._undoStack = []; this._redoStack = [];
    Scene.clear();
    // Charger la scène
    const ws = this.state.workspaces.find(w=>w.id===id);
    if(ws?.sceneData) {
      Scene.deserialize(ws.sceneData);
      // Recréer le cache image
      Scene.objects.forEach(o => {
        if(o.type==='image' && o._src) {
          const img = new Image();
          img.onload = () => { o._img=img; this.render(); };
          img.src = o._src;
        }
      });
    }
    this.renderTabs();
    this.render();
    this.scheduleSave();
  },

  _saveCurrentScene() {
    const ws = this.state.workspaces.find(w=>w.id===this.state.activeId);
    if(ws) {
      // Avant de sérialiser, on sauvegarde _src pour les images
      Scene.objects.forEach(o => { if(o.type==='image'&&o._img) o._src=o._img.src; });
      ws.sceneData = Scene.serialize();
    }
  },

  deleteWs(id) {
    if(this.state.workspaces.length <= 1) { UI.toast('Impossible de supprimer le dernier tableau','error'); return; }
    if(!confirm('Supprimer ce tableau ?')) return;
    this.state.workspaces = this.state.workspaces.filter(w=>w.id!==id);
    if(this.state.activeId===id) this._switchWs(this.state.workspaces[0].id);
    else this.renderTabs();
  },

  renderTabs() {
    const bar = document.getElementById('ws-tabs');
    bar.innerHTML = '';
    this.state.workspaces.forEach(ws => {
      const el = document.createElement('div');
      el.className = 'ws-tab' + (ws.id===this.state.activeId?' active':'');
      el.innerHTML = `<span class="ws-dot" style="background:${ws.color}"></span>
        <span ondblclick="UI.openRename('${ws.id}')">${ws.name}</span>
        <span class="ws-close" onclick="App.deleteWs('${ws.id}')">✕</span>`;
      el.onclick = e => { if(!e.target.classList.contains('ws-close')) this._switchWs(ws.id); };
      bar.appendChild(el);
    });
  },

  // ════════════════════════════════════════════
  //  UNDO / REDO
  // ════════════════════════════════════════════
  pushUndo() {
    Scene.objects.forEach(o => { if(o.type==='image'&&o._img) o._src=o._img.src; });
    this._undoStack.push(Scene.serialize());
    if(this._undoStack.length > 80) this._undoStack.shift();
    this._redoStack = [];
  },

  undo() {
    if(!this._undoStack.length) return;
    Scene.objects.forEach(o => { if(o.type==='image'&&o._img) o._src=o._img.src; });
    this._redoStack.push(Scene.serialize());
    Scene.deserialize(this._undoStack.pop());
    this._restoreImages();
    this.render(); this.scheduleSave();
  },

  redo() {
    if(!this._redoStack.length) return;
    Scene.objects.forEach(o => { if(o.type==='image'&&o._img) o._src=o._img.src; });
    this._undoStack.push(Scene.serialize());
    Scene.deserialize(this._redoStack.pop());
    this._restoreImages();
    this.render(); this.scheduleSave();
  },

  _restoreImages() {
    Scene.objects.forEach(o => {
      if(o.type==='image'&&o._src&&!o._img) {
        const img = new Image();
        img.onload = () => { o._img=img; this.render(); };
        img.src = o._src;
      }
    });
  },

  // ════════════════════════════════════════════
  //  SAVE
  // ════════════════════════════════════════════
  scheduleSave() {
    const pill = document.getElementById('save-pill');
    const txt  = document.getElementById('save-text');
    if(pill) { pill.classList.add('saving'); pill.classList.remove('saved'); }
    if(txt) txt.textContent = 'Enregistrement...';
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveCurrentScene();
      try {
        const toStore = this.state.workspaces.map(ws => ({
          id: ws.id, name: ws.name, color: ws.color, sceneData: ws.sceneData,
        }));
        localStorage.setItem('inkspace_v3', JSON.stringify({ workspaces:toStore, activeId:this.state.activeId }));
      } catch(e) { console.warn('Save error',e); }
      if(pill) { pill.classList.remove('saving'); pill.classList.add('saved'); }
      if(txt) txt.textContent = 'Sauvegardé';
    }, 900);
  },

  _load() {
    try {
      const raw = localStorage.getItem('inkspace_v3');
      if(!raw) return false;
      const data = JSON.parse(raw);
      this.state.workspaces = data.workspaces || [];
      this.state.activeId = data.activeId;
      if(!this.state.workspaces.length) return false;
      // Charger la scène active
      const ws = this.state.workspaces.find(w=>w.id===this.state.activeId);
      if(ws?.sceneData) {
        Scene.deserialize(ws.sceneData);
        this._restoreImages();
      }
      return true;
    } catch { return false; }
  },

  // ════════════════════════════════════════════
  //  CLEAR
  // ════════════════════════════════════════════
  clearCanvas() {
    if(!confirm('Effacer tout le contenu de ce tableau ?')) return;
    this.pushUndo();
    Scene.clear();
    Tools._selectedIds = new Set();
    this.render(); this.scheduleSave();
    UI.toast('Canvas effacé','info');
  },

  // ════════════════════════════════════════════
  //  GRID / THEME
  // ════════════════════════════════════════════
  _gridTypes: ['lines','dots','cross','isometric','none'],
  cycleGrid() {
    const i = this._gridTypes.indexOf(Renderer.gridType);
    this.setGrid(this._gridTypes[(i+1) % this._gridTypes.length]);
  },
  setGrid(t) {
    Renderer.gridType = t;
    this.render();
    UI.toast('Grille : '+t,'info');
  },
  setCanvasBg(v) { Renderer.canvasBg=v; this.render(); },

  setTheme(t) {
    document.body.dataset.theme = t;
    document.querySelectorAll('.theme-card').forEach(c=>c.classList.remove('active'));
    document.getElementById('theme-'+t)?.classList.add('active');
    this.render();
    localStorage.setItem('inkspace_theme',t);
  },

  // ════════════════════════════════════════════
  //  IMAGES
  // ════════════════════════════════════════════
  insertImageFile(file, wx, wy) {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const maxW=600, maxH=500;
        let w=img.width, h=img.height;
        if(w>maxW){h*=maxW/w;w=maxW;} if(h>maxH){w*=maxH/h;h=maxH;}
        const obj = Scene.add({ type:'image', x:wx-w/2, y:wy-h/2, w, h, _img:img, _src:ev.target.result });
        this.render(); this.pushUndo(); this.scheduleSave();
        UI.toast('Image insérée ✓','success');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  },

  // ════════════════════════════════════════════
  //  EXPORT
  // ════════════════════════════════════════════
  exportPNG() {
    const tmp = document.createElement('canvas');
    tmp.width = this._W; tmp.height = this._H;
    const tc = tmp.getContext('2d');
    tc.fillStyle = Renderer.canvasBg; tc.fillRect(0,0,tmp.width,tmp.height);
    // Dessine avec le viewport courant
    Viewport.apply(tc);
    Scene.objects.forEach(o => Renderer.drawObject(tc, o, {}));
    Viewport.reset(tc);
    const a = document.createElement('a');
    const ws = this.state.workspaces.find(w=>w.id===this.state.activeId);
    a.href = tmp.toDataURL('image/png');
    a.download = (ws?.name||'tableau').replace(/\s+/g,'_')+'.png';
    a.click();
    UI.toast('Export PNG téléchargé ✓','success');
  },

  exportSVG() {
    // Export basique via canvas
    const tmp = document.createElement('canvas');
    tmp.width=this._W; tmp.height=this._H;
    const tc=tmp.getContext('2d');
    tc.fillStyle=Renderer.canvasBg; tc.fillRect(0,0,tmp.width,tmp.height);
    Viewport.apply(tc);
    Scene.objects.forEach(o=>Renderer.drawObject(tc,o,{}));
    Viewport.reset(tc);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${this._W}" height="${this._H}"><image href="${tmp.toDataURL()}" width="${this._W}" height="${this._H}"/></svg>`;
    const blob=new Blob([svg],{type:'image/svg+xml'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='tableau.svg'; a.click();
    UI.toast('Export SVG ✓','success');
  },

  printCanvas() {
    const tmp=document.createElement('canvas'); tmp.width=this._W; tmp.height=this._H;
    const tc=tmp.getContext('2d'); tc.fillStyle='#fff'; tc.fillRect(0,0,tmp.width,tmp.height);
    Viewport.apply(tc); Scene.objects.forEach(o=>Renderer.drawObject(tc,o,{})); Viewport.reset(tc);
    const w=window.open();
    w.document.write(`<img src="${tmp.toDataURL()}" style="max-width:100%"><script>window.onload=()=>window.print()<\/script>`);
    w.document.close();
  },

  // ════════════════════════════════════════════
  //  PRÉSENTATION
  // ════════════════════════════════════════════
  startPresentation() {
    const po=document.getElementById('pres-overlay');
    const pc=document.getElementById('pres-canvas');
    pc.width=window.innerWidth; pc.height=window.innerHeight;
    const px=pc.getContext('2d');
    px.fillStyle='#fff'; px.fillRect(0,0,pc.width,pc.height);
    const scale=Math.min(pc.width/this._W,pc.height/this._H);
    const ox=(pc.width-this._W*scale)/2, oy=(pc.height-this._H*scale)/2;
    px.save(); px.translate(ox,oy); px.scale(scale,scale);
    Viewport.apply(px); Scene.objects.forEach(o=>Renderer.drawObject(px,o,{})); Viewport.reset(px);
    px.restore();
    po.classList.add('show');
  },
  exitPresentation() { document.getElementById('pres-overlay').classList.remove('show'); },

  // ════════════════════════════════════════════
  //  MINIMAP
  // ════════════════════════════════════════════
  toggleMinimap() {
    this._minimapVisible = !this._minimapVisible;
    document.getElementById('minimap').style.display = this._minimapVisible ? 'block' : 'none';
    this._updateMinimap();
  },
  _updateMinimap() {
    if(!this._minimapVisible) return;
    const mc=document.getElementById('minimap-c');
    if(!mc) return;
    const mx=mc.getContext('2d');
    mx.clearRect(0,0,mc.width,mc.height);
    mx.fillStyle=Renderer.canvasBg; mx.fillRect(0,0,mc.width,mc.height);
    const scale=Math.min(mc.width/this._W,mc.height/this._H)*0.9;
    mx.save(); mx.scale(scale,scale);
    Viewport.apply(mx); Scene.objects.forEach(o=>Renderer.drawObject(mx,o,{})); Viewport.reset(mx);
    mx.restore();
  },

  // ════════════════════════════════════════════
  //  TEMPLATES
  // ════════════════════════════════════════════
  applyTemplate(type) {
    closePanel('tmpl-panel');
    if(!confirm('Appliquer ce template ? Le contenu actuel sera effacé.')) return;
    this.pushUndo();
    Scene.clear();
    const W=this._W, H=this._H;
    const c=Tools.color, sz=Tools.size||2;
    const add=(o)=>Scene.add(o);
    const base=(extra)=>({color:c,size:sz,opacity:1,...extra});

    if(type==='math') {
      add(base({type:'arrow',x1:60,y1:H-60,x2:W-40,y2:H-60})); // axe X
      add(base({type:'arrow',x1:60,y1:H-60,x2:60,y2:40}));      // axe Y
      add({type:'text',x:W-28,y:H-50,text:'x',fontSize:16,color:'#555',opacity:1});
      add({type:'text',x:68,y:35,text:'y',fontSize:16,color:'#555',opacity:1});
      add({type:'text',x:35,y:H-45,text:'O',fontSize:14,color:'#555',opacity:1});
      add({type:'text',x:W/2-160,y:40,text:'Espace Mathématiques',fontSize:20,color:'#6c63ff',opacity:1});
      add({type:'formula',x:120,y:H-120,raw:'f(x) = ...',fontSize:22,color:'#6c63ff',opacity:1});
    } else if(type==='mindmap') {
      const cx=W/2,cy=H/2;
      add(base({type:'circle-fill',x1:cx-85,y1:cy-35,x2:cx+85,y2:cy+35}));
      add({type:'text',x:cx-60,y:cy+8,text:'Idée centrale',fontSize:15,color:'#fff',opacity:1});
      [['🔬 Analyse',cx-230,cy-120],['💡 Solutions',cx+110,cy-120],['📊 Données',cx+120,cy+100],['🎯 Objectifs',cx-230,cy+100]].forEach(([lbl,bx,by])=>{
        add(base({type:'line',x1:cx,y1:cy,x2:bx+65,y2:by+21}));
        add(base({type:'rect',x1:bx,y1:by,x2:bx+140,y2:by+44}));
        add({type:'text',x:bx+8,y:by+27,text:lbl,fontSize:13,color:'#444',opacity:1});
      });
    } else if(type==='kanban') {
      const cw=(W-80)/3;
      [['📥 À faire','#e63946'],['⚡ En cours','#ffd166'],['✅ Terminé','#06d6a0']].forEach(({0:title,1:col},i)=>{
        const x=20+i*(cw+20);
        add({type:'rect',x1:x,y1:55,x2:x+cw,y2:H-20,color:col,size:1.5,opacity:1});
        add({type:'text',x:x+14,y:90,text:title,fontSize:15,color:col,opacity:1});
        add({type:'rect',x1:x+10,y1:108,x2:x+cw-10,y2:178,color:'#aaa',size:1,opacity:1});
        add({type:'text',x:x+18,y:135,text:'Tâche exemple',fontSize:12,color:'#444',opacity:1});
      });
      add({type:'text',x:W/2-70,y:38,text:'Tableau Kanban',fontSize:20,color:'#333',opacity:1});
    } else if(type==='swot') {
      const qw=(W-60)/2,qh=(H-80)/2;
      [['💪 Forces','#06d6a0'],['⚠️ Faiblesses','#e63946'],['🚀 Opportunités','#6c63ff'],['🔥 Menaces','#ffd166']].forEach(([t,col],i)=>{
        const x=20+(i%2)*(qw+20),y=60+Math.floor(i/2)*(qh+20);
        add({type:'rect',x1:x,y1:y,x2:x+qw,y2:y+qh,color:col,size:2,opacity:1});
        add({type:'text',x:x+14,y:y+30,text:t,fontSize:15,color:col,opacity:1});
        add({type:'text',x:x+14,y:y+55,text:'• Élément 1',fontSize:12,color:'#666',opacity:1});
        add({type:'text',x:x+14,y:y+73,text:'• Élément 2',fontSize:12,color:'#666',opacity:1});
      });
      add({type:'text',x:W/2-65,y:44,text:'Analyse SWOT',fontSize:18,color:'#333',opacity:1});
    } else if(type==='timeline') {
      const y=H/2;
      add(base({type:'line',x1:60,y1:y,x2:W-60,y2:y}));
      ['2022','2023','2024','2025','2026'].forEach((yr,i)=>{
        const x=80+i*((W-160)/4);
        const col=['#6c63ff','#ff6b9d','#00d4aa','#ffd166','#e63946'][i];
        add({type:'circle-fill',x1:x-12,y1:y-12,x2:x+12,y2:y+12,color:col,size:2,opacity:1});
        add({type:'text',x:x-14,y:y+(i%2===0?-35:52),text:yr,fontSize:13,color:col,opacity:1});
      });
      add({type:'text',x:W/2-95,y:38,text:'Frise Chronologique',fontSize:20,color:'#333',opacity:1});
    } else if(type==='venn') {
      const cx=W/2,cy=H/2;
      [{x:cx-70,y:cy,c:'#6c63ff'},{x:cx+70,y:cy,c:'#ff6b9d'},{x:cx,y:cy-60,c:'#00d4aa'}].forEach(({x,y,c})=>{
        add({type:'circle',x1:x-130,y1:y-130,x2:x+130,y2:y+130,color:c,size:2,opacity:0.7});
      });
      add({type:'text',x:cx-165,y:cy+10,text:'A',fontSize:24,color:'#6c63ff',opacity:1});
      add({type:'text',x:cx+150,y:cy+10,text:'B',fontSize:24,color:'#ff6b9d',opacity:1});
      add({type:'text',x:cx-8,y:cy-175,text:'C',fontSize:24,color:'#00d4aa',opacity:1});
    } else if(type==='quadrant') {
      add(base({type:'line',x1:W/2,y1:40,x2:W/2,y2:H-40}));
      add(base({type:'line',x1:40,y1:H/2,x2:W-40,y2:H/2}));
      [['Urgent & Important',50,90,'#e63946'],['Non-urgent & Important',W/2+20,90,'#6c63ff'],['Urgent & Non-important',50,H/2+30,'#ffd166'],['Non-urgent & Non-important',W/2+20,H/2+30,'#aaa']].forEach(([t,x,y,col])=>{
        add({type:'text',x,y,text:t,fontSize:12,color:col,opacity:1});
      });
    }
    this.render(); this.scheduleSave();
    UI.toast('Template appliqué ✨','success');
  },

  // ════════════════════════════════════════════
  //  AI ASSISTANT
  // ════════════════════════════════════════════
  async submitAI() {
    const prompt = document.getElementById('ai-prompt').value.trim();
    if(!prompt) return;
    const btn=document.getElementById('ai-submit'), out=document.getElementById('ai-output');
    btn.textContent='⏳ Génération...'; btn.disabled=true;
    out.style.display='block'; out.textContent='Génération en cours...'; out.style.color='var(--text2)';

    //const GROQ_API_KEY = localStorage.getItem('inkspace_api_key') || 'gsk_ZAef9G4bXt6gcs0ywy4h7qg2i';
    //const GROQ_MODEL   = 'llama-3.3-70b-versatile'; // modèle Groq rapide et gratuit
    const API_URL = 'VITE_API_URL=https://portfolioblogapi-ak7alid4.b4a.run'; // en prod
    // const API_URL = 'http://localhost:5000'; // en dev
    try {
      /*const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: 'system',
              content: `Tu es un assistant pédagogique pour un tableau blanc (InkSpace).
                Réponds UNIQUEMENT en JSON valide, sans backtick ni markdown :
                {"type":"list","title":"Titre court","items":["item1","item2",...],"note":"conseil optionnel"}
                Maximum 8 items. Sois concis, pédagogique, en français.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7
        })
      });*/

      const res = await fetch(`${API_URL}/api/groq/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      }); 


      const data = await res.json();

      if(data.error) throw new Error(data.error.message);

      const raw = data.choices?.[0]?.message?.content || '{}';
      let parsed;
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
      } catch {
        parsed = { type:'list', title:'Résultat', items: [raw.slice(0,300)] };
      }

      out.innerHTML = `<strong style="color:var(--accent)">${parsed.title||''}</strong><br>`
        + (parsed.items||[]).map(i=>`• ${i}`).join('<br>')
        + (parsed.note ? `<br><em style="color:var(--text2)">💡 ${parsed.note}</em>` : '');
      out.style.color = 'var(--text)';
      this._drawAIContent(parsed);
      UI.toast('Contenu IA généré ✨','success');

    } catch(err) {
      out.textContent = 'Erreur : ' + err.message;
      out.style.color = 'var(--danger)';
      UI.toast('Erreur Groq : ' + err.message, 'error');
    }

    btn.textContent='✦ Générer sur le canvas'; btn.disabled=false;
  },

  _drawAIContent(data) {
    // Calculer la position Y en dessous du dernier objet existant
    let startY = 80;
    if(Scene.objects.length > 0) {
      let maxY = 0;
      Scene.objects.forEach(o => {
        const bb = getBoundingBox(o);
        if(bb) maxY = Math.max(maxY, bb.y + bb.h);
        // Pour les objets texte sans bb complet
        if(o.y && o.y > maxY) maxY = o.y;
      });
      startY = maxY + 40; // 40px de marge après le dernier objet
    }

    const x = 60;
    let y = startY;
    const col = ['#6c63ff','#e63946','#ff6b9d','#06d6a0','#ffd166','#00b4d8','#f77f00','#aaa'];

    // Ligne de séparation si ce n'est pas le premier bloc
    if(Scene.objects.length > 0) {
      Scene.add({type:'line', x1:x, y1:y-20, x2:x+300, y2:y-20, color:'#cccccc44', size:1, opacity:1});
    }

    // Titre
    Scene.add({type:'text', x, y, text: data.title||'', fontSize:22, color:'#6c63ff', opacity:1});
    y += 40;

    // Ligne décorative sous le titre
    Scene.add({type:'line', x1:x, y1:y-8, x2:x+200, y2:y-8, color:'#6c63ff55', size:1.5, opacity:1});

    // Items
    (data.items||[]).forEach((item, i) => {
      Scene.add({type:'text', x:x+10, y, text:'▸ '+item, fontSize:15, color:col[i%8], opacity:1});
      y += 28;
    });

    // Note
    if(data.note) {
      Scene.add({type:'text', x, y:y+12, text:'💡 '+data.note, fontSize:13, color:'#888', opacity:1});
    }

    this.render();
    this.pushUndo();
    this.scheduleSave();
    // À la toute fin, après l'initialisation
    
  },
  
};

