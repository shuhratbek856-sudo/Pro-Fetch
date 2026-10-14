import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_w3c_spec_read — Read a W3C specification page
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/** Heading the caller asked for, plus the text that belongs to it. */
interface ExtractedSection {
  heading: string;
  body: string;
}

const HEADING = /^(#{1,6})\s+(.*)$/;

/** Normalise for a case- and punctuation-insensitive heading comparison. */
function normaliseHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cut one section out of a specification by heading.
 *
 * A match ends at the next heading of the same or shallower depth, so requesting `4.2 Foo` returns
 * `4.2` and its `4.2.1`/`4.2.2` children but stops before `5 Bar`. Matching is exact after
 * normalisation first and substring second, which covers both `section` and `4.2. section` without
 * making `2` match `4.2`.
 *
 * Returns undefined when no heading matches, so the caller can say so instead of silently returning
 * the whole document - which is what this parameter did before it was implemented.
 */
export function extractSection(markdown: string, wanted: string): ExtractedSection | undefined {
  const target = normaliseHeading(wanted);
  if (!target) return undefined;

  const lines = markdown.split('\n');
  const heads: { index: number; depth: number; title: string }[] = [];
  let insideFence = false;

  for (let i = 0; i < lines.length; i++) {
    // A `#` line inside a fenced code block is sample text, not a heading.
    if (/^\s*(```|~~~)/.test(lines[i])) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    const match = HEADING.exec(lines[i]);
    if (match) heads.push({ index: i, depth: match[1].length, title: match[2].trim() });
  }

  const found = heads.find((head) => {
    const title = normaliseHeading(head.title);
    return title === target || title.includes(target);
  });
  if (!found) return undefined;

  let end = lines.length;
  for (const head of heads) {
    if (head.index > found.index && head.depth <= found.depth) {
      end = head.index;
      break;
    }
  }

  return {
    heading: found.title,
    body: lines
      .slice(found.index + 1, end)
      .join('\n')
      .trim(),
  };
}

export default defineTool({
  name: 'pro_fetch_w3c_spec_read',
  description: 'Read a W3C specification page',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Spec sahifasi URL' },
      section: { type: 'string', description: "Bo'lim (ixtiyoriy)" },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchUrl(String(p.url));
    if (r.status >= 400) return fail('Sahifa topilmadi');

    const wanted = typeof p.section === 'string' ? p.section.trim() : '';
    // `section` was declared in the schema and then never read, so a caller who passed it got the
    // whole specification back and had to find the part themselves. Implement it: a W3C spec is far
    // too large to read whole, and asking for one section is the common case.
    if (!wanted) return md('# ' + p.url + '\n\n' + r.markdown);

    const extracted = extractSection(r.markdown, wanted);
    if (!extracted) {
      return fail(`Bo'lim topilmadi: "${wanted}". Sahifa: ${p.url}`);
    }
    return md(`# ${p.url} — ${extracted.heading}\n\n${extracted.body}`);
  },
});
