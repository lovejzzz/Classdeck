// MCP for a teacher's own AI, with the personal token in the link itself (what Claude and ChatGPT take): see
// lib/mcp/server.ts. The link is a password: Settings makes a new one, and turns it off.
import { handleMcp } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };
export async function POST(request: Request, { params }: Ctx) { return handleMcp(request, (await params).token); }
export async function GET(request: Request, { params }: Ctx) { return handleMcp(request, (await params).token); }
