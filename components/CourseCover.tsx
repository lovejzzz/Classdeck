import { coverOf } from "@/lib/coverlib";
import type { Course } from "@/lib/types";

/**
 * A course's cover: its picture, or a paper-cut scene (one motif in one colour, cut from paper like the cards' pictures),
 * tilted and scattered a little differently for each course. Drawn without filters, so it costs nothing to show many.
 */
export function CourseCover({ c, className = "" }: { c: { id: string; title: string; subtitle?: string; cover?: Course["cover"] }; className?: string }) {
  const v = coverOf(c);
  if (v.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={v.image} alt="" draggable={false} className={`h-full w-full object-cover ${className}`} title={v.credit} />;
  }
  return <PaperCover motif={v.motif} color={v.color} seed={v.seed} className={className} />;
}

export function PaperCover({ motif, color, seed = 0, className = "" }: { motif: string; color: string; seed?: number; className?: string }) {
  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`} style={{ background: mix(color, "#ffffff", 0.88) }} aria-hidden="true">
      <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" dangerouslySetInnerHTML={{ __html: scene(motif, color, seed) }} />
    </div>
  );
}

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  if (A.some(Number.isNaN)) return a;
  return "#" + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, "0")).join("");
}
function rng(seed: number) {
  let a = (seed * 9301 + 49297) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CREAM = "#fffdf8";
/** A cut-out with its shadow: the same shapes, darker, a little lower. */
const cut = (s: string, dy = 1.5) => `<g transform="translate(0 ${dy})" opacity=".15">${s.replace(/fill="[^"]*"/g, 'fill="#46300f"').replace(/stroke="(?!none)[^"]*"/g, 'stroke="#46300f"')}</g>${s}`;
const rot = (d: number, cx: number, cy: number, s: string) => `<g transform="rotate(${d.toFixed(2)} ${cx} ${cy})">${s}</g>`;

function scene(motif: string, t: string, seed: number): string {
  const r = rng(seed + 1);
  const deep = t, mid = mix(t, "#ffffff", 0.35), soft = mix(t, "#ffffff", 0.58), pale = mix(t, "#ffffff", 0.76);
  const tilt = r() * 8 - 4;
  const sun = "#f2c46b";
  // Hills along the bottom, cut from two shades: every scene stands on them.
  const hills = (h = 74) => cut(`<path d="M0 ${h}q40-${12 + r() * 8} 80 0t80 0v${100 - h}H0z" fill="${pale}"/>`) + cut(`<path d="M0 ${h + 10}q${40 + r() * 20}-14 100 0t60-4v${90 - h}H0z" fill="${soft}"/>`);
  const scraps = () => Array.from({ length: 4 }, (_, i) => {
    const x = 6 + r() * 148, y = 6 + r() * 60;
    if (x > 36 && x < 124) return "";
    return rot(r() * 90, x, y, `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(3 + r() * 4).toFixed(1)}" height="2.4" fill="${[mid, soft, sun, deep][i]}"/>`);
  }).join("");
  let s = "";
  switch (motif) {
    case "leaf":
      s = cut(`<circle cx="${112 + r() * 16}" cy="26" r="11" fill="${sun}"/>`) + hills()
        + rot(tilt, 70, 50, cut(`<path d="M60 74c-14-22 4-44 26-46 2 22-8 42-26 46z" fill="${deep}"/>`) + `<path d="M60 74c6-14 14-26 24-42" stroke="${CREAM}" stroke-width="1.4" fill="none"/>`)
        + cut(`<path d="M88 78c0-14 10-22 22-22-1 14-10 22-22 22z" fill="${mid}"/>`);
      break;
    case "flask":
      s = hills(80) + rot(tilt, 80, 52, cut(`<path d="M72 18h16v20l18 34a6 6 0 0 1-5 9H59a6 6 0 0 1-5-9l18-34z" fill="${CREAM}"/>`, 2.2) + `<path d="M62 62h36l7 12a4 4 0 0 1-4 6H59a4 4 0 0 1-4-6z" fill="${deep}"/><rect x="70" y="15" width="20" height="5" rx="2" fill="${mid}"/>`)
        + [0, 1, 2].map((i) => `<circle cx="${84 + i * 8 + r() * 4}" cy="${44 - i * 9}" r="${2.4 + i}" fill="${soft}"/>`).join("");
      break;
    case "atom":
      s = rot(tilt, 80, 48, [0, 60, 120].map((a) => cut(`<ellipse cx="80" cy="48" rx="34" ry="12" fill="none" stroke="${a ? mid : deep}" stroke-width="3" transform="rotate(${a} 80 48)"/>`)).join("") + cut(`<circle cx="80" cy="48" r="8" fill="${sun}"/>`))
        + [0, 1, 2].map(() => `<circle cx="${20 + r() * 120}" cy="${8 + r() * 84}" r="1.6" fill="${soft}"/>`).join("");
      break;
    case "code":
      s = rot(tilt * 0.6, 80, 50, cut(`<rect x="36" y="18" width="88" height="64" rx="5" fill="#2a2a28"/>`, 2.5) + `<rect x="36" y="18" width="88" height="10" rx="5" fill="#3a3a37"/>`
        + [0, 1, 2].map((i) => `<circle cx="${43 + i * 6}" cy="23" r="1.8" fill="${["#e65b4f", "#e7c26a", "#6fbf73"][i]}"/>`).join("")
        + `<text x="44" y="44" font-size="9" fill="#e7c26a" font-family="Menlo,monospace">&lt;/&gt;</text>` + [0, 1, 2, 3].map((i) => `<rect x="${52 + (i % 2) * 6}" y="${50 + i * 7}" width="${[40, 28, 34, 20][i]}" height="3" rx="1.5" fill="${[soft, "#e7c26a", "#9bd1a8", soft][i]}"/>`).join(""))
        + cut(`<path d="M114 64c10 0 14 8 10 14s-14 4-14 12" stroke="${deep}" stroke-width="6" fill="none" stroke-linecap="round"/>`);
      break;
    case "speech":
      s = cut(`<circle cx="${124 + r() * 10}" cy="22" r="9" fill="${sun}"/>`)
        + rot(tilt - 4, 60, 44, cut(`<path d="M30 24h56a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H52l-12 10V60h-10a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8z" fill="${deep}"/>`) + [0, 1].map((i) => `<rect x="34" y="${34 + i * 9}" width="${[44, 30][i]}" height="3.4" rx="1.7" fill="${CREAM}"/>`).join(""))
        + rot(tilt + 3, 104, 62, cut(`<path d="M80 50h48a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8h-6v10l-12-10H80a8 8 0 0 1-8-8V58a8 8 0 0 1 8-8z" fill="${CREAM}"/>`) + [0, 1, 2].map((i) => `<circle cx="${94 + i * 10}" cy="66" r="3" fill="${mid}"/>`).join(""));
      break;
    case "mic":
      s = cut(`<path d="M0 82h160v18H0z" fill="${soft}"/>`) + cut(`<path d="M20 0l18 82H2z" fill="${pale}" opacity=".7"/><path d="M140 0l18 82h-36z" fill="${pale}" opacity=".7"/>`, 0)
        + rot(tilt, 80, 50, cut(`<rect x="70" y="16" width="20" height="34" rx="10" fill="${deep}"/>`) + `<path d="M64 40a16 16 0 0 0 32 0" stroke="${mid}" stroke-width="3" fill="none"/><rect x="78.5" y="56" width="3" height="22" fill="${mid}"/><rect x="68" y="78" width="24" height="4" rx="2" fill="${mid}"/>`
        + [0, 1, 2].map((i) => `<rect x="${73}" y="${22 + i * 7}" width="14" height="2.4" rx="1.2" fill="${mix(t, "#ffffff", 0.2)}"/>`).join(""));
      break;
    case "pen":
      s = rot(tilt - 3, 72, 52, cut(`<rect x="40" y="16" width="64" height="72" rx="3" fill="${CREAM}"/>`, 2.5) + `<text x="48" y="44" font-size="30" font-weight="800" fill="${deep}" font-family="Georgia,serif">“</text>` + [0, 1, 2, 3].map((i) => `<rect x="50" y="${50 + i * 8}" width="${[42, 46, 36, 24][i]}" height="3" rx="1.5" fill="${soft}"/>`).join(""))
        + rot(38, 116, 52, cut(`<rect x="111" y="18" width="10" height="58" rx="1.5" fill="${deep}"/><path d="M111 76l5 11 5-11z" fill="#e9cfa6"/>`));
      break;
    case "gear":
      s = cut(`<path d="M50 78a26 26 0 1 1 52 0z" fill="${soft}"/>`)
        + rot(tilt * 3, 76, 50, cut(`<g transform="translate(76 50)"><circle r="17" fill="${deep}"/>${Array.from({ length: 8 }, (_, i) => `<rect x="-4" y="-23" width="8" height="10" rx="1.5" fill="${deep}" transform="rotate(${i * 45})"/>`).join("")}<circle r="6.5" fill="${CREAM}"/></g>`))
        + cut(`<rect x="114" y="24" width="2.4" height="52" fill="#5a4a36"/><path d="M116 25h22l-6 7 6 7h-22z" fill="#d2483c"/>`) + `<rect x="18" y="78" width="124" height="4" rx="2" fill="${deep}"/>`;
      break;
    case "globe":
      s = hills(84) + rot(tilt * 2, 80, 46, cut(`<circle cx="80" cy="46" r="28" fill="${mid}"/>`) + `<path d="M62 32c8 2 12 8 8 14s4 10 10 8M84 22c-2 6 4 10 10 8s8 6 6 12M70 66c4-6 12-4 14-10" stroke="${CREAM}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".9"/>`)
        + cut(`<path d="M52 46a28 28 0 0 0 56 0" stroke="${deep}" stroke-width="2.5" fill="none"/>`);
      break;
    case "shapes":
      s = rot(tilt, 56, 54, cut(`<path d="M40 76l18-34 18 34z" fill="${deep}"/>`)) + cut(`<circle cx="98" cy="40" r="15" fill="${sun}"/>`) + rot(-tilt * 2, 106, 66, cut(`<rect x="94" y="54" width="24" height="24" rx="2" fill="${mid}"/>`))
        + `<text x="70" y="32" font-size="14" font-weight="800" fill="${soft}" font-family="Georgia,serif">+</text><text x="122" y="30" font-size="12" font-weight="800" fill="${soft}" font-family="Georgia,serif">=</text>`;
      break;
    case "chart":
      s = cut(`<rect x="34" y="18" width="92" height="64" rx="4" fill="${CREAM}"/>`, 2.5) + [0, 1, 2, 3].map((i) => {
        const h = 14 + i * 9 + r() * 6;
        return `<rect x="${46 + i * 18}" y="${74 - h}" width="11" height="${h.toFixed(1)}" rx="1.5" fill="${[soft, mid, mid, deep][i]}"/>`;
      }).join("") + `<path d="M46 52l18-8 18 4 22-18" stroke="${sun}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case "notes":
      s = hills(82) + rot(tilt, 80, 46, cut(`<path d="M62 64V26l40-8v38" stroke="${deep}" stroke-width="4" fill="none"/><ellipse cx="56" cy="64" rx="8" ry="6" fill="${deep}"/><ellipse cx="96" cy="56" rx="8" ry="6" fill="${deep}"/><path d="M62 30l40-8" stroke="${deep}" stroke-width="7"/>`))
        + cut(`<path d="M118 40v18" stroke="${mid}" stroke-width="3"/><ellipse cx="114" cy="58" rx="5" ry="4" fill="${mid}"/>`);
      break;
    case "brush":
      s = rot(tilt, 70, 52, cut(`<path d="M44 56c0-20 18-34 38-34s34 12 34 26-12 12-20 12-10 8-18 14-34 6-34-18z" fill="${CREAM}"/>`, 2.2)
        + [[60, 40, "#d2483c"], [76, 34, sun], [92, 38, "#3f7a52"], [64, 56, deep]].map(([x, y, f]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="${f}"/>`).join(""))
        + rot(-40, 116, 56, cut(`<rect x="112" y="30" width="7" height="44" rx="2" fill="${mid}"/><path d="M110 74h11l-2 12h-7z" fill="${deep}"/>`));
      break;
    case "heart":
      s = hills(80) + rot(tilt, 80, 46, cut(`<path d="M80 72S50 54 50 36a14 14 0 0 1 30-6 14 14 0 0 1 30 6c0 18-30 36-30 36z" fill="${deep}"/>`) + `<path d="M58 44h10l4-8 6 16 4-8h12" stroke="${CREAM}" stroke-width="2.4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`);
      break;
    default: // book
      s = hills(82) + rot(tilt, 80, 50, cut(`<path d="M80 30c-10-6-24-8-38-6v48c14-2 28 0 38 6z" fill="${CREAM}"/><path d="M80 30c10-6 24-8 38-6v48c-14-2-28 0-38 6z" fill="${pale}"/>`, 2.2)
        + [0, 1, 2].map((i) => `<rect x="${50}" y="${36 + i * 9}" width="22" height="2.6" rx="1.3" fill="${soft}"/><rect x="${88}" y="${36 + i * 9}" width="22" height="2.6" rx="1.3" fill="${mid}"/>`).join("") + `<rect x="78.6" y="30" width="2.8" height="48" fill="${deep}"/>`);
  }
  return s + scraps();
}
