import zlib from "zlib";
import { uid } from "./profile";
import type { Module, ModuleType, Week } from "./types";

// Turning a course plan document into weeks of cards.
// 1. Read the document into an outline: headings (with levels) and paragraphs.
// 2. Find the weeks (headings like "Week 3 …", "Unit 2", "Module 4"), and inside each week,
//    the sections. A section of "Short title. Description." paragraphs becomes one card per
//    paragraph; any other section becomes one card.
// The AI path (when a key is set) does the same job with more judgment; this one needs nothing.

export interface Line { level: number; text: string; bullet?: boolean }

// —— reading files ——

/** The files inside a .zip (a .docx is one), by name. Handles stored and deflated entries. */
export function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, zlib.inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const xmlText = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function docxOutline(buf: Buffer): Line[] {
  const doc = unzip(buf).get("word/document.xml");
  if (!doc) throw new Error("This .docx has no document body");
  const xml = doc.toString("utf8");
  const lines: Line[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const text = xmlText((p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const h = style.match(/^Heading(\d)$/i);
    const level = h ? Number(h[1]) : /^Title$/i.test(style) ? 0.5 : 0;
    lines.push({ level, text, bullet: p.includes("<w:numPr>") || undefined });
  }
  return lines;
}

function textOutline(text: string, markdown: boolean): Line[] {
  const lines: Line[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) lines.push({ level: 0, text: para.join(" ").trim() });
    para = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const md = markdown && line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (md) { flush(); lines.push({ level: md[1].length, text: md[2].replace(/[*_`]/g, "").trim() }); }
    else if (!markdown && WEEK.test(line) && line.length < 90) { flush(); lines.push({ level: 1, text: line }); }
    else if (bullet) { flush(); lines.push({ level: 0, text: bullet[2].replace(/[*_`]/g, ""), bullet: true }); }
    else {
      para.push(line.replace(/[*_`]/g, ""));
      // A line that ends a sentence ends its paragraph: many plans put one activity per line.
      if (/[.!?]["”’)]?$/.test(line)) flush();
    }
  }
  flush();
  return lines;
}

export function readOutline(buf: Buffer, filename: string): Line[] {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "docx") return docxOutline(buf);
  if (ext === "md" || ext === "markdown") return textOutline(buf.toString("utf8"), true);
  if (ext === "txt") return textOutline(buf.toString("utf8"), false);
  throw new Error("Use a .docx, .md, or .txt file");
}

// —— outline → weeks ——

const WEEK = /^(week|unit|module|session|lesson|topic|day)\s*(\d+)\b[\s:.\-–—]*(.*)$/i;
// Sections that are notes for teachers, not something students do.
const SKIP = /\b(personali[sz]ed|teacher notes?|facilitator|implementation|sources?|references?|based on|rationale|for teachers?)\b/i;

function guessType(title: string, body: string): ModuleType {
  const t = `${title} ${body.slice(0, 160)}`.toLowerCase();
  if (/self[- ]?(assess|check|rat)|starting point|rate yourself/.test(t)) return "selfcheck";
  if (/collab studio|studio session|group session|peer review session|round[- ]robin/.test(t)) return "studio";
  if (/reflect|commitment|journal|look back|revis/.test(title.toLowerCase())) return "reflect";
  if (/\b(share|post|discuss)/.test(title.toLowerCase()) || /\bwall\b|discussion|share (your|with)|post (your|on|it)|giving good feedback|brainstorm/.test(t)) return "wall";
  if (/\bquiz\b|knowledge check|\btest\b/.test(t)) return "practice";
  if (/assignment|submit|hand in|final (presentation|project|paper)/.test(t)) return "submit";
  if (/practi[cs]e|record|rehears|try (again|it)|draft|write|outline|build/.test(t)) return "practice";
  if (/welcome|overview|introduction|read\b|course plan/.test(t)) return "read";
  return "explore";
}

function card(title: string, body: string, forceType?: ModuleType): Module {
  const minutes = Number(body.match(/(\d{1,3})\s*(?:min|minutes)\b/i)?.[1]) || undefined;
  const type = forceType ?? guessType(title, body);
  return {
    id: uid("m-"), type, title: title.replace(/[.:]\s*$/, "").slice(0, 90), body: body.trim().slice(0, 4000),
    audience: { kind: "all" }, tools: [],
    minutes: minutes && minutes <= 180 ? minutes : undefined,
    submitTo: type === "studio" ? "studio" : type === "practice" || type === "reflect" || type === "submit" ? "personal" : undefined,
  };
}

/** "Short title. The rest…" → [title, rest]. */
function titled(text: string): [string, string] | null {
  const m = text.match(/^([^.!?]{3,70}?)[.!?:]\s+(.+)$/);
  if (!m || m[1].split(/\s+/).length > 9) return null;
  return [m[1], m[2]];
}

export function outlineToWeeks(lines: Line[]): Week[] {
  const starts = lines.map((l, i) => (l.level > 0 && l.level < 5 && WEEK.test(l.text) ? i : -1)).filter((i) => i >= 0);
  // No "Week N" headings: treat each top-level heading as a week.
  const top = Math.min(...lines.filter((l) => l.level >= 1).map((l) => l.level), 9);
  const weekIdx = starts.length ? starts : lines.map((l, i) => (l.level === top ? i : -1)).filter((i) => i >= 0);
  if (!weekIdx.length) weekIdx.push(-1);

  return weekIdx.map((at, w) => {
    const head = at >= 0 ? lines[at] : { level: 0, text: "Week 1" };
    const level = head.level || 1;
    let end = weekIdx[w + 1] ?? lines.length;
    for (let i = at + 1; i < end; i++) if (lines[i].level > 0 && lines[i].level <= level && !WEEK.test(lines[i].text)) { end = i; break; }
    const body = lines.slice(at + 1, end);
    const m = head.text.match(WEEK);
    const weekTitle = m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}` : `Week ${w + 1}`;
    const lessonTitle = (m ? m[3] : head.text).trim() || weekTitle;

    // The first paragraphs before any sub-heading describe the week.
    const firstHead = body.findIndex((l) => l.level > 0);
    const intro = body.slice(0, firstHead < 0 ? body.length : firstHead).map((l) => l.text);
    const goal = intro[0]?.slice(0, 240);

    const modules: Module[] = [];
    const sections: { title: string; paras: Line[] }[] = [];
    for (const l of body.slice(firstHead < 0 ? body.length : firstHead)) {
      if (l.level > 0) sections.push({ title: l.text, paras: [] });
      else sections[sections.length - 1]?.paras.push(l);
    }
    if (!sections.length && intro.length > 1) sections.push({ title: lessonTitle, paras: body.slice(1) });
    for (const s of sections) {
      if (SKIP.test(s.title) || !s.paras.length) continue;
      const split = s.paras.map((p) => titled(p.text));
      // A list of "Title. Description." items: one card each.
      if (s.paras.length >= 2 && split.filter(Boolean).length >= Math.ceil(s.paras.length * 0.6)) {
        s.paras.forEach((p, i) => {
          const t = split[i];
          modules.push(t ? card(t[0], t[1]) : card(p.text.slice(0, 60), p.text));
        });
      } else if (/criteria|completion|done when|assessment/i.test(s.title)) {
        // Completion criteria belong on the cards, not as a card of their own.
        const text = s.paras.map((p) => p.text).join(" ");
        modules.forEach((mod) => { mod.criteria ??= text.slice(0, 300); });
      } else {
        const text = s.paras.map((p) => (p.bullet ? `• ${p.text}` : p.text)).join("\n\n");
        modules.push(card(s.title, text));
      }
    }
    return {
      id: uid("w-"),
      title: weekTitle,
      lessons: [{ id: uid("l-"), title: lessonTitle.slice(0, 90), goal, modules, branches: {} }],
    };
  }).filter((w) => w.lessons[0].modules.length > 0 || w.lessons[0].goal);
}

// —— the AI path ——

export const IMPORT_PROMPT = `You turn a teacher's course plan into weeks of activity cards for a learning platform.
Return only JSON, no prose, in this shape:
{"weeks":[{"title":"Week 1","lessonTitle":"…","goal":"one sentence","cards":[{"type":"read|explore|practice|submit|quiz|reflect|wall|selfcheck|studio","title":"short title","body":"what students read or do, in second person","minutes":10,"criteria":"what counts as done"}]}]}
Rules:
- One entry per week or unit in the plan, in order. Keep the plan's own wording where it's student-facing.
- Cards are what students do. Leave out notes meant only for teachers (rationale, implementation, sources).
- "wall" is a shared class board, "studio" a small-group feedback session, "selfcheck" a skills self-rating, "reflect" a private reflection.
- Don't use "quiz" unless the plan has actual questions. Keep each body under 120 words. minutes and criteria are optional.`;

/** Validate what the AI returned and turn it into weeks. Anything malformed is dropped. */
export function weeksFromAI(raw: string): Week[] {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const data = JSON.parse(json) as { weeks?: { title?: string; lessonTitle?: string; goal?: string; cards?: { type?: string; title?: string; body?: string; minutes?: number; criteria?: string }[] }[] };
  const types = new Set(["read", "explore", "practice", "submit", "quiz", "reflect", "wall", "selfcheck", "studio"]);
  return (data.weeks ?? []).slice(0, 30).map((w, i) => ({
    id: uid("w-"),
    title: String(w.title ?? `Week ${i + 1}`).slice(0, 40),
    lessons: [{
      id: uid("l-"),
      title: String(w.lessonTitle ?? w.title ?? `Week ${i + 1}`).slice(0, 90),
      goal: w.goal ? String(w.goal).slice(0, 240) : undefined,
      branches: {},
      modules: (w.cards ?? []).slice(0, 20).filter((c) => c.title).map((c) => {
        // A "quiz" without questions would be empty; make it practice instead.
        const type = (types.has(String(c.type)) && c.type !== "quiz" ? c.type : "practice") as ModuleType;
        const m = card(String(c.title), String(c.body ?? ""), type);
        if (Number(c.minutes) > 0 && Number(c.minutes) <= 180) m.minutes = Math.round(Number(c.minutes));
        if (c.criteria) m.criteria = String(c.criteria).slice(0, 300);
        return m;
      }),
    }],
  })).filter((w) => w.lessons[0].modules.length);
}
