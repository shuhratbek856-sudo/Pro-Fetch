import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { assertSafeUrl, assertStableSafeUrl } from './ssrf-guard.js';
import { assertWritable } from './read-only-guard.js';
import { assertReadablePath, assertWritablePath } from './path-containment.js';
import { outputFileName } from './output-dir.js';
import { result } from './format.js';
import type { ToolResult } from './types.js';

type Input = Record<string, unknown>;
type Session = { browser: Browser; page: Page; console: string[]; network: string[]; persist: boolean };
const sessions = new Map<string, Session>();

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function browserStatePath(): string {
  const dir = process.env.PRO_FETCH_CACHE_DIR?.trim() || path.join(os.homedir(), '.pro-fetch');
  return path.join(dir, 'browser-state.json');
}

// Injected before any page script runs; masks the most common headless/automation tells.
const STEALTH_INIT = `
Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
try{Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});}catch(e){}
try{Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});}catch(e){}
window.chrome = window.chrome || { runtime: {} };
try{var __oq = navigator.permissions && navigator.permissions.query; if(__oq){navigator.permissions.query = function(p){ return (p && p.name==='notifications') ? Promise.resolve({state: Notification.permission}) : __oq.call(navigator.permissions, p); };}}catch(e){}
try{Object.defineProperty(navigator,'deviceMemory',{get:()=>8});}catch(e){}
try{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});}catch(e){}
`;

function maxBrowserSessions(): number {
  const value = Number(process.env.PRO_FETCH_BROWSER_MAX_SESSIONS ?? 8);
  return Number.isFinite(value) ? Math.max(1, Math.min(32, Math.floor(value))) : 8;
}

async function validateBrowserRequest(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (['data:', 'blob:', 'about:'].includes(url.protocol)) return;
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Browser protocol blocked');
  if (url.username || url.password) throw new Error('URL userinfo blocked');
  await assertSafeUrl(url.toString());
}

function string(input: Input, key: string, fallback = ''): string {
  return typeof input[key] === 'string' ? String(input[key]) : fallback;
}

function sessionId(input: Input): string {
  return string(input, 'session_id', 'default');
}

/** Whether the optional Playwright dependency can be loaded on this platform.
 *
 * Playwright is an `optionalDependencies` entry, so it is legitimately absent — for example on a
 * slim container, or when `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set. Reporting that explicitly is
 * better than surfacing `ERR_MODULE_NOT_FOUND` at the moment a browser tool is first called.
 */
export async function playwrightAvailable(): Promise<boolean> {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
}

async function createSession(id: string, url?: string, input: Input = {}, persist = true): Promise<Session> {
  if (!sessions.has(id) && sessions.size >= maxBrowserSessions()) {
    throw new Error(
      `Browser session limit reached (${maxBrowserSessions()}). Avval foydalanilmayotgan session'ni yoping.`,
    );
  }
  const { chromium } = await import('playwright');
  const channel = (process.env.PRO_FETCH_BROWSER_CHANNEL || '').trim();
  const browser = await chromium.launch({
    headless: true,
    ...(channel ? { channel } : {}),
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-infobars'],
  });
  try {
    const statePath = browserStatePath();
    const storageState = existsSync(statePath) ? statePath : undefined;
    const context = await browser.newContext({
      userAgent: string(input, 'user_agent') || BROWSER_UA,
      locale: 'en-US',
      timezoneId: process.env.PRO_FETCH_BROWSER_TZ || 'America/New_York',
      viewport: { width: Number(input.width ?? 1280), height: Number(input.height ?? 800) },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      ...(storageState ? { storageState } : {}),
    });
    await context.addInitScript({ content: STEALTH_INIT });
    // Declared before the route handler so the handler can tell a top-level navigation from a sub-resource.
    let page: Page | undefined;
    // SSRF protection must apply to every browser request, not only the first navigation URL.
    await context.route('**/*', async (route) => {
      try {
        const request = route.request();
        // A top-level navigation gets the two-lookup stability check; sub-resources keep the single one.
        // The reasoning, and what this does not close, is on `assertStableSafeUrl`.
        if (request.isNavigationRequest() && request.frame() === page?.mainFrame()) {
          await assertStableSafeUrl(request.url());
        } else {
          await validateBrowserRequest(request.url());
        }
        await route.continue();
      } catch {
        await route.abort('blockedbyclient').catch(() => {});
      }
    });
    page = await context.newPage();
    const session: Session = { browser, page, console: [], network: [], persist };
    page.on('console', (message) => session.console.push(`[${message.type()}] ${message.text()}`));
    page.on('pageerror', (error) => session.console.push('[pageerror] ' + error.message));
    page.on('requestfailed', (request) =>
      session.network.push(`FAIL ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`),
    );
    page.on('response', (response) =>
      session.network.push(`${response.status()} ${response.request().method()} ${response.url()}`),
    );
    sessions.set(id, session);
    if (url) {
      const safe = await assertSafeUrl(url);
      await page.goto(safe.toString(), { waitUntil: 'domcontentloaded', timeout: Number(input.timeout_ms ?? 20000) });
    }
    return session;
  } catch (error) {
    sessions.delete(id);
    await browser.close().catch(() => {});
    throw error;
  }
}

async function persistState(session: Session): Promise<void> {
  if (!session.persist) return;
  try {
    const p = browserStatePath();
    await mkdir(path.dirname(p), { recursive: true });
    const ctx = session.browser.contexts()[0];
    if (ctx) await ctx.storageState({ path: p });
  } catch {
    /* best-effort */
  }
}

function getSession(id: string): Session {
  const session = sessions.get(id);
  if (!session) throw new Error(`Browser session '${id}' yo'q. Avval browser_open ishlating.`);
  return session;
}

async function saveScreenshot(session: Session, input: Input, fullPage = false): Promise<string> {
  const requested = string(input, 'output_path');
  // A screenshot is a file on disk, so it is a write. Checked here rather than only in the policy engine
  // because the destination may be a default the caller never named, and a write the caller did not ask
  // for is exactly the kind that slips past an argument check.
  assertWritable('skrinshot yozuvi');
  // The default used to be `os.tmpdir()/pro-fetch-mcp`, which sits outside the output root entirely -
  // so the boundary this server enforces did not describe where its output actually went, and a
  // screenshot landed somewhere nothing else could clean up or find. The default is now inside
  // `img-out/`, like every other generated file, and a caller-supplied path still has to pass the
  // containment check.
  const outputPath = requested || outputFileName('img-out', '.png', 'screenshot');
  const selector = string(input, 'selector');
  const target = selector ? session.page.locator(selector).first() : session.page;
  await target.screenshot({ path: outputPath, fullPage: fullPage || Boolean(input.full_page) });
  return outputPath;
}

export async function capturePageScreenshot(url: string, fullPage = false, selector = ''): Promise<string> {
  const id = 'capture-' + randomUUID();
  const session = await createSession(id, url, {}, false);
  try {
    return await saveScreenshot(session, { selector }, fullPage);
  } finally {
    sessions.delete(id);
    await session.browser.close();
  }
}

export async function runBrowserTool(toolName: string, input: Input): Promise<ToolResult> {
  const name = toolName.replace(/^pro_browser_/, '');
  const id = sessionId(input);
  if (name === 'browser_open') {
    const url = string(input, 'url');
    if (!url) return result('url parametri kerak.');
    const previous = sessions.get(id);
    if (previous) {
      sessions.delete(id);
      await persistState(previous);
      await previous.browser.close();
    }
    const session = await createSession(id, url, input);
    return result(
      JSON.stringify({ session_id: id, url: session.page.url(), title: await session.page.title() }, null, 2),
    );
  }
  if (name === 'browser_close') {
    const session = sessions.get(id);
    if (!session) return result(`Browser session '${id}' allaqachon yopiq.`);
    sessions.delete(id);
    await persistState(session);
    await session.browser.close();
    return result(`Browser session '${id}' yopildi.`);
  }
  const session = getSession(id);
  const page = session.page;
  const selector = string(input, 'selector');
  if (name === 'browser_click') {
    if (!selector) throw new Error('selector parametri kerak');
    await page.locator(selector).click({ timeout: Number(input.timeout_ms ?? 10000) });
    return result('Bosildi: ' + selector);
  }
  if (name === 'browser_type') {
    if (!selector) throw new Error('selector parametri kerak');
    await page.locator(selector).fill(string(input, 'text'));
    return result('Matn kiritildi: ' + selector);
  }
  if (name === 'browser_form_fill' || name === 'browser_login_session') {
    let fields = input.fields;
    if (typeof fields === 'string') {
      try {
        fields = JSON.parse(fields);
      } catch {
        throw new Error("fields JSON object bo'lishi kerak");
      }
    }
    if (fields && typeof fields === 'object') {
      for (const [fieldSelector, fieldValue] of Object.entries(fields as Record<string, unknown>))
        await page.locator(fieldSelector).fill(String(fieldValue ?? ''));
    } else if (name === 'browser_login_session') {
      const usernameSelector = string(input, 'username_selector');
      const passwordSelector = string(input, 'password_selector');
      if (usernameSelector) await page.locator(usernameSelector).fill(string(input, 'username'));
      if (passwordSelector) await page.locator(passwordSelector).fill(string(input, 'password'));
    }
    const submit = string(input, 'submit_selector');
    if (submit) await page.locator(submit).click();
    if (input.wait_after_submit !== false) await page.waitForLoadState('domcontentloaded').catch(() => {});
    if (name === 'browser_login_session' && string(input, 'storage_state_path'))
      await session.browser.contexts()[0].storageState({ path: string(input, 'storage_state_path') });
    return result(
      JSON.stringify(
        {
          url: page.url(),
          title: await page.title(),
          fieldsFilled: fields && typeof fields === 'object' ? Object.keys(fields).length : 0,
        },
        null,
        2,
      ),
    );
  }
  if (name === 'browser_scroll') {
    await page.evaluate((amount) => window.scrollBy(0, amount), Number(input.amount ?? input.pixels ?? 600));
    return result(JSON.stringify(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))));
  }
  if (name === 'browser_wait') {
    if (selector)
      await page.locator(selector).waitFor({
        state: string(input, 'state', 'visible') as 'visible' | 'hidden' | 'attached' | 'detached',
        timeout: Number(input.timeout_ms ?? 15000),
      });
    else await page.waitForTimeout(Math.max(0, Math.min(Number(input.wait_ms ?? 1000), 30000)));
    return result('Kutish tugadi: ' + page.url());
  }
  if (name === 'browser_extract_after_action') {
    const locator = selector ? page.locator(selector).first() : page.locator('body');
    const output = string(input, 'attribute')
      ? await locator.getAttribute(string(input, 'attribute'))
      : await locator.innerText();
    return result((output ?? '').slice(0, Number(input.max_chars ?? 20000)));
  }
  if (name === 'browser_evaluate_js') {
    const script = string(input, 'script', string(input, 'code'));
    if (!script) throw new Error('script parametri kerak');
    const value = await page.evaluate(script);
    return result(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }
  if (name === 'browser_console_log')
    return result(session.console.slice(-Number(input.limit ?? 100)).join('\n') || "Console yozuvi yo'q.");
  if (name === 'browser_network_log')
    return result(session.network.slice(-Number(input.limit ?? 100)).join('\n') || "Network yozuvi yo'q.");
  if (name === 'browser_device_emulate') {
    await page.setViewportSize({ width: Number(input.width ?? 390), height: Number(input.height ?? 844) });
    return result(JSON.stringify({ viewport: page.viewportSize(), url: page.url() }, null, 2));
  }
  if (name === 'browser_screenshot' || name === 'browser_print_pdf') {
    if (name === 'browser_screenshot') return result('Screenshot saqlandi: ' + (await saveScreenshot(session, input)));
    const requested = string(input, 'output_path');
    // Same reasoning as the screenshot: the default belongs inside the output root, not in the system
    // temporary directory where nothing else this server writes goes.
    const outputPath = requested || outputFileName('pdf-out', '.pdf', 'page');
    // Same reasoning as the screenshot above: the PDF is a file, the destination may be a default the
    // caller never passed, and `browser_print_pdf` was one of the tools that passed read-only mode.
    assertWritable('PDF yozuvi');
    if (requested) assertWritablePath(requested, 'output_path', 'PDF yozuvi');
    await page.pdf({ path: outputPath, printBackground: true, format: string(input, 'format', 'A4') });
    return result('PDF saqlandi: ' + outputPath);
  }
  throw new Error("Noma'lum browser tool: " + toolName);
}

export async function runBrowserAction(input: Input): Promise<ToolResult> {
  const action = string(input, 'action');
  if (!action) throw new Error('action parametri kerak.');
  const id = sessionId(input);
  const maxChars = Number(input.max_chars ?? 20000);
  const clip = (text: string) => (text.length > maxChars ? text.slice(0, maxChars) + '…[qisqartirildi]' : text);

  if (action === 'list_sessions') return result(JSON.stringify({ sessions: [...sessions.keys()] }, null, 2));
  if (action === 'close_all') {
    const count = sessions.size;
    for (const s of sessions.values()) await s.browser.close().catch(() => {});
    sessions.clear();
    return result(JSON.stringify({ closed: count }));
  }
  if (action === 'close_session') {
    const s = sessions.get(id);
    if (!s) return result(`Session '${id}' yo'q.`);
    sessions.delete(id);
    await persistState(s);
    await s.browser.close();
    return result(`Session '${id}' yopildi.`);
  }

  const session = getSession(id);
  const context = session.browser.contexts()[0];
  const selector = string(input, 'selector');
  const timeout = Number(input.timeout_ms ?? 20000);
  const evalSafe = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    await session.page.waitForLoadState('domcontentloaded').catch(() => {});
    try {
      return await session.page.evaluate(fn as never);
    } catch (e) {
      await new Promise((r) => setTimeout(r, 500));
      return await session.page.evaluate(fn as never);
    }
  };

  switch (action) {
    case 'back':
      await session.page.goBack({ timeout }).catch(() => {});
      break;
    case 'forward':
      await session.page.goForward({ timeout }).catch(() => {});
      break;
    case 'get_url':
      return result(session.page.url());
    case 'get_title':
      return result(await session.page.title());
    case 'get_html':
      return result(clip(await session.page.content()));
    case 'get_text':
      return result(clip(await evalSafe(() => document.body.innerText)));
    case 'get_state': {
      const state = await evalSafe(() => ({
        title: document.title,
        url: location.href,
        links: [...document.querySelectorAll('a')]
          .slice(0, 80)
          .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60))
          .filter(Boolean),
        buttons: [...document.querySelectorAll('button,[role="button"]')]
          .slice(0, 80)
          .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60))
          .filter(Boolean),
        inputs: [...document.querySelectorAll('input,textarea,select')].slice(0, 40).map((e) => ({
          tag: e.tagName.toLowerCase(),
          name: (e as HTMLInputElement).name || '',
          id: (e as HTMLInputElement).id || '',
          placeholder: (e as HTMLInputElement).placeholder || '',
        })),
      }));
      return result(clip(JSON.stringify(state, null, 2)));
    }
    case 'hover':
      await session.page.locator(selector).hover({ timeout: Number(input.timeout_ms ?? 10000) });
      break;
    case 'select':
      await session.page.selectOption(selector, string(input, 'value'));
      break;
    case 'press': {
      const key = string(input, 'key') || string(input, 'value');
      if (!key) throw new Error('press uchun key/value kerak.');
      if (selector) await session.page.locator(selector).press(key);
      else await session.page.keyboard.press(key);
      break;
    }
    case 'new_tab': {
      if (!context) throw new Error('Browser context mavjud emas.');
      const p = await context.newPage();
      session.page = p;
      const url = string(input, 'url');
      if (url) {
        const safe = await assertSafeUrl(url);
        await p.goto(safe.toString(), { waitUntil: 'domcontentloaded', timeout });
      }
      return result(JSON.stringify({ tabs: context.pages().length, url: p.url(), title: await p.title() }, null, 2));
    }
    case 'list_tabs': {
      if (!context) throw new Error('Browser context mavjud emas.');
      return result(
        JSON.stringify(
          context.pages().map((p, index) => ({ index, url: p.url(), active: p === session.page })),
          null,
          2,
        ),
      );
    }
    case 'switch_tab': {
      if (!context) throw new Error('Browser context mavjud emas.');
      const pages = context.pages();
      const index = Number(input.index ?? 0);
      if (!pages[index]) throw new Error('Tab topilmadi: ' + index);
      session.page = pages[index];
      await pages[index].bringToFront().catch(() => {});
      return result(JSON.stringify({ url: pages[index].url(), title: await pages[index].title() }, null, 2));
    }
    case 'close_tab': {
      if (!context) throw new Error('Browser context mavjud emas.');
      const pages = context.pages();
      const index = Number(input.index ?? pages.length - 1);
      if (!pages[index]) throw new Error('Tab topilmadi: ' + index);
      const closing = pages[index];
      await closing.close();
      const remaining = context.pages();
      if (session.page === closing) session.page = remaining[0] ?? (await context.newPage());
      return result(JSON.stringify({ tabs: remaining.length, url: session.page.url() }, null, 2));
    }
    case 'cookies_get':
      return result(clip(JSON.stringify(await context.cookies(), null, 2)));
    case 'cookies_set': {
      let cookies = input.cookies;
      if (typeof cookies === 'string') {
        try {
          cookies = JSON.parse(cookies);
        } catch {
          throw new Error('cookies JSON bo‘lishi kerak');
        }
      }
      if (!Array.isArray(cookies)) throw new Error('cookies array bo‘lishi kerak.');
      await context.addCookies(cookies as Parameters<typeof context.addCookies>[0]);
      return result(JSON.stringify({ set: cookies.length }));
    }
    case 'handle_dialog': {
      const mode = string(input, 'value', 'accept').toLowerCase();
      session.page.once('dialog', (dialog) => {
        if (mode === 'dismiss') void dialog.dismiss().catch(() => {});
        else void dialog.accept(string(input, 'prompt_text') || undefined).catch(() => {});
      });
      return result('Keyingi dialog ' + (mode === 'dismiss' ? 'rad etiladi' : 'qabul qilinadi') + '.');
    }
    case 'reload':
      await session.page.reload({ waitUntil: 'domcontentloaded', timeout });
      return result(JSON.stringify({ url: session.page.url(), title: await session.page.title() }, null, 2));
    case 'drag': {
      const target = string(input, 'target_selector');
      if (!selector || !target) throw new Error('drag uchun source_selector va target_selector kerak.');
      await session.page.dragAndDrop(selector, target, { timeout: Number(input.timeout_ms ?? 10000) });
      break;
    }
    case 'upload_file': {
      const filePath = string(input, 'file_path');
      if (!selector || !filePath) throw new Error('upload_file uchun selector va file_path kerak.');
      // Uploading hands a local file to a remote site, so the file is a *read* of caller-chosen
      // material. `assertReadablePath` confines it to the workspace. Before this, any file the process
      // could open was uploadable: with read-only mode off, a page could be handed a private key or a
      // `.env` and asked to post it.
      assertReadablePath(filePath, 'file_path', 'fayl yuklash');
      await session.page.locator(selector).setInputFiles(filePath);
      return result(JSON.stringify({ uploaded: filePath, selector }, null, 2));
    }
    case 'download': {
      const savePath = string(input, 'save_path') || string(input, 'output_path');
      const downloadPromise = session.page.waitForEvent('download', { timeout: Number(input.timeout_ms ?? 30000) });
      if (selector) await session.page.locator(selector).click({ timeout: Number(input.timeout_ms ?? 10000) });
      const download = await downloadPromise;
      const target = savePath || (await download.path()).toString();
      // `save_path` was not in the policy engine's list of output fields, so this wrote anywhere the
      // process could write. The check is here, at the call that writes, so the field's name no longer
      // decides whether it is contained.
      if (savePath) {
        assertWritablePath(savePath, 'save_path', 'yuklab olingan faylni saqlash');
        await download.saveAs(savePath);
      }
      return result(JSON.stringify({ suggested: download.suggestedFilename(), saved_to: target }, null, 2));
    }
    case 'clear_cookies':
      await context.clearCookies();
      return result(JSON.stringify({ cleared: true }));
    case 'set_headers': {
      let headers = input.headers;
      if (typeof headers === 'string') {
        try {
          headers = JSON.parse(headers);
        } catch {
          throw new Error('headers JSON bo‘lishi kerak');
        }
      }
      if (!headers || typeof headers !== 'object') throw new Error('set_headers uchun headers obyekti kerak.');
      await context.setExtraHTTPHeaders(headers as Record<string, string>);
      return result(JSON.stringify({ headers: Object.keys(headers as object).length }, null, 2));
    }
    default:
      throw new Error("Noma'lum browser action: " + action);
  }
  return result(JSON.stringify({ action, url: session.page.url(), title: await session.page.title() }, null, 2));
}
