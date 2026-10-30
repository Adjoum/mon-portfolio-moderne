// blog-api/src/ai/providers/modelId.ts
// Identifiant de modèle en saisie libre : seul le format est contrôlé.
// Il peut finir dans une URL (Gemini) : ni segment « .. », ni double barre, ni barre finale.

const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export function isValidModelId(value: unknown): value is string {
  if (typeof value !== 'string' || !MODEL_ID_RE.test(value)) return false;
  return !value.includes('//') && !value.endsWith('/') && !value.split('/').includes('..');
}
