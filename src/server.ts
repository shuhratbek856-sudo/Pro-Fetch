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
  installProcessGuards();
  await server.connect(new StdioServerTransport());
  console.error('[pro-fetch] profil: ' + currentProfile() + ', tool: ' + listTools().length + ' — tayyor');
}

/**
 * Keep one bad tool call from ending the session.
 *
 * An MCP server is a single long-lived process: every tool shares it. Node's default for an
 * unhandled rejection is to terminate, so a library that rejects from its own queue — pdfjs's task
 * worker, a native addon, a detached timer — takes down all 572 tools, and the client sees a dead
 * server rather than a failed call. That was observed: passing a PDF to `pro_fetch_image_ocr` made
 * leptonica reject out of band and killed the process.
 *
 * The input is validated before the native library sees it now, but a dependency cannot be audited
 * once and trusted forever, and this server composes a large number of them. So the guard is here as
 * well: a stray rejection is reported on stderr and execution continues.
 *
 * stdout is reserved for the protocol, so diagnostics go to stderr — writing to stdout would corrupt
 * the stream the client is parsing.
 */
function installProcessGuards(): void {
  process.on('unhandledRejection', (reason) => {
    console.error('[pro-fetch] unhandled rejection (tool davom etadi):', describe(reason));
  });
  process.on('uncaughtException', (error) => {
    // Logged in full first: by the time a client notices a dead server, this line is the only evidence.
    //
    // Then the process stops. The comment above this used to say the state is unknown and
    // "not survivable" while the handler returned and the process carried on - so the comment claimed a
    // guarantee the code did not make. Continuing past an uncaught exception means continuing with
    // whatever the broken code left behind: a half-written file, a lock still held, a session map that
    // no longer matches its browser. Node's default behaviour is to exit, and overriding it needs a
    // reason; the reason here would have been "we said it was not survivable".
    //
    // Exit code 1 rather than 0, so a supervisor can tell a crash from a clean shutdown.
    console.error('[pro-fetch] uncaught exception - jarayon to‘xtatilmoqda:', error);
    process.exitCode = 1;
    process.exit(1);
  });
}

/** A short, safe description of an unknown throwable for the log. */
function describe(reason: unknown): string {
  if (reason instanceof Error) return reason.stack ?? `${reason.name}: ${reason.message}`;
  return String(reason).slice(0, 500);
}

main().catch((e) => {
  console.error('[pro-fetch] fatal:', e);
  process.exit(1);
});
