// Recette P5 — non-régression de l'ensemble du portfolio : toutes les routes (Chromium et WebKit),
// erreurs JavaScript, débordements, formulaire de contact (envoi intercepté), aucune requête
// d'administration pour un visiteur, accessibilité (axe-core, WCAG 2.2 AA) sur les zones modifiées,
// CSP de vercel.json appliquée en mode bloquant.
//   AXE_CORE_PATH=<chemin de axe.min.js> (facultatif : sans lui, contrôles d'accessibilité ignorés)
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN, ROOT, WEB, WIDTHS, check, layoutIssues, neutralize, open, redact, shot } from './harness.mjs';
import { seedGenerator } from './cvFixture.mjs';

/** Routes et repère attendu (texte présent une fois la page rendue) */
const ROUTES = [
  ['/', /(Bonjour|Bon après-midi|Bonsoir|Bonne nuit), je suis/], ['/about', /./], ['/projects', /./], ['/skills', /./], ['/cv', /Curriculum Vitae/],
  ['/ai-lab', /./], ['/contact', /./], ['/blog', /./], ['/tools', /./], ['/workspace', /./], ['/tools/pomodoro', /./],
  ['/tools/snippets', /./], ['/tools/novamind', /./], ['/adjoumani-whiteboard', /./], ['/playground', /./],
  ['/cv-generator', /CV Generator Pro/], ['/latex-cv-editor', /./], ['/sitemap', /./], ['/terms', /./], ['/privacy', /./],
  ['/file-converter', /./], [ADMIN, /Administration/], [`${ADMIN}/knowledge`, /Administration/], [`${ADMIN}/blog`, /./],
  ['/page-qui-n-existe-pas', /./],
];
const PUBLIC_MAIN = new Set(['/', '/about', '/projects', '/skills', '/cv', '/ai-lab', '/contact']);
/** Applications plein écran à canevas : elles gèrent leur propre défilement */
const CANVAS_APPS = new Set(['/tools/novamind', '/adjoumani-whiteboard', '/playground']);
/** Erreurs de chargement d'un tiers neutralisé ou attendues de la recette (pas des erreurs du code) */
// Messages du navigateur sans rapport avec le code : autofocus bloqué dans l'iframe tierce du playground,
// boucle ResizeObserver signalée par WebKit (bénigne, aucune notification perdue côté application)
const IGNORED = /favicon|Failed to load resource: the server responded with a status of 404|net::ERR_FAILED|ERR_CONNECTION_REFUSED|status of 401|status of 400|Blocked autofocusing on a .* in a cross-origin subframe|ResizeObserver loop completed with undelivered notifications/i;

export async function regression(browser, engine) {
  console.log(`\n▶ P5 — Non-régression du portfolio (${engine})`);
  for (const [route, marker] of ROUTES) {
    const widths = PUBLIC_MAIN.has(route) ? WIDTHS : [390, 768, 1440];
    const issues = [];
    for (const width of widths) {
      const { context, page, errors } = await open(browser, route, { width });
      const adminCalls = [];
      page.on('request', r => { if (/rpc\/admin_session|\/api\/admin\//.test(r.url())) adminCalls.push(r.url()); });
      await page.waitForLoadState('load');
      await page.waitForTimeout(route === '/latex-cv-editor' || route === '/tools/novamind' ? 2500 : 1200);
      const text = await page.evaluate(() => document.body.innerText);
      const layout = await layoutIssues(page);
      const real = errors.filter(e => !IGNORED.test(e));
      if (!marker.test(text) || text.trim().length < 20) issues.push(`${width}px : contenu absent`);
      if (layout.overflowX > 0 && !CANVAS_APPS.has(route)) issues.push(`${width}px : débordement ${layout.overflowX}px`);
      if (layout.clipped.length && !CANVAS_APPS.has(route)) issues.push(`${width}px : coupés [${layout.clipped.slice(0, 2).join(' | ')}]`);
      if (real.length) issues.push(`${width}px : ${real.slice(0, 2).join(' | ').slice(0, 220)}`);
      if (adminCalls.length) issues.push(`${width}px : requêtes d’administration pour un visiteur (${adminCalls.length})`);
      if (width === 390 || width === 1440) await shot(page, `p5-${engine}-${redact(route).replace(/\W+/g, '_') || 'accueil'}-${width}`);
      await context.close();
    }
    check(`${engine} ${route} : rendu, aucune erreur JS, aucun débordement (${widths.length} largeur(s))`, !issues.length, issues.join(' ; '));
  }

  // P7.3 — Anciennes adresses d'administration : page 404, aucun formulaire de connexion, aucune
  // redirection, aucune requête d'administration ; nouvelle adresse : connexion, hors indexation
  for (const route of ['/admin', '/admin/knowledge', '/blog-admin', '/admin/', `/${'x'.repeat(32)}`]) {
    const { context, page } = await open(browser, route, { width: 1366 });
    const adminCalls = [];
    page.on('request', r => { if (/rpc\/admin_session|\/api\/admin\/|auth\/v1\/token/.test(r.url())) adminCalls.push(r.url()); });
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({
      text: document.body.innerText,
      forms: document.querySelectorAll('input[type="password"], input[type="email"], #admin-totp-code').length,
      robots: [...document.querySelectorAll('meta[name="robots"]')].map(m => m.content).join(','),
      path: location.pathname,
    }));
    check(`${engine} ${route} : page 404, aucun formulaire de connexion ni redirection, noindex`,
      /Page Introuvable/i.test(state.text) && state.forms === 0 && state.path === route && /noindex/.test(state.robots) && !adminCalls.length,
      `formulaires ${state.forms}, adresse ${state.path}, robots « ${state.robots} », requêtes admin ${adminCalls.length}`);
    await context.close();
  }
  for (const [route, marker] of [[ADMIN, /Administration/], [`${ADMIN}/knowledge`, /Administration/], [`${ADMIN}/blog`, /./]]) {
    const { context, page } = await open(browser, route, { width: 1366 });
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({
      text: document.body.innerText,
      login: document.querySelectorAll('input[type="password"]').length,
      robots: [...document.querySelectorAll('meta[name="robots"]')].map(m => m.content).join(','),
      referrer: document.querySelector('meta[name="referrer"]')?.getAttribute('content') ?? '',
      ga: Object.keys(window).filter(k => k.startsWith('ga-disable-')).map(k => window[k]),
    }));
    check(`${engine} ${route} : connexion affichée, noindex, sans Referer, mesure d’audience coupée`,
      marker.test(state.text) && state.login === 1 && /noindex/.test(state.robots) && state.referrer === 'no-referrer' && state.ga.length > 0 && state.ga.every(Boolean),
      `connexion ${state.login}, robots « ${state.robots} », referrer « ${state.referrer} », ga-disable ${JSON.stringify(state.ga)}`);
    await context.close();
  }
  {
    const { context, page } = await open(browser, '/', { width: 1366 });
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
      robots: document.querySelectorAll('meta[name="robots"]').length,
      ga: Object.keys(window).filter(k => k.startsWith('ga-disable-')).length,
      title: document.title,
    }));
    check(`${engine} / : indexable, mesure d’audience active, titre SEO du propriétaire`,
      state.robots === 0 && state.ga === 0 && state.title.startsWith('Adjoumani Koffi Wilfried'), JSON.stringify(state));
    await context.close();
  }

  // Formulaire de contact : envoi intercepté (aucune écriture, même en recette)
  {
    let sent = null;
    const { context, page } = await open(browser, '/contact', {
      width: 1366,
      beforeGoto: p => p.route('**/rest/v1/contacts**', r => { sent = JSON.parse(r.request().postData() ?? 'null'); return r.fulfill({ status: 201, body: '' }); }),
    });
    await page.getByPlaceholder('Votre nom').fill('Visiteur de recette');
    await page.getByPlaceholder('votre.email@exemple.com').fill('visiteur@example.test');
    await page.getByPlaceholder('Sujet de votre message').fill('Test');
    await page.getByPlaceholder('Votre message...').fill('Message de recette, aucun envoi réel.');
    await page.locator('form').getByRole('button').last().click();
    await page.waitForTimeout(1500);
    const payload = Array.isArray(sent) ? sent[0] : sent;
    check(`${engine} : formulaire de contact — envoi construit (intercepté, aucune écriture)`, payload?.email === 'visiteur@example.test', JSON.stringify(payload)?.slice(0, 100));
    await context.close();
  }

  // Accessibilité (axe-core) sur les zones créées ou modifiées
  const axePath = process.env.AXE_CORE_PATH;
  if (axePath && fs.existsSync(axePath)) {
    const axeSource = fs.readFileSync(axePath, 'utf8');
    const targets = [
      ['/', 'main, section[aria-labelledby="hero-title"], nav[aria-label="Accès rapides"]', null],
      ['/cv', 'section[aria-labelledby="cv-title"], section[aria-label="Aperçu du CV"]', null],
      ['/cv-generator', '.gp-root', 'generator'],
      [ADMIN, 'form', null],
    ];
    for (const [route, include, mode] of targets) {
      for (const width of [390, 1366]) {
        const { context, page } = await open(browser, route, { width, beforeGoto: mode === 'generator' ? (_p, ctx) => seedGenerator(ctx) : undefined });
        await page.waitForTimeout(2500);
        await page.addScriptTag({ content: axeSource });
        const res = await page.evaluate(async sel => {
          // Page entière (navigation, pied de page, assistant compris) ; sel : zones modifiées, gardées pour le rapport
          void sel;
          const r = await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
          });
          return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, target: v.nodes[0]?.target?.join(' ') }));
        }, include);
        const serious = res.filter(v => v.impact === 'critical' || v.impact === 'serious');
        check(`${engine} ${width}px ${route} : axe WCAG 2.2 AA, page entière — aucune violation critique ou grave`, !serious.length,
          serious.map(v => `${v.id}×${v.n} (${v.target})`).join(' | ') || `${res.length} mineure(s)${res.length ? ` : ${res.map(v => v.id).join(', ')}` : ''}`);
        await context.close();
      }
    }
  } else {
    console.log('ℹ accessibilité axe ignorée (AXE_CORE_PATH absent)');
  }

  // CSP de vercel.json appliquée en mode bloquant (hôtes de production remplacés par ceux de la recette)
  {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const csp = vercel.headers[0].headers.find(h => /Content-Security-Policy/.test(h.key)).value
      .replace("connect-src 'self'", "connect-src 'self' http://localhost:58521 http://localhost:5000 ws://localhost:5173");
    for (const [route, setup] of [['/', null], ['/cv', null], ['/cv-generator', 'generator'], [ADMIN, null], ['/contact', null], ['/latex-cv-editor', null]]) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      await neutralize(context);
      if (setup === 'generator') await seedGenerator(context);
      await context.route(`${WEB}${route}`, async r => {
        const res = await r.fetch();
        return r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } });
      });
      const page = await context.newPage();
      const violations = [];
      page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 160)); });
      await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`)));
      await page.goto(`${WEB}${route}`);
      await page.waitForTimeout(route === '/cv' || route === '/latex-cv-editor' ? 4000 : 2500);
      const unique = [...new Set(violations)];
      check(`${engine} ${route} : CSP de production en mode bloquant — aucune violation`, !unique.length, unique.slice(0, 3).join(' | '));
      await context.close();
    }
  }
}
