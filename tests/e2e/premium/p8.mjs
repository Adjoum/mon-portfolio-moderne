// Recette P8 — salutation par heure locale, cylindre 3D des accès directs, globe avant le pied de page.
// Sous WebKit de Playwright (Windows, sans GPU), la 3D est trop lente : c'est son repli qui y est vérifié.
// Si une scène y reste affichée, son interaction n'est pas jugée : signalée comme non évaluée, jamais comptée.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, WEB, check, layoutIssues, neutralize, open, shot } from './harness.mjs';

const GREETINGS = /^(Bonjour|Bon après-midi|Bonsoir|Bonne nuit), je suis Adjoumani$/;
const STEP = Math.PI / 2;

const heroTitle = page => page.locator('#hero-title').innerText();
const stage = page => page.evaluate(() => {
  const s = document.querySelector('.hc-stage');
  return { mode: document.querySelector('.hc-root').dataset.mode, angle: Number(s?.dataset.angle ?? NaN), frames: Number(s?.dataset.frames ?? 0), hover: s?.dataset.hover ?? '', dragging: s?.dataset.dragging ?? '', quality: s?.dataset.quality ?? 'pleine' };
});
const globe = page => page.evaluate(() => {
  const s = document.querySelector('.gl-stage');
  return { mode: document.querySelector('.gl-section').dataset.mode, rotation: Number(s?.dataset.rotation ?? NaN), speed: Number(s?.dataset.speed ?? NaN), frames: Number(s?.dataset.frames ?? 0), quality: s?.dataset.quality ?? 'pleine', canvas: document.querySelectorAll('.gl-stage canvas').length };
});
const center = async (page, selector) => page.locator(selector).evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
const settledMode = (page, selector) => page.waitForFunction(sel => ['live', 'cards', 'static'].includes(document.querySelector(sel)?.dataset.mode), selector, { timeout: 30_000 }).catch(() => {});
const networkOf = page => page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
const CLS = () => {
  window.__cls = 0;
  window.__shifts = [];
  new PerformanceObserver(l => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls += e.value;
      // Diagnostic : élément déplacé, avant et après, au moment du décalage
      const s = e.sources?.[0];
      const n = s?.node;
      const what = n?.nodeType === 1 ? `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}` : n?.nodeName ?? '?';
      if (e.value > 0.01) window.__shifts.push(`${e.value.toFixed(3)} à ${Math.round(e.startTime)} ms : ${what} y ${Math.round(s?.previousRect.y ?? 0)}→${Math.round(s?.currentRect.y ?? 0)}, scrollY ${Math.round(scrollY)}`);
    }
  }).observe({ type: 'layout-shift', buffered: true });
};
const clsReport = page => page.evaluate(() => `CLS ${window.__cls.toFixed(4)}${window.__shifts.length ? ` ; ${window.__shifts.slice(0, 3).join(' | ')}` : ''}`);
/**
 * Descend jusqu'au globe comme un visiteur, par pas d'un écran : les sections chargées à la demande
 * arrivent au fil du défilement. (Le saut immédiat en bas de page, qui fait bouger les sections
 * préexistantes « Projets » et « Compétences », est mesuré à part contre la référence : rapport 27, §7.3.)
 */
async function reachGlobe(page) {
  for (let i = 0; i < 80 && !(await page.locator('.gl-stage').count()); i++) {
    await page.evaluate(() => scrollBy({ top: Math.round(innerHeight * 0.8), behavior: 'instant' }));
    await page.waitForTimeout(150);
  }
  await page.locator('.gl-stage').waitFor({ state: 'attached', timeout: 20_000 });
  await center(page, '.gl-stage');
}
/** Toucher réel (Chromium) : glissement du point (x1, y1) à (x2, y2) */
async function swipe(context, page, [x1, y1], [x2, y2], steps = 14) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export async function p8(browser, engine) {
  console.log(`\n▶ P8 — Salutation, cylindre 3D, globe (${engine})`);

  // ═══ P8.1 — Salutation ═══════════════════════════════════════
  // Même instant, quatre fuseaux : seule l'heure locale du navigateur compte
  const instant = new Date('2026-06-15T10:00:00Z');
  for (const [zone, want] of [['Africa/Abidjan', 'Bonjour'], ['Europe/Paris', 'Bon après-midi'], ['Asia/Tokyo', 'Bonsoir'], ['America/Los_Angeles', 'Bonne nuit']]) {
    const { context, page } = await open(browser, '/', { width: 1366, timezoneId: zone, beforeGoto: p => p.clock.setFixedTime(instant) });
    await page.locator('#hero-title').waitFor();
    check(`${engine} : fuseau ${zone} → « ${want} »`, (await heroTitle(page)).startsWith(`${want}, je suis`), await heroTitle(page));
    await context.close();
  }

  // Bornes exactes, à l'heure locale
  for (const [time, want] of [['04:59:30', 'Bonne nuit'], ['05:00:00', 'Bonjour'], ['11:59:30', 'Bonjour'], ['12:00:00', 'Bon après-midi'], ['17:59:30', 'Bon après-midi'], ['18:00:00', 'Bonsoir'], ['21:59:30', 'Bonsoir'], ['22:00:00', 'Bonne nuit']]) {
    const { context, page } = await open(browser, '/', { width: 1366, timezoneId: 'Africa/Abidjan', beforeGoto: p => p.clock.setFixedTime(new Date(`2026-06-15T${time}Z`)) });
    await page.locator('#hero-title').waitFor();
    check(`${engine} : ${time} → « ${want} »`, (await heroTitle(page)).startsWith(want), await heroTitle(page));
    await context.close();
  }

  // Aucun clignotement : un seul texte de salutation entre le premier affichage et la fin du chargement
  {
    const { context, page } = await open(browser, '/', {
      width: 1366,
      beforeGoto: p => p.addInitScript(() => {
        window.__seen = [];
        const note = () => {
          const text = document.querySelector('#hero-title')?.textContent;
          if (text && window.__seen.at(-1) !== text) window.__seen.push(text);
        };
        new MutationObserver(note).observe(document, { childList: true, subtree: true, characterData: true });
      }),
    });
    await page.locator('#hero-title').waitFor();
    await page.waitForTimeout(1500);
    const seen = await page.evaluate(() => window.__seen);
    check(`${engine} : aucun clignotement de la salutation`, seen.length === 1 && GREETINGS.test(seen[0]), seen.join(' → '));
    await context.close();
  }

  // Page ouverte au moment du changement de créneau
  {
    const { context, page } = await open(browser, '/', { width: 1366, timezoneId: 'Africa/Abidjan', beforeGoto: p => p.clock.install({ time: new Date('2026-06-15T17:59:50Z') }) });
    await page.locator('#hero-title').waitFor();
    const before = await heroTitle(page);
    const box = await page.locator('#hero-title').boundingBox();
    await page.clock.fastForward('00:15');
    await page.waitForFunction(() => /^Bonsoir/.test(document.querySelector('#hero-title')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
    const after = await heroTitle(page);
    const moved = await page.locator('#hero-title').boundingBox();
    check(`${engine} : mise à jour sans recharger la page, à 18:00`, before.startsWith('Bon après-midi') && after.startsWith('Bonsoir') && Math.abs(moved.y - box.y) < 1, `${before} → ${after}`);
    await context.close();
  }

  // Salutation la plus longue : tient à toutes les largeurs
  for (const width of [320, 360, 768, 1024, 1366]) {
    const { context, page } = await open(browser, '/', { width, timezoneId: 'Africa/Abidjan', beforeGoto: p => p.clock.setFixedTime(new Date('2026-06-15T14:00:00Z')) });
    await page.locator('#hero-title').waitFor();
    await page.waitForTimeout(200);
    const layout = await layoutIssues(page);
    check(`${engine} ${width}px : « Bon après-midi » sans débordement`, layout.overflowX <= 0 && !layout.clipped.length, `${layout.overflowX}px, ${layout.clipped.join(' | ')}`);
    await context.close();
  }

  // ═══ P8.2 — Cylindre ═════════════════════════════════════════
  let cylinderLive = false;
  {
    const { context, page, errors } = await open(browser, '/', { width: 1366, beforeGoto: p => p.addInitScript(CLS) });
    await page.locator('.hc-root').waitFor();
    await center(page, '.hc-root');
    await settledMode(page, '.hc-root');
    await page.waitForTimeout(engine === 'webkit' ? 6000 : 1500);
    const s = await stage(page);
    cylinderLive = s.mode === 'live' && engine === 'chromium';
    if (s.mode === 'live' && !cylinderLive) console.log(`ℹ ${engine} : cylindre affiché par rendu logiciel, interaction 3D non évaluée`);
    check(`${engine} : cylindre actif, ou grille de cartes si l’appareil est trop lent`, ['live', 'cards'].includes(s.mode), `mode ${s.mode}, ${s.frames} images, qualité ${s.quality}`);
    const links = await page.getByRole('navigation', { name: 'Accès rapides' }).getByRole('link').evaluateAll(els => els.map(e => ({ tag: e.tagName, href: e.getAttribute('href'), text: e.textContent })));
    check(`${engine} : quatre vrais liens, texte complet dans le document`, links.length === 4 && links.every(l => l.tag === 'A' && l.text.length > 40) && links.map(l => l.href).join() === '/cv-generator,/projects,/ai-lab,/skills', links.map(l => l.href).join());

    if (cylinderLive) {
      const a = await stage(page);
      await page.waitForTimeout(1500);
      const b = await stage(page);
      check(`${engine} : rotation automatique, lente`, b.angle > a.angle && (b.angle - a.angle) / 1.5 < 0.2 && b.frames > a.frames, `${((b.angle - a.angle) / 1.5).toFixed(3)} rad/s, ${b.frames - a.frames} images`);
      await shot(page, `p8-cylindre-${engine}-1366`);

      // Molette : le défilement de la page n'est jamais retenu par la scène
      const box = await page.locator('.hc-stage').boundingBox();
      const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
      await page.mouse.move(cx, cy);
      const y0 = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(400);
      check(`${engine} : molette au-dessus du cylindre → la page défile`, (await page.evaluate(() => scrollY)) > y0 + 100);
      await center(page, '.hc-root');
      await page.waitForTimeout(300);

      // Survol d'une carte : rotation suspendue, curseur de lien
      const box2 = await page.locator('.hc-stage').boundingBox();
      const [x, y] = [box2.x + box2.width / 2, box2.y + box2.height / 2];
      await page.mouse.move(x, y);
      await page.waitForTimeout(1600);
      const h1 = await stage(page);
      await page.waitForTimeout(700);
      const h2 = await stage(page);
      const cursor = await page.locator('.hc-stage').evaluate(el => el.style.cursor);
      check(`${engine} : survol d’une carte → rotation suspendue, curseur de lien`, h1.hover !== '' && Math.abs(h2.angle - h1.angle) < 0.01 && cursor === 'pointer', `carte ${h1.hover}, écart ${(h2.angle - h1.angle).toFixed(4)}, curseur ${cursor}`);
      check(`${engine} : à l’arrêt, plus aucune image calculée`, h2.frames === h1.frames, `${h1.frames} → ${h2.frames}`);

      // Glissement à la souris : rotation, capture rendue, aucun clic parasite
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) { await page.mouse.move(x - i * 18, y); await page.waitForTimeout(12); }
      const during = await stage(page);
      await page.mouse.up();
      await page.waitForTimeout(150);
      const released = await stage(page);
      check(`${engine} : glissement → le cylindre tourne, sans quitter la page`, during.dragging === 'true' && during.angle > h2.angle + 0.1 && page.url().endsWith('/'), `angle ${h2.angle} → ${during.angle}`);
      check(`${engine} : pointeur rendu à la fin du glissement`, released.dragging === '', released.dragging);
      await page.mouse.move(x + 900, 5);

      // Chaque lien amène sa carte de face ; le clic sur le cylindre ouvre la bonne page
      for (const [i, name, url] of [[2, 'IA Lab', '/ai-lab'], [3, 'Mes compétences', '/skills'], [0, 'CV Generator Pro', '/cv-generator']]) {
        await page.goto(new URL('/', page.url()).href, { waitUntil: 'domcontentloaded' });
        await page.locator('.hc-root').waitFor();
        await center(page, '.hc-root');
        await page.waitForFunction(() => document.querySelector('.hc-root').dataset.mode === 'live', null, { timeout: 15_000 });
        await page.getByRole('navigation', { name: 'Accès rapides' }).getByRole('link', { name: new RegExp(name) }).hover();
        await page.waitForTimeout(1700);
        const at = await stage(page);
        const front = ((Math.round(at.angle / STEP) % 4) + 4) % 4;
        check(`${engine} : survol de « ${name} » → carte de face`, front === i && Math.abs(at.angle / STEP - Math.round(at.angle / STEP)) < 0.02, `angle ${at.angle}, carte ${front}`);
        const b3 = await page.locator('.hc-stage').boundingBox();
        await page.mouse.click(b3.x + b3.width / 2, b3.y + b3.height / 2);
        await page.waitForURL(`**${url}`, { timeout: 8000 }).catch(() => {});
        check(`${engine} : clic sur la carte « ${name} » → ${url}`, page.url().endsWith(url), page.url());
      }
      await page.goto(new URL('/', page.url()).href, { waitUntil: 'domcontentloaded' });
      await page.locator('.hc-root').waitFor();
      await center(page, '.hc-root');
      await page.waitForFunction(() => document.querySelector('.hc-root').dataset.mode === 'live', null, { timeout: 15_000 });

      // Pause, exigée pour un contenu qui bouge plus de 5 s (WCAG 2.2.2)
      const pause = page.getByRole('button', { name: 'Mettre la rotation en pause' });
      await pause.click();
      await page.waitForTimeout(1800);
      const p1 = await stage(page);
      await page.waitForTimeout(700);
      const p2 = await stage(page);
      check(`${engine} : bouton pause → rotation arrêtée, plus aucune image`, p1.angle === p2.angle && p1.frames === p2.frames && await page.getByRole('button', { name: 'Reprendre la rotation' }).getAttribute('aria-pressed') === 'true', `${p1.frames} → ${p2.frames} images`);
      await page.getByRole('button', { name: 'Reprendre la rotation' }).click();
      await page.waitForTimeout(900);
      check(`${engine} : reprise de la rotation`, (await stage(page)).angle > p2.angle);

      // Hors écran : plus aucune image
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
      await page.waitForTimeout(500);
      const o1 = await stage(page);
      await page.waitForTimeout(900);
      const o2 = await stage(page);
      check(`${engine} : cylindre suspendu hors écran`, o1.frames === o2.frames, `${o1.frames} → ${o2.frames}`);
    }
    const cls = await page.evaluate(() => window.__cls);
    check(`${engine} : mise en page stable pendant l’arrivée de la 3D`, cls < 0.1, await clsReport(page));
    const real = errors.filter(e => !/favicon/i.test(e));
    check(`${engine} : console sans erreur (cylindre)`, !real.length, real.slice(0, 3).join(' | '));
    await context.close();
  }

  // Clavier : le focus amène la carte, focus visible, Entrée ouvre la page.
  // WebKit n'inclut pas les liens dans la tabulation par défaut (comme Safari) : focus posé directement.
  {
    const { context, page } = await open(browser, '/', { width: 1366 });
    await page.locator('.hc-root').waitFor();
    await center(page, '.hc-root');
    await settledMode(page, '.hc-root');
    await page.waitForTimeout(1200);
    const link = page.getByRole('navigation', { name: 'Accès rapides' }).getByRole('link', { name: /Mes compétences/ });
    await page.keyboard.press('Tab');
    await link.focus();
    await page.waitForTimeout(1700);
    const s = await stage(page);
    const style = await link.evaluate(el => { const st = getComputedStyle(el); return { outline: st.outlineStyle, width: parseFloat(st.outlineWidth) }; });
    if (s.mode === 'live') check(`${engine} : focus clavier → carte de face`, (((Math.round(s.angle / STEP) % 4) + 4) % 4) === 3, `angle ${s.angle}`);
    check(`${engine} : focus visible sur le lien`, style.outline !== 'none' && style.width >= 2, JSON.stringify(style));
    await page.keyboard.press('Enter');
    await page.waitForURL('**/skills', { timeout: 8000 }).catch(() => {});
    check(`${engine} : Entrée ouvre la page de la carte`, page.url().endsWith('/skills'), page.url());
    await context.close();
  }

  // Largeurs : aucune coupure ni débordement, cibles d'au moins 44 px
  for (const width of [320, 390, 430, 640, 768, 820, 1024, 1280, 1366, 1920]) {
    const { context, page } = await open(browser, '/', { width, mobile: width < 1024 });
    await page.locator('.hc-root').waitFor();
    await center(page, '.hc-root');
    await page.waitForTimeout(width < 768 ? 400 : 2500);
    const layout = await layoutIssues(page);
    const mode = await page.locator('.hc-root').getAttribute('data-mode');
    const links = await page.locator('.hc-list a').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    const expected = width < 768 ? mode === 'cards' : ['live', 'cards', 'poster'].includes(mode);
    check(`${engine} ${width}px : accès directs (${mode})`, expected && layout.overflowX <= 0 && !layout.clipped.length && links.every(h => h >= 44), `débordement ${layout.overflowX}px, coupés [${layout.clipped.join(' | ')}], cibles ${links.map(Math.round).join('/')}`);
    if ([390, 820, 1920].includes(width)) await shot(page, `p8-cartes-${engine}-${width}`);
    await context.close();
  }

  // Mobile : carrousel, aucun octet de la 3D du cylindre, carte suivante visible
  {
    const { context, page } = await open(browser, '/', { width: 390, mobile: true });
    await page.locator('.hc-list').waitFor();
    await center(page, '.hc-list');
    await page.waitForTimeout(800);
    const c = await page.evaluate(() => {
      const list = document.querySelector('.hc-list');
      const items = [...list.children].map(li => li.getBoundingClientRect());
      return { snap: getComputedStyle(list).scrollSnapType, scroll: list.scrollWidth > list.clientWidth, peek: items[1].left < innerWidth, dots: document.querySelectorAll('.hc-dots span').length, stage: !!document.querySelector('.hc-stage') };
    });
    const net = await networkOf(page);
    check(`${engine} : mobile → carrousel à crans, carte suivante visible, pastilles`, c.snap.startsWith('x') && c.scroll && c.peek && c.dots === 4 && !c.stage, JSON.stringify(c));
    check(`${engine} : mobile → cylindre jamais téléchargé`, !net.some(u => /CardCylinder/.test(u)));
    await page.locator('.hc-list').evaluate(el => el.scrollTo({ left: el.scrollWidth, behavior: 'instant' }));
    await page.waitForTimeout(500);
    const onDot = await page.locator('.hc-dots span').evaluateAll(els => els.findIndex(e => e.dataset.on === 'true'));
    const last = page.locator('.hc-list a').nth(3);
    const inView = await last.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
    check(`${engine} : carrousel → dernière carte atteinte, pastille à jour`, onDot === 3 && inView, `pastille ${onDot}, visible ${inView}`);
    await last.click();
    await page.waitForURL('**/skills', { timeout: 8000 }).catch(() => {});
    check(`${engine} : carrousel → lien ouvert`, page.url().endsWith('/skills'), page.url());
    await context.close();
  }

  // Tablette tactile : 3D allégée, glissement horizontal, défilement vertical libre, appui sur une carte
  if (engine === 'chromium') {
    const { context, page } = await open(browser, '/', { width: 820, height: 1100, mobile: true });
    await page.locator('.hc-root').waitFor();
    await center(page, '.hc-root');
    await settledMode(page, '.hc-root');
    await page.waitForTimeout(1500);
    const s0 = await stage(page);
    check(`${engine} : tablette → version 3D conservée`, s0.mode === 'live', `mode ${s0.mode}`);
    if (s0.mode === 'live') {
      const box = await page.locator('.hc-stage').boundingBox();
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      await swipe(context, page, [x + 150, y], [x - 150, y]);
      await page.waitForTimeout(150);
      const s1 = await stage(page);
      check(`${engine} : glissement horizontal au doigt → le cylindre tourne, la page ne bouge pas`, s1.angle > s0.angle + 0.2 && (await page.evaluate(() => scrollX)) === 0, `angle ${s0.angle} → ${s1.angle}`);
      const y0 = await page.evaluate(() => scrollY);
      await swipe(context, page, [x, y + 100], [x, y - 120]);
      await page.waitForTimeout(500);
      const y1 = await page.evaluate(() => scrollY);
      check(`${engine} : glissement vertical au doigt → la page défile`, y1 > y0 + 80, `${y0} → ${y1}`);

      // Appui : page rechargée, cylindre de face, rotation en pause (entre deux cartes, l'appui ne fait rien)
      await page.goto(new URL('/', page.url()).href, { waitUntil: 'domcontentloaded' });
      await page.locator('.hc-root').waitFor();
      await center(page, '.hc-root');
      await page.waitForFunction(() => document.querySelector('.hc-root').dataset.mode === 'live', null, { timeout: 15_000 });
      await page.getByRole('button', { name: 'Mettre la rotation en pause' }).tap();
      await page.waitForTimeout(1800);
      const b2 = await page.locator('.hc-stage').boundingBox();
      const at = await stage(page);
      const front = ((Math.round(at.angle / STEP) % 4) + 4) % 4;
      const url = ['/cv-generator', '/projects', '/ai-lab', '/skills'][front];
      await page.touchscreen.tap(b2.x + b2.width / 2, b2.y + b2.height * 0.5);
      await page.waitForURL(`**${url}`, { timeout: 8000 }).catch(() => {});
      check(`${engine} : appui sur la carte de face → ${url}`, page.url().endsWith(url), `${page.url()}, angle ${at.angle}`);
    }
    await context.close();
  }

  // ═══ P8.3 — Globe ════════════════════════════════════════════
  let globeLive = false;
  {
    const { context, page, errors } = await open(browser, '/', { width: 1366, beforeGoto: p => p.addInitScript(CLS) });
    await page.locator('.hc-root').waitFor();
    await reachGlobe(page);
    await settledMode(page, '.gl-section');
    // Sans GPU, la qualité peut encore être réduite puis la scène abandonnée : attendre un état définitif
    await page.waitForTimeout(engine === 'webkit' ? 6000 : 1200);
    const order = await page.evaluate(() => {
      const section = document.querySelector('.gl-section');
      const footer = document.querySelector('footer');
      const sections = [...document.querySelectorAll('section')];
      return { last: sections.at(-1) === section, gap: footer.getBoundingClientRect().top - section.getBoundingClientRect().bottom, before: !!(section.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    check(`${engine} : globe juste avant le pied de page`, order.last && order.before && Math.abs(order.gap) <= 1, JSON.stringify(order));
    const g = await globe(page);
    globeLive = g.mode === 'live' && engine === 'chromium';
    if (g.mode === 'live' && !globeLive) console.log(`ℹ ${engine} : globe affiché par rendu logiciel, interaction 3D non évaluée`);
    check(`${engine} : globe actif, ou image du globe si l’appareil est trop lent`, ['live', 'static'].includes(g.mode), `mode ${g.mode}, ${g.frames} images, qualité ${g.quality}`);
    const label = await page.locator('.gl-stage').getAttribute('aria-label');
    check(`${engine} : globe décrit aux technologies d’assistance`, /Côte d’Ivoire/.test(label ?? '') && (await page.locator('.gl-stage').getAttribute('role')) === 'img');
    const title = page.getByRole('heading', { level: 2, name: 'Vers tous les continents' });
    check(`${engine} : titre de section présent`, await title.isVisible());

    if (globeLive) {
      await shot(page, `p8-globe-${engine}-1366`);
      const a = await globe(page);
      await page.waitForTimeout(1500);
      const b = await globe(page);
      check(`${engine} : rotation lente par défaut, vers l’est`, b.rotation > a.rotation && Math.abs(b.speed - (2 * Math.PI) / 150) < 0.005, `${b.speed} rad/s`);

      const shownLabels = await page.locator('.gl-label').evaluateAll(els => els.filter(e => Number(e.style.opacity) > 0.5).map(e => e.textContent));
      check(`${engine} : repères lisibles sur la face visible`, shownLabels.length >= 5 && shownLabels.includes('Côte d’Ivoire') && shownLabels.includes('Afrique'), shownLabels.join(', '));
      check(`${engine} : libellés inertes`, await page.locator('.gl-labels').evaluate(el => getComputedStyle(el).pointerEvents) === 'none');

      for (const [name, rate] of [['Normal', 2 * Math.PI / 70], ['Rapide', 2 * Math.PI / 30], ['Très rapide', 2 * Math.PI / 12], ['Lent', 2 * Math.PI / 150]]) {
        const before = (await globe(page)).speed;
        await page.getByRole('radio', { name, exact: true }).check();
        await page.waitForTimeout(120);
        const ramp = (await globe(page)).speed;
        await page.waitForTimeout(3200);
        const end = (await globe(page)).speed;
        const smooth = Math.abs(ramp - before) < Math.abs(rate - before) * 0.6;
        check(`${engine} : vitesse « ${name} » → transition fluide`, smooth && Math.abs(end - rate) < Math.max(rate * 0.07, 0.008), `${before} → ${ramp} → ${end} (visée ${rate.toFixed(3)})`);
      }

      // Clavier : flèches du groupe de boutons radio
      await page.getByRole('radio', { name: 'Lent', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      const checked = await page.getByRole('radio', { name: 'Normal', exact: true }).isChecked();
      const ring = await page.locator('.gl-speed input:focus-visible + span').evaluate(el => getComputedStyle(el).outlineStyle).catch(() => 'none');
      check(`${engine} : vitesse au clavier, focus visible`, checked && ring !== 'none', `coché ${checked}, contour ${ring}`);

      // Pause
      const pause = page.getByRole('button', { name: 'Pause', exact: true });
      await pause.click();
      await page.waitForTimeout(6000);
      const p1 = await globe(page);
      await page.waitForTimeout(800);
      const p2 = await globe(page);
      check(`${engine} : pause → arrêt progressif, plus aucune image`, p1.speed === 0 && p1.frames === p2.frames, `${p1.speed} rad/s, ${p1.frames} → ${p2.frames} images`);
      await page.getByRole('radio', { name: 'Rapide', exact: true }).check();
      await page.waitForTimeout(1400);
      const r = await globe(page);
      check(`${engine} : choisir une vitesse relance la rotation`, r.speed > 0.1 && await page.getByRole('button', { name: 'Pause', exact: true }).getAttribute('aria-pressed') === 'false', `${r.speed} rad/s`);

      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(500);
      const o1 = await globe(page);
      await page.waitForTimeout(900);
      const o2 = await globe(page);
      check(`${engine} : globe suspendu hors écran`, o1.frames === o2.frames, `${o1.frames} → ${o2.frames}`);
    }
    const cls = await page.evaluate(() => window.__cls);
    check(`${engine} : mise en page stable (globe)`, cls < 0.1, await clsReport(page));
    const real = errors.filter(e => !/favicon/i.test(e));
    check(`${engine} : console sans erreur (globe)`, !real.length, real.slice(0, 3).join(' | '));
    await context.close();
  }

  for (const width of [320, 375, 390, 768, 1024, 1366, 1920]) {
    const { context, page } = await open(browser, '/', { width, mobile: width < 1024 });
    await page.locator('.hc-root').waitFor();
    await reachGlobe(page);
    await page.waitForTimeout(1800);
    const m = await page.evaluate(() => {
      const r = el => el?.getBoundingClientRect();
      const stageBox = r(document.querySelector('.gl-stage'));
      return { w: stageBox.width, h: stageBox.height, radios: [...document.querySelectorAll('.gl-speed span')].map(e => r(e).height), pause: r(document.querySelector('.gl-pause'))?.height ?? 0, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, panelRight: r(document.querySelector('.gl-panel'))?.right ?? 0 };
    });
    const layout = await layoutIssues(page);
    const mode = await page.locator('.gl-section').getAttribute('data-mode');
    const panelOk = mode === 'static' || (m.radios.every(h => h >= 44) && m.pause >= 44 && m.panelRight <= width);
    check(`${engine} ${width}px : globe rond, commande complète et accessible (${mode})`, Math.abs(m.w - m.h) < 1 && m.w > 240 && m.overflow <= 0 && !layout.clipped.length && panelOk, JSON.stringify({ ...m, clipped: layout.clipped }));
    if ([390, 1920].includes(width)) await shot(page, `p8-globe-${engine}-${width}`);
    await context.close();
  }

  // ═══ P8.4 — Replis ═══════════════════════════════════════════
  // Mouvement réduit : aucune 3D, aucune animation, tout reste accessible
  for (const width of [1366, 820, 390]) {
    const { context, page } = await open(browser, '/', { width, reducedMotion: true, mobile: width < 1024 });
    await page.locator('.hc-root').waitFor();
    await reachGlobe(page);
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({
      card: document.querySelector('.hc-root').dataset.mode,
      globe: document.querySelector('.gl-section').dataset.mode,
      canvases: document.querySelectorAll('.hc-root canvas, .gl-section canvas').length,
      poster: document.querySelector('.gl-poster')?.complete && document.querySelector('.gl-poster').naturalWidth,
      panel: !!document.querySelector('.gl-panel'),
      anim: getComputedStyle(document.querySelector('.hc-list li')).animationName,
      links: document.querySelectorAll('.hc-list a').length,
    }));
    const net = await networkOf(page);
    check(`${engine} ${width}px : mouvement réduit → cartes et image du globe, aucune 3D ni animation`, m.card === 'cards' && m.globe === 'static' && !m.canvases && m.poster > 0 && !m.panel && m.anim === 'none' && m.links === 4 && !net.some(u => /CardCylinder|GlobeScene/.test(u)), JSON.stringify(m));
    if (width === 1366) await shot(page, `p8-mouvement-reduit-${engine}`, { fullPage: false });
    await context.close();
  }

  // Appareil modeste et économie de données
  {
    const { context, page } = await open(browser, '/', {
      width: 1366,
      beforeGoto: p => p.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 })),
    });
    await page.locator('.hc-root').waitFor();
    await page.waitForTimeout(2500);
    const net = await networkOf(page);
    check(`${engine} : appareil modeste → aucune 3D téléchargée`, (await page.locator('.hc-root').getAttribute('data-mode')) === 'cards' && !net.some(u => /CardCylinder/.test(u)));
    await context.close();
  }

  // WebGL absent : repli sans erreur visible, liens intacts
  {
    const { context, page, errors } = await open(browser, '/', {
      width: 1366,
      beforeGoto: p => p.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          return /webgl/.test(type) ? null : get.call(this, type, ...rest);
        };
      }),
    });
    await page.locator('.hc-root').waitFor();
    await center(page, '.hc-root');
    await page.waitForFunction(() => document.querySelector('.hc-root').dataset.mode === 'cards', null, { timeout: 15_000 }).catch(() => {});
    const links = await page.locator('.hc-list a').count();
    const mode = await page.locator('.hc-root').getAttribute('data-mode');
    const pageErrors = errors.filter(e => /^pageerror/.test(e));
    check(`${engine} : WebGL absent → grille de cartes, sans erreur de page`, mode === 'cards' && links === 4 && !pageErrors.length, `mode ${mode}, ${pageErrors.slice(0, 2).join(' | ')}`);
    await shot(page, `p8-sans-webgl-${engine}`);
    await context.close();
  }

  // Contexte WebGL perdu en cours d'utilisation : repli immédiat, la page ne saute pas
  if (cylinderLive) {
    const { context, page } = await open(browser, '/', { width: 1366 });
    await page.locator('.hc-root').waitFor();
    await center(page, '.hc-root');
    await page.waitForFunction(() => document.querySelector('.hc-root').dataset.mode === 'live', null, { timeout: 15_000 });
    const before = await page.locator('.hc-root').evaluate(el => el.getBoundingClientRect().height);
    await page.locator('.hc-stage canvas').evaluate(c => (c.getContext('webgl2') ?? c.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext());
    await page.waitForTimeout(800);
    const m = await page.locator('.hc-root').evaluate(el => ({ mode: el.dataset.mode, h: el.getBoundingClientRect().height }));
    check(`${engine} : contexte WebGL perdu → grille de cartes, même hauteur`, m.mode === 'cards' && Math.abs(m.h - before) < 1, `${m.mode}, ${before} → ${m.h} px`);
    await context.close();
  }
  if (globeLive) {
    const { context, page } = await open(browser, '/', { width: 1366 });
    await page.locator('.hc-root').waitFor();
    await reachGlobe(page);
    await page.waitForFunction(() => document.querySelector('.gl-section').dataset.mode === 'live', null, { timeout: 15_000 });
    await page.locator('.gl-stage canvas').evaluate(c => (c.getContext('webgl2') ?? c.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext());
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => ({ mode: document.querySelector('.gl-section').dataset.mode, poster: getComputedStyle(document.querySelector('.gl-poster')).opacity, panel: getComputedStyle(document.querySelector('.gl-panel')).visibility }));
    check(`${engine} : globe, contexte perdu → image du globe, place conservée`, m.mode === 'static' && m.poster === '1' && m.panel === 'hidden', JSON.stringify(m));
    await context.close();
  }

  // Appareil trop lent (WebKit sans GPU, ou intervalle simulé) : renoncement rapide, jamais d'apparition suivie
  // d'un retrait ; le globe n'essaie pas à son tour.
  if (engine === 'webkit') {
    const { context, page, errors } = await open(browser, '/', { width: 1366 });
    await page.locator('.hc-root').waitFor();
    await center(page, '.hc-root');
    await page.waitForTimeout(500);
    const seen = [];
    const t0 = Date.now();
    let settled = null;
    while (Date.now() - t0 < 20_000 && !settled) {
      const mode = await page.locator('.hc-root').getAttribute('data-mode');
      if (seen.at(-1) !== mode) seen.push(mode);
      if (mode === 'cards') settled = Date.now() - t0;
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(900);
    await center(page, '.gl-section');
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => ({ mode: document.querySelector('.gl-section')?.dataset.mode, canvas: document.querySelectorAll('.gl-stage canvas').length, panel: document.querySelector('.gl-panel') && getComputedStyle(document.querySelector('.gl-panel')).visibility }));
    if (seen.includes('cards')) {
      // Sur le serveur de développement, three.js arrive module par module : délai réel mesuré sur le build
      check(`${engine} : appareil lent → cartes, sans passage par la 3D`, !seen.includes('live'), `${seen.join(' → ')} en ${settled} ms`);
      check(`${engine} : appareil lent → le globe n’essaie pas à son tour`, after.mode === 'static' && !after.canvas, JSON.stringify(after));
    } else {
      check(`${engine} : 3D assez fluide sur ce poste pour rester active`, seen.at(-1) === 'live', seen.join(' → '));
    }
    const real = errors.filter(e => !/favicon/i.test(e));
    check(`${engine} : renoncement sans erreur`, !real.length, real.slice(0, 2).join(' | '));
    await shot(page, `p8-appareil-lent-${engine}`);
    await context.close();
  }

  // ═══ P8.5 — Sécurité et accessibilité, scènes réellement actives ═══
  // La CSP de production et axe sont repris ici car la recette `regression` ne fait pas défiler la page :
  // elle ne chargerait pas le globe. CSP en mode bloquant, hôtes de production remplacés par ceux de la recette.
  {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const csp = vercel.headers[0].headers.find(h => /Content-Security-Policy/.test(h.key)).value
      .replace("connect-src 'self'", "connect-src 'self' http://localhost:58521 http://localhost:5000 ws://localhost:5173");
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await neutralize(context);
    await context.route(`${WEB}/`, async r => {
      const res = await r.fetch();
      return r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } });
    });
    const page = await context.newPage();
    const violations = [];
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 160)); });
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`)));
    await page.goto(`${WEB}/`);
    await page.locator('.hc-root').waitFor();
    await center(page, '.hc-root');
    await settledMode(page, '.hc-root');
    await reachGlobe(page);
    await settledMode(page, '.gl-section');
    const modes = await page.evaluate(() => [document.querySelector('.hc-root').dataset.mode, document.querySelector('.gl-section').dataset.mode]);
    const unique = [...new Set(violations)];
    check(`${engine} : CSP de production en mode bloquant, 3D chargée — aucune violation`, !unique.length, `cylindre ${modes[0]}, globe ${modes[1]} ; ${unique.slice(0, 3).join(' | ')}`);
    await context.close();
  }

  const axePath = process.env.AXE_CORE_PATH;
  if (axePath && fs.existsSync(axePath)) {
    const axeSource = fs.readFileSync(axePath, 'utf8');
    for (const [width, reducedMotion] of [[390, false], [820, false], [1366, false], [1366, true]]) {
      const { context, page } = await open(browser, '/', { width, reducedMotion, mobile: width < 1024 });
      await page.locator('.hc-root').waitFor();
      await center(page, '.hc-root');
      await settledMode(page, '.hc-root');
      await reachGlobe(page);
      await settledMode(page, '.gl-section');
      await page.addScriptTag({ content: axeSource });
      const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, target: v.nodes[0]?.target?.join(' ') })));
      const modes = await page.evaluate(() => [document.querySelector('.hc-root').dataset.mode, document.querySelector('.gl-section').dataset.mode]);
      check(`${engine} ${width}px${reducedMotion ? ' mouvement réduit' : ''} : axe WCAG 2.2 AA, page entière, scènes à l’écran — aucune violation`, !res.length, `cylindre ${modes[0]}, globe ${modes[1]} ; ${res.map(v => `${v.id}×${v.n} (${v.target})`).join(' | ')}`);
      await context.close();
    }
  } else {
    console.log('ℹ accessibilité axe ignorée (AXE_CORE_PATH absent)');
  }

  // Nouvelle visite après navigation interne : ni double canevas ni erreur
  if (cylinderLive) {
    const { context, page, errors } = await open(browser, '/', { width: 1366 });
    await page.locator('.hc-root').waitFor();
    await center(page, '.hc-root');
    await page.waitForFunction(() => document.querySelector('.hc-root').dataset.mode === 'live', null, { timeout: 15_000 });
    for (let i = 0; i < 2; i++) {
      await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Contact' }).first().click().catch(() => page.locator('a[href="/contact"]').first().click());
      await page.waitForURL('**/contact');
      await page.locator('a[href="/"]').first().click();
      await page.locator('.hc-root').waitFor();
      await center(page, '.hc-root');
      await page.waitForFunction(() => document.querySelector('.hc-root').dataset.mode === 'live', null, { timeout: 15_000 });
    }
    const canvases = await page.locator('.hc-stage canvas').count();
    const real = errors.filter(e => !/favicon/i.test(e));
    check(`${engine} : allers-retours → un seul canevas, aucune erreur`, canvases === 1 && !real.length, `${canvases} canevas ; ${real.slice(0, 2).join(' | ')}`);
    await context.close();
  }
}
