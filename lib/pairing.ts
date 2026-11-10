import { hash } from "./cards";

/**
 * Who reviews whom in a studio group. The group is shuffled with a seed from the card,
 * then everyone reviews the next `count` people around the ring: each student gives and
 * receives exactly `count` reviews, and partners change from week to week.
 */
export function reviewRing(memberIds: string[], moduleId: string, count = 2): Record<string, string[]> {
  const ring = [...memberIds];
  let seed = Math.floor(hash(moduleId) * 2147483646) + 1; // hash() is a fraction in [0, 1)
  for (let i = ring.length - 1; i > 0; i--) {
    seed = (seed * 48271) % 2147483647;
    const j = seed % (i + 1);
    [ring[i], ring[j]] = [ring[j], ring[i]];
  }
  const n = Math.min(count, ring.length - 1);
  return Object.fromEntries(ring.map((id, i) => [id, Array.from({ length: n }, (_, k) => ring[(i + k + 1) % ring.length])]));
}
