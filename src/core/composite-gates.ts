/**
 * Conditional steps for composites.
 *
 * ## Why
 *
 * `pro_audit_page` ran sixteen extractions on every page. On a plain blog post that means asking for
 * schema.org blocks, hreflang tags, prices and image alt coverage — ten calls that cannot produce a
 * finding, costing time and filling the transcript with "none found".
 *
 * The fix is not to hard-code which pages have which markup, because that is guesswork. Each step
 * declares what content it needs, and the composite checks that against the document it already has.
 * A step whose requirement is absent is recorded as skipped, with the reason, so the transcript says
 * why nothing appeared rather than implying the page lacked the property.
 *
 * Conditions are evaluated once against the already-fetched content, before dispatch, so a skipped
 * step costs nothing.
 */

/** One predicate over the fetched document. */
export interface Condition {
  /** Human-readable reason recorded when the condition fails. */
  reason: string;
  test: (context: ConditionContext) => boolean;
}

export interface ConditionContext {
  /** The document body the composite already fetched. */
  text: string;
  url: string;
  /** Results of earlier steps, for conditions that depend on a prior outcome. */
  completed: Map<string, { ok: boolean; output: string }>;
}

const has = (text: string, pattern: RegExp): boolean => pattern.test(text);

/**
 * Content predicates.
 *
 * Kept conservative on purpose. A predicate that is too eager skips a step that could have found
 * something, which is worse than running one extra call: a false negative looks like "not present"
 * when the truth is "we never looked".
 */
export const CONDITIONS = {
  /** JSON-LD blocks only appear when the page emits structured data. */
  jsonLd: (): Condition => ({
    reason: 'sahifada application/ld+json yo‘q',
    test: ({ text }) => has(text, /<script[^>]+type\s*=\s*["']application\/ld\+json["']/i),
  }),

  /** schema.org attributes appear as microdata or RDFa markup. */
  schemaOrg: (): Condition => ({
    reason: 'sahifada schema.org mikrodata yo‘q',
    test: ({ text }) => has(text, /itemscope|itemtype|vocabulary\s*=|typeof\s*=/i),
  }),

  /** hreflang exists only on multilingual pages. */
  hreflang: (): Condition => ({
    reason: 'sahifada hreflang teglari yo‘q',
    test: ({ text }) => has(text, /<link[^>]+hreflang\s*=/i),
  }),

  /** Image alt coverage needs images. */
  images: (): Condition => ({
    reason: 'sahifada rasm yo‘q',
    test: ({ text }) => has(text, /<img\b/i),
  }),

  /** Prices need a currency marker or a price-shaped number. */
  prices: (): Condition => ({
    reason: 'sahifada narx ko‘rsatkichi yo‘q',
    test: ({ text }) =>
      /[$€£¥₽]|\b(?:price|prix|prez|cost|masaq)\b/i.test(text) || /\d+[.,]\d{2}\s*(?:[$€£¥₽]|usd|eur)/i.test(text),
  }),

  /** Phone extraction needs something that looks like a dialable string. */
  phones: (): Condition => ({
    reason: 'sahifada telefon ko‘rsatkichi yo‘q',
    test: ({ text }) => /(?:tel:|telephone|\+\d[\d\s().-]{7,})/i.test(text),
  }),

  /** Structured comments cost nothing to skip when there are none. */
  comments: (): Condition => ({
    reason: 'sahifada HTML izohi yo‘q',
    test: ({ text }) => has(text, /<!--[\s\S]{8,}?-->/),
  }),

  /** Headings need headings. */
  headings: (): Condition => ({
    reason: 'sahifada sarlavha yo‘q',
    test: ({ text }) => has(text, /<h[1-6]\b/i),
  }),

  /** Links need links. */
  links: (): Condition => ({
    reason: 'sahifada havola yo‘q',
    test: ({ text }) => has(text, /<a\b[^>]*href/i),
  }),
} satisfies Record<string, () => Condition>;

export type ConditionName = keyof typeof CONDITIONS;

/** Outcome of evaluating a step's precondition. */
export interface GateResult {
  run: boolean;
  reason?: string;
}

/**
 * Evaluate an optional precondition.
 *
 * A step with no condition always runs — the gate only ever *skips*, never silently alters a step
 * that would otherwise do useful work.
 */
export function gate(context: ConditionContext, condition?: Condition): GateResult {
  if (!condition) return { run: true };
  try {
    return condition.test(context) ? { run: true } : { run: false, reason: condition.reason };
  } catch {
    // A failing predicate must never suppress a step; run it and let the tool report properly.
    return { run: true };
  }
}

/** Build the shared context from a fetched document. */
export function contextFor(text: string, url: string): ConditionContext {
  return { text, url, completed: new Map() };
}

/** Record a completed step so later conditions can consult it. */
export function record(context: ConditionContext, step: string, ok: boolean, output: string): void {
  context.completed.set(step, { ok, output });
}
