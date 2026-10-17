// Open-data tools, tested against the real Socrata endpoints.
//
// Every endpoint here was probed before the code was written, and four assumptions were wrong. Those
// probes are the offline half of this file; the live calls below assert the behaviour the code
// depends on, so a change upstream that breaks one of them fails loudly instead of returning an
// empty result that looks like "no data".

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { isDatasetId, parseReference, soqlIdentifier } from '../src/tools/opendata/_opendata.js';
import type { ToolResult } from '../src/core/types.js';

function payload(result: ToolResult): Record<string, never> {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  return match ? (JSON.parse(match[1]) as Record<string, never>) : ({} as Record<string, never>);
}

describe('dataset references', () => {
  it('accepts an id, a permalink and a SODA URL alike', () => {
    // Every public link on these portals contains the id, and three different shapes are what a
    // caller actually pastes.
    expect(parseReference('8wbx-tsch')).toEqual({ id: '8wbx-tsch', domain: '' });
    expect(parseReference('https://data.cityofnewyork.us/d/8wbx-tsch')).toEqual({
      id: '8wbx-tsch',
      domain: 'data.cityofnewyork.us',
    });
    expect(parseReference('data.cityofnewyork.us/resource/8wbx-tsch.json?$limit=5')).toEqual({
      id: '8wbx-tsch',
      domain: 'data.cityofnewyork.us',
    });
  });

  it('rejects a reference with no id at all, whatever the host', () => {
    expect(parseReference('https://evil.example.com/d/8wbx-tsch')).toEqual({
      id: '8wbx-tsch',
      domain: 'evil.example.com',
    });
    expect(parseReference('traffic accidents')).toEqual({ error: expect.stringContaining('topilmadi') });
  });

  it('takes the host from a real .us portal, which a .gov-only rule rejected', () => {
    // `data.cityofnewyork.us` is one of the largest portals on the network and was being thrown away
    // by a `.gov` test. The safety now comes from the catalog, not from the suffix.
    expect(parseReference('https://data.cityofnewyork.us/d/8wbx-tsch').domain).toBe('data.cityofnewyork.us');
    expect(parseReference('8wbx-tsch').domain).toBe('');
  });

  it('ignores a host with credentials, a port or path characters', () => {
    // Shape check, not a security boundary - but a URL with a userinfo section should never become a
    // request target, and it costs one pattern to refuse it here.
    expect(parseReference('https://user:pass@evil.example.com/d/8wbx-tsch').domain).toBe('');
    expect(parseReference('8wbx-tsch#a/../../b').domain).toBe('');
  });

  it('prefers the catalog’s domain over one typed in the input', async () => {
    // The catalog is the authority on which portal owns an id. A wrong host in a pasted link is a
    // common typo, and following it would 404 or - worse - read a different dataset.
    const data = payload(
      await callTool('pro_opendata_dataset', {
        dataset: 'https://data.fortworthtexas.gov/d/8wbx-tsch',
      }),
    );
    expect(data.domain).toBe('data.cityofnewyork.us');
  });

  it('says so when there is no id at all, rather than guessing', () => {
    expect(parseReference('traffic accidents')).toEqual({
      error: expect.stringContaining('topilmadi'),
    });
    expect(parseReference('')).toEqual({ error: expect.any(String) });
  });

  it('recognises the id shape', () => {
    expect(isDatasetId('8wbx-tsch')).toBe(true);
    expect(isDatasetId('8WBX-TSCH')).toBe(true);
    expect(isDatasetId('not-an-id')).toBe(false);
    expect(isDatasetId('8wbx-tsch-extra')).toBe(false);
  });
});

describe('SoQL identifiers', () => {
  it('quotes a name that needs quoting', () => {
    // Column names are written by people and contain spaces and punctuation regularly.
    expect(soqlIdentifier('license_type')).toBe('license_type');
    expect(soqlIdentifier('Creation Time')).toBe('`Creation Time`');
    expect(soqlIdentifier('we`ird')).toBe('`weird`');
  });
});

describe('live: catalog search', () => {
  it('returns datasets with a domain and an id', async () => {
    const result = await callTool('pro_opendata_search', { query: 'traffic accident', limit: 5 });
    const data = payload(result);
    expect(result.isError).toBeFalsy();
    expect(data.results.length).toBeGreaterThan(0);
    const first = (data.results as unknown as Array<Record<string, string>>)[0];
    expect(first.id).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    expect(first.domain.length).toBeGreaterThan(0);
  });

  it('reports the catalog total rather than the page length', async () => {
    // Falling back to the page length would say "3 results" for a catalog of 920.
    const result = await callTool('pro_opendata_search', { domain: 'data.cityofnewyork.us', limit: 2 });
    const data = payload(result);
    expect(typeof data.total).toBe('number');
    expect(data.returned).toBe(2);
  });

  it('explains that a search with neither query nor domain is incomplete', async () => {
    // The schema now declares `anyOf: [query, domain]`, so the central guard refuses the call before the
    // handler runs. That is the better place for it: a refusal that comes from the published contract
    // rather than from a handler that happens to check.
    const result = await callTool('pro_opendata_search', {});
    expect(result.isError).toBeTruthy();
    const body = (result.content ?? []).map((item) => (item.type === 'text' ? item.text : '')).join(' ');
    expect(body).toMatch(/query/);
  });
});

describe('live: resolving an id to a domain', () => {
  it('finds the dataset from a bare id', async () => {
    // `?q=<id>` returns nothing - measured on four URL variations - so this depends entirely on the
    // `?ids=` parameter. If that ever stops working, this test is the one that says so.
    const result = await callTool('pro_opendata_dataset', { dataset: '8wbx-tsch' });
    const data = payload(result);
    expect(data.error).toBeUndefined();
    expect(data.domain).toBe('data.cityofnewyork.us');
    expect(data.columns_total).toBeGreaterThan(5);
  });

  it('does not invent a row count it was never told', async () => {
    // `rowsUpdatedAt` is a timestamp and `viewCount` is page views. Printing either under
    // `row_count` reads as a row total and is wrong.
    const data = payload(await callTool('pro_opendata_dataset', { dataset: '8wbx-tsch' }));
    expect('row_count' in data).toBe(false);
    expect(data.row_count_hint).toEqual(expect.stringContaining('pro_opendata_count'));
  });

  it('reports an unknown id as unknown', async () => {
    const data = payload(await callTool('pro_opendata_dataset', { dataset: 'aaaa-bbbb' }));
    expect(data.error).toEqual(expect.stringContaining('aaaa-bbbb'));
  });
});

describe('live: rows through SODA', () => {
  it('returns rows and the fields present', async () => {
    const data = payload(await callTool('pro_opendata_rows', { dataset: '8wbx-tsch', limit: 3 }));
    expect(data.count).toBe(3);
    expect((data.fields as unknown as string[]).length).toBeGreaterThan(3);
  });

  it('honours $select', async () => {
    const data = payload(
      await callTool('pro_opendata_rows', {
        dataset: '8wbx-tsch',
        limit: 2,
        select: 'license_type,vehicle_license_number',
      }),
    );
    expect(data.fields).toEqual(['license_type', 'vehicle_license_number']);
  });

  it('passes the provider message through for a column that does not exist', async () => {
    // The provider says "No such column: yoqoq_ustun", which names the mistake better than anything
    // this code could compose.
    const data = payload(
      await callTool('pro_opendata_rows', { dataset: '8wbx-tsch', limit: 2, select: 'yoqoq_ustun' }),
    );
    expect(data.error).toMatch(/no-such-column|No such column|column/i);
  });

  it('says "no rows" rather than failing when a filter matches nothing', async () => {
    const data = payload(
      await callTool('pro_opendata_rows', {
        dataset: '8wbx-tsch',
        limit: 2,
        where: "license_type='BuQiYoqShart'",
      }),
    );
    expect(data.count).toBe(0);
    expect(data.rows).toEqual([]);
  });

  it('distinguishes a portal with no data API from a bad query', async () => {
    // data.fortworthtexas.gov answers 200 with an HTML page for SODA. Reporting that as an empty result
    // would tell the caller their query matched nothing.
    const data = payload(await callTool('pro_opendata_rows', { dataset: 'eax3-qev8', limit: 2 }));
    expect(data.portal_without_data_api).toBe(true);
  });
});

describe('live: aggregates', () => {
  it('returns the row total as a number', async () => {
    // SoQL returns every aggregate as a string, `{"count":"104900"}` included.
    const data = payload(await callTool('pro_opendata_count', { dataset: '8wbx-tsch' }));
    expect(typeof data.total).toBe('number');
    expect(data.total as unknown as number).toBeGreaterThan(1000);
  });

  it('groups by a column', async () => {
    const data = payload(await callTool('pro_opendata_count', { dataset: '8wbx-tsch', group_by: 'license_type' }));
    const rows = data.rows as unknown as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(typeof rows[0].count).toBe('number');
  });

  it('documents the flattened aggregate names it produces', async () => {
    // Measured: SoQL returns `min_vehicle_license_number`, not `min(vehicle_license_number)`.
    const data = payload(
      await callTool('pro_opendata_count', {
        dataset: '8wbx-tsch',
        min: 'vehicle_license_number',
        max: 'vehicle_license_number',
      }),
    );
    expect(data.column_naming).toEqual(expect.stringContaining('min_ustun'));
    expect('min_vehicle_license_number' in ((data.rows as unknown[])[0] as object)).toBe(true);
  });
});

describe('live: column profiling', () => {
  it('lists columns without querying when asked to', async () => {
    const data = payload(await callTool('pro_opendata_columns', { dataset: '8wbx-tsch', only_list: true, limit: 4 }));
    expect(data.columns).toHaveLength(4);
    expect(data.profiled).toBeUndefined();
  });

  it('profiles one column and reports its most frequent values', async () => {
    const data = payload(
      await callTool('pro_opendata_columns', { dataset: '8wbx-tsch', column: 'license_type', top: 3 }),
    );
    expect(data.profiled).toBe(1);
    const first = (data.columns as unknown as Array<Record<string, unknown>>)[0];
    expect(first.field_name).toBe('license_type');
    expect((first.top_values as unknown[]).length).toBeGreaterThan(0);
  });

  it('lists the available names when the requested column is absent', async () => {
    const data = payload(await callTool('pro_opendata_columns', { dataset: '8wbx-tsch', column: 'yoqoq_ustun' }));
    expect(data.error).toEqual(expect.stringContaining('yoqoq_ustun'));
    expect((data.available as unknown[]).length).toBeGreaterThan(0);
  });
});
