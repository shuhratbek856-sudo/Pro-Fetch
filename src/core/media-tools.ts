import { getCredential } from './credentials.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { load } from 'cheerio';
import exifr from 'exifr';
import { downloadToBuffer, fetchFollowingSafeRedirects, fetchWithOptions } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';
import { capturePageScreenshot } from './browser-tools.js';
import { result } from './format.js';
import type { ToolResult } from './types.js';

/**
 * Native image/OCR dependencies are loaded lazily and cached.
 *
 * `sharp`, `@napi-rs/canvas` and `tesseract.js` ship platform-specific binaries. Static imports
 * put them in the module graph of every `media` tool, so one failed native build aborted the whole
 * server with `ERR_MODULE_NOT_FOUND` — verified by removing `sharp` from `node_modules` and
 * watching `dist/server.js` refuse to boot. That is the difference between "image tools are
 * unavailable" and "no tool works at all" on Alpine, musl, or an unsupported glibc.
 *
 * Each loader now fails only the tool that needs it, with an actionable message.
 */
type SharpModule = typeof import('sharp');
type CanvasModule = typeof import('@napi-rs/canvas');
type TesseractModule = typeof import('tesseract.js');

let sharpPromise: Promise<SharpModule> | undefined;
let canvasPromise: Promise<CanvasModule> | undefined;
let tesseractPromise: Promise<TesseractModule> | undefined;

const INSTALL_HINT =
  'Bu platform uchun binary topilmadi. `npm ci` (majburiy) yoki `npm install --force` bilan qayta o‘rnating.';

function installError(name: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
  return new Error(`${name} yuklanmadi: ${INSTALL_HINT} (${detail})`);
}

async function loadSharp(): Promise<SharpModule> {
  sharpPromise ??= import('sharp').catch((error: unknown) => {
    sharpPromise = undefined;
    throw installError('sharp', error);
  });
  return sharpPromise;
}

async function loadCanvas(): Promise<CanvasModule> {
  canvasPromise ??= import('@napi-rs/canvas').catch((error: unknown) => {
    canvasPromise = undefined;
    throw installError('@napi-rs/canvas', error);
  });
  return canvasPromise;
}

async function loadTesseract(): Promise<TesseractModule> {
  tesseractPromise ??= import('tesseract.js').catch((error: unknown) => {
    tesseractPromise = undefined;
    throw installError('tesseract.js', error);
  });
  return tesseractPromise;
}

/** Report which native media dependencies are usable on this platform. */
export async function nativeMediaAvailable(): Promise<{ sharp: boolean; canvas: boolean; tesseract: boolean }> {
  const probe = async (load: () => Promise<unknown>): Promise<boolean> => {
    try {
      await load();
      return true;
    } catch {
      return false;
    }
  };
  return {
    sharp: await probe(loadSharp),
    canvas: await probe(loadCanvas),
    tesseract: await probe(loadTesseract),
  };
}

type Input = Record<string, unknown>;
const outputDirectory = path.join(os.tmpdir(), 'pro-fetch-mcp');

function str(input: Input, ...keys: string[]): string {
  for (const key of keys)
    if (typeof input[key] === 'string' && String(input[key]).trim()) return String(input[key]).trim();
  return '';
}

async function bytesFromInput(input: Input): Promise<{ bytes: Buffer; contentType: string; source: string }> {
  const base64 = str(input, 'base64', 'data_base64');
  if (base64)
    return { bytes: Buffer.from(base64, 'base64'), contentType: str(input, 'mime_type'), source: 'input base64' };
  const url = str(input, 'url');
  if (!url) throw new Error('url yoki base64 parametri kerak');
  const safe = await assertSafeUrl(url);
  const downloaded = await downloadToBuffer(
    safe.toString(),
    Number(input.max_bytes ?? 50 * 1024 * 1024),
    Number(input.timeout_ms ?? 30_000),
  );
  return { bytes: downloaded.bytes, contentType: downloaded.headers['content-type'] ?? '', source: downloaded.url };
}

async function save(buffer: Buffer, extension: string): Promise<string> {
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `media-${randomUUID()}.${extension.replace(/^\./, '')}`);
  await writeFile(outputPath, buffer);
  return outputPath;
}

async function pdfText(bytes: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => (typeof item.str === 'string' ? item.str : '')).join(' '));
  }
  return pages;
}

async function ocr(bytes: Buffer, language: string): Promise<string> {
  const { createWorker } = await loadTesseract();
  const worker = await createWorker(language);
  try {
    const output = await worker.recognize(bytes);
    return output.data.text;
  } finally {
    await worker.terminate();
  }
}

export async function runMediaTool(toolName: string, input: Input): Promise<ToolResult> {
  const name = toolName.replace(/^pro_fetch_/, '');
  if ((name === 'screenshot_page' || name === 'screenshot_full_page') && str(input, 'url')) {
    const outputPath = await capturePageScreenshot(
      str(input, 'url'),
      name === 'screenshot_full_page' || Boolean(input.full_page),
      str(input, 'selector'),
    );
    return result('Screenshot saqlandi: ' + outputPath);
  }
  if (name === 'audio_transcribe') {
    const url = str(input, 'url');
    if (!url) return result('Audio fayli uchun url kerak.');
    const apiKey = getCredential('OPENAI_API_KEY');
    if (!apiKey) throw new Error('Audio transkripsiya uchun OPENAI_API_KEY kerak (Whisper-compatible API).');
    const media = await bytesFromInput(input);
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(media.bytes)], { type: media.contentType || 'application/octet-stream' }),
      path.basename(new URL(media.source).pathname) || 'audio.bin',
    );
    form.append('model', str(input, 'model') || 'whisper-1');
    if (str(input, 'language')) form.append('language', str(input, 'language'));
    const endpoint =
      (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/audio/transcriptions';
    const safeEndpoint = await assertSafeUrl(endpoint);
    const { response } = await fetchFollowingSafeRedirects(safeEndpoint.toString(), {
      method: 'POST',
      headers: { authorization: 'Bearer ' + apiKey },
      body: form,
      signal: AbortSignal.timeout(Number(input.timeout_ms ?? 120_000)),
    });
    if (!response.ok)
      throw new Error('Transcription API HTTP ' + response.status + ': ' + (await response.text()).slice(0, 1000));
    const output = (await response.json()) as { text?: string };
    return result(output.text ?? 'Transcription API text qaytarmadi.');
  }
  if (name === 'media_download') {
    const media = await bytesFromInput(input);
    const extension =
      str(input, 'extension') ||
      path.extname(new URL(media.source).pathname).slice(1) ||
      media.contentType.split('/')[1]?.split(';')[0] ||
      'bin';
    return result(
      JSON.stringify(
        { path: await save(media.bytes, extension), bytes: media.bytes.byteLength, contentType: media.contentType },
        null,
        2,
      ),
    );
  }
  if (name === 'favicon_fetch') {
    const url = str(input, 'url');
    if (!url) return result('url parametri kerak.');
    const safe = await assertSafeUrl(url);
    const page = await fetchWithOptions(safe.toString());
    const $ = load(page.text);
    const href = $('link[rel~="icon" i]').first().attr('href') || '/favicon.ico';
    const iconUrl = new URL(href, safe).toString();
    const media = await bytesFromInput({ url: iconUrl });
    const iconPath = await save(media.bytes, path.extname(new URL(iconUrl).pathname).slice(1) || 'ico');
    return result(
      JSON.stringify(
        { url: iconUrl, path: iconPath, contentType: media.contentType, bytes: media.bytes.byteLength },
        null,
        2,
      ),
    );
  }
  if (
    name === 'image_info' ||
    name === 'exif_read' ||
    name === 'image_convert' ||
    name === 'image_resize' ||
    name === 'thumbnail_generate' ||
    name === 'svg_to_png'
  ) {
    const media = await bytesFromInput(input);
    // Loaded per call so a platform without the native binary fails only this tool.
    const { default: sharp } = await loadSharp();
    const image = sharp(media.bytes, { failOn: 'none' });
    if (name === 'image_info')
      return result(
        JSON.stringify({ source: media.source, contentType: media.contentType, ...(await image.metadata()) }, null, 2),
      );
    if (name === 'exif_read')
      return result(
        JSON.stringify(
          (await exifr.parse(media.bytes, { tiff: true, exif: true, gps: true, iptc: true, xmp: true })) ?? {},
          null,
          2,
        ),
      );
    const requestedFormat = (
      name === 'svg_to_png' ? 'png' : str(input, 'format') || (name === 'image_convert' ? 'png' : 'webp')
    ).toLowerCase();
    const allowedFormats = ['avif', 'gif', 'jpeg', 'png', 'tiff', 'webp'] as const;
    if (!allowedFormats.includes(requestedFormat as (typeof allowedFormats)[number]))
      throw new Error("Qo'llab-quvvatlanmaydigan image format: " + requestedFormat);
    const outputFormat = requestedFormat as (typeof allowedFormats)[number];
    let operation = image.rotate();
    if (name === 'image_resize' || name === 'thumbnail_generate') {
      const width = Math.max(1, Math.min(Number(input.width ?? 320), 10000));
      const height = Math.max(1, Math.min(Number(input.height ?? 240), 10000));
      operation = operation.resize(width, height, {
        fit: name === 'thumbnail_generate' ? 'cover' : 'inside',
        withoutEnlargement: name !== 'thumbnail_generate',
      });
    }
    const output = await operation.toFormat(outputFormat).toBuffer();
    const outputPath = await save(output, outputFormat);
    return result(
      JSON.stringify(
        {
          path: outputPath,
          format: outputFormat,
          bytes: output.byteLength,
          width: Number(input.width ?? 0) || undefined,
          height: Number(input.height ?? 0) || undefined,
        },
        null,
        2,
      ),
    );
  }
  if (name === 'barcode_qr_read') {
    const media = await bytesFromInput(input);
    const { default: sharp } = await loadSharp();
    const { data, info } = await sharp(media.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const qrModule = (await import('jsqr')) as unknown as {
      default: (
        pixels: Uint8ClampedArray,
        width: number,
        height: number,
      ) => { data: string; type: string; location: unknown } | null;
    };
    const decoded = qrModule.default(new Uint8ClampedArray(data), info.width, info.height);
    return result(
      decoded
        ? JSON.stringify({ data: decoded.data, type: decoded.type, location: decoded.location }, null, 2)
        : 'QR/barcode topilmadi.',
    );
  }
  if (name === 'image_ocr') {
    const media = await bytesFromInput(input);
    return result(await ocr(media.bytes, str(input, 'language') || 'eng'));
  }
  if (name === 'pdf_ocr') {
    const media = await bytesFromInput(input);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data: new Uint8Array(media.bytes), useSystemFonts: true }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = content.items
        .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .trim();
      if (!pageText) {
        const viewport = page.getViewport({ scale: 1.5 });
        const { createCanvas } = await loadCanvas();
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvas: canvas as any, canvasContext: canvas.getContext('2d') as any, viewport }).promise;
        pageText = await ocr(canvas.toBuffer('image/png'), str(input, 'language') || 'eng');
      }
      pages.push(`## Page ${pageNumber}\n\n${pageText}`);
    }
    return result(pages.join('\n\n'));
  }
  if (name === 'video_metadata') {
    const media = await bytesFromInput(input);
    const buffer = media.bytes;
    const text = buffer.toString('latin1');
    const match = text.match(/mvhd[\s\S]{12}([\s\S]{8})/);
    const duration = match ? buffer.readUInt32BE(match.index! + 20) : undefined;
    return result(
      JSON.stringify(
        {
          source: media.source,
          contentType: media.contentType,
          bytes: buffer.byteLength,
          mp4: text.includes('ftyp'),
          durationSeconds: duration,
        },
        null,
        2,
      ),
    );
  }
  throw new Error("Noma'lum media tool: " + toolName);
}
