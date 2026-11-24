"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { uploadFile } from "@/lib/client";
import { toast } from "@/lib/toast";
import { CARD_COLORS, suitOfCard } from "@/lib/ui";
import type { Module } from "@/lib/types";

/** The ⋮ on the card itself (it tilts with the card): a quiet ghost button that shows on hover. */
export function LookTrigger({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-label="Card picture and colour" aria-expanded={open} title="Picture and colour"
      data-look-trigger
      className={`press absolute right-[7px] top-[5px] z-10 grid h-6 w-6 place-items-center rounded-md text-ink-2 transition-[opacity,background-color] hover:bg-black/[0.06] hover:text-ink ${open ? "bg-black/[0.06] opacity-100" : "opacity-0 group-hover/look:opacity-100 focus-visible:opacity-100"}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
    </button>
  );
}

/**
 * Beside the card (to its right, never over it), a tall panel: a picture for the card (upload one, or use one of its
 * own), then its colour, three to a row: six soft washes, gold, silver and platinum, and three holographic foils.
 */
export function LookPanel({ m, onLook, onClose }: { m: Module; onLook: (look: Module["look"]) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const look = m.look ?? {};
  const pictures = (m.attachments ?? []).filter((a) => a.kind === "image" && a.url !== look.image);
  const family = suitOfCard({ ...m, look: undefined });
  // A look with nothing in it is no look at all; the family's own colour is no colour of its own.
  const put = (next: Module["look"]) => onLook(next && (next.color || next.image) ? next : undefined);

  useEffect(() => {
    const away = (e: PointerEvent) => { const t = e.target as HTMLElement; if (!box.current?.contains(t) && !t.closest("[data-look-trigger]")) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc, true); };
  }, [onClose]);

  async function upload(f: File) {
    if (!f.type.startsWith("image/")) return toast("Pick a picture (JPG, PNG, GIF or WebP)", { icon: "image", tone: "plain" });
    setBusy(true);
    const r = await uploadFile(f);
    setBusy(false);
    if (!r.ok) return toast(r.error, { icon: "x", tone: "bad" });
    put({ ...look, image: r.url });
  }

  return (
    <div ref={box} role="menu" aria-label="Card picture and colour"
      className="pop absolute left-[calc(100%+14px)] top-0 z-20 flex w-[118px] flex-col gap-2 rounded-2xl border border-line bg-white p-2.5 shadow-[0_24px_60px_-20px_rgba(20,20,18,0.45)]">
      <button role="menuitem" disabled={busy} onClick={() => file.current?.click()} title={look.image ? "Change the picture" : "Upload a picture"}
        className="press flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-[12px] text-ink-2 hover:border-ink/40 hover:text-ink disabled:opacity-50">
        <Icon name={busy ? "clock" : "image"} size={13} />{busy ? "…" : "Picture"}
      </button>
      {(pictures.length > 0 || look.image) && (
        <div className="grid grid-cols-3 gap-1.5">
          {look.image && (
            <button role="menuitem" onClick={() => put({ ...look, image: undefined })} aria-label="Back to the card’s own art" title="Back to the card’s own art"
              className="press grid aspect-square place-items-center rounded-md bg-lane text-ink-2 ring-1 ring-line hover:text-ink"><Icon name="reset" size={12} /></button>
          )}
          {pictures.slice(0, look.image ? 5 : 6).map((a) => (
            <button key={a.id} role="menuitem" onClick={() => put({ ...look, image: a.url })} aria-label={`Use ${a.name || "this picture"}`} title={`Use ${a.name || "this picture"}`}
              className="press aspect-square overflow-hidden rounded-md ring-1 ring-line hover:ring-2 hover:ring-[#4b56a8]/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Card colour">
        {CARD_COLORS.map((c) => {
          // The family's own colour is the one a card has with no colour set.
          const own = !c.foil && c.tint === family.tint;
          const on = own ? !look.color || look.color === c.id : look.color === c.id;
          return (
            <button key={c.id} role="menuitemradio" aria-checked={on} onClick={() => put({ ...look, color: own ? undefined : c.id })} title={own ? `${c.name} (its own colour)` : c.name} aria-label={c.name}
              className="press relative aspect-square rounded-full transition-transform hover:scale-110"
              // The picked one has a dark ring a little outside it (in the same shadow as the swatch's own edge).
              style={{ background: c.cover, boxShadow: [c.frame ? "inset 0 0 0 2px rgba(255,255,255,0.65), 0 1px 3px rgba(0,0,0,0.18)" : `inset 0 0 0 1.5px ${c.tint}55`, ...(on ? ["0 0 0 2px #fff", "0 0 0 4px #1b1b1a"] : [])].join(", ") }}>
              {!c.frame && <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: c.tint }} />}
            </button>
          );
        })}
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
    </div>
  );
}
