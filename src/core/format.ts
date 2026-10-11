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

export function jsonBlock(title: string, data: unknown): ToolResult {
  const s = JSON.stringify(data, null, 2) ?? 'null';
  const body = s.length > 30_000 ? s.slice(0, 30_000) + '\n...qisqartirildi' : s;
  return result(title + '\n\n```json\n' + body + '\n```');
}
