/**
 * Coverage composites for the categories that had none.
 *
 * `scripts/measure-composite-coverage.mts` measured 182 tools across eight categories with **zero**
 * composite coverage: collaboration (28), codehost (24), devops (24), database (24), security (24),
 * git (22), knowledge (18) and productivity (18). A model had to discover and address each one by
 * name, which is exactly the cost the Smart System exists to remove.
 *
 * `pro_workspace_ops` covers the four local-environment categories — git, devops, database,
 * security — which share a shape: an operation against a workspace already confined by
 * `safeLocalPath`.
 *
 * `pro_service_ops` covers the four hosted-API categories — codehost, collaboration, storage,
 * productivity — which share the opposite shape: a provider, an action, and a credential.
 *
 * Both are thin by design. They do not reimplement anything: each action is dispatched to a
 * registered tool, so the allowlist, read-only mode, the read-only SQL gate, the workspace sandbox and
 * the output sandbox all keep applying to every underlying call.
 */

import { defineTool } from '../../core/tool.js';
import { fail, result } from '../../core/format.js';
import { arr, asRecord, bool, obj, strOrEmpty, view } from '../../core/input.js';
import { detailMode, renderBudgeted } from '../../core/composite-budget.js';
import { runParallel, type StepOutcome } from '../../core/composite.js';
import { contextFor, gate, type Condition } from '../../core/composite-gates.js';
import type { ToolResult } from '../../core/types.js';

/** One requested operation, already normalised. */
interface Action {
  label: string;
  tool: string;
  args: Record<string, unknown>;
  /** Precondition; when it fails the operation is skipped and the reason is reported. */
  condition?: Condition;
  /** Caller-supplied correlation id, echoed in the transcript so repeated tools stay distinguishable. */
  id?: number;
}

/**
 * The `only_if_code` precondition.
 *
 * Scanning an empty directory for secrets costs a full scan and reports nothing, which reads as
 * "clean" rather than "there was nothing to scan". The caller states whether a workspace is
 * populated, and this decides whether the operation is worth running at all.
 */
const NEEDS_CODE: Condition = {
  reason: 'workspace’da kod topilmadi',
  test: ({ text }) => /\w/.test(text),
};

/** Read and validate the caller's action list. Returns `undefined` when it is unusable. */
function readActions(input: Record<string, unknown>): Action[] | undefined {
  const raw = arr(input, 'operations');
  if (raw.length === 0) return undefined;
  const actions: Action[] = [];
  for (let index = 0; index < raw.length; index++) {
    const record = asRecord(raw[index]);
    const tool = record ? strOrEmpty(record, 'tool').trim() : '';
    if (!tool) return undefined;
    actions.push({
      label: strOrEmpty(record!, 'label').trim() || `${index + 1}. ${tool}`,
      tool,
      args: record ? obj(record, 'arguments') : {},
      ...(bool(record!, 'only_if_code', false) ? { condition: NEEDS_CODE } : {}),
      ...(typeof record!.operation_id === 'number' ? { id: record!.operation_id } : {}),
    });
  }
  return actions;
}

/** Cap the batch so one call cannot become an unbounded fan-out. */
const MAX_OPERATIONS = 50;

/**
 * Run the actions and render the transcript under the detail budget.
 *
 * `only_if_code` gates an operation on the workspace actually containing code: a secret scan over an
 * empty directory costs a full scan and finds nothing, which reads as "clean" rather than "no input".
 * Gating goes through the shared `gate()` helper, so a step is never suppressed by a failing
 * predicate, and the transcript always states how many operations were skipped and why.
 */
async function execute(title: string, actions: Action[], detail: unknown, hasCode: boolean): Promise<ToolResult> {
  // The gate context carries one fact — whether the workspace holds code — so a condition written
  // against a document still behaves predictably here instead of receiving undefined.
  const context = contextFor(hasCode ? 'code' : '', '');
  const steps: Array<[string, string, Record<string, unknown>]> = [];
  const gated: StepOutcome[] = [];

  for (const action of actions) {
    const verdict = gate(context, action.condition);
    // The id goes into the label so two operations that differ only by id stay distinguishable in the
    // transcript, even though `runParallel` will correctly collapse an identical tool+arguments pair
    // into a single dispatch.
    const label = action.id === undefined ? action.label : `${action.label} [#${action.id}]`;
    if (verdict.run) {
      steps.push([label, action.tool, action.args]);
    } else {
      gated.push({
        step: label,
        tool: action.tool,
        ok: true,
        output: `(o‘tkazildi: ${verdict.reason ?? 'shart bajarilmadi'})`,
        ms: 0,
      });
    }
  }

  const outcomes = [...gated, ...(await runParallel(steps))];
  return result(renderBudgeted(title, outcomes, detailMode(detail), gated.length));
}

const OPERATIONS_PROPERTY = {
  type: 'array',
  description: 'Bajariladigan amallar ro‘yxati',
  items: {
    type: 'object',
    properties: {
      tool: { type: 'string', description: 'Aniq tool nomi (pro_capability_map yordamida toping)' },
      arguments: { type: 'object', description: 'Shu tool’ning argumentlari' },
      label: { type: 'string', description: 'Natijani aniqlash uchun ixtiyoriy yorliq' },
      only_if_code: {
        type: 'boolean',
        description: 'Faqat workspace’da kod bor bo‘lsa bajarish (masalan diff bo‘sh bo‘lsa)',
      },
      operation_id: {
        type: 'number',
        description: 'ixtiyoriy; natijani shu id orqali qaytarish uchun (bir xil tool bir necha marta)',
      },
    },
    required: ['tool'],
  },
};

/**
 * pro_workspace_ops — Git, DevOps, database and security operations in one call
 * Pack: smart-composite (pro-fetch)
 *
 * Requests that span categories ("check the history and tell me whether the diff leaks secrets")
 * needed two discovery cycles and several round trips before this existed.
 */
export const WORKSPACE_OPS_TOOL = defineTool({
  name: 'pro_workspace_ops',
  description:
    'Run local workspace operations in one call across git, DevOps (docker/kubectl/terraform/npm), ' +
    'databases (SQLite/PostgreSQL/MySQL/Redis) and security (OSV, secret scan, SBOM). Give a list of ' +
    'operations and get every result together instead of discovering four tools by name. ' +
    'Write operations still require their own confirmation and respect read-only mode.',
  category: 'git',
  inputSchema: {
    type: 'object',
    properties: {
      operations: OPERATIONS_PROPERTY,
      workspace_has_code: { type: 'boolean', description: 'Workspace’da kod borligi (only_if_code ni baholash uchun)' },
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
    },
    required: ['operations'],
  },
  async handler(input) {
    const p = view(input);
    const actions = readActions(p);
    if (!actions) return fail('operations bo‘sh yoki noto‘g‘ri. Har bir element uchun `tool` talab qilinadi.');
    if (actions.length > MAX_OPERATIONS)
      return fail(`Bir chaqiruvda ${MAX_OPERATIONS} tagacha amal. Yuborilgan: ${actions.length}.`);
    return execute('Workspace operations', actions, p.detail, bool(p, 'workspace_has_code', true));
  },
});

/**
 * pro_service_ops — Hosted-provider operations in one call
 * Pack: smart-composite (pro-fetch)
 *
 * codehost, collaboration, storage and productivity share a shape: provider, action, credential.
 */
export const SERVICE_OPS_TOOL = defineTool({
  name: 'pro_service_ops',
  description:
    'Run hosted-provider operations in one call across code hosts (GitLab/Gitea/Forgejo/Bitbucket), ' +
    'collaboration (Slack/Linear/Jira/Notion), cloud storage and productivity (Gmail/Calendar/Todoist). ' +
    'Give a list of operations and get every result together. Credentials must already be configured; ' +
    'an operation without one reports a configuration error rather than failing silently.',
  category: 'codehost',
  inputSchema: {
    type: 'object',
    properties: {
      operations: OPERATIONS_PROPERTY,
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
    },
    required: ['operations'],
  },
  async handler(input) {
    const p = view(input);
    const actions = readActions(p);
    if (!actions) return fail('operations bo‘sh yoki noto‘g‘ri. Har bir element uchun `tool` talab qilinadi.');
    if (actions.length > MAX_OPERATIONS)
      return fail(`Bir chaqiruvda ${MAX_OPERATIONS} tagacha amal. Yuborilgan: ${actions.length}.`);
    return execute('Service operations', actions, p.detail, true);
  },
});
