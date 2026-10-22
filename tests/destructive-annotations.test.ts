// Locks Fix 3: tools that write bytes to disk or dispatch arbitrary tools must NOT advertise
// readOnlyHint, while genuine read-only observation tools must. A client that pre-approves
// readOnlyHint would otherwise silently permit file writes / arbitrary tool execution.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { allTools } from '../src/core/tool.js';
import { deriveAnnotations } from '../src/core/tool-classification.js';

const byName = new Map(allTools().map((t) => [t.name, t]));
const ann = (name: string) => {
  const t = byName.get(name);
  expect(t, `${name} must exist`).toBeDefined();
  return deriveAnnotations(t!.name, t!.category);
};

describe('destructive control-plane and file-writing tools are not advertised read-only', () => {
  const mustNotBeReadOnly = [
    'pro_fetch_tool_execute', // dispatches any tool
    'pro_fetch_download_file', // writes a file
    'pro_fetch_media_download', // writes a file
    'pro_fetch_screenshot_page', // writes a PNG
    'pro_fetch_screenshot_full_page', // writes a PNG
    'pro_browser_browser_screenshot', // writes a PNG
  ];
  for (const name of mustNotBeReadOnly) {
    it(`${name} is destructive`, () => {
      const a = ann(name);
      expect(a.readOnlyHint, name).toBe(false);
      expect(a.destructiveHint, name).toBe(true);
    });
  }
});

describe('read-only observation tools stay read-only (guard against over-broadening)', () => {
  for (const name of ['pro_fetch_knowledge_search', 'pro_fetch_http_status', 'pro_units_convert']) {
    it(`${name} is still read-only`, () => {
      expect(ann(name).readOnlyHint, name).toBe(true);
    });
  }
});
