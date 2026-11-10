"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Avatar, Icon } from "@/components/Icon";
import { useCourse } from "@/lib/client";

export default function PickName() {
  const { courseId } = useParams<{ courseId: string }>();
  const { state, error } = useCourse(courseId, undefined, 60000);
  if (error && !state) return <p className="p-10 text-center text-ink-2">{error}</p>;
  if (!state) return <div className="mx-auto w-full max-w-xl px-4 py-16"><div className="skeleton h-64" /></div>;
  const { course } = state;
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
      <p className="rise eyebrow">{course.title}</p>
      <h1 className="rise mt-1 text-[24px] font-semibold tracking-tight">Which one is you?</h1>
      {course.students.length === 0 && <p className="mt-6 text-[13.5px] text-ink-2">Your teacher hasn’t added the class list yet. Check back soon.</p>}
      <div className="rise card mt-6 divide-y divide-line overflow-hidden">
        {course.students.map((s, i) => (
          <Link
            key={s.id}
            href={`/learn/${courseId}/${s.id}`}
            style={{ "--i": i } as React.CSSProperties}
            className="rise group flex items-center gap-3 bg-white px-4 py-3 text-[14px] hover:bg-[#fafaf9]"
          >
            <Avatar name={s.name} size={26} />
            <span className="flex-1 font-medium">{s.name}</span>
            <Icon name="arrow" size={14} className="text-ink-3 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" />
          </Link>
        ))}
      </div>
      {course.profile.entry === "account" && (
        <p className="mt-4 text-[12.5px] text-ink-3">This class is set to “Sign in with an account”. The prototype has no sign-in yet, so pick your name for now.</p>
      )}
    </main>
  );
}
