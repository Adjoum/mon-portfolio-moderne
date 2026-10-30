// blog-api/src/ai/features/validate.ts
// Validation stricte des entrées des fonctionnalités IA (sans dépendance).
// Toute clé inconnue est refusée : le client ne peut glisser ni modèle, ni rôle, ni paramètre.

export class InputError extends Error {
  constructor(public field: string, public reason: string) {
    super(`${field}: ${reason}`);
  }
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Objet simple dont toutes les clés appartiennent à `allowed` */
export function strictObject(raw: unknown, field: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new InputError(field, 'objet attendu');
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_KEYS.has(key) || !allowed.includes(key)) throw new InputError(`${field}.${key}`, 'champ non autorisé');
  }
  return raw as Record<string, unknown>;
}

/** Texte : chaîne, caractères NUL retirés, longueur bornée */
export function text(
  obj: Record<string, unknown>,
  key: string,
  opts: { max: number; required?: boolean },
): string {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (opts.required) throw new InputError(key, 'requis');
    return '';
  }
  if (typeof value !== 'string') throw new InputError(key, 'texte attendu');
  const cleaned = value.replace(/\u0000/g, '');
  if (opts.required && !cleaned.trim()) throw new InputError(key, 'requis');
  if (cleaned.length > opts.max) throw new InputError(key, `trop long (${opts.max} caractères maximum)`);
  return cleaned;
}

export function oneOf<T extends string>(obj: Record<string, unknown>, key: string, values: readonly T[], fallback: T): T {
  const value = obj[key];
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !values.includes(value as T)) throw new InputError(key, `valeur attendue : ${values.join(' | ')}`);
  return value as T;
}

const IMAGE_SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png':  b => b.length > 8 && b.readUInt32BE(0) === 0x89504e47,
  'image/gif':  b => b.length > 6 && b.subarray(0, 4).toString('latin1') === 'GIF8',
  'image/webp': b => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** Image en data URL base64 : type autorisé, taille bornée, signature binaire conforme */
export function imageDataUrl(obj: Record<string, unknown>, key: string, maxBytes: number): string {
  const value = obj[key];
  if (typeof value !== 'string') throw new InputError(key, 'image requise');
  const match = /^data:(image\/(?:jpeg|jpg|png|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new InputError(key, 'image JPEG, PNG, GIF ou WebP en base64 attendue');

  const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const approxBytes = Math.floor((match[2].length * 3) / 4);
  if (approxBytes > maxBytes) throw new InputError(key, `image trop volumineuse (${Math.round(maxBytes / 1024 / 1024)} Mo maximum)`);

  const head = Buffer.from(match[2].slice(0, 64), 'base64');
  if (!IMAGE_SIGNATURES[mime](head)) throw new InputError(key, 'contenu non conforme au type d’image annoncé');
  return `data:${mime};base64,${match[2]}`;
}
