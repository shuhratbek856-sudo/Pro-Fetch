import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

function unescapeIcal(value: string): string {
  return value
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcal(text: string): Array<Record<string, string | string[]>> {
  const unfolded = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events: Array<Record<string, string | string[]>> = [];
  let event: Record<string, string | string[]> | undefined;
  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') {
      event = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (event) events.push(event);
      event = undefined;
      continue;
    }
    if (!event) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const [name, ...params] = line.slice(0, separator).split(';');
    const key = name.toUpperCase();
    const value = unescapeIcal(line.slice(separator + 1));
    const previous = event[key];
    if (previous === undefined) event[key] = value;
    else if (Array.isArray(previous)) previous.push(value);
    else event[key] = [previous, value];
    for (const parameter of params) {
      const [paramName, paramValue] = parameter.split('=', 2);
      if (paramName.toUpperCase() === 'TZID' && typeof event[key] === 'string') event[`${key}_TZID`] = paramValue ?? '';
    }
  }
  return events;
}

/**
 * pro_fetch_ical_to_json — Parse an iCalendar file into JSON events
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_ical_to_json',
  description: 'Parse an iCalendar file into JSON events',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "iCalendar manba URL'i" },
      text: { type: 'string', description: 'iCalendar matni' },
      content: { type: 'string', description: 'iCalendar matni' },
      data: { type: 'string', description: 'iCalendar matni' },
    },
    required: ['url'],
  },
  async handler(input) {
    const text = await readTextSource(input, 'iCalendar to JSON');
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('iCalendar VCALENDAR container topilmadi.');
    return result(JSON.stringify(parseIcal(text), null, 2));
  },
});
