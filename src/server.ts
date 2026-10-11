#!/usr/bin/env node
import './env.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import './loader.js';
import { currentProfile } from './loader.js';
import { listTools, callTool } from './router.js';
import { VERSION } from './core/version.js';

const server = new Server({ name: 'pro-fetch', version: VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    ...(t.annotations ? { annotations: t.annotations } : {}),
    ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  return callTool(name, args as Record<string, unknown>);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  console.error('[pro-fetch] profil: ' + currentProfile() + ', tool: ' + listTools().length + ' — tayyor');
}

main().catch((e) => {
  console.error('[pro-fetch] fatal:', e);
  process.exit(1);
});
