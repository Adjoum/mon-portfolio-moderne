// Parcours navigateur du banc P0.CV (Edge sans interface), sur la pile Supabase locale réelle.
// Bundle compilé avec des URL locales ; tout hôte externe est bloqué par le navigateur.
// playwright-core n'est pas une dépendance du projet : PLAYWRIGHT_CORE_DIR désigne son dossier.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const WEB = 'http://127.0.0.1:5173';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.wasm': 'application/wasm' };

export async function runBrowserScenarios(ctx) {
  const { ROOT, GATEWAY, API, ANON_KEY, check, gatewayState, sha256, makePdf, totp, adminTotp, active, psql, stopApi, startApi, publicUrl } = ctx;
  const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR, 'noop.js'))('playwright-core');

  console.log('▶ Construction du bundle de test (URL locales uniquement)');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'p0cv-web-'));
  const build = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', dist, '--emptyOutDir'], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, VITE_API_URL: `${API}/api`, VITE_SUPABASE_URL: GATEWAY, VITE_SUPABASE_ANON_KEY: ANON_KEY },
  });
  if (build.status !== 0) throw new Error(`build : ${build.stdout.slice(-400)}`);

  // Un /cv.pdf statique différent, déployé dans le bundle, ne doit jamais prendre le dessus
  const STATIC_PDF = makePdf('ANCIEN CV STATIQUE DU DEPOT');
  fs.writeFileSync(path.join(dist, 'cv.pdf'), STATIC_PDF);

  const web = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(dist, url);
    const found = file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile();
    const served = found ? file : path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(served)] ?? 'application/octet-stream' });
    fs.createReadStream(served).pipe(res);
  });
  await new Promise(r => web.listen(5173, '127.0.0.1', r));

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const staticRequests = [];
  const diagnostics = [];
  let lastPage = null;
  const blocked = new Set();

  async function newVisitor(initScript) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/cv.pdf') staticRequests.push(url.href);
      if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
      blocked.add(url.hostname);
      return route.abort();
    });
    if (initScript) await context.addInitScript(initScript);
    const page = await context.newPage();
    lastPage = page;
    page.on('pageerror', e => diagnostics.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') diagnostics.push(`console: ${m.text().slice(0, 160)}`); });
    page.on('requestfailed', r => diagnostics.push(`échec: ${r.method()} ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
    page.on('response', r => { if (r.status() >= 400) diagnostics.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url().slice(0, 120)}`); });
    return page;
  }

  const cvFrameSrc = async page => {
    const open = page.getByRole('button', { name: 'Voir le CV en grand' });
    await open.waitFor({ timeout: 20000 });
    await open.click();
    const src = await page.locator('iframe[title="CV PDF"]').getAttribute('src');
    await page.keyboard.press('Escape');
    return src;
  };

  try {
    console.log('▶ Parcours visiteur');
    let current = await active();
    let page = await newVisitor();
    await page.goto(`${WEB}/cv`);
    const src = await cvFrameSrc(page);
    check('/cv affiche la version active depuis Supabase Storage', src === publicUrl(current.bucket, current.storage_path), src?.slice(-52));
    await page.reload();
    check('rechargement : même version', (await cvFrameSrc(page)) === src);
    await page.context().close();

    page = await newVisitor();
    await page.goto(`${WEB}/cv`);
    await page.getByRole('button', { name: /Télécharger le CV/ }).waitFor({ timeout: 20000 });
    const frame = await page.evaluate(async url => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
    }, publicUrl(current.bucket, current.storage_path));
    await page.waitForFunction(() => !document.querySelector('.animate-spin'), null, { timeout: 8000 }).catch(() => {});
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: /Télécharger le CV/ }).click()]);
    const downloaded = sha256(fs.readFileSync(await download.path()));
    check('aperçu et téléchargement : même document (SHA-256 identiques)', downloaded === current.sha256 && frame === current.sha256, download.suggestedFilename());
    await page.context().close();

    page = await newVisitor(() => localStorage.setItem('cvFile', 'data:application/pdf;base64,QU5DSUVOIENW'));
    await page.goto(`${WEB}/cv`);
    check('ancienne copie en localStorage sans aucun effet', (await cvFrameSrc(page)) === src);
    await page.context().close();
    check('le /cv.pdf statique du bundle n’a jamais été chargé', staticRequests.length === 0, `${staticRequests.length} requête(s)`);

    gatewayState.failRpc = true;
    page = await newVisitor();
    await page.goto(`${WEB}/cv`);
    await page.getByText('Le CV est momentanément indisponible').waitFor({ timeout: 20000 });
    check('panne de Supabase : message explicite, pas de retour silencieux à l’ancien CV', staticRequests.length === 0);
    gatewayState.failRpc = false;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    check('« Réessayer » rétablit la version active', (await cvFrameSrc(page)) === src);
    await page.context().close();

    console.log('▶ Parcours administrateur (connexion, MFA, remplacement, restauration)');
    const admin = await newVisitor();
    admin.on('dialog', d => d.accept());
    await admin.goto(`${WEB}/admin`);
    await admin.getByPlaceholder('Email').fill('admin@example.test', { timeout: 20000 });
    await admin.getByPlaceholder('Password').fill('Banc-Test-Admin-1!');
    await admin.getByRole('button', { name: 'Se connecter' }).click();
    await admin.locator('#admin-totp-code').waitFor({ timeout: 15000 });
    check('connexion par mot de passe seul : défi MFA exigé', !(await admin.getByText('Dashboard Admin').isVisible()));
    await admin.locator('#admin-totp-code').fill(totp(adminTotp));
    await admin.getByRole('button', { name: 'Valider' }).click();
    await admin.getByText('Dashboard Admin').waitFor({ timeout: 15000 });
    await admin.getByRole('button', { name: 'CV PDF' }).click();
    await admin.getByText('CV actuellement en ligne').waitFor({ timeout: 10000 });
    await admin.getByTestId('cv-active-date').waitFor({ timeout: 10000 });
    check('dashboard : CV actif et date de remplacement affichés', /Remplacé le/.test(await admin.getByTestId('cv-active-date').innerText()));

    const fileInput = admin.locator('input[type=file][accept*="application/pdf"]');
    const NEW_PDF = makePdf('CV importe depuis le dashboard');
    await fileInput.setInputFiles({ name: 'CV-nouveau.pdf', mimeType: 'application/pdf', buffer: NEW_PDF });
    await admin.getByText('Nouveau CV publié').waitFor({ timeout: 20000 });
    check('import depuis le dashboard : confirmation affichée', true);
    await admin.screenshot({ path: path.join(process.env.E2E_SHOTS ?? os.tmpdir(), 'admin-cv.png'), fullPage: true }).catch(() => {});
    check('historique des versions affiché', (await admin.getByRole('button', { name: 'Restaurer' }).count()) >= 2);

    const published = await active();
    check('version publiée active en base, empreinte correcte', published.sha256 === sha256(NEW_PDF));
    page = await newVisitor();
    await page.goto(`${WEB}/cv`);
    check('autre visiteur, autre session : nouveau CV immédiatement visible', (await cvFrameSrc(page)) === publicUrl(published.bucket, published.storage_path));
    await page.context().close();

    await fileInput.setInputFiles({ name: 'CV-nouveau.pdf', mimeType: 'application/pdf', buffer: NEW_PDF });
    await admin.getByText('déjà le CV actif').waitFor({ timeout: 15000 });
    await fileInput.setInputFiles({ name: 'faux.pdf', mimeType: 'application/pdf', buffer: Buffer.from('ceci n’est pas un PDF') });
    await admin.getByText('n’est pas un PDF').waitFor({ timeout: 15000 });
    check('fichier identique ou invalide : message clair, version active inchangée', (await active()).id === published.id);

    await admin.reload();
    await admin.getByRole('button', { name: 'CV PDF' }).click({ timeout: 20000 });
    await admin.getByText(/CV-nouveau\.pdf/).first().waitFor({ timeout: 10000 });
    check('rechargement du dashboard : session MFA conservée, version toujours active', (await active()).id === published.id);

    await admin.getByRole('button', { name: 'Restaurer' }).first().click();
    await admin.getByText('Version restaurée').waitFor({ timeout: 15000 });
    const afterRestore = await active();
    check('restauration depuis le dashboard', afterRestore.id !== published.id);
    await admin.context().close();

    console.log('▶ Redéploiement simulé');
    await stopApi();
    await new Promise(r => { web.close(r); web.closeAllConnections?.(); });
    const web2 = http.createServer(web.listeners('request')[0]);
    await new Promise(r => web2.listen(5173, '127.0.0.1', r));
    await startApi();
    page = await newVisitor();
    await page.goto(`${WEB}/cv`);
    check('nouveau déploiement + redémarrage du backend : même version active', (await cvFrameSrc(page)) === publicUrl(afterRestore.bucket, afterRestore.storage_path));
    await page.context().close();

    console.log('▶ Images de projets');
    const imageUrl = publicUrl('project-images', 'projects/demo.png');
    psql('supabase_admin', `insert into public.projects (title, description, imageurl, category, featured) values ('Projet avec image', 'Test', '${imageUrl}', 'web', true);`);
    page = await newVisitor();
    await page.goto(`${WEB}/projects`);
    await page.getByText('Projet avec image').first().waitFor({ timeout: 20000 });
    const img = page.locator('img[src*="project-images"]').first();
    await img.waitFor({ state: 'attached', timeout: 10000 });
    await page.waitForFunction(() => { const i = document.querySelector('img[src*="project-images"]'); return i?.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
    check('page Projets : image du bucket affichée après migration', true);
    await page.context().close();

    console.log(`  hôtes externes bloqués par le banc : ${[...blocked].join(', ') || 'aucun'}`);
    await new Promise(r => { web2.close(r); web2.closeAllConnections?.(); });
  } catch (err) {
    console.log('--- diagnostics navigateur ---');
    console.log(diagnostics.filter(d => !/googletagmanager|ipapi|fonts\./.test(d)).slice(-14).join('\n'));
    console.log('texte visible :', (await lastPage?.locator('body').innerText().catch(() => ''))?.replace(/\s+/g, ' ').slice(0, 300));
    await lastPage?.screenshot({ path: path.join(process.env.E2E_SHOTS ?? os.tmpdir(), 'echec.png') }).catch(() => {});
    throw err;
  } finally {
    await browser.close().catch(() => {});
    web.close();
    fs.rmSync(dist, { recursive: true, force: true });
  }
}
