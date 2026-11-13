import { db } from "@/lib/store";

/** Uploads that have been given a link but not finished yet. Kept in memory; an unfinished one simply expires. */
const g = globalThis as unknown as { __qhPending?: Map<string, { by: string; size: number; original: string; exp: number }> };
export const pending = (g.__qhPending ??= new Map());

export function sweep() {
  const now = Date.now();
  for (const [k, v] of pending) if (v.exp < now) pending.delete(k);
}

/** How many bytes this uploader has stored so far. */
export function usedBy(by: string) {
  return Object.values(db().uploads).reduce((n, u) => n + (u.by === by ? u.size : 0), 0);
}
