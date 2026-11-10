import fs from "fs/promises";
import path from "path";
import { kindOf, MAX_UPLOAD, TYPES, UPLOAD_DIR } from "@/lib/uploads";

/** 老师上传卡牌素材（图片、视频、录音、文件）。原型里存在 .data/uploads。 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "No file received" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "No file received" }, { status: 400 });
  if (file.size > MAX_UPLOAD) return Response.json({ ok: false, error: "Files must be 25 MB or smaller" }, { status: 413 });
  let ext = path.extname(file.name).slice(1).toLowerCase();
  if (!ext && file.type === "audio/webm") ext = "weba";
  if (ext === "webm" && file.type.startsWith("audio/")) ext = "weba";
  if (!TYPES[ext]) return Response.json({ ok: false, error: `.${ext || "?"} files aren't supported` }, { status: 415 });
  const name = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return Response.json({ ok: true, url: `/api/upload/${name}`, name: file.name, size: file.size, kind: kindOf(ext) });
}
