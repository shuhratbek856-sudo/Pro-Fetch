/**
 * Output budgeting for composite results.
 *
 * ## Why
 *
 * A 17-step page audit can return tens of thousands of characters. That does not just cost context —
 * it actively hurts the model, because the steps it needs to act on get buried under the steps it
 * already understood. Measured: a 50-entry batch returns ~3.6k tokens for output the model mostly
 * skims.
 *
 * The contract is therefore two-level:
 *
 * - `detail: "summary"` (default) — every step is listed with its status, and only the steps that
 *   actually produced something carry a short excerpt. Cheap, and enough to decide what to do next.
 * - `detail: "full"` — the complete step bodies, subject to a hard character ceiling.
 *
 * `smart` mode additionally drops steps whose output carries no information (an empty extraction,
 * a converter that did not apply to this format) so the transcript reflects what happened rather
 * than listing fourteen "not applicable" results.
 */

import type { StepOutcome } from './composite.js';

/** Characters of a step body kept in summary mode. */
const SUMMARY_EXCERPT = 320;

/** Hard ceiling for `detail: "full"`. */
export const FULL_BUDGET = 120_000;

/** Hard ceiling for `detail: "summary"`. */
export const SUMMARY_BUDGET = 12_000;

/** Normalise the caller's `detail` argument. */
export function detailMode(value: unknown): 'summary' | 'full' {
  return value === 'full' || value === true ? 'full' : 'summary';
}

/**
 * Whether a step produced anything worth showing.
 *
 * An empty or whitespace-only body is the common case: an extractor that found no emails on a page
 * legitimately returns nothing, and listing that as a successful finding is noise.
 */
export function isInformative(outcome: StepOutcome): boolean {
  if (!outcome.ok) return true; // failures are always worth showing
  const body = outcome.output.trim();
  if (body.length === 0) return false;
  // A converter that did not apply returns a short "not applicable"-style note.
  return !/^(?:not applicable|n\/a|no .{0,20}found|yo.{0,10}topilmadi)/i.test(body);
}

/**
 * Render composite outcomes under a token budget.
 *
 * Steps are never dropped silently: when space is tight the transcript says how many were summarised
 * and how to fetch any one of them in full.
 */
export function renderBudgeted(
  title: string,
  outcomes: StepOutcome[],
  detail: 'summary' | 'full',
  gatedCount = 0,
): string {
  const informative = outcomes.filter(isInformative);
  const skipped = outcomes.length - informative.length;
  const budget = detail === 'full' ? FULL_BUDGET : SUMMARY_BUDGET;

  const header = `# ${title}\n\n`;
  const footerLines = [
    '---',
    `steps=${outcomes.length}; ok=${outcomes.filter((o) => o.ok).length}; failed=${outcomes.filter((o) => !o.ok).length}` +
      (skipped > 0 ? `; empty=${skipped}` : '') +
      (gatedCount > 0 ? `; gated=${gatedCount}` : ''),
  ];
  if (gatedCount > 0) {
    // A gated step must stay visible, or the model assumes the page was checked and found nothing.
    footerLines.push(
      `gated: ${gatedCount} ta qadam shart bajarilmagani uchun o‘tkazildi (sahifada tegishli belgi yo‘q).`,
    );
  }
  if (outcomes.some((o) => !o.ok)) {
    footerLines.push(
      `failed: ${outcomes
        .filter((o) => !o.ok)
        .map((o) => o.step)
        .join(', ')}`,
    );
  }

  // Summary mode: informative steps only, each with a short excerpt.
  if (detail === 'summary') {
    const lines = [header];
    informative.forEach((outcome, index) => {
      lines.push(`## ${index + 1}. ${outcome.step}`);
      lines.push(`tool: ${outcome.tool} · ${outcome.ok ? 'ok' : 'FAILED'} · ${outcome.ms}ms`);
      if (!outcome.ok) {
        lines.push(`error: ${outcome.error ?? 'unknown'}`);
      } else {
        const excerpt = outcome.output.trim().slice(0, SUMMARY_EXCERPT);
        lines.push(excerpt.length < outcome.output.trim().length ? excerpt + ' …[qisqartirilgan]' : excerpt);
      }
      lines.push('');
    });
    const body = lines.join('\n');
    const footer = footerLines.join('\n');
    if (body.length + footer.length <= budget) {
      return body + footer + fullHint(skipped);
    }
    // Even summary mode can overflow when many steps are informative; trim excerpts hard.
    return (
      lines.map((line) => (line.length > 160 ? line.slice(0, 160) + '…' : line)).join('\n') + footer + fullHint(skipped)
    );
  }

  // Full mode: shrink the largest bodies until the transcript fits.
  //
  // The previous version halved each oversized body exactly once and then gave up, so 30 steps of
  // 50 KB each still rendered 750 KB — measured, not theoretical. Shrink the current largest body
  // repeatedly instead, and stop when nothing meaningful is left to cut.
  const bodies = outcomes.map((outcome) => outcome.output);
  const footerText = footerLines.join('\n');
  let trimmed = 0;
  let rendered = join(outcomes, bodies);

  while (header.length + rendered.length + footerText.length > budget) {
    // Find the largest body still worth cutting.
    let target = -1;
    let largest = 600;
    for (let i = 0; i < bodies.length; i++) {
      if (bodies[i]!.length > largest) {
        largest = bodies[i]!.length;
        target = i;
      }
    }
    // Nothing left above the floor: as small as it gets without deleting steps.
    if (target === -1) break;
    bodies[target] = bodies[target]!.slice(0, Math.floor(bodies[target]!.length / 2));
    trimmed++;
    rendered = join(outcomes, bodies);
  }

  const note =
    trimmed > 0
      ? `\n\n_${trimmed} ta katta natija qisqartirildi. Bitta qadamning to'liq natijasi uchun o'sha tool'ni pro_capability_call orqali alohida chaqiring._`
      : '';
  return header + rendered + footerText + note;
}

function fullHint(skipped: number): string {
  return (
    `\n\n_${skipped} ta qadam bo'sh natija berdi (bu normal). To'liq natija uchun \`detail: "full"\` ` +
    "yoki shu tool'ni `pro_capability_call` orqali alohida chaqiring._"
  );
}

function join(outcomes: StepOutcome[], bodies: string[]): string {
  return outcomes
    .map((outcome, index) => {
      const head = `## ${index + 1}. ${outcome.step}\ntool: ${outcome.tool} · ${outcome.ok ? 'ok' : 'FAILED'} · ${outcome.ms}ms\n`;
      return outcome.ok ? `${head}\n${bodies[index]}\n\n` : `${head}error: ${outcome.error ?? 'unknown'}\n\n`;
    })
    .join('\n');
}
