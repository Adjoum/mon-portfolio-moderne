// tests/latex/pdf-inspect.mjs
// Analyse d'un PDF produit par latex-runner, sur l'hôte :
//   - texte et nombre de pages (pdfjs-dist, déjà dépendance du frontend) ;
//   - tous les flux décompressés, pour chercher une fuite qui ne serait pas visible dans le texte
//     (fichier embarqué par \pdfobj, contenu d'un fichier du conteneur, variable d'environnement).

import zlib from 'node:zlib';

/** Contenu brut + flux FlateDecode décompressés, en latin1 */
export function pdfBytesText(pdf) {
  const raw = Buffer.from(pdf);
  const parts = [raw.toString('latin1')];
  const latin = parts[0];
  const streamRe = /stream\r?\n/g;
  let match;
  while ((match = streamRe.exec(latin))) {
    const start = match.index + match[0].length;
    const end = latin.indexOf('endstream', start);
    if (end === -1) break;
    try { parts.push(zlib.inflateSync(raw.subarray(start, end)).toString('latin1')); } catch { /* flux non compressé ou image */ }
    streamRe.lastIndex = end;
  }
  return parts.join('\n');
}

/** Texte de chaque page */
export async function pdfText(pdf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map(item => item.str).join(' ').replace(/\s+/g, ' '));
  }
  await task.destroy();
  return pages;
}

/** Marqueurs qui ne doivent jamais apparaître dans un PDF ni dans une erreur */
export const LEAK_MARKERS = [
  /root:x:0:0/,                       // /etc/passwd
  /726f6f743a/i,                      // « root: » en hexadécimal (\pdffiledump)
  /latex:x:10001/,                    // utilisateur du conteneur
  /NODE_VERSION=|HOSTNAME=|YARN_VERSION=|PATH=\/usr/,  // /proc/*/environ
  /\/usr\/share\/texlive|\/var\/lib\/texmf|\/work\/job-/,
  /TeX Live 20\d\d|pdfTeX, Version/,
  /CANARY_/,
];

export function findLeak(text) {
  return LEAK_MARKERS.find(re => re.test(text))?.source ?? null;
}
