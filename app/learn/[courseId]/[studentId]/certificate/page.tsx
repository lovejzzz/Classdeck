"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SignInNeeded } from "@/components/SignInNeeded";
import { Icon } from "@/components/Icon";
import { setPreview, useCourse } from "@/lib/client";

/** A student's certificate of completion, laid out to print (or save as a PDF) on one landscape page. */
export default function CertificatePage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>();
  const testing = useSearchParams().has("preview");
  if (typeof window !== "undefined") setPreview(testing ? studentId : null);
  const { state, error, needAuth } = useCourse(courseId, studentId);
  const [today] = useState(() => Date.now());
  if (needAuth && !state) return <SignInNeeded who="student" courseId={courseId} next={`/learn/${courseId}/${studentId}/certificate`} />;
  if (error && !state) return <p className="p-10 text-center text-ink-2">{error}</p>;
  if (!state) return <div className="flex-1" aria-busy="true"><div className="h-12 border-b border-line" /><div className="skeleton mx-auto mt-10 aspect-[1.414] w-full max-w-4xl" /></div>;
  const { course } = state;
  const student = course.students.find((s) => s.id === studentId);
  const c = course.certificate?.mine;
  const back = `/learn/${courseId}/${studentId}/board${testing ? "?preview=1" : ""}`;
  if (!student || !c?.earned) return (
    <div className="mx-auto max-w-md p-10 text-center text-ink-2">
      <p>{course.certificate ? `The certificate comes once you’ve finished ${course.certificate.percent}% of your cards.` : "This course doesn’t give a certificate."}</p>
      <Link href={back} className="btn btn-ghost press mt-4 inline-flex">Back to your board</Link>
    </div>
  );
  const date = new Date(c.at ?? today).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="flex-1">
      <style>{"@page { size: landscape; margin: 0; } @media print { body { background: #fff; } }"}</style>
      <div className="no-print sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-4xl items-center gap-3 px-4 text-[13px]">
          <Link href={back} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink"><Icon name="back" size={13} /> Your board</Link>
          <span className="flex-1" />
          <button onClick={() => window.print()} className="btn btn-dark press h-8"><Icon name="download" size={13} /> Print or save as PDF</button>
        </div>
      </div>
      <main className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:p-0">
        <article className="rise relative mx-auto flex aspect-[1.414] w-full flex-col items-center justify-center overflow-hidden rounded-[6px] bg-white p-[6%] text-center shadow-[0_30px_80px_-40px_rgba(20,20,18,0.5)] print:h-screen print:rounded-none print:shadow-none">
          <div className="pointer-events-none absolute inset-[3%] rounded-[4px] border-2 border-[#c9a54a]" />
          <div className="pointer-events-none absolute inset-[4%] rounded-[2px] border border-[#c9a54a]/50" />
          <div className="text-[11px] font-medium uppercase tracking-[0.32em] text-[#8c6a10]">Certificate of completion</div>
          <p className="mt-[5%] text-[clamp(13px,1.6vw,16px)] text-ink-3">This is to certify that</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,5.2vw,54px)] leading-tight text-ink" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>{student.name}</h1>
          <div className="mt-3 h-px w-2/5 bg-[#c9a54a]/60" />
          <p className="mt-[3%] text-[clamp(13px,1.6vw,16px)] text-ink-3">has completed</p>
          <h2 className="mt-1.5 text-[clamp(18px,2.6vw,28px)] font-semibold tracking-tight text-ink">{course.title}</h2>
          {course.subtitle && <p className="mt-1 text-[clamp(12px,1.4vw,14px)] text-ink-2">{course.subtitle}</p>}
          <div className="mt-[6%] grid h-14 w-14 place-items-center rounded-full bg-[#fbecb4] text-[#8c6a10] ring-4 ring-[#f1d88c]/60"><Icon name="graduation" size={24} /></div>
          <p className="mt-[3%] font-mono text-[12px] text-ink-3">{date}</p>
        </article>
      </main>
    </div>
  );
}
