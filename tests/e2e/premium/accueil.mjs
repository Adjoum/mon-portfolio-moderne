// Recette P1 — accueil premium (portrait en bulle organique, Hero, cartes, navigation)
import { WEB, WIDTHS, check, open, layoutIssues, shot, intersects } from './harness.mjs';

// ════════════════════════════════════════════════════════════════
//  P1 — Accueil premium
// ════════════════════════════════════════════════════════════════
export async function accueil(browser, engine) {
  console.log(`\n▶ P1 — Accueil premium (${engine})`);
  for (const width of WIDTHS) {
    const { context, page, errors } = await open(browser, '/', { width });
    const h1 = page.getByRole('heading', { level: 1, name: 'Bonjour, je suis Adjoumani' });
    await h1.waitFor({ timeout: 20_000 });
    const img = page.getByRole('img', { name: 'Portrait de Koffi Wilfried Adjoumani' });
    await img.waitFor();
    // Mesure seulement une fois l'image chargée ET les feuilles de style appliquées
    await page.waitForFunction(() => {
      const im = document.querySelector('.op-clip img');
      return im?.complete && getComputedStyle(im).objectFit === 'cover';
    }, null, { timeout: 20_000 });
    await page.waitForTimeout(300);

    const geo = await page.evaluate(() => {
      const im = document.querySelector('.op-clip img');
      const r = im.getBoundingClientRect();
      return { natural: im.naturalWidth / im.naturalHeight, box: r.width / r.height, fit: getComputedStyle(im).objectFit, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, src: im.currentSrc };
    });
    // Visage : zone centrale de la photo (cadrage 1:1, visage entre 30-70 % en largeur et 10-65 % en hauteur)
    const face = { x: geo.rect.x + geo.rect.width * 0.3, y: geo.rect.y + geo.rect.height * 0.1, width: geo.rect.width * 0.4, height: geo.rect.height * 0.55 };
    const badges = await page.locator('.op-badge').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, text: e.textContent }; }));
    const covering = badges.filter(b => intersects(b, face)).map(b => b.text);
    const layout = await layoutIssues(page);
    const cards = await page.getByRole('navigation', { name: 'Accès rapides' }).getByRole('link').evaluateAll(els => els.map(e => ({ href: e.getAttribute('href'), h: e.getBoundingClientRect().height })));
    const ctas = await page.locator('section[aria-labelledby="hero-title"]').getByRole('link', { name: 'Voir mes projets' }).or(page.getByRole('button', { name: 'Télécharger mon CV' })).evaluateAll(els => els.map(e => e.getBoundingClientRect().height));

    const ok = layout.overflowX <= 0 && !layout.clipped.length && !covering.length
      && Math.abs(geo.box - geo.natural) < 0.02 && geo.fit === 'cover'
      && cards.map(c => c.href).join() === '/cv-generator,/projects,/ai-lab,/skills' && cards.every(c => c.h >= 44)
      && ctas.length === 2 && ctas.every(h => h >= 44) && badges.length === 4;
    check(`${engine} ${width}px : mise en page`, ok,
      `débordement ${layout.overflowX}px, coupés [${layout.clipped.join(' | ')}], badges sur le visage [${covering.join(', ')}], photo ${geo.box.toFixed(3)} vs ${geo.natural.toFixed(3)} (${geo.fit}), cartes ${cards.length}, boutons ${ctas.map(Math.round).join('/')} px, image ${geo.src.split('/').pop()}`);
    const real = errors.filter(e => !/favicon/i.test(e));
    if (real.length) check(`${engine} ${width}px : console sans erreur`, false, real.slice(0, 3).join(' | '));
    if ([320, 390, 768, 1024, 1440, 1920].includes(width)) await shot(page, `p1-accueil-${engine}-${width}`);
    await context.close();
  }

  // Morphing réel du contour, photo jamais déformée
  {
    const { context, page } = await open(browser, '/', { width: 1440 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.op-clip img') ?? document.body).objectFit === 'cover', null, { timeout: 20_000 });
    const sample = () => page.evaluate(() => {
      const clip = document.querySelector('.op-clip');
      const im = clip.querySelector('img').getBoundingClientRect();
      return { radius: getComputedStyle(clip).borderRadius, ratio: im.width / im.height, transform: getComputedStyle(document.querySelector('.op-stage')).transform };
    });
    const a = await sample();
    await page.waitForTimeout(2500);
    const b = await sample();
    check(`${engine} : le contour se déforme (border-radius animé)`, a.radius !== b.radius, `${a.radius} → ${b.radius}`);
    check(`${engine} : flottement indépendant (transform du conteneur)`, a.transform !== b.transform || a.transform !== 'none', `${a.transform} → ${b.transform}`);
    check(`${engine} : photo jamais déformée pendant l’animation`, Math.abs(a.ratio - 1) < 0.01 && Math.abs(b.ratio - 1) < 0.01, `${a.ratio.toFixed(3)} / ${b.ratio.toFixed(3)}`);

    // Hors écran : animations suspendues
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => document.querySelector('.op-root')?.classList.contains('is-paused'), null, { timeout: 5000 }).catch(() => {});
    const paused = await page.evaluate(() => ({ cls: document.querySelector('.op-root').classList.contains('is-paused'), state: getComputedStyle(document.querySelector('.op-clip')).animationPlayState }));
    check(`${engine} : animations suspendues hors écran`, paused.cls && paused.state === 'paused', JSON.stringify(paused));

    // Bouton « retour en haut » visible seulement après défilement
    check(`${engine} : bouton « Revenir en haut » après défilement`, await page.getByRole('button', { name: 'Revenir en haut de la page' }).isVisible());
    await context.close();
  }

  // Mouvement réduit : composition statique
  {
    const { context, page } = await open(browser, '/', { width: 1366, reducedMotion: true });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.op-clip img') ?? document.body).objectFit === 'cover', null, { timeout: 20_000 });
    const s = await page.evaluate(() => ({
      anims: [...document.querySelectorAll('.op-stage, .op-shape, .op-glow, .op-badge')].map(e => getComputedStyle(e).animationName),
      radius: getComputedStyle(document.querySelector('.op-clip')).borderRadius,
      typed: document.querySelector('.hp-typed')?.textContent,
    }));
    await page.waitForTimeout(1500);
    const radius2 = await page.evaluate(() => getComputedStyle(document.querySelector('.op-clip')).borderRadius);
    check(`${engine} : prefers-reduced-motion → aucune animation, bulle statique irrégulière`,
      s.anims.every(n => n === 'none') && s.radius === radius2 && /43%/.test(s.radius), `${s.anims.join(',')} ; ${s.radius}`);
    check(`${engine} : prefers-reduced-motion → sous-titre statique`, /Full Stack · Data/.test(s.typed ?? ''), s.typed);
    await shot(page, `p1-accueil-${engine}-reduced-motion`);
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

