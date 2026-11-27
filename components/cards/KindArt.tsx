import { fileExt, hash, hostOf } from "@/lib/cards";
import { isAsked } from "@/lib/grading";
import { faceOf, type Face } from "@/lib/kinds";
import { meetingOf } from "@/lib/media";
import type { Module } from "@/lib/types";
import { cardColor } from "@/lib/ui";

/**
 * The picture on a card with no picture of its own, cut from coloured paper: it shows what is in the card, not only
 * what kind it is. Four options are four strips of paper, a twelve-question quiz a fan of cards with “12 Q” on it, a
 * long text a thicker pile with its reading time, a recording a strip as long as it is. Cards with the same content
 * still differ: the tilt, the shade of the paper, a piece of tape or a clip and the scraps around it come from the
 * card's id. It never shows which answer is right.
 *
 * Drawn as one SVG with no filters (a shadow is a second, offset piece of paper), so cards that scale and move as
 * they open stay smooth.
 */
export function KindArt({ m, tint }: { m: Module; tint: string }) {
  const face = faceOf(m);
  const color = cardColor(m);
  const c = palette(m.id, tint, color?.foil ? { id: color.id, cover: color.cover } : undefined);
  const inner = draw(face, m, c);
  return (
    <div className="relative h-full w-full overflow-hidden" aria-hidden="true" style={{ background: c.bg }}>
      <svg viewBox="14 5 132 90" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" dangerouslySetInnerHTML={{ __html: (c.defs ?? "") + inner }} />
    </div>
  );
}

// ---------- paper and colour ----------

type Pal = { tint: string; deep: string; d2: string; p3: string; p2: string; p1: string; bg: string; cream: string; r: () => number; defs?: string };
const CREAM = "#fffdf8";
const SHADOW = "rgba(70,48,16,0.15)";
const SHADOW_FAR = "rgba(70,48,16,0.07)";

/** A small seeded generator, so a card's picture is the same every time. */
function rng(seed: number) {
  let a = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  if (A.some(Number.isNaN)) return a;
  return "#" + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, "0")).join("");
}
function palette(id: string, tint: string, foil?: { id: string; cover: string }): Pal {
  const r = rng(hash(id) + 0.0007);
  const k = r() * 0.08;
  const p: Pal = { tint, deep: tint, d2: mix(tint, "#ffffff", 0.25), p3: mix(tint, "#ffffff", 0.45 - k), p2: mix(tint, "#ffffff", 0.66 - k), p1: mix(tint, "#ffffff", 0.82), bg: mix(tint, "#ffffff", 0.9), cream: CREAM, r };
  if (foil) {
    // Gold, silver, platinum and the holographic cards: the paper is foil, the colours of the card's own sheen.
    const stops = [...foil.cover.matchAll(/(#[0-9a-f]{6}) (\d+)%/gi)].map(([, col, at]) => `<stop offset="${Number(at) / 100}" stop-color="${col}"/>`).join("");
    const gid = `qh-foil-${foil.id}`;
    p.defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0.7">${stops}</linearGradient></defs>`;
    p.cream = p.p1 = `url(#${gid})`;
  }
  return p;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
const n2 = (x: number) => Math.round(x * 100) / 100;
const rot = (d: number, cx: number, cy: number, s: string) => `<g transform="rotate(${n2(d)} ${n2(cx)} ${n2(cy)})">${s}</g>`;
/** A piece of paper with its shadow under it (higher pieces, `big`, cast a longer one). */
function P(x: number, y: number, w: number, h: number, fill: string, o: { r?: number; big?: boolean; flat?: boolean } = {}) {
  const r = o.r ?? 2.5;
  const box = (dy: number, f: string, g = 0) => `<rect x="${n2(x - g)}" y="${n2(y + dy)}" width="${n2(w + g * 2)}" height="${n2(h)}" rx="${r}" fill="${f}"/>`;
  return (o.flat ? "" : box(o.big ? 3 : 2.2, SHADOW_FAR, 0.6) + box(o.big ? 1.5 : 1.1, SHADOW)) + box(0, fill);
}
/** Any other shape of paper, with its shadow. */
const cut = (d: string, fill: string, big = false) => `<path d="${d}" fill="${SHADOW_FAR}" transform="translate(0 ${big ? 3 : 2.2})"/><path d="${d}" fill="${SHADOW}" transform="translate(0 ${big ? 1.5 : 1.1})"/><path d="${d}" fill="${fill}"/>`;
const T = (x: number, y: number, s: string | number, f: string, sz = 8, w = 700, a = "start", fam = "-apple-system,system-ui,sans-serif") =>
  `<text x="${n2(x)}" y="${n2(y)}" font-size="${sz}" font-weight="${w}" fill="${f}" text-anchor="${a}" font-family="${fam}">${esc(String(s))}</text>`;
/** A little paper label stuck on a little crooked: a count, a length, a time. */
function tag(x: number, y: number, s: string, c: Pal, d = -4, fill?: string) {
  const w = s.length * 4.7 + 9;
  // Kept inside what shows of the picture (its viewBox starts at 14 and is 132 wide).
  x = Math.max(17, Math.min(x, 143 - w));
  return rot(d, x + w / 2, y + 5, P(x, y, w, 11, fill ?? c.deep, { r: 2 }) + T(x + w / 2, y + 8, s, "#fff", 7, 700, "middle"));
}
/** Scraps of paper around the edges. */
function scraps(c: Pal, n = 3) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const x = 8 + c.r() * 144, y = 8 + c.r() * 84, w = 3 + c.r() * 4, h = 2 + c.r() * 2, a = c.r() * 90;
    if (x > 34 && x < 126 && y > 14 && y < 86) continue;
    s += rot(a, x, y, `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${[c.p3, c.p2, c.d2][i % 3]}"/>`);
  }
  return s;
}
const lines = (x: number, y: number, w: number, n: number, c: Pal, gap = 7, first?: string) =>
  Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${n2(y + i * gap)}" width="${n2(i === n - 1 && n > 1 ? w * 0.6 : w * (0.85 + ((i * 37) % 15) / 100))}" height="3" rx="1.5" fill="${i === 0 && first ? first : c.p2}"/>`).join("");
const LETTERS = "ABCDEFGHIJ";

// ---------- what's in a card ----------

function words(body: string) {
  const t = body.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`|[\]()-]/g, " ");
  return (t.match(/[A-Za-z0-9'’]+/g) ?? []).length + Math.round((t.match(/[㐀-鿿]/g) ?? []).length / 1.6);
}
/** The first table in a card's text: its rows (without the header) and columns. */
function tableSize(body: string) {
  const rows = body.split("\n").filter((l) => /^\s*\|.*\|\s*$/.test(l));
  if (rows.length < 2) return { rows: 3, cols: 3 };
  return { cols: Math.max(1, rows[0].split("|").length - 2), rows: Math.max(1, rows.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).length - 1) };
}
const asked = (m: Module) => (m.questions ?? []).filter(isAsked);
const firstQ = (m: Module) => asked(m)[0] ?? m.questions?.[0];
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;

function draw(face: Face, m: Module, c: Pal): string {
  const a = (m.attachments ?? [])[0];
  switch (face) {
    case "text": {
      const body = m.body ?? "";
      const w = words(body);
      const n = Math.max(1, Math.min(4, Math.ceil(w / 300)));
      const j = c.r() * 9 - 4.5;
      const deco = Math.floor(c.r() * 3);
      let s = "";
      for (let i = n - 1; i > 0; i--) s += rot(j + i * 2.4 - 1, 80, 50, P(48 + i * 2.5, 16 + i * 2, 62, 70, i % 2 ? c.p2 : c.p1));
      let page: string;
      if (/```/.test(body)) {
        page = P(48, 16, 62, 70, "#2a2a28") + T(56, 30, "</>", c.p2, 9) + [0, 1, 2, 3, 4].map((i) => `<rect x="${56 + (i % 3 === 1 ? 6 : 0)}" y="${38 + i * 8}" width="${[22, 30, 18, 26, 14][i]}" height="3" rx="1.5" fill="${[c.p3, "#e7c26a", "#9bd1a8", c.p3, "#e7c26a"][i]}"/>`).join("");
      } else if ((body.match(/^\s*([-*+]|\d+[.)])\s/gm) ?? []).length >= 3) {
        page = P(48, 16, 62, 70, c.cream) + `<rect x="55" y="24" width="34" height="4" rx="2" fill="${c.deep}"/>` + [0, 1, 2, 3].map((i) => `<circle cx="58" cy="${39 + i * 10}" r="2.6" fill="${c.d2}"/><rect x="64" y="${37.5 + i * 10}" width="${[34, 26, 30, 20][i]}" height="3" rx="1.5" fill="${c.p2}"/>`).join("");
      } else if (/^\s*>/.test(body)) {
        page = P(48, 16, 62, 70, c.cream) + T(54, 48, "“", c.deep, 34, 700, "start", "Georgia,serif") + lines(56, 52, 44, 3, c, 8);
      } else {
        page = P(48, 16, 62, 70, c.cream) + (w ? `<rect x="55" y="24" width="38" height="5" rx="2.5" fill="${c.deep}"/>` + lines(55, 36, 46, Math.min(6, 2 + Math.round(w / 250)), c, 6.6) : lines(55, 26, 46, 2, c, 8, c.p1));
      }
      const extra = deco === 0 ? rot(-28 + c.r() * 14, 56, 17, `<rect x="44" y="13" width="24" height="8" fill="${c.p3}" opacity=".75"/>`)
        : deco === 1 ? `<path d="M100 8v16a4 4 0 0 1-8 0V12a2.5 2.5 0 0 1 5 0v11" stroke="${c.d2}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
        : `<circle cx="104" cy="22" r="6" fill="${SHADOW}" transform="translate(0 1.2)"/><circle cx="104" cy="22" r="6" fill="${c.p3}"/><circle cx="104" cy="22" r="2.2" fill="${CREAM}"/>`;
      const min = m.minutes ?? (w ? Math.max(1, Math.round(w / 200)) : 0);
      return s + rot(j, 80, 50, page) + extra + (min ? tag(108, 72, `${min} MIN`, c, 6) : "") + scraps(c);
    }
    case "table": {
      const { rows, cols } = tableSize(m.body ?? "");
      const R = Math.min(rows, 6), C = Math.min(cols, 5), cw = Math.min(16, 80 / C), rh = Math.min(10, 58 / (R + 1)), W = cw * C, H = rh * (R + 1), x = 80 - W / 2, y = 50 - H / 2;
      let s = P(x - 3, y - 3, W + 6, H + 6, c.cream, { big: true }) + `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(W)}" height="${n2(rh)}" fill="${c.deep}" rx="1.5"/>`;
      for (let i = 1; i <= R; i++) for (let k = 0; k < C; k++) s += `<rect x="${n2(x + k * cw + 0.8)}" y="${n2(y + i * rh + 0.8)}" width="${n2(cw - 1.6)}" height="${n2(rh - 1.6)}" rx="1" fill="${(i + k) % 2 ? c.p1 : c.p2}"/>`;
      return rot(c.r() * 4 - 2, 80, 50, s) + tag(110, 74, `${rows}×${cols}`, c, 5) + scraps(c);
    }
    case "file": {
      const ext = a ? fileExt(a) : "FILE";
      const col = /^PDF$/.test(ext) ? "#d2483c" : /^DOCX?|PAGES|RTF|TXT$/.test(ext) ? "#2f6fdb" : /^PPTX?|KEY$/.test(ext) ? "#d9692b" : /^XLSX?|CSV|NUMBERS$/.test(ext) ? "#2e8b57" : "#55544f";
      const label = ext.slice(0, 5);
      const lab = { ...c, deep: col };
      if (/^PPTX?|KEY$/.test(ext)) {
        return rot(c.r() * 4 - 2, 80, 50, P(34, 22, 92, 58, c.cream, { big: true }) + `<rect x="42" y="30" width="44" height="5" rx="2.5" fill="${col}"/>` + lines(42, 42, 38, 3, c, 7) + `<circle cx="106" cy="54" r="12" fill="${mix(col, "#ffffff", 0.55)}"/><path d="M106 54V42a12 12 0 0 1 12 12z" fill="${col}"/>`) + tag(28, 14, label, lab, -6) + scraps(c);
      }
      const inner = /^XLSX?|CSV|NUMBERS$/.test(ext)
        ? [0, 1, 2, 3, 4].map((i) => [0, 1, 2].map((k) => `<rect x="${56 + k * 16}" y="${30 + i * 9}" width="14" height="7" rx="1" fill="${i === 0 ? mix(col, "#ffffff", 0.5) : (i + k) % 2 ? "#eef5f0" : "#e0ede4"}"/>`).join("")).join("")
        : `<rect x="56" y="26" width="30" height="5" rx="2.5" fill="${col}"/>` + lines(56, 38, 40, 5, c, 7);
      return rot(c.r() * 5 - 2.5, 80, 50, cut("M50 16h44l14 14v56H50z", c.cream, true) + `<path d="M94 16v14h14z" fill="${c.p2}"/>` + inner) + tag(40, 66, label, lab, -7) + scraps(c);
    }
    case "link": {
      const host = a ? hostOf(a.url) : "";
      const h = host.length > 20 ? host.slice(0, 19) + "…" : host;
      return rot(c.r() * 4 - 2, 80, 50, P(30, 18, 100, 66, c.cream, { big: true }) + `<rect x="30" y="18" width="100" height="12" rx="2.5" fill="${c.p2}"/>` + [0, 1, 2].map((i) => `<circle cx="${37 + i * 6}" cy="24" r="1.8" fill="${CREAM}"/>`).join("")
        + `<rect x="56" y="21" width="62" height="6" rx="3" fill="${CREAM}"/>` + T(87, 25.9, h, c.tint, 5.2, 600, "middle")
        + `<rect x="38" y="36" width="40" height="40" rx="2.5" fill="${c.p1}"/><circle cx="58" cy="56" r="12" fill="${c.d2}"/><path d="M46 56h24M58 44c-6 8-6 16 0 24M58 44c6 8 6 16 0 24" stroke="${CREAM}" stroke-width="1.4" fill="none"/>` + lines(84, 40, 38, 5, c, 7)) + scraps(c);
    }
    case "meeting": {
      const app = (a && meetingOf(a.url)) ?? "Meeting";
      const time = m.dueTime;
      return rot(c.r() * 4 - 2, 80, 50, P(30, 30, 56, 40, c.deep, { big: true, r: 7 }) + cut("M86 42l20-10v36l-20-10z", c.d2) + `<circle cx="58" cy="50" r="12" fill="${c.p1}"/><circle cx="58" cy="50" r="6" fill="${c.deep}"/><circle cx="76" cy="38" r="2.4" fill="#e65b4f"/>`)
        + (time ? rot(6, 122, 30, `<circle cx="122" cy="31.4" r="15" fill="${SHADOW}"/><circle cx="122" cy="30" r="15" fill="${c.cream}"/>` + T(122, 33, time, c.tint, 8, 700, "middle")) : "")
        + tag(92, 76, app.replace("Microsoft ", ""), c, 4) + scraps(c);
    }
    case "recording": {
      const secs = a?.duration ?? 0;
      const len = secs || 30;
      const n = Math.round(Math.min(30, Math.max(7, len / 5))), W = Math.min(120, 24 + n * 3.4), x = 80 - W / 2;
      const r = rng(hash(a?.id ?? m.id) + 0.003);
      let s = P(x, 32, W, 36, c.cream, { big: true, r: 18 });
      for (let i = 0; i < n; i++) {
        const h = 6 + r() * 20, step = (W - 24) / n;
        s += `<rect x="${n2(x + 12 + i * step)}" y="${n2(50 - h / 2)}" width="${n2(Math.max(1.6, step - 1.4))}" height="${n2(h)}" rx="1" fill="${i < n * 0.35 ? c.deep : c.p3}"/>`;
      }
      return rot(c.r() * 3 - 1.5, 80, 50, s) + (secs ? tag(x + W - 24, 70, clock(secs), c, 5) : "") + scraps(c);
    }
    case "image": {
      const sx = 92 + c.r() * 14, sy = 32 + c.r() * 8;
      return rot(c.r() * 6 - 3, 80, 50, P(32, 16, 96, 68, c.cream, { big: true }) + `<rect x="38" y="22" width="84" height="56" rx="1.5" fill="${c.p1}"/><circle cx="${n2(sx)}" cy="${n2(sy)}" r="7" fill="#f2c46b"/>`
        + cut(`M38 78L${n2(60 + c.r() * 8)} 46L80 66L${n2(94 + c.r() * 6)} 52L122 78z`, c.d2) + cut("M38 78l18-16 18 16z", c.deep)) + scraps(c);
    }
    case "video": {
      return rot(c.r() * 4 - 2, 80, 50, P(30, 22, 100, 58, c.deep, { big: true, r: 5 }) + `<rect x="36" y="28" width="88" height="40" rx="2" fill="${c.d2}"/>` + cut("M74 38v20l17-10z", CREAM) + `<rect x="36" y="72" width="88" height="3" rx="1.5" fill="${c.p3}"/><rect x="36" y="72" width="${n2(20 + c.r() * 40)}" height="3" rx="1.5" fill="${CREAM}"/>`) + scraps(c);
    }
    case "choice": {
      const q = firstQ(m);
      const opts = q?.options ?? [];
      const n = Math.max(2, Math.min(6, opts.length || 3));
      const tf = opts.length === 2 && opts.every((o) => /^\s*(true|false|yes|no|right|wrong|对|错|正确|错误|是|否)\s*[.!]?\s*$/i.test(o));
      if (tf) {
        return rot(-5, 56, 50, P(36, 28, 38, 42, c.cream, { big: true, r: 6 }) + `<path d="M47 50l6 6 11-13" stroke="${c.deep}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
          + rot(4, 104, 50, P(86, 28, 38, 42, c.deep, { big: true, r: 6 }) + `<path d="M98 41l14 16M112 41l-14 16" stroke="${CREAM}" stroke-width="4" stroke-linecap="round"/>`) + scraps(c);
      }
      // The options that deal a card: a string from each to a little card.
      const deals = (q?.next ?? []).slice(0, n).map((x, i) => (x && (!Array.isArray(x) || x.length) ? i : -1)).filter((i) => i >= 0).slice(0, 3);
      return strips(c, n, deals) + scraps(c);
    }
    case "checkboxes": {
      const n = Math.max(2, Math.min(6, firstQ(m)?.options.length || 3));
      const h = Math.max(8.5, Math.min(12, 58 / n - 2));
      let s = "";
      for (let i = 0; i < n; i++) {
        const y = 50 - (n * (h + 3)) / 2 + i * (h + 3), on = (hash(m.id + i) * 10) % 2 < 1.1;
        s += rot(c.r() * 3 - 1.5, 80, y + h / 2, P(40, y, 80, h, c.cream) + `<rect x="44" y="${n2(y + 2)}" width="${n2(h - 4)}" height="${n2(h - 4)}" rx="1.5" fill="${on ? c.deep : c.p1}" stroke="${c.d2}" stroke-width=".8"/>`
          + (on ? `<path d="M46 ${n2(y + h / 2)}l${n2(h * 0.15)} ${n2(h * 0.18)} ${n2(h * 0.3)} -${n2(h * 0.32)}" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>` : "")
          + `<rect x="${n2(46 + h)}" y="${n2(y + h / 2 - 1.5)}" width="${30 + ((i * 13) % 20)}" height="3" rx="1.5" fill="${c.p2}"/>`);
      }
      return s + scraps(c);
    }
    case "order": {
      const n = Math.max(2, Math.min(6, firstQ(m)?.options.length || 3));
      const w = Math.min(26, 96 / n);
      let s = "";
      for (let i = 0; i < n; i++) {
        const hh = 12 + i * (52 / n), x = 80 - (n * w) / 2 + i * w, y = 80 - hh, light = i < 4;
        s += P(x + 0.5, y, w - 1, hh, [c.cream, c.p1, c.p2, c.p3, c.d2, c.deep][Math.min(5, i)], { r: 2 }) + `<circle cx="${n2(x + w / 2)}" cy="${n2(y + 7)}" r="${n2(Math.min(5, w / 2 - 2))}" fill="${light ? c.deep : CREAM}"/>` + T(x + w / 2, y + 9.6, i + 1, light ? "#fff" : c.tint, Math.min(7, w / 2), 800, "middle");
      }
      return rot(c.r() * 2 - 1, 80, 50, s) + scraps(c);
    }
    case "short": {
      return rot(c.r() * 3 - 1.5, 80, 50, P(30, 38, 100, 22, c.cream, { big: true, r: 4 }) + T(38, 53, "Aa", c.p3, 10) + `<rect x="58" y="44" width="2" height="12" fill="${c.deep}"/><rect x="34" y="62" width="92" height="2" rx="1" fill="${c.d2}"/>`)
        + rot(-20 + c.r() * 10, 118, 28, cut("M108 34l18-18 5 5-18 18-7 2z", c.deep) + `<path d="M126 16l5 5" stroke="${c.p2}" stroke-width="2"/>`) + scraps(c);
    }
    case "quiz": {
      const n = asked(m).length || 3;
      const k = Math.min(n, 7);
      let s = "";
      for (let i = 0; i < k; i++) {
        const deg = (i - (k - 1) / 2) * (k > 4 ? 9 : 12);
        s += rot(deg, 80, 96, P(66, 22, 28, 40, i === k - 1 ? c.cream : [c.p1, c.p2, c.p3][i % 3], { r: 3 }) + (i === k - 1 ? T(80, 48, "?", c.deep, 18, 800, "middle", "Georgia,serif") : ""));
      }
      return s + tag(112, 70, `${n} Q`, c, 6) + scraps(c);
    }
    case "poll": {
      const n = Math.max(2, Math.min(6, firstQ(m)?.options.length || 3));
      const tally = m.tally && m.tally.some((x) => x > 0) ? m.tally.slice(0, n) : undefined;
      const most = tally ? Math.max(...tally) : 1;
      const w = Math.min(18, 86 / n);
      let s = "";
      for (let i = 0; i < n; i++) {
        const v = tally ? (tally[i] ?? 0) / most : 0.5, h = tally ? 8 + v * 46 : 28, x = 80 - (n * (w + 4)) / 2 + i * (w + 4);
        s += P(x, 78 - h, w, h, tally ? (v === 1 ? c.deep : [c.p3, c.p2, c.d2][i % 3]) : c.cream, { r: 2 }) + (tally ? "" : T(x + w / 2, 70, "?", c.p3, 10, 800, "middle", "Georgia,serif")) + `<circle cx="${n2(x + w / 2)}" cy="86" r="3" fill="${c.d2}"/>`;
      }
      return `<rect x="24" y="78" width="112" height="2" rx="1" fill="${c.d2}"/>` + rot(c.r() * 2 - 1, 80, 50, s) + scraps(c);
    }
    case "signup": {
      const groups = Math.max(1, Math.min(5, firstQ(m)?.options.length || 3));
      const max = Math.max(1, Math.min(6, m.signupView?.max ?? m.signup?.max ?? 4));
      const counts = m.signupView?.counts ?? [];
      const gw = Math.min(34, 120 / groups);
      let s = "";
      for (let g = 0; g < groups; g++) {
        const x = 80 - (groups * gw) / 2 + g * gw + 2, full = (counts[g] ?? 0) >= max, mid = x + (gw - 4) / 2;
        s += rot(c.r() * 4 - 2, x + gw / 2, 50, P(x, 22, gw - 4, 58, full ? c.p2 : c.cream, { r: 3 }) + `<rect x="${n2(x)}" y="22" width="${n2(gw - 4)}" height="9" rx="2.5" fill="${c.deep}"/>` + T(mid, 29, `${g + 1}`, "#fff", 6.5, 800, "middle")
          + Array.from({ length: max }, (_, i) => {
            const cy = 38 + i * (40 / max), on = i < (counts[g] ?? 0);
            return `<circle cx="${n2(mid)}" cy="${n2(cy)}" r="2.6" fill="${on ? c.deep : "none"}" stroke="${c.d2}" stroke-width=".8"/><path d="M${n2(mid - 4.5)} ${n2(cy + 7)}a4.5 4.5 0 0 1 9 0z" fill="${on ? c.deep : "none"}" stroke="${c.d2}" stroke-width=".8"/>`;
          }).join("")
          + (full ? T(mid, 78, "FULL", c.tint, 5.5, 800, "middle") : ""));
      }
      return s + scraps(c);
    }
    case "discussion": {
      const bub = (x: number, y: number, w: number, f: string, flip: boolean) =>
        cut(`M${x} ${y}h${w}a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H${flip ? x + w - 8 : x + 14}l${flip ? 6 : -8} 8v-8H${x}a6 6 0 0 1-6-6V${y + 6}a6 6 0 0 1 6-6z`, f);
      const k = 3 + Math.floor(c.r() * 2);
      let s = "";
      for (let i = 0; i < k; i++) {
        const flip = i % 2 === 1, x = (flip ? 66 : 40) + (c.r() * 6 - 3), y = 14 + i * (62 / k);
        s += bub(n2(x), n2(y), 50, [c.cream, c.deep, c.p2, c.p1][i], flip) + lines(n2(x + 2), n2(y + 7), 36, 2, c, 6, i === 1 ? CREAM : undefined);
      }
      return s + (m.repliesNeeded ? tag(108, 76, `REPLY ×${m.repliesNeeded}`, c, 6) : "") + scraps(c);
    }
    case "answer": {
      // Parts to answer: the old prompts, or a numbered list in the card's text (where they live now).
      const prompts = m.prompts?.filter((p) => p.trim()).length || ((m.body ?? "").match(/^\s*\d+[.)]\s+\S/gm) ?? []).length;
      if (m.timer) {
        const f = Math.min(1, m.timer / 300), ang = f * 2 * Math.PI;
        const end = f >= 1 ? `M80 54m-22 0a22 22 0 1 0 44 0a22 22 0 1 0 -44 0` : `M80 54V32A22 22 0 ${f > 0.5 ? 1 : 0} 1 ${n2(80 + 22 * Math.sin(ang))} ${n2(54 - 22 * Math.cos(ang))}z`;
        return rot(c.r() * 6 - 3, 80, 52, `<circle cx="80" cy="57" r="26" fill="${SHADOW}"/><circle cx="80" cy="54" r="26" fill="${c.cream}"/><rect x="76" y="22" width="8" height="7" rx="2" fill="${c.deep}"/><path d="${end}" fill="${c.p3}"/><circle cx="80" cy="54" r="3" fill="${c.deep}"/>`)
          + tag(104, 74, m.timer >= 60 ? `${Math.round(m.timer / 60)} MIN` : `${m.timer} SEC`, c, 5) + scraps(c);
      }
      if (prompts > 1) {
        const k = Math.min(prompts, 4);
        return rot(c.r() * 3 - 1.5, 80, 50, P(44, 14, 72, 72, c.cream, { big: true }) + Array.from({ length: k }, (_, i) => {
          const h = 58 / k - 4, y = 20 + i * (58 / k);
          return `<rect x="50" y="${n2(y)}" width="40" height="3" rx="1.5" fill="${c.d2}"/><rect x="50" y="${n2(y + 5)}" width="60" height="${n2(h - 5)}" rx="2" fill="${c.p1}" stroke="${c.p2}" stroke-width=".6" stroke-dasharray="2 1.5"/>`;
        }).join("")) + tag(110, 74, `${prompts} PARTS`, c, 6) + scraps(c);
      }
      return rot(c.r() * 3 - 1.5, 74, 50, P(42, 16, 64, 70, c.cream, { big: true }) + `<path d="M50 34q6-5 12 0t12 0 12 0 10 0M50 46q6-5 12 0t12 0 12 0M50 58q6-5 12 0t10 0" stroke="${c.d2}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`)
        + rot(35, 118, 52, `<rect x="113" y="23.5" width="9" height="52" rx="1.5" fill="${SHADOW}"/><rect x="113" y="22" width="9" height="52" rx="1.5" fill="${c.deep}"/><path d="M113 74l4.5 10 4.5-10z" fill="#e9cfa6"/><rect x="113" y="22" width="9" height="6" fill="${c.p3}"/>`) + scraps(c);
    }
    case "worksheet": {
      const found = ((m.body ?? "").match(/_{3,}|\[\s*\]/g) ?? []).length;
      const blanks = Math.max(1, Math.min(3, found || 3));
      return rot(c.r() * 3 - 1.5, 80, 50, P(44, 14, 72, 72, c.cream, { big: true }) + `<rect x="51" y="21" width="36" height="5" rx="2.5" fill="${c.deep}"/>` + Array.from({ length: 6 }, (_, i) => {
        const y = 33 + i * 8.5, b = i % 2 === 1 && Math.floor(i / 2) < blanks;
        return b ? `<rect x="51" y="${n2(y)}" width="14" height="3" rx="1.5" fill="${c.p2}"/><rect x="67" y="${n2(y - 2.5)}" width="30" height="7" rx="1.5" fill="${c.p1}" stroke="${c.d2}" stroke-width=".7" stroke-dasharray="2 1.5"/>`
          : `<rect x="51" y="${n2(y)}" width="${46 + ((i * 7) % 12)}" height="3" rx="1.5" fill="${c.p2}"/>`;
      }).join("")) + (found ? tag(110, 74, `${found} BLANK${found > 1 ? "S" : ""}`, c, 6) : "") + scraps(c);
    }
    case "doc": {
      const cols = ["#e0723c", "#3f8a5c", "#7a5bc0", "#d2483c"];
      const k = m.writers === "class" ? 4 : 3;
      return rot(c.r() * 3 - 1.5, 80, 50, P(40, 14, 80, 72, c.cream, { big: true }) + `<rect x="48" y="21" width="34" height="5" rx="2.5" fill="${c.deep}"/>` + lines(48, 34, 62, 6, c, 7.6)
        + Array.from({ length: k }, (_, i) => {
          const x = 56 + ((i * 23 + Math.floor(c.r() * 10)) % 52), y = 33 + i * 9.6;
          return `<rect x="${x}" y="${n2(y - 3)}" width="1.6" height="9" fill="${cols[i]}"/><path d="M${x} ${n2(y - 3)}h9l-2.5 3 2.5 3h-9z" fill="${cols[i]}"/>`;
        }).join("")) + scraps(c);
    }
    case "group": {
      const n = m.members?.length || 3;
      const k = Math.min(n, 6);
      let s = "";
      for (let i = k - 1; i >= 0; i--) s += P(56 + i * 5, 20 + i * 1.5, 40, 54, i === 0 ? c.cream : [c.p1, c.p2, c.p3, c.d2, c.deep][(i - 1) % 5], { r: 4 });
      s += `<rect x="62" y="28" width="22" height="4" rx="2" fill="${c.deep}"/>` + lines(62, 38, 26, 3, c, 7);
      return rot(c.r() * 4 - 4, 80, 50, s) + tag(108, 76, `${n} CARDS`, c, 5) + scraps(c);
    }
    default: {
      const never: never = face;
      void never;
      return "";
    }
  }
}

/** Options as strips of paper, each with its letter; those that deal a card trail a string to a little card. */
function strips(c: Pal, n: number, deals: number[]) {
  const two = n > 4, rows = two ? Math.ceil(n / 2) : n, h = Math.min(13, 60 / rows - 3), dealing = deals.length > 0 && !two;
  const w = two ? 40 : dealing ? 62 : 76, x0 = two ? 36 : dealing ? 30 : 42;
  let s = "";
  for (let i = 0; i < n; i++) {
    const col = two ? Math.floor(i / rows) : 0, row = two ? i % rows : i, x = x0 + col * 46, y = 50 - (rows * (h + 4)) / 2 + row * (h + 4);
    s += rot(c.r() * 3 - 1.5, x + w / 2, y + h / 2, P(x, y, w, h, i % 2 ? c.p1 : c.cream)
      + `<circle cx="${n2(x + h / 2 + 1)}" cy="${n2(y + h / 2)}" r="${n2(h / 2 - 2)}" fill="${[c.deep, c.d2, c.p3][i % 3]}"/>` + T(x + h / 2 + 1, y + h / 2 + 2.6, LETTERS[i], "#fff", Math.min(7, h - 5), 800, "middle")
      + `<rect x="${n2(x + h + 3)}" y="${n2(y + h / 2 - 1.5)}" width="${n2(w - h - 10)}" height="3" rx="1.5" fill="${c.p2}"/>`);
    const d = deals.indexOf(i);
    if (dealing && d >= 0) {
      const yy = y + h / 2, ty = 50 + (d - (deals.length - 1) / 2) * 16;
      s += `<path d="M${n2(x + w)} ${n2(yy)} C ${n2(x + w + 14)} ${n2(yy)}, ${n2(x + w + 8)} ${n2(ty)}, 118 ${n2(ty)}" stroke="${c.d2}" stroke-width="1.2" stroke-dasharray="2.5 2" fill="none"/>`
        + rot(6 - d * 5, 124, ty, P(117, ty - 6, 14, 12, d ? c.p2 : c.deep, { r: 2 }));
    }
  }
  return s;
}
