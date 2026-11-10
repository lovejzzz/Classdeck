"use client";

import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { CardFace } from "@/components/cards/CardFace";
import { CardTable } from "@/components/cards/CardTable";
import { Lift } from "@/components/cards/Lift";
import { MediaView } from "@/components/cards/Media";
import { HScroll } from "@/components/HScroll";
import { Icon } from "@/components/Icon";
import { CARD_SIZE } from "@/lib/cards";
import { useCourse, useQuery } from "@/lib/client";
import { TYPE_META } from "@/lib/ui";

/** A read-only view for guests: browse every card, but no students and no work. */
export default function GuestPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const query = useQuery();
  const token = query?.get("t") ?? "";
  return token ? <Guest courseId={courseId} token={token} /> : <div className="flex-1" />;
}

function Guest({ courseId, token }: { courseId: string; token: string }) {
  const { state, error } = useCourse(courseId, `guest:${token}`, 60000);
  const [lift, setLift] = useState<{ id: string; from: DOMRect; open: boolean } | null>(null);
  const els = useRef(new Map<string, HTMLElement>());

  if (error && !state) return <p className="flex flex-1 items-center justify-center p-10 text-ink-2">{error}</p>;
  if (!state) return <div className="mx-auto w-full max-w-6xl px-4 py-10"><div className="skeleton h-8 w-64" /></div>;
  const { course } = state;
  const all = course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules));
  const m = lift && all.find((x) => x.id === lift.id);
  const size = CARD_SIZE.compact;

  return (
    <div className="flex-1 overflow-x-clip">
      <header className="border-b border-line bg-white/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 text-[13px]">
          <span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />
          <span className="font-medium">{course.title}</span>
          {course.subtitle && <span className="text-ink-3">{course.subtitle}</span>}
          <span className="flex-1" />
          <span className="chip"><Icon name="eye" size={12} />Guest view · read-only</span>
        </div>
      </header>
      <div className="space-y-6 py-8">
        {course.weeks.map((w) => (
          <section key={w.id}>
            <h2 className="mx-auto max-w-6xl px-4 text-[13px] font-medium text-ink-2">{w.title}</h2>
            <HScroll>
              <div className="flex w-max gap-10 pb-4 pt-3" style={{ paddingInline: "max(1rem, calc((100vw - 72rem) / 2 + 1rem))" }}>
                {w.lessons.map((l) => (
                  <div key={l.id}>
                    <div className="text-[13px] font-medium">{l.title}</div>
                    {l.goal && <p className="mt-0.5 text-[12.5px] text-ink-3" style={{ maxWidth: Math.max(l.modules.length * (size.w + 14), 280) }}>{l.goal}</p>}
                    <CardTable
                      cards={l.modules.map((x, i) => ({ id: x.id, label: x.title, front: <CardFace m={x} index={i} total={l.modules.length} badge={x.audience.kind === "branch" ? x.audience.variant : undefined} /> }))}
                      layout="row" size={size} gap={14} draggable={false} deal={false} idle={false} hiddenId={lift?.id}
                      register={(id, el) => (el ? els.current.set(id, el) : els.current.delete(id))}
                      onActivate={(id, el) => setLift({ id, from: el.getBoundingClientRect(), open: true })}
                    />
                  </div>
                ))}
              </div>
            </HScroll>
          </section>
        ))}
      </div>
      {lift && m && (
        <Lift from={lift.from} open={lift.open} label={m.title}
          onBackdrop={() => setLift((x) => (x ? { ...x, open: false } : x))}
          landing={() => els.current.get(lift.id)?.getBoundingClientRect() ?? null}
          onGone={() => setLift(null)}>
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: TYPE_META[m.type].tint }}><Icon name={m.type} size={13} strokeWidth={2} /> {TYPE_META[m.type].name}</div>
                <h2 className="mt-2 text-[22px] font-semibold tracking-tight">{m.title}</h2>
              </div>
              <button onClick={() => setLift((x) => (x ? { ...x, open: false } : x))} aria-label="Close" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={17} /></button>
            </div>
            {m.minutes && <span className="chip mt-3"><Icon name="clock" size={12} />{m.minutes} min</span>}
            <p className="mt-5 whitespace-pre-wrap text-[15px] leading-[1.7] text-[#353532]">{m.body}</p>
            {(m.attachments ?? []).map((a) => <div key={a.id} className="mt-4"><MediaView a={a} /></div>)}
            {m.questions?.length ? (
              <ol className="mt-5 list-decimal space-y-1 pl-5 text-[14px]">{m.questions.map((q) => <li key={q.id}>{q.text} <span className="text-ink-3">({q.options.join(" · ")})</span></li>)}</ol>
            ) : null}
            {m.criteria && <p className="mt-5 text-[13px] text-ink-2"><span className="font-medium text-ink">Done when: </span>{m.criteria}</p>}
          </div>
        </Lift>
      )}
    </div>
  );
}
