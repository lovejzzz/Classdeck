// Code in a student's work: found without anyone marking it, so it can show as code (monospace, indentation kept)
// and, for Python, run. Careful by design: a sentence with a colon or "x = 5" in prose isn't code.

export type Piece = { kind: "text"; text: string } | { kind: "code"; text: string; lang: "python" | "other" };

const PY_STRONG = /^\s*(import\s+\w|from\s+[\w.]+\s+import\s|def\s+\w+\s*\(|class\s+\w+[(:]|for\s+.+\s+in\s+.+:\s*$|while\s+.+:\s*$|if\s+.+:\s*$|elif\s+.+:\s*$|else\s*:\s*$|try\s*:\s*$|except\b.*:\s*$|return\b|print\s*\()/;
const PY_LINE = /^\s*(#.*|[A-Za-z_][\w.]*(\[[^\]]*\])?\s*([+\-*/%]?=)\s*\S.*|[A-Za-z_][\w.]*\s*\(.*\)\s*|@\w+.*|pass|break|continue|\)|\]|\})\s*$/;

/** Whether a run of lines reads as Python: most lines look like code, and at least one is unmistakably Python. */
export function looksLikePython(lines: string[]): boolean {
  const real = lines.filter((l) => l.trim());
  if (real.length < 2) return false;
  const strong = real.filter((l) => PY_STRONG.test(l)).length;
  const codey = real.filter((l) => PY_STRONG.test(l) || PY_LINE.test(l)).length;
  const indented = real.some((l) => /^( {2,}|\t)\S/.test(l));
  return strong >= 1 && codey / real.length >= 0.7 && (indented || strong >= 2 || real.length <= 4);
}

/**
 * A piece of work split into text and code: fenced blocks (```python … ```) always, and otherwise paragraphs (between
 * blank lines, or a run of lines) that read as Python. Prose stays text.
 */
export function splitCode(text: string): Piece[] {
  const out: Piece[] = [];
  const push = (p: Piece) => {
    const last = out[out.length - 1];
    if (last && last.kind === p.kind && p.kind === "text") last.text += `\n\n${p.text}`;
    else if (last && last.kind === "code" && p.kind === "code" && last.lang === p.lang) last.text += `\n\n${p.text}`;
    else out.push(p);
  };
  const fence = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g;
  let at = 0;
  for (const m of text.matchAll(fence)) {
    if (m.index! > at) prose(text.slice(at, m.index), push);
    const lang = /^(py|python|python3)$/i.test(m[1]) || (!m[1] && looksLikePython(m[2].split("\n"))) ? "python" : "other";
    push({ kind: "code", text: m[2].replace(/\s+$/, ""), lang });
    at = m.index! + m[0].length;
  }
  if (at < text.length) prose(text.slice(at), push);
  return out.filter((p) => p.text.trim());
}

/** Unfenced text: each paragraph that reads as Python is code (a blank line inside code keeps it together). */
function prose(text: string, push: (p: Piece) => void) {
  const paras = text.replace(/\r/g, "").split(/\n\s*\n/);
  for (const para of paras) {
    const lines = para.split("\n");
    // Code and prose in one paragraph (code, then "It's a dice game"): the code part, then the rest.
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() && !PY_STRONG.test(lines[end - 1]) && !PY_LINE.test(lines[end - 1]) && !/^\s/.test(lines[end - 1])) end--;
    const head = lines.slice(0, end), tail = lines.slice(end);
    if (end >= 2 && looksLikePython(head)) {
      push({ kind: "code", text: head.join("\n").replace(/\s+$/, ""), lang: "python" });
      if (tail.join("").trim()) push({ kind: "text", text: tail.join("\n").trim() });
    } else if (para.trim()) push({ kind: "text", text: para.trim() });
  }
}

/** For a one-line preview: code keeps its first lines (in a mono line), text is squeezed as before. */
export function previewOf(text: string): { code?: string; text?: string } {
  const pieces = splitCode(text);
  const first = pieces[0];
  if (first?.kind === "code") return { code: first.text.split("\n").filter((l) => l.trim()).slice(0, 2).join("  ⏎  ") };
  return { text: text.replace(/[#*_>|-]+/g, " ").replace(/\s+/g, " ").trim() };
}

/** A short fingerprint of some code, to know whether a saved run is of the code as it is now. */
export function codeKey(code: string): string {
  let h = 5381;
  for (let i = 0; i < code.length; i++) h = ((h << 5) + h + code.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** All the Python in some work, joined (what a student's Run button runs, and what a saved run is checked against). */
export function pythonIn(text: string): string {
  return splitCode(text).filter((p) => p.kind === "code" && p.lang === "python").map((p) => p.text).join("\n\n");
}
