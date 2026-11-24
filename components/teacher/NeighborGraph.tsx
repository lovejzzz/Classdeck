"use client";

import { bandLabel, wiresOf, type Wire } from "@/lib/branching";
import { suitOfCard } from "@/lib/ui";
import type { Lesson, Module } from "@/lib/types";
import { Icon } from "../Icon";

/**
 * A card's neighbourhood, at the top of its editing panel: the cards that deal it (left), the card (middle), and what
 * each of its answers or score ranges deals (right). Click a neighbour to move to it; "Open in map" shows it on the
 * course map.
 */
export function NeighborGraph({ card, lessons, onGo, onMap }: {
  card: Module;
  /** Every lesson, in order (with unsaved edits). */
  lessons: Lesson[];
  onGo: (lessonId: string, moduleId: string) => void;
  onMap?: () => void;
}) {
  const all = lessons.flatMap((l) => l.modules.map((m) => ({ m, l })));
  const wires = wiresOf(all.map((x) => x.m));
  const find = (id: string) => all.find((x) => x.m.id === id);
  const lessonOfCard = find(card.id)?.l;
  const portName = (w: Wire) => {
    const src = find(w.from)?.m;
    if (w.score) return `score ${bandLabel(w.score)}`;
    const q = src?.questions?.find((x) => x.id === w.q);
    const o = q?.options[w.option]?.trim();
    return `${String.fromCharCode(65 + w.option)}${o ? ` · ${o}` : ""}`;
  };
  const inbound = wires.filter((w) => w.to === card.id);
  // A card kept for some students or groups (set under Access) isn't everyone's.
  const some = card.audience?.kind === "student" && !!(card.audience.studentIds?.length || card.audience.studentId || card.audience.groups?.length);
  const who = some ? "Only some students get this card (see Access)" : "Everyone gets this card";
  const outbound = wires.filter((w) => w.from === card.id);
  const chip = (x: { m: Module; l: Lesson }, note: string, side: "in" | "out") => (
    <button key={`${side}-${x.m.id}-${note}`} onClick={() => onGo(x.l.id, x.m.id)}
      className="press group flex w-full min-w-0 items-center gap-2 rounded-xl border border-line bg-white px-2.5 py-1.5 text-left hover:border-line-strong hover:shadow-sm">
      <span className="h-6 w-1.5 flex-none rounded-full" style={{ background: suitOfCard(x.m).tint }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-ink">{x.m.title || "Untitled card"}</span>
        <span className="block truncate text-[11px] text-ink-3">{side === "in" ? `when ${note}` : note}{x.l.id !== lessonOfCard?.id ? ` · ${x.l.title}` : ""}</span>
      </span>
    </button>
  );
  if (!inbound.length && !outbound.length) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-line px-3 py-2.5 text-[12px] text-ink-3">
        <Icon name="split" size={13} />
        <span className="flex-1">{who}. A Question card with choices can deal different cards by answer: drag an answer to a card on the map.</span>
        {onMap && <button onClick={onMap} className="press flex-none rounded-lg px-2 py-1 font-medium text-[#4b56a8] hover:bg-[#eef0fb]">Open in map</button>}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-canvas/60 p-2.5">
      <div className="mb-2 flex items-center gap-1.5 px-0.5 text-[11.5px] text-ink-3">
        <Icon name="split" size={12} />
        <span className="flex-1">{inbound.length ? "Dealt by an answer" : who} · {outbound.length} branch{outbound.length === 1 ? "" : "es"} out</span>
        {onMap && <button onClick={onMap} className="press rounded-lg px-2 py-0.5 font-medium text-[#4b56a8] hover:bg-[#eef0fb]">Open in map</button>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <div className="min-w-0 space-y-1.5">
          {inbound.length ? inbound.map((w) => { const x = find(w.from); return x ? chip(x, portName(w), "in") : null; }) : <div className="px-1 text-center text-[11.5px] text-ink-3">{some ? "some students" : "everyone"}</div>}
        </div>
        <div className="flex flex-col items-center gap-1 px-0.5">
          <Icon name="arrow" size={12} className="text-[#a3a8cf]" />
          <span className="max-w-[7rem] truncate rounded-lg bg-[#4b56a8] px-2 py-1 text-[11.5px] font-medium text-white" title={card.title}>This card</span>
          <Icon name="arrow" size={12} className="text-[#a3a8cf]" />
        </div>
        <div className="min-w-0 space-y-1.5">
          {outbound.length ? outbound.map((w) => { const x = find(w.to); return x ? chip(x, portName(w), "out") : null; }) : <div className="px-1 text-center text-[11.5px] text-ink-3">no branches</div>}
        </div>
      </div>
    </div>
  );
}
