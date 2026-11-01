// Recette P4.D — page publique /cv : version active (Supabase de recette), aperçu multipage pdf.js,
// téléchargement du fichier exactement affiché, « Voir en grand » accessible, chargement et erreurs,
// remplacement réel de la version active (puis restauration de la version d'origine).
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { API, GATEWAY, ROOT, WIDTHS, check, layoutIssues, open, shot, tempAdmin, totp } from './harness.mjs';

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

async function activeVersion(anon) {
  const res = await fetch(`${GATEWAY}/rest/v1/rpc/cv_active`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: '{}' });
  return (await res.json())[0] ?? null;
}

/** PDF de recette d'une page, texte lisible (aucune donnée réelle) */
async function makePdf(label) {
  const { PDFDocument, StandardFonts } = await import(pathToFileURL(createRequire(path.join(ROOT, 'noop.js')).resolve('pdf-lib')).href);
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 60, y: 760, size: 22, font });
  page.drawText(`Version de test ${new Date().toISOString()}`, { x: 60, y: 730, size: 12, font });
  return Buffer.from(await doc.save());
}

async function readyPage(page) {
  await page.locator('img[alt="Page 1 du CV"]').first().waitFor({ timeout: 30_000 });
}

export async function cvpublic(browser, engine) {
  console.log(`\n▶ P4.D — Page publique /cv (${engine})`);
  const admin = await tempAdmin('cvpublic');
  const anon = admin.anon;
  const original = await activeVersion(anon);
  check(`${engine} : une version active existe en recette`, !!original, original?.id ?? 'aucune');

  try {
    // Affichage, multipage, téléchargement identique
    {
      const { context, page, errors } = await open(browser, '/cv', { width: 1440 });
      await readyPage(page);
      const pages = await page.locator('section[aria-label="Aperçu du CV"] img[alt^="Page "]').count();
      check(`${engine} : aperçu pdf.js de toutes les pages du PDF actif`, pages >= 1, `${pages} page(s)`);
      check(`${engine} : date de la version active affichée`, await page.getByText(/Version en ligne du \d/).isVisible());
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger le CV' }).click()]);
      const file = await download.path().then(p => import('node:fs').then(fs => fs.readFileSync(p)));
      check(`${engine} : téléchargement = version active affichée (empreinte SHA-256 identique)`, sha256(file) === original?.sha256 && download.suggestedFilename() === 'CV-Adjoumani.pdf', `${download.suggestedFilename()}`);
      // Voir en grand : dialogue accessible
      const viewBtn = page.getByRole('button', { name: 'Voir en grand' });
      await viewBtn.click();
      const dialog = page.getByRole('dialog', { name: /Curriculum Vitae/ });
      await dialog.locator('img[alt="Page 1 du CV"]').waitFor({ timeout: 20_000 });
      check(`${engine} : « Voir en grand » — dialogue nommé, pages rendues`, (await dialog.locator('img[alt^="Page "]').count()) === pages);
      await shot(page, `p4-cv-${engine}-grand`);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      check(`${engine} : Échap ferme, focus rendu à « Voir en grand »`, await viewBtn.evaluate(el => el === document.activeElement));
      check(`${engine} : aucune erreur JavaScript`, !errors.filter(e => !/favicon/i.test(e)).length, errors.slice(0, 2).join(' | '));
      await shot(page, `p4-cv-${engine}-1440`);
      await context.close();
    }

    // Toutes les largeurs : pas de débordement, pages à la largeur disponible
    for (const width of WIDTHS) {
      const { context, page } = await open(browser, '/cv', { width });
      await readyPage(page);
      const layout = await layoutIssues(page);
      const img = await page.locator('section[aria-label="Aperçu du CV"] img[alt="Page 1 du CV"]').boundingBox();
      check(`${engine} ${width}px : /cv sans débordement, page du CV dans l’écran`, layout.overflowX <= 0 && !layout.clipped.length && img.x >= 0 && img.x + img.width <= width + 1,
        `débordement ${layout.overflowX}px, coupés [${layout.clipped.join(' | ')}], page ${Math.round(img.width)} px`);
      if ([320, 390, 768].includes(width)) await shot(page, `p4-cv-${engine}-${width}`, { fullPage: false });
      await context.close();
    }

    // États : chargement, fichier indisponible puis « Réessayer », fichier non conforme, base indisponible
    {
      const { context, page } = await open(browser, '/cv', {
        width: 1366,
        beforeGoto: async p => p.route('**/storage/v1/object/public/portfolio-public-documents/**', async r => { await new Promise(x => setTimeout(x, 1500)); await r.abort(); }),
      });
      const loading = page.getByRole('status', { name: 'Chargement du CV' });
      await loading.waitFor({ timeout: 8000 }).catch(() => {});
      check(`${engine} : état de chargement annoncé`, await loading.isVisible());
      const alert = page.getByRole('alert').filter({ hasText: 'n’a pas pu être chargé' });
      await alert.waitFor({ timeout: 15_000 });
      check(`${engine} : fichier indisponible → message d’erreur, aucun ancien CV affiché`, (await page.locator('img[alt="Page 1 du CV"]').count()) === 0);
      await page.unroute('**/storage/v1/object/public/portfolio-public-documents/**');
      await alert.getByRole('button', { name: 'Réessayer' }).click();
      await readyPage(page);
      check(`${engine} : « Réessayer » → CV affiché`, await page.locator('img[alt="Page 1 du CV"]').first().isVisible());
      await context.close();
    }
    {
      const other = await makePdf('Autre fichier');
      const { context, page } = await open(browser, '/cv', {
        width: 1366,
        beforeGoto: p => p.route('**/storage/v1/object/public/portfolio-public-documents/**', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: other })),
      });
      await page.getByRole('alert').filter({ hasText: 'ne correspond pas à la version publiée' }).waitFor({ timeout: 15_000 });
      check(`${engine} : fichier différent de la version publiée → refusé (intégrité SHA-256)`, (await page.locator('img[alt="Page 1 du CV"]').count()) === 0);
      await context.close();
    }
    {
      const { context, page } = await open(browser, '/cv', { width: 1366, beforeGoto: p => p.route('**/rest/v1/rpc/cv_active', r => r.fulfill({ status: 500, json: { message: 'panne' } })) });
      await page.getByRole('alert').filter({ hasText: 'momentanément indisponible' }).waitFor({ timeout: 15_000 });
      const legacy = await page.locator('img[alt="Page 1 du CV"]').count();
      check(`${engine} : base indisponible → erreur, pas de retour silencieux à /cv.pdf`, legacy === 0);
      await context.close();
    }

    // Remplacement réel de la version active, puis retour à la version d'origine
    if (engine === 'chromium' && original) {
      const login = await fetch(`${GATEWAY}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: admin.password }) }).then(r => r.json());
      while (Math.floor(Date.now() / 30000) <= admin.lastCodeWindow) await new Promise(r => setTimeout(r, 1000));
      const user = await fetch(`${GATEWAY}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${login.access_token}` } }).then(r => r.json());
      const factorId = user.factors?.find(f => f.factor_type === 'totp')?.id;
      const challenge = await fetch(`${GATEWAY}/auth/v1/factors/${factorId}/challenge`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
      const aal2 = (await fetch(`${GATEWAY}/auth/v1/factors/${factorId}/verify`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge_id: challenge.id, code: totp(admin.secret) }) }).then(r => r.json())).access_token;
      await fetch(`${GATEWAY}/rest/v1/rpc/admin_session_begin`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${aal2}`, 'Content-Type': 'application/json' }, body: '{}' });

      const pdf = await makePdf('CV de recette - remplacement');
      const form = new FormData();
      form.append('expectedActive', original.id);
      form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'cv-recette.pdf');
      const published = await fetch(`${API}/api/admin/cv`, { method: 'POST', headers: { Authorization: `Bearer ${aal2}` }, body: form }).then(r => r.json());
      const replaced = published?.version;
      check('remplacement publié par l’API d’administration (session MFA ouverte)', replaced?.sha256 === sha256(pdf), JSON.stringify(published).slice(0, 120));
      try {
        const { context, page } = await open(browser, '/cv', { width: 1366 });
        await readyPage(page);
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger le CV' }).click()]);
        const file = await download.path().then(p => import('node:fs').then(fs => fs.readFileSync(p)));
        const pages = await page.locator('section[aria-label="Aperçu du CV"] img[alt^="Page "]').count();
        check('après remplacement : nouvelle version affichée et téléchargée (jamais l’ancienne)', sha256(file) === sha256(pdf) && pages === 1, `${pages} page(s)`);
        await shot(page, 'p4-cv-apres-remplacement');
        await context.close();
      } finally {
        const restored = await fetch(`${API}/api/admin/cv/${original.id}/restore`, { method: 'POST', headers: { Authorization: `Bearer ${aal2}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedActive: replaced?.id ?? null }) }).then(r => r.json());
        check('version d’origine restaurée (recette laissée en l’état)', restored?.version?.id === original.id && (await activeVersion(anon))?.id === original.id);
      }
    }
  } finally {
    await admin.remove().catch(() => {});
  }
}
