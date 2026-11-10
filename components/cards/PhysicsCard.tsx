"use client";

import { useEffect, useRef, useState } from "react";
import { clamp, onFrame, reducedMotion, Spring } from "@/lib/spring";

export interface Slot {
  x: number;
  y: number;
  rot: number;
  scale: number;
  z: number;
}

export interface PhysicsCardProps {
  slot: Slot;
  w: number;
  h: number;
  seed: number;
  label: string;
  front: React.ReactNode;
  back?: React.ReactNode;
  faceDown?: boolean;
  locked?: boolean;
  holo?: boolean;
  idle?: boolean;
  hidden?: boolean;
  draggable?: boolean;
  /** Mount-time deal: the card flies in from `from`, face down, then flips. */
  deal?: { from: { x: number; y: number }; delay: number } | null;
  container: React.RefObject<HTMLElement | null>;
  register?: (el: HTMLElement | null) => void;
  onActivate?: (el: HTMLElement) => void;
  onLockedTap?: () => void;
  onHover?: (on: boolean) => void;
  onDragStart?: () => void;
  onDragMove?: (p: { x: number; y: number }) => void;
  onDragEnd?: (p: { x: number; y: number }) => void;
}

/**
 * A card with springy, physical motion:
 * hover lifts and tilts it toward the pointer with a moving highlight, idle cards sway gently,
 * dragging makes it lag behind the pointer and swing with velocity, release springs it home,
 * and a tap on a locked card makes it shake.
 */
export function PhysicsCard(props: PhysicsCardProps) {
  const P = useRef(props);
  P.current = props;
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const [dealing, setDealing] = useState(!!props.deal);

  const st = useRef({
    x: new Spring(props.deal?.from.x ?? props.slot.x, 220, 22),
    y: new Spring(props.deal?.from.y ?? props.slot.y, 220, 22),
    rot: new Spring(props.deal ? -14 : props.slot.rot, 200, 16),
    scale: new Spring(props.slot.scale, 320, 20),
    lift: new Spring(0, 300, 20),
    tx: new Spring(0, 260, 20),
    ty: new Spring(0, 260, 20),
    sway: new Spring(1, 60, 14),
    hover: false,
    mx: 0.5,
    my: 0.5,
    dealUntil: props.deal ? performance.now() / 1000 + props.deal.delay / 1000 : 0,
    drag: { active: false, down: false, sx: 0, sy: 0, ox: 0, oy: 0, px: 0, py: 0, lastX: 0, vx: 0 },
  });

  useEffect(() => {
    if (!props.deal) return;
    const t = setTimeout(() => setDealing(false), props.deal.delay + 260);
    return () => clearTimeout(t);
    // deal only ever runs once, at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The frame loop runs only while something is moving. When every spring has settled and the card
  // isn't swaying, it unsubscribes; hover, drag, taps, and new slot positions wake it again.
  const wake = useRef<() => void>(() => {});
  const slotKey = `${props.slot.x}|${props.slot.y}|${props.slot.rot}|${props.slot.scale}|${props.slot.z}|${props.idle}|${props.faceDown}`;
  useEffect(() => {
    wake.current();
  }, [slotKey]);

  useEffect(() => {
    const reduce = reducedMotion();
    const s = st.current;
    let off: (() => void) | null = null;
    let calm = 0;
    const tick = (dt: number, t: number) => {
      const p = P.current;
      const d = s.drag;
      let tx = p.slot.x;
      let ty = p.slot.y;
      let tr = p.slot.rot;
      let ts = p.slot.scale;
      if (t < s.dealUntil && p.deal) {
        tx = p.deal.from.x;
        ty = p.deal.from.y;
        tr = -14;
      }
      if (d.active) {
        tx = d.px - d.ox;
        ty = d.py - d.oy;
        tr = clamp(d.vx * 1.1, -18, 18);
        ts = p.slot.scale * 1.08;
        d.vx *= 0.86;
      } else if (s.hover) {
        ts = p.slot.scale * 1.07;
        tr = p.slot.rot * 0.3;
      }
      s.x.target = tx;
      s.y.target = ty;
      s.rot.target = tr;
      s.scale.target = ts;
      s.lift.target = d.active ? -10 : s.hover ? -20 : 0;
      s.tx.target = s.hover && !d.active ? -(s.my - 0.5) * 20 : 0;
      s.ty.target = d.active ? clamp(d.vx * 0.6, -14, 14) : s.hover ? (s.mx - 0.5) * 20 : 0;
      s.sway.target = p.idle && !s.hover && !d.active && !reduce ? 1 : 0;

      if (reduce) {
        for (const k of ["x", "y", "rot", "scale", "lift", "tx", "ty"] as const) s[k].snap(s[k].target);
      } else {
        s.x.step(dt); s.y.step(dt); s.rot.step(dt); s.scale.step(dt);
        s.lift.step(dt); s.tx.step(dt); s.ty.step(dt); s.sway.step(dt);
      }
      const a = s.sway.x;
      const sy = Math.sin(t * 1.25 + p.seed * 6.28) * 2.4 * a;
      const sr = Math.sin(t * 0.85 + p.seed * 9.1) * 0.9 * a;

      const o = outer.current;
      const i = inner.current;
      const sh = shadow.current;
      if (!o || !i || !sh) return;
      o.style.transform = `translate3d(${s.x.x}px, ${s.y.x + s.lift.x + sy}px, 0) rotate(${s.rot.x + sr}deg) scale(${s.scale.x})`;
      o.style.zIndex = String(d.active ? 1000 : s.hover ? 600 : p.slot.z);
      i.style.transform = `perspective(900px) rotateX(${s.tx.x}deg) rotateY(${s.ty.x}deg)`;
      const lift = -s.lift.x;
      sh.style.transform = `translate3d(${-s.ty.x * 0.5}px, ${5 + lift * 0.6}px, 0) scale(${0.96 - lift * 0.002})`;
      sh.style.opacity = String(0.22 + lift * 0.009);

      const settled =
        !d.active && !s.hover && t >= s.dealUntil && s.sway.target === 0 && Math.abs(s.sway.x) < 0.01 &&
        [s.x, s.y, s.rot, s.scale, s.lift, s.tx, s.ty].every((sp) => sp.resting);
      calm = settled ? calm + 1 : 0;
      if (calm > 6 && off) {
        off();
        off = null;
      }
    };
    wake.current = () => {
      calm = 0;
      if (!off) off = onFrame(tick);
    };
    wake.current();
    return () => off?.();
  }, []);

  function local(e: { clientX: number; clientY: number }) {
    const r = P.current.container.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    wake.current();
    const s = st.current;
    const p = local(e);
    s.drag = { ...s.drag, down: true, active: false, sx: e.clientX, sy: e.clientY, ox: p.x - s.x.x, oy: p.y - s.y.x, px: p.x, py: p.y, lastX: e.clientX, vx: 0 };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = st.current;
    if (s.hover || s.drag.down) wake.current();
    const r = outer.current?.getBoundingClientRect();
    if (r && !s.drag.active) {
      s.mx = clamp((e.clientX - r.left) / r.width, 0, 1);
      s.my = clamp((e.clientY - r.top) / r.height, 0, 1);
      inner.current?.style.setProperty("--mx", `${s.mx * 100}%`);
      inner.current?.style.setProperty("--my", `${s.my * 100}%`);
    }
    const d = s.drag;
    if (!d.down) return;
    if (!d.active && P.current.draggable && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
      d.active = true;
      outer.current?.setPointerCapture(e.pointerId);
      document.body.style.cursor = "grabbing";
      P.current.onDragStart?.();
    }
    if (d.active) {
      const p = local(e);
      d.px = p.x;
      d.py = p.y;
      d.vx = d.vx * 0.5 + (e.clientX - d.lastX) * 0.5;
      d.lastX = e.clientX;
      P.current.onDragMove?.({ x: p.x - d.ox + P.current.w / 2, y: p.y - d.oy + P.current.h / 2 });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = st.current;
    const d = s.drag;
    if (!d.down) return;
    d.down = false;
    if (d.active) {
      d.active = false;
      document.body.style.cursor = "";
      const p = local(e);
      P.current.onDragEnd?.({ x: p.x - d.ox + P.current.w / 2, y: p.y - d.oy + P.current.h / 2 });
      return;
    }
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) return;
    activate();
  }

  function activate() {
    const s = st.current;
    wake.current();
    if (P.current.locked) {
      // A quick shake says "not yet" without a dialog.
      s.rot.v += 520;
      s.x.v += 260;
      P.current.onLockedTap?.();
      return;
    }
    s.scale.v -= 2.4;
    if (outer.current) P.current.onActivate?.(outer.current);
  }

  function setHover(on: boolean) {
    const s = st.current;
    if (s.hover === on) return;
    s.hover = on;
    wake.current();
    P.current.onHover?.(on);
  }

  const faceDown = props.faceDown || dealing;

  return (
    <div
      ref={(el) => {
        outer.current = el;
        props.register?.(el);
      }}
      role="button"
      tabIndex={props.hidden ? -1 : 0}
      aria-label={props.label}
      aria-disabled={props.locked || undefined}
      className="absolute left-0 top-0 touch-none outline-none [-webkit-tap-highlight-color:transparent]"
      style={{ width: props.w, height: props.h, visibility: props.hidden ? "hidden" : "visible", cursor: props.locked ? "not-allowed" : "pointer" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
          return;
        }
        // Left/right move focus along the row or hand, in visual order.
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const box = P.current.container.current;
          if (!box) return;
          const cards = [...box.querySelectorAll<HTMLElement>(":scope > [role=button]")]
            .filter((c) => c.style.visibility !== "hidden")
            .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
          const i = cards.indexOf(e.currentTarget);
          const next = cards[i + (e.key === "ArrowRight" ? 1 : -1)];
          if (next) {
            e.preventDefault();
            next.focus({ preventScroll: true });
            next.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
          }
        }
      }}
    >
      <div ref={shadow} className="pointer-events-none absolute inset-x-2 bottom-0 top-3 rounded-[14px] bg-[rgba(20,20,18,0.55)] blur-[10px]" />
      <div ref={inner} className="card-inner relative h-full w-full [transform-style:preserve-3d]">
        <div className={`card-flip relative h-full w-full ${faceDown ? "is-down" : ""}`}>
          <div className="card-side">
            {props.front}
            <div className="card-sheen" />
            {props.holo && <div className="card-holo" />}
          </div>
          <div className="card-side card-back">{props.back}</div>
        </div>
      </div>
    </div>
  );
}
