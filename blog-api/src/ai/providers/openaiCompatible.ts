// blog-api/src/ai/providers/openaiCompatible.ts
// Base partagée des fournisseurs au format Chat Completions (OpenAI, Groq ; xAI et OpenRouter en P1.A).
// Fetch typé : aucun SDK, aucune liste de modèles. Le modèle vient de l'affectation résolue côté serveur.
// Limite de sortie : max_completion_tokens (les modèles à raisonnement refusent max_tokens).

import {
  ProviderError,
  type ProviderAdapter,
  type ProviderId,
  type NormalizedRequest,
  type NormalizedResponse,
  type CallContext,
  type GenerationParam,
  type ModelInfo,
} from './types';

export interface ChatCompletionsOptions {
  id: ProviderId;
  supportsImages: boolean;
  supportedParams: ReadonlySet<GenerationParam>;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: string; type?: string };
}

interface ModelListResponse {
  data?: { id?: unknown; context_window?: unknown; max_completion_tokens?: unknown; active?: unknown }[];
}

function toMessages(req: NormalizedRequest) {
  return req.messages.map(m => ({
    role: m.role,
    content: m.content.map(part => part.type === 'text'
      ? { type: 'text', text: part.text }
      : { type: 'image_url', image_url: { url: part.dataUrl, detail: part.detail } }),
  }));
}

function mapHttpError(status: number, body: ChatCompletionResponse | null): ProviderError {
  const code = body?.error?.code ?? body?.error?.type ?? '';
  const detail = `HTTP ${status}${code ? ` ${code}` : ''}`;
  if (status === 401 || status === 403) return new ProviderError('auth', status, detail);
  if (status === 404 || code === 'model_not_found') return new ProviderError('model_not_found', status, detail);
  if (status === 429) {
    return new ProviderError(code === 'insufficient_quota' ? 'quota_exceeded' : 'rate_limited', status, detail);
  }
  if (code === 'context_length_exceeded') return new ProviderError('context_too_long', status, detail);
  if (code === 'content_filter' || code === 'content_policy_violation') return new ProviderError('content_filtered', status, detail);
  if (status >= 400 && status < 500) return new ProviderError('bad_request', status, detail);
  return new ProviderError('unavailable', status, detail);
}

function networkError(err: unknown, signal: AbortSignal): ProviderError {
  const reason = (signal.reason as Error | undefined)?.name;
  if (reason === 'TimeoutError') return new ProviderError('timeout');
  if (signal.aborted) return new ProviderError('aborted');
  return new ProviderError('unavailable', undefined, (err as Error).name);
}

export function createChatCompletionsAdapter(baseUrl: string, options: ChatCompletionsOptions): ProviderAdapter {
  const { id, supportsImages, supportedParams } = options;

  return {
    id,
    supportedParams,
    supportsImages,

    async generate(req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse> {
      const params = Object.fromEntries(
        Object.entries(req.params).filter(([k]) => supportedParams.has(k as GenerationParam)),
      );

      let res: Awaited<ReturnType<typeof fetch>>;
      try {
        res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.apiKey}` },
          body: JSON.stringify({
            model: ctx.model,
            max_completion_tokens: req.maxOutputTokens,
            ...params,
            messages: [{ role: 'system', content: req.system }, ...toMessages(req)],
          }),
          signal: ctx.signal,
        });
      } catch (err) {
        throw networkError(err, ctx.signal);
      }

      const body = (await res.json().catch(() => null)) as ChatCompletionResponse | null;
      if (!res.ok) throw mapHttpError(res.status, body);

      const choice  = body?.choices?.[0];
      const content = choice?.message?.content;
      const finish  = choice?.finish_reason;
      if (finish === 'content_filter') throw new ProviderError('content_filtered', res.status);
      // Modèle à raisonnement : la limite peut être épuisée avant toute réponse (finish_reason « length »)
      if (typeof content !== 'string' || !content.trim()) {
        throw new ProviderError('invalid_response', res.status, `réponse vide (${finish ?? 'inconnu'})`);
      }

      return {
        content,
        finishReason: finish,
        usage: { inputTokens: body?.usage?.prompt_tokens, outputTokens: body?.usage?.completion_tokens },
      };
    },

    // Métadonnées uniquement : aucune génération, aucune facturation
    async listModels(ctx): Promise<ModelInfo[]> {
      let res: Awaited<ReturnType<typeof fetch>>;
      try {
        res = await fetch(`${baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${ctx.apiKey}` },
          signal:  ctx.signal,
        });
      } catch (err) {
        throw networkError(err, ctx.signal);
      }
      const body = (await res.json().catch(() => null)) as (ModelListResponse & ChatCompletionResponse) | null;
      if (!res.ok) throw mapHttpError(res.status, body);

      return (body?.data ?? []).flatMap(m => typeof m.id === 'string' ? [{
        id: m.id,
        contextWindow:       typeof m.context_window === 'number' ? m.context_window : undefined,
        maxCompletionTokens: typeof m.max_completion_tokens === 'number' ? m.max_completion_tokens : undefined,
        active:              typeof m.active === 'boolean' ? m.active : undefined,
      }] : []);
    },
  };
}
