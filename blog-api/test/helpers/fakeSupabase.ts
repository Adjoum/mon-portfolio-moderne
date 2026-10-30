// Faux projet Supabase local (127.0.0.1, port éphémère) pour les tests :
//  - GET  /auth/v1/.well-known/jwks.json   clés publiques ES256 du projet
//  - POST /rest/v1/rpc/is_portfolio_admin  revalide la signature du jeton comme PostgREST
//                                          (401 si invalide) puis teste l'appartenance admin
// Les jetons sont signés avec des clés générées à chaque exécution : aucun secret réel.

import http from 'http';
import crypto from 'crypto';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';

export const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
export const USER_ID  = '22222222-2222-4222-8222-222222222222';
export const ANON_KEY = 'test-anon-key-public';

export interface TokenOptions {
  sub?: string;
  aal?: 'aal1' | 'aal2';
  role?: string;
  aud?: string;
  iss?: string;
  expiresInSec?: number;
  isAnonymous?: boolean;
  /** clé de signature : celle du projet par défaut, ou une clé étrangère */
  signWith?: 'project' | 'foreign';
  kid?: string;
}

export interface FakeSupabase {
  url:     string;
  issuer:  string;
  admins:  Set<string>;
  calls:   { jwks: number; rpc: number };
  /** 'ok' | 'down' (HTTP 500) | 'missing_function' (HTTP 404) */
  mode:    'ok' | 'down' | 'missing_function';
  /** secret HS256 du projet (anciens projets Supabase) ; null = clés asymétriques seulement */
  hs256Secret: string | null;
  token(opts?: TokenOptions): string;
  hs256Token(secret: string, opts?: TokenOptions): string;
  close(): Promise<void>;
}

export async function startFakeSupabase(): Promise<FakeSupabase> {
  const project = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const foreign = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const KID = 'test-project-key';

  const state = {
    admins: new Set<string>([ADMIN_ID]),
    calls:  { jwks: 0, rpc: 0 },
    mode:   'ok' as FakeSupabase['mode'],
    hs256Secret: null as string | null,
    url:    '',
  };

  const server = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && req.url === '/auth/v1/.well-known/jwks.json') {
      state.calls.jwks++;
      const jwk = project.publicKey.export({ format: 'jwk' });
      return send(200, { keys: [{ ...jwk, kid: KID, alg: 'ES256', use: 'sig' }] });
    }

    if (req.method === 'POST' && req.url === '/rest/v1/rpc/is_portfolio_admin') {
      state.calls.rpc++;
      if (state.mode === 'down') return send(500, { message: 'internal' });
      if (state.mode === 'missing_function') return send(404, { code: 'PGRST202' });
      if (req.headers.apikey !== ANON_KEY) return send(401, { message: 'No API key' });

      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      try {
        const isHs = jwt.decode(token, { complete: true })?.header.alg === 'HS256';
        if (isHs && !state.hs256Secret) throw new Error('HS256 non accepté');
        const claims = jwt.verify(token, isHs ? state.hs256Secret! : project.publicKey, {
          algorithms: [isHs ? 'HS256' : 'ES256'],
          issuer:     `${state.url}/auth/v1`,
          audience:   'authenticated',
        }) as { sub: string };
        return send(200, state.admins.has(claims.sub));
      } catch {
        return send(401, { code: 'PGRST301', message: 'JWT invalid' });
      }
    }

    send(404, { message: 'not found' });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  state.url = `http://127.0.0.1:${port}`;

  const claimsFor = (opts: TokenOptions) => ({
    sub:          opts.sub ?? ADMIN_ID,
    role:         opts.role ?? 'authenticated',
    aal:          opts.aal ?? 'aal1',
    is_anonymous: opts.isAnonymous ?? false,
    session_id:   crypto.randomUUID(),
  });

  const fake: FakeSupabase = {
    get url() { return state.url; },
    get issuer() { return `${state.url}/auth/v1`; },
    admins: state.admins,
    calls:  state.calls,
    get mode() { return state.mode; },
    set mode(m) { state.mode = m; },
    get hs256Secret() { return state.hs256Secret; },
    set hs256Secret(v) { state.hs256Secret = v; },
    token(opts = {}) {
      const key = opts.signWith === 'foreign' ? foreign.privateKey : project.privateKey;
      return jwt.sign(claimsFor(opts), key, {
        algorithm: 'ES256',
        keyid:     opts.kid ?? KID,
        issuer:    opts.iss ?? `${state.url}/auth/v1`,
        audience:  opts.aud ?? 'authenticated',
        expiresIn: opts.expiresInSec ?? 3600,
      });
    },
    hs256Token(secret, opts = {}) {
      return jwt.sign(claimsFor(opts), secret, {
        algorithm: 'HS256',
        issuer:    opts.iss ?? `${state.url}/auth/v1`,
        audience:  opts.aud ?? 'authenticated',
        expiresIn: opts.expiresInSec ?? 3600,
      });
    },
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
  return fake;
}

/** Jeton sans signature (alg "none") construit à la main */
export function unsignedToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}
