import type { Attachment, Density } from "./types";

/** Every card is a playing card: 5 wide by 7 tall. */
export const CARD_SIZE: Record<Density | "deck" | "mobile", { w: number; h: number }> = {
  spacious: { w: 215, h: 301 },
  comfortable: { w: 180, h: 252 },
  compact: { w: 155, h: 217 },
  deck: { w: 170, h: 238 },
  mobile: { w: 150, h: 210 },
};

/** Deterministic pseudo-random number from a string, for per-card jitter and sway phase. */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}


/** The attachment that becomes the card's artwork. */
/** The card's artwork: its first item, which the teacher picks with "Make cover". */
export function heroAttachment(list?: Attachment[]) {
  return list?.[0];
}
/** What a card's art window shows: the picture the teacher picked for it (its ⋮ menu), else its first attachment. */
export function heroOf(m: { attachments?: Attachment[]; look?: { image?: string } }): Attachment | undefined {
  return m.look?.image ? { id: "look", kind: "image", url: m.look.image, name: "" } : heroAttachment(m.attachments);
}

export function fileExt(a: Attachment) {
  const src = a.name || a.url;
  const m = src.match(/\.([a-z0-9]{1,5})(?:$|\?)/i);
  return (m?.[1] ?? "file").toUpperCase();
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatSize(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
