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
}

// Pour les rapports : URL de la page testée
export const CLONE_URL = `${WEB}/`;
