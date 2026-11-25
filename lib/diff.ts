/** What changed between two versions of a piece of writing, word by word: kept, added, and taken out. */
export type DiffPart = { t: string; k: "same" | "add" | "del" };

/**
 * Words (with the spaces after them) compared by their longest common run. Null when either side is too long to
 * compare quickly; the page then just says the work changed.
 */
export function wordDiff(before: string, after: string, max = 2500): DiffPart[] | null {
  const a = before.match(/\S+\s*|\s+/g) ?? [], b = after.match(/\S+\s*|\s+/g) ?? [];
  if (a.length > max || b.length > max) return null;
  const key = (w: string) => w.trim();
  // Lengths of the longest common runs from each pair of positions to the end.
  const n = a.length, m = b.length;
  const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = key(a[i]) === key(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (t: string, k: DiffPart["k"]) => { const last = out[out.length - 1]; if (last && last.k === k) last.t += t; else out.push({ t, k }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) { push(b[j], "same"); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push(a[i++], "del");
    else push(b[j++], "add");
  }
  while (i < n) push(a[i++], "del");
  while (j < m) push(b[j++], "add");
  return out;
}
