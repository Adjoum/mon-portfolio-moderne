// Connexion du rôle ai_backend : TLS vérifié hors boucle locale, paramètres ssl de l'URL ignorés.

import { describe, it, expect, afterEach } from 'vitest';
import { connectionOptions, createAiStore } from '../src/ai/services/store';

afterEach(() => {
  delete process.env.AI_DATABASE_URL;
  delete process.env.AI_DATABASE_CA_FILE;
});

describe('connexion à Supabase', () => {
  it('pooler distant : TLS obligatoire et vérifié', () => {
    const { ssl, connectionString } = connectionOptions('postgresql://ai_backend.ref:mdp@aws-0-eu.pooler.supabase.com:5432/postgres');
    expect(ssl).toEqual({ rejectUnauthorized: true });
    expect(connectionString).toContain('pooler.supabase.com');
  });

  it('sslmode=disable ou no-verify dans l’URL sans effet', () => {
    for (const mode of ['disable', 'no-verify', 'prefer']) {
      const { ssl, connectionString } = connectionOptions(`postgresql://u:p@db.example.com/postgres?sslmode=${mode}&application_name=api`);
      expect(ssl?.rejectUnauthorized).toBe(true);
      expect(connectionString).not.toMatch(/ssl/i);
      expect(connectionString).toContain('application_name=api');
    }
  });

  it('boucle locale : sans TLS (banc de test)', () => {
    expect(connectionOptions('postgresql://u:p@127.0.0.1:58334/postgres').ssl).toBeUndefined();
  });

  it('certificat du projet utilisé lorsqu’il est fourni', () => {
    process.env.AI_DATABASE_CA_FILE = __filename;
    expect(connectionOptions('postgresql://u:p@db.example.com/postgres').ssl?.ca).toContain('certificat du projet');
  });

  it('sans AI_DATABASE_URL : rien n’est exécutable, aucune réservation possible', async () => {
    const store = createAiStore();
    expect(store.configured).toBe(false);
    expect(await store.config()).toBeNull();
    expect(await store.secret('openai')).toBeNull();
    expect(await store.reserve('cv.generate', 'x', 1)).toMatchObject({ ok: false });
  });
});
