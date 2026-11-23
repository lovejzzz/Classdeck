"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * Everyone gets Link, Upload, Draw and Record (a choice of audio, video, the screen or a photo); students see Record
 * first, since that's what they hand in.
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
  const list = useRef<HTMLDivElement>(null);
  // Where the Record menu opens: above its button, on the page itself, so a card or post around it never clips it.
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!more) return;
    const off = (e: PointerEvent) => !menu.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node) && setMore(false);
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
  // Everyone records the same four ways, from one Record menu.
  const options: { mode: Mode; label: string; icon: string }[] = [
    { mode: "audio", label: "Audio", icon: "mic" },
    { mode: "video", label: "Video", icon: "video" },
    { mode: "screen", label: "Screen", icon: "board" },
    { mode: "photo", label: "Photo", icon: "camera" },
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
  const linkBtn = <button key="link" onClick={() => setMode("link")} className={btn}><Icon name="link" size={13} /> Link</button>;
  const uploadBtn = <button key="upload" onClick={() => file.current?.click()} disabled={busy} className={btn}><Icon name="upload" size={13} /> {busy ? `Uploading…${progress > 0 && progress < 1 ? ` ${Math.round(progress * 100)}%` : ""}` : "Upload"}</button>;
  const drawBtn = <button key="draw" onClick={() => setMode("draw")} className={btn}><Icon name="practice" size={13} /> Draw</button>;
  const recordMenu = (
    <div key="record" ref={menu} className="relative">
      <button onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setAt({ left: Math.min(b.left, window.innerWidth - 168), bottom: window.innerHeight - b.top + 6 }); setMore((m) => !m); }}
        aria-expanded={more} aria-haspopup="menu" className={btn}><Icon name="mic" size={13} /> Record <Icon name="chevron" size={12} className={`transition-transform duration-300 ${more ? "rotate-180" : ""}`} /></button>
      {more && at && createPortal(
        <div ref={list} className="pop fixed z-[95] w-40 rounded-xl border border-line bg-white p-1 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]" style={{ left: at.left, bottom: at.bottom }} role="menu">
          {options.map((o, i) => (
            <button key={o.mode} role="menuitem" onClick={() => { setMore(false); setMode(o.mode); }} style={{ "--i": i } as React.CSSProperties}
              className="rise press flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-lane">
              <Icon name={o.icon} size={14} className="text-ink-2" />{o.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* The same four buttons for everyone. Students hand work in, so Record comes first for them. */}
      {teacher ? [linkBtn, uploadBtn, drawBtn, recordMenu] : [recordMenu, uploadBtn, drawBtn, linkBtn]}
      {mode === "draw" && <DrawPanel onKeep={(f) => { setMode(null); upload(f, `Drawing · ${stamp()}`); }} onCancel={() => setMode(null)} />}
      <input ref={file} type="file" className="hidden" accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }} />
    </div>
  );
}

/** Draw in a large panel of its own, over the page: room to draw, and Esc closes only this. */
function DrawPanel({ onKeep, onCancel }: { onKeep: (file: File) => void; onCancel: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); onCancel(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:p-8" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-label="Draw" className="pop w-full max-w-[min(72rem,calc((100dvh-10rem)*1.6))] overflow-hidden rounded-2xl bg-white shadow-[0_40px_100px_-30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <Icon name="practice" size={15} className="text-ink-2" />
          <span className="flex-1 text-[14px] font-semibold">Draw</span>
          <button onClick={onCancel} aria-label="Close" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={17} /></button>
        </div>
        <SketchPad big onKeep={onKeep} onCancel={onCancel} />
      </div>
    </div>,
    document.body,
  );
}
