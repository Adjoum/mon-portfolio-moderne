// blog-api/src/ai/providers/openai.ts
// Adaptateur OpenAI (Chat Completions) en fetch typé : aucun SDK, aucune liste de modèles.
// Le modèle est fourni par l'affectation résolue côté serveur.

import {
  ProviderError,
  type ProviderAdapter,
  type NormalizedRequest,
  type NormalizedResponse,
  type CallContext,
  type GenerationParam,
} from './types';

const SUPPORTED_PARAMS: ReadonlySet<GenerationParam> = new Set([
  'temperature', 'top_p', 'stop', 'presence_penalty', 'frequency_penalty', 'seed',
]);

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: string; type?: string };
}

function toOpenAIContent(req: NormalizedRequest) {
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

export function createOpenAIAdapter(baseUrl: string): ProviderAdapter {
  return {
    id: 'openai',
    supportedParams: SUPPORTED_PARAMS,
    supportsImages: true,

    async generate(req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse> {
      const params = Object.fromEntries(
        Object.entries(req.params).filter(([k]) => SUPPORTED_PARAMS.has(k as GenerationParam)),
      );

      let res: Awaited<ReturnType<typeof fetch>>;
      try {
        res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.apiKey}` },
          body: JSON.stringify({
            model:      ctx.model,
            max_tokens: req.maxOutputTokens,
            ...params,
            messages: [{ role: 'system', content: req.system }, ...toOpenAIContent(req)],
          }),
          signal: ctx.signal,
        });
      } catch (err) {
        const reason = (ctx.signal.reason as Error | undefined)?.name;
        if (reason === 'TimeoutError') throw new ProviderError('timeout');
        if (ctx.signal.aborted) throw new ProviderError('aborted');
        throw new ProviderError('unavailable', undefined, (err as Error).name);
      }

      const body = (await res.json().catch(() => null)) as ChatCompletionResponse | null;
      if (!res.ok) throw mapHttpError(res.status, body);

      const choice  = body?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== 'string') throw new ProviderError('invalid_response', res.status, 'missing content');
      if (choice?.finish_reason === 'content_filter') throw new ProviderError('content_filtered', res.status);

      return {
        content,
        finishReason: choice?.finish_reason,
        usage: { inputTokens: body?.usage?.prompt_tokens, outputTokens: body?.usage?.completion_tokens },
      };
    },
  };
}
