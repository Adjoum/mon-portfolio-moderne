// Faux projet Supabase local (127.0.0.1, port éphémère) pour les tests :
//  - GET  /auth/v1/.well-known/jwks.json   clés publiques ES256 du projet
//  - POST /rest/v1/rpc/is_portfolio_admin  revalide la signature du jeton comme PostgREST
//                                          (401 si invalide) puis teste l'appartenance admin
//  - POST /rest/v1/rpc/admin_session_status état de la session (claim session_id) : la logique
//                                          réelle est prouvée par supabase/tests/session
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
  /** claim session_id (aléatoire par défaut) */
  sessionId?: string;
}

/** États de session simulés (admin_session_status) ; une session inconnue est active par défaut */
export interface FakeSessions {
  states: Map<string, { active: boolean; remaining_seconds: number; reason: string | null }>;
  /** 'ok' | 'down' (HTTP 500) | 'missing_function' (HTTP 404, migration absente) */
  mode: 'ok' | 'down' | 'missing_function';
  calls: number;
  expire(sessionId: string, reason?: 'idle_timeout' | 'logout'): void;
  reset(): void;
}

export interface FakeCvVersion {
  id: string;
  bucket: string;
  storage_path: string;
  sha256: string;
  size_bytes: number;
  activated_at: string;
}

/** Fonctions ai_admin_* simulées : la logique réelle est prouvée par supabase/tests/ai et la pile locale */
export interface FakeAiBackend {
  calls: { fn: string; args: Record<string, unknown>; token: string }[];
  /** Réponse par fonction ; absente : succès vide */
  responses: Record<string, { status: number; body: unknown }>;
  reset(): void;
}

/** Simulation de Storage et des fonctions SQL du CV, avec pannes injectables */
export interface FakeCvBackend {
  active: FakeCvVersion | null;
  versions: Map<string, FakeCvVersion>;
  objects: Map<string, number>;
  uploadedPaths: string[];
  failUpload: boolean;
  failDelete: boolean;
  /** 'down' : erreur 500 ; 'conflict' : 409 ; 'not_migrated' : fonction absente */
  publishFailure: null | 'down' | 'conflict' | 'not_migrated';
  reset(): void;
}

export interface FakeSupabase {
  url:     string;
  issuer:  string;
  admins:  Set<string>;
  calls:   { jwks: number; rpc: number };
  cv:      FakeCvBackend;
  /** 'ok' | 'down' (HTTP 500) | 'missing_function' (HTTP 404) */
  mode:    'ok' | 'down' | 'missing_function';
  /** secret HS256 du projet (anciens projets Supabase) ; null = clés asymétriques seulement */
  hs256Secret: string | null;
  token(opts?: TokenOptions): string;
  ai: FakeAiBackend;
  sessions: FakeSessions;
  hs256Token(secret: string, opts?: TokenOptions): string;
  close(): Promise<void>;
}

export async function startFakeSupabase(): Promise<FakeSupabase> {
  const ai: FakeAiBackend = {
    calls: [],
    responses: {},
    reset() { ai.calls.length = 0; ai.responses = {}; },
  };
  const sessions: FakeSessions = {
    states: new Map(),
    mode: 'ok',
    calls: 0,
    expire(sessionId, reason = 'idle_timeout') { sessions.states.set(sessionId, { active: false, remaining_seconds: 0, reason }); },
    reset() { sessions.states.clear(); sessions.mode = 'ok'; sessions.calls = 0; },
  };
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

  const cv: FakeCvBackend = {
    active: null, versions: new Map(), objects: new Map(), uploadedPaths: [],
    failUpload: false, failDelete: false, publishFailure: null,
    reset() {
      cv.active = null; cv.versions.clear(); cv.objects.clear(); cv.uploadedPaths.length = 0;
      cv.failUpload = false; cv.failDelete = false; cv.publishFailure = null;
    },
  };

  const server = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const object = /^\/storage\/v1\/object\/portfolio-public-documents\/(.+)$/.exec(req.url ?? '');
    if (object) {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const key = object[1];
        if (req.method === 'POST') {
          if (cv.failUpload) return send(500, { message: 'storage down' });
          if (cv.objects.has(key)) return send(409, { message: 'Duplicate' });
          cv.objects.set(key, Buffer.concat(chunks).length);
          cv.uploadedPaths.push(key);
          return send(200, { Key: key });
        }
        if (req.method === 'DELETE') {
          if (cv.failDelete) return send(500, { message: 'delete failed' });
          cv.objects.delete(key);
          return send(200, { message: 'ok' });
        }
        send(405, {});
      });
      return;
    }

    const aiRpc = /^\/rest\/v1\/rpc\/(ai_admin_[a-z_]+)$/.exec(req.url ?? '');
    if (aiRpc && req.method === 'POST') {
      let raw = '';
      req.on('data', chunk => { raw += chunk; });
      req.on('end', () => {
        ai.calls.push({ fn: aiRpc[1], args: JSON.parse(raw || '{}'), token: (req.headers.authorization || '').replace(/^Bearer /, '') });
        const reply = ai.responses[aiRpc[1]] ?? { status: 200, body: null };
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      });
      return;
    }

    const cvRpc = /^\/rest\/v1\/rpc\/(cv_active|cv_publish_version|cv_restore_version)$/.exec(req.url ?? '');
    if (cvRpc) {
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        const args = JSON.parse(raw || '{}');
        if (cv.publishFailure === 'not_migrated') return send(404, { code: 'PGRST202' });
        if (cvRpc[1] === 'cv_active') return send(200, cv.active ? [cv.active] : []);
        if (cvRpc[1] === 'cv_publish_version') {
          if (cv.publishFailure === 'down') return send(500, { message: 'db down' });
          if (cv.publishFailure === 'conflict' || (cv.active?.id ?? null) !== args.p_expected_active) {
            return send(409, { code: 'PT409', message: 'cv_conflict' });
          }
          const version: FakeCvVersion = {
            id: args.p_id, bucket: 'portfolio-public-documents', storage_path: args.p_storage_path,
            sha256: args.p_sha256, size_bytes: args.p_size_bytes, activated_at: new Date().toISOString(),
          };
          cv.versions.set(version.id, version);
          cv.active = version;
          return send(200, [version]);
        }
        if ((cv.active?.id ?? null) !== args.p_expected_active) return send(409, { code: 'PT409', message: 'cv_conflict' });
        const target = cv.versions.get(args.p_id);
        if (!target) return send(400, { code: 'P0002', message: 'cv_version_not_found' });
        cv.active = target;
        return send(200, [target]);
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/auth/v1/.well-known/jwks.json') {
      state.calls.jwks++;
      const jwk = project.publicKey.export({ format: 'jwk' });
      return send(200, { keys: [{ ...jwk, kid: KID, alg: 'ES256', use: 'sig' }] });
    }

    if (req.method === 'POST' && req.url === '/rest/v1/rpc/admin_session_status') {
      sessions.calls++;
      if (sessions.mode === 'down') return send(500, { message: 'internal' });
      if (sessions.mode === 'missing_function') return send(404, { code: 'PGRST202' });
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      try {
        const claims = jwt.verify(token, project.publicKey, { algorithms: ['ES256'], issuer: `${state.url}/auth/v1`, audience: 'authenticated' }) as { sub: string; aal: string; session_id?: string };
        if (!state.admins.has(claims.sub)) return send(200, [{ active: false, remaining_seconds: 0, idle_limit_seconds: 600, reason: 'not_admin' }]);
        if (claims.aal !== 'aal2') return send(200, [{ active: false, remaining_seconds: 0, idle_limit_seconds: 600, reason: 'mfa_required' }]);
        const st = sessions.states.get(claims.session_id ?? '') ?? { active: true, remaining_seconds: 600, reason: null };
        return send(200, [{ ...st, idle_limit_seconds: 600 }]);
      } catch {
        return send(401, { code: 'PGRST301', message: 'JWT invalid' });
      }
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
    session_id:   opts.sessionId ?? crypto.randomUUID(),
  });

  const fake: FakeSupabase = {
    get url() { return state.url; },
    get issuer() { return `${state.url}/auth/v1`; },
    admins: state.admins,
    calls:  state.calls,
    cv,
    get mode() { return state.mode; },
    set mode(m) { state.mode = m; },
    get hs256Secret() { return state.hs256Secret; },
    set hs256Secret(v) { state.hs256Secret = v; },
    ai,
    sessions,
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
