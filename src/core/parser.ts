export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function htmlToMarkdown(html: string): Promise<string> {
  try {
    const [turndown, cheerio] = await Promise.all([import('turndown'), import('cheerio')]);
    const $ = cheerio.load(html);
    $('script, style, noscript, nav, footer, aside').remove();
    const body = $('article').html() ?? $('body').html() ?? html;
    const td = new turndown.default({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    return td.turndown(body);
  } catch {
    return htmlToText(html);
  }
}
