"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { Attachment } from "@/lib/types";
import { Icon } from "./Icon";
import { ImageSearch } from "./ImageSearch";
import { MediaCapture } from "./MediaCapture";
import { PhotoCapture } from "./PhotoCapture";
import { SketchPad } from "./SketchPad";

type Mode = "audio" | "video" | "screen" | "photo" | "draw" | "search" | "link";

/**
 * Every way to add something: record audio, video, or your screen; take a photo; draw; find an image;
 * upload a file; or paste a link. The three most common sit in the row; the rest are under "More".
 */
export function AttachMenu({ onAdd, label, accept = "audio/*,video/*,image/*,.pdf,.doc,.docx,.ppt,.pptx,.key,.txt,.csv", compact = false }: {
  onAdd: (a: Omit<Attachment, "id">) => Promise<void> | void;
  label?: string;
  accept?: string;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!more) return;
    const off = (e: PointerEvent) => !menu.current?.contains(e.target as Node) && setMore(false);
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [more]);

  async function upload(f: File, name?: string, transcript?: string) {
    setBusy(true);
    const r = await uploadFile(f);
    setBusy(false);
    if (!r.ok) return toast(r.error, { icon: "x", tone: "bad" });
    await onAdd({ kind: r.kind, url: r.url, name: name ?? r.name, size: r.size, transcript });
    setMode(null);
  }

  const stamp = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const options: { mode: Mode; label: string; icon: string }[] = [
    { mode: "screen", label: "Record screen", icon: "board" },
    { mode: "photo", label: "Take a photo", icon: "camera" },
    { mode: "draw", label: "Draw", icon: "practice" },
    { mode: "search", label: "Find an image", icon: "image" },
    { mode: "link", label: "Paste a link", icon: "link" },
  ];

  if (mode === "audio" || mode === "video" || mode === "screen") {
    return (
      <div>
        <MediaCapture video={mode !== "audio"} screen={mode === "screen"} label={label}
          onKeep={(f, transcript) => upload(f, `${mode === "screen" ? "Screen recording" : mode === "video" ? "Video" : "Recording"} · ${stamp()}`, transcript)} onCancel={() => setMode(null)} />
        {busy && <p className="mt-2 text-[12.5px] text-ink-3">Saving…</p>}
      </div>
    );
  }
  if (mode === "photo") return <PhotoCapture onKeep={(f) => upload(f, `Photo · ${stamp()}`)} onCancel={() => setMode(null)} />;
  if (mode === "draw") return <SketchPad onKeep={(f) => upload(f, `Drawing · ${stamp()}`)} onCancel={() => setMode(null)} />;
  if (mode === "search") {
    return <ImageSearch onCancel={() => setMode(null)} onPick={async (r) => { await onAdd({ kind: "image", url: r.url, name: r.title, credit: r.credit }); setMode(null); }} />;
  }
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
      <button onClick={() => setMode("audio")} className={btn}><Icon name="mic" size={13} /> {compact ? "Audio" : "Record audio"}</button>
      <button onClick={() => setMode("video")} className={btn}><Icon name="camera" size={13} /> {compact ? "Video" : "Record video"}</button>
      <button onClick={() => file.current?.click()} disabled={busy} className={btn}><Icon name="upload" size={13} /> {busy ? "Uploading…" : "Upload"}</button>
      <div ref={menu} className="relative">
        <button onClick={() => setMore((m) => !m)} aria-expanded={more} className={btn}>More <Icon name="chevron" size={12} className={`transition-transform duration-300 ${more ? "rotate-180" : ""}`} /></button>
        {more && (
          <div className="pop absolute bottom-full left-0 z-20 mb-1.5 w-48 rounded-xl border border-line bg-white p-1 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]" role="menu">
            {options.map((o, i) => (
              <button key={o.mode} role="menuitem" onClick={() => { setMore(false); setMode(o.mode); }} style={{ "--i": i } as React.CSSProperties}
                className="rise press flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-lane">
                <Icon name={o.icon} size={14} className="text-ink-2" />{o.label}
              </button>
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
