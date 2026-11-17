/**
 * Questhand's mark: three playing cards (5 wide by 7 tall) fanned out, one in each suit's colour.
 * size is the height of one card in pixels.
 */
export function LogoMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  const h = size, w = (size * 5) / 7, r = Math.max(1.5, size * 0.14);
  const cards = [
    { rot: -16, x: -w * 0.42, fill: "#3d68a6" },
    { rot: 0, x: 0, fill: "#a0561f" },
    { rot: 16, x: w * 0.42, fill: "#9a4a8c" },
  ];
  const W = w * 2.3, H = h * 1.2;
  return (
    <svg width={W} height={H} viewBox={`${-W / 2} ${-H / 2 - h * 0.05} ${W} ${H}`} aria-hidden="true" className={`inline-block flex-none ${className}`}>
      {cards.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${h * 0.08 * Math.abs(i - 1)}) rotate(${c.rot} 0 ${h * 0.45})`}>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={r} fill={c.fill} stroke="var(--color-canvas, #f6f6f4)" strokeWidth={Math.max(1, size * 0.07)} />
        </g>
      ))}
    </svg>
  );
}

/** The mark and the name, set large and centred: the home page's title. */
export function Wordmark() {
  return (
    <div className="flex flex-col items-center gap-5">
      <LogoMark size={64} />
      <h1 className="text-[clamp(40px,8vw,64px)] font-semibold leading-none tracking-[-0.03em]">Questhand</h1>
    </div>
  );
}
