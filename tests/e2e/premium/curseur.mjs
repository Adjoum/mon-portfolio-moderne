// Recette P7.4 — « Adaptive Liquid Presence » : présence lumineuse autour du curseur système.
import { ADMIN, check, open, shot } from './harness.mjs';

const presence = page => page.evaluate(() => {
  const el = document.querySelector('.lp-root');
  if (!el) return null;
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return {
    x: m.m41, y: m.m42,
    // Étirement : longueur du vecteur colonne x (rotation comprise)
    scaleX: Math.hypot(m.m11, m.m12), scaleY: Math.hypot(m.m21, m.m22),
    angle: Math.atan2(m.m12, m.m11),
    opacity: Number(getComputedStyle(el).opacity),
    classes: [...el.classList].filter(c => c.startsWith('is-')),
    moving: el.dataset.moving,
    pointer: getComputedStyle(el).pointerEvents,
    cursor: getComputedStyle(document.body).cursor,
  };
});

export async function curseur(browser, engine) {
  console.log(`\n▶ P7.4 — Présence du curseur (${engine})`);

  // Ordinateur : suivi, étirement, retour au repos, survol, clics traversants
  {
    const { context, page, errors } = await open(browser, '/', { width: 1366 });
    await page.getByRole('link', { name: 'Voir mes projets' }).waitFor();
    // Écouteurs posés par l'effet React (juste après la première peinture) : un seul mouvement
    // de souris envoyé avant serait perdu par le test, pas par un visiteur qui bouge en continu
    await page.waitForSelector('.lp-root[data-ready="true"]', { state: 'attached' });
    const initial = await presence(page);
    check(`${engine} : présence montée, invisible avant le premier mouvement, jamais cliquable`, !!initial && initial.classes.includes('is-hidden') && initial.pointer === 'none' && initial.cursor !== 'none', JSON.stringify(initial));

    await page.mouse.move(700, 120);
    await page.waitForTimeout(700);
    const rest = await presence(page);
    check(`${engine} : suit le curseur et se pose dessus`, Math.abs(rest.x - 700) < 2 && Math.abs(rest.y - 120) < 2 && rest.opacity > 0.9, `${rest.x.toFixed(1)}, ${rest.y.toFixed(1)} ; opacité ${rest.opacity}`);

    // Mouvement rapide horizontal : étirement dans le sens du mouvement. Son ampleur dépend de la
    // cadence d'affichage (WebKit logiciel : faible) ; la valeur exacte est couverte par presence.test.ts
    let maxStretch = 1, angleAtMax = 0, minAcross = 1;
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(700 - i * 50, 120);
      const p = await presence(page);
      if (p.scaleX > maxStretch) { maxStretch = p.scaleX; angleAtMax = p.angle; minAcross = p.scaleY; }
    }
    check(`${engine} : s’étire pendant un mouvement rapide, dans son sens`, maxStretch > 1.03 && minAcross < 0.99 && Math.abs(Math.abs(angleAtMax) - Math.PI) < 0.35, `×${maxStretch.toFixed(2)} / ×${minAcross.toFixed(2)}, angle ${angleAtMax.toFixed(2)} rad`);
    await page.waitForTimeout(900);
    const settled = await presence(page);
    check(`${engine} : retrouve une forme ronde à l’arrêt, calcul arrêté`, Math.abs(settled.scaleX - 1) < 0.01 && Math.abs(settled.scaleY - 1) < 0.01 && settled.moving === 'false', `×${settled.scaleX.toFixed(3)}, en mouvement : ${settled.moving}`);
    await page.waitForTimeout(1000);
    check(`${engine} : s’estompe au repos`, (await presence(page)).classes.includes('is-idle'));

    // Survol d'un élément interactif : réaction discrète, attraction vers son centre
    const link = page.getByRole('link', { name: 'Voir mes projets' });
    const box = await link.boundingBox();
    const px = box.x + 6, py = box.y + box.height / 2;
    await page.mouse.move(px, py, { steps: 4 });
    await page.waitForTimeout(800);
    const hover = await presence(page);
    check(`${engine} : survol d’un lien → halo discret, légère attraction vers son centre`,
      hover.classes.includes('is-hover') && hover.x > px + 2 && hover.x - px < box.width * 0.2, `${hover.classes.join(' ')} ; décalage ${(hover.x - px).toFixed(1)} px`);
    // Le clic atteint toujours l'élément sous le curseur
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.textContent?.trim(), [px, py]);
    await page.mouse.click(px, py);
    await page.waitForURL('**/projects', { timeout: 10_000 }).catch(() => {});
    check(`${engine} : le clic traverse la présence et atteint le lien`, hit?.startsWith('Voir mes projets') && page.url().endsWith('/projects'), `${hit} → ${page.url()}`);
    const real = errors.filter(e => !/favicon|Failed to load resource/i.test(e));
    check(`${engine} : aucune erreur`, !real.length, real.slice(0, 2).join(' | '));
    await context.close();
  }

  // Formulaires, sélection de texte, fenêtre de dialogue : la présence s'efface
  {
    const { context, page } = await open(browser, '/contact', { width: 1366 });
    const field = page.getByPlaceholder('Votre nom');
    await field.waitFor({ timeout: 15_000 });
    await page.waitForSelector('.lp-root[data-ready="true"]', { state: 'attached' });
    await page.waitForTimeout(1500); // fin de l'animation d'entrée du formulaire (le champ glisse)
    const box = await field.boundingBox();
    await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 5 });
    await page.waitForTimeout(500);
    const onField = await presence(page);
    await page.mouse.click(box.x + 20, box.y + box.height / 2);
    await page.keyboard.type('Saisie libre');
    const typed = await field.inputValue();
    check(`${engine} : effacée sur un champ de formulaire, saisie intacte`, onField.classes.includes('is-native') && onField.opacity === 0 && typed === 'Saisie libre', `${onField.classes.join(' ')} ; opacité ${onField.opacity} ; « ${typed} »`);

    const heading = page.locator('h1').first();
    const hb = await heading.boundingBox();
    await page.mouse.move(hb.x + 4, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width * 0.6, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const selecting = await presence(page);
    const selected = await page.evaluate(() => document.getSelection()?.toString().length ?? 0);
    check(`${engine} : sélection de texte possible, présence effacée pendant la sélection`, selected > 0 && selecting.classes.includes('is-selecting') && selecting.opacity === 0, `${selected} caractères ; ${selecting.classes.join(' ')}`);
    await page.evaluate(() => document.getSelection()?.removeAllRanges());

    await page.getByRole('button', { name: /Ouvrir l'assistant/ }).click();
    const dialog = page.getByRole('dialog', { name: /Adjoumani AI/ });
    await dialog.waitFor();
    const db = await dialog.boundingBox();
    await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 5 });
    await page.waitForTimeout(500);
    const inDialog = await presence(page);
    check(`${engine} : effacée dans une fenêtre de dialogue (Clone IA)`, inDialog.classes.includes('is-native') && inDialog.opacity === 0, inDialog.classes.join(' '));
    await shot(page, `p7-curseur-${engine}-contact`);
    await context.close();
  }

  // Tactile, mouvement réduit, éditeurs plein écran et administration : aucune présence
  for (const [label, route, opts] of [
    ['écran tactile sans pointeur fin', '/', { width: 390, mobile: true }],
    ['tablette tactile', '/', { width: 768, mobile: true }],
    ['mouvement réduit', '/', { width: 1366, reducedMotion: true }],
    ['studio LaTeX', '/latex-cv-editor', { width: 1366 }],
    ['générateur de CV', '/cv-generator', { width: 1366 }],
    ['administration', ADMIN, { width: 1366 }],
  ]) {
    const { context, page } = await open(browser, route, opts);
    await page.waitForTimeout(1500);
    await page.mouse.move(400, 300).catch(() => {});
    await page.waitForTimeout(300);
    check(`${engine} : ${label} → aucune présence`, (await page.locator('.lp-root').count()) === 0);
    await context.close();
  }
}
