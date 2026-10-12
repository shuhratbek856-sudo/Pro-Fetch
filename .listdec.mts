process.env.PRO_FETCH_TIMEOUT_MS='1200';
process.env.PRO_FETCH_PROFILE='full';
await import('file:///C:/Users/user/Downloads/pro-fetch/pro-fetch-mcp/src/loader.js');
const { allTools } = await import('file:///C:/Users/user/Downloads/pro-fetch/pro-fetch-mcp/src/core/tool.js');
console.log('NAMES:' + JSON.stringify(allTools().map(t => t.name)));
