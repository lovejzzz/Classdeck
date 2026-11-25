"use client";

import { useState } from "react";
import { FAMILIES, faceMeta, kindOf, newCard as makeCard, type CardKind } from "@/lib/kinds";
import type { Module } from "@/lib/types";
import type { SavedCard } from "@/lib/store";
import { suitOfCard } from "@/lib/ui";
import { KindCard } from "../cards/KindCard";
import { Icon } from "../Icon";

export const NEW_KINDS: CardKind[] = FAMILIES.map((f) => f.start);

/** A fresh copy of one of the teacher's saved cards, ready to put down. It remembers the saved card it came from. */
export const copyOfSaved = (sc: SavedCard): Module => ({ ...structuredClone(sc.module), id: makeCard(kindOf(sc.module as Module), "").id, audience: { kind: "all" }, collected: sc.id } as Module);

/**
 * What a new card can be: Content, Question, or one of the teacher's Saved cards (from Collect, in any of their
 * courses). Saved cards open a list in the same place, with a way back. The map's + Card and a card group's
 * "Add a card" both use it, so adding a card is the same everywhere.
 */
export function KindPick({ saved, onKind, onSaved, onForget }: {
  saved: SavedCard[];
  onKind: (t: CardKind) => void;
  onSaved: (sc: SavedCard) => void;
  onForget?: (sc: SavedCard) => void;
}) {
  const [list, setList] = useState(false);
  if (list) return (
    <div>
      <button onClick={() => setList(false)} className="press flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-ink hover:bg-lane">
        <Icon name="chevron" size={12} className="rotate-90" /> Saved cards
      </button>
      {saved.length ? (
        <div className="max-h-56 overflow-y-auto">
          {saved.map((sc) => (
            <div key={sc.id} className="group/saved flex items-center rounded-lg hover:bg-lane">
              <button onClick={() => onSaved(sc)} className="press flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[12.5px]">
                <span className="h-3 w-2 flex-none rounded-[3px]" style={{ background: suitOfCard(sc.module as Module).tint }} />
                <span className="min-w-0 flex-1 truncate">{sc.name}</span>
                <span className="flex-none text-[11px] text-ink-3">{sc.set ? `${sc.set.kind === "group" ? "Card group" : "Lesson"} · ${sc.set.modules.filter((m) => m.type !== "group").length} cards` : faceMeta(sc.module as Module).name}</span>
              </button>
              {onForget && <button onClick={() => onForget(sc)} aria-label={`Remove “${sc.name}” from Saved cards`} title="Remove from Saved cards" className="press mr-1 flex h-6 w-6 flex-none items-center justify-center rounded-md text-ink-3 opacity-0 hover:bg-white hover:text-bad focus:opacity-100 group-hover/saved:opacity-100"><Icon name="x" size={11} /></button>}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-2 pb-1.5 pt-0.5 text-[12px] leading-snug text-ink-3">No saved cards yet. Open a card and press Collect at the top of its panel; it shows up here in all your courses.</p>
      )}
    </div>
  );
  // The two kinds as two small cards, like the ones they put down; the teacher's saved cards as a stack under them.
  return (
    <div>
      <div className="flex justify-center gap-2.5">
        {NEW_KINDS.map((t) => (
          <button key={t} onClick={() => onKind(t)} aria-label={`New ${FAMILIES.find((f) => f.start === t)!.name} card`} className="press rounded-[12px] transition-transform hover:-translate-y-1 focus-visible:-translate-y-1">
            <KindCard kind={t} />
          </button>
        ))}
      </div>
      <button onClick={() => setList(true)} className="press mt-2.5 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-lane">
        <span className="relative h-[44px] w-[44px] flex-none" aria-hidden="true">
          {(saved.length ? saved.slice(0, 3) : [null, null, null]).map((sc, i, all) => {
            const suit = sc ? suitOfCard(sc.module as Module) : null;
            return (
              <span key={i} className={`absolute top-0 h-[42px] w-[30px] rounded-[6px] border bg-white shadow-sm ${suit ? "" : "border-dashed border-line-strong"}`}
                style={{ left: 4 + i * 5, transform: `rotate(${(i - (all.length - 1) / 2) * 7}deg)`, borderColor: suit ? `${suit.tint}55` : undefined }}>
                {suit && <span className="mx-[3px] mt-[5px] block h-[16px] rounded-[3px]" style={{ background: suit.cover }} />}
              </span>
            );
          })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-ink">Saved cards</span>
          <span className="block truncate text-[11px] text-ink-3">{saved.length ? `${saved.length} card${saved.length === 1 ? "" : "s"} you saved, from any course` : "Cards you save show up here"}</span>
        </span>
        <Icon name="chevron" size={13} className="-rotate-90 flex-none text-ink-3" />
      </button>
    </div>
  );
}
