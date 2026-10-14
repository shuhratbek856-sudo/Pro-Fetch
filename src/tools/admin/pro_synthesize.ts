import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { asRecord, asRecordArray, strOrEmpty, arr, num, view } from '../../core/input.js';
import { renderBudgeted } from '../../core/composite-budget.js';
import type { StepOutcome } from '../../core/composite.js';

/**
 * pro_synthesize — Turn many tool results into one coherent answer.
 *
 * ## Why this exists
 *
 * `pro_capability_call` returns every result, and `pro_capability_map` ranks the tools, but neither
 * answers the question the model actually asked. A research task that fans out to ten sources
 * returns ten separate outputs; the model then has to read all ten, decide which agree, which
 * contradict, and which questions remain open — the exact work the Smart System exists to remove.
 *
 * This composite performs that synthesis. It takes a batch of results (from `pro_capability_call`,
 * or listed directly), extracts the claims each one makes, and produces a single structured answer:
 *
 * - **findings** — the points most sources agree on, ranked by how many sources support them.
 * - **contradictions** — claims where sources disagree, so the model knows what is uncertain.
 * - **gaps** — aspects of the question no source addressed.
 * - **sources** — which tools produced what, so the model can follow up on any point.
 *
 * ## What it deliberately does not do
 *
 * It does not invent. Every claim in the synthesis is traceable to a source output — a finding
 * cites the tools that support it, and a gap is only reported when the sources do not cover it. The
 * synthesis is a reading of the results, not a new answer.
 */

/** One source result to synthesise. */
export interface SynthesisSource {
  tool: string;
  output: string;
  ok?: boolean;
}

/** A claim and the sources that support it. */
interface Finding {
  claim: string;
  supportedBy: string[];
  count: number;
}

/**
 * Split tool output into individual claims.
 *
 * A "claim" here is a sentence or list item — the unit a source makes. Splitting on sentence
 * boundaries and list markers is crude, but it is the unit that agreement and contradiction are
 * measured over, and it keeps every claim traceable to its source.
 */
function claimsOf(output: string): string[] {
  return output
    .split(/(?:\n+|[.!?]\s+|\*\s+|\d+\.\s+)/)
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 15 && claim.length < 500);
}

/**
 * Normalise a claim for comparison.
 *
 * Lowercased and stripped of punctuation, so "Node.js is fast" and "node js is fast" are the same
 * claim for agreement counting. This is deliberately loose — a missed merge is harmless, a wrong
 * merge would be a false agreement.
 */
function normalise(claim: string): string {
  return claim
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Group claims that are the same after normalisation.
 *
 * The first occurrence's original text becomes the representative claim, so the synthesis reads
 * naturally rather than in normalised form.
 */
function groupClaims(sources: SynthesisSource[]): Finding[] {
  const groups = new Map<string, { claim: string; supportedBy: Set<string> }>();
  for (const source of sources) {
    for (const claim of claimsOf(source.output)) {
      const key = normalise(claim);
      if (key.length < 8) continue;
      const existing = groups.get(key);
      if (existing) {
        existing.supportedBy.add(source.tool);
      } else {
        groups.set(key, { claim, supportedBy: new Set([source.tool]) });
      }
    }
  }
  return [...groups.entries()]
    .map(([_, group]) => ({ claim: group.claim, supportedBy: [...group.supportedBy], count: group.supportedBy.size }))
    .filter((finding) => finding.count > 0)
    .sort((a, b) => b.count - a.count || b.claim.length - a.claim.length);
}

/**
 * Find contradictions: claims that appear in one source but are negated in another.
 *
 * Looks for the negation markers a source actually uses ("not", "no", "cannot", "doesn't") rather
 * than trying to detect contradiction semantically, which is not something this module can do
 * honestly. A claim that is affirmed in one source and explicitly negated in another is reported
 * with both sides, so the model can decide which to trust.
 */
function findContradictions(
  sources: SynthesisSource[],
): Array<{ claim: string; affirmed: string[]; denied: string[] }> {
  const contradictions: Array<{ claim: string; affirmed: string[]; denied: string[] }> = [];
  const bySource = sources.map((source) => ({ tool: source.tool, claims: claimsOf(source.output).map(normalise) }));
  for (let i = 0; i < bySource.length; i++) {
    for (let j = i + 1; j < bySource.length; j++) {
      for (const claimA of bySource[i]!.claims) {
        for (const claimB of bySource[j]!.claims) {
          // A contradiction is one claim containing the other's negation.
          if (claimA.length < 10 || claimB.length < 10) continue;
          const aNegatesB =
            /\b(not|no|never|doesn't|don't|cannot)\b/.test(claimA) && claimA.includes(claimB.slice(0, 20));
          const bNegatesA =
            /\b(not|no|never|doesn't|don't|cannot)\b/.test(claimB) && claimB.includes(claimA.slice(0, 20));
          if (aNegatesB || bNegatesA) {
            contradictions.push({
              claim: claimA,
              affirmed: [bySource[i]!.tool],
              denied: [bySource[j]!.tool],
            });
          }
        }
      }
    }
  }
  return contradictions.slice(0, 5);
}

/**
 * Identify gaps: question words in the original task that no source addresses.
 *
 * A gap is a "who/what/where/when/why/how" phrase from the task that does not appear in any source
 * output. This is a conservative check — it only reports gaps the task text makes explicit, so it
 * will not invent gaps the task did not ask about.
 */
function findGaps(task: string, sources: SynthesisSource[]): string[] {
  const questionWords = ['who', 'what', 'where', 'when', 'why', 'how', 'which'];
  const allOutput = sources
    .map((source) => source.output)
    .join(' ')
    .toLowerCase();
  const gaps: string[] = [];
  for (const word of questionWords) {
    const pattern = new RegExp(`\\b${word}\\b`, 'i');
    if (pattern.test(task) && !pattern.test(allOutput)) {
      gaps.push(word);
    }
  }
  return gaps;
}

export default defineTool({
  name: 'pro_synthesize',
  description:
    'Turn many tool results into one coherent answer. Takes a list of { tool, output } (or a batch ' +
    'result from pro_capability_call) and produces findings ranked by source agreement, contradictions, ' +
    'and gaps. Use this after a batch when you need the answer, not the raw results.',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
      task: { type: 'string', description: 'Asl vazifa — gap aniqlash uchun' },
      sources: {
        type: 'array',
        description: "Natijalar ro'yxati",
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string' },
            output: { type: 'string' },
            ok: { type: 'boolean' },
          },
          required: ['tool', 'output'],
        },
      },
    },
    required: ['sources'],
  },
  async handler(input) {
    const p = view(input);
    const task = strOrEmpty(p, 'task').trim();
    const detail = p.detail === 'full' ? 'full' : 'summary';
    const rawSources = arr(p, 'sources');
    if (rawSources.length === 0) return fail('sources bo‘sh. Kamida bitta { tool, output } yuboring.');

    const sources: SynthesisSource[] = [];
    for (const raw of rawSources) {
      const record = asRecord(raw);
      if (!record) continue;
      const tool = strOrEmpty(record, 'tool').trim();
      const output = strOrEmpty(record, 'output').trim();
      if (!tool || !output) continue;
      sources.push({ tool, output, ok: record.ok !== false });
    }
    if (sources.length === 0) return fail("Yo'lqi sources kiritilmagan.");

    const findings = groupClaims(sources);
    const contradictions = findContradictions(sources);
    const gaps = task ? findGaps(task, sources) : [];

    const topFindings = findings.slice(0, detail === 'full' ? 15 : 8);
    const outcomes: StepOutcome[] = sources.map((source, index) => ({
      step: source.tool,
      tool: source.tool,
      ok: source.ok !== false,
      output: source.output,
      ms: 0,
    }));

    return jsonBlock('Synthesis', {
      findings: topFindings,
      contradictions,
      gaps: gaps.length > 0 ? gaps : undefined,
      sources: sources.map((source) => ({ tool: source.tool, preview: source.output.slice(0, 200) })),
      total_claims: findings.length,
      raw: detail === 'full' ? renderBudgeted('Raw results', outcomes, 'full') : undefined,
    });
  },
});
