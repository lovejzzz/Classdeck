import { builtinIds, allConnectors, describe } from "@/lib/connectors/registry";
import { validateManifest } from "@/lib/connectors/declarative";
import { ConnectorError } from "@/lib/connectors/types";
import { db, save } from "@/lib/store";

export async function GET() {
  return Response.json({ connectors: allConnectors().map(describe) });
}

/** 添加一个自定义的声明式连接器。 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const taken = [...builtinIds(), ...db().customConnectors.map((m) => m.id)];
    const manifest = validateManifest(body.manifest, taken);
    db().customConnectors.push(manifest);
    save();
    return Response.json({ ok: true, id: manifest.id });
  } catch (e) {
    const message = e instanceof ConnectorError ? e.message : "That JSON isn't valid";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const d = db();
  d.customConnectors = d.customConnectors.filter((m) => m.id !== id);
  for (const c of Object.values(d.courses)) c.enabledConnectors = c.enabledConnectors.filter((x) => x !== id);
  save();
  return Response.json({ ok: true });
}
