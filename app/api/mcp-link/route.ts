// The teacher's personal MCP link (Settings → AI → Use your own AI): see it, make a new one, turn it off.
import { getSession, teacherOf, unauthorized } from "@/lib/auth";
import { dropToken, newToken, tokenOf } from "@/lib/mcp/token";
import { publicOrigin } from "@/lib/origin";

const shape = (request: Request, token: string | null, used?: number) =>
  Response.json({ ok: true, link: token ? `${publicOrigin(request)}/api/mcp/${token}` : null, used: used ?? null }, { headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  return shape(request, tokenOf(t), t.mcp?.used);
}
/** A new link (the old one stops working). */
export async function POST(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  return shape(request, newToken(t));
}
export async function DELETE(request: Request) {
  const t = teacherOf(getSession(request));
  if (!t) return unauthorized("teacher", "Sign in first");
  dropToken(t);
  return shape(request, null);
}
