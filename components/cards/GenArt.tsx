import { hash } from "@/lib/cards";

/** Small seeded random generator so every card gets the same art every time. */
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
 * Generated artwork for cards without media: one of a few motifs (orbs, waves, rings, steps, dots),
 * laid out from the card id in the card type's color. No two cards look the same.
 */
export function GenArt({ id, tint, cover }: { id: string; tint: string; cover: string }) {
  const r = rng(hash(id) + 0.0001);
  const motif = Math.floor(r() * 5);
  const pick = (lo: number, hi: number) => lo + r() * (hi - lo);
  const shapes: React.ReactNode[] = [];

  if (motif === 0) {
    for (let i = 0; i < 4; i++) {
      shapes.push(<circle key={i} cx={pick(10, 90)} cy={pick(10, 55)} r={pick(8, 22)} fill={tint} opacity={pick(0.12, 0.32)} />);
    }
    shapes.push(<circle key="c" cx={pick(30, 70)} cy={pick(20, 40)} r={pick(5, 9)} fill="#fff" opacity={0.9} />);
  } else if (motif === 1) {
    for (let i = 0; i < 4; i++) {
      const y = 12 + i * 11 + pick(-3, 3);
      const amp = pick(3, 8);
      const ph = pick(0, 40);
      shapes.push(<path key={i} d={`M-5 ${y} C ${20 + ph * 0.2} ${y - amp}, ${45 - ph * 0.1} ${y + amp}, 60 ${y} S 95 ${y - amp}, 110 ${y}`} fill="none" stroke={tint} strokeWidth={pick(1.6, 3.2)} strokeLinecap="round" opacity={pick(0.25, 0.6)} />);
    }
  } else if (motif === 2) {
    const cx = pick(20, 80);
    const cy = pick(15, 45);
    for (let i = 0; i < 5; i++) shapes.push(<circle key={i} cx={cx} cy={cy} r={6 + i * 7} fill="none" stroke={tint} strokeWidth={1.4} opacity={0.5 - i * 0.07} />);
    shapes.push(<circle key="d" cx={cx} cy={cy} r={3.5} fill={tint} opacity={0.7} />);
  } else if (motif === 3) {
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const h = pick(10, 45);
      shapes.push(<rect key={i} x={8 + i * (84 / n)} y={58 - h} width={84 / n - 3} height={h} rx={2} fill={tint} opacity={pick(0.18, 0.45)} />);
    }
  } else {
    const step = pick(8, 11);
    const ox = pick(0, step);
    for (let x = ox; x < 100; x += step) for (let y = 6; y < 60; y += step) {
      const d = Math.hypot(x - 50, y - 30);
      shapes.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={Math.max(0.6, 2.6 - d / 22)} fill={tint} opacity={0.45} />);
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-[-30%] blur-[16px]" style={{ background: cover }} />
      <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" className="relative h-full w-full" aria-hidden="true">{shapes}</svg>
    </div>
  );
}
