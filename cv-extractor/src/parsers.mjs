// cv-extractor/src/parsers.mjs
// Extraction du texte d'un CV importé. Aucun contenu actif n'est exécuté :
//   - PDF  : pdf.js, couche texte uniquement (aucun script, aucune police système, aucun rendu) ;
//   - DOCX : contrôle de l'archive (macros, taille décompressée) puis texte brut (mammoth) ;
//   - TXT  : décodage UTF-8 ou Windows-1252 ;
//   - RTF  : lecteur maison, mots de contrôle de texte seulement.
// Exécuté dans un thread dédié (extract.mjs) : mémoire bornée, arrêt forcé au délai.

import JSZip from 'jszip';
import { decodeText } from './text.mjs';
import { rtfToText } from './rtf.mjs';

export const MAX_PDF_PAGES = 10;
const MAX_DOCX_UNCOMPRESSED = 40 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 2000;
/** En dessous, la page est probablement une image (PDF scanné) */
const MIN_CHARS_PER_PAGE = 40;

export class ExtractError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function detectKind(buffer) {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'docx';
  if (buffer.subarray(0, 5).toString('latin1') === '{\\rtf') return 'rtf';
  // Texte : aucun octet nul dans le premier kilo-octet
  if (!buffer.subarray(0, 1024).includes(0)) return 'txt';
  return null;
}

async function pdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    disableFontFace: true,
    enableXfa: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    const texts = [];
    for (let n = 1; n <= pages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      let line = '';
      const lines = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) { lines.push(line); line = ''; } else if (item.str && !item.str.endsWith(' ')) line += ' ';
      }
      if (line) lines.push(line);
      texts.push(lines.join('\n'));
    }
    const text = texts.join('\n\n');
    const needsOcr = text.replace(/\s/g, '').length < MIN_CHARS_PER_PAGE * pages;
    return { text, pages: doc.numPages, needsOcr };
  } catch (err) {
    if (err?.name === 'PasswordException') throw new ExtractError('EXTRACT_PROTECTED');
    throw new ExtractError('EXTRACT_INVALID_FILE');
  } finally {
    await task.destroy().catch(() => {});
  }
}

async function docxText(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: false });
  } catch {
    throw new ExtractError('EXTRACT_INVALID_FILE');
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_DOCX_ENTRIES) throw new ExtractError('EXTRACT_TOO_COMPLEX');
  // Tailles décompressées déclarées : une « bombe » de compression est refusée avant toute lecture
  const declared = entries.reduce((n, e) => n + (e._data?.uncompressedSize ?? 0), 0);
  if (declared > MAX_DOCX_UNCOMPRESSED) throw new ExtractError('EXTRACT_TOO_COMPLEX');
  const names = entries.map(e => e.name.toLowerCase());
  if (!names.includes('word/document.xml')) throw new ExtractError('EXTRACT_INVALID_FILE');
  // Documents à macros (.docm renommé) : refusés, même si mammoth ne les exécuterait pas
  if (names.some(n => n.endsWith('vbaproject.bin') || n.endsWith('vbadata.xml') || n.includes('activex'))) throw new ExtractError('EXTRACT_ACTIVE_CONTENT');
  const mammoth = await import('mammoth');
  const result = await (mammoth.default ?? mammoth).extractRawText({ buffer });
  return { text: result.value, pages: null, needsOcr: false };
}

/** @param {'pdf'|'docx'|'txt'|'rtf'} kind */
export async function extractText(buffer, kind) {
  const detected = detectKind(buffer);
  if (detected !== kind) throw new ExtractError('EXTRACT_TYPE_MISMATCH');
  if (kind === 'pdf') return pdfText(buffer);
  if (kind === 'docx') return docxText(buffer);
  const raw = decodeText(buffer);
  if (kind === 'rtf') {
    try {
      return { text: rtfToText(raw), pages: null, needsOcr: false };
    } catch {
      throw new ExtractError('EXTRACT_INVALID_FILE');
    }
  }
  return { text: raw, pages: null, needsOcr: false };
}
