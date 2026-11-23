"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import { isDemoStudent } from "@/lib/shared";

/** Student View's blank student (the server's TEST_STUDENT): exists only in the teacher's test. */
export const TEST_STUDENT_ID = "s-test";
/** Student View's demo student (the server's DEMO_STUDENT): in every course, never in the class list; progress is kept. */
export const DEMO_STUDENT_ID = "s-demo";

/**
 * The bar across the top of Student View: who the teacher is testing as, a way to switch to another student (each sees
 * their own cards), start the test over, and go back to teaching. Nothing done here is saved.
 */
export function PreviewBar({ courseId, studentId, students, onReset, board = false }: {
  courseId: string;
  studentId: string;
  students: { id: string; name: string }[];
  /** After the test is started over: read the course again. */
  onReset: () => void;
  /** On the student's board page (keep the switch on the same page). */
  board?: boolean;
}) {
  const router = useRouter();
  const demo = studentId === DEMO_STUDENT_ID;
  const go = (id: string) => router.push(`/learn/${courseId}/${id}${board ? "/board" : ""}?preview=1`);
  return (
    <div className="sticky top-0 z-40 border-b border-[#d9c27a] bg-[#fff7dc]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-[13px]">
        <span className="flex items-center gap-1.5 font-medium text-[#7a5a00]"><Icon name="eye" size={14} /> Student View</span>
        <label className="flex items-center gap-1.5 text-ink-2">
          <span className="sr-only sm:not-sr-only">Testing as</span>
          <select value={studentId} onChange={(e) => go(e.target.value)} aria-label="Test as which student"
            className="h-7 max-w-[14rem] rounded-lg border border-[#e3d39c] bg-white px-2 text-[12.5px] text-ink">
            {/* Demo students on the class list first (their work is real), then the quick ones, then the class. */}
            {students.some((s) => isDemoStudent(s.id)) && (
              <optgroup label="Demo students">
                {students.filter((s) => isDemoStudent(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            )}
            <optgroup label="Just to look">
              <option value={DEMO_STUDENT_ID}>Quick demo student (progress kept)</option>
              <option value={TEST_STUDENT_ID}>New student (no work yet)</option>
            </optgroup>
            {students.some((s) => !isDemoStudent(s.id) && s.id !== TEST_STUDENT_ID && s.id !== DEMO_STUDENT_ID) && (
              <optgroup label="Your class">
                {students.filter((s) => !isDemoStudent(s.id) && s.id !== TEST_STUDENT_ID && s.id !== DEMO_STUDENT_ID).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <span className="hidden text-[12px] text-[#7a5a00]/80 md:inline">{demo ? "Progress is kept for next time. Never graded; no one is notified." : isDemoStudent(studentId) ? "A demo student: what you do is kept, like a real student’s, and shows in Grades." : "Try anything. Nothing here is saved or graded, and no one is notified."}</span>
        <span className="flex-1" />
        <button
          onClick={async () => {
            const r = await op(courseId, { op: "endPreview", as: studentId });
            if (!r.ok) return toast(String(r.error ?? "Couldn’t start over"), { icon: "x", tone: "bad" });
            onReset();
            toast(demo || isDemoStudent(studentId) ? "Started over: this demo student has no work again" : "Started over: back to where this student really is", { icon: "reset", tone: "plain" });
          }}
          className="btn btn-quiet press h-7 px-2 text-[12.5px]"
          title={demo ? "Clear the demo student's work, so they start the course again" : "Undo everything you tried, back to this student's real progress"}
        >Start over</button>
        <Link href={`/teach/${courseId}`} className="btn btn-dark press h-7 px-2.5 text-[12.5px]"><Icon name="back" size={12} /> Back to teaching</Link>
      </div>
    </div>
  );
}
