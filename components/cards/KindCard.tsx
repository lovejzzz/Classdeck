import { FAMILIES, faceOf, familyOf, newCard, type CardKind } from "@/lib/kinds";
import { suitOfKind } from "@/lib/ui";
import { KindArt } from "./KindArt";

/**
 * A kind of card to put down, drawn as a small card of its family: its corner, the picture a new card of it gets,
 * its name, and what it can hold. Used where a teacher picks what a new card is.
 */
export function KindCard({ kind, w = 124 }: { kind: CardKind; w?: number }) {
  const suit = suitOfKind(kind);
  const family = FAMILIES.find((f) => f.id === familyOf(kind))!;
  const h = Math.round((w * 7) / 5);
  const question = suit.id === "question";
  return (
    <span className="relative flex flex-col overflow-hidden rounded-[12px] border bg-white text-left shadow-[0_6px_16px_-10px_rgba(0,0,0,0.35)]" style={{ width: w, height: h, borderColor: `${suit.tint}40` }}>
      <span className={`pointer-events-none absolute inset-[4px] rounded-[9px] border ${question ? "border-dashed" : ""}`} style={{ borderColor: `${suit.tint}45` }} />
      <span className="relative flex items-center gap-1 px-2.5 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: suit.tint }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: suit.tint }} />{suit.name}
      </span>
      <span className="relative mx-2 mt-1.5 block overflow-hidden rounded-[7px] border border-line/70" style={{ height: Math.round(h * 0.42) }}>
        <KindArt id={`new-${kind}`} face={faceOf(newCard(kind))} tint={suit.tint} cover={suit.cover} />
      </span>
      <span className="relative px-2.5 pt-2 text-[13.5px] font-semibold leading-tight text-ink">{family.name}</span>
      <span className="relative px-2.5 pt-1 text-[11px] leading-snug text-ink-3">{question ? "Choose, write, fill in, discuss" : "Words, pictures, video, links"}</span>
    </span>
  );
}
