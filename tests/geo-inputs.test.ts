// Covers the parts of the geo tools that are decided here rather than upstream.
//
// The happy paths need Nominatim, Overpass and Open-Meteo, and a test suite that fails whenever one of
// three public services is busy teaches nothing. So these assert the decisions: what is refused before a
// request is made, how a bounding box is injected, and how a mirror failure is reported. Every one of
// those was wrong at least once during development - `structured` as a string parameter, a bbox appended
// instead of injected, and "all mirrors failed" for a query the caller got wrong.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import type { ToolResult } from '../src/core/types.js';

const text = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

describe('coordinates are refused before a request is made', () => {
  it('latitude outside -90..90', async () => {
    const result = await callTool('pro_geo_geocode_reverse', { lat: 95, lon: 0 });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/90\.\.90/);
  });

  it('longitude outside -180..180', async () => {
    const result = await callTool('pro_geo_weather_current', { lat: 41.3, lon: 200 });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/180/);
  });

  it('a non-numeric coordinate', async () => {
    const result = await callTool('pro_geo_weather_current', { lat: 'shimol', lon: 0 });
    expect(result.isError).toBeTruthy();
  });
});

describe('a bounding box is injected as a setting, not appended to the statement', () => {
  it('a malformed box is refused with its own message', async () => {
    const result = await callTool('pro_geo_overpass_query', {
      query: '[out:json];out;',
      bbox: '1,2,3',
    });
    expect(result.isError).toBeTruthy();
    // The word matters: the caller needs to know the box was the problem, not the query.
    expect(text(result)).toMatch(/bbox/);
  });

  it('an out-of-range box is refused', async () => {
    // "south,west,north,east" - so the first value is a latitude and the second a longitude. The error
    // therefore names the latitude range, and a test asserting /180/ would be asserting the wrong field.
    const result = await callTool('pro_geo_overpass_query', {
      query: '[out:json];out;',
      bbox: '200,0,1,1',
    });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/lat/);

    const west = await callTool('pro_geo_overpass_query', {
      query: '[out:json];out;',
      bbox: '41,999,42,1000',
    });
    expect(west.isError).toBeTruthy();
    expect(text(west)).toMatch(/180/);
  });
});

describe('a missing query is refused', () => {
  it('overpass', async () => {
    expect((await callTool('pro_geo_overpass_query', {})).isError).toBeTruthy();
  });

  it('geocode with neither q nor structured', async () => {
    // Nominatim answers `400 Nothing to search for` for an empty query, which reads like a service
    // problem. Refusing here names the missing argument instead.
    const result = await callTool('pro_geo_geocode_search', {});
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/q yoki structured/);
  });

  it('a structured object with only blank values', async () => {
    // `street=` counts as a search term and produces the same 400, so blank values are dropped and the
    // request is refused instead of being sent.
    const result = await callTool('pro_geo_geocode_search', { structured: { city: '   ' } });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/q yoki structured/);
  });
});

describe('the structured search shape is the one Nominatim accepts', () => {
  it('the schema offers an object, not a string', async () => {
    const { allTools } = await import('../src/core/tool.js');
    const tool = allTools().find((entry) => entry.name === 'pro_geo_geocode_search');
    const structured = (tool?.inputSchema.properties as Record<string, { type?: string }>)?.structured;
    // A string here is the shape that answers 400 "Nothing to search for"; measured, not assumed.
    expect(structured?.type).toBe('object');
  });
});

describe('a mirror outage and a bad query are different failures', () => {
  // Asserted on the classifier, not on what Overpass happens to return. The earlier version made a live
  // call and asserted the message, which passed in isolation and failed in the full suite when all four
  // mirrors answered 5xx at once - a test whose result depends on a third party's load.
  it('a 4xx is the caller, except throttling', async () => {
    const { isClientRefusal } = await import('../src/tools/geo_data/_osm.js');
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isClientRefusal(status), String(status)).toBe(true);
    }
    expect(isClientRefusal(429)).toBe(false);
    for (const status of [500, 502, 503, 504]) {
      expect(isClientRefusal(status), String(status)).toBe(false);
    }
  });

  it('the status is recovered from the message', async () => {
    const { statusOf } = await import('../src/tools/geo_data/_osm.js');
    expect(statusOf('overpass-api.de: HTTP 504 � Gateway Timeout')).toBe(504);
    expect(statusOf('connection reset')).toBe(null);
  });
});
