/** Name helpers safe for the browser too (no store): first and last names, and splitting one whole name. */

export const namePart = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
export const fullName = (first: string, last: string) => `${first} ${last}`.trim().slice(0, 81);

/** A name as one string, split at its last space ("Mary Anne Lee" → "Mary Anne", "Lee"). */
export function splitName(name: string): { first: string; last: string } {
  const n = namePart(name);
  const i = n.lastIndexOf(" ");
  return i > 0 ? { first: n.slice(0, i), last: n.slice(i + 1) } : { first: n, last: "" };
}
