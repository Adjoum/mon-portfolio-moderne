// tests/latex/sandbox-probe.mjs
// Sonde exécutée DANS le conteneur latex-runner (docker exec -i … node --input-type=module -),
// jamais copiée dans l'image. Elle appelle compile() directement, SANS la politique lexicale,
// pour vérifier que TeX et le conteneur résistent seuls aux documents malveillants.
// Sortie : une ligne JSON par cas, le PDF éventuel en base64 (analysé ensuite sur l'hôte).

import fs from 'node:fs';
import { compile, LIMITS } from '/app/src/compile.mjs';

const doc = body => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

const CASES = {
  // Lecture de fichiers hors du dossier de travail
  'input-absolu':        doc('\\input{/etc/passwd}'),
  'input-parent':        doc('\\input{../../etc/passwd}'),
  'input-environ':       doc('\\input{/proc/self/environ}'),
  'openin-read':         doc('\\newread\\r\\openin\\r=/etc/passwd \\ifeof\\r FERME\\else\\read\\r to\\x OUVERT:\\x\\fi'),
  'verbatiminput':       `\\documentclass{article}\\usepackage{verbatim}\\begin{document}\\verbatiminput{/etc/passwd}\\end{document}`,
  'pdffiledump':         doc('DUMP[\\pdffiledump length 64 {/etc/passwd}]'),
  'pdfmdfivesum':        doc('MD5[\\pdfmdfivesum file {/etc/passwd}]'),
  'pdffilesize':         doc('SIZE[\\pdffilesize{/etc/passwd}]'),
  'pdfobj-file':         doc('\\immediate\\pdfobj stream file {/etc/passwd}\\pdfcatalog{/X \\the\\pdflastobj\\space 0 R}x'),
  'pdfximage':           doc('\\pdfximage{/etc/hostname}\\pdfrefximage\\pdflastximage'),
  // Commandes externes
  'write18':             doc('\\immediate\\write18{echo pwned > /work/pwned.txt}x'),
  'input-pipe':          doc('\\input|"env" x'),
  // Écriture hors du dossier de travail
  'openout-parent':      doc('\\newwrite\\w\\immediate\\openout\\w=../evade.tex\\immediate\\write\\w{x}\\immediate\\closeout\\w x'),
  'openout-absolu':      doc('\\newwrite\\w\\immediate\\openout\\w=/tmp/evade.tex\\immediate\\write\\w{x}\\immediate\\closeout\\w x'),
  'openout-cache':       doc('\\newwrite\\w\\immediate\\openout\\w=.evade\\immediate\\write\\w{x}\\immediate\\closeout\\w x'),
  // Épuisement des ressources
  'boucle-infinie':      doc('\\def\\x{\\x}\\x'),
  'pile-infinie':        doc('\\def\\x{a\\x}\\x'),
  'memoire':             doc('\\def\\x#1{\\x{#1#1}}\\x{a}'),
  'pages-infinies':      doc('\\loop x\\newpage\\iftrue\\repeat'),
};

const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(CASES);
for (const name of only) {
  const started = Date.now();
  let result;
  try {
    const { pdf, passes } = await compile({ tex: CASES[name] });
    result = { name, outcome: 'pdf', passes, pdf: pdf.toString('base64') };
  } catch (err) {
    result = { name, outcome: err.code ?? 'exception', errors: err.errors ?? [] };
  }
  result.ms = Date.now() - started;
  // Fichiers laissés hors des dossiers de compilation (supprimés après chaque cas)
  result.stray = [
    ...fs.readdirSync('/work').filter(f => !f.startsWith('job-')).map(f => `/work/${f}`),
    ...fs.readdirSync('/tmp').map(f => `/tmp/${f}`),
  ];
  result.processes = fs.readdirSync('/proc').filter(p => /^\d+$/.test(p)).length;
  console.log(JSON.stringify(result));
}
console.log(JSON.stringify({ name: '__limits', limits: LIMITS }));
