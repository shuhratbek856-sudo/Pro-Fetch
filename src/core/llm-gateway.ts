/**
 * Provider gateway for direct model calls.
 *
 * Pro-Fetch could reach a model only by way of a search API that returns links. Nothing in the 572
 * tools could send a prompt. That made `llm` the largest single gap: embeddings and reranking are
 * *inputs* to `research`, `knowledge` and `vector`, so every one of those categories was working at
 * one remove from a capability it could not reach.
 *
 * Providers are addressed by name rather than branched on, because the differences that matter -
 * chat completions vs. embeddings vs. a completion endpoint - are real API differences, not spelling
 * differences, and pretending otherwise produced a class of bug worth avoiding up front.
 *
 * Credentials come from the existing credential layer (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and so
 * on), so no key is ever written into a tool argument and none is echoed back in a result.
 */

import { fetchWithOptions } from './http-client.js';
import { parseUpstreamJson } from './json-response.js';

/** Providers this gateway can actually reach. */
export type LlmProvider = 'openai' | 'anthropic' | 'openai_compatible' | 'ollama';

export interface LlmProviderSpec {
  id: LlmProvider;
  label: string;
  /** Static base URL. Empty when `baseUrlEnv` names the variable that supplies it. */
  baseUrl: string;
  /**
   * Environment variable holding the base URL, for an endpoint the operator names.
   *
   * A separate field from `keyEnv` on purpose. One field for both is what let the address end up in
   * `Authorization: Bearer`: every code path asked `keyEnv` for "the secret", the address was stored
   * there, and the address was sent. Two variables mean two things and each is read where it belongs.
   */
  baseUrlEnv?: string;
  /**
   * Whether the base URL must come from the environment rather than the built-in default.
   *
   * `openai_compatible` sets it: there is no sensible default address for "some OpenAI-shaped
   * endpoint", and guessing one is how a prompt ends up somewhere unintended. `openai` leaves it unset
   * so its variable stays what it is - an override for a gateway standing in for the real host.
   */
  requiresBaseUrl?: boolean;
  /** Environment variable holding the key. Empty for a provider that needs none. */
  keyEnv: string;
  /** Anthropic sends `x-api-key`; the OpenAI shape sends `Authorization: Bearer`. */
  authStyle: 'bearer' | 'x-api-key' | 'none';
  /** Whether a key is required before a call can be attempted. */
  requiresKey: boolean;
}

export const PROVIDERS: Record<LlmProvider, LlmProviderSpec> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    // Lets a gateway or proxy stand in for OpenAI without a second provider name. An override, so no
    // error when it is absent.
    baseUrlEnv: 'PRO_FETCH_LLM_BASE_URL',
    keyEnv: 'OPENAI_API_KEY',
    authStyle: 'bearer',
    requiresKey: true,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyEnv: 'ANTHROPIC_API_KEY',
    authStyle: 'x-api-key',
    requiresKey: true,
  },
  openai_compatible: {
    id: 'openai_compatible',
    label: 'OpenAI-compatible endpoint',
    // A blank base is a *reason to be refused*, not a reason to guess. A wrong host here would send a
    // prompt somewhere unintended, so the value has to be supplied rather than defaulted.
    baseUrl: '',
    baseUrlEnv: 'PRO_FETCH_LLM_BASE_URL',
    requiresBaseUrl: true,
    // The key, read from `PRO_FETCH_LLM_API_KEY`. This used to name `PRO_FETCH_LLM_BASE_URL` - the
    // address, in a field every code path treats as "where the secret is" - so `chat()` sent
    // `Authorization: Bearer https://api.mistral.ai/v1` to that same host. A base URL is not a
    // credential: the one thing the server is guaranteed to log, cache in a proxy, and print in an
    // error page, and it cannot authenticate anything. It also made a real key impossible to supply,
    // since there was no variable for one. An endpoint that needs no key is still fine - the auth
    // headers below are conditional on the value being non-empty.
    keyEnv: 'PRO_FETCH_LLM_API_KEY',
    authStyle: 'bearer',
    requiresKey: false,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    // Loopback by default, which is what a local model server is. The SSRF guard would block it, so
    // callers use this through the local transport rather than pretending it is a remote host.
    baseUrl: 'http://127.0.0.1:11434',
    keyEnv: '',
    authStyle: 'none',
    requiresKey: false,
  },
};

/** Resolve a provider name, or explain what is wrong with it. */
export function resolveProvider(name: string): LlmProviderSpec {
  const key = name.trim().toLowerCase();
  const spec = PROVIDERS[key as LlmProvider];
  if (!spec) {
    throw new Error(`Noma'lum provider: "${name}". Mumkin bo'lganlar: ${Object.keys(PROVIDERS).join(', ')}.`);
  }
  return spec;
}

/** The base URL actually in force, which for two providers comes from the environment. */
function effectiveBaseUrl(spec: LlmProviderSpec): string {
  const fromEnv = spec.baseUrlEnv ? (process.env[spec.baseUrlEnv] ?? '').trim() : '';
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (spec.requiresBaseUrl) {
    throw new Error(
      `${spec.baseUrlEnv} belgilanmagan. OpenAI-shaklli endpoint uchun manzil shart: ` +
        `masalan https://api.mistral.ai/v1 yoki https://openrouter.ai/api/v1.`,
    );
  }
  return spec.baseUrl.replace(/\/+$/, '');
}

/** Whether this provider can be reached right now, and what is missing if not. */
export function checkProvider(name: string): {
  provider: string;
  label: string;
  ready: boolean;
  reason?: string;
  /** Something worth knowing that does not make the provider unusable. */
  note?: string;
} {
  const spec = resolveProvider(name);
  const missing: string[] = [];
  if (spec.requiresKey && !(process.env[spec.keyEnv] ?? '').trim()) {
    missing.push(spec.keyEnv);
  }
  let base = spec.baseUrl;
  try {
    base = effectiveBaseUrl(spec);
  } catch (error) {
    missing.push(error instanceof Error ? error.message : String(error));
  }

  // Ollama runs on loopback, and the SSRF guard blocks loopback on every fetch - which is correct, and
  // is why it is checked here. Reporting it `ready: true` is the same lie as before in a different
  // place: a caller reads the status, concludes a local model is available, and the first real call is
  // refused by the guard with a message about internal addresses. A status that does not predict the
  // next call is worse than no status.
  if (spec.id === 'ollama') {
    missing.push(`${base} — SSRF himoyasi loopback manzillarni bloklaydi; pro-fetch orqali chaqirib bo‘lmaydi.`);
  }

  // Reported, but not as a blocker: an OpenAI-shaped endpoint behind a gateway or a corporate proxy
  // often needs no key, and requiring one would refuse a working setup. What matters is that saying
  // "ready" here means the same thing it means for a keyed provider - no auth header will be sent -
  // so a caller who finds out from a 401 later at least knew.
  const notes: string[] = [];
  if (spec.keyEnv && !spec.requiresKey && spec.authStyle !== 'none' && !(process.env[spec.keyEnv] ?? '').trim()) {
    notes.push(
      `${spec.keyEnv} o‘rnatilmagan — so‘rov autentifikatsiyasiz yuboriladi ` +
        `(kalit talab qilmaydigan endpoint uchun normal; kalit talab qilsa 401 qaytadi).`,
    );
  }

  return {
    provider: spec.id,
    label: spec.label,
    ready: missing.length === 0,
    ...(missing.length ? { reason: missing.join('; ') } : {}),
    ...(notes.length ? { note: notes.join('; ') } : {}),
  };
}

/**
 * Split a `provider/model` string.
 *
 * Without this, `model: "ollama/llama3"` went to the default provider and came back as
 * `OpenAI: HTTP 401`, while `pro_llm_providers` was meanwhile reporting ollama as `ready: true`. That
 * combination is the worst kind of failure: the tool that reports readiness said yes, and the tool
 * that does the work went somewhere else entirely. A caller reading only the first output would
 * reasonably conclude a local model was available.
 *
 * An explicit `provider` argument always wins. The prefix is a convenience, not an override, so a
 * caller who names both and disagrees is told rather than silently contradicted.
 */
export function splitModel(provider: string, model: string): { provider: string; model: string; conflict?: string } {
  const trimmed = model.trim();
  const named = provider.trim();

  // A bare provider name is a provider: `model: "ollama"` with no slash used to fall through to
  // OpenAI and return a 401 from a host the caller never named.
  if (!named && Object.prototype.hasOwnProperty.call(PROVIDERS, trimmed.toLowerCase())) {
    return { provider: trimmed.toLowerCase(), model: '' };
  }
  const slash = trimmed.indexOf('/');
  if (slash <= 0) return { provider: named, model: trimmed };

  const prefix = trimmed.slice(0, slash);
  const rest = trimmed.slice(slash + 1);
  // Only a known provider prefix is treated as one. Model names legitimately contain slashes -
  // `meta-llama/Llama-3-8B` on Ollama, `mistralai/Mistral-7B` on OpenRouter - and rewriting those to
  // a provider would break every OpenAI-compatible endpoint that serves them.
  if (!Object.prototype.hasOwnProperty.call(PROVIDERS, prefix)) {
    return { provider: named, model: trimmed };
  }
  if (named && named !== prefix) {
    return {
      provider: prefix,
      model: rest,
      conflict: `provider "${named}" va model prefiksi "${prefix}" mos emas — "${prefix}" ishlatildi.`,
    };
  }
  return { provider: prefix, model: rest };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  provider: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Return only this many characters of the reply. */
  maxChars?: number;
}

/** Read an API error body without dumping a key that a provider may have echoed back. */
function describeFailure(status: number, body: string): string {
  const trimmed = body.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***').slice(0, 400);
  return `HTTP ${status}${trimmed ? `: ${trimmed}` : ''}`;
}

/**
 * One chat completion, normalised.
 *
 * The two shapes differ more than the field names: Anthropic takes `system` out of band and requires
 * `max_tokens`, while OpenAI takes `max_tokens` optional and the system turn in the array. Both are
 * handled here so a caller writes one message list.
 */
export async function chat(options: ChatOptions): Promise<{
  provider: string;
  model: string;
  content: string;
  usage: Record<string, number>;
  finishReason: string;
}> {
  const spec = resolveProvider(options.provider);
  const base = effectiveBaseUrl(spec);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const key = spec.keyEnv ? (process.env[spec.keyEnv] ?? '').trim() : '';
  if (spec.authStyle === 'bearer' && key) headers.authorization = `Bearer ${key}`;
  if (spec.authStyle === 'x-api-key' && key) headers['x-api-key'] = key;
  if (spec.id === 'anthropic') headers['anthropic-version'] = '2023-06-01';

  const maxTokens = Math.max(1, Math.min(32_000, Math.trunc(options.maxTokens ?? 1024)));
  const system = options.messages.filter((m) => m.role === 'system');
  const rest = options.messages.filter((m) => m.role !== 'system');

  const url = spec.id === 'anthropic' ? `${base}/v1/messages` : `${base}/chat/completions`;
  const body =
    spec.id === 'anthropic'
      ? {
          model: options.model,
          max_tokens: maxTokens,
          ...(system.length ? { system: system.map((m) => m.content).join('\n\n') } : {}),
          messages: rest.map((m) => ({ role: m.role, content: m.content })),
        }
      : {
          model: options.model,
          messages: options.messages,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
        };

  const response = await fetchWithOptions(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    timeoutMs: options.timeoutMs ?? 120_000,
    cache: false,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${spec.label}: ${describeFailure(response.status, response.text)}`);
  }

  let parsed: unknown;
  // `parseUpstreamJson` rather than `JSON.parse`: a provider that returns an HTML error page or an
  // empty body otherwise surfaces as `Unexpected token 'O'`, which says nothing about which provider
  // failed or what it said.
  parsed = parseUpstreamJson<Record<string, unknown>>(response, spec.label);

  if (spec.id === 'anthropic') {
    const payload = parsed as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string;
    };
    const content = (payload.content ?? [])
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('');
    if (!content) throw new Error(`${spec.label}: javobda matn yo'q.`);
    return {
      provider: spec.id,
      model: options.model,
      content: clip(options.maxChars, content),
      usage: {
        input_tokens: payload.usage?.input_tokens ?? 0,
        output_tokens: payload.usage?.output_tokens ?? 0,
      },
      finishReason: payload.stop_reason ?? 'stop',
    };
  }

  const payload = parsed as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    model?: string;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content === '') {
    throw new Error(`${spec.label}: javobda matn yo'q.`);
  }
  return {
    provider: spec.id,
    model: payload.model ?? options.model,
    content: clip(options.maxChars, content),
    usage: {
      input_tokens: payload.usage?.prompt_tokens ?? 0,
      output_tokens: payload.usage?.completion_tokens ?? 0,
      total_tokens: payload.usage?.total_tokens ?? 0,
    },
    finishReason: payload.choices?.[0]?.finish_reason ?? 'stop',
  };
}

/**
 * Embeddings.
 *
 * Kept separate from `chat` rather than folded into one call: an embedding is not a prompt, the
 * response has no text to clip, and a model name that works for one does not work for the other.
 */
export async function embed(options: {
  provider: string;
  model: string;
  input: string[];
  dimensions?: number;
  timeoutMs?: number;
}): Promise<{
  provider: string;
  model: string;
  vectors: number[][];
  usage: { input_tokens: number };
}> {
  const spec = resolveProvider(options.provider);
  const base = effectiveBaseUrl(spec);
  if (spec.id === 'anthropic') {
    throw new Error('Anthropic embeddings API taqdim etmaydi. Boshqa provider tanlang.');
  }

  if (spec.id === 'ollama') {
    // Ollama's shape is genuinely different: one prompt per request, at `/api/embeddings`, and the
    // vector comes back as `embedding` rather than in a `data` array. Folding it in here means a
    // caller uses one tool for every provider instead of being sent to a second one - and there is no
    // second one to send them to, which is exactly what the previous message implied.
    const vectors: number[][] = [];
    let tokens = 0;
    for (const single of options.input) {
      const local = await fetchWithOptions(`${base}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: options.model, prompt: single }),
        timeoutMs: options.timeoutMs ?? 120_000,
        cache: false,
      });
      if (local.status < 200 || local.status >= 300) {
        throw new Error(`Ollama: ${describeFailure(local.status, local.text)}`);
      }
      const payload = parseUpstreamJson<{ embedding?: number[] }>(local, 'Ollama');
      if (!Array.isArray(payload.embedding) || payload.embedding.length === 0) {
        throw new Error('Ollama: vektor bo‘sh qaytdi.');
      }
      vectors.push(payload.embedding);
      tokens += Math.ceil(single.length / 4);
    }
    return { provider: spec.id, model: options.model, vectors, usage: { input_tokens: tokens } };
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const key = spec.keyEnv ? (process.env[spec.keyEnv] ?? '').trim() : '';
  if (spec.authStyle === 'bearer' && key) headers.authorization = `Bearer ${key}`;

  const response = await fetchWithOptions(`${base}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options.model,
      input: options.input,
      ...(options.dimensions ? { dimensions: options.dimensions } : {}),
    }),
    timeoutMs: options.timeoutMs ?? 120_000,
    cache: false,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${spec.label}: ${describeFailure(response.status, response.text)}`);
  }
  const payload = parseUpstreamJson<{
    data?: Array<{ embedding?: number[]; index?: number }>;
    model?: string;
    usage?: { prompt_tokens?: number; total_tokens?: number };
  }>(response, spec.label);
  const rows = (payload.data ?? [])
    .map((row) => ({ index: row.index ?? 0, vector: row.embedding ?? [] }))
    .sort((a, b) => a.index - b.index);
  if (rows.length === 0 || rows.some((row) => row.vector.length === 0)) {
    throw new Error(`${spec.label}: vektorlar bo'sh qaytdi.`);
  }
  return {
    provider: spec.id,
    model: payload.model ?? options.model,
    vectors: rows.map((row) => row.vector),
    usage: { input_tokens: payload.usage?.prompt_tokens ?? payload.usage?.total_tokens ?? 0 },
  };
}

function clip(maxChars: number | undefined, text: string): string {
  if (!maxChars || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n[… ${text.length - maxChars} belgi kesib tashlandi]`;
}
