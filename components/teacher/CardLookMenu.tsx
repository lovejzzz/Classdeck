"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { uploadFile } from "@/lib/client";
import { toast } from "@/lib/toast";
import { CARD_COLORS, suitOfCard } from "@/lib/ui";
import type { Module } from "@/lib/types";

/**
 * The ⋮ in the corner of the card in the panel (it shows on hover): change the card's picture (upload one, use one of
 * its own pictures, or go back to its first attachment) and its colour (or back to its family's).
 */
export function CardLookMenu({ m, onLook }: { m: Module; onLook: (look: Module["look"]) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const look = m.look ?? {};
  const pictures = (m.attachments ?? []).filter((a) => a.kind === "image" && a.url !== look.image);
  const family = suitOfCard({ ...m, look: undefined });
  // A look with nothing in it is no look at all.
  const put = (next: Module["look"]) => onLook(next && (next.color || next.image) ? next : undefined);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc, true); };
  }, [open]);

  async function upload(f: File) {
    if (!f.type.startsWith("image/")) return toast("Pick a picture (JPG, PNG, GIF or WebP)", { icon: "image", tone: "plain" });
    setBusy(true);
    const r = await uploadFile(f);
    setBusy(false);
    if (!r.ok) return toast(r.error, { icon: "x", tone: "bad" });
    put({ ...look, image: r.url });
    setOpen(false);
  }

  return (
    <div ref={box} className="absolute right-1.5 top-1.5 z-10">
      <button onClick={() => setOpen((v) => !v)} aria-label="Card picture and colour" aria-expanded={open} title="Picture and colour"
        className={`press grid h-7 w-7 place-items-center rounded-full bg-white/95 text-ink-2 shadow-[0_1px_3px_rgba(0,0,0,0.18)] ring-1 ring-black/5 transition-opacity hover:text-ink ${open ? "opacity-100" : "opacity-0 group-hover/look:opacity-100 focus-visible:opacity-100"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {open && (
        <div role="menu" className="pop absolute right-0 top-9 w-64 rounded-2xl border border-line bg-white p-2 text-[13px] shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]">
          <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Picture</div>
          <button role="menuitem" disabled={busy} onClick={() => file.current?.click()} className="press flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-lane disabled:opacity-50">
            <Icon name="upload" size={14} className="text-ink-2" />{busy ? "Uploading…" : look.image ? "Change the picture…" : "Upload a picture…"}
          </button>
          {pictures.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
              {pictures.slice(0, 6).map((a) => (
                <button key={a.id} role="menuitem" onClick={() => { put({ ...look, image: a.url }); setOpen(false); }} aria-label={`Use ${a.name || "this picture"}`} title={`Use ${a.name || "this picture"}`}
                  className="press h-10 w-12 overflow-hidden rounded-md ring-1 ring-line hover:ring-2 hover:ring-[#4b56a8]/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {look.image && (
            <button role="menuitem" onClick={() => { put({ ...look, image: undefined }); setOpen(false); }} className="press flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-ink-2 hover:bg-lane">
              <Icon name="reset" size={14} />Back to the card’s own art
            </button>
          )}
          <div className="mt-1 border-t border-line px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Colour</div>
          <div className="flex flex-wrap gap-1.5 px-2 pb-1.5 pt-0.5" role="group" aria-label="Card colour">
            <button role="menuitemradio" aria-checked={!look.color} onClick={() => put({ ...look, color: undefined })} title={`${family.name}’s own colour`} aria-label={`${family.name}’s own colour`}
              className={`press grid h-7 w-7 place-items-center rounded-full ring-offset-2 ${!look.color ? "ring-2 ring-ink" : "ring-1 ring-line"}`} style={{ background: family.cover }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: family.tint }} />
            </button>
            {CARD_COLORS.filter((c) => c.tint !== family.tint).map((c) => (
              <button key={c.id} role="menuitemradio" aria-checked={look.color === c.id} onClick={() => put({ ...look, color: c.id })} title={c.name} aria-label={c.name}
                className={`press h-7 w-7 rounded-full ring-offset-2 ${look.color === c.id ? "ring-2 ring-ink" : ""}`} style={{ background: c.tint }} />
            ))}
          </div>
        </div>
      )}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
    </div>
  );
}
