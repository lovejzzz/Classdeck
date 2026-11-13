"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { Attachment, Mark } from "@/lib/types";
import { analyzeScript } from "@/lib/speech";
import type { ToolResult } from "@/lib/connectors/types";
import { AudioPlayer, MediaView } from "./cards/Media";
import { ToolResultView } from "./ToolResultView";
import { Avatar, Icon } from "./Icon";

/** Who is looking, and the notes they can see. Provided once per page. */
export const MarksContext = createContext<{
  courseId: string;
  /** A student id, or "teacher". */
  me: string;
  marks: Mark[];
  names: Record<string, string>;
  refresh: () => void;
} | null>(null);

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const colorOf = (from: string, me: string) => (from === "teacher" ? "#1b1b1a" : from === me ? "#247b46" : "#ae502f");

/**
 * A recording with timestamped notes. Play, pause where something happens, write a note:
 * it's pinned to that second. Clicking a note jumps the recording there.
 */
export function MarkedMedia({ a }: { a: Attachment }) {
  const ctx = useContext(MarksContext);
  const media = useRef<HTMLMediaElement | null>(null);
  const setMedia = useCallback((el: HTMLMediaElement | null) => {
    media.current = el;
  }, []);
  const [at, setAt] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [dur, setDur] = useState(0);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<Mark[]>([]);
  const isAV = a.kind === "audio" || a.kind === "video";

  useEffect(() => {
    const el = media.current;
    if (!el) return;
    const on = () => setDur(el.duration || 0);
    el.addEventListener("loadedmetadata", on);
    if (el.readyState >= 1) on();
    return () => el.removeEventListener("loadedmetadata", on);
  });

  if (!ctx || !isAV) return <MediaView a={a} />;
  const marks = [...ctx.marks.filter((m) => m.attachmentId === a.id), ...local.filter((l) => !ctx.marks.some((m) => m.id === l.id))].sort((x, y) => x.sec - y.sec);
  const name = (from: string) => (from === "teacher" ? "Teacher" : from === ctx.me ? "You" : ctx.names[from] ?? "Classmate");
  const pins = marks.map((m) => ({ sec: m.sec, color: colorOf(m.from, ctx.me), label: `${fmt(m.sec)} ${name(m.from)}: ${m.text}` }));

  function seek(sec: number) {
    const el = media.current;
    if (!el) return;
    el.currentTime = sec;
    el.play().catch(() => {});
  }
  function begin() {
    const el = media.current;
    el?.pause();
    setAt(el?.currentTime ?? 0);
  }
  async function add() {
    if (at === null || !text.trim()) return;
    setBusy(true);
    const r = await op<{ ok: boolean; error?: string; mark?: Mark }>(ctx!.courseId, { op: "addMark", ...(ctx!.me === "teacher" ? {} : { studentId: ctx!.me }), attachmentId: a.id, sec: at, text });
    setBusy(false);
    if (!r.ok || !r.mark) return toast(r.error ?? "Couldn’t save the note", { icon: "message", tone: "plain" });
    setLocal((l) => [...l, r.mark!]);
    setText("");
    setAt(null);
    ctx!.refresh();
  }
  async function remove(m: Mark) {
    await op(ctx!.courseId, { op: "removeMark", id: m.id, ...(ctx!.me === "teacher" ? {} : { studentId: ctx!.me }) });
    setLocal((l) => l.filter((x) => x.id !== m.id));
    ctx!.refresh();
  }

  return (
    <div className="space-y-2">
      {a.kind === "audio" ? (
        <AudioPlayer a={a} onMedia={setMedia} pins={pins} />
      ) : (
        <div>
          <video ref={(el) => { media.current = el; }} src={a.url} controls playsInline preload="metadata" className="w-full rounded-xl border border-line bg-black" />
          {dur > 0 && pins.length > 0 && (
            <div className="relative mx-1 mt-1.5 h-2.5 rounded-full bg-lane" aria-hidden="true">
              {pins.map((p, i) => <span key={i} title={p.label} className="pop absolute top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full" style={{ left: `${(p.sec / dur) * 100}%`, background: p.color }} />)}
            </div>
          )}
        </div>
      )}

      {a.transcript && <Transcript text={a.transcript} />}

      {marks.length > 0 && (
        <ul className="space-y-1" aria-label="Timestamped notes">
          {marks.map((m) => (
            <li key={m.id} className="rise group flex items-start gap-2 text-[13px]">
              <button onClick={() => seek(m.sec)} title="Play from here" className="press mt-[1px] flex-none rounded-md bg-lane px-1.5 py-[1px] font-mono text-[11.5px] text-ink-2 hover:bg-ink hover:text-white">{fmt(m.sec)}</button>
              <span className="min-w-0 flex-1 leading-snug">
                <span className="font-medium" style={{ color: colorOf(m.from, ctx.me) }}>{name(m.from)}</span> <span className="text-ink-2">{m.text}</span>
              </span>
              {(m.from === ctx.me || ctx.me === "teacher") && (
                <button onClick={() => remove(m)} aria-label="Delete note" className="flex-none text-ink-3 opacity-0 transition-opacity hover:text-bad focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"><Icon name="x" size={13} /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      {at === null ? (
        <button onClick={begin} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="message" size={12} /> Note at this moment</button>
      ) : (
        <form className="rise flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          {ctx.me !== "teacher" && <Avatar name={name(ctx.me)} size={20} />}
          <span className="flex-none rounded-md bg-ink px-1.5 py-[1px] font-mono text-[11.5px] text-white">{fmt(at)}</span>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAt(null)}
            placeholder="What happens here?" aria-label={`Note at ${fmt(at)}`} className="field h-8 min-w-0 flex-1 py-0" />
          <button disabled={busy || !text.trim()} className="btn btn-dark press h-8">Add</button>
          <button type="button" onClick={() => setAt(null)} className="btn btn-quiet press h-8 w-8 justify-center px-0" aria-label="Cancel"><Icon name="x" size={13} /></button>
        </form>
      )}
    </div>
  );
}

/** What was said, with a one-click check for timing, fillers, and long sentences. */
export function Transcript({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<ToolResult | string | null>(null);
  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="flex items-center gap-1 px-2 py-1">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="press flex flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-[12.5px] text-ink-2 hover:text-ink">
          <Icon name="text" size={13} /> Transcript <span className="mono text-[11px]">{text.split(/\s+/).length} words</span>
          <Icon name="chevron" size={12} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </button>
        <button onClick={() => { try { setCheck(analyzeScript(text, 0)); } catch (e) { setCheck(e instanceof Error ? e.message : "Couldn’t check this"); } setOpen(true); }}
          className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="mic" size={12} /> Check delivery</button>
      </div>
      <div className={`fold ${open ? "fold-open" : ""}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 border-t border-line px-3 py-2.5">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{text}</p>
            {check && (typeof check === "string" ? <p className="text-[12.5px] text-ink-3">{check}</p> : <div className="rise"><ToolResultView result={check} /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
