import fs from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { r2Ready } from "@/lib/blob";
import { db, save } from "@/lib/store";
import { usedBy } from "./pending";
import { extFor, fmtMB, kindOf, limits, storedName, uploaderOf, UPLOAD_DIR } from "@/lib/uploads";

/** Uploads to this computer's disk (development, or when no R2 bucket is set up). Online uploads use /api/upload/start. */
export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return Response.json({ ok: false, error: "Sign in to upload files" }, { status: 401 });
  if (r2Ready()) return Response.json({ ok: false, error: "Uploads go straight to storage here. Reload the page and try again." }, { status: 400 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "No file received" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "No file received" }, { status: 400 });
  const by = uploaderOf(session);
  const lim = limits(by, false);
  if (file.size > lim.file) return Response.json({ ok: false, error: `Files must be ${fmtMB(lim.file)} or smaller` }, { status: 413 });
  if (usedBy(by) + file.size > lim.total) return Response.json({ ok: false, error: `You’ve used your ${fmtMB(lim.total)} of uploads. Remove some older files, or share a link instead.` }, { status: 413 });
  const ext = extFor(file.name, file.type);
  if (!ext) return Response.json({ ok: false, error: `That kind of file isn't supported` }, { status: 415 });
  const name = storedName(ext);
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  db().uploads[name] = { by, size: file.size, at: Date.now() };
  save();
  return Response.json({ ok: true, url: `/api/upload/${name}`, name: file.name, size: file.size, kind: kindOf(ext) });
}
