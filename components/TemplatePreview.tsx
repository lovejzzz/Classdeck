"use client";

import { CourseCover } from "./CourseCover";
import { Icon } from "./Icon";
import { kindMeta, type CardKind } from "@/lib/kinds";
import { suitOfKind } from "@/lib/ui";
import type { Outline, OutlineCard, TemplateInfo } from "@/lib/mytemplates";

/**
 * A template drawn small, the way its map looks: the cover and name, how big it is, and each lesson as a row of little
 * cards in their suit's colour (a card group as a stack, a card dealt by an answer with a dashed edge). Read only.
 */
export function TemplatePreview({ t, rows = 6, compact = false }: { t: TemplateInfo; rows?: number; compact?: boolean }) {
  const o = t.outline;
  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-white ${compact ? "" : "shadow-[0_1px_2px_rgba(0,0,0,0.04)]"}`}>
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <span className="h-11 w-16 flex-none overflow-hidden rounded-md border border-line/80">
          <CourseCover c={{ id: t.id, title: t.name, subtitle: t.subtitle, cover: t.cover }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{t.name}</span>
          <span className="block truncate text-[12px] text-ink-3">{size(o)}</span>
        </span>
      </div>
      <Rows o={o} rows={rows} />
    </div>
  );
}

export const size = (o: Outline) => `${o.weeks} week${o.weeks === 1 ? "" : "s"} · ${o.lessons} lesson${o.lessons === 1 ? "" : "s"} · ${o.cards} card${o.cards === 1 ? "" : "s"}`;

/** The lessons, a row each, as little cards. */
export function Rows({ o, rows }: { o: Outline; rows: number }) {
  const shown = o.rows.slice(0, rows);
  return (
    <div className="space-y-1.5 bg-[#f7f6f3] px-3 py-2.5" aria-label="The template’s lessons and cards">
      {shown.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-28 flex-none truncate text-[11px] text-ink-3" title={`${r.week} · ${r.lesson}`}>{r.lesson}</span>
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {r.cards.length ? r.cards.slice(0, 14).map((c, k) => <Mini key={k} c={c} />) : <span className="text-[11px] text-ink-3">No cards</span>}
            {r.cards.length > 14 && <span className="text-[10.5px] text-ink-3">+{r.cards.length - 14}</span>}
          </span>
        </div>
      ))}
      {o.rows.length > rows && <p className="pt-0.5 text-[11px] text-ink-3">and {o.rows.length - rows} more lesson{o.rows.length - rows === 1 ? "" : "s"}</p>}
    </div>
  );
}

function Mini({ c }: { c: OutlineCard }) {
  const kind = (c.kind as CardKind) || "content";
  const tint = suitOfKind(kind === "group" ? "choice" : kind).tint;
  const meta = kindMeta(kind);
  const label = `${c.title} · ${c.poll ? "Poll" : meta?.name ?? "Card"}${c.cards ? ` · ${c.cards} cards` : ""}${c.branch ? " · dealt by an answer" : ""}`;
  return (
    <span title={label} aria-label={label} className="relative flex-none">
      {c.cards ? <span className="absolute -right-[3px] -top-[3px] h-[26px] w-[19px] rounded-[4px] border border-line bg-white" /> : null}
      <span className={`relative flex h-[26px] w-[19px] items-start justify-center rounded-[4px] border bg-white pt-[3px] ${c.branch ? "border-dashed" : ""}`}
        style={{ borderColor: c.branch ? tint : "#e4e2dc", boxShadow: `inset 0 2px 0 ${tint}` }}>
        <span style={{ color: tint }}><Icon name={c.poll ? "chart" : meta?.icon ?? "read"} size={9} strokeWidth={2} /></span>
      </span>
    </span>
  );
}
