"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { analyzeScript } from "@/lib/speech";
import { toast } from "@/lib/toast";
import type { Module, Progress, SpeechFields } from "@/lib/types";
import { Icon } from "../Icon";
import { ToolResultView } from "../ToolResultView";
import { Rehearsal } from "./CardExtras";

const EMPTY: SpeechFields = { audience: "", purpose: "", hook: "", core: "", points: [{ point: "", example: "" }, { point: "", example: "" }, { point: "", example: "" }], close: "" };
const SIGNPOSTS = ["First,", "Second,", "Third,", "Fourth,", "Finally,"];

/** The talk as one draft, in the student's own words, optionally with signposts between points. */
export function draftOf(f: SpeechFields, signposts: boolean) {
  const pts = f.points.filter((p) => p.point.trim() || p.example.trim());
  return [
    f.hook,
    f.core,
    ...pts.map((p, i) => [signposts ? `${i === pts.length - 1 && pts.length > 2 ? SIGNPOSTS[4] : SIGNPOSTS[i]} ${lower(p.point)}` : p.point, p.example].map(sentence).filter(Boolean).join(" ")),
    f.close,
  ].map((x) => x.trim()).filter(Boolean).join("\n\n");
}
const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
/** End a phrase with a full stop if it doesn't already end a sentence. */
const sentence = (s: string) => (s.trim() && !/[.!?…"”’)]$/.test(s.trim()) ? `${s.trim()}.` : s.trim());
/** A few key words from a sentence, for speaking notes. */
const keywords = (s: string, n = 7) => s.trim().split(/\s+/).slice(0, n).join(" ") + (s.trim().split(/\s+/).length > n ? " …" : "");

/**
 * Build a talk part by part: audience and purpose, a hook, the core message, points with
 * examples, and a close. See it as a full draft or as speaking notes, check timing,
 * save versions to compare, and rehearse against the clock.
 */
export function SpeechBuilder({ courseId, studentId, module: m, progress, onChanged, onFinish, big }: {
  courseId: string; studentId: string; module: Module; progress?: Progress; onChanged: () => void; onFinish: (text: string) => void; big?: boolean;
}) {
  const [f, setF] = useState<SpeechFields>(progress?.speech?.fields ?? EMPTY);
  const versions = progress?.speech?.versions ?? [];
  const [view, setView] = useState<"draft" | "notes">("draft");
  const [signposts, setSignposts] = useState(true);
  const [compare, setCompare] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const target = m.timer ?? 180;
  const draft = draftOf(f, signposts);
  let check;
  try {
    check = draft.split(/\s+/).length >= 5 ? analyzeScript(draft, target) : null;
  } catch {
    check = null;
  }

  async function persist(version = false) {
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "saveSpeech", studentId, moduleId: m.id, fields: f, version, label });
    if (r.ok === false) return toast(r.error ?? "Couldn’t save", { icon: "x", tone: "bad" });
    onChanged();
    if (version) {
      toast(`Saved version ${versions.length + 1}${label ? ` · ${label}` : ""}`, { icon: "layers" });
      setLabel("");
    }
  }
  const set = (patch: Partial<SpeechFields>) => setF((x) => ({ ...x, ...patch }));
  const setPoint = (i: number, patch: Partial<SpeechFields["points"][number]>) => setF((x) => ({ ...x, points: x.points.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));
  const field = (k: "audience" | "purpose" | "hook" | "core" | "close", label: string, hint: string, rows = 2) => (
    <label className="block">
      <span className={`font-medium ${big ? "text-[15px]" : "text-[13px]"}`}>{label}</span>
      <span className="block text-[12px] text-ink-3">{hint}</span>
      <textarea value={f[k]} rows={rows} onChange={(e) => set({ [k]: e.target.value })} onBlur={() => persist()} className={`field mt-1 resize-y leading-relaxed ${big ? "text-[16px]" : ""}`} />
    </label>
  );
  const older = compare !== null ? versions[compare]?.fields ?? null : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {field("audience", "Audience", "Who will be listening?", 1)}
            {field("purpose", "Purpose", "What should they do or think afterwards?", 1)}
          </div>
          {field("hook", "Hook", "Your first sentence: a question, a picture, a surprising fact.")}
          {field("core", "Core message", "Your main point in one sentence someone could repeat.")}
          <div className="space-y-3">
            {f.points.map((p, i) => (
              <div key={i} className="rounded-xl border border-line p-3">
                <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium">
                  <span className="mono">{String(i + 1).padStart(2, "0")}</span> Point {i + 1}
                  <span className="flex-1" />
                  {f.points.length > 2 && <button onClick={() => { setF((x) => ({ ...x, points: x.points.filter((_, k) => k !== i) })); }} aria-label={`Remove point ${i + 1}`} className="text-ink-3 hover:text-bad"><Icon name="x" size={13} /></button>}
                </div>
                <input value={p.point} onChange={(e) => setPoint(i, { point: e.target.value })} onBlur={() => persist()} placeholder="The point" aria-label={`Point ${i + 1}`} className="field" />
                <textarea value={p.example} onChange={(e) => setPoint(i, { example: e.target.value })} onBlur={() => persist()} rows={2} placeholder="An example, story, or number that supports it" aria-label={`Example for point ${i + 1}`} className="field mt-1.5 resize-y" />
              </div>
            ))}
            {f.points.length < 5 && <button onClick={() => setF((x) => ({ ...x, points: [...x.points, { point: "", example: "" }] }))} className="btn btn-quiet press h-8"><Icon name="plus" size={13} /> Add a point</button>}
          </div>
          {field("close", "Close and call to action", "Repeat the core message and ask for one action.")}
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-lane p-0.5">
              {(["draft", "notes"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`press h-7 rounded-md px-2.5 text-[12.5px] ${view === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2"}`}>{v === "draft" ? "Full draft" : "Speaking notes"}</button>
              ))}
            </div>
            <span className="flex-1" />
            {view === "draft" && <label className="flex items-center gap-1.5 text-[12px] text-ink-2"><input type="checkbox" checked={signposts} onChange={(e) => setSignposts(e.target.checked)} className="accent-[#1b1b1a]" />Signposts</label>}
          </div>
          <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-line bg-[#fafaf9] p-4">
            {!draft ? <p className="text-[13px] text-ink-3">Your talk appears here as you fill in the parts.</p> : view === "draft" ? (
              <div className={`whitespace-pre-wrap leading-[1.7] ${big ? "text-[16px]" : "text-[14px]"}`}>{draft}</div>
            ) : (
              <ol className="space-y-2 text-[14px]">
                {f.hook && <li><span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Hook</span><br />{keywords(f.hook)}</li>}
                {f.core && <li><span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Core</span><br /><strong>{f.core}</strong></li>}
                {f.points.filter((p) => p.point).map((p, i) => <li key={i}><span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{i + 1}</span><br />{keywords(p.point)}{p.example && <span className="block text-ink-2">e.g. {keywords(p.example, 6)}</span>}</li>)}
                {f.close && <li><span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Close</span><br />{keywords(f.close)}</li>}
              </ol>
            )}
          </div>
          {check && <div className="rounded-xl border border-line p-3"><ToolResultView result={check} /></div>}
        </div>
      </div>

      <section className="rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-[14px] font-medium">Versions <span className="mono ml-1">{versions.length}</span></h3>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional), e.g. after feedback" aria-label="Version label" className="field h-8 w-56 py-0 text-[12.5px]" />
          <button onClick={() => persist(true)} disabled={!draft} className="btn btn-dark press h-8"><Icon name="layers" size={13} /> Save version</button>
        </div>
        {versions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {versions.map((v, i) => (
              <button key={v.at} onClick={() => setCompare(compare === i ? null : i)} aria-pressed={compare === i}
                className={`press h-7 rounded-full border px-2.5 text-[12px] ${compare === i ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong"}`}>
                v{i + 1}{v.label ? ` · ${v.label}` : ""} · {new Date(v.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </button>
            ))}
          </div>
        )}
        {older && (
          <div className="rise mt-4">
            <div className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-2">
              Comparing v{compare! + 1} with your current draft. Changed parts are highlighted.
              <span className="flex-1" />
              <button onClick={() => { setF(older); setCompare(null); toast(`Restored v${compare! + 1} as your draft`, { icon: "reset" }); }} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="reset" size={12} /> Restore v{compare! + 1}</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[["v" + (compare! + 1), older], ["Now", f]].map(([title, ff]) => (
                <div key={title as string} className="rounded-lg bg-[#fafaf9] p-3 text-[13px] leading-relaxed">
                  <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3">{title as string}</div>
                  {(["hook", "core", "close"] as const).map((k) => {
                    const val = (ff as SpeechFields)[k];
                    const changed = older[k] !== f[k];
                    return val ? <p key={k} className={`mb-1.5 rounded px-1 ${changed ? "bg-[#fbe9a6]/60" : ""}`}><span className="text-ink-3">{k === "core" ? "Core" : k[0].toUpperCase() + k.slice(1)}:</span> {val}</p> : null;
                  })}
                  {(ff as SpeechFields).points.map((p, i) => (p.point || p.example) && (
                    <p key={i} className={`mb-1.5 rounded px-1 ${JSON.stringify(older.points[i]) !== JSON.stringify(f.points[i]) ? "bg-[#fbe9a6]/60" : ""}`}><span className="text-ink-3">{i + 1}.</span> {p.point}{p.example && <span className="text-ink-2"> · {p.example}</span>}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {draft && <Rehearsal target={target} takes={progress?.rehearsals ?? []} courseId={courseId} studentId={studentId} moduleId={m.id} onSaved={onChanged} big={big} />}

      <div className="flex items-center gap-3">
        <button onClick={() => { if (!versions.length) return toast("Save a version first, so your teacher can see what you built", { icon: "layers", tone: "plain" }); onFinish(draft); }} className="btn btn-dark press h-9 px-4">
          <Icon name="check" size={14} /> {progress?.status === "done" ? "Update" : "Done"}
        </button>
        <span className="text-[12.5px] text-ink-3">Your draft saves as you type. Save a version whenever you change your plan.</span>
      </div>
    </div>
  );
}
