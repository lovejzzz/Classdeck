"use client";

import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { Attachment } from "@/lib/types";
import { MediaView } from "../cards/Media";
import { Icon } from "../Icon";
import { AttachMenu } from "../AttachMenu";

/**
 * A student's takes on a card: record audio or video, upload a file, or add a link.
 * Each take keeps its own label, so two comparable attempts sit side by side.
 */
export function WorkComposer({
  courseId, studentId, moduleId, work, onChanged, hint,
}: {
  courseId: string; studentId: string; moduleId: string; work: Attachment[]; onChanged: () => void; hint?: string;
}) {
  async function add(a: Omit<Attachment, "id">) {
    const r = await op<{ ok: boolean; error?: string }>(courseId, { op: "addWork", studentId, moduleId, attachment: a });
    if (!r.ok) toast(r.error ?? "Couldn’t add that", { icon: "x", tone: "bad" });
    else toast(`Added ${a.name ?? "your work"}`, { icon: "upload" });
    onChanged();
  }

  return (
    <div>
      {work.length > 0 && (
        <div className="space-y-3">
          {work.map((w, i) => (
            <div key={w.id} className="pop" style={{ "--i": i } as React.CSSProperties}>
              <div className="mb-1.5 flex items-center gap-2">
                <input
                  defaultValue={w.name ?? ""}
                  onBlur={(e) => e.target.value !== (w.name ?? "") && op(courseId, { op: "renameWork", studentId, moduleId, workId: w.id, name: e.target.value }).then(onChanged)}
                  aria-label="Label for this take"
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] font-medium text-ink-2 hover:border-line focus:border-line-strong focus:bg-white focus:outline-none"
                />
                <button
                  onClick={async () => {
                    await op(courseId, { op: "removeWork", studentId, moduleId, workId: w.id });
                    onChanged();
                  }}
                  aria-label={`Remove ${w.name ?? "take"}`}
                  className="btn btn-quiet press h-7 w-7 justify-center px-0"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
              <MediaView a={w} />
            </div>
          ))}
        </div>
      )}

      <div className={work.length ? "mt-3" : ""}>
        <AttachMenu label={hint} onAdd={add} />
      </div>
    </div>
  );
}
