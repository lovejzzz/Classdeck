"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { op } from "@/lib/client";
import { FLOWS, stepOf, tilesFrom, type FlowPath, type FlowStep, type Tile } from "@/lib/speechflow";
import { analyzeScript } from "@/lib/speech";
import { toast } from "@/lib/toast";
import type { Module, Progress } from "@/lib/types";
import { Icon } from "../Icon";
import { ToolResultView } from "../ToolResultView";
import { Rehearsal } from "./CardExtras";

/**
 * The guided first speech: choose "Present an idea" or "Tell a story", answer one question at a
 * time while the speech assembles on the right, then arrange the parts as tiles, and practice.
 */
export function SpeechFlow({ courseId, studentId, module: m, progress, onChanged, onFinish, big }: {
  courseId: string; studentId: string; module: Module; progress?: Progress; onChanged: () => void; onFinish: (text: string) => void; big?: boolean;
}) {
  const saved = progress?.flow;
  const [path, setPath] = useState<FlowPath | undefined>(saved?.path);
  const [answers, setAnswers] = useState<Record<string, string>>(saved?.answers ?? {});
  const [step, setStep] = useState(saved?.step ?? 0);
  const [tiles, setTiles] = useState<Tile[] | undefined>(saved?.tiles);
  const [help, setHelp] = useState(false);
  const [phone, setPhone] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const flow = path ? FLOWS[path] : undefined;
  const steps = (flow?.steps ?? []) as readonly FlowStep[];
  const arranging = !!tiles;
  const cur = steps[step];

  useEffect(() => {
    box.current?.focus();
  }, [step, path]);

  function persist(next: { path?: FlowPath; answers?: Record<string, string>; step?: number; tiles?: Tile[] | undefined }) {
    op(courseId, { op: "saveFlow", studentId, moduleId: m.id, flow: { path: next.path ?? path, answers: next.answers ?? answers, step: next.step ?? step, tiles: "tiles" in next ? next.tiles : tiles } }).then(onChanged);
  }
  function go(to: number) {
    if (to >= steps.length) {
      const t = tilesFrom(path!, answers);
      setTiles(t);
      persist({ tiles: t, step: to });
      return;
    }
    setStep(to);
    setHelp(false);
    persist({ step: to });
  }

  // —— choose a path ——
  if (!flow) {
    return (
      <div className="rounded-2xl border border-line p-6">
        <p className={`leading-relaxed ${big ? "text-[17px]" : "text-[15px]"}`}>During your first CaPS Collab, everyone gives a <strong>1–2 minute micro-speech</strong> as a way of introducing themselves. Would you like to…</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(Object.keys(FLOWS) as FlowPath[]).map((k) => (
            <button key={k} onClick={() => { setPath(k); setStep(0); persist({ path: k, step: 0 }); }}
              className="press card card-hover flex flex-col items-start gap-2 p-5 text-left">
              <span className="flex items-center gap-2 text-[17px] font-semibold"><Icon name={k === "idea" ? "sparkles" : "read"} size={17} />{FLOWS[k].title}</span>
              <span className="text-[13px] leading-snug text-ink-2">{FLOWS[k].pitch}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const label = (kind: string) => stepOf(path!, kind);
  const speech = (tiles ?? tilesFrom(path!, answers)).map((t) => t.text.trim()).filter(Boolean).join("\n\n");
  let check;
  try {
    check = speech.split(/\s+/).length >= 8 ? analyzeScript(speech, 120) : null;
  } catch {
    check = null;
  }

  // —— arrange the tiles ——
  if (arranging) {
    const update = (next: Tile[]) => {
      setTiles(next);
      persist({ tiles: next });
    };
    const move = (i: number, d: number) => {
      const j = i + d;
      if (j < 0 || j >= tiles!.length) return;
      const next = [...tiles!];
      [next[i], next[j]] = [next[j], next[i]];
      update(next);
    };
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setTiles(undefined); setStep(steps.length - 1); persist({ tiles: undefined, step: steps.length - 1 }); }} className="btn btn-quiet press h-8"><Icon name="back" size={13} /> Back to the questions</button>
          <span className="flex-1" />
          <span className="text-[12.5px] text-ink-3">Drag or use the arrows to reorder. Edit any tile. Add tiles for connecting lines.</span>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_17rem]">
          <ol className="space-y-2">
            {tiles!.map((t, i) => {
              const s = label(t.kind);
              return (
                <li key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (Number.isNaN(from) || from === i) return;
                    const next = [...tiles!];
                    const [it] = next.splice(from, 1);
                    next.splice(i, 0, it);
                    update(next);
                  }}
                  className="pop rounded-xl p-3" style={{ background: s?.color ?? "#f3f3f1", "--i": i } as React.CSSProperties}>
                  <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em]" style={{ color: s?.ink ?? "var(--color-ink-2)" }}>
                    <span className="cursor-grab" aria-hidden="true"><Icon name="grip" size={13} /></span>
                    {s?.label ?? "Your words"}
                    <span className="flex-1" />
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-0.5 hover:bg-black/5 disabled:opacity-25"><Icon name="chevron" size={13} className="rotate-180" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === tiles!.length - 1} aria-label="Move down" className="rounded p-0.5 hover:bg-black/5 disabled:opacity-25"><Icon name="chevron" size={13} /></button>
                    {!s && <button onClick={() => update(tiles!.filter((x) => x.id !== t.id))} aria-label="Remove tile" className="rounded p-0.5 hover:bg-black/5"><Icon name="x" size={12} /></button>}
                  </div>
                  <textarea value={t.text} rows={Math.max(2, Math.ceil(t.text.length / 80))} aria-label={s?.label ?? "Your words"}
                    onChange={(e) => setTiles(tiles!.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)))}
                    onBlur={() => persist({ tiles })}
                    className={`w-full resize-y rounded-lg bg-white/70 px-2.5 py-2 leading-relaxed outline-none focus:bg-white ${big ? "text-[16px]" : "text-[14px]"}`} />
                </li>
              );
            })}
          </ol>
          <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <button onClick={() => update([...tiles!, { id: `t${Date.now().toString(36)}`, kind: "note", text: "" }])} className="btn btn-ghost press w-full justify-center"><Icon name="plus" size={13} /> Add a text tile</button>
            {check && <div className="rounded-xl border border-line p-3"><ToolResultView result={check} /></div>}
            <p className="text-[12px] leading-snug text-ink-3">This speech isn’t meant to be perfect. It’s something to practice with and get feedback on. You can keep improving it in later weeks.</p>
          </div>
        </div>

        <section className="rounded-xl border border-line p-4">
          <h3 className="mb-3 text-[14px] font-medium">Practice it</h3>
          <div className="mb-3 flex flex-wrap gap-2">
            <button onClick={() => setPhone(true)} className="btn btn-ghost press h-8"><Icon name="eye" size={13} /> Phone view</button>
            <button onClick={() => {
              const w = window.open("", "_blank");
              if (!w) return;
              w.document.title = m.title;
              const body = w.document.body;
              body.style.cssText = "font: 18px/1.6 Georgia, serif; max-width: 640px; margin: 40px auto; padding: 0 20px";
              speech.split("\n\n").forEach((para) => { const el = w.document.createElement("p"); el.textContent = para; body.appendChild(el); });
              w.print();
            }} className="btn btn-ghost press h-8"><Icon name="download" size={13} /> Print</button>
          </div>
          <Rehearsal target={m.timer ?? 90} takes={progress?.rehearsals ?? []} feel={progress?.feel} courseId={courseId} studentId={studentId} moduleId={m.id} onSaved={onChanged} big={big} />
        </section>

        <div className="flex items-center gap-3">
          <button onClick={() => onFinish(speech)} className="btn btn-dark press h-9 px-4"><Icon name="check" size={14} /> {progress?.status === "done" ? "Update" : "Done"}</button>
          <span className="text-[12.5px] text-ink-3">Bring it to Collab 1. Everything saves as you go.</span>
        </div>

        {phone && createPortal(
          <div className="fixed inset-0 z-[60] overflow-y-auto bg-ink px-6 py-10 text-white" role="dialog" aria-modal="true" aria-label="Phone view">
            <button onClick={() => setPhone(false)} className="btn press fixed right-4 top-4 h-9 bg-white/10 text-white hover:bg-white/20"><Icon name="x" size={14} /> Close</button>
            <div className="mx-auto max-w-md space-y-6 text-[24px] leading-[1.45]">
              {speech.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
            </div>
          </div>,
          document.body,
        )}
      </div>
    );
  }

  // —— one question at a time ——
  const filled = (cur && answers[cur.key]?.trim()) || "";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col rounded-2xl border border-line p-5">
        <div className="flex items-center gap-2 text-[12px] text-ink-3">
          <button onClick={() => { setPath(undefined); persist({ path: undefined as unknown as FlowPath }); }} className="hover:text-ink">{flow.title}</button>
          <span>·</span><span>Step {step + 1} of {steps.length}</span>
          <span className="flex-1" />
          <span className="flex gap-1">{steps.map((s, i) => <span key={s.key} className="h-1.5 w-4 rounded-full" style={{ background: i <= step ? s.ink : "var(--color-lane)" }} />)}</span>
        </div>
        <h3 className={`mt-3 font-semibold leading-snug ${big ? "text-[22px]" : "text-[19px]"}`}>{cur.question}</h3>
        {cur.hint && <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{cur.hint}</p>}
        {cur.example && (
          <p className="mt-3 rounded-lg bg-lane px-3 py-2 text-[13px] leading-relaxed text-ink-2"><span className="font-medium text-ink">Example: </span>“{cur.example}”</p>
        )}
        <textarea ref={box} value={answers[cur.key] ?? ""} rows={4} placeholder="Type your response here."
          onChange={(e) => setAnswers({ ...answers, [cur.key]: e.target.value })}
          onBlur={() => persist({})}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && filled) go(step + 1); }}
          className={`field mt-4 resize-y leading-relaxed ${big ? "text-[16px]" : ""}`} style={{ borderColor: cur.ink + "55", background: cur.color + "55" }} />
        <button onClick={() => setHelp((h) => !h)} aria-expanded={help} className="mt-2 w-fit text-[12.5px] text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink">Need help?</button>
        {help && (
          <div className="rise mt-2 rounded-lg border border-line p-3 text-[13px] leading-relaxed text-ink-2">
            <p>Just enough to finish this step. You’ll go deeper in the message-design module later.</p>
            {(m.playlist?.length || m.attachments?.some((a) => a.kind === "link")) ? (
              <ul className="mt-2 space-y-1">
                {[...(m.playlist ?? []).map((x) => ({ title: x.title, url: x.url })), ...(m.attachments ?? []).filter((a) => a.kind === "link").map((a) => ({ title: a.name ?? a.url, url: a.url }))].slice(0, 5).map((r) => (
                  <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink hover:underline">{r.title} <Icon name="external" size={11} /></a></li>
                ))}
              </ul>
            ) : <p className="mt-1">Keep it to one or two plain sentences. You can change everything at the end.</p>}
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 pt-5">
          <button onClick={() => (step === 0 ? (setPath(undefined), persist({ path: undefined as unknown as FlowPath })) : go(step - 1))} className="btn btn-quiet press h-9"><Icon name="back" size={13} /> Back</button>
          <span className="flex-1" />
          <button onClick={() => go(step + 1)} disabled={!filled} className="btn btn-dark press h-9 px-4">{step === steps.length - 1 ? "Arrange my speech" : "Next"} <Icon name="arrow" size={13} /></button>
        </div>
      </div>

      <aside className="rounded-2xl border border-line bg-[#fafaf9] p-5" aria-label="Your speech so far">
        <p className="mb-3 text-[12px] leading-snug text-ink-3">Your speech assembles here. Go back and forth to change answers; you can edit the speech itself at the end.</p>
        <div className="space-y-2">
          {flow.order.map((k) => {
            const s = label(k)!;
            const v = answers[k]?.trim();
            return (
              <div key={k} className={`rounded-lg px-3 py-2 transition-all duration-300 ${cur.key === k ? "ring-2 ring-offset-1" : ""}`} style={{ background: s.color, ["--tw-ring-color" as string]: s.ink } as React.CSSProperties}>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: s.ink }}>{s.label}</div>
                <div className={`text-[13px] leading-snug ${v ? "text-ink" : "italic text-ink-3"}`}>{v || "Appears here"}</div>
              </div>
            );
          })}
          {steps.filter((s) => !(flow.order as readonly string[]).includes(s.key)).map((s) => (
            <div key={s.key} className="rounded-lg border border-dashed px-3 py-2" style={{ borderColor: s.ink + "66" }}>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: s.ink }}>{s.label} · for planning</div>
              <div className={`text-[13px] leading-snug ${answers[s.key]?.trim() ? "text-ink" : "italic text-ink-3"}`}>{answers[s.key]?.trim() || "Appears here"}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
