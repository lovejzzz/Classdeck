"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/lib/toast";
import type { Course } from "@/lib/types";
import { Icon } from "../Icon";

/** The end of Settings: delete the course for good, after typing its name. */
export function DeleteCourse({ course }: { course: Course }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    const r = await fetch("/api/courses", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: course.id, confirm: name }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
    setBusy(false);
    if (!r.ok) return toast(r.error, { icon: "x", tone: "bad" });
    toast(`Deleted “${course.title}”`, { icon: "trash" });
    router.push("/");
  }
  return (
    <section className="card border-bad/30 p-6" aria-label="Delete this course">
      <h3 className="text-[15px] font-medium text-bad">Delete this course</h3>
      <p className="mt-1 text-[13px] text-ink-3">Removes the course for good: its cards, its students and their PINs, all their work and feedback, and the files uploaded to it. This can’t be undone. Export the course first if you might want the cards again.</p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn btn-ghost press mt-4 h-9 hover:!border-bad hover:!text-bad"><Icon name="trash" size={13} /> Delete course…</button>
      ) : (
        <div className="rise mt-4 space-y-2">
          <label className="grid gap-1 text-[13px] text-ink-2"><span>Type <span className="font-medium text-ink">{course.title}</span> to confirm</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="field h-9 max-w-sm" aria-label="Course name to confirm" />
          </label>
          <div className="flex gap-2">
            <button onClick={del} disabled={busy || name.trim() !== course.title} className="btn press h-9 bg-bad text-white disabled:opacity-40">{busy ? "Deleting…" : "Delete for good"}</button>
            <button onClick={() => { setOpen(false); setName(""); }} className="btn btn-quiet press h-9">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
