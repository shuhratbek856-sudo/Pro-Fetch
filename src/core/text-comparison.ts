// Second-input support for the text-measurement tools.
//
// Eleven tools in `src/tools/data/` declared a `text2` property described as "Ikkinchi matn (diff
// uchun)" - second text, for diff. None of them read it: all eleven copied the property from a
// sibling and never implemented the comparison. A caller who passed `text2` got a single result and
// no indication the second argument had been discarded.
//
// Four of them (`csv_stats`, `json_flatten`, `text_summarize`, `dedupe_text`) reshape rather than
// measure, so "the same measurement on a second text" has no coherent meaning for them and their
// `text2` was removed instead. The remaining seven measure a property of the text, and for those the
// comparison is not invented - it is the same function applied to a second input.

/** A measured shape: numbers are compared, anything else is reported side by side. */
export type Measured = Record<string, unknown>;

function isPlainObject(value: unknown): value is Measured {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively collect `second - first` for every numeric leaf that exists in both results.
 *
 * Only leaves present in *both* are reported, so adding a new numeric field to one shape does not
 * invent a delta of zero. Returns undefined when nothing is comparable, which is the signal to fall
 * back to reporting both results unchanged.
 */
function numericDelta(first: Measured, second: Measured, prefix = ''): Measured | undefined {
  const deltas: Measured = {};

  for (const [key, secondValue] of Object.entries(second)) {
    const firstValue = first[key];
    if (firstValue === undefined) continue;

    if (typeof firstValue === 'number' && typeof secondValue === 'number') {
      if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) continue;
      deltas[key] = Number((secondValue - firstValue).toFixed(4));
      continue;
    }

    if (isPlainObject(firstValue) && isPlainObject(secondValue)) {
      const nested = numericDelta(firstValue, secondValue, key);
      if (nested && Object.keys(nested).length) deltas[key] = nested;
    }
  }

  return Object.keys(deltas).length ? deltas : undefined;
}

/** What {@link measureOrCompare} returns: one result, or two plus the difference between them. */
export interface ComparisonEnvelope {
  result: Measured;
  comparison?: { label: string; second: Measured; delta?: Measured };
}

/**
 * Run `compute` over `text`, and over `secondText` as well when one is supplied.
 *
 * With no second text the result is returned exactly as the tool produced it before, so the
 * single-input behaviour and output shape are unchanged. With a second text the envelope carries
 * both measurements plus a numeric delta when the shape allows one.
 *
 * `label` names the second measurement in the output, e.g. `'text2'`.
 */
export function measureOrCompare(
  text: string,
  secondText: string | undefined | null,
  compute: (value: string) => Measured,
  label = 'text2',
): ComparisonEnvelope {
  const result = compute(text);

  const trimmed = typeof secondText === 'string' ? secondText.trim() : '';
  if (!trimmed) return { result };

  const second = compute(trimmed);
  return { result, comparison: { label, second, delta: numericDelta(result, second) } };
}

/**
 * True when the caller supplied something for the second input.
 *
 * `'   '` counts as absent: it is truthy in JavaScript, so a caller leaving an untouched field in
 * place would otherwise get a comparison against an empty document and a wall of misleading deltas.
 */
export function hasSecondText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
