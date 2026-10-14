import { result, jsonBlock, fail } from '../../core/format.js';
import { hasSecondText, measureOrCompare } from '../../core/text-comparison.js';

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
      text2: {
        type: 'string',
        description: 'Ikkinchi matn — berilsa, ikkala matn o‘lchanadi va hissiyat siljishi chiqariladi',
      },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const analyse = (raw: string) => {
      const text = ' ' + raw.toLowerCase() + ' ';
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
      return {
        score,
        verdict: score > 0 ? 'ijobiy 😊' : score < 0 ? 'salbiy 🙁' : 'neytral 😐',
      };
    };

    // `text2` was declared and ignored. Scoring both texts and reporting the shift answers the only
    // question a second input raises here: did the tone move, and by how much.
    const { result: sentiment, comparison } = measureOrCompare(
      String(p.text ?? ''),
      hasSecondText(p.text2) ? p.text2 : undefined,
      analyse,
    );

    if (!comparison) return jsonBlock('# Sentiment', sentiment);
    return jsonBlock('# Sentiment (taqqoslash)', {
      text: sentiment,
      [comparison.label]: comparison.second,
      ...(comparison.delta ? { delta: comparison.delta } : {}),
      shifted: sentiment.verdict !== comparison.second.verdict,
    });
  },
});
