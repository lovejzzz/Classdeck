"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

/**
 * Draw, or edit a picture, in a large panel of its own. Everything is in layers: drawing layers, pictures (dropped in,
 * uploaded, or the picture being edited) and text. Pictures and text can be moved and resized; the pen and eraser work
 * on the selected layer (a picture can be erased too). Crop trims the whole thing. Saves as one PNG.
 */

const COLORS = ["#1b1b1a", "#ffffff", "#d64545", "#e08a2e", "#2f8a55", "#3d68a6", "#6a5ac0"];
const PENS = [3, 8, 18];
const MAX = 2400; // longest side kept for a picture, in pixels

type LayerBase = { id: string; name: string; visible: boolean };
type PaintLayer = LayerBase & { kind: "paint"; canvas: HTMLCanvasElement };
type PictureLayer = LayerBase & { kind: "image"; canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number };
type TextLayer = LayerBase & { kind: "text"; text: string; x: number; y: number; size: number; color: string };
type Layer = PaintLayer | PictureLayer | TextLayer;
type Tool = "move" | "pen" | "eraser" | "text" | "crop";
type Undo = { t: "pixels"; id: string; data: ImageData } | { t: "struct"; layers: Layer[]; w: number; h: number };
type Rect = { x: number; y: number; w: number; h: number };

let seq = 0;
const nid = () => `l${++seq}-${Math.random().toString(36).slice(2, 7)}`;
const blank = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const fit = (w: number, h: number, max: number) => { const k = Math.min(1, max / Math.max(w, h)); return { w: Math.round(w * k), h: Math.round(h * k) }; };
let measurer: CanvasRenderingContext2D | null = null;
const textBox = (l: TextLayer) => {
  const ctx = (measurer ??= blank(1, 1).getContext("2d")!);
  ctx.font = `600 ${l.size}px Inter, system-ui, sans-serif`;
  const lines = l.text.split("\n");
  return { w: Math.max(...lines.map((s) => ctx.measureText(s).width), l.size * 0.5), h: lines.length * l.size * 1.2 };
};
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, no) => {
    const img = new Image();
    try { if (new URL(src, location.href).origin !== location.origin) img.crossOrigin = "anonymous"; } catch { /* a data: or blob: URL */ }
    img.onload = () => ok(img);
    img.onerror = () => no(new Error("Couldn’t load the picture"));
    img.src = src;
  });
}
function pictureCanvas(img: HTMLImageElement) {
  const s = fit(img.naturalWidth || 800, img.naturalHeight || 600, MAX);
  const c = blank(s.w, s.h);
  c.getContext("2d")!.drawImage(img, 0, 0, s.w, s.h);
  return c;
}

export function ImageEditor({ source, title, onKeep, onCancel }: {
  /** The picture to edit; without one, a blank page to draw on. */
  source?: string;
  title: string;
  onKeep: (file: File) => void;
  onCancel: () => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>(source ? "move" : "pen");
  const [color, setColor] = useState(COLORS[source ? 2 : 0]);
  const [pen, setPen] = useState(1);
  const [ver, setVer] = useState(0);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [typing, setTyping] = useState<{ id: string | null; x: number; y: number; text: string } | null>(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const undo = useRef<Undo[]>([]);
  const view = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const drag = useRef<{ mode: "draw" | "move" | "resize" | "crop"; x: number; y: number; start?: { x: number; y: number; w?: number; h?: number; size?: number } } | null>(null);
  const layersRef = useRef(layers);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  // How wide the page shows on screen (for the size of text being typed), and whether a crop is being dragged.
  const [shown, setShown] = useState(1);
  const [cropping, setCropping] = useState(false);
  useEffect(() => {
    const c = view.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setShown(c.getBoundingClientRect().width));
    ro.observe(c);
    return () => ro.disconnect();
  }, [size]);

  // Start: the picture as the bottom layer, or a white page and a layer to draw on.
  useEffect(() => {
    let live = true;
    (async () => {
      if (source) {
        try {
          const img = await loadImage(source);
          if (!live) return;
          const c = pictureCanvas(img);
          setSize({ w: c.width, h: c.height });
          const base: PictureLayer = { id: nid(), name: "Picture", visible: true, kind: "image", canvas: c, x: 0, y: 0, w: c.width, h: c.height };
          const ink: PaintLayer = { id: nid(), name: "Drawing", visible: true, kind: "paint", canvas: blank(c.width, c.height) };
          setLayers([base, ink]);
          setSel(ink.id);
        } catch (e) { setError((e as Error).message); }
      } else {
        const w = 1600, h = 1000;
        const bg = blank(w, h);
        const g = bg.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
        const page: PaintLayer = { id: nid(), name: "Background", visible: true, kind: "paint", canvas: bg };
        const ink: PaintLayer = { id: nid(), name: "Drawing", visible: true, kind: "paint", canvas: blank(w, h) };
        setSize({ w, h });
        setLayers([page, ink]);
        setSel(ink.id);
      }
    })();
    return () => { live = false; };
  }, [source]);

  // Draw every visible layer, bottom to top.
  function compose(target: HTMLCanvasElement, list: Layer[]) {
    const ctx = target.getContext("2d")!;
    ctx.clearRect(0, 0, target.width, target.height);
    for (const l of list) {
      if (!l.visible) continue;
      if (l.kind === "paint") ctx.drawImage(l.canvas, 0, 0);
      else if (l.kind === "image") ctx.drawImage(l.canvas, l.x, l.y, l.w, l.h);
      else {
        ctx.font = `600 ${l.size}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = l.color;
        ctx.textBaseline = "top";
        l.text.split("\n").forEach((s, i) => ctx.fillText(s, l.x, l.y + i * l.size * 1.2));
      }
    }
  }
  useEffect(() => { if (view.current && size) compose(view.current, layers); }, [layers, ver, size]);

  const snapshot = () => { undo.current.push({ t: "struct", layers: layers.map((l) => ({ ...l })), w: size!.w, h: size!.h }); undo.current = undo.current.slice(-30); };
  function back() {
    const u = undo.current.pop();
    if (!u) return;
    if (u.t === "pixels") {
      const l = layersRef.current.find((x) => x.id === u.id);
      if (l && l.kind !== "text") l.canvas.getContext("2d")!.putImageData(u.data, 0, 0);
      setVer((v) => v + 1);
    } else {
      setLayers(u.layers);
      setSize({ w: u.w, h: u.h });
      if (!u.layers.some((l) => l.id === sel)) setSel(u.layers[u.layers.length - 1]?.id ?? null);
    }
  }
  const change = (id: string, patch: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)));
  function removeLayer(id: string) {
    if (layers.length <= 1) return;
    snapshot();
    const rest = layers.filter((l) => l.id !== id);
    setLayers(rest);
    setSel(rest[rest.length - 1]?.id ?? null);
  }
  function addPaint(): PaintLayer {
    snapshot();
    const l: PaintLayer = { id: nid(), name: `Drawing ${layers.filter((x) => x.kind === "paint").length + 1}`, visible: true, kind: "paint", canvas: blank(size!.w, size!.h) };
    const at = Math.max(0, layers.findIndex((x) => x.id === sel)) + 1;
    setLayers([...layers.slice(0, at), l, ...layers.slice(at)]);
    setSel(l.id);
    return l;
  }
  function move(id: string, d: number) {
    const i = layers.findIndex((l) => l.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= layers.length) return;
    snapshot();
    const n = [...layers]; [n[i], n[j]] = [n[j], n[i]];
    setLayers(n);
  }
  async function addPicture(f: File) {
    if (!f.type.startsWith("image/") || !size) return;
    const url = URL.createObjectURL(f);
    try {
      const c = pictureCanvas(await loadImage(url));
      const s = fit(c.width, c.height, Math.min(size.w, size.h) * 0.7);
      snapshot();
      const l: PictureLayer = { id: nid(), name: f.name.replace(/\.[^.]+$/, "").slice(0, 30) || "Picture", visible: true, kind: "image", canvas: c, x: Math.round((size.w - s.w) / 2), y: Math.round((size.h - s.h) / 2), w: s.w, h: s.h };
      setLayers((ls) => [...ls, l]);
      setSel(l.id);
      setTool("move");
    } catch (e) { setError((e as Error).message); } finally { URL.revokeObjectURL(url); }
  }

  // Pointer position on the page, in its own pixels.
  const at = (e: { clientX: number; clientY: number }) => {
    const r = view.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size!.w, y: ((e.clientY - r.top) / r.height) * size!.h };
  };
  const boxOf = (l: Layer): Rect | null => {
    if (l.kind === "image") return { x: l.x, y: l.y, w: l.w, h: l.h };
    if (l.kind === "text") { const b = textBox(l); return { x: l.x, y: l.y, w: b.w, h: b.h }; }
    return null;
  };
  const hit = (p: { x: number; y: number }) => [...layers].reverse().find((l) => { const b = l.visible ? boxOf(l) : null; return b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; });
  const penWidth = () => PENS[pen] * (size!.w / 1200);

  function stroke(l: PaintLayer | PictureLayer, a: { x: number; y: number }, b: { x: number; y: number }) {
    const ctx = l.canvas.getContext("2d")!;
    // On a picture, its own pixels: map the page's point into the picture.
    const map = (p: { x: number; y: number }) => (l.kind === "image" ? { x: ((p.x - l.x) * l.canvas.width) / l.w, y: ((p.y - l.y) * l.canvas.height) / l.h } : p);
    const k = l.kind === "image" ? l.canvas.width / l.w : 1;
    const p = map(a), q = map(b);
    ctx.save();
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = penWidth() * k * (tool === "eraser" ? 2.5 : 1);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x + 0.01, q.y); ctx.stroke();
    ctx.restore();
    setVer((v) => v + 1);
  }

  function down(e: React.PointerEvent) {
    if (!size || typing) return;
    const p = at(e);
    // Text: keep the click from taking focus away from the box it opens.
    if (tool === "text") e.preventDefault();
    else (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === "pen" || tool === "eraser") {
      let l = layers.find((x) => x.id === sel);
      if (!l || l.kind === "text" || !l.visible) l = addPaint();
      undo.current.push({ t: "pixels", id: l.id, data: l.canvas.getContext("2d")!.getImageData(0, 0, l.canvas.width, l.canvas.height) });
      undo.current = undo.current.slice(-30);
      drag.current = { mode: "draw", ...p };
      stroke(l, p, p);
    } else if (tool === "move") {
      const l = hit(p);
      if (!l) { setSel(null); return; }
      setSel(l.id);
      snapshot();
      drag.current = { mode: "move", ...p, start: { x: (l as PictureLayer).x, y: (l as PictureLayer).y } };
    } else if (tool === "text") {
      const l = hit(p);
      if (l?.kind === "text") setTyping({ id: l.id, x: l.x, y: l.y, text: l.text });
      else setTyping({ id: null, x: p.x, y: p.y, text: "" });
    } else if (tool === "crop") {
      drag.current = { mode: "crop", ...p };
      setCropping(true);
      setCrop({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  }
  function moveTo(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !size) return;
    const p = at(e);
    if (d.mode === "draw") {
      const l = layersRef.current.find((x) => x.id === sel);
      if (l && l.kind !== "text") stroke(l, { x: d.x, y: d.y }, p);
      d.x = p.x; d.y = p.y;
    } else if (d.mode === "move" && sel && d.start) {
      change(sel, { x: Math.round(d.start.x + p.x - d.x), y: Math.round(d.start.y + p.y - d.y) });
    } else if (d.mode === "resize" && sel && d.start) {
      const l = layersRef.current.find((x) => x.id === sel);
      if (l?.kind === "image") {
        const w = Math.max(20, d.start.w! + p.x - d.x);
        change(sel, { w: Math.round(w), h: Math.round((w * d.start.h!) / d.start.w!) });
      } else if (l?.kind === "text") {
        change(sel, { size: Math.max(10, Math.round(d.start.size! * (1 + (p.y - d.y) / Math.max(20, d.start.h!)))) });
      }
    } else if (d.mode === "crop") {
      const x = Math.max(0, Math.min(d.x, p.x)), y = Math.max(0, Math.min(d.y, p.y));
      setCrop({ x, y, w: Math.min(size.w, Math.max(d.x, p.x)) - x, h: Math.min(size.h, Math.max(d.y, p.y)) - y });
    }
  }
  const up = () => { drag.current = null; setCropping(false); };

  function startResize(e: React.PointerEvent, l: Layer) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    snapshot();
    const b = boxOf(l)!;
    drag.current = { mode: "resize", ...at(e), start: { x: b.x, y: b.y, w: b.w, h: b.h, size: l.kind === "text" ? l.size : undefined } };
  }
  function applyCrop() {
    if (!crop || !size || crop.w < 8 || crop.h < 8) return setCrop(null);
    snapshot();
    const r = { x: Math.round(crop.x), y: Math.round(crop.y), w: Math.round(crop.w), h: Math.round(crop.h) };
    setLayers(layers.map((l) => {
      if (l.kind === "paint") { const c = blank(r.w, r.h); c.getContext("2d")!.drawImage(l.canvas, -r.x, -r.y); return { ...l, canvas: c }; }
      return { ...l, x: l.x - r.x, y: l.y - r.y };
    }));
    setSize({ w: r.w, h: r.h });
    setCrop(null);
    setTool("move");
  }
  function commitText() {
    if (!typing) return;
    const text = typing.text.replace(/\s+$/, "");
    snapshot();
    if (typing.id) {
      if (text) change(typing.id, { text });
      else setLayers((ls) => ls.filter((l) => l.id !== typing.id));
    } else if (text) {
      const l: TextLayer = { id: nid(), name: text.split("\n")[0].slice(0, 24), visible: true, kind: "text", text, x: Math.round(typing.x), y: Math.round(typing.y), size: Math.round(PENS[pen] * 6 * (size!.w / 1200)) + 18, color };
      setLayers((ls) => [...ls, l]);
      setSel(l.id);
    }
    setTyping(null);
  }
  function keep() {
    if (!size) return;
    const out = blank(size.w, size.h);
    compose(out, layers);
    try {
      out.toBlob((b) => b ? onKeep(new File([b], `${source ? "edited" : "drawing"}-${Date.now().toString(36)}.png`, { type: "image/png" })) : setError("Couldn’t save the picture"), "image/png");
    } catch { setError("This picture comes from another site, so it can’t be saved after editing. Upload a copy of it instead."); }
  }

  // Esc closes only this; ⌘Z undoes; Delete removes the selected layer.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const inField = e.target instanceof Element && e.target.closest("input, textarea");
      if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); if (typing) setTyping(null); else if (crop) setCrop(null); else onCancel(); return; }
      if (inField) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.stopImmediatePropagation(); back(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); removeLayer(sel); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  });

  const selected = layers.find((l) => l.id === sel);
  const box = selected && tool === "move" ? boxOf(selected) : null;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const toolBtn = (t: Tool, icon: string, label: string) => (
    <button onClick={() => { setTool(t); setCrop(null); }} aria-pressed={tool === t} title={label}
      className={`press flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] ${tool === t ? "bg-ink text-white" : "text-ink-2 hover:bg-lane"}`}><Icon name={icon} size={13} /> {label}</button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-ink/40 p-3 backdrop-blur-[2px] sm:p-6" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="pop flex h-full max-h-[56rem] w-full max-w-[80rem] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_40px_100px_-30px_rgba(0,0,0,0.5)]">
        <div className="flex flex-none items-center gap-3 border-b border-line px-4 py-2.5">
          <Icon name={source ? "image" : "practice"} size={15} className="text-ink-2" />
          <span className="flex-1 text-[14px] font-semibold">{title}</span>
          <button onClick={onCancel} aria-label="Close" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={17} /></button>
        </div>

        {/* Tools: what the pointer does, then its colour and size, then adding a picture and undoing. */}
        <div className="flex flex-none flex-wrap items-center gap-1 border-b border-line bg-[#fafaf9] px-3 py-1.5">
          {toolBtn("move", "swap", "Move")}
          {toolBtn("pen", "practice", "Pen")}
          {toolBtn("eraser", "x", "Eraser")}
          {toolBtn("text", "type", "Text")}
          {toolBtn("crop", "split", "Crop")}
          <span className="mx-1.5 h-5 w-px bg-line" />
          {COLORS.map((c) => (
            <button key={c} onClick={() => { setColor(c); if (tool === "eraser" || tool === "move" || tool === "crop") setTool(selected?.kind === "text" ? "move" : "pen"); if (selected?.kind === "text") change(selected.id, { color: c }); }}
              aria-label={`Colour ${c}`} aria-pressed={color === c}
              className={`press h-6 w-6 rounded-full border border-black/10 ring-offset-2 ring-offset-[#fafaf9] ${color === c ? "ring-2 ring-ink" : ""}`} style={{ background: c }} />
          ))}
          <span className="mx-1.5 h-5 w-px bg-line" />
          {PENS.map((p, i) => (
            <button key={p} onClick={() => setPen(i)} aria-label={["Thin", "Medium", "Thick"][i]} aria-pressed={pen === i} title={["Thin", "Medium", "Thick"][i]}
              className={`press flex h-8 w-8 items-center justify-center rounded-md ${pen === i ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : ""}`}>
              <span className="rounded-full bg-ink" style={{ width: p / 1.4 + 2, height: p / 1.4 + 2 }} />
            </button>
          ))}
          <span className="mx-1.5 h-5 w-px bg-line" />
          <button onClick={() => file.current?.click()} className="btn btn-quiet press h-8 px-2.5 text-[12.5px]"><Icon name="image" size={13} /> Add a picture</button>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addPicture(f); }} />
          <span className="flex-1" />
          <button onClick={back} className="btn btn-quiet press h-8 px-2.5 text-[12.5px]" title="Undo (⌘Z)"><Icon name="reset" size={12} /> Undo</button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* The page. Drop a picture anywhere on it to add it as a layer. */}
          <div className={`relative flex min-w-0 flex-1 items-center justify-center overflow-hidden p-5 ${over ? "bg-[#eef0fb]" : "bg-[#e9e8e4]"}`}
            onDragOver={(e) => { if ([...e.dataTransfer.items].some((x) => x.type.startsWith("image/"))) { e.preventDefault(); setOver(true); } }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")).forEach(addPicture); }}>
            {error ? <p className="max-w-sm text-center text-[13px] text-bad">{error}</p> : !size ? <p className="text-[13px] text-ink-3">Opening…</p> : (
              <div className="relative max-h-full max-w-full shadow-[0_8px_30px_-12px_rgba(0,0,0,0.35)]" style={{ aspectRatio: `${size.w} / ${size.h}`, width: `min(100%, calc((100dvh - 15rem) * ${size.w / size.h}))` }}>
                <canvas ref={view} width={size.w} height={size.h} aria-label="The page"
                  className="block h-full w-full touch-none bg-[repeating-conic-gradient(#f2f2f0_0%_25%,#fff_0%_50%)] [background-size:20px_20px]"
                  style={{ cursor: tool === "move" ? "default" : tool === "text" ? "text" : "crosshair" }}
                  onPointerDown={down} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} />
                {/* The selected picture or text: its frame, and a corner to resize it by. */}
                {box && (
                  <div className="pointer-events-none absolute border-2 border-[#4b56a8]" style={{ left: pct(box.x, size.w), top: pct(box.y, size.h), width: pct(box.w, size.w), height: pct(box.h, size.h) }}>
                    <span onPointerDown={(e) => startResize(e, selected!)} onPointerMove={moveTo} onPointerUp={up}
                      className="pointer-events-auto absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize touch-none rounded-sm border-2 border-[#4b56a8] bg-white" aria-label="Resize" />
                  </div>
                )}
                {crop && (
                  <>
                    <div className="pointer-events-none absolute border-2 border-dashed border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={{ left: pct(crop.x, size.w), top: pct(crop.y, size.h), width: pct(crop.w, size.w), height: pct(crop.h, size.h) }} />
                    {!cropping && crop.w > 8 && (
                      <div className="absolute flex gap-1.5" style={{ left: pct(crop.x, size.w), top: `calc(${pct(crop.y + crop.h, size.h)} + 8px)` }}>
                        <button onClick={applyCrop} className="btn btn-dark press h-8 px-3 text-[12.5px]"><Icon name="check" size={12} /> Crop</button>
                        <button onClick={() => setCrop(null)} className="btn btn-ghost press h-8 bg-white px-3 text-[12.5px]">Cancel</button>
                      </div>
                    )}
                  </>
                )}
                {typing && (
                  <textarea ref={(el) => { if (el && document.activeElement !== el) setTimeout(() => el.focus(), 0); }} value={typing.text} onChange={(e) => setTyping({ ...typing, text: e.target.value })} onBlur={commitText}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); } }}
                    placeholder="Type, then Enter" aria-label="Text"
                    className="absolute min-w-[10rem] resize-none rounded border-2 border-[#4b56a8] bg-white/90 px-1 font-semibold leading-tight outline-none"
                    style={{ left: pct(typing.x, size.w), top: pct(typing.y, size.h), color, fontSize: Math.max(12, (Math.round(PENS[pen] * 6 * (size.w / 1200)) + 18) * (shown / size.w)) }} rows={Math.max(1, typing.text.split("\n").length)} />
                )}
              </div>
            )}
            {over && <span className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border-2 border-dashed border-[#4b56a8] text-[14px] font-medium text-[#4b56a8]">Drop to add the picture as a layer</span>}
          </div>

          {/* Layers, top first. */}
          <aside className="flex w-52 flex-none flex-col border-l border-line bg-white" aria-label="Layers">
            <div className="flex items-center px-3 pb-1.5 pt-3 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-3">
              <span className="flex-1">Layers</span>
              <button onClick={() => addPaint()} className="btn btn-quiet press h-7 px-1.5 text-[11.5px] normal-case tracking-normal" title="A new layer to draw on"><Icon name="plus" size={11} /> Layer</button>
            </div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-2">
              {[...layers].reverse().map((l) => {
                const i = layers.indexOf(l);
                return (
                  <li key={l.id}>
                    <div onClick={() => { setSel(l.id); if (l.kind !== "paint" && tool !== "move" && tool !== "eraser") setTool("move"); }}
                      className={`group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] ${sel === l.id ? "bg-[#eef0fb] text-ink" : "text-ink-2 hover:bg-lane"}`}>
                      <Icon name={l.kind === "text" ? "type" : l.kind === "image" ? "image" : "practice"} size={12} className="flex-none text-ink-3" />
                      <span className={`min-w-0 flex-1 truncate ${l.visible ? "" : "opacity-40"}`}>{l.name}</span>
                      <button onClick={(e) => { e.stopPropagation(); change(l.id, { visible: !l.visible }); }} aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} title={l.visible ? "Hide" : "Show"}
                        className={`press flex h-6 w-6 items-center justify-center rounded ${l.visible ? "text-ink-3" : "text-ink-3/40"} hover:bg-white`}><Icon name="eye" size={12} /></button>
                      {sel === l.id && (
                        <span className="flex">
                          <button onClick={(e) => { e.stopPropagation(); move(l.id, 1); }} disabled={i === layers.length - 1} aria-label="Move up" className="press h-6 w-5 text-[11px] text-ink-3 hover:text-ink disabled:opacity-30">↑</button>
                          <button onClick={(e) => { e.stopPropagation(); move(l.id, -1); }} disabled={i === 0} aria-label="Move down" className="press h-6 w-5 text-[11px] text-ink-3 hover:text-ink disabled:opacity-30">↓</button>
                          <button onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }} disabled={layers.length <= 1} aria-label={`Delete ${l.name}`} className="press flex h-6 w-5 items-center justify-center text-ink-3 hover:text-bad disabled:opacity-30"><Icon name="trash" size={11} /></button>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-line px-3 py-2.5 text-[11.5px] leading-snug text-ink-3">
              {tool === "move" ? "Drag a picture or text to move it; drag its corner to resize." : tool === "text" ? "Click to type. Click text again to change it." : tool === "crop" ? "Drag over the part to keep." : "The pen and eraser work on the selected layer."}
            </p>
          </aside>
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-line px-4 py-3">
          <button onClick={keep} disabled={!size} className="btn btn-dark press"><Icon name="check" size={13} /> {source ? "Save picture" : "Use drawing"}</button>
          <button onClick={onCancel} className="btn btn-quiet press">Cancel</button>
          <span className="flex-1" />
          {size && <span className="mono text-[11px]">{size.w} × {size.h}</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
