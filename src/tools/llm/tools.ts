/**
 * Direct model calls.
 *
 * Every one of these performs a real request through `llm-gateway`. None of them simulates a reply,
 * and a missing credential is reported as a missing credential rather than papered over with a
 * plausible answer — a stub here would be worse than an absent tool, because the caller could not
 * tell the difference.
 */

import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { arr, num, str, strOrEmpty, view } from '../../core/input.js';
import { PROVIDERS, chat, checkProvider, embed, splitModel } from '../../core/llm-gateway.js';

/** Turn a caller's `messages` input into the shape the gateway expects. */
function readMessages(input: Record<string, unknown>): Array<{
  role: 'system' | 'user' | 'assistant';
  content: string;
}> {
  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  for (const entry of arr(input, 'messages')) {
    if (typeof entry === 'string') {
      out.push({ role: 'user', content: entry });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const content = str(record, 'content');
      if (!content) continue;
      const role = strOrEmpty(record, 'role');
      out.push({
        role: role === 'system' || role === 'assistant' ? role : 'user',
        content,
      });
    }
  }
  return out;
}

// Property sets are per-tool, not shared. A shared block declared `temperature`, `max_chars`,
// `timeout_ms` and `detail` on tools that never read them, which `npm run audit:schema` correctly
// reported as nine dead properties. A dead property is worse than a missing one: it advertises an
// argument that silently does nothing, and the caller has no way to tell it apart from a working one.

const PROVIDER = {
  type: 'string',
  enum: Object.keys(PROVIDERS),
  description: `LLM provideri. Mumkin: ${Object.keys(PROVIDERS).join(', ')}.`,
} as const;

const MODEL = { type: 'string', description: 'Model nomi (masalan gpt-4o-mini, claude-sonnet-4-5)' } as const;
const MAX_TOKENS = { type: 'number', description: 'Javob uzunligi chegarasi (1-32000, standart 1024)' } as const;
const TIMEOUT = { type: 'number', description: 'Kutiladigan vaqt chegarasi (standart 120000)' } as const;
const MAX_CHARS = { type: 'number', description: 'Javobni shu belgigacha qisqartirish' } as const;

export const llmChat = defineTool({
  name: 'pro_llm_chat',
  description:
    'Aniq modelga prompt yuborish va javobni olish. Pro-Fetch ilgari faqat qidiruv API orqali ' +
    'modelga yetardi — bu endi mumkin.',
  category: 'llm',
  inputSchema: {
    type: 'object',
    properties: {
      provider: PROVIDER,
      model: MODEL,
      messages: {
        type: 'array',
        description: 'Xabarlar: [{ role: "user" | "system" | "assistant", content: "..." }] yoki ["matn"]',
        items: { type: 'object' },
      },
      prompt: { type: 'string', description: 'Yagona xabar. messages berilmasa shu ishlatiladi.' },
      max_tokens: MAX_TOKENS,
      temperature: { type: 'number', description: 'Ishonch darajasi 0-2. Faqat OpenAI-shaklli API qabul qiladi.' },
      timeout_ms: TIMEOUT,
      max_chars: MAX_CHARS,
    },
    required: ['model'],
  },
  async handler(input) {
    const p = view(input);
    const messages = readMessages(input);
    const prompt = strOrEmpty(p, 'prompt').trim();
    if (prompt) messages.push({ role: 'user', content: prompt });
    if (messages.length === 0) return fail('prompt yoki messages bering.');

    // `provider/model` in a single argument has to be honoured: without it, "ollama/llama3" went
    // to OpenAI and came back 401 while pro_llm_providers reported ollama as ready.
    const target = splitModel(strOrEmpty(p, 'provider'), strOrEmpty(p, 'model'));
    if (target.conflict) return fail(target.conflict);
    try {
      const answer = await chat({
        provider: target.provider || 'openai',
        model: target.model,
        messages,
        maxTokens: num(p, 'max_tokens', 1024, 1, 32_000),
        ...(typeof p.temperature === 'number' ? { temperature: Number(p.temperature) } : {}),
        timeoutMs: num(p, 'timeout_ms', 120_000, 1_000, 900_000),
        maxChars: num(p, 'max_chars', 0, 0, 200_000),
      });
      return result(
        answer.content +
          `\n\n*[${answer.provider} / ${answer.model} · ${answer.finishReason} · ` +
          `${answer.usage.input_tokens}→${answer.usage.output_tokens} tok]*`,
      );
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const llmComplete = defineTool({
  name: 'pro_llm_complete',
  description: "Modelga oddiy yakunlash (completion) so'rovi — prompt davomida davom etadi.",
  category: 'llm',
  inputSchema: {
    type: 'object',
    properties: {
      provider: PROVIDER,
      model: MODEL,
      prompt: { type: 'string', description: 'Boshlanish matni' },
      max_tokens: MAX_TOKENS,
      max_chars: MAX_CHARS,
    },
    required: ['model', 'prompt'],
  },
  async handler(input) {
    const p = view(input);
    const prompt = strOrEmpty(p, 'prompt');
    if (!prompt) return fail('prompt talab qilinadi.');
    // Deliberately routed through chat rather than a completions endpoint: a model that has chat will
    // almost always be the one the caller named, and a completion endpoint is not universally
    // available. The tool says what it actually does rather than implying otherwise.
    const target = splitModel(strOrEmpty(p, 'provider'), strOrEmpty(p, 'model'));
    if (target.conflict) return fail(target.conflict);
    try {
      const answer = await chat({
        provider: target.provider || 'openai',
        model: target.model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: num(p, 'max_tokens', 1024, 1, 32_000),
        maxChars: num(p, 'max_chars', 0, 0, 200_000),
      });
      return result(answer.content + `\n\n*[${answer.provider} / ${answer.model}]*`);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const llmEmbed = defineTool({
  name: 'pro_llm_embed',
  description: 'Matnni vektorga aylantirish (embedding). RAG va qidiruv uchun kirish nuqtasi.',
  category: 'llm',
  inputSchema: {
    type: 'object',
    properties: {
      provider: PROVIDER,
      model: MODEL,
      input: {
        type: 'array',
        description: "Matnlar ro'yxati",
        items: { type: 'string' },
      },
      text: { type: 'string', description: 'Yagona matn. input berilmasa shu ishlatiladi.' },
      dimensions: { type: 'number', description: "Vektor uzunligi (ba'zi modellarda qisqartiriladi)" },
      timeout_ms: TIMEOUT,
      detail: { type: 'string', enum: ['summary', 'full'], description: "Vektorlarni ko'rsatish" },
    },
    required: ['model'],
  },
  async handler(input) {
    const p = view(input);
    const texts = arr(input, 'input').filter((item): item is string => typeof item === 'string' && item.length > 0);
    const single = strOrEmpty(p, 'text');
    if (single) texts.push(single);
    if (texts.length === 0) return fail('text yoki input bering.');
    if (texts.length > 256) return fail(`Bir chaqiruvda 256 tagacha matn. Yuborilgan: ${texts.length}.`);

    const target = splitModel(strOrEmpty(p, 'provider'), strOrEmpty(p, 'model'));
    if (target.conflict) return fail(target.conflict);
    try {
      const answer = await embed({
        provider: target.provider || 'openai',
        model: target.model,
        input: texts,
        ...(typeof p.dimensions === 'number' ? { dimensions: Number(p.dimensions) } : {}),
        timeoutMs: num(p, 'timeout_ms', 120_000, 1_000, 900_000),
      });
      const dims = answer.vectors[0]?.length ?? 0;
      if (strOrEmpty(p, 'detail') === 'summary') {
        return jsonBlock('Embedding o‘lchamlari', {
          provider: answer.provider,
          model: answer.model,
          count: answer.vectors.length,
          dimensions: dims,
          usage: answer.usage,
        });
      }
      return jsonBlock('Embedding vektorlari', {
        provider: answer.provider,
        model: answer.model,
        dimensions: dims,
        usage: answer.usage,
        vectors: answer.vectors,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const llmProviders = defineTool({
  name: 'pro_llm_providers',
  description:
    "Qaysi LLM providerlari hozir ishlatilishi mumkinligini ko'rsatish: kalit bormi, manzil " +
    'belgilanganmi. Hech qanday kalit qiymati chiqarilmaydi.',
  category: 'llm',
  inputSchema: { type: 'object', properties: {}, required: [] },
  async handler() {
    const rows = Object.keys(PROVIDERS).map((name) => checkProvider(name));
    const ready = rows.filter((row) => row.ready).map((row) => row.label);
    const missing = rows.filter((row) => !row.ready).map((row) => `${row.label}: ${row.reason}`);
    return jsonBlock('Providerlar holati', {
      ready: ready.length,
      providers: rows,
      ...(missing.length ? { how_to_enable: missing } : {}),
    });
  },
});

export const llmCompare = defineTool({
  name: 'pro_llm_compare',
  description:
    "Bir xil savolni bir nechta modelga yuborib javoblarni yonma-yon qo'yish. Modellar " +
    'bir-biriga qarab emas, parallel bajariladi.',
  category: 'llm',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', enum: Object.keys(PROVIDERS), description: 'Provider' },
      models: {
        type: 'array',
        description: "Modellar ro'yxati",
        items: { type: 'string' },
      },
      prompt: { type: 'string', description: 'Barcha modellarga beriladigan savol' },
      max_tokens: { type: 'number', description: 'Har bir javob chegarasi' },
      timeout_ms: { type: 'number', description: 'Kutiladigan vaqt chegarasi' },
      max_chars: { type: 'number', description: 'Har bir javobni qisqartirish' },
    },
    required: ['prompt', 'models'],
  },
  async handler(input) {
    const p = view(input);
    const prompt = strOrEmpty(p, 'prompt');
    if (!prompt) return fail('prompt talab qilinadi.');
    const models = arr(input, 'models').filter((item): item is string => typeof item === 'string' && item.length > 0);
    if (models.length === 0) return fail("models ro'yxati bo'sh.");
    if (models.length > 8) return fail(`Bir chaqiruvda 8 tagacha model. Yuborilgan: ${models.length}.`);

    const provider = strOrEmpty(p, 'provider') || 'openai';
    const answers = await Promise.all(
      models.map(async (model) => {
        const started = Date.now();
        try {
          const answer = await chat({
            provider,
            model,
            messages: [{ role: 'user', content: prompt }],
            maxTokens: num(p, 'max_tokens', 1024, 1, 32_000),
            timeoutMs: num(p, 'timeout_ms', 120_000, 1_000, 900_000),
            maxChars: num(p, 'max_chars', 0, 0, 200_000),
          });
          return {
            model,
            ok: true,
            ms: Date.now() - started,
            tokens: answer.usage.input_tokens + answer.usage.output_tokens,
            content: answer.content,
          };
        } catch (error) {
          return {
            model,
            ok: false,
            ms: Date.now() - started,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    return jsonBlock('Modellar taqqoslashuvi', { provider, prompt, results: answers });
  },
});
