// A tiny damped-spring integrator plus one shared animation clock.
// Every card runs on the same rAF loop so motion stays in lockstep and cheap.

export class Spring {
  v = 0;
  target: number;
  constructor(public x: number, public k = 240, public c = 22) {
    this.target = x;
  }
  step(dt: number) {
    const a = -this.k * (this.x - this.target) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
  snap(x: number) {
    this.x = x;
    this.target = x;
    this.v = 0;
  }
  get resting() {
    return Math.abs(this.v) < 0.02 && Math.abs(this.x - this.target) < 0.02;
  }
}

type Tick = (dt: number, t: number) => void;
const subs = new Set<Tick>();
let raf = 0;
let last = 0;

function loop(now: number) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  // Two half-steps keep stiff springs stable at low frame rates.
  const t = now / 1000;
  subs.forEach((f) => {
    f(dt / 2, t);
    f(dt / 2, t);
  });
  raf = subs.size ? requestAnimationFrame(loop) : 0;
}

export function onFrame(f: Tick) {
  subs.add(f);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  return () => {
    subs.delete(f);
  };
}

export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
