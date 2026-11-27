// Discovery paths (OAuth and others) that AI clients ask for before connecting: Questhand's MCP link carries its own
// token, so there's nothing to discover. A plain JSON 404 (not the site's HTML page) tells them so.
export const dynamic = "force-dynamic";
const none = () => Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "public, max-age=3600" } });
export const GET = none;
export const POST = none;
