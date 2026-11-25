"use client";

import { Icon } from "./Icon";
import { wordDiff } from "@/lib/diff";
import type { Review } from "@/lib/types";

const day = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Unchanged writing between changes, cut down to a few words on each side of a change (the rest is “…”), so a small
 * change in a long piece is easy to find. Blank lines between paragraphs are kept to one line break.
 */
function around(t: string, before: boolean, after: boolean): string {
  const s = t.replace(/\n\s*\n+/g, "\n");
  const words = s.split(/(?<=\s)/);
  const keep = 8;
  if (words.length <= keep * 2 + 2) return s;
  const head = before ? words.slice(0, keep).join("") : "";
  const tail = after ? words.slice(-keep).join("") : "";
  return `${head}${head || tail ? " … " : "…"}${tail}`;
}

/** The work now, against the version the last feedback was about: words added and taken out. */
export function ChangedSince({ review, now }: { review: Review; now: string }) {
  if (review.on === undefined || review.on === now) return null;
  const parts = wordDiff(review.on, now);
  return (
    <div className="mt-3 rounded-lg border border-line px-3.5 py-3" aria-label="Changed since your feedback">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
        <Icon name="reset" size={12} /> Changed since your feedback on {day(review.at)}
      </div>
      {review.text && <p className="mt-1 text-[12.5px] text-ink-3">You said: “{review.text}”</p>}
      {parts ? (
        <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">
          {parts.map((p, i) => (p.k === "same" ? <span key={i}>{around(p.t, i > 0, i < parts.length - 1)}</span>
            : p.k === "add" ? <ins key={i} className="rounded-[3px] bg-ok/15 text-ink no-underline">{p.t}</ins>
            : <del key={i} className="rounded-[3px] bg-bad/10 text-ink-3">{p.t}</del>))}
        </p>
      ) : <p className="mt-2 text-[12.5px] text-ink-3">It’s too long to show word by word.</p>}
    </div>
  );
}

/** Feedback from earlier rounds, folded: what was asked, and when. */
export function EarlierFeedback({ earlier, teacher = false }: { earlier?: Review[]; teacher?: boolean }) {
  if (!earlier?.length) return null;
  return (
    <details className="mt-3 rounded-lg border border-line px-3.5 py-2 text-[13px]">
      <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2">Earlier feedback ({earlier.length})</summary>
      <ol className="mt-2 space-y-2.5">
        {earlier.map((r) => (
          <li key={r.at} className="border-l-2 pl-2.5" style={{ borderColor: r.verdict === "revise" ? "var(--color-warn)" : "var(--color-ok)" }}>
            <div className="text-[11.5px] text-ink-3">{r.verdict === "revise" ? (teacher ? "You asked for a revision" : "Asked for a revision") : "Looks good"} · {day(r.at)}</div>
            {r.text && <p className="whitespace-pre-wrap leading-snug">{r.text}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}
