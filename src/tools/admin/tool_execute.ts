import { defineTool, getTool, dispatch } from '../../core/tool.js';
import { fail, result } from '../../core/format.js';

/**
 * Meta-executor used by the smart tool profile. It lets the model discover a focused
 * set of tool schemas and execute a selected registered tool without loading every schema.
 * All requests still pass through the shared execution and security policies in dispatch().
 */
export default defineTool({
  name: 'pro_fetch_tool_execute',
  description:
    'Execute a discovered Pro-Fetch tool by exact name and JSON arguments; suitable for smart profile tool routing',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      tool_name: { type: 'string', description: 'Exact registered tool name returned by pro_fetch_tool_list_details' },
      arguments: {
        type: 'object',
        description: 'Arguments matching that tool input schema',
        additionalProperties: true,
      },
    },
    required: ['tool_name'],
    additionalProperties: false,
  },
  async handler(input) {
    const targetName = typeof input.tool_name === 'string' ? input.tool_name.trim() : '';
    if (!targetName) return fail('tool_name parametri kerak. Avval pro_fetch_tool_list_details bilan tool qidiring.');
    if (targetName === 'pro_fetch_tool_execute')
      return fail('Meta-executor o‘zini o‘zi chaqira olmaydi. Aniq domain tool nomini bering.');
    if (!getTool(targetName))
      return fail(`Noma’lum tool: ${targetName}. Tool discovery natijasidagi aniq nomdan foydalaning.`);
    const args =
      input.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments)
        ? (input.arguments as Record<string, unknown>)
        : {};
    const nested = await dispatch(targetName, args);
    const content = nested.content.map((item) => item.text).join('\n\n');
    const nestedMeta =
      nested._meta && typeof nested._meta === 'object' ? (nested._meta as Record<string, unknown>) : {};
    return {
      ...result(
        JSON.stringify(
          { tool: targetName, ok: !nested.isError, result: content, metadata: nestedMeta['pro-fetch'] ?? null },
          null,
          2,
        ),
      ),
      ...(nested.isError ? { isError: true } : {}),
    };
  },
});
