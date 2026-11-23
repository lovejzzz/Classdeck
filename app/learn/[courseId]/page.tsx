"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@/lib/client";

/**
 * An old class link (/learn/course?code=…). Joining a class now needs an account: a signed-in student of this class
 * goes straight to their board; anyone else goes to the home page, where they sign in and the code is ready under
 * As Student.
 */
export default function LearnCourse() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const query = useQuery();
  useEffect(() => {
    if (!query) return;
    const code = query.get("code");
    fetch("/api/courses").then((r) => r.json()).then((d: { studying?: { id: string; studentId: string; waiting?: boolean }[] }) => {
      const mine = d.studying?.find((c) => c.id === courseId && !c.waiting);
      router.replace(mine ? `/learn/${courseId}/${mine.studentId}` : code ? `/?code=${encodeURIComponent(code)}` : "/");
    }).catch(() => router.replace("/"));
  }, [query, courseId, router]);
  return <main className="flex-1" aria-busy="true" />;
}
