"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

const COLORS = ["#1b1b1a", "#c25a35", "#2f9e5b", "#3d7ea6", "#6a5ac0", "#d39b1f"];
const SIZES = [2, 5, 12];

/** A small drawing board: pens, an eraser, undo, and clear. Saves as a PNG. */
export function SketchPad({ onKeep, onCancel }: { onKeep: (file: File) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [eraser, setEraser] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const drawing = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const point = (e: React.PointerEvent) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  function down(e: React.PointerEvent) {
    const c = canvas.current!;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext("2d")!;
    setHistory((h) => [...h.slice(-19), ctx.getImageData(0, 0, c.width, c.height)]);
    drawing.current = point(e);
    move(e);
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    const pressure = e.pointerType === "pen" ? 0.4 + e.pressure : 1;
    ctx.strokeStyle = eraser ? "#fff" : color;
    ctx.lineWidth = (eraser ? size * 3 : size) * pressure * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(drawing.current.x, drawing.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawing.current = p;
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    canvas.current!.getContext("2d")!.putImageData(last, 0, 0);
    setHistory((h) => h.slice(0, -1));
  }

  function clear() {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    setHistory((h) => [...h.slice(-19), ctx.getImageData(0, 0, c.width, c.height)]);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }

  return (
    <div className="rise overflow-hidden rounded-xl border border-line bg-[#fafaf9]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        {COLORS.map((c) => (
          <button key={c} onClick={() => { setColor(c); setEraser(false); }} aria-label={`Color ${c}`} aria-pressed={!eraser && color === c}
            className={`press h-6 w-6 rounded-full ring-offset-2 ring-offset-[#fafaf9] ${!eraser && color === c ? "ring-2 ring-ink" : ""}`} style={{ background: c }} />
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        {SIZES.map((sz) => (
          <button key={sz} onClick={() => setSize(sz)} aria-label={`Brush size ${sz}`} aria-pressed={size === sz}
            className={`press flex h-7 w-7 items-center justify-center rounded-md ${size === sz ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.1)]" : ""}`}>
            <span className="rounded-full bg-ink" style={{ width: sz + 2, height: sz + 2 }} />
          </button>
        ))}
        <button onClick={() => setEraser((x) => !x)} aria-pressed={eraser} className={`btn press h-7 px-2 text-[12px] ${eraser ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.1)]" : "btn-quiet"}`}>Eraser</button>
        <span className="flex-1" />
        <button onClick={undo} disabled={!history.length} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="reset" size={12} /> Undo</button>
        <button onClick={clear} className="btn btn-quiet press h-7 px-2 text-[12px]">Clear</button>
      </div>
      <canvas
        ref={canvas}
        width={1200}
        height={750}
        className="block aspect-[8/5] w-full touch-none bg-white"
        style={{ cursor: eraser ? "cell" : "crosshair" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (drawing.current = null)}
        onPointerCancel={() => (drawing.current = null)}
        aria-label="Drawing area"
      />
      <div className="flex gap-2 p-3">
        <button onClick={() => canvas.current!.toBlob((b) => b && onKeep(new File([b], `drawing-${Date.now().toString(36)}.png`, { type: "image/png" })), "image/png")} className="btn btn-dark press">
          <Icon name="check" size={13} /> Use drawing
        </button>
        <button onClick={onCancel} className="btn btn-quiet press">Cancel</button>
      </div>
    </div>
  );
}
