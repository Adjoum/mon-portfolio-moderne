// Faux serveur OpenAI local (127.0.0.1, port éphémère) : aucune requête payante.
// Enregistre chaque requête reçue et simule réponses, retards, blocages et erreurs.

import http from 'http';
import type { AddressInfo } from 'net';

export interface ReceivedCall {
  headers: http.IncomingHttpHeaders;
  body: {
    model: string;
    max_tokens: number;
    messages: { role: string; content: unknown }[];
    [key: string]: unknown;
  };
}

export type FakeBehavior =
  | { kind: 'ok'; content?: string; delayMs?: number }
  | { kind: 'hang' }
  | { kind: 'error'; status: number; body: unknown }
  | { kind: 'malformed' }
  | { kind: 'filtered' };

export interface FakeOpenAI {
  url: string;
  calls: ReceivedCall[];
  behavior: FakeBehavior;
  /** Requêtes bloquées (hang) dont le client a coupé la connexion */
  abortedCalls(): number;
  close(): Promise<void>;
}

export async function startFakeOpenAI(): Promise<FakeOpenAI> {
  const state = { calls: [] as ReceivedCall[], behavior: { kind: 'ok' } as FakeBehavior };
  const pending = new Set<http.ServerResponse>();
  let aborted = 0;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      state.calls.push({ headers: req.headers, body: JSON.parse(raw) });
      const b = state.behavior;
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      if (b.kind === 'hang') {
        pending.add(res);
        res.on('close', () => { if (!res.writableEnded) aborted++; });
        return;
      }
      if (b.kind === 'error') return json(b.status, b.body);
      if (b.kind === 'malformed') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{not json'); return; }
      if (b.kind === 'filtered') return json(200, { choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] });

      const reply = () => json(200, {
        choices: [{ message: { role: 'assistant', content: b.content ?? 'Réponse simulée' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 40 },
      });
      if (b.delayMs) setTimeout(reply, b.delayMs); else reply();
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    calls: state.calls,
    get behavior() { return state.behavior; },
    set behavior(b) { state.behavior = b; },
    abortedCalls: () => aborted,
    close: () => new Promise<void>(resolve => {
      for (const res of pending) res.destroy();
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}
