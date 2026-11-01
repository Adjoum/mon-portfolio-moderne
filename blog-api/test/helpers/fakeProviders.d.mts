import type { IncomingHttpHeaders } from 'node:http';
import type { ProviderId } from '../../src/ai/providers/types';

export interface FakeCall {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

export type FakeProviderBehavior =
  | { kind: 'ok'; content?: string; delayMs?: number }
  | { kind: 'hang' }
  | { kind: 'error'; status: number; body: unknown }
  | { kind: 'malformed' }
  | { kind: 'filtered' }
  /** Modèle multimodal simulé : décode réellement l'image et lit le code de la sonde */
  | { kind: 'vision' }
  /** Modèle sans vision : refuse toute image avec l'erreur réelle du fournisseur */
  | { kind: 'text-only' };

export interface FakeModel {
  id: string;
  displayName?: string;
  contextWindow?: number;
  maxCompletionTokens?: number;
  vision?: boolean;
  active?: boolean;
  shutdownDate?: string;
  inputPrice?: number | string;
  outputPrice?: number | string;
  methods?: string[];
}

export interface FakeProvider {
  id: ProviderId;
  url: string;
  calls: FakeCall[];
  behavior: FakeProviderBehavior;
  /** Réponses successives, consommées avant behavior */
  queue: FakeProviderBehavior[];
  models: FakeModel[];
  modelListStatus: number;
  acceptedKeys: string[] | null;
  modelListCalls(): number;
  abortedCalls(): number;
  close(): Promise<void>;
}

export function startFakeProvider(id: ProviderId, options?: { acceptedKeys?: string[] | null }): Promise<FakeProvider>;
