import path from "path";

export const UPLOAD_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "uploads");
export const MAX_UPLOAD = 25 * 1024 * 1024;
const MB = 1024 * 1024;
const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);

/** Who an upload counts against: a teacher, a student in one course, or demo visitors (all together). */
export function uploaderOf(s: { kind: string; userId?: string; courseId?: string; studentId?: string }): string {
  if (s.kind === "teacher") return `u:${s.userId}`;
  if (s.kind === "student") return `s:${s.courseId}:${s.studentId}`;
  return "demo";
}

/** Upload limits. Online files go straight to R2, so they can be bigger; the server never holds them. */
export function limits(by: string, direct: boolean) {
  const demo = by === "demo";
  return {
    file: (demo ? 10 : direct ? num(process.env.UPLOAD_MAX_FILE_MB, 200) : 25) * MB,
    total: (demo ? num(process.env.UPLOAD_DEMO_MB, 500) : by.startsWith("u:") ? num(process.env.UPLOAD_TEACHER_MB, 5000) : num(process.env.UPLOAD_STUDENT_MB, 500)) * MB,
  };
}

export const fmtMB = (bytes: number) => `${Math.round(bytes / MB)} MB`;

/** The stored name's extension for an upload, or "" if the type isn't allowed. */
export function extFor(fileName: string, type: string): string {
  let ext = (fileName.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();
  if (!ext && type === "audio/webm") ext = "weba";
  if (!ext && type === "video/webm") ext = "webm";
  if (!ext && type === "video/mp4") ext = "mp4";
  if (ext === "webm" && type.startsWith("audio/")) ext = "weba";
  return TYPES[ext] ? ext : "";
}

/** A stored file's name: hard to guess, since anyone with the address can open the file. */
export const storedName = (ext: string) => `${Date.now().toString(36)}${randomCode(12).toLowerCase()}.${ext}`;

/** Random letters and digits from the system's secure random source. */
export function randomCode(n: number): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

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
