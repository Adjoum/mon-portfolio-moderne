// blog-api/src/ai/services/probeImage.ts
// Image synthétique de la sonde vision (P1) : un carré blanc encadré contenant un code aléatoire
// de trois caractères, dessinés en noir avec une police matricielle 5 × 7. Aucune donnée
// personnelle, aucun fichier : le PNG est produit en mémoire à chaque sonde.
//
// Le code n'apparaît jamais dans le texte envoyé au modèle : une bonne réponse prouve que
// l'image a réellement été lue (probabilité d'une réponse au hasard : 1 sur 2 184).

import crypto from 'crypto';
import zlib from 'zlib';

/** Caractères sans ambiguïté visuelle (ni O/0, ni I/1, ni E/F, ni S/5, ni B/8) */
const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
};

export const PROBE_ALPHABET = Object.keys(GLYPHS).join('');
export const PROBE_CODE_LENGTH = 3;
export const PROBE_IMAGE_SIZE = 256;

const SCALE = 10;
const GAP = 20;
const BORDER = 8;
const INK = [17, 24, 39];
const FRAME = [37, 99, 235];
const PAPER = [255, 255, 255];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** PNG RVB 8 bits, sans entrelacement : signature, IHDR, IDAT (zlib), IEND */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => number[]): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filtre « None »
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;   // profondeur
  header[9] = 2;   // RVB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Code de trois caractères distincts, tiré au hasard à chaque sonde */
export function randomProbeCode(): string {
  const letters = [...PROBE_ALPHABET];
  let code = '';
  while (code.length < PROBE_CODE_LENGTH) {
    const next = letters[crypto.randomInt(letters.length)];
    if (!code.includes(next)) code += next;
  }
  return code;
}

export function renderProbeImage(code: string): string {
  for (const char of code) if (!GLYPHS[char]) throw new Error('caractère hors alphabet');
  const size = PROBE_IMAGE_SIZE;
  const textWidth = code.length * 5 * SCALE + (code.length - 1) * GAP;
  const left = Math.floor((size - textWidth) / 2);
  const top = Math.floor((size - 7 * SCALE) / 2);

  const png = encodePng(size, size, (x, y) => {
    if (x < BORDER || y < BORDER || x >= size - BORDER || y >= size - BORDER) return FRAME;
    const dy = y - top;
    if (dy < 0 || dy >= 7 * SCALE) return PAPER;
    const dx = x - left;
    if (dx < 0 || dx >= textWidth) return PAPER;
    const cell = Math.floor(dx / (5 * SCALE + GAP));
    const inCell = dx - cell * (5 * SCALE + GAP);
    if (inCell >= 5 * SCALE) return PAPER;
    const glyph = GLYPHS[code[cell]];
    return glyph[Math.floor(dy / SCALE)][Math.floor(inCell / SCALE)] === '#' ? INK : PAPER;
  });
  return `data:image/png;base64,${png.toString('base64')}`;
}

/**
 * La réponse contient-elle exactement le code ? Accepte « K7R », « Le code est K7R. », « K 7 R »,
 * mais pas un code noyé dans un mot plus long (« ICANNOTSEE » ne valide pas « CAN »).
 */
export function answerMatchesCode(answer: string, code: string): boolean {
  const upper = answer.toUpperCase();
  const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
  if (tokens.includes(code)) return true;
  if (tokens.length && tokens.every(t => t.length === 1) && tokens.join('') === code) return true;
  // Caractères isolés consécutifs dans une phrase : « le code : K 7 R »
  const singles = upper.match(/(?:^|[^A-Z0-9])([A-Z0-9])(?=$|[^A-Z0-9])/g)?.map(s => s.slice(-1)).join('') ?? '';
  return singles.includes(code);
}

/** Réponse renvoyée au dashboard : courte, caractères simples uniquement */
export const sanitizeAnswer = (answer: string) => answer.replace(/[^\p{L}\p{N} .,:;!?'’()-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
