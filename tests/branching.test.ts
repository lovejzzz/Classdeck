// Card-tree rules, checked without a server: npx tsx tests/branching.test.ts
import { bandRight, bandsOf, cleanGroups, groupScore, leavesOf, snapBands, scoreCount, cleanCourseWiring, dealtTo, deleteCardIn, orphansOf, treeView, unwire, wiresOf, SCORE } from "../lib/branching";
import { cloneWeek } from "../lib/clone";
import type { Lesson, Module, Progress, Week } from "../lib/types";

const card = (id: string, extra: Partial<Module> = {}): Module => ({ id, type: "read", title: id, body: "", audience: { kind: "all" }, tools: [], attachments: [], ...extra });
const ask = (id: string, next: (string | string[] | null)[]) => ({ id, text: id, options: next.map((_, i) => `o${i}`), answer: 0, next });
const lesson = (id: string, modules: Module[]): Lesson => ({ id, title: id, modules, branches: {} });
const prog = (dealt: Record<string, Record<string, number | number[]>>): Record<string, Progress> =>
  Object.fromEntries(Object.entries(dealt).map(([m, d]) => [m, { status: "done", dealt: d, updatedAt: 0 } as Progress]));

const rows: [string, boolean][] = [];
const check = (name: string, ok: boolean) => rows.push([name, ok]);
const ids = (ls: Lesson[]) => ls.flatMap((l) => l.modules.map((m) => m.id));

// A course: Lesson 1 has a question (src) dealing X here and Y in Lesson 2; Y deals Z (Lesson 2).
// S (Lesson 2) is dealt by src AND by other, so it isn't src's alone. A card everyone gets (all) sits in each lesson.
const course = () => [
  lesson("L1", [card("all1"), card("src", { type: "practice", questions: [ask("q", ["X", "Y", "S"])] }), card("X"), card("other", { type: "practice", questions: [ask("q2", ["S", null])] })]),
  lesson("L2", [card("all2"), card("Y", { type: "practice", questions: [ask("qy", ["Z", null])] }), card("Z"), card("S")]),
];

{
  const ls = course();
  const { before, after, gone } = deleteCardIn(ls, "src");
  const left = ids(after.map((a) => a).concat(ls.filter((l) => !after.some((a) => a.id === l.id))));
  check("deleting a source takes its follow-up in the same lesson", !left.includes("X"));
  check("…and its follow-up in a later lesson", !left.includes("Y"));
  check("…and that follow-up's own follow-up (a chain)", !left.includes("Z"));
  check("a follow-up another card also deals stays", left.includes("S"));
  check("cards everyone gets stay", left.includes("all1") && left.includes("all2") && left.includes("other"));
  check("gone lists exactly what was removed", [...gone].sort().join() === ["X", "Y", "Z", "src"].join());
  check("both lessons change, and Undo has both as they were", before.length === 2 && after.length === 2 && ids(before).includes("Y") && ids(before).includes("src"));
  const rest = after.flatMap((l) => l.modules);
  check("no wire is left pointing at a deleted card", wiresOf(rest).every((w) => !gone.has(w.to)));
  // The point of all this: nothing that was hidden becomes visible to everyone.
  const nextCourse = ls.map((l) => after.find((a) => a.id === l.id) ?? l);
  const view = treeView([{ lessons: nextCourse }], {});
  check("S is still hidden after the delete (other still deals it)", view.hidden.has("S"));
}

{
  const ls = course();
  const { after, gone } = deleteCardIn(ls, "X");
  check("deleting a follow-up removes only it", [...gone].join() === "X");
  const src = after.flatMap((l) => l.modules).find((m) => m.id === "src")!;
  check("…and unhooks the answer that dealt it", src.questions![0].next![0] === null && src.questions![0].next![1] === "Y");
}

{
  const ls = course();
  const { before, after } = deleteCardIn(ls, "all2");
  check("deleting a card nobody wires touches one lesson", before.length === 1 && after.length === 1 && after[0].id === "L2");
}

// The server's guard against orphans.
{
  const before = course().flatMap((l) => l.modules);
  const gone = orphansOf(before, before.filter((m) => m.id !== "src"));
  check("orphans: a deleted source's own follow-ups (and chain) are found", ["X", "Y", "Z"].every((x) => gone.has(x)) && !gone.has("S"));
  const unhooked = before.map((m) => (m.id === "src" ? { ...m, questions: [ask("q", [null, null, null])] } : m));
  check("orphans: unhooking alone (source kept) finds none", orphansOf(before, unhooked).size === 0);
  check("orphans: nothing removed, nothing found", orphansOf(before, before).size === 0);
}

// Dealing across lessons and by score.
{
  const ls = course();
  const all = ls.flatMap((l) => l.modules);
  check("nothing is dealt before any answer", dealtTo(all, {}).size === 0);
  const d = dealtTo(all, prog({ src: { q: 1 } }));
  check("answer B deals the Lesson 2 card", d.has("Y") && !d.has("X"));
  check("a chain waits for the next answer", !d.has("Z"));
  check("…and continues once given", dealtTo(all, prog({ src: { q: 1 }, Y: { qy: 0 } })).has("Z"));
  check("a card can't be dealt from a card the student doesn't have", !dealtTo(all, prog({ Y: { qy: 0 } })).has("Z"));
  const quiz = card("qz", { type: "quiz", questions: [ask("a", [null, null])], bands: [{ min: 0, next: "lo" }, { min: 60, next: "mid" }, { min: 90, next: "hi" }] });
  const pool = [quiz, card("lo"), card("mid"), card("hi")];
  const at = (pct: number) => [...dealtTo(pool, prog({ qz: { [SCORE]: pct } }))].join();
  check("59% is the low band", at(59) === "lo");
  check("60% (on the line) is the middle band", at(60) === "mid");
  check("89% is the middle band", at(89) === "mid");
  check("90% and 100% are the top band", at(90) === "hi" && at(100) === "hi");
  const tries = [...dealtTo(pool, prog({ qz: { [SCORE]: [40, 95] } }))].sort().join();
  check("every kept score deals its band (a better retake adds, never removes)", tries === "hi,lo");
  check("an old single number still works", at(59) === "lo");
}

// Cleaning: forward only, no loops, no class-wide targets, bands tidied.
{
  const weeks: Week[] = [{ id: "w", title: "w", lessons: [
    lesson("L1", [card("a", { type: "practice", questions: [ask("q", ["b", "wall", "a"])] }), card("wall", { type: "wall" })]),
    lesson("L2", [card("b", { type: "practice", questions: [ask("q", ["a", "c"])] }), card("c", { type: "quiz", questions: [ask("x", [null, null])], bands: [{ min: 50, next: "c" }, { min: 50, next: null }, { min: 120, next: "b" }] })]),
  ] }];
  cleanCourseWiring(weeks);
  const [a, , b, c] = weeks[0].lessons.flatMap((l) => l.modules);
  check("a forward wire stays", a.questions![0].next![0] === "b");
  check("a class-wide target and a self-wire are dropped", a.questions![0].next![1] === null && a.questions![0].next![2] === null);
  check("a wire back to an earlier lesson is dropped", b.questions![0].next![0] === null && b.questions![0].next![1] === "c");
  check("bands: start at 0, no duplicates, capped at 100, no self or backward targets", JSON.stringify(c.bands) === JSON.stringify([{ min: 0, next: null }, { min: 100, next: null }]));
}

// Copying a week keeps wires between its lessons on the copies.
{
  const w: Week = { id: "w", title: "Week", lessons: course() };
  const copy = cloneWeek(w);
  const cm = copy.lessons.flatMap((l) => l.modules);
  const src = cm.find((m) => m.title === "src")!;
  const y = cm.find((m) => m.title === "Y")!;
  check("a copied week's Lesson 1 answer deals the copied Lesson 2 card", src.questions![0].next![1] === y.id && y.id !== "Y");
}


// Score ranges follow the number of questions.
{
  const three = [{ min: 0, next: "lo" }, { min: 67, next: null }, { min: 100, next: "hi" }];
  check("3 questions: 67% and 100% stay", JSON.stringify(snapBands(three, 3).map((b) => b.min)) === "[0,67,100]");
  check("4 questions: 67% becomes 75% (3 of 4)", JSON.stringify(snapBands(three, 4).map((b) => b.min)) === "[0,75,100]");
  check("2 questions: 60% and 90% become 100%, merged, keeping a dealt card", (() => { const b = snapBands([{ min: 0, next: null }, { min: 60, next: null }, { min: 90, next: "x" }], 2); return JSON.stringify(b) === JSON.stringify([{ min: 0, next: null }, { min: 100, next: "x" }]); })());
  const g = card("g", { type: "group", members: ["a", "b", "c", "d"], bands: three });
  const mc = (id: string) => card(id, { type: "practice", kind: "choice", questions: [ask(`${id}q`, [null, null])] });
  const ls = [lesson("L", [g, mc("a"), mc("b"), mc("c"), mc("d")])];
  check("a group counts its questions", scoreCount(g, ls[0].modules) === 4);
  cleanGroups([{ lessons: ls }]);
  const bs = bandsOf(ls[0].modules[0]);
  check("cleaning a group snaps its ranges", JSON.stringify(bs.map((b) => b.min)) === "[0,75,100]");
  check("ranges read as questions right", bandRight(bs[0], 4) === "0–2 of 4 right" && bandRight(bs[1], 4) === "3 of 4 right" && bandRight(bs[2], 4) === "4 of 4 right");
  check("a range no score lands in says so", bandRight({ min: 80, max: 90 }, 3) === null);
}

// One answer can deal several cards.
{
  const many = () => [lesson("L1", [card("src", { type: "practice", questions: [ask("q", [["B", "A"], "C"])] }), card("A"), card("B"), card("C")])];
  const w = wiresOf(many()[0]);
  check("an answer with two cards makes two wires", w.filter((x) => x.option === 0).length === 2);
  check("…in the cards' order in the lesson, not the order they were added", w.filter((x) => x.option === 0).map((x) => x.to).join() === "A,B");
  const all = many()[0].modules;
  const d = dealtTo(all, prog({ src: { q: 0 } }));
  check("picking it deals both cards", d.has("A") && d.has("B") && !d.has("C"));
  const weeks: Week[] = [{ id: "w", title: "w", lessons: many() }];
  cleanCourseWiring(weeks);
  check("cleaning keeps both cards on the answer", JSON.stringify(weeks[0].lessons[0].modules[0].questions![0].next![0]) === JSON.stringify(["B", "A"]));
  const one = unwire(many()[0], "A").modules[0].questions![0].next!;
  check("deleting one of them keeps the other (as a single card again)", one[0] === "B" && one[1] === "C");
  const ls = many();
  const { after } = deleteCardIn(ls, "B");
  const src = after.flatMap((l) => l.modules).find((m) => m.id === "src");
  check("deleting a card from an answer of two keeps the other wired", src?.questions![0].next![0] === "A");
}

// Card groups inside card groups (two levels at most).
{
  const mc = (id: string) => card(id, { type: "practice", kind: "choice", questions: [ask(`${id}q`, [null, null])] });
  const nested = () => [lesson("L", [
    card("U", { type: "group", members: ["G1", "G2", "x"] }),
    mc("a"), card("G1", { type: "group", members: ["a", "b"] }), mc("b"),
    card("G2", { type: "group", members: ["c", "d"], bands: [{ min: 0, next: null }, { min: 100, next: "after" }] }), mc("c"), mc("d"),
    mc("x"), card("after"),
  ])];
  const ls = nested();
  cleanGroups([{ lessons: ls }]);
  const byId = (id: string) => ls[0].modules.find((m) => m.id === id)!;
  check("a group of groups survives tidying", byId("U").members?.join() === "G1,G2,x");
  check("…its members sit right after it, each group's cards right after that group", ids(ls).join() === "U,G1,a,b,G2,c,d,x,after");
  check("an outer group's cards are its groups' cards and its own", leavesOf(byId("U"), ls[0].modules).map((m) => m.id).join() === "a,b,c,d,x");
  check("an outer group counts every question in it", scoreCount(byId("U"), ls[0].modules) === 5);
  const done = prog({ aq: {}, bq: {}, cq: {}, dq: {}, xq: {} });
  for (const [k, v] of Object.entries({ a: 1, b: 1, c: 1, d: 0, x: 1 })) done[k] = { status: "done", first: { [`${k}q`]: !!v }, updatedAt: 0 } as Progress;
  const sc = groupScore(byId("U"), ls[0].modules, done);
  check("…and scores once they're all answered (4 of 5)", sc.done && sc.right === 4 && sc.total === 5);
  check("an inner group still scores on its own (1 of 2)", groupScore(byId("G2"), ls[0].modules, done).right === 1);

  // Two levels at most: a group of groups put inside another loses it; an inner group can't hold a group.
  const deep = [lesson("L", [card("V", { type: "group", members: ["U", "y"] }), ...nested()[0].modules, mc("y")])];
  cleanGroups([{ lessons: deep }]);
  const V = deep[0].modules.find((m) => m.id === "V");
  check("a group with groups in it can't go inside another", !V || !V.members?.includes("U"));

  // An outer group dealt by an answer: none of its cards are on the board until it's dealt.
  const dealtL = [lesson("L", [card("src", { type: "practice", questions: [ask("q", ["U", null])] }), ...nested()[0].modules])];
  cleanGroups([{ lessons: dealtL }]);
  const onAtStart = treeView([{ lessons: dealtL }], {});
  check("cards in an inner group of a dealt outer group are hidden at first", onAtStart.hidden.has("U") && !dealtTo(dealtL[0].modules, {}).has("U"));
  const dealt = dealtTo(dealtL[0].modules, prog({ src: { q: 0 } }));
  check("dealing the outer group deals it", dealt.has("U"));

  // An inner group left with one card hands it to the outer group, in its place (the outer stays whole).
  const thin = nested();
  cleanGroups([{ lessons: thin }]);
  thin[0].modules = thin[0].modules.filter((m) => m.id !== "b");
  cleanGroups([{ lessons: thin }]);
  check("an inner group of one card dissolves into the outer group", thin[0].modules.find((m) => m.id === "U")?.members?.join() === "a,G2,x" && !thin[0].modules.some((m) => m.id === "G1"));

  // Deleting an outer group takes its groups and all their cards.
  const del = nested();
  cleanGroups([{ lessons: del }]);
  const { gone } = deleteCardIn(del, "U");
  check("deleting an outer group takes every card in it", ["G1", "G2", "a", "b", "c", "d", "x"].every((id) => gone.has(id)));
  check("…and the card only its inner group dealt", gone.has("after"));
}

const failed = rows.filter(([, ok]) => !ok);
for (const [n] of failed) console.log("  ✗", n);
console.log(`${rows.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
