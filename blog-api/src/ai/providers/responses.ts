// blog-api/src/ai/providers/responses.ts
// API Responses (format commun à OpenAI et xAI) : POST /v1/responses.
// Aucun stockage côté fournisseur (store: false). Images en `input_image` (data URL),
// limite de sortie `max_output_tokens` (réflexion comprise), effort dans `reasoning.effort`.

import { allowedParams, classifyError, errorInfo, requestJson, requireText } from './http';
import type { CallContext, GenerationParam, NormalizedRequest, NormalizedResponse } from './types';

export interface ResponsesOptions {
  supportedParams: ReadonlySet<GenerationParam>;
  /** `text.format` json_object documenté par l'API */
  jsonMode: boolean;
  /** Champ `detail` des images documenté par l'API */
  imageDetail: boolean;
}

interface ResponsesBody {
  output?: { type?: string; content?: { type?: string; text?: unknown }[] }[];
  status?: string;
  incomplete_details?: { reason?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
}

function toInput(req: NormalizedRequest, detail: boolean) {
  return [
    { role: 'system', content: req.system },
    ...req.messages.map(m => ({
      role: m.role,
      content: m.role === 'assistant'
        ? m.content.map(part => (part.type === 'text' ? part.text : '')).join('')
        : m.content.map(part => part.type === 'text'
          ? { type: 'input_text', text: part.text }
          : { type: 'input_image', image_url: part.dataUrl, ...(detail ? { detail: part.detail } : {}) }),
    })),
  ];
}

const textOf = (body: ResponsesBody | null) => (body?.output ?? [])
  .filter(item => item.type === 'message')
  .flatMap(item => item.content ?? [])
  .filter(part => part.type === 'output_text' && typeof part.text === 'string')
  .map(part => part.text)
  .join('');

export async function callResponses(baseUrl: string, req: NormalizedRequest, ctx: CallContext, options: ResponsesOptions): Promise<NormalizedResponse> {
  const { reasoning_effort, ...params } = allowedParams(req, options.supportedParams);
  const adapt = req.adapt ?? {};
  const { status, ok, body } = await requestJson<ResponsesBody>(`${baseUrl}/v1/responses`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.apiKey}` },
    body: JSON.stringify({
      model: ctx.model,
      store: false,
      max_output_tokens: req.maxOutputTokens,
      ...params,
      ...(reasoning_effort ? { reasoning: { effort: reasoning_effort } } : {}),
      ...(options.jsonMode && req.output === 'json' && !adapt.omitJsonMode ? { text: { format: { type: 'json_object' } } } : {}),
      input: toInput(req, options.imageDetail && !adapt.omitImageDetail),
    }),
  }, ctx.signal);
  if (!ok) throw classifyError(status, errorInfo(body));

  // « incomplete » : limite atteinte (souvent par la réflexion) avant la fin de la réponse
  const finish = body?.status === 'incomplete' ? (body.incomplete_details?.reason ?? 'incomplete') : body?.status;
  return {
    content: requireText(textOf(body), status, finish),
    finishReason: finish,
    usage: { inputTokens: body?.usage?.input_tokens, outputTokens: body?.usage?.output_tokens },
  };
}
