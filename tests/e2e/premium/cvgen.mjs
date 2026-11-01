// Recette P4 — CV Generator : panneau Design enrichi réellement appliqué aux 8 modèles (aperçu et
// export), annuler / rétablir, réinitialisations, presets, galerie, mises en page desktop / mobile.
// Aucun appel IA : CV fictif injecté, vérification avant export simulée en échec (export direct).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { OUT, ROOT, WEB, check, layoutIssues, neutralize, shot } from './harness.mjs';
import { FIXTURE_CV, seedGenerator } from './cvFixture.mjs';

const TEMPLATES = [
  ['cascade', 'Cascade'], ['moderne', 'Moderne'], ['classique', 'Classique'], ['stanford', 'Stanford'],
  ['openai-dark', 'OpenAI Dark'], ['amazon-bold', 'Amazon Bold'], ['google-chip', 'Google Chip'], ['faang-minimal', "Jake's FAANG"],
];
const CAPS = {
  'cascade': { header: false, sidebar: true }, 'moderne': { header: true, sidebar: true }, 'classique': { header: true, sidebar: false },
  'stanford': { header: false, sidebar: false }, 'openai-dark': { header: false, sidebar: true }, 'amazon-bold': { header: true, sidebar: false },
  'google-chip': { header: true, sidebar: true }, 'faang-minimal': { header: false, sidebar: false },
};
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

/** Export : le HTML envoyé à l'impression est capturé (aucune boîte d'impression ouverte) */
const capturePrint = context => context.addInitScript(() => {
  if (window !== window.top) return;   // seulement la page, pas les iframes d'aperçu
  window.__printed = [];
  new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n.tagName === 'IFRAME' && n.getAttribute('sandbox') === 'allow-same-origin allow-modals') {
        window.__printed.push(n.srcdoc);
        n.addEventListener('load', () => { try { n.contentWindow.print = () => {}; } catch { /* rien */ } }, { capture: true });
      }
    }
  }).observe(document, { childList: true, subtree: true });
});

async function openGenerator(browser, { width = 1440, height = 900, template, design, mobile } = {}) {
  const isMobile = mobile ?? width < 768;
  const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch: width < 1024 });
  await neutralize(context);
  await context.route('**/api/ai/features', r => r.fulfill({ json: { features: [{ id: 'cv.generate', available: true }, { id: 'cv.review', available: true }] } }));
  await context.route('**/api/ai/run/**', r => r.fulfill({ status: 503, json: { code: 'AI_FEATURE_UNAVAILABLE', error: 'Vérification indisponible (recette)' } }));
  await seedGenerator(context, { template, design });
  await capturePrint(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${WEB}/cv-generator`);
  await page.locator('iframe[title^="Aperçu du CV"]').waitFor({ timeout: 20_000 });
  return { context, page, errors };
}

const preview = page => page.frameLocator('iframe[title^="Aperçu du CV"]');
async function waitPreview(page, predicate, arg) {
  await page.waitForFunction(([src, a]) => {
    const f = document.querySelector('iframe[title^="Aperçu du CV"]');
    const doc = f?.contentDocument;
    return !!doc && doc.readyState === 'complete' && new Function('doc', 'a', src)(doc, a);
  }, [predicate, arg], { timeout: 8000 }).catch(() => {});
}

/** Mesures dans l'aperçu : rapport taille calculée / taille déclarée du modèle */
const measure = page => page.evaluate(() => {
  const doc = document.querySelector('iframe[title^="Aperçu du CV"]').contentDocument;
  const cs = el => doc.defaultView.getComputedStyle(el);
  const ratio = el => {
    const declared = /font-size:calc\(([\d.]+)pt/.exec(el.getAttribute('style') ?? '')?.[1];
    return declared ? parseFloat(cs(el).fontSize) / (parseFloat(declared) * 96 / 72) : null;
  };
  const name = doc.querySelector('.cv-name');
  const title = [...doc.querySelectorAll('.cv-section-title')].find(e => /font-size:calc/.test(e.getAttribute('style') ?? '')) ?? doc.querySelector('.cv-section-title');
  const text = [...doc.querySelectorAll('.cv-entry li')][0];
  const section = doc.querySelector('.cv-section');
  const entry = doc.querySelector('.cv-entry');
  const entryDeclared = /margin(?:-bottom|-top)?:[^;]*?calc\(([\d.]+)px \* var\(--cv-entry/.exec(entry?.getAttribute('style') ?? '')?.[1];
  const entryComputed = entry ? Math.max(parseFloat(cs(entry).marginBottom), parseFloat(cs(entry).marginTop)) : null;
  const frame = doc.querySelector('.cv-photo-frame');
  const img = doc.querySelector('.cv-photo');
  const sepBorder = doc.querySelector('.cv-sep[data-sep="border"]');
  const sepLine = doc.querySelector('.cv-sep[data-sep="line"], .cv-sep[data-sep="side"]');
  const header = doc.querySelector('.cv-header');
  const sidebar = doc.querySelector('.cv-sidebar');
  return {
    name: ratio(name), title: ratio(title), text: text ? ratio(text) : null,
    lineHeight: text ? parseFloat(cs(text).lineHeight) / parseFloat(cs(text).fontSize) : null,
    font: cs(doc.body).fontFamily,
    titleColor: cs(title).color, titleWeight: cs(title).fontWeight, titleSpacing: parseFloat(cs(title).letterSpacing) / parseFloat(cs(title).fontSize),
    align: cs(title).textAlign === 'center' || cs(section).textAlign === 'center',
    role: cs(doc.querySelector('.cv-role')).color,
    htmlPadding: parseFloat(cs(doc.documentElement).paddingTop),
    entryRatio: entryDeclared && entryComputed ? entryComputed / parseFloat(entryDeclared) : null,
    photo: frame ? { w: frame.getBoundingClientRect().width, h: frame.getBoundingClientRect().height, border: cs(frame).borderTopWidth, radius: cs(frame).borderTopLeftRadius, zoom: cs(img).transform } : null,
    sep: sepBorder ? cs(sepBorder).borderBottomStyle : sepLine ? cs(sepLine).borderTopStyle : cs(title).borderBottomStyle,
    header: header ? cs(header).backgroundImage : null,
    sidebar: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
    textColorApplied: doc.documentElement.outerHTML.includes('color:#1f2937'),
  };
});

async function setRange(page, label, value) {
  await page.getByRole('slider', { name: label }).fill(String(value));
}
async function openSection(page, title) {
  const details = page.locator('details', { has: page.locator('summary', { hasText: title }) });
  if (!(await details.getAttribute('open') !== null)) await details.locator('summary').click();
}

async function chooseTemplate(page, name) {
  await page.getByRole('button', { name: /^Modèle/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Choisir un modèle' });
  await dialog.waitFor();
  await dialog.getByRole('list', { name: 'Modèles' }).getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
  await dialog.getByRole('button', { name: /^(Utiliser|Garder)/ }).click();
  await dialog.waitFor({ state: 'detached' });
}

export async function cvgen(browser, engine) {
  console.log(`\n▶ P4 — CV Generator : design enrichi, 8 modèles, responsive (${engine})`);

  // ── Desktop : 3 colonnes, réglages appliqués sur les 8 modèles ──
  {
    const { context, page, errors } = await openGenerator(browser, { width: 1440 });
    check(`${engine} 1440 : trois colonnes (Modifier, aperçu, Design) et séparateurs redimensionnables`,
      (await page.getByLabel('Modifier le contenu').isVisible()) && (await page.getByRole('separator').count()) === 2 && (await page.getByText('🎨 Design').isVisible()));
    await shot(page, `p4-cvgen-${engine}-1440-defaut`);

    // Réglages par l'interface
    await page.getByRole('button', { name: /Océan/ }).click();
    await page.getByLabel('Couleur secondaire (intitulé du poste)', { exact: true }).fill('#b45309');
    await openSection(page, 'Typographie');
    await setRange(page, 'Taille du nom', 1.3);
    await setRange(page, 'Taille des titres de section', 1.2);
    await setRange(page, 'Taille du texte', 1.1);
    await setRange(page, 'Hauteur de ligne', 1.2);
    await page.getByRole('group', { name: 'Épaisseur des titres' }).getByRole('button', { name: '800' }).click();
    await setRange(page, 'Espacement des lettres', 0.05);
    await page.getByLabel('Police', { exact: true }).selectOption({ label: 'Georgia (élégante)' });
    await openSection(page, 'Mise en page');
    await setRange(page, 'Marges du document', 10);
    await setRange(page, 'Espacement entre sections', 1.5);
    await setRange(page, 'Espacement entre expériences', 1.6);
    await page.getByRole('group', { name: 'Alignement des titres' }).getByRole('button', { name: 'Centre' }).click();
    await setRange(page, 'Largeur de la colonne latérale', 260);
    await openSection(page, 'Séparateurs et sections');
    await page.getByRole('group', { name: 'Style des séparateurs' }).getByRole('button', { name: 'Tirets' }).click();
    await setRange(page, 'Épaisseur des séparateurs', 2);
    await openSection(page, 'Photo');
    await page.getByRole('group', { name: 'Forme de la photo' }).getByRole('button', { name: 'Portrait' }).click();
    await setRange(page, 'Taille de la photo', 90);
    await setRange(page, 'Épaisseur de la bordure de la photo', 4);
    await setRange(page, 'Arrondi des coins de la photo', 10);
    await setRange(page, 'Zoom de la photo', 1.5);
    await page.waitForTimeout(600);

    // Modèle par modèle : réglages conservés, réellement appliqués
    for (const [id, name] of TEMPLATES) {
      if (id !== 'cascade') await chooseTemplate(page, name);
      if (CAPS[id].header) {
        await openSection(page, 'Mise en page');
        await page.getByRole('group', { name: 'Style de l’en-tête' }).getByRole('button', { name: 'Dégradé' }).click();
      }
      await waitPreview(page, 'return !!doc.querySelector(".cv-name") && doc.getElementById("cv-design")?.textContent.includes("--cv-fs:1.1")');
      await page.waitForTimeout(450);
      const m = await measure(page);
      const near = (v, want, tol = 0.04) => v !== null && Math.abs(v - want) <= tol;
      const failures = [];
      if (!near(m.name, 1.3)) failures.push(`nom ×${m.name?.toFixed(2)}`);
      if (!near(m.title, 1.2)) failures.push(`titres ×${m.title?.toFixed(2)}`);
      if (m.text !== null && !near(m.text, 1.1)) failures.push(`texte ×${m.text?.toFixed(2)}`);
      if (!/Georgia/.test(m.font)) failures.push(`police ${m.font}`);
      if (m.titleColor !== rgb('#0b57d0')) failures.push(`titres ${m.titleColor}`);
      if (m.role !== rgb('#b45309')) failures.push(`intitulé ${m.role}`);
      if (m.titleWeight !== '800') failures.push(`graisse ${m.titleWeight}`);
      if (!near(m.titleSpacing, 0.05, 0.01)) failures.push(`lettres ${m.titleSpacing?.toFixed(3)}em`);
      if (!m.align) failures.push('alignement');
      if (!near(m.htmlPadding, 37.8, 0.6)) failures.push(`marges ${m.htmlPadding}px`);
      if (m.entryRatio !== null && !near(m.entryRatio, 1.6, 0.05)) failures.push(`espacement entrées ×${m.entryRatio?.toFixed(2)}`);
      if (!m.photo || Math.round(m.photo.w) !== 90 || Math.round(m.photo.h) !== 120 || m.photo.border !== '4px' || m.photo.radius !== '10px' || !/matrix\(1\.5/.test(m.photo.zoom)) failures.push(`photo ${JSON.stringify(m.photo)}`);
      if (m.sep !== 'dashed') failures.push(`séparateurs ${m.sep}`);
      if (CAPS[id].header && !/linear-gradient/.test(m.header ?? '')) failures.push(`en-tête ${m.header}`);
      if (CAPS[id].sidebar && Math.abs(m.sidebar - 260) > 1) failures.push(`colonne ${m.sidebar}px`);
      if (!m.textColorApplied) failures.push('couleur du texte');
      check(`${engine} : ${name} — 17 réglages réellement appliqués à l’aperçu`, !failures.length, failures.join(', '));
      await page.screenshot({ path: path.join(OUT, `p4-cvgen-${engine}-${id}-design.png`) });
    }

    // Export : même HTML que l'aperçu, design compris
    await page.getByRole('button', { name: 'Vérifier & exporter PDF' }).first().click();
    await page.getByRole('button', { name: /Exporter quand même/ }).click();
    await page.waitForFunction(() => window.__printed?.length > 0, null, { timeout: 8000 }).catch(() => {});
    const printed = await page.evaluate(() => window.__printed?.at(-1) ?? '');
    const shownHtml = await page.evaluate(() => document.querySelector('iframe[title^="Aperçu du CV"]').getAttribute('srcdoc'));
    check(`${engine} : export PDF — HTML imprimé identique à l’aperçu (design compris)`, printed.length > 1000 && printed === shownHtml && printed.includes('.cv-name{--cv-fs:1.3}'));
    if (engine === 'chromium' && printed) {
      const pdfPage = await context.newPage();
      await pdfPage.setContent(printed, { waitUntil: 'load' });
      const pdf = await pdfPage.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      const { PDFDocument } = await import(pathToFileURL(createRequire(path.join(ROOT, 'noop.js')).resolve('pdf-lib')).href);
      const doc = await PDFDocument.load(pdf);
      fs.writeFileSync(path.join(OUT, 'p4-export-faang-design.pdf'), pdf);
      check(`${engine} : export PDF — document A4 produit depuis ce HTML`, doc.getPageCount() >= 1 && Math.round(doc.getPage(0).getWidth()) === 595, `${doc.getPageCount()} page(s)`);
      await pdfPage.close();
    }

    // Annuler / rétablir, raccourcis clavier
    await openSection(page, 'Typographie');
    const nameSlider = page.getByRole('slider', { name: 'Taille du nom' });
    await setRange(page, 'Taille du nom', 0.8);
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    check(`${engine} : Annuler → valeur précédente`, (await nameSlider.inputValue()) === '1.3', await nameSlider.inputValue());
    await page.getByRole('button', { name: 'Rétablir', exact: true }).click();
    check(`${engine} : Rétablir → valeur rétablie`, (await nameSlider.inputValue()) === '0.8', await nameSlider.inputValue());
    await page.locator('body').click({ position: { x: 700, y: 120 } });
    await page.keyboard.press('Control+z');
    check(`${engine} : Ctrl+Z hors champ de saisie → annulé`, (await nameSlider.inputValue()) === '1.3', await nameSlider.inputValue());

    // Réinitialiser un réglage, puis tout (avec confirmation)
    await page.getByRole('button', { name: 'Réinitialiser : Taille du nom' }).click();
    check(`${engine} : réinitialiser un réglage`, (await nameSlider.inputValue()) === '1');

    // Preset : enregistrer, tout réinitialiser, recharger le preset
    await openSection(page, 'Mes presets de design');
    await page.getByLabel('Nom du preset').fill('Style recette');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByRole('button', { name: 'Tout réinitialiser' }).click();
    const confirm = page.getByRole('dialog', { name: 'Réinitialiser tout le design ?' });
    await confirm.waitFor();
    check(`${engine} : tout réinitialiser demande une confirmation`, await confirm.isVisible());
    await confirm.getByRole('button', { name: 'Tout réinitialiser' }).click();
    await waitPreview(page, 'return !doc.getElementById("cv-design")?.textContent.includes("@page")');
    const afterReset = await measure(page);
    check(`${engine} : après réinitialisation — style d’origine du modèle`, Math.abs(afterReset.name - 1) < 0.02 && afterReset.htmlPadding === 0 && afterReset.titleColor !== rgb('#0b57d0'), JSON.stringify({ nom: afterReset.name, marges: afterReset.htmlPadding, titres: afterReset.titleColor }));
    await page.getByRole('listitem').filter({ hasText: 'Style recette' }).getByRole('button', { name: 'Appliquer' }).click();
    await waitPreview(page, 'return doc.getElementById("cv-design")?.textContent.includes("@page{margin:10mm}")');
    const fromPreset = await measure(page);
    check(`${engine} : preset rechargé — réglages retrouvés`, Math.abs(fromPreset.htmlPadding - 37.8) < 0.6 && fromPreset.titleColor === rgb('#0b57d0') && Math.abs(fromPreset.title - 1.2) < 0.04, JSON.stringify({ marges: fromPreset.htmlPadding, titres: fromPreset.titleColor }));

    // Saisie hexadécimale sécurisée
    await openSection(page, 'Couleurs et palettes');
    const hex = page.locator('input[aria-invalid]').first();
    await hex.fill('#12zz45');
    check(`${engine} : couleur hexadécimale invalide signalée, non appliquée`, (await hex.getAttribute('aria-invalid')) === 'true');
    await hex.fill('#7a1e2c');
    await page.waitForTimeout(400);
    check(`${engine} : couleur hexadécimale valide appliquée`, (await page.evaluate(() => document.querySelector('iframe[title^="Aperçu du CV"]').getAttribute('srcdoc'))).toLowerCase().includes('#7a1e2c'));

    // Persistance au rechargement (enregistrement local différé de 400 ms)
    await page.waitForTimeout(800);
    await page.reload();
    await page.locator('iframe[title^="Aperçu du CV"]').waitFor();
    await waitPreview(page, 'return !!doc.querySelector(".cv-name")');
    const reloaded = await page.evaluate(() => document.querySelector('iframe[title^="Aperçu du CV"]').getAttribute('srcdoc'));
    const tplButton = await page.getByRole('button', { name: /^Modèle :/ }).first().innerText();
    check(`${engine} : modèle et design conservés au rechargement`, reloaded.includes('@page{margin:10mm}') && /Jake's FAANG/.test(tplButton), `${tplButton.trim()} ; marges ${reloaded.includes('@page{margin:10mm}')}`);
    check(`${engine} : aucune erreur JavaScript (desktop)`, !errors.length, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ── Galerie : miniatures fidèles, filtre, modèle actuel ──
  {
    const { context, page } = await openGenerator(browser, { width: 1366 });
    await page.getByRole('button', { name: /^Modèle : Cascade/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Choisir un modèle' });
    await dialog.waitFor();
    const cards = dialog.getByRole('list', { name: 'Modèles' }).getByRole('listitem');
    check(`${engine} : galerie — 8 modèles avec miniature du CV réel`, (await cards.count()) === 8 && (await dialog.locator('iframe[title^="Miniature"]').count()) === 8);
    check(`${engine} : galerie — modèle actuel identifié`, await dialog.getByRole('button', { name: /Cascade, modèle actuel/ }).isVisible());
    await dialog.getByRole('group', { name: 'Filtrer les modèles par style' }).getByRole('button', { name: 'Académique' }).click();
    check(`${engine} : galerie — filtre « Académique »`, (await cards.count()) === 1 && (await cards.first().innerText()).includes('Stanford'));
    await dialog.getByRole('button', { name: 'Tous' }).click();
    await dialog.getByRole('button', { name: /^Google Chip/ }).click();
    check(`${engine} : galerie — prévisualisation rapide`, await dialog.locator('iframe[title="Prévisualisation Google Chip"]').isVisible());
    await shot(page, `p4-galerie-${engine}`);
    await dialog.getByRole('button', { name: /Utiliser « Google Chip »/ }).click();
    const notice = page.getByRole('status').filter({ hasText: 'Google Chip' });
    await notice.waitFor({ timeout: 5000 });
    const html = await page.evaluate(() => document.querySelector('iframe[title^="Aperçu du CV"]').getAttribute('srcdoc'));
    check(`${engine} : changement de modèle — données du candidat conservées`, html.includes(FIXTURE_CV.personal.summary) && html.includes('Entreprise C'));
    await context.close();
  }

  // ── Mobile et tablette : onglets, données conservées, aperçu zoomable ──
  for (const width of [320, 390, 768]) {
    const { context, page, errors } = await openGenerator(browser, { width, height: width < 768 ? 800 : 1024 });
    const tabs = page.getByRole('tablist', { name: 'Vue de l’éditeur' });
    check(`${engine} ${width}px : onglets Modifier / Aperçu / Design`, (await tabs.getByRole('tab').count()) === 3);
    const layout = await layoutIssues(page);
    check(`${engine} ${width}px : aucun débordement de page`, layout.overflowX <= 0, `${layout.overflowX}px [${layout.clipped.join(' | ')}]`);
    const exportBtn = page.getByRole('button', { name: 'Vérifier & exporter PDF' });
    const box = await exportBtn.boundingBox();
    check(`${engine} ${width}px : export accessible sans défiler (barre fixe en bas), cible ≥ 44 px`, !!box && box.y + box.height <= (width < 768 ? 800 : 1024) && box.height >= 44, box ? `${Math.round(box.y)} / h ${Math.round(box.height)}` : '');
    // Aperçu zoomable et déplaçable
    await page.getByRole('button', { name: 'Zoom avant' }).click();
    await page.getByRole('button', { name: 'Zoom avant' }).click();
    const pan = await page.getByLabel('Aperçu du CV, défilable').evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    check(`${engine} ${width}px : aperçu zoomé déplaçable dans sa zone, page non débordée`, pan.sw > pan.cw && (await layoutIssues(page)).overflowX <= 0, `${pan.sw}/${pan.cw}`);
    await shot(page, `p4-cvgen-${engine}-${width}-apercu`);
    // Saisie dans Modifier, visible dans Aperçu, conservée après Design
    await tabs.getByRole('tab', { name: /Modifier/ }).click();
    const nameField = page.locator('.ep-field').filter({ hasText: 'Nom complet' }).locator('input');
    await nameField.fill('Awa Konan-Traoré');
    await shot(page, `p4-cvgen-${engine}-${width}-modifier`);
    await tabs.getByRole('tab', { name: /Design/ }).click();
    await page.getByRole('slider', { name: 'Taille du nom' }).fill('1.2');
    await shot(page, `p4-cvgen-${engine}-${width}-design`);
    await tabs.getByRole('tab', { name: /Aperçu/ }).click();
    await waitPreview(page, 'return doc.querySelector(".cv-name")?.textContent.includes("Konan-Traoré")');
    const shown = await page.evaluate(() => document.querySelector('iframe[title^="Aperçu du CV"]').contentDocument.querySelector('.cv-name')?.textContent);
    check(`${engine} ${width}px : données conservées entre onglets (saisie visible dans l’aperçu)`, /Konan-Traoré/i.test(shown ?? ''), shown);
    await tabs.getByRole('tab', { name: /Modifier/ }).click();
    check(`${engine} ${width}px : retour sur Modifier — saisie conservée`, (await nameField.inputValue()) === 'Awa Konan-Traoré');
    // Étape « Informations » (formulaire avant génération) : lisible et utilisable
    await page.getByRole('button', { name: /Informations/ }).first().click();
    const generate = page.getByRole('button', { name: /Générer mon CV/ });
    await generate.waitFor();
    const formLayout = await layoutIssues(page);
    const fieldBox = await page.locator('.gp-input').first().boundingBox();
    check(`${engine} ${width}px : formulaire sans débordement, champs à la largeur de l’écran`, formLayout.overflowX <= 0 && !!fieldBox && fieldBox.x >= 0 && fieldBox.x + fieldBox.width <= width + 1, `débordement ${formLayout.overflowX}px`);
    await shot(page, `p4-cvgen-${engine}-${width}-formulaire`);
    check(`${engine} ${width}px : aucune erreur JavaScript`, !errors.length, errors.slice(0, 2).join(' | '));
    await context.close();
  }
}

/** Non-régression : les 8 modèles, design par défaut, identiques au pixel près à la version de référence */
export async function cvbaseline(browser, engine) {
  if (engine !== 'chromium') return;
  const ref = process.env.CV_BASELINE_REF || '84cd92c';
  console.log(`\n▶ P4 — Non-régression visuelle des 8 modèles (référence ${ref})`);
  const tmp = fs.mkdtempSync(path.join(OUT, 'baseline-'));
  try {
    fs.writeFileSync(path.join(tmp, 'old.tsx'), spawnSync('git', ['show', `${ref}:src/pages/CVBuilder/CVGeneratorPro_part2.tsx`], { cwd: ROOT, encoding: 'utf8' }).stdout);
    const esbuild = createRequire(path.join(ROOT, 'noop.js'))('esbuild');
    const load = async (entry, out) => {
      await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error' });
      return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
    };
    const oldMod = await load(path.join(tmp, 'old.tsx'), path.join(tmp, 'old.mjs'));
    const newMod = await load(path.join(ROOT, 'src/pages/CVBuilder/CVGeneratorPro_part2.tsx'), path.join(tmp, 'new.mjs'));
    const legacyDesign = { primaryColor: '#1e3a5f', accentColor: '#6fa3d0', fontFamily: 'Calibri', spacing: 'normal', headerStyle: 'solid', showPhoto: true, showBars: true, photoShape: 'circle', photoX: 50, photoY: 25 };
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    for (const [id, name] of TEMPLATES) {
      const shots = [];
      for (const html of [oldMod.renderTemplate(FIXTURE_CV, id, legacyDesign, 'fr'), newMod.renderTemplate(FIXTURE_CV, id, legacyDesign, 'fr')]) {
        await page.setContent(html, { waitUntil: 'load' });
        shots.push((await page.screenshot({ fullPage: true })).toString('base64'));
      }
      const diff = await page.evaluate(async ([a, b]) => {
        const img = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${src}`; });
        const [ia, ib] = await Promise.all([img(a), img(b)]);
        const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
        const data = im => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.fillStyle = '#f0f'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0); return x.getImageData(0, 0, w, h).data; };
        const da = data(ia), db = data(ib);
        let n = 0;
        for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) n++;
        return n;
      }, shots);
      check(`${name} : rendu par défaut identique au pixel près à la version précédente`, diff === 0, `${diff} pixel(s) différent(s)`);
    }
    await page.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
