"use client";

import { useEffect, useRef, useState } from "react";
import { op } from "@/lib/client";
import { fmtSec } from "@/lib/grading";
import { toast } from "@/lib/toast";
import type { Review } from "@/lib/types";
import { Icon } from "../Icon";

/** The teacher's note on this work, pinned to the top of the card. */
export function ReviewNote({ review, big }: { review: Review; big?: boolean }) {
  const revise = review.verdict === "revise";
  return (
    <div className={`pop mt-5 rounded-xl border px-4 py-3 ${revise ? "border-warn/40 bg-warn/[0.06]" : "border-ok/35 bg-ok/[0.05]"}`} role="note">
      <div className={`flex items-center gap-2 text-[12.5px] font-medium ${revise ? "text-warn" : "text-ok"}`}>
        <Icon name={revise ? "reset" : "check"} size={14} strokeWidth={2} />
        {revise ? "Your teacher asked for a revision" : "Your teacher says: looks good"}
        <span className="flex-1" />
        <span className="font-normal text-ink-3">{new Date(review.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
      </div>
      {review.text && <p className={`mt-1.5 whitespace-pre-wrap leading-relaxed text-ink ${big ? "text-[16px]" : "text-[14px]"}`}>{review.text}</p>}
    </div>
  );
}

/** Steps to tick off. Every step must be ticked before the card can be finished. */
export function Checklist({ items, checks, onToggle, big }: { items: string[]; checks: number[]; onToggle: (i: number) => void; big?: boolean }) {
  const done = checks.length;
  return (
    <section id="checklist" aria-label="Checklist" className="rounded-xl border border-line p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="eyebrow flex-1">Steps</span>
        <span className="mono text-[11.5px]">{done}/{items.length}</span>
        <span className="h-1 w-16 overflow-hidden rounded-full bg-lane">
          <span className="block h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${(done / items.length) * 100}%` }} />
        </span>
      </div>
      <ul className="space-y-0.5">
        {items.map((t, i) => {
          const on = checks.includes(i);
          return (
            <li key={i}>
              <button onClick={() => onToggle(i)} aria-pressed={on}
                className={`press flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-lane ${big ? "text-[16px]" : "text-[14px]"}`}>
                <span className={`mt-[3px] flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors duration-200 ${on ? "border-ok bg-ok text-white" : "border-line-strong bg-white"}`}>
                  {on && <span className="pop"><Icon name="check" size={11} strokeWidth={3} /></span>}
                </span>
                <span className={`transition-colors duration-200 ${on ? "text-ink-3 line-through decoration-ink-3/50" : ""}`}>{t}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One answer box per guided prompt. */
export function Prompts({ prompts, responses, onChange, onBlur, big, highlight }: {
  prompts: string[]; responses: string[]; onChange: (i: number, v: string) => void; onBlur: () => void; big?: boolean; highlight?: boolean;
}) {
  return (
    <div id="output" tabIndex={-1} className="space-y-4 outline-none">
      {prompts.map((q, i) => (
        <div key={i}>
          <label htmlFor={`prompt-${i}`} className={`mb-1.5 flex gap-2 font-medium ${big ? "text-[16px]" : "text-[14px]"}`}>
            <span className="mono mt-[2px]">{String(i + 1).padStart(2, "0")}</span>{q}
          </label>
          <textarea id={`prompt-${i}`} value={responses[i] ?? ""} onChange={(e) => onChange(i, e.target.value)} onBlur={onBlur} rows={big ? 3 : 3}
            placeholder="Write here. It saves as you go."
            className={`field resize-y leading-relaxed ${highlight && !(responses[i] ?? "").trim() ? "border-warn/60" : ""} ${big ? "text-[16px]" : ""}`} />
        </div>
      ))}
    </div>
  );
}

/** Combine prompt answers into one readable text, for the teacher and exports. */
export const promptsToText = (prompts: string[], responses: string[]) =>
  prompts.map((q, i) => ((responses[i] ?? "").trim() ? `${q}\n${responses[i].trim()}` : "")).filter(Boolean).join("\n\n");

/**
 * A rehearsal timer: start, speak, stop. The ring fills toward the target time and
 * turns amber once you run over. Each run is kept so you can see yourself getting closer.
 */
export function Rehearsal({ target, takes, courseId, studentId, moduleId, onSaved, big }: {
  target: number; takes: number[]; courseId: string; studentId: string; moduleId: string; onSaved: () => void; big?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  // Runs saved here but not yet back from the server, keyed by the position they'll take.
  const [local, setLocal] = useState<{ at: number; sec: number }[]>([]);
  const all = [...takes, ...local.filter((x) => x.at >= takes.length).map((x) => x.sec)].slice(-8);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      setElapsed((performance.now() - started.current) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  async function toggle() {
    if (!running) {
      started.current = performance.now();
      setElapsed(0);
      setRunning(true);
      return;
    }
    setRunning(false);
    const sec = Math.round((performance.now() - started.current) / 1000);
    if (sec < 3) return toast("That was under 3 seconds, so it wasn’t saved", { icon: "timer", tone: "plain" });
    setLocal((l) => [...l.filter((x) => x.at >= takes.length), { at: takes.length + l.filter((x) => x.at >= takes.length).length, sec }]);
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "rehearse", studentId, moduleId, seconds: sec });
    if (!r.ok) return toast(r.error ?? "Couldn’t save that run", { icon: "timer", tone: "plain" });
    const off = sec - target;
    toast(Math.abs(off) <= target * 0.1 ? `${fmtSec(sec)}: right on time` : off > 0 ? `${fmtSec(sec)}: ${fmtSec(off)} over` : `${fmtSec(sec)}: ${fmtSec(-off)} under`, { icon: "timer" });
    onSaved();
  }

  const frac = Math.min(1, elapsed / target);
  const over = elapsed > target;
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <section aria-label="Rehearsal timer" className="flex flex-wrap items-center gap-5 rounded-xl border border-line p-4">
      <button onClick={toggle} aria-label={running ? "Stop the timer" : "Start a timed run"}
        className="press relative flex h-[84px] w-[84px] flex-none items-center justify-center rounded-full">
        <svg width="84" height="84" viewBox="0 0 84 84" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="42" cy="42" r={R} fill="none" stroke="var(--color-lane)" strokeWidth="5" />
          <circle cx="42" cy="42" r={R} fill="none" stroke={over ? "var(--color-warn)" : "var(--color-ok)"} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: running ? "none" : "stroke-dashoffset 0.5s var(--ease-out)" }} />
        </svg>
        <span className={`flex h-12 w-12 items-center justify-center rounded-full ${running ? "bg-ink text-white" : "bg-lane text-ink"}`}>
          <Icon name={running ? "stop" : "play"} size={17} />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Timed run · target {fmtSec(target)}</div>
        <div className={`font-mono tabular-nums ${big ? "text-[34px]" : "text-[28px]"} leading-tight ${over ? "text-warn" : ""}`}>{fmtSec(Math.floor(elapsed))}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {all.length === 0 ? (
            <span className="text-[12.5px] text-ink-3">Press play, speak, press stop. Each run is saved.</span>
          ) : (
            all.map((s, i) => {
              const ok = Math.abs(s - target) <= target * 0.1;
              return (
                <span key={i} className={`pop rounded-full px-2 py-[1px] font-mono text-[11px] ${ok ? "bg-ok/10 text-ok" : "bg-lane text-ink-2"}`} style={{ "--i": i } as React.CSSProperties} title={ok ? "Within 10% of the target" : undefined}>
                  {fmtSec(s)}
                </span>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
