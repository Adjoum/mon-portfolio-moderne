// « Vue » des faux fournisseurs : décode réellement un PNG (signature, CRC, zlib, filtres) puis lit
// les caractères matriciels de la sonde vision. Écrit indépendamment de probeImage.ts : si l'API
// envoie une image corrompue (comme le carré 8 × 8 d'origine, au CRC faux), la lecture échoue
// et le faux fournisseur répond comme OpenAI, par un refus HTTP 400.

import zlib from 'node:zlib';

// Police de référence 5 × 7 : la table de probeImage.ts, aplatie ligne à ligne
const FONT = {
  A: '.###.#...##...#######...##...##...#',
  C: '.###.#...##....#....#....#...#.###.',
  E: '######....#....####.#....#....#####',
  H: '#...##...##...#######...##...##...#',
  K: '#...##..#.#.#..##...#.#..#..#.#...#',
  L: '#....#....#....#....#....#....#####',
  P: '####.#...##...#####.#....#....#....',
  R: '####.#...##...#####.#.#..#..#.#...#',
  T: '#####..#....#....#....#....#....#..',
  X: '#...##...#.#.#...#...#.#.#...##...#',
  3: '####.....#....#.###.....#....#####.',
  4: '...#...##..#.#.#..#.#####...#....#.',
  7: '#####....#...#...#...#....#....#...',
  9: '.###.#...##...#.####....#...#..##..',
};

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    let c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Décodeur PNG minimal (8 bits, niveaux de gris, RVB ou RVBA, sans entrelacement) ; lève une erreur si invalide */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('signature');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (crc32(buf.subarray(offset + 4, offset + 8 + length)) !== buf.readUInt32BE(offset + 8 + length)) throw new Error(`CRC ${type}`);
    if (type === 'IHDR') header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  if (!header || header.depth !== 8 || header.interlace !== 0) throw new Error('format');
  const channels = { 0: 1, 2: 3, 6: 4 }[header.color];
  if (!channels) throw new Error('couleur');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = header.width * channels;
  const pixels = Buffer.alloc(header.height * stride);
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const paeth = () => {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      };
      const predictor = [0, left, up, (left + up) >> 1, paeth()][filter];
      if (predictor === undefined) throw new Error('filtre');
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  const rgb = (x, y) => {
    const i = y * stride + x * channels;
    return channels === 1 ? [pixels[i], pixels[i], pixels[i]] : [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
  return { width: header.width, height: header.height, rgb };
}

/** Lit les caractères sombres (encre) de l'image ; '' si rien de lisible */
export function readGlyphs({ width, height, rgb }) {
  const ink = (x, y) => { const [r, g, b] = rgb(x, y); return r < 100 && g < 100 && b < 100; };
  const columns = Array.from({ length: width }, (_, x) => { for (let y = 0; y < height; y++) if (ink(x, y)) return true; return false; });
  const spans = [];
  for (let x = 0; x < width; x++) {
    if (columns[x] && (x === 0 || !columns[x - 1])) spans.push([x, x]);
    if (columns[x]) spans[spans.length - 1][1] = x;
  }
  let text = '';
  for (const [x0, x1] of spans) {
    let y0 = height, y1 = -1;
    for (let x = x0; x <= x1; x++) for (let y = 0; y < height; y++) if (ink(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cw = (x1 - x0 + 1) / 5, ch = (y1 - y0 + 1) / 7;
    let bits = '';
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      bits += ink(Math.floor(x0 + (col + 0.5) * cw), Math.floor(y0 + (row + 0.5) * ch)) ? '#' : '.';
    }
    const match = Object.entries(FONT).find(([, pattern]) => pattern === bits);
    text += match ? match[0] : '?';
  }
  return text;
}

/** Première image d'une requête, quel que soit le format du fournisseur : base64 ou null */
export function imageOf(body) {
  const found = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === 'image_url' && node.image_url?.url) found.push(node.image_url.url);
    else if (node.type === 'input_image' && typeof node.image_url === 'string') found.push(node.image_url);
    else if (node.type === 'image' && node.source?.data) found.push(node.source.data);
    else if (node.inlineData?.data) found.push(node.inlineData.data);
    else Object.values(node).forEach(visit);
  };
  visit(body);
  if (!found.length) return null;
  return found[0].replace(/^data:[^;,]+;base64,/, '');
}

/** Réponse d'un modèle multimodal simulé : lit l'image, sinon répond au texte ; null si l'image est illisible */
export function visionAnswer(body) {
  const image = imageOf(body);
  if (image === null) return JSON.stringify(body).includes('JSON') ? '{"ok":true}' : 'OK';
  try {
    return readGlyphs(decodePng(Buffer.from(image, 'base64'))) || 'Je ne vois aucun texte.';
  } catch {
    return null;
  }
}
