process.env.PRO_FETCH_TIMEOUT_MS='1200';
process.env.PRO_FETCH_COMMAND_TIMEOUT_MS='1200';
process.env.PRO_FETCH_PROFILE='full';
await import('file:///C:/Users/user/Downloads/pro-fetch/pro-fetch-mcp/src/loader.js');
const { dispatch } = await import('file:///C:/Users/user/Downloads/pro-fetch/pro-fetch-mcp/src/core/tool.js');
try {
  const r = await Promise.race([
    dispatch("pro_fetch_image_search", { base64: "//48AD8A", url: 'https://example.invalid/x' }),
    new Promise((res) => setTimeout(() => res({ isError: true, content: [{ type: 'text', text: 'CEILING' }] }), 20000)),
  ]);
  console.log('DONE:' + ((r.content ?? []).map((c) => c.text).join(' ').replace(/\s+/g, ' ').slice(0, 60)));
} catch (e) { console.log('THREW:' + String(e).slice(0, 60)); }
