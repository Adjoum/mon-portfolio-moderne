// Configuration commune des tests de blog-api
//  - aucune requête réseau sortante : seuls 127.0.0.1 / localhost sont autorisés
//  - valeurs « canari » factices pour les secrets : aucune réponse API ne doit les contenir
//  - Pinecone remplacé par un index en mémoire

import { vi, beforeEach } from 'vitest';
import { SECRET_CANARIES } from './helpers/canaries';
import { resetFakeIndex } from './helpers/fakePinecone';

Object.assign(process.env, SECRET_CANARIES, {
  NODE_ENV:                       'test',
  PINECONE_INDEX:                 'test-index',
  ADMIN_RATE_LIMIT_MAX:           process.env.ADMIN_RATE_LIMIT_MAX ?? '10000',
  KNOWLEDGE_WRITE_RATE_LIMIT_MAX: process.env.KNOWLEDGE_WRITE_RATE_LIMIT_MAX ?? '10000',
});

// ── Réseau : interdit hors boucle locale ──────────────────────
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error(`Appel réseau sortant interdit pendant les tests : ${url.hostname}`);
  }
  return realFetch(input, init);
}) as typeof fetch;

vi.mock('@pinecone-database/pinecone', async () => {
  const { fakeIndex } = await import('./helpers/fakePinecone');
  return {
    Pinecone: class {
      index() { return fakeIndex; }
    },
  };
});

// Logs applicatifs silencieux ; console.log reste espionné pour lire les lignes [AUDIT]
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  resetFakeIndex();
  vi.mocked(console.log).mockClear();
});
