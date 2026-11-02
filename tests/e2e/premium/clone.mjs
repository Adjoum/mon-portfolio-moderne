// Recette P3 — Clone IA « Adjoumani AI » : fermeture par la croix, Échap, focus, toucher, mobile,
// historique conservé. Réponses SIMULÉES par interception réseau : aucun appel au modèle, aucun coût.
import { WEB, check, open, shot } from './harness.mjs';

const LAUNCHER = "Ouvrir l'assistant Adjoumani AI";
const CLOSE = "Fermer l'assistant";

/** Réponses du serveur simulées ; mode : 'ok' | 'slow' | 'error' */
async function mockChat(page, state) {
  await page.route('**/api/agent/chat', async route => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    state.calls.push(body);
    if (state.mode === 'error') return route.abort('connectionrefused');
    if (state.mode === 'slow') await new Promise(r => setTimeout(r, 2500));
    return route.fulfill({ json: { reply: `Réponse simulée n°${state.calls.length}` } });
  });
}

const dialog = page => page.getByRole('dialog', { name: /Adjoumani AI/ });
const focusedLabel = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));

export async function clone(browser, engine) {
  console.log(`\n▶ P3 — Clone IA : bouton de fermeture (${engine})`);

  for (const [width, label] of [[1440, 'desktop'], [768, 'tablette tactile'], [390, 'mobile']]) {
    const state = { mode: 'ok', calls: [] };
    const { context, page, errors } = await open(browser, '/', { width, mobile: width < 1024, beforeGoto: p => mockChat(p, state) });
    const launcher = page.getByRole('button', { name: LAUNCHER });
    await launcher.waitFor({ timeout: 20_000 });
    const touch = width < 1024;
    const press = loc => (touch ? loc.tap() : loc.click());

    // Ouvrir → fermer → rouvrir
    await press(launcher);
    await dialog(page).waitFor();
    await page.waitForTimeout(400);
    check(`${engine} ${label} : ouverture, champ de saisie focalisé`, (await focusedLabel(page)) === "Votre question pour l'assistant");
    const closeBtn = page.getByRole('button', { name: CLOSE });
    const box = await closeBtn.boundingBox();
    check(`${engine} ${label} : croix nommée « ${CLOSE} », cible ≥ 44 px`, !!box && box.width >= 44 && box.height >= 44, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : '');
    await press(closeBtn);
    await dialog(page).waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    const closed = !(await dialog(page).count());
    await page.waitForTimeout(300);
    check(`${engine} ${label} : ${touch ? 'toucher' : 'clic'} sur la croix → fenêtre fermée immédiatement`, closed);
    check(`${engine} ${label} : bulle flottante visible et focalisée après fermeture`, (await launcher.isVisible()) && (await focusedLabel(page)) === LAUNCHER, await focusedLabel(page));
    await press(launcher);
    await dialog(page).waitFor();
    check(`${engine} ${label} : réouverture`, await dialog(page).isVisible());

    // Après un échange : l'historique est conservé
    await page.getByLabel("Votre question pour l'assistant").fill('Bonjour, quelles sont tes compétences ?');
    await page.keyboard.press('Enter');
    await dialog(page).getByText('Réponse simulée n°1').waitFor();
    await press(page.getByRole('button', { name: CLOSE }));
    await dialog(page).waitFor({ state: 'detached' });
    await press(launcher);
    const history = await dialog(page).innerText();
    check(`${engine} ${label} : fermer après un échange → historique retrouvé à la réouverture`, history.includes('Bonjour, quelles sont tes compétences ?') && history.includes('Réponse simulée n°1'));
    check(`${engine} ${label} : requête envoyée inchangée (message + historique)`, state.calls[0]?.message === 'Bonjour, quelles sont tes compétences ?' && Array.isArray(state.calls[0]?.history));

    // Fermer pendant le chargement d'une réponse : la réponse est conservée
    state.mode = 'slow';
    await page.getByLabel("Votre question pour l'assistant").fill('Parle-moi de tes projets');
    await page.keyboard.press('Enter');
    await dialog(page).getByRole('status', { name: 'Réponse en cours de rédaction' }).waitFor();
    await press(page.getByRole('button', { name: CLOSE }));
    const closedWhileLoading = !(await dialog(page).count()) || (await dialog(page).waitFor({ state: 'detached', timeout: 2000 }).then(() => true).catch(() => false));
    check(`${engine} ${label} : fermeture pendant le chargement d’une réponse`, closedWhileLoading);
    await page.waitForTimeout(3000);
    await press(launcher);
    check(`${engine} ${label} : réponse arrivée pendant la fermeture affichée à la réouverture`, (await dialog(page).getByText('Réponse simulée n°2').count()) === 1);

    // Après une erreur réseau
    state.mode = 'error';
    await page.getByLabel("Votre question pour l'assistant").fill('Comment te contacter ?');
    await page.keyboard.press('Enter');
    await dialog(page).getByText('Connexion impossible').waitFor();
    await press(page.getByRole('button', { name: CLOSE }));
    await dialog(page).waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    check(`${engine} ${label} : fermeture après une erreur réseau`, !(await dialog(page).count()));

    // Clavier : Entrée ouvre, Échap ferme, focus rendu à la bulle
    await launcher.focus();
    await page.keyboard.press('Enter');
    await dialog(page).waitFor();
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    check(`${engine} ${label} : Échap ferme la fenêtre, focus rendu à la bulle`, !(await dialog(page).count()) && (await focusedLabel(page)) === LAUNCHER);

    if (width === 1440) {
      // Le déplacement par l'en-tête fonctionne toujours (desktop)
      await launcher.click();
      await dialog(page).waitFor();
      await page.waitForTimeout(900);   // fin de l'animation d'ouverture (échelle 0,8 → 1)
      const before = await dialog(page).boundingBox();
      const header = await page.locator('.ai-chat-name').boundingBox();
      await page.mouse.move(header.x + 5, header.y + 5);
      await page.mouse.down();
      await page.mouse.move(header.x - 195, header.y - 95, { steps: 8 });
      await page.mouse.up();
      const after = await dialog(page).boundingBox();
      check(`${engine} : déplacement de la fenêtre par l’en-tête préservé`, Math.abs(after.x - before.x - -200) < 3 && Math.abs(after.y - before.y - -100) < 3, `${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)}`);
      await page.getByRole('button', { name: CLOSE }).click();
      await dialog(page).waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
      check(`${engine} : croix opérante après un déplacement`, !(await dialog(page).count()));

      // Historique conservé en changeant de page
      await page.getByRole('link', { name: 'CV', exact: true }).first().click();
      await page.waitForURL('**/cv');
      await page.getByRole('button', { name: LAUNCHER }).click();
      check(`${engine} : historique conservé après navigation vers /cv`, (await dialog(page).getByText('Réponse simulée n°1').count()) === 1);
      await page.keyboard.press('Escape');

      // Vidéo légère chargée après l'affichage (au plus ~2,5 s après le chargement sans requestIdleCallback)
      await page.locator('.ai-agent-btn video').waitFor({ timeout: 8000 }).catch(() => {});
      const media = await page.evaluate(() => {
        const v = document.querySelector('.ai-agent-btn video');
        return v ? v.currentSrc || v.src : document.querySelector('.ai-agent-btn img')?.src;
      });
      check(`${engine} : avatar — vidéo légère (200 px, 40 Ko) chargée après la page`, /ai-avatar-200\.mp4$/.test(media ?? ''), media?.split('/').pop());
    }
    if (width === 390) await shot(page, `p3-clone-${engine}-mobile`);
    const real = errors.filter(e => !/ERR_CONNECTION_REFUSED|Failed to load resource|favicon/i.test(e));
    check(`${engine} ${label} : aucune erreur dans la console`, !real.length, real.slice(0, 2).join(' | '));
    await context.close();
  }

  // Mouvement réduit : image fixe, aucune vidéo
  const { context, page } = await open(browser, '/', { width: 1366, reducedMotion: true });
  await page.getByRole('button', { name: LAUNCHER }).waitFor();
  await page.waitForTimeout(5000);
  check(`${engine} : mouvement réduit → avatar fixe, aucune vidéo chargée`, (await page.locator('.ai-agent-btn video').count()) === 0 && (await page.locator('.ai-agent-btn img').count()) === 1);
  await page.getByRole('button', { name: LAUNCHER }).click();
  await dialog(page).waitFor();
  await shot(page, `p3-clone-${engine}-desktop`);
  await context.close();

  await markdown(browser, engine);
}

// P7.2 — Réponses Markdown : mise en forme lisible, contenu malveillant inerte, aucun débordement
const MARKDOWN_REPLY = [
  '### Compétences principales', '', 'Adjoumani maîtrise **React**, *TypeScript* et l’IA :', '',
  '1. Front-end : React, Tailwind', '2. Back-end : Node.js, Supabase', '',
  `| Projet | Stack | Statut | ${Array.from({ length: 6 }, (_, i) => `Colonne ${i}`).join(' | ')} |`,
  `|:--|:--|--:|${' --- |'.repeat(6)}`,
  ...Array.from({ length: 30 }, (_, r) => `| Projet ${r} | React, Canvas, WebSocket | En ligne | ${Array.from({ length: 6 }, () => 'valeur').join(' | ')} |`),
  '', '```ts', `const portfolio = await fetch('/api/projects').then(r => r.json()) // ${'commentaire '.repeat(12)}`, '```', '',
  '> Disponible pour des projets.', '',
  'Voir [ses projets](/projects) ou [GitHub](https://github.com/Adjoum).', '',
  '<script>window.__xss = 1</script> <img src=x onerror="window.__xss=2"> <svg onload="window.__xss=3"></svg>',
  '[piège](javascript:window.__xss=4) [piège 2](JaVaScRiPt:window.__xss=5) ![pixel](https://tracker.example/p.png)',
  '<a href="javascript:window.__xss=6">lien html</a> <iframe src="javascript:window.__xss=7"></iframe>', '',
  'Paragraphe final. '.repeat(200),
].join('\n');

async function markdown(browser, engine) {
  for (const [width, label] of [[1440, 'desktop'], [390, 'mobile']]) {
    const external = [];
    const { context, page, errors } = await open(browser, '/about', {
      width,
      beforeGoto: async p => {
        await p.route('**/api/agent/chat', r => r.fulfill({ json: { reply: MARKDOWN_REPLY } }));
        await p.route(/tracker\.example/, r => { external.push(r.request().url()); return r.fulfill({ status: 204, body: '' }); });
        p.on('dialog', d => { errors.push(`dialogue ouvert : ${d.message()}`); void d.dismiss(); });
      },
    });
    if (engine === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB });
    const press = loc => (width < 1024 ? loc.tap() : loc.click());
    await press(page.getByRole('button', { name: LAUNCHER }));
    await dialog(page).waitFor();
    await page.getByLabel("Votre question pour l'assistant").fill('Tes compétences ?');
    await page.keyboard.press('Enter');
    await dialog(page).locator('.ai-md table').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const pop = document.querySelector('.ai-chat-popup').getBoundingClientRect();
      const md = [...document.querySelectorAll('.ai-msg-rich .ai-md')].at(-1); // la réponse, pas l’accueil
      const outside = [...document.querySelectorAll('.ai-chat-popup *')]
        .filter(e => !e.closest('.ai-md-table, .ai-md pre'))
        .filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > pop.right + 1 || r.left < pop.left - 1); }).length;
      const table = document.querySelector('.ai-md-table');
      const pre = document.querySelector('.ai-md pre');
      return {
        xss: window.__xss ?? null,
        outside,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tableScrolls: table.scrollWidth > table.clientWidth && table.tabIndex === 0 && table.getAttribute('role') === 'region',
        preScrolls: pre.scrollWidth > pre.clientWidth,
        heading: md.querySelector('.ai-md-h')?.textContent,
        bold: md.querySelector('strong')?.textContent,
        rawMarkdown: /\*\*|###|\|:--/.test(md.innerText),
        dangerous: md.querySelectorAll('script, iframe, img, svg:not(.lucide), [onerror], [onload], a[href^="javascript" i]').length,
        internal: md.querySelector('a[href="/projects"]')?.getAttribute('target') ?? 'même onglet',
        externalRel: md.querySelector('a[href="https://github.com/Adjoum"]')?.getAttribute('rel'),
        textColor: getComputedStyle(md).color,
      };
    });
    check(`${engine} ${label} : Markdown mis en forme (titre, gras, liste, tableau, code, citation), plus aucun symbole brut`,
      state.heading === 'Compétences principales' && state.bold === 'React' && !state.rawMarkdown, JSON.stringify({ heading: state.heading, bold: state.bold, raw: state.rawMarkdown }));
    check(`${engine} ${label} : contenu malveillant inerte (script, onerror, svg, javascript:, iframe), aucune image distante chargée`,
      state.xss === null && state.dangerous === 0 && !external.length, `xss=${state.xss}, éléments dangereux ${state.dangerous}, requêtes externes ${external.length}`);
    check(`${engine} ${label} : aucun débordement de la fenêtre ; tableau et code défilent dans la bulle`,
      state.outside === 0 && state.pageOverflow <= 0 && state.tableScrolls && state.preScrolls, JSON.stringify({ outside: state.outside, page: state.pageOverflow, table: state.tableScrolls, pre: state.preScrolls }));
    check(`${engine} ${label} : liens — interne dans le site, externe en nouvel onglet sans transmission d’accès`,
      state.internal === 'même onglet' && state.externalRel === 'noopener noreferrer nofollow ugc', `${state.internal} / ${state.externalRel}`);

    // Bouton Copier : texte exact du bloc (presse-papiers lisible sous Chromium uniquement)
    const copy = dialog(page).getByRole('button', { name: 'Copier le code' });
    await copy.scrollIntoViewIfNeeded();
    await press(copy);
    await page.waitForTimeout(300);
    const copiedLabel = await dialog(page).locator('.ai-md-copy').first().getAttribute('aria-label');
    const clip = engine === 'chromium' ? await page.evaluate(() => navigator.clipboard.readText()).catch(() => null) : null;
    check(`${engine} ${label} : bouton Copier — confirmation annoncée${engine === 'chromium' ? ', texte copié exact' : ''}`,
      copiedLabel === 'Code copié' && (engine !== 'chromium' || clip?.startsWith("const portfolio = await fetch('/api/projects')")), `${copiedLabel} | ${clip?.slice(0, 40)}`);

    // Lien interne : navigation dans le site, conversation conservée, croix toujours opérante
    await press(dialog(page).getByRole('link', { name: 'ses projets' }));
    await page.waitForURL(/\/projects$/);
    await dialog(page).locator('.ai-md table').waitFor({ timeout: 5000 }).catch(() => {});
    const keptAfterNav = await dialog(page).locator('.ai-md table').count();
    await press(page.getByRole('button', { name: CLOSE }));
    await dialog(page).waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    check(`${engine} ${label} : lien interne suivi dans le site, conversation conservée, croix opérante`, keptAfterNav === 1 && !(await dialog(page).count()));
    await shot(page, `p7-markdown-${engine}-${width}`);
    const real = errors.filter(e => !/Failed to load resource|ERR_|status of 40/i.test(e));
    check(`${engine} ${label} : aucune erreur ni dialogue pendant le rendu Markdown`, !real.length, real.slice(0, 2).join(' | '));
    await context.close();
  }
}

// Pour les rapports : URL de la page testée
export const CLONE_URL = `${WEB}/`;
