import { ConnectorError, type ToolResult } from "./connectors/types";

// Script analysis for speakers. Pure functions, so it runs on the server (Speech coach connector)
// and in the browser (checking a recording's transcript).

const fmt = (n: number, digits = 0) => n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

const FILLERS = ["um", "uh", "erm", "like", "you know", "basically", "actually", "literally", "kind of", "sort of", "i mean", "so yeah", "right?", "just"];
const STOP = new Set("the a an and or but of to in on at for with is are was were be been it this that these those i you we they he she my your our their as by from so if then than not no do does did have has had can will would could should about into over just very really also there here what which who when where how all any some more most".split(" "));

function syllables(w: string) {
  const s = w.toLowerCase().replace(/[^a-z]/g, "");
  if (s.length <= 3) return 1;
  return Math.max(1, s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g)?.length ?? 1);
}

export function analyzeScript(text: string, target: number): ToolResult {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => /\w/.test(s));
  const tokens = text.match(/[A-Za-z’']+/g) ?? [];
  const n = tokens.length;
  if (n < 5) throw new ConnectorError("bad_input", "Paste at least a few sentences of your script");
  const lower = ` ${text.toLowerCase().replace(/[^a-z’'? ]+/g, " ").replace(/\s+/g, " ")} `;
  const fillers = FILLERS.map((f) => [f, lower.split(` ${f} `).length - 1] as const).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  const lens = sentences.map((s) => (s.match(/[A-Za-z’']+/g) ?? []).length);
  const longest = Math.max(...lens);
  const syl = tokens.reduce((t, w) => t + syllables(w), 0);
  const ease = 206.835 - 1.015 * (n / Math.max(1, sentences.length)) - 84.6 * (syl / n);
  const easeLabel = ease >= 70 ? "easy to follow when spoken" : ease >= 50 ? "fine for most audiences" : ease >= 30 ? "dense; consider shorter sentences" : "very dense for listeners";
  const counts = new Map<string, number>();
  for (const w of tokens.map((t) => t.toLowerCase())) if (w.length > 3 && !STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const repeated = [...counts].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const at = (wpm: number) => Math.round((n / wpm) * 60);
  const sec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const rows: string[][] = [
    ["Words", fmt(n)],
    ["Speaking time", `${sec(at(150))} at a brisk pace · ${sec(at(130))} at a calm pace`],
  ];
  if (target) {
    const fit = Math.round((target / 60) * 140);
    rows.push(["Fits your time?", n <= fit ? `Yes. About ${fmt(fit - n)} words to spare for ${sec(target)}.` : `Cut about ${fmt(n - fit)} words to fit ${sec(target)} at a natural pace.`]);
  }
  rows.push(
    ["Sentences", `${sentences.length} · average ${fmt(n / Math.max(1, sentences.length), 1)} words · longest ${longest}`],
    ["Easy to listen to?", `Reading ease ${fmt(Math.max(0, Math.min(100, ease)))} / 100: ${easeLabel}`],
    ["Filler words", fillers.length ? fillers.map(([f, c]) => `“${f}” ×${c}`).join(", ") : "None found"],
  );
  if (repeated.length) rows.push(["Words you repeat", repeated.map(([w, c]) => `${w} ×${c}`).join(", ")]);
  if (longest > 30) rows.push(["Try this", `Split your longest sentence (${longest} words); listeners can’t reread.`]);
  return { render: "table", columns: ["Check", "Result"], rows };
}


/** Filler words in a text, total and by word. */
export function fillerCount(text: string) {
  const lower = ` ${text.toLowerCase().replace(/[^a-z’'? ]+/g, " ").replace(/\s+/g, " ")} `;
  const each = FILLERS.map((f) => [f, lower.split(` ${f} `).length - 1] as const).filter(([, c]) => c > 0);
  return { total: each.reduce((n, [, c]) => n + c, 0), each };
}

export const wordCount = (text: string) => (text.match(/[A-Za-z’']+/g) ?? []).length;
