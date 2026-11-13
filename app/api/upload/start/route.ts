import { getSession } from "@/lib/auth";
import { presignPut, r2Ready } from "@/lib/blob";
import { extFor, fmtMB, limits, storedName, TYPES, uploaderOf } from "@/lib/uploads";
import { pending, sweep, usedBy } from "../pending";

/**
 * Step 1 of an upload. Online (R2), the browser gets a 15-minute link to put the file straight into storage,
 * then calls /api/upload/finish. Without R2 it's told to send the file to /api/upload as before.
 */
export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return Response.json({ ok: false, error: "Sign in to upload files" }, { status: 401 });
  if (!r2Ready()) return Response.json({ ok: true, mode: "form" });
  sweep();
  const b = await request.json().catch(() => ({}));
  const size = Number(b.size);
  const ext = extFor(String(b.name ?? ""), String(b.type ?? ""));
  if (!ext) return Response.json({ ok: false, error: "That kind of file isn't supported" }, { status: 415 });
  if (!(size > 0)) return Response.json({ ok: false, error: "That file is empty" }, { status: 400 });
  const by = uploaderOf(session);
  const lim = limits(by, true);
  if (size > lim.file) return Response.json({ ok: false, error: `Files must be ${fmtMB(lim.file)} or smaller. Trim the video, or share a link instead.` }, { status: 413 });
  const waiting = [...pending.values()].filter((p) => p.by === by);
  if (waiting.length >= 5) return Response.json({ ok: false, error: "Finish your other uploads first." }, { status: 429 });
  if (usedBy(by) + waiting.reduce((n, p) => n + p.size, 0) + size > lim.total) return Response.json({ ok: false, error: `You’ve used your ${fmtMB(lim.total)} of uploads. Remove some older files, or share a link instead.` }, { status: 413 });
  const name = storedName(ext);
  const type = TYPES[ext].split(";")[0];
  pending.set(name, { by, size, original: String(b.name ?? name).slice(0, 200), exp: Date.now() + 20 * 60_000 });
  return Response.json({ ok: true, mode: "direct", put: await presignPut(name, type, size), type, key: name });
}
