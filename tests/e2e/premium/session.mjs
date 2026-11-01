// Recette P2 — session administrateur : verrouillage après 10 minutes d'inactivité (horloge simulée
// de Playwright dans le navigateur, état réel de la base de recette et de l'API), deux onglets,
// brouillon, déconnexion, mise en page du dashboard et du centre IA.
import { API, GATEWAY, WEB, accessToken, check, layoutIssues, loginUi, neutralize, shot, sql, tempAdmin } from './harness.mjs';

export async function session(browser, engine) {
  console.log(`\n▶ P2 — Session administrateur, verrouillage d'inactivité (${engine})`);
  const admin = await tempAdmin('session');
  const sessionRow = () => sql(`select coalesce(end_reason, 'ouverte') || '|' || extract(epoch from now() - last_activity_at)::int from public.admin_session_activity where user_id = '${admin.id}' order by started_at desc limit 1;`);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await neutralize(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    await page.goto(`${WEB}/admin`);
    await page.getByLabel('E-mail').waitFor({ timeout: 20_000 });
    check(`${engine} : connexion — champs nommés, verrouillage annoncé`, await page.getByText('verrouillage automatique après').isVisible());
    await shot(page, `p2-connexion-${engine}`);
    await loginUi(page, admin);
    await page.getByRole('heading', { name: 'Dashboard Admin' }).waitFor({ timeout: 20_000 });
    const indicator = page.locator('p', { hasText: 'Session MFA' });
    check(`${engine} : session ouverte côté serveur après la MFA, indicateur affiché`,
      (await indicator.isVisible()) && /serveur/.test(await indicator.innerText()) && sessionRow().startsWith('ouverte'), sessionRow());

    check(`${engine} : onglets ARIA (6), un seul sélectionné`,
      (await page.getByRole('tab').count()) === 6 && (await page.locator('[role="tab"][aria-selected="true"]').count()) === 1);
    await page.getByRole('tab', { name: /Projets/ }).focus();
    await page.keyboard.press('ArrowRight');
    check(`${engine} : flèche droite → onglet suivant sélectionné`, (await page.getByRole('tab', { name: /Compétences/ }).getAttribute('aria-selected')) === 'true');
    await page.getByRole('tab', { name: /Projets/ }).click();
    await shot(page, `p2-dashboard-${engine}-1440`);

    // Second onglet du même navigateur
    const page2 = await context.newPage();
    await page2.goto(`${WEB}/admin`);
    await page2.getByRole('heading', { name: 'Dashboard Admin' }).waitFor({ timeout: 20_000 });

    // Formulaire en cours : doit être conservé en brouillon au verrouillage
    await page.bringToFront();
    await page.getByRole('button', { name: /Nouveau Projet/ }).click();
    // Saisie réelle, touche par touche : chaque frappe est une interaction
    await page.getByPlaceholder('Nom du projet').pressSequentially('Brouillon e2e conservé')
    const tokenBefore = await accessToken(page);

    // Dernière interaction maintenant, puis 8 min 55 s sans interaction et événements simulés : sans effet
    await page.getByRole('heading', { name: 'Dashboard Admin' }).click();
    await page.clock.fastForward('08:55');
    const warning = page.getByTestId('admin-idle-warning');
    check(`${engine} : 8 min 55 s → aucun avertissement`, !(await warning.isVisible()));
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      window.dispatchEvent(new PointerEvent('pointerdown'));
      window.dispatchEvent(new WheelEvent('wheel'));
    });
    await page.clock.fastForward('00:07');
    await warning.waitFor({ timeout: 5000 }).catch(() => {});
    check(`${engine} : 9 min → avertissement discret, événements simulés ignorés`, await warning.isVisible(), (await warning.innerText().catch(() => '')).split('\n')[0]);
    check(`${engine} : avertissement aussi dans l’autre onglet`, await page2.getByTestId('admin-idle-warning').isVisible());
    check(`${engine} : l’avertissement ne vole pas le focus`, await page.evaluate(() => !document.activeElement?.closest('[data-testid="admin-idle-warning"]')));
    await shot(page, `p2-avertissement-${engine}`);

    // Prolongation explicite : transmise au serveur
    // Horloge simulée : WebKit fige requestAnimationFrame, d'où le clic sans attente de stabilité
    // (clic souris réel malgré tout : événement isTrusted)
    await warning.getByRole('button', { name: 'Rester connecté' }).click({ force: true });
    await page.waitForTimeout(1500);
    check(`${engine} : « Rester connecté » → avertissement retiré`, !(await warning.isVisible()));
    check(`${engine} : prolongation enregistrée par le serveur`, /^ouverte\|[0-9]$/.test(sessionRow()), sessionRow());

    // 10 minutes sans interaction : verrouillage dans les deux onglets
    await page.clock.fastForward('10:01');
    await page.getByLabel('E-mail').waitFor({ timeout: 15_000 });
    await page2.getByLabel('E-mail').waitFor({ timeout: 15_000 });
    const notice = await page.getByRole('status').filter({ hasText: 'Session verrouillée après 10 minutes' }).count();
    check(`${engine} : 10 min → administration verrouillée, connexion avec message`, notice > 0 && new URL(page.url()).pathname === '/admin');
    check(`${engine} : verrouillage propagé à l’autre onglet`, await page2.getByLabel('E-mail').isVisible());
    check(`${engine} : plus aucun contenu d’administration à l’écran`, !(await page.getByRole('heading', { name: 'Dashboard Admin' }).count()));
    check(`${engine} : jetons retirés du navigateur`, (await accessToken(page)) === null);
    check(`${engine} : session close côté serveur (idle_timeout)`, sessionRow().startsWith('idle_timeout'), sessionRow());
    await shot(page, `p2-verrouille-${engine}`);

    // L'ancien jeton, encore valide, est refusé partout
    const api = await fetch(`${API}/api/admin/ai/overview`, { headers: { Authorization: `Bearer ${tokenBefore}` } });
    const apiBody = await api.json().catch(() => null);
    const visits = await fetch(`${GATEWAY}/rest/v1/visits?select=id`, { headers: { apikey: admin.anon, Authorization: `Bearer ${tokenBefore}` } }).then(r => r.json()).catch(() => null);
    check(`${engine} : ancien jeton refusé par l’API (401 ADMIN_SESSION_EXPIRED)`, api.status === 401 && apiBody?.code === 'ADMIN_SESSION_EXPIRED', `HTTP ${api.status} ${apiBody?.code ?? ''}`);
    check(`${engine} : ancien jeton sans accès aux données d’administration (RLS)`, Array.isArray(visits) && visits.length === 0, JSON.stringify(visits).slice(0, 80));

    // Reconnexion : brouillon proposé puis restauré
    await page2.close();
    await loginUi(page, admin);
    await page.getByRole('heading', { name: 'Dashboard Admin' }).waitFor({ timeout: 20_000 });
    const draft = page.getByRole('status').filter({ hasText: 'Brouillon e2e conservé' });
    check(`${engine} : brouillon non enregistré proposé à la reconnexion`, await draft.isVisible());
    await draft.getByRole('button', { name: 'Restaurer' }).click({ force: true });
    check(`${engine} : brouillon restauré dans le formulaire`, (await page.getByPlaceholder('Nom du projet').inputValue()) === 'Brouillon e2e conservé');

    // Déconnexion volontaire
    const tokenSecond = await accessToken(page);
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Déconnexion' }).click({ force: true });
    await page.getByLabel('E-mail').waitFor({ timeout: 15_000 });
    const afterLogout = await fetch(`${API}/api/admin/ai/overview`, { headers: { Authorization: `Bearer ${tokenSecond}` } });
    check(`${engine} : déconnexion → session close (logout), jeton refusé`, sessionRow().startsWith('logout') && afterLogout.status === 401, `${sessionRow()} HTTP ${afterLogout.status}`);
    check(`${engine} : aucune erreur JavaScript`, !errors.length, errors.slice(0, 2).join(' | '));
    await context.close();

    // Mise en page du dashboard et du centre IA : mobile et tablette
    for (const width of [390, 768]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      await neutralize(ctx);
      const p = await ctx.newPage();
      await p.goto(`${WEB}/admin`);
      await p.getByLabel('E-mail').waitFor({ timeout: 20_000 });
      await loginUi(p, admin);
      await p.getByRole('heading', { name: 'Dashboard Admin' }).waitFor({ timeout: 20_000 });
      const layout = await layoutIssues(p);
      const tabs = await p.getByRole('tablist').evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
      check(`${engine} ${width}px : dashboard sans débordement de page`, layout.overflowX <= 0 && !layout.clipped.length,
        `débordement ${layout.overflowX}px, coupés [${layout.clipped.join(' | ')}] ; onglets ${tabs.sw}/${tabs.cw} (${tabs.overflowX})`);
      await shot(p, `p2-dashboard-${engine}-${width}`, { fullPage: true });
      await p.getByRole('tab', { name: /Intelligence artificielle/ }).click();
      await p.getByRole('button', { name: /Assistants et affectations/ }).click();
      const filter = p.getByRole('group', { name: 'Filtrer les fonctionnalités par état' });
      await filter.waitFor({ timeout: 15_000 });
      const actives = await filter.getByRole('button', { name: /Actives/ }).innerText();
      await filter.getByRole('button', { name: /Inactives/ }).click();
      const shown = await p.locator('section.border-l-4').count();
      check(`${engine} ${width}px : centre IA — états actif/inactif résumés et filtrables`, /\d/.test(actives), `${actives.replace(/\s+/g, ' ')} ; ${shown} carte(s) inactive(s) affichée(s)`);
      const l2 = await layoutIssues(p);
      check(`${engine} ${width}px : centre IA sans débordement`, l2.overflowX <= 0, `débordement ${l2.overflowX}px`);
      await shot(p, `p2-centre-ia-${engine}-${width}`);
      await ctx.close();
    }
  } finally {
    await admin.remove().catch(() => {});
    check(`${engine} : compte temporaire supprimé (sessions comprises)`,
      sql(`select count(*) from public.admin_users where user_id = '${admin.id}';`) === '0'
      && sql(`select count(*) from public.admin_session_activity where user_id = '${admin.id}';`) === '0');
  }
}
