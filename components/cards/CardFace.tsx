import { fileExt, heroAttachment, hostOf } from "@/lib/cards";
import { videoEmbed } from "@/lib/media";
import { suitOfCard } from "@/lib/ui";
import type { Module, Status } from "@/lib/types";
import { Icon, StatusIcon } from "../Icon";
import { KindArt } from "./KindArt";
import { PlayArt, playableArt } from "./PlayArt";
import { Waveform } from "./Waveform";
import { faceMeta, faceOf } from "@/lib/kinds";

/** The artwork window: shows the card's main media, or a soft gradient with the type glyph. */
function Art({ m, big, playable }: { m: Module; big: boolean; playable?: boolean }) {
  const meta = suitOfCard(m);
  const a = heroAttachment(m.attachments);
  if (playable && a && playableArt(a)) return <PlayArt key={a.id} a={a} cover={meta.cover} />;
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
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        {backdrop}
        <Waveform url={a.url} seed={a.id} off="bg-ink/70" className="h-1/2" />
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
  return <KindArt id={m.id} face={faceOf(m)} tint={meta.tint} cover={meta.cover} />;
}


/**
 * The face of a card, laid out like a playing card:
 * corner index top-left, artwork window, title, content pips, mirrored corner bottom-right.
 */
export function CardFace({
  m, status, personal, badge, big = false, footer, due, playable = false,
}: {
  /** Let the card's video or recording play right on the face (the editor's preview). */
  playable?: boolean;
  m: Module; status?: Status; index?: number; total?: number; personal?: boolean; badge?: string; big?: boolean; footer?: React.ReactNode;
  /** Shown in the corner instead of the time when the card is due soon or late. */
  due?: { label: string; tone: "late" | "soon" | "later" | "plain" };
}) {
  const tag = badge ?? (m.choice ? (m.choice.recommended ? "Recommended path" : "Pick a path") : m.picked ? "Your path" : personal ? "For you" : undefined);
  const meta = suitOfCard(m);
  const kind = faceMeta(m);
  const question = meta.id === "question";
  // One shell per family: Content cards a clean double frame; Question cards a dashed inner frame and a coloured foot.
  return (
    <div className="@container relative flex h-full w-full flex-col overflow-hidden rounded-[14px] border bg-white select-none" style={{ borderColor: `${meta.tint}40` }}>
      <div className={`pointer-events-none absolute inset-[5px] rounded-[10px] border ${question ? "border-dashed" : ""}`} style={{ borderColor: `${meta.tint}${question ? "55" : "30"}` }} />
      {question && <div className="pointer-events-none absolute inset-x-[5px] bottom-[5px] h-[22%] rounded-b-[10px]" style={{ background: `linear-gradient(to top, ${meta.tint}1f, transparent)` }} />}
      {/* corner: the suit, and one status (done, or a due date that's close or past) */}
      <div className="relative flex min-h-[18px] items-center gap-1.5 px-3 pt-2.5" style={{ color: meta.tint }}>
        <span className="rounded-full" style={{ background: meta.tint, width: big ? 7 : 6, height: big ? 7 : 6 }} />
        <span className={`font-semibold uppercase tracking-[0.1em] ${big ? "text-[11px]" : "text-[10px]"}`}>{suitOfCard(m).name}</span>
        <span className="flex-1" />
        {status === "done" ? <StatusIcon status="done" size={big ? 15 : 13} /> : due && due.tone !== "later" ? (
          <span title={due.label} className={`whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-medium ${due.tone === "late" ? "bg-bad/10 text-bad" : due.tone === "plain" ? "bg-black/[0.05] text-ink-2" : "bg-warn/10 text-warn"}`}>
            {due.label.replace("Due ", "").replace(/ days? late/, "d late")}
          </span>
        ) : null}
      </div>
      {/* artwork */}
      <div className={`relative mx-2.5 mt-2 h-[44%] flex-none overflow-hidden rounded-[8px] border border-line/80 transition-[filter] duration-500 ${status === "done" ? "saturate-[0.35]" : ""}`}>
        <Art m={m} big={big} playable={playable} />
        {tag && <span className="pill absolute left-1.5 top-1.5 h-[18px] max-w-[85%] truncate px-1.5 text-[10px]">{tag}</span>}
      </div>
      {/* title */}
      <div className={`relative px-3 pt-2.5 font-medium leading-[1.25] ${big ? "text-[16px]" : "text-[13.5px]"} line-clamp-3`}>{m.title}</div>
      <div className="flex-1" />
      {footer && <div className="relative flex items-center gap-1.5 px-3 pb-2.5 text-ink-3">{footer}</div>}
      {/* the index corner, like a playing card's: what kind of card it is */}
      <div className="relative flex items-center justify-end gap-1 px-3 pb-2.5 font-medium" style={{ color: meta.tint }}>
        <Icon name={kind.icon} size={big ? 13 : 11} />
        <span className={big ? "text-[11px]" : "text-[10px]"}>{kind.name}</span>
      </div>
    </div>
  );
}

/** The back of a card: dark, with a fine lattice and the Questhand mark. */
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
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/55">{locked ? "Locked" : "Questhand"}</span>
      </div>
    </div>
  );
}
