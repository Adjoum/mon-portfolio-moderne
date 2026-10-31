#!/usr/bin/env node
// Recette de l'aperçu PDF LaTeX, avec de vrais PDF, sur la recette locale en marche
// (node scripts/recette.mjs up). Aucun appel à un fournisseur IA, aucune donnée de production.
//
//   node scripts/latex-recette.mjs
//
// 1. Conteneur latex-runner : options de sécurité réellement appliquées (docker inspect).
// 2. Isolement à l'exécution : privilèges, fichiers, réseau, variables (sonde dans le conteneur).
// 3. TeX seul, SANS la politique lexicale : documents malveillants et épuisement des ressources.
// 4. Chaîne complète navigateur → API → runner : 3 templates, photo, documents de forme Groq,
//    documents malveillants, limites de taille, concurrence.
//
// PDF et rapport : secrets/recette/latex (ignoré par Git). Les requêtes à l'API portent des
// adresses fictives (198.18.0.0/15) : les quotas de votre navigateur ne sont pas consommés.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TEMPLATES, buildFinalLatex } from '../src/pages/CVBuilder/latexTemplates.ts';
import { pdfText, pdfBytesText, findLeak } from '../tests/latex/pdf-inspect.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = process.env.LATEX_RUNNER_CONTAINER || 'recette-latex-runner';
const API = process.env.RECETTE_API || 'http://127.0.0.1:5000';
const OUT = path.join(ROOT, 'secrets', 'recette', 'latex');
const FIXTURES = path.join(ROOT, 'tests', 'latex', 'fixtures');
fs.mkdirSync(OUT, { recursive: true });

const report = { date: new Date().toISOString(), checks: [], compilations: [] };
let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  report.checks.push({ label, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? '✔' : '✗'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
}
const section = title => console.log(`\n▶ ${title}`);

function docker(...args) {
  const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`docker ${args.slice(0, 2).join(' ')} : ${r.stderr.slice(-400)}`);
  return r.stdout;
}
/** Exécute un module dans le conteneur (passé sur l'entrée standard, jamais copié dans l'image) */
function inContainer(file, ...args) {
  const r = spawnSync('docker', ['exec', '-i', CONTAINER, 'node', '--input-type=module', '-', ...args],
    { input: fs.readFileSync(path.join(ROOT, file), 'utf8'), encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`sonde ${file} : ${r.stderr.slice(-600)}`);
  return r.stdout.trim().split('\n').map(line => JSON.parse(line));
}

// ── 1. Configuration du conteneur ───────────────────────────
section('Conteneur latex-runner (docker inspect)');
const info = JSON.parse(docker('inspect', CONTAINER))[0];
const hc = info.HostConfig;
check('racine du système de fichiers en lecture seule', hc.ReadonlyRootfs === true);
check('aucune capacité Linux (cap_drop: ALL, aucun ajout)', hc.CapDrop?.includes('ALL') && !hc.CapAdd?.length);
check('no-new-privileges', hc.SecurityOpt?.includes('no-new-privileges:true'));
check('conteneur non privilégié', hc.Privileged === false);
check('utilisateur sans privilège 10001:10001', info.Config.User === '10001:10001', info.Config.User);
check('64 processus au plus', hc.PidsLimit > 0 && hc.PidsLimit <= 64, hc.PidsLimit);
check('512 Mo de mémoire, sans swap', hc.Memory === 512 * 1024 * 1024 && hc.MemorySwap === hc.Memory, `${hc.Memory / 1048576} Mo`);
check('1 processeur au plus', hc.NanoCpus > 0 && hc.NanoCpus <= 1e9, `${hc.NanoCpus / 1e9} CPU`);
check('/work et /tmp en mémoire, sans exécution (noexec, nosuid, nodev)',
  ['/work', '/tmp'].every(p => ['noexec', 'nosuid', 'nodev'].every(o => (hc.Tmpfs?.[p] ?? '').includes(o))), JSON.stringify(hc.Tmpfs));
check('aucun volume ni dossier de l’hôte monté', !(info.Mounts ?? []).some(m => m.Type !== 'tmpfs'));
check('aucun port publié', !Object.keys(hc.PortBindings ?? {}).length);
check('processus init (récupère les processus orphelins)', hc.Init === true);
const networks = Object.keys(info.NetworkSettings.Networks);
const net = networks.length === 1 ? JSON.parse(docker('network', 'inspect', networks[0]))[0] : null;
check('un seul réseau, interne (aucune route vers Internet ni vers l’hôte)', net?.Internal === true, networks.join(', '));
const neighbours = Object.values(net?.Containers ?? {}).map(c => c.Name).sort();
check('seule l’API partage ce réseau', neighbours.length === 2 && neighbours.some(n => /api/.test(n)), neighbours.join(', '));
const envNames = info.Config.Env.map(e => e.split('=')[0]);
check('aucune variable secrète dans le conteneur', !envNames.some(n => /KEY|SECRET|TOKEN|PASSWORD|PASS|DATABASE|MONGO|SUPABASE|JWT|URI/i.test(n)), envNames.join(', '));

// ── 2. Isolement à l'exécution ──────────────────────────────
section('Isolement à l’exécution (sonde dans le conteneur)');
const [rt] = inContainer('tests/latex/runtime-probe.mjs');
report.runtime = rt;
check('utilisateur 10001, aucune capacité effective ni héritable', rt.uid === 10001 && /^0+$/.test(rt.capEff) && /^0+$/.test(rt.capBnd), `uid ${rt.uid}, CapEff ${rt.capEff}`);
check('no_new_privs actif, filtre seccomp actif', rt.noNewPrivs === '1' && rt.seccomp === '2');
check('écriture refusée dans /app et /etc (lecture seule)', rt.writeApp === 'EROFS' && rt.writeEtc === 'EROFS', `${rt.writeApp}, ${rt.writeEtc}`);
check('écriture permise dans /work, exécution refusée (noexec)', rt.writeWork === 'écrit' && rt.execWork === 'EACCES', rt.execWork);
check('aucun accès à Internet (TCP 1.1.1.1:443)', rt.internetTcp !== 'connecté', rt.internetTcp);
check('aucune résolution DNS externe', rt.dnsExterne !== 'résolu', rt.dnsExterne);
check('hôte injoignable (host.docker.internal, passerelle du réseau)', rt.hostDockerInternal !== 'connecté' && !rt.passerelleReseau.endsWith('connecté'), `${rt.hostDockerInternal} ; ${rt.passerelleReseau}`);
console.log(`ℹ API joignable depuis le runner (même réseau interne, risque résiduel documenté) : ${rt.api}`);
check('variables lisibles dans /proc : aucune ne contient de secret', !rt.envNames.some(n => /KEY|SECRET|TOKEN|PASSWORD|DATABASE|MONGO|SUPABASE|JWT/i.test(n)), rt.envNames.join(', '));
check('politique TeX effective : shell_escape=f, openin_any=p, openout_any=p', rt.kpse_shell_escape === 'f' && rt.kpse_openin_any === 'p' && rt.kpse_openout_any === 'p');
const baseline = rt.processes;

// ── 3. TeX seul, sans la politique lexicale ─────────────────
section('TeX seul, SANS la politique lexicale (documents malveillants, ressources)');
const probe = inContainer('tests/latex/sandbox-probe.mjs').filter(r => !r.name.startsWith('__'));
const expectations = {
  'input-absolu':   r => r.outcome === 'LATEX_COMPILE_ERROR',
  'input-parent':   r => r.outcome === 'LATEX_COMPILE_ERROR',
  'input-environ':  r => r.outcome === 'LATEX_COMPILE_ERROR',
  'openin-read':    r => r.text?.includes('FERME'),
  'verbatiminput':  r => r.outcome !== 'pdf' || !/root/.test(r.text ?? ''),
  'pdffiledump':    r => r.text?.includes('DUMP[]'),
  'pdfmdfivesum':   r => r.text?.includes('MD5[]'),
  'pdffilesize':    r => r.text?.includes('SIZE[]'),
  'pdfximage':      r => r.outcome === 'LATEX_COMPILE_ERROR',
  'write18':        r => r.outcome === 'pdf' && !r.stray.length,
  'input-pipe':     r => r.outcome === 'LATEX_COMPILE_ERROR',
  'openout-parent': r => r.outcome === 'LATEX_COMPILE_ERROR' && !r.stray.length,
  'openout-absolu': r => r.outcome === 'LATEX_COMPILE_ERROR' && !r.stray.length,
  'openout-cache':  r => r.outcome === 'LATEX_COMPILE_ERROR' && !r.stray.length,
  'boucle-infinie': r => ['LATEX_RESOURCE_LIMIT', 'LATEX_TIMEOUT'].includes(r.outcome) && r.ms <= 21_000,
  'pile-infinie':   r => r.outcome === 'LATEX_RESOURCE_LIMIT',
  'memoire':        r => r.outcome === 'LATEX_RESOURCE_LIMIT',
  'pages-infinies': r => ['LATEX_RESOURCE_LIMIT', 'LATEX_TIMEOUT'].includes(r.outcome) && r.ms <= 21_000,
};
for (const r of probe) {
  const pdf = r.pdf ? Buffer.from(r.pdf, 'base64') : null;
  if (pdf) r.text = (await pdfText(pdf)).join(' ');
  const leak = pdf ? findLeak(pdfBytesText(pdf)) : findLeak(JSON.stringify(r.errors ?? []));
  delete r.pdf;
  report.compilations.push({ couche: 'TeX seul', ...r, leak });
  if (r.name === 'pdfobj-file') {
    // pdfTeX ne soumet pas \pdfobj file à openin_any : le fichier est embarqué. Attendu ici,
    // sans conséquence (aucun secret dans le conteneur) ; la politique refuse \pdfobj (voir §4).
    const generic = !/CANARY_|SECRET|PASSWORD|_KEY=/i.test(pdf ? pdfBytesText(pdf) : '');
    check(`${r.name} : non bloqué par TeX (limite connue de pdfTeX) ; seul un fichier générique du conteneur est lisible`, generic, `fuite : ${leak ?? 'aucune'}`);
    continue;
  }
  const ok = expectations[r.name]?.(r) && !leak && r.processes <= baseline + 1;
  check(`${r.name} → ${r.outcome}${r.text ? ` « ${r.text.slice(0, 30)} »` : ''}`, ok, `${r.ms} ms${leak ? `, FUITE ${leak}` : ''}${r.stray?.length ? `, fichiers ${r.stray}` : ''}`);
}

// ── 4. Chaîne complète via l'API ────────────────────────────
section('Chaîne complète : API → latex-runner (vrais PDF)');
const fakeIp = () => `198.18.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 254)}`;
async function viaApi(body, ip = fakeIp()) {
  const started = Date.now();
  const res = await fetch(`${API}/api/cv/compile`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(body) });
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, type, buf, json: type.includes('json') ? JSON.parse(buf.toString('utf8')) : null, ms: Date.now() - started, headers: res.headers };
}

const photo = `data:image/jpeg;base64,${fs.readFileSync(path.join(FIXTURES, 'photo-test.jpg')).toString('base64')}`;
const legit = [
  ...Object.entries(TEMPLATES).map(([id, t]) => ({ name: `template ${t.name}`, file: `template-${id}`, code: buildFinalLatex(t.code, false, 3.2), expect: ['KOFFI', 'Votre Nom'] })),
  { name: 'template Premium Hero avec photo', file: 'template-overleafClassic-photo', code: buildFinalLatex(TEMPLATES.overleafClassic.code, true, 3.2), photo, expect: ['KOFFI WILFRIED'] },
  ...fs.readdirSync(FIXTURES).filter(f => f.endsWith('.tex')).flatMap(f => {
    const raw = fs.readFileSync(path.join(FIXTURES, f), 'utf8');
    return [
      { name: `forme Groq ${f} (sans photo)`, file: f.replace(/\.tex$/, ''), code: buildFinalLatex(raw, false, 3.2), expect: ['Côte d', 'Expérience'] },
      { name: `forme Groq ${f} (avec photo)`, file: `${f.replace(/\.tex$/, '')}-photo`, code: buildFinalLatex(raw, true, 3.0), photo, expect: ['Expérience'] },
    ];
  }),
];
for (const doc of legit) {
  const r = await viaApi(doc.photo ? { code: doc.code, photo: doc.photo } : { code: doc.code });
  let pages = [];
  let leak = null;
  if (r.status === 200) {
    fs.writeFileSync(path.join(OUT, `${doc.file}.pdf`), r.buf);
    pages = await pdfText(r.buf);
    leak = findLeak(pdfBytesText(r.buf));
  }
  const text = pages.join(' ');
  const textOk = doc.expect.some(e => text.includes(e)) && !/[ÃÂ]\S/.test(text);   // accents décodés correctement
  report.compilations.push({ couche: 'API', name: doc.name, status: r.status, pages: pages.length, octets: r.buf.length, ms: r.ms, leak, erreur: r.json });
  check(`${doc.name} → PDF ${pages.length} page(s)`, r.status === 200 && r.type === 'application/pdf' && pages.length >= 1 && textOk && !leak,
    r.status === 200 ? `${r.ms} ms, ${Math.round(r.buf.length / 1024)} Ko` : JSON.stringify(r.json));
}
const okRes = await viaApi({ code: buildFinalLatex(TEMPLATES.minimal.code, false, 3.2) });
check('en-têtes : PDF inline, no-store, nosniff, CSP sandbox',
  okRes.headers.get('content-disposition') === 'inline; filename="cv.pdf"' && okRes.headers.get('cache-control') === 'no-store'
  && okRes.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(okRes.headers.get('content-security-policy') ?? ''));

section('Documents hors politique ou erronés : message clair, aucune information interne');
const doc = body => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;
const refused = [
  ...JSON.parse(fs.readFileSync(path.join(FIXTURES, 'groq-hors-politique.json'), 'utf8')),
  { name: 'lecture de /etc/passwd', code: doc('\\input{/etc/passwd}'), expected: 'LATEX_FORBIDDEN_COMMAND' },
  { name: 'fichier embarqué (\\pdfobj file)', code: doc('\\immediate\\pdfobj stream file {/etc/passwd}'), expected: 'LATEX_FORBIDDEN_COMMAND' },
  { name: 'commande système (\\write18)', code: doc('\\immediate\\write18{env}'), expected: 'LATEX_FORBIDDEN_COMMAND' },
  { name: 'contournement par ^^5c', code: doc('^^5cinput{/etc/passwd}'), expected: 'LATEX_FORBIDDEN_COMMAND' },
  { name: 'contournement par \\csname', code: doc('\\csname input\\endcsname{/etc/passwd}'), expected: 'LATEX_FORBIDDEN_COMMAND' },
  { name: 'contournement par \\catcode', code: doc('\\catcode`\\|=0 |input{/etc/passwd}'), expected: 'LATEX_FORBIDDEN_COMMAND' },
  { name: 'fichier .sty fabriqué (filecontents)', code: `\\begin{filecontents*}{hyperref.sty}\n\\end{filecontents*}\n${doc('x')}`, expected: 'LATEX_FORBIDDEN_COMMAND' },
  { name: 'paquet shellesc', code: `\\documentclass{article}\n\\usepackage{shellesc}\n\\begin{document}x\\end{document}`, expected: 'LATEX_PACKAGE_NOT_ALLOWED' },
  { name: 'boucle infinie (non détectable avant exécution)', code: doc('\\def\\x{\\x}\\x'), expected: ['LATEX_RESOURCE_LIMIT', 'LATEX_TIMEOUT'] },
  { name: 'pages à l’infini', code: doc('\\loop x\\newpage\\iftrue\\repeat'), expected: ['LATEX_RESOURCE_LIMIT', 'LATEX_TIMEOUT'] },
];
for (const item of refused) {
  const r = await viaApi({ code: item.code });
  const expected = [].concat(item.expected);
  const body = JSON.stringify(r.json ?? {});
  const leak = findLeak(body);
  report.compilations.push({ couche: 'API', name: item.name, status: r.status, ms: r.ms, reponse: r.json, leak });
  const lineOk = item.line ? r.json?.details?.some(d => d.line === item.line) : true;
  check(`${item.name} → ${r.json?.code ?? r.status}`, expected.includes(r.json?.code) && !leak && lineOk,
    `${r.ms} ms · « ${r.json?.error ?? ''} »${r.json?.details?.length ? ` · ${r.json.details.map(d => `l.${d.line ?? '?'} ${d.message}`).join(' | ')}` : ''}`);
}

section('Limites de taille, concurrence et quotas');
const big = await viaApi({ code: `${doc('x')}%${'x'.repeat(200 * 1024)}` });
check('source > 200 Ko → 413', big.status === 413 && big.json?.code === 'LATEX_TOO_LARGE');
const png = await viaApi({ code: doc('x'), photo: `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]).toString('base64')}` });
check('photo PNG → 400', png.status === 400 && png.json?.code === 'LATEX_INVALID_PHOTO');
const fake = await viaApi({ code: doc('x'), photo: `data:image/jpeg;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}` });
check('photo non JPEG déclarée JPEG → 400', fake.status === 400 && fake.json?.code === 'LATEX_INVALID_PHOTO');
const heavy = buildFinalLatex(TEMPLATES.overleafClassic.code, false, 3.2);
const burst = await Promise.all(Array.from({ length: 6 }, () => viaApi({ code: `${heavy}\n% ${crypto.randomUUID()}` })));
const statuses = burst.map(r => r.status);
check('6 compilations simultanées : 2 au plus en parallèle, les autres « occupé » (503)',
  statuses.filter(s => s === 200).length >= 1 && statuses.every(s => s === 200 || (s === 503)) && statuses.includes(503), statuses.join(', '));
const same = fakeIp();
const pair = await Promise.all([viaApi({ code: heavy }, same), viaApi({ code: heavy }, same)]);
check('même visiteur, deux compilations simultanées → la seconde refusée (429)', pair.map(r => r.status).sort().join(',') === '200,429', pair.map(r => r.status).join(', '));

section('Après les essais');
const [after] = inContainer('tests/latex/runtime-probe.mjs');
check('aucun processus TeX restant', after.processes <= baseline, `${after.processes} processus (référence ${baseline})`);
check('/work vide : chaque espace de compilation supprimé', after.workEntries.length === 0, after.workEntries.join(', '));

fs.writeFileSync(path.join(OUT, 'rapport.json'), JSON.stringify(report, null, 2));
console.log(`\nPDF et rapport : ${path.relative(ROOT, OUT)}`);
console.log(failures ? `${failures} contrôle(s) en échec` : 'Tous les contrôles sont réussis. Aucun appel à un fournisseur IA.');
process.exitCode = failures ? 1 : 0;
