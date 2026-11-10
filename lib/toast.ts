"use client";

// Toasts: a tiny global queue. Call toast("Saved") from anywhere and it shows at the bottom of the screen.

export interface Toast {
  id: number;
  text: string;
  icon: string;
  tone: "ok" | "bad" | "plain";
  leaving?: boolean;
}

let items: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, opts: { icon?: string; tone?: Toast["tone"] } = {}) {
  const t: Toast = { id: ++seq, text, icon: opts.icon ?? "check", tone: opts.tone ?? "ok" };
  items = [t, ...items].slice(0, 6);
  emit();
  return t.id;
}

export function dismiss(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 260);
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const snapshot = () => items;
const empty: Toast[] = [];
export const serverSnapshot = () => empty;
