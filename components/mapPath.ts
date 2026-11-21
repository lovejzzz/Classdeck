/** A path through the given points with rounded corners (the right-angle wires on both maps). */
export function elbow(pts: { x: number; y: number }[], r = 12) {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p, c, n] = [pts[i - 1], pts[i], pts[i + 1]];
    const k = Math.min(r, Math.hypot(c.x - p.x, c.y - p.y) / 2, Math.hypot(n.x - c.x, n.y - c.y) / 2);
    const u = (q: { x: number; y: number }) => { const l = Math.hypot(q.x - c.x, q.y - c.y) || 1; return { x: c.x + ((q.x - c.x) / l) * k, y: c.y + ((q.y - c.y) / l) * k }; };
    const a = u(p), b = u(n);
    d += ` L ${a.x} ${a.y} Q ${c.x} ${c.y}, ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}
