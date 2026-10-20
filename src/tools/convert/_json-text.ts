/**
 * Whitespace removal for JSON, without parsing it.
 *
 * ## Why not `JSON.parse` then `JSON.stringify`
 *
 * That is a round trip, and a round trip changes the document:
 *
 * - a duplicate key collapses — `{"a":1,"a":2}` becomes `{"a":2}`, so the first value is gone;
 * - an integer beyond 2^53 loses its low digits — `9007199254740993` becomes `9007199254740992`;
 * - integer-like keys are hoisted to the front, because JavaScript orders object keys that way, so
 *   `{"2":9,"10":10,"b":1}` comes back as `{"10":10,"2":9,"b":1}`.
 *
 * Measured on `pro_fetch_json_minify`: all three losses came from the same `JSON.parse` call. A
 * minifier that changes the value it is minifying is not a minifier, and the ID corruption is the
 * dangerous one — a caller comparing two documents for equality would be told they match.
 *
 * So the whitespace is removed from the text, and the tokens are copied through untouched.
 */

/**
 * Strip insignificant whitespace from JSON text.
 *
 * Whitespace inside a string is significant and is kept. Escape sequences are copied verbatim, so a
 * string containing `\"` does not end early.
 *
 * The input must already be valid JSON; the caller parses it to produce the error message, so a
 * malformed document is reported as malformed rather than silently minified.
 */
export function minifyJsonText(text: string): string {
  let out = '';
  let index = 0;
  const length = text.length;

  while (index < length) {
    const character = text[index]!;

    if (character === '"') {
      // Copy the string verbatim, escape sequences included.
      const start = index;
      index += 1;
      while (index < length) {
        const inner = text[index]!;
        if (inner === '\\') {
          index += 2;
          continue;
        }
        if (inner === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      out += text.slice(start, index);
      continue;
    }

    if (character === ' ' || character === '\t' || character === '\n' || character === '\r') {
      index += 1;
      continue;
    }

    out += character;
    index += 1;
  }

  return out;
}

/**
 * Whether the text contains an integer literal that JavaScript cannot represent exactly.
 *
 * Used to warn rather than to refuse: the document is still valid JSON, and the caller may only be
 * reading it. But a value that changes on the way through is worth saying out loud.
 */
export function hasUnsafeInteger(text: string): boolean {
  // A number that is not inside a string, with more than 15 significant digits, or with a fractional
  // part large enough to need more precision than a double carries.
  const withoutStrings = text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return /-?\d{16,}/.test(withoutStrings);
}
