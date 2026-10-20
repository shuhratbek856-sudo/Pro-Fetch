export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string, maxTokens = 8000): string[] {
  // `i += size` with a size of zero or a sign pointing away from the end never reaches it: a
  // non-positive budget turned this into an unbounded loop for any non-empty text, hanging the
  // whole server. A budget that cannot define a chunk is a caller bug, so it fails loudly.
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    throw new Error(`chunkText: maxTokens must be a finite positive number, received ${maxTokens}`);
  }
  const size = maxTokens * 4; // taxminiy: 1 token = 4 belgi
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks.length > 0 ? chunks : [''];
}

export function clipToTokens(text: string, maxTokens = 8000): string {
  // Same budget rule as `chunkText`: a non-finite or non-positive budget would keep nothing or
  // everything depending only on the sign, both lies. The default applies instead, because
  // clipping is a best-effort size guard and callers such as `format.md` pass it from tool
  // arguments.
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = 8000;
  const cut = text.slice(0, maxTokens * 4);
  if (text.length <= cut.length) return text;
  return cut + '\n[...qisqartirildi (' + estimateTokens(text) + ' token edi)...]';
}
