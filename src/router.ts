import { allTools, dispatch } from './core/tool.js';
import type { ToolDefinition } from './core/types.js';
import { currentProfile, isToolVisibleInProfile } from './loader.js';
import type { Profile } from './loader.js';

export function listTools(profile: Profile = currentProfile()): ToolDefinition[] {
  return allTools().filter((tool) => isToolVisibleInProfile(tool, profile));
}

export async function callTool(name: string, input: Record<string, unknown> = {}) {
  return dispatch(name, input);
}
