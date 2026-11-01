#!/usr/bin/env node
// Recette des modèles de CV, avec de vrais PDF (recette locale en marche : npm run recette:up).
//
//   node scripts/latex-templates-recette.mjs [--thumbnails]
//
// Pour chaque modèle et ses variantes (photo, compact, anglais, police, colonnes, CV long) :
// compilation par l'API → latex-runner, puis contrôle qualité (lib/quality.ts) : débordements,
// caractères manquants, marges, pages blanches, dernière page presque vide, nom coupé.
// Le modèle d'origine « Premium Hero » est aussi contrôlé : ses défauts doivent être DÉTECTÉS.
// --thumbnails : miniatures PNG de chaque modèle dans public/latex-templates (pdf.js + canvas).
// Aucun appel IA ; adresses fictives (198.18.0.0/15) pour ne pas consommer vos quotas.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { registerTsResolve } from './lib/ts-resolve.mjs';

registerTsResolve();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.RECETTE_API || 'http://127.0.0.1:5000';
const OUT = path.join(ROOT, 'secrets', 'recette', 'latex', 'modeles');
const THUMBS = path.join(ROOT, 'public', 'latex-templates');
fs.mkdirSync(OUT, { recursive: true });

const { TEMPLATE_LIBRARY, renderCv } = await import('../src/features/latex-studio/templates/library.ts');
const { sampleCv } = await import('../src/features/latex-studio/templates/sample.ts');
const { analyzeQuality, extractPageText } = await import('../src/features/latex-studio/lib/quality.ts');
const { buildFinalLatex, TEMPLATES } = await import('../src/pages/CVBuilder/latexTemplates.ts');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✔' : '✗'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
};
const photo = `data:image/jpeg;base64,${fs.readFileSync(path.join(ROOT, 'tests', 'latex', 'fixtures', 'photo-test.jpg')).toString('base64')}`;

async function compile(code, withPhoto) {
  const res = await fetch(`${API}/api/cv/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.19.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 254)}` },
    body: JSON.stringify(withPhoto ? { code: buildFinalLatex(code, true, 3.2), photo } : { code: buildFinalLatex(code, false, 3.2) }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (res.status !== 200) return { status: res.status, error: JSON.parse(buf.toString('utf8')) };
  const header = res.headers.get('x-latex-warnings');
  const warnings = header ? JSON.parse(Buffer.from(header, 'base64').toString('utf8')) : [];
  return { status: 200, pdf: buf, warnings };
}

async function analyze(pdf, warnings, name) {
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
  const doc = await task.promise;
  const pages = await extractPageText(doc);
  await task.destroy();
  return { pages: pages.length, issues: analyzeQuality(pages, warnings, name) };
}

console.log('▶ Huit modèles, variantes et CV long : compilation réelle et contrôle qualité');
const variants = [
  { key: 'defaut', label: 'par défaut', opts: {} },
  { key: 'photo', label: 'avec photo', opts: { photo: true } },
  { key: 'compact-en', label: 'compact, anglais', opts: { compact: true, lang: 'en', size: 10 } },
  { key: 'times-12', label: 'Times 12 pt, marges larges', opts: { font: 'times', size: 12, margins: 'large' } },
  { key: 'long', label: 'CV long (multipage)', opts: {}, long: true },
];
const summary = [];
for (const t of TEMPLATE_LIBRARY) {
  const list = [...variants, ...(t.supports.twoColumns ? [{ key: 'une-colonne', label: 'une colonne', opts: { twoColumns: false } }] : [])];
  for (const v of list) {
    const cv = sampleCv(v.long ? 'long' : 'short');
    const code = renderCv(t.id, cv, v.opts);
    const withPhoto = !!v.opts.photo && t.supports.photo;
    const r = await compile(code, withPhoto);
    if (r.status !== 200) {
      check(`${t.name} — ${v.label}`, false, JSON.stringify(r.error).slice(0, 300));
      continue;
    }
    fs.writeFileSync(path.join(OUT, `${t.id}-${v.key}.pdf`), r.pdf);
    const q = await analyze(r.pdf, r.warnings, cv.identity.fullName);
    // Les textes d'exemple (« Prénom NOM »…) sont attendus : ils DOIVENT être signalés
    const blocking = q.issues.filter(i => i.code !== 'placeholder' && i.severity !== 'info');
    const flaggedSample = q.issues.some(i => i.code === 'placeholder');
    summary.push({ template: t.id, variant: v.key, pages: q.pages, issues: q.issues });
    check(`${t.name} — ${v.label} : ${q.pages} page(s)`, !blocking.length && flaggedSample && (!v.long || q.pages >= 2),
      blocking.map(i => `${i.code}${i.line ? ` l.${i.line}` : ''}: ${i.message}`).join(' | ') || (q.issues.filter(i => i.severity === 'info').map(i => i.code).join(', ') || ''));
  }
}

// ── Design (phase avancée, P5) : thèmes extrêmes et polices réellement intégrées au PDF ──
console.log('\n▶ Design : thèmes personnalisés sur les huit modèles, polices vérifiées dans le PDF');
const { FONT_CHOICES } = await import('../src/features/latex-studio/templates/theme.ts');
const zlib = await import('node:zlib');
/** Noms des polices intégrées (dictionnaires /BaseFont, flux compressés compris) */
function embeddedFonts(pdf) {
  let text = pdf.toString('latin1');
  for (let at = pdf.indexOf('stream'); at >= 0; at = pdf.indexOf('stream', at + 6)) {
    let start = at + 6; if (pdf[start] === 13) start++; if (pdf[start] === 10) start++;
    const end = pdf.indexOf('endstream', start);
    if (end < 0) break;
    try { text += zlib.inflateSync(pdf.subarray(start, end)).toString('latin1'); } catch { /* flux non compressé */ }
  }
  return [...new Set([...text.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)].map(m => m[1].replace(/^[A-Z]{6}\+/, '')))];
}
const THEMES = [
  { key: 'theme-ample', label: 'Palatino, Letter, aéré, titres centrés, filet épais, couleurs personnalisées', opts: {
    font: 'palatino', size: 11, theme: {
      paper: 'letter', density: 'airy', marginX: 2.6, marginY: 2.2, nameSize: 32, headlineSize: 'Large', headlineItalic: true,
      sectionSize: 'Large', sectionBold: false, sectionUpper: false, tracking: 0, sectionAlign: 'center', separator: 'thick',
      lineSpread: 1.2, paragraphSkip: 6, entryGap: 12, detailSize: 'normalsize', keepEntries: false, columnRatio: 0.38,
      secondary: '7A1E2C', heading: '0F766E', text: '1F2937', rule: 'B45309',
    } } },
  { key: 'theme-dense', label: 'Avant Garde, compact, marges minimales, sans filet, grand espacement des lettres', opts: {
    font: 'avant', size: 10, compact: true, theme: {
      density: 'compact', marginX: 1, marginY: 1, nameSize: 16, sectionSize: 'small', tracking: 150, separator: 'none',
      lineSpread: 0.9, paragraphSkip: 0, entryGap: 0, sectionBefore: 0, sectionAfter: 0, detailSize: 'footnotesize', columnRatio: 0.22,
    } } },
];
for (const t of TEMPLATE_LIBRARY) {
  for (const v of THEMES) {
    const cv = sampleCv('long');
    const code = renderCv(t.id, cv, v.opts);
    const r = await compile(code, false);
    if (r.status !== 200) { check(`${t.name} — ${v.label}`, false, JSON.stringify(r.error).slice(0, 300)); continue; }
    fs.writeFileSync(path.join(OUT, `${t.id}-${v.key}.pdf`), r.pdf);
    const q = await analyze(r.pdf, r.warnings, cv.identity.fullName);
    const blocking = q.issues.filter(i => i.code !== 'placeholder' && i.severity !== 'info');
    check(`${t.name} — ${v.label} : ${q.pages} page(s)`, !blocking.length, blocking.map(i => `${i.code}: ${i.message}`).join(' | '));
  }
}
const EXPECTED_FONT = {
  lmodern: /^LMRoman/, charter: /^CharterBT/, times: /^NimbusRomNo9L/, palatino: /^URWPalladioL/, utopia: /^Utopia-/, bookman: /^URWBookmanL/,
  century: /^CenturySchL/, helvet: /^NimbusSanL/, avant: /^URWGothicL/, lmsans: /^LMSans/,
};
for (const f of FONT_CHOICES) {
  const code = renderCv('executive-prestige', sampleCv('short'), { font: f.id })
  const r = await compile(code, false);
  const fonts = r.status === 200 ? embeddedFonts(r.pdf) : [];
  check(`police « ${f.label} » réellement intégrée au PDF`, fonts.some(n => EXPECTED_FONT[f.id].test(n)) && !fonts.some(n => /^SF(RM|BX|TI)/.test(n)), fonts.slice(0, 4).join(' '));
}

console.log('\n▶ Défauts du modèle d’origine « Premium Hero » : détectés par le contrôle qualité');
const legacy = await compile(TEMPLATES.overleafClassic.code, false);
const legacyQ = await analyze(legacy.pdf, legacy.warnings, '');
const codes = legacyQ.issues.map(i => i.code);
check('nom coupé sur deux lignes détecté', codes.includes('name-split'), legacyQ.issues.find(i => i.code === 'name-split')?.message);
check('coordonnées fictives détectées', legacyQ.issues.some(i => i.code === 'placeholder' && /téléphone|e-mail/.test(i.message)), legacyQ.issues.filter(i => i.code === 'placeholder').map(i => i.message.split(':')[1]).join(';'));

if (process.argv.includes('--thumbnails')) {
  console.log('\n▶ Miniatures (public/latex-templates)');
  const { createCanvas } = await import('@napi-rs/canvas');
  fs.mkdirSync(THUMBS, { recursive: true });
  for (const t of TEMPLATE_LIBRARY) {
    for (const withPhoto of t.supports.photo ? [false, true] : [false]) {
      // Cadre « Photo optionnelle » plutôt qu'une image d'essai
      const r = await compile(renderCv(t.id, sampleCv('short'), { photo: withPhoto }), false);
      const task = pdfjs.getDocument({ data: new Uint8Array(r.pdf), verbosity: 0 });
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 420 / base.width });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      const file = path.join(THUMBS, `${t.id}${withPhoto ? '-photo' : ''}.png`);
      fs.writeFileSync(file, await canvas.encode('png'));
      await task.destroy();
      check(`miniature ${path.basename(file)}`, fs.statSync(file).size > 5000, `${Math.round(fs.statSync(file).size / 1024)} Ko`);
    }
  }
}

fs.writeFileSync(path.join(OUT, 'rapport-qualite.json'), JSON.stringify(summary, null, 2));
console.log(`\nPDF et rapport : ${path.relative(ROOT, OUT)}`);
console.log(failures ? `${failures} contrôle(s) en échec` : 'Tous les contrôles sont réussis. Aucun appel IA.');
process.exitCode = failures ? 1 : 0;
