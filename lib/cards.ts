import type { Attachment, Density } from "./types";

export const CARD_SIZE: Record<Density | "deck" | "mobile", { w: number; h: number }> = {
  spacious: { w: 214, h: 300 },
  comfortable: { w: 180, h: 252 },
  compact: { w: 156, h: 218 },
  deck: { w: 168, h: 235 },
  mobile: { w: 150, h: 210 },
};

/** Deterministic pseudo-random number from a string, for per-card jitter and sway phase. */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const ORDER: Attachment["kind"][] = ["image", "video", "audio", "file", "link"];

/** The attachment that becomes the card's artwork. */
export function heroAttachment(list?: Attachment[]) {
  if (!list?.length) return undefined;
  return [...list].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))[0];
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
