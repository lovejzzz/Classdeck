import qrcode from "qrcode-generator";

/** The dark modules of a QR code as one SVG path, in module units (plus a 4-module quiet zone). */
export function qrPath(value: string): { d: string; size: number } {
  const q = qrcode(0, "M");
  q.addData(value);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return { d, size: n + 8 };
}

/** A QR code drawn as crisp SVG. */
export function QR({ value, size = 160, label }: { value: string; size?: number; label?: string }) {
  const { d, size: n } = qrPath(value);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label ?? "QR code"} shapeRendering="crispEdges" className="rounded-lg bg-white">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#1b1b1a" />
    </svg>
  );
}

/** Standalone SVG markup, for printing. */
export function qrSvg(value: string, size = 140): string {
  const { d, size: n } = qrPath(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
