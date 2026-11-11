"use client";

import { useEffect, useRef, useState } from "react";
import { op } from "@/lib/client";
import { fmtSec } from "@/lib/grading";
import { FEEL } from "@/lib/onboarding";
import { toast } from "@/lib/toast";
import type { Level, Review, Skill } from "@/lib/types";
import { Icon } from "../Icon";

/** The teacher's note on this work, pinned to the top of the card. */
export function ReviewNote({ review, big, skills = [], levels = [] }: { review: Review; big?: boolean; skills?: Skill[]; levels?: Level[] }) {
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
      {review.levels && Object.keys(review.levels).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(review.levels).map(([id, n]) => (
            <span key={id} className="chip bg-white" title={levels.find((l) => l.n === n)?.description}>
              {skills.find((s) => s.id === id)?.name ?? id} · <span className="font-medium">{levels.find((l) => l.n === n)?.name ?? n}</span><span className="font-mono text-ink-3">{n}/4</span>
            </span>
          ))}
        </div>
      )}
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
export function Rehearsal({ target, takes, feel = [], courseId, studentId, moduleId, onSaved, big }: {
  target: number; takes: number[]; feel?: number[]; courseId: string; studentId: string; moduleId: string; onSaved: () => void; big?: boolean;
}) {
  const [running, setRunning] = useState(false);
  // After a run: how did it feel? Kept with the run so the student can see confidence change with practice.
  const [asking, setAsking] = useState(false);
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
    setAsking(true);
    onSaved();
  }

  async function rate(v: number) {
    setAsking(false);
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "feel", studentId, moduleId, v });
    if (r.ok) onSaved();
  }
  const offset = Math.max(0, takes.length - 8);
  const felt = feel.filter(Boolean);

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
                <span key={i} className={`pop rounded-full px-2 py-[1px] font-mono text-[11px] ${ok ? "bg-ok/10 text-ok" : "bg-lane text-ink-2"}`} style={{ "--i": i } as React.CSSProperties}
                  title={[ok ? "Within 10% of the target" : "", feel[offset + i] ? `Felt: ${FEEL[feel[offset + i] - 1]}` : ""].filter(Boolean).join(" · ") || undefined}>
                  {fmtSec(s)}
                </span>
              );
            })
          )}
        </div>
        {asking ? (
          <div className="pop mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="How did that run feel?">
            <span className="mr-1 text-[12px] text-ink-2">How did that run feel?</span>
            {FEEL.map((f, i) => <button key={f} onClick={() => rate(i + 1)} className="press chip h-6 hover:bg-ink hover:text-white">{f}</button>)}
            <button onClick={() => setAsking(false)} className="btn btn-quiet press h-6 px-1.5 text-[11.5px]">Skip</button>
          </div>
        ) : felt.length > 1 && (
          <p className="mt-1.5 text-[11.5px] text-ink-3">Feeling: {FEEL[felt[0] - 1].toLowerCase()} at first, {FEEL[felt[felt.length - 1] - 1].toLowerCase()} lately.</p>
        )}
      </div>
    </section>
  );
}

type Highlight = { start: number; end: number; note?: string };

/**
 * Card text you can highlight: select a passage, press "Highlight", optionally add a note.
 * Highlights are stored as character offsets into the text, so they survive re-renders.
 */
export function HighlightableText({ text, highlights, onChange, className }: { text: string; highlights: Highlight[]; onChange: (h: Highlight[]) => void; className: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{ start: number; end: number; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const sorted = [...highlights].sort((a, b) => a.start - b.start);

  function onSelect() {
    const sel = window.getSelection();
    const el = box.current;
    if (!sel || sel.isCollapsed || !el || !sel.rangeCount) return setPending(null);
    const r = sel.getRangeAt(0);
    if (!el.contains(r.commonAncestorContainer)) return setPending(null);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length;
    const end = start + r.toString().length;
    if (end - start < 2) return setPending(null);
    const rect = r.getBoundingClientRect();
    const host = el.getBoundingClientRect();
    setPending({ start, end, x: rect.left - host.left + rect.width / 2, y: rect.top - host.top });
  }

  function add() {
    if (!pending) return;
    // Merge with anything it overlaps.
    let { start, end } = pending;
    const keep = sorted.filter((h) => {
      if (h.end < start || h.start > end) return true;
      start = Math.min(start, h.start);
      end = Math.max(end, h.end);
      return false;
    });
    onChange([...keep, { start, end }]);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }

  // Split the text into plain and highlighted runs.
  const parts: { t: string; i?: number }[] = [];
  let at = 0;
  sorted.forEach((h, i) => {
    if (h.start > at) parts.push({ t: text.slice(at, h.start) });
    parts.push({ t: text.slice(Math.max(h.start, at), h.end), i });
    at = Math.max(at, h.end);
  });
  if (at < text.length) parts.push({ t: text.slice(at) });

  return (
    <div>
      <div className="relative">
        <div ref={box} onMouseUp={onSelect} onKeyUp={onSelect} className={className}>
          {parts.map((p, k) => (p.i === undefined ? p.t : (
            <mark key={k} onClick={() => setEditing(p.i!)} className={`cursor-pointer rounded-[3px] px-[1px] text-inherit transition-colors ${editing === p.i ? "bg-[#f5d77a]" : "bg-[#fbe9a6] hover:bg-[#f5d77a]"}`}>{p.t}</mark>
          )))}
        </div>
        {pending && (
          <button onMouseDown={(e) => e.preventDefault()} onClick={add}
            className="pop absolute z-10 flex h-8 -translate-x-1/2 -translate-y-[calc(100%+6px)] items-center gap-1.5 rounded-full bg-ink px-3 text-[12.5px] text-white shadow-lg"
            style={{ left: pending.x, top: pending.y }}>
            <span className="h-2.5 w-2.5 rounded-sm bg-[#fbe9a6]" /> Highlight
          </button>
        )}
      </div>
      {sorted.length > 0 && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <div className="eyebrow mb-2">Your highlights</div>
          <ul className="space-y-2">
            {sorted.map((h, i) => (
              <li key={`${h.start}-${h.end}`} className="rise text-[13px]">
                <div className="flex items-start gap-2">
                  <span className="mt-[3px] h-3 w-1 flex-none rounded-full bg-[#f0cf62]" />
                  <button onClick={() => setEditing(editing === i ? null : i)} className="min-w-0 flex-1 text-left leading-snug text-ink-2 hover:text-ink">“{text.slice(h.start, h.end).trim().slice(0, 140)}{h.end - h.start > 140 ? "…" : ""}”</button>
                  <button onClick={() => { onChange(sorted.filter((_, k) => k !== i)); setEditing(null); }} aria-label="Remove highlight" className="flex-none text-ink-3 hover:text-bad"><Icon name="x" size={13} /></button>
                </div>
                {(editing === i || h.note) && (
                  <input defaultValue={h.note ?? ""} autoFocus={editing === i} placeholder="Add a note to this highlight"
                    onBlur={(e) => { if ((e.target.value || undefined) !== h.note) onChange(sorted.map((x, k) => (k === i ? { ...x, note: e.target.value || undefined } : x))); }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="field ml-3 mt-1 h-8 w-[calc(100%-0.75rem)] py-0 text-[12.5px]" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type PlayItem = { id: string; title: string; url: string; section?: string; optional?: boolean };

/**
 * A teacher's "patchwork" of videos: the chosen clips in order, grouped into sections, and
 * the rest of each course available as optional extras. Opening a video marks it watched.
 */
export function Playlist({ items, watched, onChange, big }: { items: PlayItem[]; watched: string[]; onChange: (ids: string[]) => void; big?: boolean }) {
  const [showMore, setShowMore] = useState(false);
  const req = items.filter((x) => !x.optional);
  const extra = items.filter((x) => x.optional);
  const done = req.filter((x) => watched.includes(x.id)).length;
  const toggle = (id: string, on = !watched.includes(id)) => onChange(on ? [...new Set([...watched, id])] : watched.filter((x) => x !== id));
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const list = (xs: PlayItem[], numbered: boolean) => {
    let section: string | undefined;
    return xs.map((x, i) => {
      const head = x.section && x.section !== section ? (section = x.section) : null;
      const on = watched.includes(x.id);
      return (
        <li key={x.id}>
          {head && <div className="mb-1 mt-3 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3 first:mt-0">{head}</div>}
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-lane">
            <button onClick={() => toggle(x.id)} aria-pressed={on} aria-label={on ? `Mark “${x.title}” as not watched` : `Mark “${x.title}” as watched`}
              className={`flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors ${on ? "border-ok bg-ok text-white" : "border-line-strong bg-white"}`}>
              {on && <Icon name="check" size={11} strokeWidth={3} />}
            </button>
            {numbered && <span className="mono w-5">{String(i + 1).padStart(2, "0")}</span>}
            <a href={x.url} target="_blank" rel="noreferrer" onClick={() => toggle(x.id, true)}
              className={`min-w-0 flex-1 truncate hover:underline ${big ? "text-[16px]" : "text-[14px]"} ${on ? "text-ink-3" : ""}`}>{x.title}</a>
            <span className="mono hidden flex-none sm:inline">{host(x.url)}</span>
            <Icon name="external" size={12} className="flex-none text-ink-3" />
          </div>
        </li>
      );
    });
  };
  return (
    <section id="playlist" aria-label="Videos" className="rounded-xl border border-line p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="video" size={14} className="text-ink-2" />
        <span className="eyebrow flex-1">Watch in this order</span>
        <span className="mono text-[11.5px]">{done}/{req.length}</span>
        <span className="h-1 w-16 overflow-hidden rounded-full bg-lane"><span className="block h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${req.length ? (done / req.length) * 100 : 0}%` }} /></span>
      </div>
      <ul>{list(req, true)}</ul>
      {extra.length > 0 && (
        <div className="mt-3 border-t border-line pt-2.5">
          <button onClick={() => setShowMore((s) => !s)} aria-expanded={showMore} className="press flex items-center gap-1.5 text-[12.5px] text-ink-2 hover:text-ink">
            <Icon name="chevron" size={12} className={`transition-transform ${showMore ? "rotate-180" : ""}`} />
            More from these courses ({extra.length}, optional)
          </button>
          {showMore && <ul className="rise mt-1.5">{list(extra, false)}</ul>}
        </div>
      )}
    </section>
  );
}
