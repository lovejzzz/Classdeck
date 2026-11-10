"use client";

// 叠放：收起时第一张在前，后面两张露出一点边；展开时依次排开。
// 每张卡片的位置只用 transform 算出来，切换时由 CSS 过渡完成，所以展开、收起、新增都是同一种平滑的动作。

export const STACK_ITEM_H = 74;
const GAP = 8;
const PEEK = 10;

export function stackHeight(n: number, expanded: boolean) {
  if (n === 0) return 0;
  return expanded ? n * (STACK_ITEM_H + GAP) - GAP : STACK_ITEM_H + Math.min(n - 1, 2) * PEEK;
}

export function Stack<T extends { id: string }>({
  items, expanded, onExpand, render, label,
}: {
  items: T[];
  expanded: boolean;
  onExpand?: () => void;
  render: (item: T, i: number, front: boolean, interactive: boolean) => React.ReactNode;
  label?: string;
}) {
  const n = items.length;
  const collapsible = n > 1 && !expanded;
  return (
    <div
      className="relative transition-[height] duration-500 ease-[var(--ease-out)]"
      style={{ height: stackHeight(n, expanded) }}
      onClick={collapsible ? onExpand : undefined}
      role={collapsible ? "button" : undefined}
      tabIndex={collapsible ? 0 : undefined}
      onKeyDown={collapsible ? (e) => (e.key === "Enter" || e.key === " ") && onExpand?.() : undefined}
      aria-label={collapsible ? `${label ? `${label}: ` : ""}expand ${n} items` : undefined}
    >
      {items.map((it, i) => {
        const depth = Math.min(i, 3);
        const y = expanded ? i * (STACK_ITEM_H + GAP) : depth >= 3 ? PEEK * 2 : depth * PEEK;
        const scale = expanded ? 1 : 1 - Math.min(depth, 3) * 0.05;
        const opacity = expanded ? 1 : depth >= 3 ? 0 : 1;
        const front = expanded || i === 0;
        return (
          <div
            key={it.id}
            className="absolute inset-x-0 top-0 origin-bottom transition-[transform,opacity] duration-500 ease-[var(--ease-out)]"
            style={{
              height: STACK_ITEM_H,
              transform: `translateY(${y}px) scale(${scale})`,
              opacity,
              zIndex: n - i,
              pointerEvents: front ? "auto" : "none",
              transitionDelay: expanded ? `${Math.min(i, 8) * 18}ms` : "0ms",
            }}
            aria-hidden={!front}
          >
            {render(it, i, front, !collapsible)}
          </div>
        );
      })}
    </div>
  );
}
