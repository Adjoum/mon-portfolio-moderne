// src/utils/diagramTemplates.js  — NovaMind v3.2
// CRITICAL FIX: Ishikawa effect node uses isEffect:true (NOT isRoot:true)
// isRoot is ONLY for mindmap center nodes

let _id = 5000;
const gid = () => `t_${++_id}`;

const node = (x, y, label, color = '#6EE7F7', extra = {}) => {
  const id = gid();
  return {
    id, x, y, label, color,
    width:     extra.width    || 160,
    height:    extra.height   || 60,
    notes:     '',
    tags:      [],
    priority:  'normal',
    icon:      extra.icon     || '💡',
    collapsed: false,
    ...extra,
  };
};

const edge = (from, to, label = '', extra = {}) => ({
  id: gid(), from, to, label,
  style:    extra.style    || 'curve',
  dashed:   extra.dashed   || false,
  ...extra,
});

export const DIAGRAM_TEMPLATES = {

  mind: () => {
    const cx = 700, cy = 420;
    const root = node(cx - 100, cy - 40, '🧠 Idée Centrale', '#6EE7F7',
      { isRoot: true, width: 200, height: 80, icon: '🧠' });
    const branches = [
      { label: '💡 Innovation',  color: '#A78BFA', angle: -0.55, dist: 270 },
      { label: '📊 Analyse',     color: '#F472B6', angle:  0.05, dist: 280 },
      { label: '🚀 Action',      color: '#34D399', angle:  0.65, dist: 265 },
      { label: '🎯 Objectifs',   color: '#FBBF24', angle: -1.25, dist: 275 },
      { label: '🔧 Ressources',  color: '#60A5FA', angle:  1.30, dist: 270 },
    ];
    const ns = { [root.id]: root };
    const es = [];
    branches.forEach(b => {
      const bx = cx + Math.cos(b.angle) * b.dist - 80;
      const by = cy + Math.sin(b.angle) * b.dist - 30;
      const bn = node(bx, by, b.label, b.color, { width: 160, height: 55 });
      ns[bn.id] = bn; es.push(edge(root.id, bn.id));
      ['Sous-idée A', 'Sous-idée B'].forEach((sl, si) => {
        const off = si === 0 ? -0.45 : 0.45;
        const sn = node(bx + Math.cos(b.angle + off) * 185 - 65,
          by + Math.sin(b.angle + off) * 165 - 25, sl, b.color, { width: 130, height: 48, icon: '◆' });
        ns[sn.id] = sn; es.push(edge(bn.id, sn.id));
      });
    });
    return { nodes: ns, edges: es };
  },

  // ── ISHIKAWA — isEffect:true sur le nœud "Problème" ──────
  ishikawa: () => {
    const EFFECT_X = 980;
    const SPINE_Y  = 410;

    // isEffect:true  ←  THIS IS THE KEY FIX
    // isRoot:false   ←  must NOT be isRoot
    const effect = node(EFFECT_X, SPINE_Y - 40, 'Problème', '#F87171', {
      isEffect: true,
      isRoot:   false,
      width:    185,
      height:   80,
      icon:     '⚠️',
    });

    const cats = [
      { label: "👥 Main-d'œuvre", color: '#A78BFA', x: 180, y: 190, icon: '👥' },
      { label: '⚙️ Méthodes',     color: '#60A5FA', x: 430, y: 190, icon: '⚙️' },
      { label: '🔧 Machines',     color: '#34D399', x: 700, y: 190, icon: '🔧' },
      { label: '📦 Matériaux',    color: '#FBBF24', x: 230, y: 625, icon: '📦' },
      { label: '🌍 Milieu',       color: '#F472B6', x: 490, y: 625, icon: '🌍' },
      { label: '📊 Mesure',       color: '#6EE7F7', x: 750, y: 625, icon: '📊' },
    ];

    const ns  = { [effect.id]: effect };
    const es  = [];

    cats.forEach(cat => {
      const isTop = cat.y < SPINE_Y;
      const cn = node(cat.x, cat.y, cat.label, cat.color,
        { width: 175, height: 64, icon: cat.icon });
      ns[cn.id] = cn;
      // Arête vers l'effet — marquée isIshikawa pour filtrage visuel
      es.push(edge(cn.id, effect.id, '', { isIshikawa: true }));

      // 3 sous-causes
      ['Cause 1', 'Cause 2', 'Cause 3'].forEach((cl, ci) => {
        const sub = node(
          cat.x + (ci - 1) * 55,
          cat.y + (isTop ? -100 - ci * 8 : 90 + ci * 8),
          cl, cat.color, { width: 128, height: 46, icon: '▸' }
        );
        ns[sub.id] = sub;
        es.push(edge(sub.id, cn.id, '', { isIshikawa: true, isSub: true }));
      });
    });

    return { nodes: ns, edges: es };
  },

  swot: () => {
    const center = node(580, 380, '🏢 Entité', '#6EE7F7', { isRoot: true, width: 160, height: 70, icon: '🏢' });
    const quads = [
      { label: '💪 Forces',       color: '#34D399', x: 240, y: 165 },
      { label: '⚠️ Faiblesses',   color: '#F87171', x: 900, y: 165 },
      { label: '🚀 Opportunités', color: '#60A5FA', x: 240, y: 565 },
      { label: '🔥 Menaces',      color: '#FBBF24', x: 900, y: 565 },
    ];
    const items = [
      ['Expertise', 'Ressources', 'Réputation'],
      ['Coûts élevés', 'Délais longs', 'Manque RH'],
      ['Marché grdt', 'Partenariats', 'Innovation'],
      ['Concurrence', 'Règlements', 'Ruptures'],
    ];
    const ns = { [center.id]: center };
    const es = [];
    quads.forEach((q, qi) => {
      const qn = node(q.x, q.y, q.label, q.color, { width: 170, height: 65 });
      ns[qn.id] = qn; es.push(edge(center.id, qn.id));
      items[qi].forEach((lbl, i) => {
        const it = node(q.x + (qi % 2 === 0 ? -165 : 175), q.y + i * 82 - 60,
          lbl, q.color, { width: 142, height: 50, icon: '◆' });
        ns[it.id] = it; es.push(edge(qn.id, it.id));
      });
    });
    return { nodes: ns, edges: es };
  },

  five_why: () => {
    const problem = node(580, 80, '❓ Problème', '#F87171',
      { isRoot: true, width: 210, height: 75, icon: '❓' });
    const steps = [
      { label: 'Pourquoi 1 ?', color: '#F472B6', y: 240 },
      { label: 'Pourquoi 2 ?', color: '#A78BFA', y: 390 },
      { label: 'Pourquoi 3 ?', color: '#60A5FA', y: 540 },
      { label: 'Pourquoi 4 ?', color: '#34D399', y: 690 },
      { label: '✅ Cause Racine', color: '#FBBF24', y: 840, width: 210 },
    ];
    const ns = { [problem.id]: problem };
    const es = [];
    let prev = problem.id;
    steps.forEach(w => {
      const n = node(580, w.y, w.label, w.color, { width: w.width || 185, height: 62 });
      ns[n.id] = n; es.push(edge(prev, n.id)); prev = n.id;
    });
    return { nodes: ns, edges: es };
  },

  tree: () => {
    const root = node(700, 60, '🌳 Décision', '#6EE7F7',
      { isRoot: true, width: 180, height: 72, icon: '🌳' });
    const ns = { [root.id]: root };
    const es = [];
    const cols = ['#A78BFA', '#F472B6', '#34D399'];
    [0, 1, 2].forEach(i => {
      const sn = node(280 + i * 380, 220, `Stratégie ${String.fromCharCode(65+i)}`, cols[i], { width: 155, height: 58 });
      ns[sn.id] = sn; es.push(edge(root.id, sn.id));
      [0, 1].forEach(j => {
        const on2 = node(200 + i * 380 + j * 185, 390, `Option ${i*2+j+1}`, cols[i], { width: 140, height: 52, icon: '◈' });
        ns[on2.id] = on2; es.push(edge(sn.id, on2.id));
        [0, 1].forEach(k => {
          const rn = node(155 + i*380 + j*185 + k*95, 560, 'Résultat', cols[i], { width: 115, height: 46, icon: '▸' });
          ns[rn.id] = rn; es.push(edge(on2.id, rn.id));
        });
      });
    });
    return { nodes: ns, edges: es };
  },

  concept: () => {
    const center = node(660, 390, '💎 Concept', '#C084FC',
      { isRoot: true, width: 190, height: 78, icon: '💎' });
    const spokes = [
      { label: 'Définition',   color: '#6EE7F7', angle: -1.57, r: 285 },
      { label: 'Exemples',     color: '#F472B6', angle: -0.52, r: 285 },
      { label: 'Relations',    color: '#34D399', angle:  0.52, r: 285 },
      { label: 'Applications', color: '#FBBF24', angle:  1.57, r: 285 },
      { label: 'Limites',      color: '#F87171', angle: -2.62, r: 285 },
      { label: 'Questions',    color: '#60A5FA', angle:  2.62, r: 285 },
    ];
    const ns = { [center.id]: center };
    const es = [];
    spokes.forEach(sp => {
      const sn = node(
        660 + 95 + Math.cos(sp.angle) * sp.r - 75,
        390 + 39 + Math.sin(sp.angle) * sp.r - 27,
        sp.label, sp.color, { width: 152, height: 54 }
      );
      ns[sn.id] = sn; es.push(edge(center.id, sn.id));
    });
    return { nodes: ns, edges: es };
  },

  flowchart: () => {
    const ns = {}, es = [];
    const flow = [
      { label: '🚀 Début',           color: '#34D399', x: 540, y:  60, w: 160, h: 60 },
      { label: '📥 Entrée données',  color: '#6EE7F7', x: 540, y: 200, w: 185, h: 58 },
      { label: '🔍 Validation ?',    color: '#FBBF24', x: 540, y: 330, w: 180, h: 60 },
      { label: '⚙️ Traitement',      color: '#A78BFA', x: 540, y: 470, w: 175, h: 58 },
      { label: '📤 Sortie résultat', color: '#60A5FA', x: 540, y: 600, w: 185, h: 58 },
      { label: '✅ Fin',             color: '#34D399', x: 540, y: 730, w: 160, h: 60 },
      { label: '❌ Erreur',          color: '#F87171', x: 820, y: 330, w: 155, h: 58 },
      { label: '🔧 Correction',      color: '#F472B6', x: 820, y: 470, w: 155, h: 58 },
    ];
    const ids = flow.map((f, i) => {
      const n = node(f.x, f.y, f.label, f.color, { width: f.w, height: f.h, isRoot: i === 0 });
      ns[n.id] = n; return n.id;
    });
    [0,1,2,3,4].forEach(i => es.push(edge(ids[i], ids[i+1])));
    es.push(edge(ids[2], ids[6], 'Non', { dashed: true }));
    es.push(edge(ids[6], ids[7]));
    es.push(edge(ids[7], ids[1], 'Retry', { dashed: true, style: 'elbow' }));
    return { nodes: ns, edges: es };
  },
};

export const TEMPLATE_META = {
  mind:      { label: 'Carte Mentale',      icon: '🧠', desc: "Exploration d'idées",        color: '#6EE7F7' },
  ishikawa:  { label: 'Ishikawa (6M)',      icon: '🐟', desc: 'Analyse causes-effets',      color: '#A78BFA' },
  swot:      { label: 'Analyse SWOT',       icon: '📊', desc: 'Forces / Faiblesses',        color: '#34D399' },
  five_why:  { label: '5 Pourquoi',         icon: '❓', desc: 'Trouver la cause racine',    color: '#F472B6' },
  tree:      { label: 'Arbre de Décision',  icon: '🌳', desc: 'Structure hiérarchique',     color: '#FBBF24' },
  concept:   { label: 'Carte Conceptuelle', icon: '💎', desc: 'Réseau de concepts',         color: '#C084FC' },
  flowchart: { label: 'Flowchart',          icon: '🔄', desc: 'Processus et flux',          color: '#60A5FA' },
};
