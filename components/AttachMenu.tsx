"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { Attachment } from "@/lib/types";
import { Icon } from "./Icon";
import { MediaCapture } from "./MediaCapture";
import { PhotoCapture } from "./PhotoCapture";
import { SketchPad } from "./SketchPad";

type Mode = "audio" | "video" | "screen" | "photo" | "draw" | "link";

/**
 * Every way to add something: record audio, video, or your screen; take a photo; draw; upload a file; or paste a link.
 * Students see recording first (that's what they hand in). Teachers building a card see Link, Upload, Draw, and
 * Record, which opens a choice of audio, video, the screen or a photo.
 */
export function AttachMenu({ onAdd, label, accept = "audio/*,video/*,image/*,.pdf,.doc,.docx,.ppt,.pptx,.key,.txt,.csv", compact = false, teacher = false }: {
  onAdd: (a: Omit<Attachment, "id">) => Promise<void> | void;
  label?: string;
  accept?: string;
  compact?: boolean;
  teacher?: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [link, setLink] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!more) return;
    const off = (e: PointerEvent) => !menu.current?.contains(e.target as Node) && setMore(false);
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [more]);

  async function upload(f: File, name?: string, transcript?: string, duration?: number) {
    setBusy(true);
    setProgress(0);
    const r = await uploadFile(f, setProgress);
    setBusy(false);
    if (!r.ok) return toast(r.error, { icon: "x", tone: "bad" });
    await onAdd({ kind: r.kind, url: r.url, name: name ?? r.name, size: r.size, transcript, duration });
    setMode(null);
  }

  const stamp = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  type Opt = { mode: Mode; label: string; icon: string; group?: string };
  const options: Opt[] = teacher
    ? [
        { mode: "audio", label: "Audio", icon: "mic" },
        { mode: "video", label: "Video", icon: "video" },
        { mode: "screen", label: "Screen", icon: "board" },
        { mode: "photo", label: "Photo", icon: "camera" },
      ]
    : [
        { mode: "screen", label: "Record screen", icon: "board" },
        { mode: "photo", label: "Take a photo", icon: "camera" },
        { mode: "draw", label: "Draw", icon: "practice" },
        { mode: "link", label: "Paste a link", icon: "link" },
      ];

  if (mode === "audio" || mode === "video" || mode === "screen") {
    return (
      <div>
        <MediaCapture video={mode !== "audio"} screen={mode === "screen"} label={label}
          onKeep={(f, transcript, duration) => upload(f, `${mode === "screen" ? "Screen recording" : mode === "video" ? "Video" : "Recording"} · ${stamp()}`, transcript, duration)} onCancel={() => setMode(null)} />
        {busy && <p className="mt-2 text-[12.5px] text-ink-3" role="status">Saving…{progress > 0 && progress < 1 ? ` ${Math.round(progress * 100)}%` : ""}</p>}
      </div>
    );
  }
  if (mode === "photo") return <PhotoCapture onKeep={(f) => upload(f, `Photo · ${stamp()}`)} onCancel={() => setMode(null)} />;
  if (mode === "draw") return <SketchPad onKeep={(f) => upload(f, `Drawing · ${stamp()}`)} onCancel={() => setMode(null)} />;
  if (mode === "link") {
    return (
      <form
        className="rise flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!/^https?:\/\//i.test(link.trim())) return toast("Links must start with http:// or https://", { icon: "x", tone: "bad" });
          // Use the page's own title as the label, so "youtube.com" becomes the video's name.
          const url = link.trim();
          const preview = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`).then((r) => r.json()).catch(() => null);
          await onAdd({ kind: "link", url, name: preview?.ok && preview.title ? String(preview.title).slice(0, 120) : undefined });
          setLink("");
          setMode(null);
        }}
      >
        <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… a video, slides, or a page" aria-label="Link" className="field" />
        <button type="submit" className="btn btn-dark press h-auto">Add</button>
        <button type="button" onClick={() => setMode(null)} className="btn btn-quiet press h-auto">Cancel</button>
      </form>
    );
  }

  const btn = `btn btn-ghost press ${compact ? "h-8 px-2.5" : ""}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {teacher ? (
        <button onClick={() => setMode("link")} className={btn}><Icon name="link" size={13} /> Link</button>
      ) : (
        <>
          <button onClick={() => setMode("audio")} className={btn}><Icon name="mic" size={13} /> {compact ? "Audio" : "Record audio"}</button>
          <button onClick={() => setMode("video")} className={btn}><Icon name="camera" size={13} /> {compact ? "Video" : "Record video"}</button>
        </>
      )}
      <button onClick={() => file.current?.click()} disabled={busy} className={btn}><Icon name="upload" size={13} /> {busy ? `Uploading…${progress > 0 && progress < 1 ? ` ${Math.round(progress * 100)}%` : ""}` : "Upload"}</button>
      {teacher && <button onClick={() => setMode("draw")} className={btn}><Icon name="practice" size={13} /> Draw</button>}
      <div ref={menu} className="relative">
        <button onClick={() => setMore((m) => !m)} aria-expanded={more} aria-haspopup="menu" className={btn}>{teacher ? <><Icon name="mic" size={13} /> Record</> : "More"} <Icon name="chevron" size={12} className={`transition-transform duration-300 ${more ? "rotate-180" : ""}`} /></button>
        {more && (
          <div className={`pop absolute bottom-full left-0 z-20 mb-1.5 ${teacher ? "w-40" : "w-48"} rounded-xl border border-line bg-white p-1 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]`} role="menu">
            {options.map((o, i) => (
              <div key={o.mode}>
                {o.group && o.group !== options[i - 1]?.group && <div className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{o.group}</div>}
                {!o.group && options[i - 1]?.group && <div className="my-1 border-t border-line" />}
                <button role="menuitem" onClick={() => { setMore(false); setMode(o.mode); }} style={{ "--i": i } as React.CSSProperties}
                  className={`rise press flex w-full items-center gap-2.5 rounded-lg py-2 text-left text-[13px] hover:bg-lane ${o.group ? "pl-4 pr-2.5" : "px-2.5"}`}>
                  <Icon name={o.icon} size={14} className="text-ink-2" />{o.label}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <input ref={file} type="file" className="hidden" accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }} />
    </div>
  );
}
