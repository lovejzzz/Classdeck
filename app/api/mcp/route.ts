// MCP for a teacher's own AI, with the personal token in an Authorization: Bearer header (lib/mcp/server.ts).
import { handleMcp } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const POST = (request: Request) => handleMcp(request);
export const GET = (request: Request) => handleMcp(request);
