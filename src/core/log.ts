const lines: string[] = [];

export function log(line: string): void {
  lines.push(new Date().toISOString() + ' ' + line);
  if (lines.length > 200) lines.shift();
}

export function tail(n = 30): string[] {
  return lines.slice(-Math.max(1, n));
}
