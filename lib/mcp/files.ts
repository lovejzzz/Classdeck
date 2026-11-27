// Files a teacher's AI adds to cards (a picture or PDF from the web, narration it made, a video it generated), kept as
// the site's own uploads: in R2 online, or on disk here. Fetching from the web refuses private addresses, so a link
// can't be used to reach machines inside the network.
import dns from "dns/promises";
import fs from "fs/promises";
import net from "net";
import path from "path";
import { presignPut, r2Ready } from "../blob";
import { uid } from "../profile";
import { db, save } from "../store";
import type { Attachment } from "../types";
import { kindOf, storedName, TYPES, UPLOAD_DIR } from "../uploads";
import { ToolError, type Ctx } from "./tools";

const MAX = 25 * 1024 * 1024;
const EXT_OF: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([ext, t]) => [t.split(";")[0], ext]).reverse());

/** A private, loopback or link-local address (IPv4 or IPv6). */
function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:") && privateIp(l.slice(7));
}
async function publicHost(u: URL): Promise<boolean> {
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((x) => x.address);
  return ips.length > 0 && !ips.some(privateIp);
}

/** Keep some bytes as an upload of this teacher's, and return it as a card attachment. */
export async function keepBytes(bytes: Buffer, mime: string, name: string, ctx: Ctx): Promise<Attachment> {
  const ext = EXT_OF[mime.split(";")[0].trim()] ?? "bin";
  if (ext === "bin") throw new ToolError(`That file type (${mime}) can't go on a card. Pictures, PDFs, audio, video and Office files can.`);
  if (bytes.length > MAX) throw new ToolError("That file is over 25 MB");
  const stored = storedName(ext);
  if (r2Ready()) {
    const put = await fetch(await presignPut(stored, TYPES[ext], bytes.length), { method: "PUT", headers: { "content-type": TYPES[ext] }, body: new Uint8Array(bytes) });
    if (!put.ok) throw new ToolError("The file couldn't be stored. Try again in a moment.");
  } else {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, stored), bytes);
  }
  db().uploads[stored] = { by: `u:${ctx.user.id}`, size: bytes.length, at: Date.now() };
  save();
  return { id: uid("a-"), kind: kindOf(ext), url: `/api/upload/${stored}`, name: name.slice(0, 120), size: bytes.length };
}

/** Fetch a file from the web (a public address, at most 25 MB) and keep it. */
export async function keepFile(link: string, name: string | undefined, ctx: Ctx): Promise<Attachment> {
  let u: URL;
  try { u = new URL(link); } catch { throw new ToolError(`Not a web address: ${link}`); }
  // Each hop of a redirect is checked too.
  for (let hop = 0; hop < 4; hop++) {
    if (!(await publicHost(u))) throw new ToolError(`That address can't be fetched: ${u.hostname}`);
    const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!r) throw new ToolError(`Couldn't reach ${u.hostname}`);
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { u = new URL(r.headers.get("location")!, u); continue; }
    if (!r.ok) throw new ToolError(`${u.hostname} answered ${r.status} for that file`);
    const size = Number(r.headers.get("content-length") ?? 0);
    if (size > MAX) throw new ToolError("That file is over 25 MB");
    const bytes = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") ?? "application/octet-stream";
    const fallback = decodeURIComponent(u.pathname.split("/").pop() || "file");
    return keepBytes(bytes, mime, name ?? fallback, ctx);
  }
  throw new ToolError("Too many redirects for that file");
}
