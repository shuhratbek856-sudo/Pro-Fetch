import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_sentiment_analyze — Score the sentiment of a text
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_sentiment_analyze',
  description: 'Score the sentiment of a text',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Kirish matni' },
      text2: { type: 'string', description: 'Ikkinchi matn (diff uchun)' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const text = ' ' + String(p.text ?? '').toLowerCase() + ' ';
    const pos = [
      'good',
      'great',
      'excellent',
      'best',
      'love',
      'happy',
      'fast',
      'useful',
      'amazing',
      'wonderful',
      'yaxshi',
      "zo'r",
      "a'lo",
      'sevaman',
    ];
    const neg = [
      'bad',
      'worst',
      'terrible',
      'hate',
      'slow',
      'bug',
      'broken',
      'useless',
      'poor',
      'awful',
      'yomon',
      'buzuq',
      'sevmayman',
    ];
    const score = pos.filter((w) => text.includes(' ' + w)).length - neg.filter((w) => text.includes(' ' + w)).length;
    return jsonBlock('# Sentiment', {
      score,
      verdict: score > 0 ? 'ijobiy 😊' : score < 0 ? 'salbiy 🙁' : 'neytral 😐',
    });
  },
});
