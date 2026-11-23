// Card text is Markdown: headings, bold and italic, lists, quotes (shown as a callout), dividers, links and tables.
// A card written as plain text before is plain Markdown already. This reads it into blocks for display, and turns
// it back into plain words for previews, read-aloud and search. Raw HTML is never rendered: it stays as text.

export type Inline = { t: string; b?: boolean; i?: boolean; s?: boolean; code?: boolean; href?: string };
export type Block =
  | { k: "p"; lines: string[] }
  | { k: "h"; level: 1 | 2 | 3; text: string }
  | { k: "ul" | "ol"; items: { t: string; d: number }[]; start?: number }
  | { k: "quote"; lines: string[] }
  | { k: "hr" }
  | { k: "table"; head: string[]; rows: string[][]; align: ("left" | "center" | "right" | null)[] };

const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (line: string) => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  // Split on | not escaped as \|.
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
};

/** The text's blocks, in order. */
export function blocks(src: string): Block[] {
  // A table written inside a list item (indented) is shown as a table of its own, after the list.
  const lines = (src ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => (/^\s+\|/.test(l) ? l.trimStart() : l));
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { out.push({ k: "h", level: h[1].length as 1 | 2 | 3, text: h[2].trim() }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push({ k: "hr" }); i++; continue; }
    // A table: a row of cells, then the --- row under the header.
    if (line.includes("|") && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null));
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
      const body = rows.map((r) => head.map((_, c) => r[c] ?? ""));
      // A pasted table with no header (Google Sheets, Excel) has an empty one: its first row takes its place.
      if (head.every((c) => !c) && body.length) out.push({ k: "table", head: body[0], rows: body.slice(1), align });
      else out.push({ k: "table", head, rows: body, align });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push({ k: "quote", lines: q });
      continue;
    }
    const ul = /^(\s*)[-*+](?:\s+(.*))?$/, ol = /^(\s*)(\d+)[.)](?:\s+(.*))?$/;
    const top = (l: string) => (ul.test(l) || ol.test(l)) && !/^\s{2,}/.test(l);
    if (top(line) && /^\s*([-*+]|\d+[.)])\s/.test(`${line} `)) {
      const ordered = !ul.test(line);
      const items: { t: string; d: number }[] = [];
      const start = ordered ? Number(line.match(ol)![2]) : undefined;
      while (i < lines.length) {
        const l = lines[i];
        const m = l.match(ul) ?? l.match(ol);
        // An item of this list (or of a list inside it, indented): its depth follows its indent.
        if (m && (m[1].length >= 2 || (ordered ? ol.test(l) : ul.test(l)))) {
          const text = ((ul.test(l) ? m[2] : m[3]) ?? "").trim();
          if (text) items.push({ t: text, d: Math.min(3, Math.floor(m[1].length / 2)) });
          i++;
          continue;
        }
        // A line indented under an item belongs to it.
        if (/^\s{2,}\S/.test(l) && items.length) { items[items.length - 1].t += `\n${l.trim()}`; i++; continue; }
        break;
      }
      out.push({ k: ordered ? "ol" : "ul", items, start });
      continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s/.test(lines[i]) && !/^\s*>/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]))) {
      p.push(lines[i]);
      i++;
    }
    out.push({ k: "p", lines: p });
  }
  return out;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

// Math ($…$ and $$…$$, as MathText reads it) is kept whole: its _ and * aren't italics.
const MATH = /\$\$[\s\S]+?\$\$|(?<![\\$])\$(?=[^\s$])(?:\\\$|[^$\n])*?[^\s\\$]\$(?!\d)/g;

/** One line's runs of text: bold, italic, struck, code and links. $math$ is left as it is, for MathText. */
export function inline(src: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of src.matchAll(MATH)) {
    if (m.index! > at) out.push(...runs(src.slice(at, m.index)));
    out.push({ t: m[0] });
    at = m.index! + m[0].length;
  }
  if (at < src.length) out.push(...runs(src.slice(at)));
  return out;
}

function runs(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /(`[^`]+`)|\[([^\]]+)\]\(([^)\s]+)\)|(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\4|(~~)(?=\S)([\s\S]+?)(?<=\S)~~|(\*|_)(?=\S)([\s\S]+?)(?<=\S)\8(?![*_\w])/g;
  let at = 0;
  for (const m of src.matchAll(re)) {
    if (m.index! > at) out.push({ t: src.slice(at, m.index) });
    if (m[1]) out.push({ t: m[1].slice(1, -1), code: true });
    else if (m[2] !== undefined) out.push(...(SAFE_URL.test(m[3]) ? runs(m[2]).map((x) => ({ ...x, href: m[3] })) : [{ t: m[0] }]));
    else if (m[4]) out.push(...runs(m[5]).map((x) => ({ ...x, b: true })));
    else if (m[6]) out.push(...runs(m[7]).map((x) => ({ ...x, s: true })));
    else if (m[8]) out.push(...runs(m[9]).map((x) => ({ ...x, i: true })));
    at = m.index! + m[0].length;
  }
  if (at < src.length) out.push({ t: src.slice(at) });
  // Backslash escapes (\_ \* \# …) show as the character itself; \$ is left for MathText.
  for (const x of out) if (!x.code) x.t = x.t.replace(/\\([\\`*_{}\[\]()#+\-.!|>~<])/g, "$1");
  // Bare web addresses become links too.
  return out.flatMap((x) => {
    if (x.href || x.code) return [x];
    const parts: Inline[] = [];
    let k = 0;
    for (const u of x.t.matchAll(/https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g)) {
      if (u.index! > k) parts.push({ ...x, t: x.t.slice(k, u.index) });
      parts.push({ ...x, t: u[0], href: u[0] });
      k = u.index! + u[0].length;
    }
    if (k < x.t.length) parts.push({ ...x, t: x.t.slice(k) });
    return parts;
  });
}

/** Whether the text uses any Markdown beyond plain lines (so it's shown formatted, not as plain text). */
export function isRich(src?: string): boolean {
  if (!src) return false;
  // Escapes the editor writes (snake\_case) count too, so they never show their backslash.
  return blocks(src).some((b) => b.k !== "p") || /\*\*|__|~~|`|\[[^\]]+\]\(|\\[\\`*_{}[\]()#+\-.!|>~<]/.test(src);
}

/** The words only: for previews, read-aloud and search. */
export function plainText(src: string): string {
  const flat = (s: string) => inline(s).map((x) => x.t).join("");
  return blocks(src).map((b) => {
    switch (b.k) {
      case "p": return b.lines.map(flat).join("\n");
      case "h": return flat(b.text);
      case "ul": case "ol": { let n = (b.start ?? 1) - 1; return b.items.map((x) => `${"  ".repeat(x.d)}${b.k === "ol" && !x.d ? `${++n}.` : "•"} ${flat(x.t)}`).join("\n"); }
      case "quote": return b.lines.map(flat).join("\n");
      case "hr": return "";
      case "table": return [b.head, ...b.rows].map((r) => r.map(flat).join(" · ")).join("\n");
    }
  }).filter(Boolean).join("\n\n");
}
