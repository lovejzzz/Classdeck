import { getSession } from "@/lib/auth";
import { r2Ready, remove, sizeOf } from "@/lib/blob";
import { db, save } from "@/lib/store";
import { fmtMB, kindOf, limits, uploaderOf } from "@/lib/uploads";
import { pending, sweep, usedBy } from "../pending";

/** Step 2 of an online upload: check what arrived in storage, then record it. */
export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return Response.json({ ok: false, error: "Sign in to upload files" }, { status: 401 });
  if (!r2Ready()) return Response.json({ ok: false, error: "No storage is set up" }, { status: 400 });
  sweep();
  const b = await request.json().catch(() => ({}));
  const key = String(b.key ?? "");
  const p = pending.get(key);
  const by = uploaderOf(session);
  if (!p || p.by !== by) return Response.json({ ok: false, error: "That upload has expired. Try again." }, { status: 400 });
  pending.delete(key);
  const size = await sizeOf(key);
  if (size === null) return Response.json({ ok: false, error: "The file didn’t arrive. Try again." }, { status: 400 });
  const lim = limits(by, true);
  if (size > lim.file || usedBy(by) + size > lim.total) {
    await remove(key);
    return Response.json({ ok: false, error: `That file is over your limit (${fmtMB(lim.file)} per file, ${fmtMB(lim.total)} in all).` }, { status: 413 });
  }
  db().uploads[key] = { by, size, at: Date.now() };
  save();
  return Response.json({ ok: true, url: `/api/upload/${key}`, name: p.original, size, kind: kindOf(key.split(".").pop()!) });
}
