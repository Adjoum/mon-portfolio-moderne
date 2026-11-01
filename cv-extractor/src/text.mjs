// cv-extractor/src/text.mjs
// Texte extrait d'un document importé : caractères de contrôle retirés, espaces normalisés,
// longueur bornée. Aucun contenu n'est exécuté ni interprété : seulement du texte.

export const MAX_TEXT_CHARS = 20_000;

// Contrôle, largeur nulle, séparateurs de ligne Unicode, forçage de direction (texte inversé), BOM
const INVISIBLE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'g');

export function cleanText(raw) {
  const text = String(raw)
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, '')
    .replace(/[ \t\xA0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > MAX_TEXT_CHARS
    ? { text: text.slice(0, MAX_TEXT_CHARS), truncated: true }
    : { text, truncated: false };
}

/** Texte brut : UTF-8 strict, sinon Windows-1252 (fichiers .txt enregistrés sous Windows) */
export function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}
