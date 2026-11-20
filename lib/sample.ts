// The public sample course: anyone can try Questhand as a student in their own copy (made by /api/try, gone after a
// day). It is small on purpose and shows the card tree: a quiz that branches by score (one branch reaches the next
// lesson), and a question whose answer picks the next card.
import { uid } from "./profile";
import type { Module, Week } from "./types";

const card = (id: string, m: Partial<Module> & Pick<Module, "type" | "title" | "body">): Module => ({
  id, audience: { kind: "all" }, tools: [], attachments: [], suit: m.type === "read" || m.type === "explore" ? "learn" : "do", ...m,
});

export const SAMPLE_TITLE = "Harmony 101 (sample)";
/** How long a visitor's copy lasts. */
export const SAMPLE_HOURS = 24;

export function sampleWeeks(): Week[] {
  const weeks: Week[] = [
    {
      id: "w1", title: "Week 1 · Cadences",
      lessons: [
        {
          id: "l1", title: "Hearing cadences", goal: "Hear how a phrase ends, and name the ending.", branches: {},
          modules: [
            card("listen", { type: "read", title: "Three ways to end a phrase", minutes: 5, body: "A cadence is how a musical phrase ends.\n\n- Perfect: V to I. It sounds finished, like a full stop.\n- Half: ends on V. It sounds like a question, waiting for more.\n- Plagal: IV to I. The soft “Amen” at the end of a hymn." }),
            // A card group of three Multiple choice cards: its score deals the next card (one branch reaches lesson 2).
            card("quiz", { type: "group", kind: "group", title: "Which ending is this?", body: "", members: ["q1", "q2", "q3"], bands: [{ min: 0, next: "basics" }, { min: 60, next: null }, { min: 90, next: "challenge" }] }),
            card("q1", { type: "practice", kind: "choice", title: "Ending on V", body: "", questions: [{ id: "q1q", text: "A phrase ends on chord V. Which cadence is it?", options: ["Perfect", "Half", "Plagal"], answer: 1, explain: "Ending on V leaves the phrase open: a half cadence." }] }),
            card("q2", { type: "practice", kind: "choice", title: "The finished sound", body: "", questions: [{ id: "q2q", text: "Which cadence sounds most finished?", options: ["Perfect", "Half"], answer: 0, explain: "V to I resolves home: the perfect cadence." }] }),
            card("q3", { type: "practice", kind: "choice", title: "Amen", body: "", questions: [{ id: "q3q", text: "The “Amen” at the end of a hymn is usually…", options: ["Plagal (IV to I)", "Perfect (V to I)"], answer: 0 }] }),
            card("basics", { type: "read", title: "Cadence basics, step by step", minutes: 8, body: "Start with home: chord I. A perfect cadence comes home from V. A half cadence stops on V, away from home. Hum a tune you know and stop on its last note but one: that’s the half-cadence feeling." }),
            card("way", {
              type: "practice", kind: "poll", poll: true, title: "Pick your way in", minutes: 2, body: "There’s no wrong answer. Pick the one that sounds like you.",
              questions: [{ id: "w", text: "How do you like to learn a new piece?", options: ["By ear", "From the score"], next: ["ear", "score"] }],
            }),
            card("ear", { type: "practice", title: "Ear first: sing the bass line", minutes: 10, body: "Play any recording of a song you like. Sing just the lowest notes of the last line. Does it end on the home note (perfect) or hang in the air (half)?" }),
            card("score", { type: "practice", title: "Score first: label the last chords", minutes: 10, body: "Take any piece you have the music for. Write the Roman numerals of the last two chords of a phrase. V–I is perfect; ending on V is half." }),
          ],
        },
        {
          id: "l2", title: "Using cadences", goal: "Use cadences on purpose in your own writing.", branches: {},
          modules: [
            card("pop", { type: "read", title: "Cadences in pop songs", minutes: 6, body: "Verses often end with a half cadence to pull you into the chorus. Choruses end with a perfect cadence so they feel complete." }),
            card("challenge", { type: "practice", title: "Challenge: write a half cadence", minutes: 15, body: "You scored 90% or more, so here’s a stretch: write four bars that end on chord V. Play them to someone and ask what they expect next." }),
            card("reflect", { type: "reflect", title: "What changed?", minutes: 5, body: "Which cadence do you hear most easily now? Where will you listen for it this week?" }),
          ],
        },
      ],
    },
  ];
  // Fresh ids everywhere, with the wiring pointed at the new ones.
  const ids = new Map<string, string>();
  for (const w of weeks) for (const l of w.lessons) for (const m of l.modules) ids.set(m.id, uid("m-"));
  const to = (x: string | null) => (x ? ids.get(x) ?? null : null);
  for (const w of weeks) {
    w.id = uid("w-");
    for (const l of w.lessons) {
      l.id = uid("l-");
      l.modules = l.modules.map((m) => ({
        ...m,
        id: ids.get(m.id)!,
        questions: m.questions?.map((q) => (q.next ? { ...q, next: q.next.map(to) } : q)),
        bands: m.bands?.map((b) => ({ ...b, next: to(b.next) })),
        members: m.members?.map((id) => ids.get(id)!),
      }));
    }
  }
  return weeks;
}
