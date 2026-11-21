"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar, Icon } from "../Icon";
import { TEST_STUDENT_ID } from "../student/PreviewBar";

/**
 * "Student View" in the teacher's top bar: pick a student (each has their own cards, from their own answers) or a new
 * student with no work yet, and try the course as them. It's a test: nothing done there is saved or graded.
 */
export function StudentViewButton({ courseId, students }: { courseId: string; students: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  const href = (id: string) => `/learn/${courseId}/${id}?preview=1`;
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" title="Try the course as one of your students"
        className="btn btn-ghost press h-7 gap-1.5 px-2.5 text-[12px]">
        <Icon name="eye" size={13} /> <span className="hidden sm:inline">Student View</span>
      </button>
      {open && (
        <div role="menu" className="pop absolute right-0 top-9 z-40 w-72 rounded-2xl border border-line bg-white p-2 shadow-[0_20px_50px_-18px_rgba(20,20,18,0.3)]">
          <div className="px-2 pb-1.5 pt-1 text-[12px] text-ink-3">See and try the course as a student. It’s only a test: nothing is saved or graded, and no one is notified.</div>
          <Link role="menuitem" href={href(TEST_STUDENT_ID)} className="press flex items-center gap-2.5 rounded-xl px-2 py-2 text-[13px] hover:bg-lane">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-lane text-ink-3"><Icon name="plus" size={12} /></span>
            <span className="min-w-0 flex-1"><span className="block font-medium">New student</span><span className="block text-[11.5px] text-ink-3">Starts with no work, like someone who just joined</span></span>
          </Link>
          {students.length > 0 && <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">As a student in your class</div>}
          <div className="max-h-64 overflow-auto">
            {students.map((s) => (
              <Link role="menuitem" key={s.id} href={href(s.id)} className="press flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-lane">
                <Avatar name={s.name} size={24} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
