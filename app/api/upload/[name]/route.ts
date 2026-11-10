import fs from "fs/promises";
import path from "path";
import { TYPES, UPLOAD_DIR } from "@/lib/uploads";

type Ctx = { params: Promise<{ name: string }> };

/** 读取上传的素材。支持 Range，视频和录音才能拖动进度条。 */
export async function GET(request: Request, { params }: Ctx) {
  const { name } = await params;
  if (!/^[a-z0-9]+\.[a-z0-9]{1,5}$/.test(name)) return new Response("not found", { status: 404 });
  const ext = name.split(".").pop()!;
  let buf: Buffer;
  try {
    buf = await fs.readFile(path.join(UPLOAD_DIR, name));
  } catch {
    return new Response("not found", { status: 404 });
  }
  const type = TYPES[ext] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    // 上传的 SVG 或网页类文件不能在本站执行脚本
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'; sandbox",
  };
  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1;
    if (start >= buf.length || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${buf.length}` } });
    return new Response(new Uint8Array(buf.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${buf.length}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Length": String(buf.length) } });
}
