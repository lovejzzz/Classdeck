/** Save a text file in the browser. */
export function download(name: string, content: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  a.download = name.replace(/[\\/:*?"<>|]/g, "");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Build a CSV (with a BOM so Excel reads UTF-8). */
export function toCsv(rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
}
