// Questhand as an MCP server (Streamable HTTP, answering with JSON): a teacher's own AI (Claude, ChatGPT, …) connects
// with the teacher's personal link and uses the tools in ./tools.ts as that teacher.
import { throttled } from "../auth";
import { publicOrigin } from "../origin";
import { VERSION } from "../version";
import { userOfToken } from "./token";
import { INSTRUCTIONS, TOOLS, ToolError, type Ctx } from "./tools";

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function answer(m: Rpc, ctx: Ctx): Promise<unknown | null> {
  const id = m.id;
  // A notification (no id): nothing to answer.
  if (id === undefined || id === null) return null;
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return { jsonrpc: "2.0", id, result: {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "questhand", title: "Questhand", version: VERSION },
        instructions: INSTRUCTIONS,
      } };
    }
    case "ping": return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) } };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === m.params?.name);
      if (!tool) return err(id, -32602, `Unknown tool: ${String(m.params?.name)}`);
      try {
        const text = await tool.run((m.params?.arguments ?? {}) as Record<string, unknown>, ctx);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } };
      } catch (e) {
        // A tool that couldn't do it says why, inside the result, so the AI can fix its call and try again.
        const text = e instanceof ToolError ? e.message : "Something went wrong on Questhand’s side. Try again in a moment.";
        if (!(e instanceof ToolError)) console.error("mcp tool", tool.name, e);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
      }
    }
    case "resources/list": return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "prompts/list": return { jsonrpc: "2.0", id, result: { prompts: [] } };
    default: return err(id, -32601, `Method not found: ${m.method}`);
  }
}

/** One MCP request. The token comes from the link (/api/mcp/<token>) or an Authorization: Bearer header. */
export async function handleMcp(request: Request, tokenFromPath?: string): Promise<Response> {
  if (request.method === "GET") return new Response("This MCP server answers POST requests only.", { status: 405, headers: { allow: "POST" } });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const user = userOfToken(tokenFromPath ?? bearer);
  let body: unknown;
  try { body = await request.json(); } catch { return json(err(null, -32700, "Parse error"), 400); }
  // A link that was turned off (or mistyped) gets a plain answer an AI can repeat, not a sign-in flow that doesn't exist.
  if (!user) return json(err(Array.isArray(body) ? null : (body as Rpc)?.id, -32001, "This Questhand link doesn’t work any more. Copy the current one from Questhand → Settings → Tools for cards."), 401);
  // Plenty for an AI working through a course, not enough to hammer the site.
  if (throttled(`mcp:${user.id}`, 300, 60_000)) return json(err((body as Rpc)?.id, -32002, "Too many requests at once. Wait a minute and try again."), 429);
  const ctx: Ctx = { user, origin: publicOrigin(request) };
  const list = Array.isArray(body) ? (body as Rpc[]) : [body as Rpc];
  const out = (await Promise.all(list.map((m) => answer(m ?? {}, ctx)))).filter((x) => x !== null);
  if (!out.length) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? out : out[0]);
}
