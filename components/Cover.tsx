import { TYPE_META } from "@/lib/ui";
import type { ModuleType } from "@/lib/types";

/** 卡片顶部的模糊渐变封面，左下角一个小标签。 */
export function Cover({ type, label, height = 56 }: { type: ModuleType; label?: string; height?: number }) {
  return (
    <div className="cover" style={{ height }}>
      <div className="blur" style={{ background: TYPE_META[type].cover }} />
      {label && <span className="pill absolute bottom-2 left-3">{label}</span>}
    </div>
  );
}
