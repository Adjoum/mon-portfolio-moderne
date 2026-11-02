// Recette P1 / P7.1 — accueil premium : Hero à bulles élastiques (photo derrière un verre sombre),
// petite bulle à dégradé, cartes, navigation
import { WEB, WIDTHS, check, open, layoutIssues, shot, intersects, pixelDiff } from './harness.mjs';

const FALLBACK_IMG = '.hb-fallback img';

// ════════════════════════════════════════════════════════════════
//  P1 / P7.1 — Accueil premium
// ════════════════════════════════════════════════════════════════
export async function accueil(browser, engine) {
  console.log(`\n▶ P1 / P7.1 — Accueil premium (${engine})`);
  for (const width of [...new Set([...WIDTHS, 375])].sort((a, b) => a - b)) {
    const { context, page, errors } = await open(browser, '/', { width });
    const h1 = page.getByRole('heading', { level: 1, name: /^(Bonjour|Bon après-midi|Bonsoir|Bonne nuit), je suis Adjoumani$/ });
    await h1.waitFor({ timeout: 20_000 });
    const img = page.getByRole('img', { name: 'Portrait de Koffi Wilfried Adjoumani' });
    await img.waitFor();
    // Mesure seulement une fois l'image chargée ET les feuilles de style appliquées
    await page.waitForFunction(sel => {
      const im = document.querySelector(sel);
      return im?.complete && getComputedStyle(im).position === 'absolute';
    }, FALLBACK_IMG, { timeout: 20_000 });
    await page.waitForTimeout(300);

    const geo = await page.evaluate(sel => {
      const im = document.querySelector(sel);
      const r = im.getBoundingClientRect();
      const box = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      const buttons = [...document.querySelectorAll('section[aria-labelledby="hero-title"] .hp-content a, section[aria-labelledby="hero-title"] .hp-content button')].map(box);
      // Texte et boutons au premier plan : le point central de chaque élément désigne l'élément lui-même
      const onTop = [...document.querySelectorAll('#hero-title, .hp-content a, .hp-content button')].every(el => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return !hit || el.contains(hit) || hit.contains(el);
      });
      return {
        natural: im.naturalWidth / im.naturalHeight, box: r.width / r.height, rect: box(im), src: im.currentSrc,
        stage: box(document.querySelector('.hb-stage')), orb: box(document.querySelector('.hb-orb')),
        buttons, onTop,
        zText: Number(getComputedStyle(document.querySelector('.hp-content')).zIndex),
        zBubbles: Number(getComputedStyle(document.querySelector('.hb-root')).zIndex),
        decorClicks: [...document.querySelectorAll('.hb-root, .hb-canvas, .hb-orb')].map(e => getComputedStyle(e).pointerEvents),
      };
    }, FALLBACK_IMG);
    // Visage : zone centrale de la photo (cadrage 1:1, visage entre 30-70 % en largeur et 10-65 % en hauteur)
    const face = { x: geo.rect.x + geo.rect.width * 0.3, y: geo.rect.y + geo.rect.height * 0.1, width: geo.rect.width * 0.4, height: geo.rect.height * 0.55 };
    const badges = await page.locator('.hb-badge').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, text: e.textContent }; }));
    const covering = badges.filter(b => intersects(b, face)).map(b => b.text);
    // Mobile et tablette : ni la grande bulle à sa déformation maximale (1,32 × le rayon) ni la petite ne touchent un bouton
    const reach = geo.stage.width * 0.66;
    const cx = geo.stage.x + geo.stage.width / 2, cy = geo.stage.y + geo.stage.height / 2;
    const bubbleBox = { x: cx - reach, y: cy - reach, width: reach * 2, height: reach * 2 };
    const touched = width < 1024 ? geo.buttons.filter(b => intersects(b, bubbleBox) || intersects(b, geo.orb)).length : 0;
    // Petite bulle juste sous la grande (mobile, tablette) : chevauche le bas de la grande
    const orbUnder = width >= 1024 || (geo.orb.y > geo.stage.y + geo.stage.height * 0.6 && geo.orb.y < geo.stage.y + geo.stage.height);
    const layout = await layoutIssues(page);
    const cards = await page.getByRole('navigation', { name: 'Accès rapides' }).getByRole('link').evaluateAll(els => els.map(e => ({ href: e.getAttribute('href'), h: e.getBoundingClientRect().height })));
    const ctas = await page.locator('section[aria-labelledby="hero-title"]').getByRole('link', { name: 'Voir mes projets' }).or(page.getByRole('button', { name: 'Télécharger mon CV' })).evaluateAll(els => els.map(e => e.getBoundingClientRect().height));

    const ok = layout.overflowX <= 0 && !layout.clipped.length && !covering.length
      && Math.abs(geo.box - geo.natural) < 0.02
      && geo.onTop && geo.zText > geo.zBubbles && geo.decorClicks.every(v => v === 'none') && !touched && orbUnder
      && cards.map(c => c.href).join() === '/cv-generator,/projects,/ai-lab,/skills' && cards.every(c => c.h >= 44)
      && ctas.length === 2 && ctas.every(h => h >= 44) && badges.length === 4;
    check(`${engine} ${width}px : mise en page (bulles derrière le texte, boutons dégagés)`, ok,
      `débordement ${layout.overflowX}px, coupés [${layout.clipped.join(' | ')}], badges sur le visage [${covering.join(', ')}], photo ${geo.box.toFixed(3)} vs ${geo.natural.toFixed(3)}, texte au premier plan ${geo.onTop} (z ${geo.zText}/${geo.zBubbles}), décor cliquable ${geo.decorClicks.join('/')}, boutons touchés ${touched}, petite bulle sous la grande ${orbUnder}, cartes ${cards.length}, boutons ${ctas.map(Math.round).join('/')} px, image ${geo.src.split('/').pop()}`);
    const real = errors.filter(e => !/favicon/i.test(e));
    if (real.length) check(`${engine} ${width}px : console sans erreur`, false, real.slice(0, 3).join(' | '));
    if ([320, 375, 390, 430, 768, 1024, 1366, 1920].includes(width)) {
      await page.waitForFunction(() => document.querySelector('.hb-root')?.dataset.mode !== 'static', null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await shot(page, `p7-accueil-${engine}-${width}`);
    }
    await context.close();
  }

  // Bulle élastique : animation réelle, visage jamais déformé, pause hors écran
  {
    const { context, page } = await open(browser, '/', { width: 1440 });
    await page.waitForFunction(() => ['live', 'morph'].includes(document.querySelector('.hb-root')?.dataset.mode), null, { timeout: 20_000 }).catch(() => {});
    const mode = await page.evaluate(() => document.querySelector('.hb-root')?.dataset.mode);
    check(`${engine} : animation de la grande bulle active (WebGL, ou contour CSS si l’appareil est trop lent)`, mode === 'live' || mode === 'morph', `mode ${mode}`);
    await page.waitForTimeout(1000); // fin du fondu
    const stage = await page.locator('.hb-stage').boundingBox();
    const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2, d = stage.width;
    // Visage (zone centrale) et bord de la bulle (où la silhouette se déforme)
    const faceClip = { x: cx - d * 0.16, y: cy - d * 0.24, width: d * 0.32, height: d * 0.36 };
    const edgeClip = { x: cx + d * 0.36, y: cy - d * 0.2, width: d * 0.3, height: d * 0.4 };
    const radius = () => page.evaluate(() => getComputedStyle(document.querySelector('.hb-fallback')).borderRadius);
    const snap = async () => ({ face: await page.screenshot({ clip: faceClip }), edge: await page.screenshot({ clip: edgeClip }), radius: await radius() });
    const a = await snap();
    await page.waitForTimeout(1600);
    const b = await snap();
    await page.waitForTimeout(1600);
    const c = await snap();
    const faceDiff = Math.max(await pixelDiff(page, a.face, b.face), await pixelDiff(page, b.face, c.face));
    const edgeDiff = Math.max(await pixelDiff(page, a.edge, b.edge), await pixelDiff(page, b.edge, c.edge), await pixelDiff(page, a.edge, c.edge));
    // WebGL : la silhouette change à l'écran ; repli CSS : le contour (border-radius) évolue
    const deforms = mode === 'live' ? edgeDiff > 4 : a.radius !== b.radius && b.radius !== c.radius;
    check(`${engine} : la silhouette se déforme (${mode === 'live' ? 'WebGL' : 'contour CSS'})`, deforms, mode === 'live' ? `écart moyen au bord ${edgeDiff.toFixed(1)}` : `${a.radius} → ${c.radius}`);
    check(`${engine} : le visage ne se déforme pas (zone centrale stable)`, faceDiff < 3.5, `écart moyen sur le visage ${faceDiff.toFixed(2)} (bord ${edgeDiff.toFixed(1)})`);
    if (mode === 'live') {
      const info = await page.evaluate(() => { const el = document.querySelector('.hb-canvas'); return { quality: el.dataset.quality, frames: Number(el.dataset.frames) }; });
      check(`${engine} : WebGL actif (qualité ${info.quality})`, info.frames > 30, `${info.frames} images`);
    }

    // Hors écran : plus aucune image calculée
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => ({ state: document.querySelector('.hb-canvas').dataset.state, frames: Number(document.querySelector('.hb-canvas').dataset.frames || 0) }));
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => Number(document.querySelector('.hb-canvas').dataset.frames || 0));
    check(`${engine} : animation suspendue hors écran`, mode !== 'live' || (before.state === 'paused' && after === before.frames), `${before.state}, ${before.frames} → ${after} images`);

    // Bouton « retour en haut » visible seulement après défilement
    check(`${engine} : bouton « Revenir en haut » après défilement`, await page.getByRole('button', { name: 'Revenir en haut de la page' }).isVisible());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    const resumed = await page.evaluate(() => document.querySelector('.hb-canvas').dataset.state);
    check(`${engine} : reprise au retour dans l’écran`, mode !== 'live' || resumed === 'running', resumed);
    await context.close();
  }

  // Mouvement réduit : composition statique, aucun WebGL
  {
    const { context, page } = await open(browser, '/', { width: 1366, reducedMotion: true });
    await page.waitForFunction(sel => document.querySelector(sel)?.complete, FALLBACK_IMG, { timeout: 20_000 });
    await page.waitForTimeout(3500);
    const s = await page.evaluate(() => ({
      mode: document.querySelector('.hb-root').dataset.mode,
      frames: document.querySelector('.hb-canvas').dataset.frames ?? null,
      anims: [...document.querySelectorAll('.hb-shape, .hb-orb, .hb-orb-ring, .hb-badge')].map(e => getComputedStyle(e).animationName),
      radius: getComputedStyle(document.querySelector('.hb-fallback')).borderRadius,
      typed: document.querySelector('.hp-typed')?.textContent,
    }));
    check(`${engine} : prefers-reduced-motion → bulles statiques, aucun WebGL, aucune animation`,
      s.mode === 'static' && s.frames === null && s.anims.every(n => n === 'none') && /47%/.test(s.radius), `${s.mode}, images ${s.frames}, ${s.anims.join(',')} ; ${s.radius}`);
    check(`${engine} : prefers-reduced-motion → sous-titre statique`, /Full Stack · Data/.test(s.typed ?? ''), s.typed);
    await shot(page, `p7-accueil-${engine}-reduced-motion`);
    await context.close();
  }

  // Clavier : aucun double arrêt de tabulation (enveloppe animée focalisable autour d'un lien)
  {
    const { context, page } = await open(browser, '/', { width: 1440 });
    await page.getByRole('link', { name: 'Voir mes projets' }).waitFor();
    await page.locator('footer').waitFor();
    const doubles = await page.evaluate(() => [...document.querySelectorAll('a [tabindex]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"]):not(a):not(button):not(input):not(select):not(textarea)')]
      .filter(el => el.closest('a') || el.querySelector('a')).map(el => `${el.tagName}:${el.textContent.trim().slice(0, 20)}`));
    check(`${engine} : clavier — aucun double arrêt de tabulation autour des liens`, !doubles.length, doubles.join(' | '));
    await context.close();
  }

  // Clavier : ordre de tabulation et focus visible dans le Hero.
  // WebKit (comme Safari par défaut) n'inclut pas les liens dans l'ordre de tabulation : parcours vérifié sous Chromium.
  if (engine === 'chromium') {
    const { context, page } = await open(browser, '/', { width: 1440 });
    await page.getByRole('link', { name: 'Voir mes projets' }).waitFor();
    const reached = [];
    for (let i = 0; i < 30 && reached.length < 30; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        const st = getComputedStyle(el);
        return { name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), outline: st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0, shadow: st.boxShadow !== 'none' };
      });
      reached.push(info);
    }
    const names = reached.map(r => r.name);
    const want = ['Voir mes projets', 'Télécharger mon CV', 'GitHub', 'LinkedIn', 'CV Generator Pro', 'Mes projets', 'IA Lab', 'Mes compétences'];
    const missing = want.filter(w => !names.some(n => n.startsWith(w)));
    const unnamed = names.filter(n => !n);
    check(`${engine} : clavier — chaque élément atteint a un nom accessible`, !unnamed.length, `${unnamed.length} sans nom`);
    const repeated = names.filter((n, i) => n && i && n === names[i - 1]);
    check(`${engine} : clavier — un seul arrêt par élément (pas de répétition consécutive)`, !repeated.length, repeated.join(', '));
    check(`${engine} : clavier — Hero, réseaux et 4 cartes atteignables`, !missing.length, missing.length ? `manquants : ${missing.join(', ')}` : '');
    const heroFocus = reached.filter(r => want.some(w => r.name.startsWith(w)));
    check(`${engine} : clavier — focus visible sur chaque élément du Hero`, heroFocus.length && heroFocus.every(r => r.outline || r.shadow));
    await context.close();
  }

  // Menu mobile : nom accessible, Échap, retour du focus
  {
    const { context, page } = await open(browser, '/', { width: 390 });
    const toggle = page.getByRole('button', { name: 'Ouvrir le menu' });
    await toggle.waitFor();
    await toggle.click();
    const menu = page.locator('#mobile-menu');
    await menu.waitFor();
    const expanded = await page.getByRole('button', { name: 'Fermer le menu' }).getAttribute('aria-expanded');
    const links = await menu.getByRole('link').count();
    const nested = await menu.locator('a button').count();
    await shot(page, `p1-menu-mobile-${engine}`);
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check(`${engine} : menu mobile accessible (ouvert, Échap, focus rendu)`, expanded === 'true' && links >= 7 && nested === 0 && focused === 'Ouvrir le menu', `aria-expanded=${expanded}, liens ${links}, boutons imbriqués ${nested}, focus « ${focused} »`);
    // Navigation réelle depuis le menu
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await page.locator('#mobile-menu').getByRole('link', { name: 'Projets' }).click();
    await page.waitForURL('**/projects');
    check(`${engine} : menu mobile → page Projets`, page.url().endsWith('/projects'));
    await context.close();
  }

  // Téléchargement du CV depuis le Hero : la version active (ou le fichier historique s'il n'y en a aucune)
  {
    const { context, page } = await open(browser, '/', { width: 1366 });
    const button = page.getByRole('button', { name: 'Télécharger mon CV' });
    await button.waitFor();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }).catch(() => null), button.click()]);
    check(`${engine} : « Télécharger mon CV » lance le téléchargement`, !!download, download ? download.url().replace(/token=[^&]+/, 'token=…') : 'aucun téléchargement');
    await context.close();
  }

  // Cartes : navigation vers les vraies pages
  {
    const { context, page } = await open(browser, '/', { width: 1366 });
    for (const [name, url] of [['CV Generator Pro', '/cv-generator'], ['IA Lab', '/ai-lab'], ['Mes compétences', '/skills']]) {
      await page.goto(`${WEB}/`);
      await page.getByRole('navigation', { name: 'Accès rapides' }).getByRole('link', { name: new RegExp(name) }).click();
      await page.waitForURL(`**${url}`);
      check(`${engine} : carte « ${name} » → ${url}`, page.url().endsWith(url));
    }
    await context.close();
  }
}

