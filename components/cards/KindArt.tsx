import { hash } from "@/lib/cards";
import type { Face } from "@/lib/kinds";

/** A small seeded generator, so a card's picture is the same every time and no two cards are exactly alike. */
function rng(seed: number) {
  let a = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The picture on a card with no media of its own: a drawing of what the card is (a page of text, a framed picture,
 * a player, a web page, a microphone; a page and pencil, ticked options, a bar chart, speech bubbles, a stack of cards), in its
 * family's colours, with small seeded variations so every card is its own.
 */
export function KindArt({ id, face, tint, cover }: { id: string; face: Face; tint: string; cover: string }) {
  const r = rng(hash(id) + 0.0007);
  const j = (n: number) => (r() - 0.5) * n; // jitter
  const ink = "#1b1b1a";
  const soft = `${tint}33`;
  const mid = `${tint}88`;
  let art: React.ReactNode = null;

  switch (face) {
    case "text": {
      const lines = [0, 1, 2, 3, 4].map((i) => 30 + r() * 40 - (i === 4 ? 20 : 0));
      art = (
        <g>
          <rect x="34" y="16" width="72" height="70" rx="6" fill="#fff" stroke={mid} />
          <text x="42" y="44" fontSize="26" fontWeight="700" fontFamily="Georgia, serif" fill={tint}>A</text>
          {lines.map((w, i) => <rect key={i} x={i < 2 ? 60 : 42} y={28 + i * 10.5} width={i < 2 ? Math.min(w, 38) : w} height="4" rx="2" fill={i < 2 ? mid : soft} />)}
        </g>
      );
      break;
    }
    case "table": {
      // A table that adds up, with its chart.
      const bars = [0, 1, 2].map(() => 10 + r() * 22);
      art = (
        <g>
          <rect x="18" y="16" width="70" height="68" rx="6" fill="#fff" stroke={mid} />
          <path d="M18 22a6 6 0 0 1 6 -6h58a6 6 0 0 1 6 6v8H18z" fill={soft} />
          {[30, 43, 56, 69].map((y) => <line key={y} x1="18" x2="88" y1={y} y2={y} stroke={soft} strokeWidth="1.2" />)}
          <line x1="50" x2="50" y1="16" y2="84" stroke={soft} strokeWidth="1.2" />
          {[0, 1, 2].map((i) => <rect key={i} x="24" y={35 + i * 13} width={12 + r() * 12} height="3.5" rx="1.75" fill={mid} />)}
          {[0, 1, 2].map((i) => <rect key={i} x={70 - bars[i] / 2} y={35 + i * 13} width={bars[i] / 2 + 8} height="3.5" rx="1.75" fill={soft} />)}
          <text x="24" y="79.5" fontSize="8" fontWeight="700" fill={tint}>Σ</text>
          <rect x="62" y="75" width="18" height="4" rx="2" fill={tint} />
          <rect x="96" y="30" width="30" height="54" rx="5" fill="#fff" stroke={mid} />
          {bars.map((h, i) => <rect key={i} x={101 + i * 8.5} y={78 - h} width="6" height={h} rx="1.5" fill={tint} opacity={0.45 + i * 0.2} />)}
        </g>
      );
      break;
    }
    case "file": {
      art = (
        <g>
          <path d="M44 14h38l16 16v56a4 4 0 0 1 -4 4H44a4 4 0 0 1 -4 -4V18a4 4 0 0 1 4 -4z" fill="#fff" stroke={mid} />
          <path d="M82 14v12a4 4 0 0 0 4 4h12" fill={soft} stroke={mid} />
          {[0, 1, 2, 3].map((i) => <rect key={i} x="48" y={38 + i * 9} width={20 + r() * 22} height="4" rx="2" fill={soft} />)}
          <rect x="30" y="66" width="34" height="14" rx="3" fill={tint} />
          <rect x="36" y="71" width="22" height="4" rx="2" fill="#fff" />
        </g>
      );
      break;
    }
    case "worksheet": {
      // A page to fill in: blanks to write on and a table with empty cells, one being typed in.
      art = (
        <g>
          <rect x="30" y="12" width="80" height="78" rx="5" fill="#fff" stroke={mid} />
          <rect x="38" y="20" width="36" height="5" rx="2.5" fill={tint} opacity="0.8" />
          {[0, 1].map((i) => (
            <g key={i}>
              <rect x="38" y={33 + i * 11} width="18" height="3.5" rx="1.75" fill={mid} />
              <line x1="59" x2="102" y1={36.5 + i * 11} y2={36.5 + i * 11} stroke={mid} strokeWidth="1.2" strokeDasharray="2.5 2" />
            </g>
          ))}
          <rect x="62" y={30 + j(1)} width={14 + r() * 12} height="3.5" rx="1.75" fill={tint} opacity="0.75" />
          <rect x="38" y="56" width="64" height="27" rx="3" fill="none" stroke={mid} />
          <line x1="38" x2="102" y1="65" y2="65" stroke={mid} />
          <line x1="38" x2="102" y1="74" y2="74" stroke={soft} />
          <line x1="66" x2="66" y1="56" y2="83" stroke={mid} />
          <rect x="70" y="67.5" width="14" height="4" rx="2" fill={tint} opacity="0.7" />
          <rect x="85.5" y="66" width="1.6" height="7" fill={ink} />
        </g>
      );
      break;
    }
    case "doc": {
      // One page, written by several people at once: their cursors, each with a name flag.
      const people = ["#3d7bd8", "#d9822b", "#2f8a55"];
      art = (
        <g>
          <rect x="30" y="14" width="80" height="76" rx="5" fill="#fff" stroke={mid} />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x="38" y={26 + i * 11} width={i === 4 ? 26 : 40 + r() * 24} height="4" rx="2" fill={i < 2 ? mid : soft} />)}
          {[[74, 30, 0], [58, 52, 1], [70, 63, 2]].map(([x, y, c]) => (
            <g key={c}>
              <rect x={x} y={y - 6} width="1.8" height="11" fill={people[c]} />
              <rect x={x} y={y - 12} width="14" height="6" rx="1.5" fill={people[c]} />
            </g>
          ))}
          {people.map((c, i) => <circle key={i} cx={98 - i * 9} cy="14" r="5.5" fill={c} stroke="#fff" strokeWidth="1.6" />)}
        </g>
      );
      break;
    }
    case "image": {
      const sun = { x: 88 + j(10), y: 32 + j(6) };
      art = (
        <g>
          <rect x="28" y="16" width="84" height="66" rx="6" fill="#fff" stroke={mid} />
          <rect x="34" y="22" width="72" height="54" rx="3" fill={soft} />
          <circle cx={sun.x} cy={sun.y} r="7" fill="#fff" />
          <path d={`M34 76 L${54 + j(8)} ${50 + j(6)} L${68 + j(6)} 62 L${80 + j(6)} ${46 + j(6)} L106 76 Z`} fill={tint} opacity="0.75" />
          <path d={`M34 76 L${48 + j(6)} 62 L${62 + j(6)} 76 Z`} fill={tint} opacity="0.45" />
        </g>
      );
      break;
    }
    case "link": {
      const rows = [0, 1, 2].map(() => 26 + r() * 30);
      art = (
        <g>
          <rect x="26" y="16" width="88" height="68" rx="7" fill="#fff" stroke={mid} />
          <path d="M26 23a7 7 0 0 1 7 -7h74a7 7 0 0 1 7 7v7H26z" fill={soft} />
          {[0, 1, 2].map((i) => <circle key={i} cx={34 + i * 6} cy="23" r="1.8" fill={mid} />)}
          <rect x="56" y="20" width="50" height="6" rx="3" fill="#fff" />
          {rows.map((w, i) => <rect key={i} x="34" y={40 + i * 9} width={w} height="4" rx="2" fill={soft} />)}
          <g transform={`translate(${86 + j(4)} ${62 + j(3)}) rotate(-40)`} fill="none" stroke={tint} strokeWidth="3.2" strokeLinecap="round">
            <rect x="-13" y="-5" width="14" height="10" rx="5" />
            <rect x="-1" y="-5" width="14" height="10" rx="5" />
          </g>
        </g>
      );
      break;
    }
    case "video": {
      art = (
        <g>
          <rect x="24" y="22" width="92" height="56" rx="8" fill={ink} opacity="0.88" />
          <rect x="24" y="22" width="92" height="56" rx="8" fill={tint} opacity="0.35" />
          <circle cx="70" cy="48" r="12" fill="#fff" opacity="0.95" />
          <path d="M66 41.5v13l10.5-6.5z" fill={ink} />
          <rect x="32" y="68" width="76" height="3" rx="1.5" fill="#fff" opacity="0.3" />
          <rect x="32" y="68" width={22 + r() * 40} height="3" rx="1.5" fill="#fff" opacity="0.9" />
        </g>
      );
      break;
    }
    case "recording": {
      const bars = Array.from({ length: 13 }, (_, i) => 6 + Math.abs(Math.sin(i * 1.3 + r() * 6)) * 20);
      art = (
        <g>
          <rect x="58" y="18" width="24" height="38" rx="12" fill="#fff" stroke={mid} strokeWidth="1.5" />
          <rect x="63" y="24" width="14" height="4" rx="2" fill={soft} />
          <rect x="63" y="31" width="14" height="4" rx="2" fill={soft} />
          <path d="M52 44a18 18 0 0 0 36 0" fill="none" stroke={tint} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M70 62v8" stroke={tint} strokeWidth="2.2" strokeLinecap="round" />
          {bars.slice(0, 12).map((h, i) => <rect key={i} x={i < 6 ? 18 + i * 6 : 90 + (i - 6) * 6} y={40 - h / 2} width="3.2" height={h} rx="1.6" fill={tint} opacity="0.5" />)}
          <circle cx="22" cy="14" r="3.5" fill="#d64545" />
          <text x="29" y="16.6" fontSize="7" fontWeight="700" fill="#d64545" letterSpacing="0.5">REC</text>
        </g>
      );
      break;
    }
    case "answer": {
      art = (
        <g>
          <rect x="30" y="14" width="66" height="74" rx="5" fill="#fff" stroke={mid} />
          {[0, 1, 2, 3, 4].map((i) => <line key={i} x1="38" x2="88" y1={30 + i * 11} y2={30 + i * 11} stroke={soft} strokeWidth="1.4" />)}
          <path d={`M40 ${37 + j(2)} q8 -6 16 0 t16 0 t12 -2`} fill="none" stroke={tint} strokeWidth="2" strokeLinecap="round" />
          <path d={`M40 ${48 + j(2)} q6 -5 12 0 t14 1`} fill="none" stroke={tint} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <g transform={`rotate(${38 + j(8)} 98 54)`}>
            <rect x="92" y="22" width="9" height="48" rx="2" fill={tint} />
            <path d="M92 70h9l-4.5 9z" fill="#f2d3b5" />
            <rect x="92" y="22" width="9" height="6" rx="2" fill={ink} opacity="0.75" />
          </g>
        </g>
      );
      break;
    }
    case "choice": {
      const right = Math.floor(r() * 3);
      art = (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="26" y={18 + i * 22} width="88" height="17" rx="8.5" fill="#fff" stroke={i === right ? "#2f8a55" : mid} strokeWidth={i === right ? 1.6 : 1} />
              <circle cx="36" cy={26.5 + i * 22} r="4.5" fill={i === right ? "#2f8a55" : "#fff"} stroke={i === right ? "#2f8a55" : mid} />
              {i === right && <path d={`M33.8 ${26.6 + i * 22}l1.6 1.6 3-3.2`} fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />}
              <rect x="46" y={24.5 + i * 22} width={24 + r() * 34} height="4" rx="2" fill={i === right ? "#2f8a5555" : soft} />
            </g>
          ))}
        </g>
      );
      break;
    }
    case "checkboxes": {
      // Pick all that apply: square boxes, more than one ticked.
      const off = Math.floor(r() * 3);
      const on = [0, 1, 2].map((i) => i !== off);
      art = (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="26" y={18 + i * 22} width="88" height="17" rx="5" fill="#fff" stroke={on[i] ? "#2f8a55" : mid} strokeWidth={on[i] ? 1.6 : 1} />
              <rect x="31.5" y={22 + i * 22} width="9" height="9" rx="2" fill={on[i] ? "#2f8a55" : "#fff"} stroke={on[i] ? "#2f8a55" : mid} />
              {on[i] && <path d={`M33.6 ${26.6 + i * 22}l1.8 1.8 3.2-3.4`} fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />}
              <rect x="46" y={24.5 + i * 22} width={24 + r() * 34} height="4" rx="2" fill={on[i] ? "#2f8a5555" : soft} />
            </g>
          ))}
        </g>
      );
      break;
    }
    case "order": {
      // Put in order: numbered rows with handles, one lifted mid-move.
      art = (
        <g>
          {[0, 1, 2].map((i) => {
            const lift = i === 1;
            return (
              <g key={i} transform={lift ? `translate(${6 + j(2)} -3) rotate(-2.5 70 ${26 + i * 22})` : undefined}>
                <rect x="26" y={18 + i * 22} width="88" height="17" rx="5" fill="#fff" stroke={lift ? tint : mid} strokeWidth={lift ? 1.6 : 1} style={lift ? { filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.12))" } : undefined} />
                <rect x="30.5" y={21 + i * 22} width="11" height="11" rx="3" fill={lift ? tint : soft} />
                <text x="36" y={29.2 + i * 22} fontSize="7.5" fontWeight="700" textAnchor="middle" fill={lift ? "#fff" : tint}>{i + 1}</text>
                <rect x="47" y={24.5 + i * 22} width={22 + r() * 30} height="4" rx="2" fill={soft} />
                {[0, 1, 2].map((k) => <g key={k}><circle cx="104" cy={22.5 + i * 22 + k * 4} r="1.1" fill={mid} /><circle cx="108" cy={22.5 + i * 22 + k * 4} r="1.1" fill={mid} /></g>)}
              </g>
            );
          })}
        </g>
      );
      break;
    }
    case "short": {
      // A question and a box with the answer being typed.
      art = (
        <g>
          <rect x="24" y="22" width={50 + r() * 30} height="5" rx="2.5" fill={mid} />
          <rect x="24" y="32" width={30 + r() * 20} height="5" rx="2.5" fill={soft} />
          <rect x="24" y="50" width="92" height="24" rx="6" fill="#fff" stroke={tint} strokeWidth="1.6" />
          <rect x="31" y="60" width={22 + r() * 18} height="5" rx="2.5" fill={tint} opacity="0.75" />
          <rect x={58 + 18} y="56" width="1.8" height="13" fill={ink} />
        </g>
      );
      break;
    }
    case "quiz": {
      // Several questions in a stack, and a score.
      art = (
        <g>
          {[2, 1].map((k) => <rect key={k} x={30 + k * 5} y={14 + k * 4} width="70" height="70" rx="6" fill="#fff" stroke={mid} opacity={1 - k * 0.25} />)}
          <rect x="30" y="14" width="70" height="70" rx="6" fill="#fff" stroke={mid} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx="41" cy={34 + i * 15} r="4" fill={i === 1 ? "#2f8a55" : "#fff"} stroke={i === 1 ? "#2f8a55" : mid} />
              <rect x="49" y={32 + i * 15} width={18 + r() * 22} height="4" rx="2" fill={i === 1 ? "#2f8a5555" : soft} />
            </g>
          ))}
          <rect x="38" y="20" width="34" height="4" rx="2" fill={mid} />
          <circle cx="104" cy="70" r="15" fill={tint} />
          <text x="104" y="73.5" fontSize="10" fontWeight="700" textAnchor="middle" fill="#fff">{3 + Math.floor(r() * 2)}/4</text>
        </g>
      );
      break;
    }
    case "signup": {
      // Groups to pick from: each a box with its members, one more joining.
      const n = [2, 3, 1];
      const people = ["#3d7bd8", "#d9822b", "#2f8a55", "#8a5cc2", "#c2475c", "#4b9aa8"];
      let p = 0;
      art = (
        <g>
          {[0, 1, 2].map((g) => (
            <g key={g}>
              <rect x={20 + g * 35} y="30" width="30" height="54" rx="6" fill="#fff" stroke={mid} />
              <rect x={20 + g * 35} y="30" width="30" height="9" rx="4" fill={soft} />
              {Array.from({ length: n[g] }, (_, k) => <circle key={k} cx={35 + g * 35} cy={49 + k * 11} r="4" fill={people[p++ % people.length]} />)}
            </g>
          ))}
          <path d={`M${100 + j(4)} 16 q-12 4 -15 ${32 + j(3)}`} fill="none" stroke={tint} strokeWidth="1.4" strokeDasharray="2.5 2.5" />
          <circle cx="102" cy="15" r="4.5" fill={people[5]} stroke="#fff" strokeWidth="1.4" />
        </g>
      );
      break;
    }
    case "poll": {
      const vals = [0, 1, 2, 3].map(() => 0.25 + r() * 0.75);
      const top = vals.indexOf(Math.max(...vals));
      art = (
        <g>
          <line x1="28" x2="112" y1="80" y2="80" stroke={mid} strokeWidth="1.4" />
          {vals.map((v, i) => (
            <rect key={i} x={34 + i * 20} y={80 - v * 58} width="13" height={v * 58} rx="3" fill={tint} opacity={i === top ? 0.9 : 0.4} />
          ))}
          <circle cx={40.5 + top * 20} cy={80 - vals[top] * 58 - 8} r="3.5" fill={tint} />
        </g>
      );
      break;
    }
    case "discussion": {
      art = (
        <g>
          <path d={`M24 ${24 + j(4)} h52 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-30 l-10 9 v-9 h-6 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6z`} fill="#fff" stroke={mid} />
          {[0, 1, 2].map((i) => <circle key={i} cx={40 + i * 12} cy={40} r="3" fill={mid} />)}
          <path d={`M60 ${48 + j(4)} h50 a6 6 0 0 1 6 6 v18 a6 6 0 0 1 -6 6 h-6 v8 l-10 -8 h-28 a6 6 0 0 1 -6 -6 v-18 a6 6 0 0 1 6 -6z`} fill={tint} opacity="0.85" />
          <rect x="68" y="60" width="34" height="4" rx="2" fill="#fff" opacity="0.85" />
          <rect x="68" y="68" width="22" height="4" rx="2" fill="#fff" opacity="0.6" />
        </g>
      );
      break;
    }
    case "group": {
      art = (
        <g>
          {[-14, 0, 14].map((rot, i) => (
            <g key={i} transform={`rotate(${rot + j(3)} 70 92)`}>
              <rect x="52" y="20" width="36" height="52" rx="5" fill="#fff" stroke={mid} />
              <rect x="57" y="26" width="26" height="16" rx="2" fill={i === 1 ? tint : soft} opacity={i === 1 ? 0.6 : 1} />
              <rect x="57" y="48" width="20" height="3" rx="1.5" fill={soft} />
            </g>
          ))}
        </g>
      );
      break;
    }
    default: {
      const never: never = face;
      void never;
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden" aria-hidden="true">
      <div className="absolute inset-[-30%] blur-[16px]" style={{ background: cover }} />
      <svg viewBox="0 0 140 100" preserveAspectRatio="xMidYMid meet" className="relative h-full w-full">{art}</svg>
    </div>
  );
}
