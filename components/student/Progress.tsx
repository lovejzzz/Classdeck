"use client";

import { useEffect, useState } from "react";
import { feedbackFor } from "@/lib/coach";
import { op } from "@/lib/client";
import { fmtSec } from "@/lib/grading";
import { fillerCount, wordCount } from "@/lib/speech";
import { toast } from "@/lib/toast";
import type { Attachment, CourseState } from "@/lib/types";
import { Icon } from "../Icon";

// The parts of a student's practice board that look across the whole course:
// how their delivery is changing, every piece of feedback they've had, and their reflections.

/** Length of each recording, read from the file when it wasn't saved at recording time. */
function useDurations(takes: Attachment[]) {
  const [found, setFound] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    for (const a of takes) {
      if (a.duration || found[a.id] !== undefined) continue;
      const el = document.createElement(a.kind === "video" ? "video" : "audio");
      el.preload = "metadata";
      el.src = a.url;
      el.onloadedmetadata = () => live && Number.isFinite(el.duration) && setFound((f) => ({ ...f, [a.id]: Math.round(el.duration) }));
    }
    return () => {
      live = false;
    };
  }, [takes, found]);
  return (a: Attachment) => a.duration ?? found[a.id];
}

/** Recordings over time: speaking pace and filler words per minute, plus timed rehearsals. */
export function PracticeLog({ state, studentId }: { state: CourseState; studentId: string }) {
  const { course } = state;
  const mine = state.progress[studentId] ?? {};
  const cards = course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.map((m) => ({ w, m }))));
  const takes = cards.flatMap(({ w, m }) => (mine[m.id]?.work ?? []).filter((a) => a.kind === "audio" || a.kind === "video").map((a) => ({ a, w, m })));
  const duration = useDurations(takes.map((t) => t.a));
  const rows = takes.map(({ a, w, m }) => {
    const sec = duration(a);
    const words = a.transcript ? wordCount(a.transcript) : 0;
    const fillers = a.transcript ? fillerCount(a.transcript).total : 0;
    return { a, w, m, sec, words, wpm: sec && words ? Math.round(words / (sec / 60)) : undefined, fpm: sec && a.transcript ? fillers / (sec / 60) : undefined };
  });
  const runs = cards.flatMap(({ m }) => (mine[m.id]?.rehearsals ?? []).map((s) => ({ s, target: m.timer })));
  const onTarget = runs.filter((r) => r.target && Math.abs(r.s - r.target) <= r.target * 0.1).length;
  const minutes = Math.round((rows.reduce((n, r) => n + (r.sec ?? 0), 0) + runs.reduce((n, r) => n + r.s, 0)) / 60);
  const paced = rows.filter((r) => r.wpm);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Recorded takes", `${rows.length}`], ["Timed runs", `${runs.length}`], ["Runs on target", runs.some((r) => r.target) ? `${onTarget}/${runs.filter((r) => r.target).length}` : "–"], ["Practice time", `${minutes} min`]].map(([k, v]) => (
          <div key={k} className="card px-4 py-3"><div className="text-[12px] text-ink-3">{k}</div><div className="mt-1 font-mono text-[22px]">{v}</div></div>
        ))}
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-[14px] font-medium">Speaking pace</h3>
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3"><span className="h-2.5 w-5 rounded-sm bg-ok/15" /> comfortable for listeners (130–160 words a minute)</span>
        </div>
        {paced.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-3">Record a take with live captions on (Chrome, Edge, or Safari) and its pace shows up here.</p>
        ) : (
          <PaceChart points={paced.map((r) => ({ label: `${r.w.title} · ${r.m.title}`, wpm: r.wpm!, fpm: r.fpm ?? 0 }))} />
        )}
      </div>

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[12px] text-ink-3">{["Take", "Length", "Words", "Pace", "Fillers / min"].map((h) => <th key={h} className="border-b border-line px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.a.id}>
                  <td className="border-b border-line/60 px-4 py-2"><span className="block font-medium">{r.a.name ?? "Recording"}</span><span className="text-[12px] text-ink-3">{r.w.title} · {r.m.title}</span></td>
                  <td className="border-b border-line/60 px-4 py-2 font-mono">{r.sec ? fmtSec(r.sec) : "…"}</td>
                  <td className="border-b border-line/60 px-4 py-2 font-mono">{r.words || "–"}</td>
                  <td className={`border-b border-line/60 px-4 py-2 font-mono ${r.wpm && (r.wpm < 120 || r.wpm > 170) ? "text-warn" : ""}`}>{r.wpm ? `${r.wpm} wpm` : "–"}</td>
                  <td className={`border-b border-line/60 px-4 py-2 font-mono ${r.fpm !== undefined && r.fpm > 3 ? "text-warn" : ""}`}>{r.fpm !== undefined ? r.fpm.toFixed(1) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2.5 text-[12px] text-ink-3">Pace and fillers come from the live transcript and the recording’s length. Takes recorded without captions show length only.</p>
        </div>
      )}
    </div>
  );
}

function PaceChart({ points }: { points: { label: string; wpm: number; fpm: number }[] }) {
  const W = 640;
  const H = 180;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const lo = 80;
  const hi = 220;
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Speaking pace by take: ${points.map((p) => `${p.wpm} words per minute`).join(", ")}`}>
      <rect x={pad.l} y={y(160)} width={W - pad.l - pad.r} height={y(130) - y(160)} fill="var(--color-ok)" opacity="0.1" rx="3" />
      {[100, 130, 160, 190].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeDasharray={v === 130 || v === 160 ? undefined : "2 4"} />
          <text x={pad.l - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--color-ink-3)">{v}</text>
        </g>
      ))}
      <polyline points={points.map((p, i) => `${x(i)},${y(p.wpm)}`).join(" ")} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.wpm)} r="4" fill="white" stroke="var(--color-ink)" strokeWidth="2"><title>{`${p.label}: ${p.wpm} wpm, ${p.fpm.toFixed(1)} fillers/min`}</title></circle>
          <text x={x(i)} y={H - 6} textAnchor={points.length > 1 && i === 0 ? "start" : points.length > 1 && i === points.length - 1 ? "end" : "middle"} fontSize="10" fill="var(--color-ink-3)">Take {i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

/** Every piece of feedback in one place, with "I tried this" so follow-through is visible. */
export function FeedbackInbox({ state, studentId, readOnly = false, onChanged }: { state: CourseState; studentId: string; readOnly?: boolean; onChanged?: () => void }) {
  const items = feedbackFor(state, studentId);
  const tried = state.uptake?.[studentId] ?? {};
  const [filter, setFilter] = useState<"all" | "teacher" | "peer" | "note" | "open">("all");
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const isTried = (k: string) => local[k] ?? !!tried[k];
  const shown = items.filter((f) => filter === "all" || (filter === "open" ? !isTried(f.key) : filter === "note" ? f.kind === "note" || f.kind === "comment" : f.kind === filter));
  const done = items.filter((f) => isTried(f.key)).length;

  async function toggle(key: string) {
    const on = !isTried(key);
    setLocal((l) => ({ ...l, [key]: on }));
    await op(state.course.id, { op: "uptake", studentId, key, on });
    onChanged?.();
    if (on) toast("Marked as tried", { icon: "check" });
  }

  if (!items.length) return <p className="hatch flex h-24 items-center justify-center text-[13px] text-ink-3">No feedback yet. It collects here from your teacher, your studio group, and notes on your recordings.</p>;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {([["all", "All"], ["open", "Not tried yet"], ["teacher", "Teacher"], ["peer", "Classmates"], ["note", "Notes & comments"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`press h-7 rounded-full border px-2.5 text-[12px] ${filter === k ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong"}`}>{label}</button>
        ))}
        <span className="flex-1" />
        <span className="text-[12px] text-ink-3">{done} of {items.length} tried</span>
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-lane"><span className="block h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${(done / items.length) * 100}%` }} /></span>
      </div>
      <ul className="space-y-2">
        {shown.map((f) => (
          <li key={f.key} className={`card flex gap-3 p-3.5 transition-opacity ${isTried(f.key) ? "opacity-60" : ""}`}>
            <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-lane text-ink-2"><Icon name={f.kind === "teacher" ? "user" : f.kind === "peer" ? "studio" : f.kind === "note" ? "audio" : "message"} size={13} /></span>
            <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
              <div className="text-[12px] text-ink-3"><span className="font-medium text-ink-2">{f.from}</span> · {f.where} · {new Date(f.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
              <p>{f.text}</p>
              {f.next && <p className="mt-0.5"><span className="font-medium">Try next:</span> {f.next}</p>}
            </div>
            {!readOnly ? (
              <button onClick={() => toggle(f.key)} aria-pressed={isTried(f.key)} className={`press h-7 flex-none self-start rounded-full border px-2.5 text-[12px] ${isTried(f.key) ? "border-ok/40 bg-ok/10 text-ok" : "border-line text-ink-2 hover:border-ink"}`}>
                {isTried(f.key) ? "✓ Tried it" : "I tried this"}
              </button>
            ) : isTried(f.key) && <span className="chip h-6 flex-none self-start bg-ok/10 text-[11.5px] text-ok">Tried</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** All reflections and self-check notes, in course order: a journal of how the student sees their own progress. */
export function Journal({ state, studentId }: { state: CourseState; studentId: string }) {
  const { course } = state;
  const mine = state.progress[studentId] ?? {};
  const entries = course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.filter((m) => (m.type === "reflect" || m.type === "selfcheck") && (mine[m.id]?.output || mine[m.id]?.responses?.some(Boolean) || mine[m.id]?.ratings)).map((m) => ({ w, m, p: mine[m.id] }))));
  if (!entries.length) return <p className="hatch flex h-24 items-center justify-center text-[13px] text-ink-3">Your reflections and self-checks collect here, week by week.</p>;
  const skills = course.skills ?? [];
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {entries.map(({ w, m, p }) => (
        <li key={m.id} className="relative">
          <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-ink" />
          <div className="text-[12px] text-ink-3">{w.title} · {new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
          <h4 className="text-[14px] font-medium">{m.title}</h4>
          {m.prompts?.length && p.responses?.some(Boolean) ? (
            <dl className="mt-1.5 space-y-1.5 text-[13.5px] leading-relaxed">
              {m.prompts.map((q, i) => p.responses?.[i] && <div key={i}><dt className="text-[12.5px] text-ink-3">{q}</dt><dd>{p.responses[i]}</dd></div>)}
            </dl>
          ) : p.output && <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#353532]">{p.output}</p>}
          {p.ratings && Object.keys(p.ratings).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">{skills.map((s) => p.ratings![s.id] && <span key={s.id} className="chip h-5 text-[11px]">{s.name} · {p.ratings![s.id]}</span>)}</div>
          )}
        </li>
      ))}
    </ol>
  );
}
