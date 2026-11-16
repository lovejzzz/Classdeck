"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SavedCard } from "@/lib/store";
import { CARD_TEMPLATES, type CardTemplate } from "@/lib/templates";
import { toast } from "@/lib/toast";
import type { ModuleType } from "@/lib/types";
import { SUITS, TYPE_META, suitOf, type Suit } from "@/lib/ui";
import { Icon } from "../Icon";

/** The teacher's saved cards, shared by every New card slot on the page. */
let library: SavedCard[] | null = null;
const listeners = new Set<(c: SavedCard[]) => void>();
export async function loadLibrary(force = false) {
  if (library && !force) return library;
  const r = await fetch("/api/library").then((x) => (x.ok ? x.json() : { cards: [] })).catch(() => ({ cards: [] }));
  library = r.cards as SavedCard[];
  listeners.forEach((f) => f(library!));
  return library;
}
function useLibrary(active: boolean) {
  const [cards, setCards] = useState<SavedCard[]>(library ?? []);
  useEffect(() => {
    listeners.add(setCards);
    if (active) loadLibrary();
    return () => { listeners.delete(setCards); };
  }, [active]);
  return cards;
}

export type NewCardChoice =
  | { kind: "blank" }
  | { kind: "type"; type: ModuleType }
  | { kind: "template"; template: CardTemplate }
  | { kind: "saved"; card: SavedCard }
  | { kind: "custom"; suit: Suit };

const CHOICES: ({ id: Suit } | { id: "blank" })[] = [...SUITS.map((s) => ({ id: s.id })), { id: "blank" as const }];

/** A small card in the fan: a suit's face, or the blank card. */
function FanCard({ id, w, h }: { id: Suit | "blank"; w: number; h: number }) {
  if (id === "blank") {
    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed border-line-strong bg-white text-ink-2" style={{ width: w, height: h }}>
        <Icon name="plus" size={20} />
        <span className="text-[13px] font-semibold">Blank</span>
        <span className="px-2 text-center text-[10.5px] leading-tight text-ink-3">An empty card</span>
      </span>
    );
  }
  const s = SUITS.find((x) => x.id === id)!;
  return (
    <span className="relative flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-line bg-white" style={{ width: w, height: h }}>
      <span className="absolute inset-0 opacity-90" style={{ background: s.cover }} />
      <span className="pointer-events-none absolute inset-[4px] rounded-[9px] border border-white/70" />
      <span className="relative flex items-center gap-1 px-2.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: s.tint }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.tint }} />{s.name}
      </span>
      <span className="relative flex flex-1 flex-wrap content-center items-center justify-center gap-1.5 px-3" style={{ color: s.tint }}>
        {s.types.slice(0, 4).map((t) => <Icon key={t} name={t} size={h > 120 ? 16 : 13} />)}
      </span>
      <span className="relative px-2.5 pb-2.5 text-center text-[17px] font-semibold tracking-tight" style={{ color: s.tint }}>{s.name}</span>
    </span>
  );
}

/**
 * The New card slot. Clicking it fans four cards out in a half circle around it: Learn, Do, Share,
 * and a blank card. Picking a suit opens its kinds, ready-made cards, the teacher's saved cards, and Custom.
 */
export function NewCardFan({ onChoose }: { onChoose: (c: NewCardChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [spread, setSpread] = useState(false);
  const [suit, setSuit] = useState<Suit | null>(null);
  const [at, setAt] = useState({ cx: 0, cy: 0, dir: 1, base: 0, rx: 110, ry: 225, w: 100, h: 140 });
  const ref = useRef<HTMLDivElement>(null);
  const cards = useLibrary(open);

  function show() {
    const b = ref.current!.getBoundingClientRect();
    const small = window.innerWidth < 640;
    const w = small ? 78 : 100, h = Math.round((w * 7) / 5);
    const A = Math.cos((64.16 * Math.PI) / 180);
    const tileX = b.left + b.width / 2;
    let cx = tileX, dir = 1, base = 0, rx = 150, ry = 150;
    if (!small) {
      // A half ellipse hugging the slot's side: the top and bottom cards just clear its edge.
      rx = 170; ry = 235;
      base = b.width / 2 + w / 2 + 14 - rx * A;
      const reach = base + rx + w / 2 + 8;
      dir = tileX + reach <= window.innerWidth || tileX - reach < 0 ? 1 : -1;
    } else {
      // On a phone there's no room beside the slot: centre the half circle on the screen.
      cx = (window.innerWidth - rx) / 2;
    }
    const half = ry * 0.9 + h / 2 + 8;
    const cy = Math.max(half, Math.min(b.top + b.height / 2, window.innerHeight - half));
    setAt({ cx, cy, dir, base, rx, ry, w, h });
    setSuit(null);
    setOpen(true);
    setSpread(false);
    setTimeout(() => setSpread(true), 20);
  }
  function close() {
    setSpread(false);
    setSuit(null);
    setTimeout(() => setOpen(false), 180);
  }
  function choose(c: NewCardChoice) {
    close();
    onChoose(c);
  }

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (suit) setSuit(null);
      else close();
    };
    const away = () => close();
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", away);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", away);
    };
  }, [open, suit]);

  // Where each of the four cards lands on the half circle.
  // Evenly spaced top to bottom (sin = ±0.3, ±0.9), so the gaps between cards match.
  const angles = [-64.16, -17.46, 17.46, 64.16];
  const place = (i: number) => {
    const a = (angles[i] * Math.PI) / 180;
    return { x: at.dir * (at.base + at.rx * Math.cos(a)), y: at.ry * Math.sin(a), rot: angles[i] * 0.2 * at.dir };
  };
  const s = suit ? SUITS.find((x) => x.id === suit)! : null;
  const saved = s ? cards.filter((c) => suitOf(c.module.type).id === s.id) : [];
  const temps = s ? CARD_TEMPLATES.filter((t) => suitOf(t.make().type).id === s.id) : [];
  // The suit's list sits beside the chosen card (which settles back over the slot).
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const panelW = Math.min(300, vw - 24);
  const panelLeft = Math.max(12, Math.min(at.dir > 0 ? at.cx + at.w * 0.6 + 16 : at.cx - at.w * 0.6 - 16 - panelW, vw - panelW - 12));

  async function forget(c: SavedCard) {
    if (!confirm(`Remove “${c.name}” from your saved cards? Cards already in your courses stay.`)) return;
    const r = await fetch("/api/library", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r.ok) return toast("Couldn’t remove it", { icon: "x", tone: "bad" });
    await loadLibrary(true);
  }

  return (
    <div ref={ref} className="relative h-full w-full">
      <button
        onClick={() => (open ? close() : show())}
        className={`press flex h-full w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed text-[13px] transition-colors ${open ? "border-ink text-ink" : "border-line-strong text-ink-3 hover:border-ink-3 hover:text-ink-2"}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name="plus" size={18} className={`transition-transform duration-300 ${open ? "rotate-45" : ""}`} />
        New card
      </button>
      {open && createPortal(
        <div role="dialog" aria-label="New card" className="fixed inset-0 z-50">
          <button aria-label="Close" onClick={close} className={`absolute inset-0 cursor-default bg-ink/10 transition-opacity duration-200 ${spread ? "opacity-100" : "opacity-0"}`} />
          {CHOICES.map((c, i) => {
            const p = place(i);
            const chosen = suit === c.id;
            const hidden = suit !== null && !chosen;
            // Fanned out on the arc; a chosen suit settles back over the New card slot.
            const x = chosen ? 0 : spread ? p.x : 0, y = chosen ? 0 : spread ? p.y : 0;
            const rot = chosen ? 0 : spread ? p.rot : 0;
            return (
              <button
                key={c.id}
                onClick={() => (c.id === "blank" ? choose({ kind: "blank" }) : setSuit(chosen ? null : c.id))}
                aria-label={c.id === "blank" ? "Blank card" : `${SUITS.find((x) => x.id === c.id)!.name} card`}
                aria-pressed={chosen}
                className="absolute rounded-[12px] shadow-[0_12px_28px_-12px_rgba(20,20,18,0.45)] outline-offset-2 hover:z-10 hover:shadow-[0_18px_36px_-12px_rgba(20,20,18,0.5)] focus-visible:outline-2"
                style={{
                  left: at.cx - at.w / 2,
                  top: at.cy - at.h / 2,
                  transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${spread ? (chosen ? 1.15 : 1) : 0.5})`,
                  opacity: spread && !hidden ? 1 : 0,
                  pointerEvents: hidden ? "none" : undefined,
                  transition: `transform 420ms cubic-bezier(.2,1.25,.4,1) ${spread && !suit ? i * 45 : 0}ms, opacity 200ms ease ${spread && !suit ? i * 45 : 0}ms`,
                }}
              >
                <FanCard id={c.id} w={at.w} h={at.h} />
              </button>
            );
          })}

          {s && (
            <div className="pop absolute flex max-h-[min(460px,calc(100vh-24px))] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_20px_50px_-20px_rgba(20,20,18,0.4)]"
              style={{ left: panelLeft, top: Math.max(12, Math.min(at.cy - 200, vh - 472)), width: panelW }}>
              <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                <button onClick={() => setSuit(null)} aria-label="Back to the four cards" className="btn btn-quiet press h-7 w-7 justify-center px-0"><Icon name="back" size={14} /></button>
                <span className="text-[14px] font-semibold" style={{ color: s.tint }}>{s.name}</span>
                <span className="truncate text-[12px] text-ink-3">{s.rule}</span>
              </div>
              <div className="overflow-y-auto p-1.5">
                <Group title="Kind">
                  {s.types.map((t) => (
                    <Item key={t} onClick={() => choose({ kind: "type", type: t })} icon={<Icon name={t} size={14} />} tint={s.tint} name={TYPE_META[t].name} hint={TYPE_META[t].hint} />
                  ))}
                </Group>
                {saved.length > 0 && (
                  <Group title="Your saved cards">
                    {saved.map((c) => (
                      <div key={c.id} className="group flex items-center">
                        <Item onClick={() => choose({ kind: "saved", card: c })} icon={<Icon name="star" size={14} />} tint={s.tint} name={c.name} hint={TYPE_META[c.module.type].name} />
                        <button onClick={() => forget(c)} aria-label={`Remove ${c.name} from saved cards`} className="btn btn-quiet press h-7 w-7 flex-none justify-center px-0 opacity-0 hover:!text-bad focus:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"><Icon name="x" size={12} /></button>
                      </div>
                    ))}
                  </Group>
                )}
                {temps.length > 0 && (
                  <Group title="Ready-made">
                    {temps.map((t) => (
                      <Item key={t.id} onClick={() => choose({ kind: "template", template: t })} icon={<Icon name={t.make().type} size={14} />} tint={s.tint} name={t.name} hint={t.description} />
                    ))}
                  </Group>
                )}
                <div className="mt-1 border-t border-line pt-1.5">
                  <Item onClick={() => choose({ kind: "custom", suit: s.id })} icon={<Icon name="plus" size={14} />} tint={s.tint} name="Custom" hint={`Make your own ${s.name} card, then save it here to reuse`} />
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{title}</div>
      {children}
    </div>
  );
}

function Item({ onClick, icon, tint, name, hint }: { onClick: () => void; icon: React.ReactNode; tint: string; name: string; hint?: string }) {
  return (
    <button onClick={onClick} className="press flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-lane w-full">
      <span className="mt-0.5 flex-none" style={{ color: tint }}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-medium">{name}</span>
        {hint && <span className="block text-[11.5px] leading-snug text-ink-3">{hint}</span>}
      </span>
    </button>
  );
}
