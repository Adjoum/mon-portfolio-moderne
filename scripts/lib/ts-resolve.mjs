// Permet aux scripts Node d'importer les modules TypeScript du frontend (src/**/*.ts), écrits pour
// Vite avec des imports sans extension. Node retire lui-même les types ; ce crochet ajoute « .ts ».
//   import { registerTsResolve } from './lib/ts-resolve.mjs'; registerTsResolve();
import { register } from 'node:module';

const HOOK = `
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!/^\\.{1,2}\\//.test(specifier) || /\\.[cm]?[jt]sx?$/.test(specifier)) throw err;
    for (const suffix of ['.ts', '/index.ts']) {
      try { return await next(specifier + suffix, context); } catch { /* suivant */ }
    }
    throw err;
  }
}`;

export function registerTsResolve() {
  register(`data:text/javascript,${encodeURIComponent(HOOK)}`);
}
