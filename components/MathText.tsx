"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

/**
 * Math in card text, written the way math teachers already write it: $2^{o(n)}$ inline, $$\sum_i x_i$$ on its own line.
 * An opening $ must be followed, and a closing $ preceded, by something other than a space, so "$5 and $10" stays
 * money. Write \$ for a literal dollar sign.
 */
const MATH = /\$\$([\s\S]+?)\$\$|(?<![\\$])\$(?=[^\s$])((?:\\\$|[^$\n])*?[^\s\\$])\$(?!\d)/g;

export const hasMath = (s?: string) => !!s && new RegExp(MATH.source).test(s);

type Part = { t: string } | { math: string; block: boolean };

function split(s: string): Part[] {
  const out: Part[] = [];
  let at = 0;
  for (const m of s.matchAll(new RegExp(MATH.source, "g"))) {
    if (m.index! > at) out.push({ t: s.slice(at, m.index) });
    out.push(m[1] !== undefined ? { math: m[1], block: true } : { math: m[2], block: false });
    at = m.index! + m[0].length;
  }
  if (at < s.length) out.push({ t: s.slice(at) });
  return out.map((p) => ("t" in p ? { t: p.t.replace(/\\\$/g, "$") } : p));
}

/** Text with its $…$ math typeset. Plain text without math renders as it is. */
export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => split(text ?? ""), [text]);
  if (parts.length === 1 && "t" in parts[0]) return className ? <span className={className}>{parts[0].t}</span> : <>{parts[0].t}</>;
  return (
    <span className={className}>
      {parts.map((p, i) => ("t" in p ? <span key={i}>{p.t}</span> : (
        <span key={i} className={p.block ? "my-2 block overflow-x-auto" : undefined}
          dangerouslySetInnerHTML={{ __html: katex.renderToString(p.math, { displayMode: p.block, throwOnError: false, output: "htmlAndMathml", strict: "ignore", trust: false, maxSize: 20, maxExpand: 200 }) }} />
      )))}
    </span>
  );
}

/** The same text with math turned into something readable as plain words, for read-aloud, titles and short previews. */
export function plainMath(s: string): string {
  return split(s ?? "").map((p) => ("t" in p ? p.t : p.math
    .replace(/\\(?:left|right|,|;|!|quad|qquad)/g, " ")
    .replace(/\\([a-zA-Z]+)/g, (_, w: string) => GREEK[w] ?? w)
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim())).join("");
}

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ", tau: "τ", phi: "φ", omega: "ω",
  Delta: "Δ", Theta: "Θ", Omega: "Ω", Sigma: "Σ", sqrt: "√", cdot: "·", times: "×", le: "≤", leq: "≤", ge: "≥", geq: "≥", neq: "≠", ne: "≠", infty: "∞", in: "∈", to: "→", log: "log",
};

/** Under a field in the editor: how its math will look to students. Nothing when there's no math. */
export function MathPreview({ text }: { text: string }) {
  if (!hasMath(text)) return null;
  return (
    <div className="mt-1.5 rounded-lg bg-lane px-3 py-2 text-[13px] leading-relaxed text-ink-2" aria-label="How the math looks">
      <span className="mr-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Students see</span>
      <MathText text={text} className="whitespace-pre-wrap" />
    </div>
  );
}
