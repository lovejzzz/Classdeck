import path from "path";

export const UPLOAD_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "uploads");
export const MAX_UPLOAD = 25 * 1024 * 1024;

export const TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", weba: "audio/webm",
  pdf: "application/pdf", txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  key: "application/vnd.apple.keynote",
};

export function kindOf(ext: string): "image" | "video" | "audio" | "file" {
  const t = TYPES[ext] ?? "";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "file";
}

/** 卡牌素材只允许这几种地址，挡掉 javascript: 之类的链接。 */
export function safeUrl(u: string): boolean {
  return /^https?:\/\//i.test(u) || /^\/api\/upload\/[a-z0-9]+\.[a-z0-9]{1,5}$/.test(u) || /^\/samples\/(?:[\w-]+\/)?[\w.-]+$/.test(u);
}
