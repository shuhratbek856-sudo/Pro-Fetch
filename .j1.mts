const b = "file:///C:/Users/user/Downloads/pro-fetch/pro-fetch-mcp/src/";
process.env.PRO_FETCH_PROFILE = "full";
await import(b + "env.js"); await import(b + "loader.js");
const { allTools } = await import(b + "core/tool.js");
const { callTool } = await import(b + "router.js");
const t = (r) => ((r.content ?? []).map(c => (c.text ?? "")).join(" ").replace(/\s+/g," "));
const closed = allTools().filter(x => x.inputSchema.additionalProperties === false);
let accepted = 0, rejected = 0; const names = [];
for (const tool of closed) {
  const s = tool.inputSchema;
  const args = {};
  for (const k of s.required ?? []) args[k] = k === "url" ? "https://example.com" : "x";
  args.totally_bogus_property = true;
  let isErr = false;
  try { isErr = Boolean((await callTool(tool.name, args)).isError); } catch { isErr = true; }
  if (isErr) rejected++; else { accepted++; if (names.length < 5) names.push(tool.name); }
}
console.log("  rad etilgan:         " + rejected + " / " + closed.length);
console.log("  JIM qabul qilingan:  " + accepted);
names.forEach(n => console.log("    " + n));
console.log("");
console.log("  xato kalit maslahati:");
console.log("    " + t(await callTool("pro_llm_chat", { model: "x", max_tokns: 5, prompt: "y" })).slice(0, 130));
