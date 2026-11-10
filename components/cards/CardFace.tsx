import { fileExt, hash, heroAttachment, hostOf } from "@/lib/cards";
import { videoEmbed } from "@/lib/media";
import { TYPE_META } from "@/lib/ui";
import type { Module, Status } from "@/lib/types";
import { Icon, StatusIcon } from "../Icon";
import { GenArt } from "./GenArt";

/** The artwork window: shows the card's main media, or a soft gradient with the type glyph. */
function Art({ m, big }: { m: Module; big: boolean }) {
  const meta = TYPE_META[m.type];
  const a = heroAttachment(m.attachments);
  const glyph = big ? 34 : 28;
  if (a?.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.url} alt="" draggable={false} className="h-full w-full object-cover" />;
  }
  if (a?.kind === "video") {
    return (
      <div className="relative h-full w-full bg-[#dfe6ec]">
        <video src={`${a.url}#t=1.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="#1b1b1a" /></svg>
          </span>
        </span>
      </div>
    );
  }
  const backdrop = <div className="absolute inset-[-30%] blur-[16px]" style={{ background: meta.cover }} />;
  if (a?.kind === "audio") {
    const seed = hash(a.id);
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        {backdrop}
        <div className="relative flex h-1/2 items-center gap-[3px]">
          {Array.from({ length: 18 }, (_, i) => {
            const h = 0.25 + Math.abs(Math.sin(i * 1.7 + seed * 9)) * 0.75;
            return <span key={i} className="w-[3px] rounded-full bg-ink/70" style={{ height: `${h * 100}%` }} />;
          })}
        </div>
      </div>
    );
  }
  if (a?.kind === "file") {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        {backdrop}
        <div className="relative flex h-[62%] aspect-[3/4] flex-col justify-end rounded-md border border-line bg-white p-1.5 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.2)]">
          <span className="rounded bg-ink px-1 py-0.5 text-center font-mono text-[9px] font-medium tracking-wide text-white">{fileExt(a)}</span>
        </div>
      </div>
    );
  }
  const yt = a?.kind === "link" ? videoEmbed(a.url)?.src.match(/embed\/([\w-]+)/)?.[1] : undefined;
  if (yt) {
    return (
      <div className="relative h-full w-full bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" draggable={false} className="h-full w-full object-cover opacity-90" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="#1b1b1a" /></svg>
          </span>
        </span>
      </div>
    );
  }
  if (a?.kind === "link") {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-1.5 overflow-hidden">
        {backdrop}
        <Icon name="globe" size={glyph} strokeWidth={1.4} className="relative text-ink/75" />
        <span className="relative max-w-[85%] truncate font-mono text-[10px] text-ink-2">{hostOf(a.url)}</span>
      </div>
    );
  }
  return <GenArt id={m.id} tint={meta.tint} cover={meta.cover} />;
}

const KIND_ICON = { image: "image", video: "video", audio: "audio", file: "file", link: "link" } as const;

/**
 * The face of a card, laid out like a playing card:
 * corner index top-left, artwork window, title, content pips, mirrored corner bottom-right.
 */
export function CardFace({
  m, status, index, total, personal, badge, big = false, footer,
}: {
  m: Module; status?: Status; index?: number; total?: number; personal?: boolean; badge?: string; big?: boolean; footer?: React.ReactNode;
}) {
  const tag = badge ?? (m.choice ? (m.choice.recommended ? "Recommended path" : "Pick a path") : m.picked ? "Your path" : personal ? "For you" : undefined);
  const meta = TYPE_META[m.type];
  const kinds = [...new Set((m.attachments ?? []).map((a) => a.kind))];
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[14px] border border-line bg-white select-none">
      <div className="pointer-events-none absolute inset-[5px] rounded-[10px] border border-line/70" />
      {/* corner index */}
      <div className="relative flex items-center gap-1.5 px-3 pt-2.5" style={{ color: meta.tint }}>
        <Icon name={m.type} size={big ? 14 : 12} strokeWidth={2} />
        <span className={`font-medium uppercase tracking-[0.08em] ${big ? "text-[11px]" : "text-[9.5px]"}`}>{meta.name}</span>
        <span className="flex-1" />
        {status === "done" ? <StatusIcon status="done" size={big ? 15 : 13} /> : m.minutes ? (
          <span className="flex items-center gap-0.5 rounded-full bg-[#f3f3f1] px-1.5 py-[1px] font-mono text-[10px] text-ink-2" title={`About ${m.minutes} minutes`}>
            <Icon name="clock" size={10} strokeWidth={2} />{m.minutes}m
          </span>
        ) : index !== undefined && (
          <span className="font-mono text-[10px] text-ink-3">{String(index + 1).padStart(2, "0")}{total ? `/${String(total).padStart(2, "0")}` : ""}</span>
        )}
      </div>
      {/* artwork */}
      <div className={`relative mx-2.5 mt-2 h-[44%] flex-none overflow-hidden rounded-[8px] border border-line/80 transition-[filter] duration-500 ${status === "done" ? "saturate-[0.35]" : ""}`}>
        <Art m={m} big={big} />
        {tag && <span className="pill absolute left-1.5 top-1.5 h-[18px] max-w-[85%] truncate px-1.5 text-[10px]">{tag}</span>}
      </div>
      {/* title */}
      <div className={`relative px-3 pt-2.5 font-medium leading-[1.25] ${big ? "text-[15.5px]" : "text-[13px]"} line-clamp-3`}>{m.title}</div>
      <div className="flex-1" />
      {/* pips + mirrored corner */}
      <div className="relative flex items-center gap-1.5 px-3 pb-2.5 text-ink-3">
        {footer ?? (
          <>
            {m.body.trim() && <Icon name="text" size={11} />}
            {kinds.map((k) => <Icon key={k} name={KIND_ICON[k]} size={11} />)}
            {m.tools.length > 0 && <span className="flex items-center gap-0.5 font-mono text-[10px]"><Icon name="tool" size={10} />{m.tools.length}</span>}
            {m.questions?.length ? <span className="font-mono text-[10px]">{m.questions.length}Q</span> : null}
            {m.submitTo && <Icon name={m.submitTo === "studio" ? "studio" : "board"} size={11} />}
          </>
        )}
        <span className="flex-1" />
        <span className="rotate-180" style={{ color: meta.tint }}><Icon name={m.type} size={big ? 13 : 11} strokeWidth={2} /></span>
      </div>
    </div>
  );
}

/** The back of a card: dark, with a fine lattice and the Classdeck mark. */
export function CardBack({ locked = false }: { locked?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[14px] border border-[#2c2c29] bg-ink select-none">
      <div
        className="absolute inset-[6px] rounded-[10px] border border-white/15"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 9px)",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
        <span className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-white/25 bg-ink">
          {locked ? <Icon name="lock" size={15} /> : <span className="h-3.5 w-3.5 rounded-[4px] bg-white/85" />}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/55">{locked ? "Locked" : "Classdeck"}</span>
      </div>
    </div>
  );
}
