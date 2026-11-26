// Course files (docs/course-file.md), checked without a server: npx tsx tests/coursefile.test.ts
import { readFileSync } from "node:fs";

async function main() {
  const { readCourseFile, toCourseFile } = await import("../lib/coursefile");
  const doc = readFileSync(new URL("../docs/course-file.md", import.meta.url), "utf8");
  const example = JSON.parse(doc.split("## Example")[1].split("```json")[1].split("```")[0]);
  const rows: [string, boolean, unknown?][] = [];
  const check = (name: string, ok: boolean, extra?: unknown) => rows.push([name, ok, extra]);

  const r = readCourseFile(example);
  check("the doc's example reads", r.ok);
  if (r.ok) {
    const ms = r.weeks[0].lessons[0].modules;
    const by = (t: string) => ms.find((m) => m.title === t)!;
    const g = ms.find((m) => m.type === "group")!;
    check("5 cards (the group isn't counted)", r.cards === 5, r.cards);
    check("fresh ids", !ms.some((m) => ["c-read", "g-check", "q-zone"].includes(m.id)));
    check("kinds become types", by("Three zones of the ocean").type === "read" && by("Which zone?").type === "practice" && by("Draw a deep-sea creature").type === "submit" && g.type === "group");
    check("group members follow their cards", g.members?.join() === [by("Which zone?").id, by("How deep is the sunlight zone?").id].join());
    check("a band deals the review card", g.bands?.[0].next === by("Look again: the zones").id);
    // Out and back in: the same course
    const course = { title: "Ocean Explorers", weeks: r.weeks } as never;
    const again = readCourseFile(JSON.parse(JSON.stringify(toCourseFile(course))));
    const shape = (list: typeof ms) => JSON.stringify(list.map((m) => [m.type, m.title, (m.members ?? []).map((id) => list.find((x) => x.id === id)?.title), (m.bands ?? []).map((b) => list.find((x) => x.id === b.next)?.title ?? null)]));
    check("export then import keeps cards, groups and wiring", again.ok && shape(again.weeks[0].lessons[0].modules) === shape(ms));
  }
  const across = readCourseFile({ title: "x", weeks: [
    { title: "1", lessons: [{ title: "a", modules: [{ id: "q", kind: "choice", title: "Pick", questions: [{ id: "q", text: "?", options: ["Y", "N"], answer: 0, next: [null, "later"] }] }] }] },
    { title: "2", lessons: [{ title: "b", modules: [{ id: "later", kind: "content", title: "Help", body: "x" }] }] }] });
  check("a wire into a later week lands on the copy", across.ok && across.weeks[0].lessons[0].modules[0].questions?.[0].next?.[1] === across.weeks[1].lessons[0].modules[0].id);
  const err = (f: unknown) => { const x = readCourseFile(f); return x.ok ? "" : x.error; };
  check("not a course file", /isn’t a Questhand course file/.test(err({ hello: 1 })));
  check("no weeks", /no weeks/.test(err({ weeks: [] })));
  check("a week with no lessons", /Week 1 has no lessons/.test(err({ weeks: [{ lessons: [] }] })));
  check("two cards with one id", /share the id/.test(err({ weeks: [{ lessons: [{ modules: [{ id: "a" }, { id: "a" }] }] }] })));
  check("a newer version", /newer Questhand/.test(err({ version: 99, weeks: [{ lessons: [{}] }] })));
  const some = readCourseFile({ weeks: [{ lessons: [{ modules: [{ id: "a", kind: "content", title: "x", audience: { kind: "student", studentId: "s1", studentIds: ["s1"] } }] }] }] });
  check("a card for named students goes to everyone, said in notes", some.ok && some.weeks[0].lessons[0].modules[0].audience.kind === "all" && some.notes.length === 1);
  const q101 = readCourseFile(JSON.parse(readFileSync(new URL("../lib/questhand101.json", import.meta.url), "utf8")));
  check("Questhand 101 reads as a course file", q101.ok && q101.cards > 20);
  const fin = q101.ok ? q101.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules)).find((m) => m.title === "Final check") : undefined;
  check("…its Final check is a card group with two tries", fin?.type === "group" && fin.attempts === 2 && fin.members?.length === 5);
  const oldQuiz = readCourseFile({ weeks: [{ lessons: [{ modules: [{ id: "qz", type: "quiz", title: "Old", attempts: 3, timeLimit: 5, questions: [1, 2].map((i) => ({ id: `q${i}`, text: `Q${i}`, options: ["a", "b"], answer: 0 })) }] }] }] });
  const om = oldQuiz.ok ? oldQuiz.weeks[0].lessons[0].modules : [];
  check("an older file's quiz comes in as a card group of its questions", om.length === 3 && om[0].type === "group" && om[0].attempts === 3 && om[0].members?.every((id) => om.some((m) => m.id === id && m.type === "practice")) === true);

  let failed = 0;
  for (const [name, ok, extra] of rows) { if (!ok) failed++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`); }
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main();
