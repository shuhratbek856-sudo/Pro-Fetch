import { jsonBlock, fail } from '../../core/format.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_date_convert — Parse an ISO date or epoch timestamp and convert timezone
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_date_convert',
  description: 'Parse an ISO date or epoch timestamp and convert timezone',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'string', description: 'ISO sana yoki epoch (sek/msek)' },
      to_tz: { type: 'string', description: 'Maqsad IANA timezone (UTC)' },
    },
    required: ['value'],
  },
  async handler(input) {
    const p = view(input);
    const raw = String(p.value ?? '').trim();
    let d: Date;
    if (/^\d{10}$/.test(raw)) d = new Date(Number(raw) * 1000);
    else if (/^\d{13}$/.test(raw)) d = new Date(Number(raw));
    else d = new Date(raw);
    if (Number.isNaN(d.getTime())) return fail('Sana tushunarsiz.');
    const toTz = String(p.to_tz || 'UTC');
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: toTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(d);
    } catch {
      return fail('to_tz yaroqsiz IANA timezone.');
    }
    const get = (type: string) => parts.find((x) => x.type === type)?.value ?? '';
    return jsonBlock('# Date', {
      input: raw,
      utc: d.toISOString(),
      target_timezone: toTz,
      local:
        get('year') +
        '-' +
        get('month') +
        '-' +
        get('day') +
        ' ' +
        get('hour') +
        ':' +
        get('minute') +
        ':' +
        get('second'),
      timestamp_ms: d.getTime(),
    });
  },
});
