import type { ToolResult } from './types.js';
import { clipToTokens } from './chunker.js';

export function result(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function fail(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export function md(text: string, maxTokens = 8000): ToolResult {
  return result(clipToTokens(text, maxTokens));
}

function renderJsonBlock(title: string, data: unknown): string {
  const s = JSON.stringify(data, null, 2) ?? 'null';
  const body = s.length > 30_000 ? s.slice(0, 30_000) + '\n...qisqartirildi' : s;
  return title + '\n\n```json\n' + body + '\n```';
}

export function jsonBlock(title: string, data: unknown): ToolResult {
  return result(renderJsonBlock(title, data));
}

/**
 * Same structured JSON payload as `jsonBlock`, but flagged as a tool failure.
 *
 * Use this for genuine operation errors (missing/invalid argument, unparseable input, a resource
 * that was not found) where the caller still benefits from a structured body — a suggestion, an id,
 * the failing input. A plain `jsonBlock({ error })` left `isError` false, so `dispatch` reported
 * `structuredContent.ok = true` and clients that branch on `isError` treated the failed call as a
 * success. Contrast with validation results (e.g. a schema saying a value is invalid): there the
 * operation succeeded, so those stay `jsonBlock`, not `failJson`.
 */
export function failJson(title: string, data: unknown): ToolResult {
  return { content: [{ type: 'text', text: renderJsonBlock(title, data) }], isError: true };
}
