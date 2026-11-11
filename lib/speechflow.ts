// The guided first-speech flow from the CaPS v4 Solo Studio design (Week 1, "prepare a 1–2 minute
// speech for Collab 1"). One question at a time; the speech assembles on the side in colored
// parts; at the end the parts become tiles the learner can reorder, edit, and add to.

export interface FlowStep {
  key: string;
  label: string;
  color: string;
  ink: string;
  question: string;
  hint?: string;
  example?: string;
}

const C = {
  purple: ["#e6e2fb", "#4b3fa8"], orange: ["#fde6cf", "#93531a"], green: ["#dcf1df", "#2d6b3c"],
  cyan: ["#d7eef6", "#235f75"], pink: ["#fbdde6", "#93324f"], yellow: ["#fbf0c4", "#7a5d0b"], gray: ["#ececea", "#4a4a46"],
} as const;
const step = (key: string, label: string, c: keyof typeof C, question: string, hint?: string, example?: string): FlowStep =>
  ({ key, label, color: C[c][0], ink: C[c][1], question, hint, example });

export const FLOWS = {
  idea: {
    title: "Present an idea",
    pitch: "A good choice if you’d like to use CaPS to sharpen pitches, lightning talks, and professional presentations.",
    steps: [
      step("idea", "Your idea", "purple", "In 1–2 sentences, describe the idea you want to share.", undefined,
        "Getting feedback on your public speaking skills can make you a better public speaker, but there are right and wrong ways to give feedback."),
      step("why", "Why this matters", "orange", "In 1–2 sentences, describe why your audience should care.",
        "Is it a new discovery? A better way to do something? A problem that needs solving? What will happen if the idea is realized, or if the problem goes unaddressed?",
        "Poorly delivered feedback can trigger distress, raise performance anxiety, and make people less willing to speak up."),
      step("evidence", "Persuasive evidence", "green", "Offer one piece of concrete evidence that grounds the problem or your idea.",
        "How widespread is the problem? How costly is it for the people affected? How much time, stress, or money would your idea save?"),
      step("cta", "Compelling conclusion", "cyan", "What do you want your audience to do with this new information?",
        "Change a habit. Advocate for a cause. Consider the impact of something they do. Learn more about the solution you’re proposing."),
      step("hook", "Attention-grabbing introduction", "pink", "What might you say to someone walking by to make them stop and pay attention?", undefined,
        "Most people think the hardest part of a public speaking course is standing up here and speaking. They’re wrong. The hardest part is sitting out there, listening, and giving feedback."),
      step("intro", "Self-introduction", "yellow", "Finally, write a brief self-introduction.",
        "Your name, your current role or program, and anything about you that explains why you chose this topic."),
    ],
    order: ["hook", "intro", "why", "evidence", "cta"],
  },
  story: {
    title: "Tell a story",
    pitch: "A good choice if you’d like to use CaPS to build and practice a story bank for job interviews.",
    steps: [
      step("story", "Your story", "purple", "In 1–2 sentences, describe the story you want to tell.", undefined,
        "In college I worked for a caterer. At one party I opened all the wine in advance to get ahead, but we didn’t use it all, so the open bottles had to be thrown away."),
      step("situation", "The situation", "orange", "Set the scene. Where were you, and what was going on?", "Just enough for a listener who wasn’t there: who, where, what was at stake."),
      step("action", "What you did", "green", "What did you do? Focus on your own choices.", "Say “I”, not “we”. Interviewers want to hear your part."),
      step("result", "The result", "cyan", "What happened as a result?", "Include a number or a concrete change if you can."),
      step("lesson", "What it shows", "pink", "What did you learn, and what does it show about you?", "This is the line an interviewer will remember. Tie it to the kind of work you want."),
      step("hook", "Opening moment", "yellow", "Open with a moment from the story that makes people lean in.", "Start in the middle of the action, or with the surprising detail."),
      step("intro", "Self-introduction", "gray", "Write a brief self-introduction.", "Your name, your program or role, and why this story matters to you."),
    ],
    order: ["hook", "intro", "situation", "action", "result", "lesson"],
  },
} as const;

export type FlowPath = keyof typeof FLOWS;
export interface Tile { id: string; kind: string; text: string }

export const stepOf = (path: FlowPath, key: string) => (FLOWS[path].steps as readonly FlowStep[]).find((s) => s.key === key);

/** The first set of tiles, in speaking order, from the learner's answers. */
export function tilesFrom(path: FlowPath, answers: Record<string, string>): Tile[] {
  return FLOWS[path].order.filter((k) => answers[k]?.trim()).map((k) => ({ id: k, kind: k, text: answers[k].trim() }));
}
