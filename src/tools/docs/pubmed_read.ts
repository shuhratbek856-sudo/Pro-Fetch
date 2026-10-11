import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_pubmed_read — Read a PubMed article with abstract
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_pubmed_read',
  description: 'Read a PubMed article with abstract',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'PubMed ID (PMID)' },
    },
    required: ['id'],
  },
  async handler(input) {
    const p = view(input);
    const id = encodeURIComponent(String(p.id));
    const s = await fetchWithOptions(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=' + id + '&retmode=json',
    );
    const a = await fetchWithOptions(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=' + id + '&rettype=abstract&retmode=text',
    );
    return md(
      '# PubMed ' + p.id + '\n\n' + clipToTokens(s.text, 2500) + '\n\n## Abstract\n\n' + clipToTokens(a.text, 4000),
    );
  },
});
