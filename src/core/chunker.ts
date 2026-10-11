export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string, maxTokens = 8000): string[] {
  const size = maxTokens * 4; // taxminiy: 1 token = 4 belgi
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks.length > 0 ? chunks : [''];
}

export function clipToTokens(text: string, maxTokens = 8000): string {
  const cut = text.slice(0, maxTokens * 4);
  if (text.length <= cut.length) return text;
  return cut + '\n[...qisqartirildi (' + estimateTokens(text) + ' token edi)...]';
}
