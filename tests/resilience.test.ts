import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import { sniffFormat, assertImagePayload } from '../src/core/media-tools.js';
import { readFileSync } from 'node:fs';
import type { ToolResult } from '../src/core/types.js';

/**
 * Regression tests for faults that ended the process rather than failing a call.
 *
 * An MCP server is a single long-lived process that every tool shares, so the difference between
 * these bugs and ordinary bugs is the blast radius: one malformed input removed all 592 tools from
 * service. Node terminates on an unhandled rejection, and neither a `try`/`catch` in the handler nor
 * a rejection handler on the returned promise helps when the rejection originates on a native
 * addon's worker thread or inside a `.then()` callback that nothing awaits.
 *
 * Each test below corresponds to a crash that was reproduced, fixed and then re-verified here.
 */

const text = (r: ToolResult): string =>
  (r.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

const b64 = (data: string | Buffer): string => Buffer.from(data).toString('base64');

const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<<>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 20 100 Td (hello) Tj ET
endstream
endobj
trailer<</Root 1 0 R/Size 5>>
%%EOF`;

describe('bytes are identified before any decoder sees them', () => {
  it('recognises every format it claims to support', () => {
    expect(sniffFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe('png');
    expect(sniffFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffFormat(Buffer.from('GIF89a'))).toBe('gif');
    expect(sniffFormat(Buffer.from('%PDF-1.7'))).toBe('pdf');
    expect(sniffFormat(Buffer.from('BM......'))).toBe('bmp');
    expect(sniffFormat(Buffer.from('RIFF0000WEBP'))).toBe('webp');
    expect(sniffFormat(Buffer.from('nothing here at all'))).toBe('unknown');
  });

  it('accepts a complete image', () => {
    // A 1x1 transparent PNG, with its real IEND terminator.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    expect(() => assertImagePayload(png, 'test')).not.toThrow();
  });

  it('rejects a header that promises an image but delivers nothing', () => {
    // Four bytes of PNG magic and nothing else. A signature-only check passes this, and the native
    // decoder then dies on it — which is the crash this whole mechanism exists to prevent.
    expect(() => assertImagePayload(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'test')).toThrow(/to‘liq emas|buzilgan/);
  });

  it('rejects a PDF and names the tool that fits it', () => {
    expect(() => assertImagePayload(Buffer.from(PDF), 'test')).toThrow(/PDF/);
  });

  it('rejects input with no recognised signature', () => {
    expect(() => assertImagePayload(Buffer.from('just prose, not an image'), 'test')).toThrow(/aniqlanmadi/);
  });
});

describe('OCR tools refuse undecodable input instead of killing the process', () => {
  // These are separate tools with separate handlers in separate files. A guard added to the one that
  // crashed first left its siblings able to crash, so all three are listed.
  const ocrTools = ['pro_fetch_ocr_image', 'pro_fetch_image_ocr', 'pro_fetch_pdf_ocr'];

  it('covers every OCR entry point that exists', () => {
    const registered = new Set(allTools().map((t) => t.name));
    const actual = [...registered].filter((name) => /ocr/i.test(name));
    expect(actual.sort()).toEqual(ocrTools.sort());
  });

  it('returns an error for a PDF sent to an image OCR tool', async () => {
    for (const tool of ['pro_fetch_ocr_image', 'pro_fetch_image_ocr']) {
      const result = await dispatch(tool, { base64: b64(PDF) });
      expect(result.isError, tool).toBe(true);
      expect(text(result), tool).toMatch(/PDF/);
    }
  }, 30_000);

  it('returns an error for truncated and empty image payloads', async () => {
    for (const tool of ['pro_fetch_ocr_image', 'pro_fetch_image_ocr']) {
      for (const payload of [
        b64([0x89, 0x50, 0x4e, 0x47]),
        b64('text pretending to be an image'),
        b64(Buffer.alloc(2048)),
      ]) {
        const result = await dispatch(tool, { base64: payload });
        expect(result.isError, `${tool} ${payload.slice(0, 12)}`).toBe(true);
      }
    }
  }, 30_000);

  it('still reads a real PDF with the PDF tool', async () => {
    const result = await dispatch('pro_fetch_pdf_ocr', { base64: b64(PDF) });
    expect(result.isError).toBeFalsy();
    // The PDF has a text layer, so this must succeed without reaching OCR at all.
    expect(text(result)).toMatch(/hello/);
  }, 30_000);
});

describe('background work cannot end the session', () => {
  it('the WebSocket tool settles its promise for every malformed address', async () => {
    // `new WebSocket(undefined)` throws synchronously inside a `.then()` callback. With no rejection
    // handler that is an unhandled rejection, which terminates Node: calling this tool without a url
    // killed the server.
    for (const args of [{}, { url: '' }, { url: 'not a url' }, { url: 'http://example.com' }]) {
      const result = await dispatch('pro_fetch_websocket_listen', args);
      // The only requirement is that a response comes back rather than the process dying.
      expect(typeof text(result), JSON.stringify(args)).toBe('string');
      expect(text(result).length, JSON.stringify(args)).toBeGreaterThan(0);
    }
  }, 30_000);

  it('the scheduler clamps a hostile delay and survives a bad call', async () => {
    for (const delay of [Number.NaN, -1, 1e308, 'soon']) {
      const result = await dispatch('pro_fetch_batch_schedule', {
        urls: ['https://example.invalid/'],
        delay_ms: delay,
      });
      expect(typeof text(result), String(delay)).toBe('string');
    }
    const empty = await dispatch('pro_fetch_batch_schedule', { urls: [] });
    expect(empty.isError).toBe(true);
  }, 30_000);
});

describe('the process guards are installed', () => {
  it('server.ts handles both fault classes', () => {
    const source = readFileSync('src/server.ts', 'utf8');
    expect(source).toMatch(/process\.on\(['"]uncaughtException['"]/);
    expect(source).toMatch(/process\.on\(['"]unhandledRejection['"]/);
    // Diagnostics must go to stderr: stdout carries the protocol and writing there corrupts it.
    const guard = source.slice(source.indexOf('installProcessGuards'));
    expect(guard.slice(0, 900)).not.toMatch(/console\.log/);
  });
});
