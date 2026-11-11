// The CaPS onboarding questionnaire, the PRCA-PS anxiety check, sub-skills, and practice drills.

export const PURPOSES = [
  "Job interviews", "Thesis or research presentations", "Class presentations", "Pitches and professional talks",
  "Speaking with confidence in English", "Managing nerves", "Speaking up in meetings",
];

export const SCENARIOS: [string, string][] = [
  ["interview", "A job interview"],
  ["class", "Presenting in a class or seminar"],
  ["meeting", "Speaking up in a meeting or discussion"],
  ["impromptu", "Answering an unexpected question"],
  ["research", "Presenting research or data"],
  ["english", "Presenting in English (if it isn’t your first language)"],
];

/**
 * PRCA-24 public speaking subscale (items 19–24; McCroskey). Answers run 1 = strongly agree to
 * 5 = strongly disagree. Score = 18 + (19) + (21) + (23) − (20) − (22) − (24), from 6 to 30.
 */
export const PRCA_ITEMS: { n: number; text: string; calm: boolean; facet: "anticipatory" | "body" | "mind" }[] = [
  { n: 19, text: "I have no fear of giving a speech.", calm: true, facet: "anticipatory" },
  { n: 20, text: "Certain parts of my body feel very tense and rigid while giving a speech.", calm: false, facet: "body" },
  { n: 21, text: "I feel relaxed while giving a speech.", calm: true, facet: "body" },
  { n: 22, text: "My thoughts become confused and jumbled when I am giving a speech.", calm: false, facet: "mind" },
  { n: 23, text: "I face the prospect of giving a speech with confidence.", calm: true, facet: "anticipatory" },
  { n: 24, text: "While giving a speech, I get so nervous I forget facts I really know.", calm: false, facet: "mind" },
];
export const AGREE = ["Strongly agree", "Agree", "Undecided", "Disagree", "Strongly disagree"];

export function prcaScore(answers: number[]) {
  // Each item's contribution to anxiety, from 1 (calm) to 5 (anxious).
  const a = PRCA_ITEMS.map((it, i) => (it.calm ? answers[i] : 6 - answers[i]));
  const score = a.reduce((x, y) => x + y, 0);
  const facet = (f: string) => PRCA_ITEMS.reduce((n, it, i) => n + (it.facet === f ? a[i] : 0), 0) / 2;
  const facets = { anticipatory: facet("anticipatory"), body: facet("body"), mind: facet("mind") };
  const top = (Object.entries(facets) as [keyof typeof facets, number][]).sort((x, y) => y[1] - x[1])[0];
  const band = score >= 24 ? "high" : score >= 19 ? "moderate" : "low";
  return { score, band, facets, top: top[1] >= 3 ? top[0] : undefined } as const;
}

export const FACET_TEXT = {
  anticipatory: { name: "Before you speak", text: "Most of the worry comes beforehand. Short, frequent, low-stakes runs (to yourself, then one person, then a few) help most." },
  body: { name: "In your body", text: "Tension shows up physically. Slow breathing before you start and a grounded stance help, along with practice runs that end on a calm pause." },
  mind: { name: "In your thinking", text: "Thoughts can jumble mid-speech. Speaking from keywords instead of a script and practicing how to find your place again help most." },
} as const;

/** Sub-skills per skill area, from the CaPS v4 modules and sub-skills. */
export const SUBSKILLS: Record<string, string[]> = {
  audience: ["Defining your goal", "Analyzing your audience", "Core message in one sentence"],
  structure: ["Hook", "Body structure", "Transitions", "Strong closing", "Call to action"],
  vocal: ["Pace and tempo", "Pitch, volume, and expression", "Filler words", "Clarity and articulation"],
  body: ["Posture and stance", "Purposeful gesture", "Eye contact", "Movement and space", "Facial expression"],
  rehearsal: ["Rehearsal strategies", "Speaking from notes", "Remembering your flow", "Recovering when you lose your place"],
  visual: ["Slide design", "Showing data clearly"],
};

/** Ten-minute deliberate-practice drills, each isolating one micro-skill. */
export const DRILLS: { id: string; sub: string; title: string; steps: string }[] = [
  { id: "pace", sub: "Pace and tempo", title: "Half speed, then full", steps: "Read your opening once at half speed, then at your normal speed. Record both and notice what the slow version made clearer." },
  { id: "filler", sub: "Filler words", title: "Swap ums for silence", steps: "Talk for 60 seconds on any topic. Each time you feel an “um” coming, pause silently instead. Do three rounds." },
  { id: "pause", sub: "Pitch, volume, and expression", title: "The three-second pause", steps: "Say your key line, then hold a full three-second silence before going on. Repeat five times until the pause feels natural." },
  { id: "hook", sub: "Hook", title: "Punch up the first 30 seconds", steps: "Deliver only your first two sentences five times, tightening the hook a little each time." },
  { id: "transition", sub: "Transitions", title: "Clean transitions", steps: "Practice moving from one point to the next three times without “um”, “so”, or “like”. Use a linking sentence instead." },
  { id: "compress", sub: "Core message in one sentence", title: "Compress it", steps: "Cut a three-minute story down to 90 words without losing its point. Then say it out loud." },
  { id: "close", sub: "Strong closing", title: "Land the ending", steps: "Deliver only your last three sentences five times. End on your call to action and stop: no “so yeah”." },
  { id: "eyes", sub: "Eye contact", title: "One sentence, one person", steps: "Pick three spots in the room. Deliver one full sentence to each before moving your eyes." },
  { id: "gesture", sub: "Purposeful gesture", title: "The mute test", steps: "Watch a recording of yourself with the sound off. Note every gesture, and keep only the ones that support a point." },
  { id: "stance", sub: "Posture and stance", title: "Grounded start", steps: "Before speaking, plant both feet, breathe out slowly, and hold still for two seconds. Practice the first line this way five times." },
  { id: "notes", sub: "Speaking from notes", title: "Ten keywords", steps: "Reduce your notes to ten keywords. Deliver your talk twice from them alone." },
  { id: "recover", sub: "Recovering when you lose your place", title: "Lose it, find it", steps: "Ask someone to stop you mid-sentence (or set a random timer). Find your place from your notes and continue smoothly. Do it three times." },
  { id: "audience", sub: "Analyzing your audience", title: "Two audiences", steps: "Rewrite your opening for two different audiences, then say both out loud." },
  { id: "data", sub: "Showing data clearly", title: "Five-second chart", steps: "Describe one chart in a single sentence that someone could understand in five seconds." },
];

export const drillFor = (subs: string[], day: number) => {
  const pool = DRILLS.filter((d) => subs.includes(d.sub));
  const list = pool.length ? pool : DRILLS;
  return list[day % list.length];
};

export const ICEBREAKERS = [
  "One small thing that made you smile this week.",
  "A place you’d take a visitor in your hometown, and why.",
  "Two truths and a lie about your week.",
  "The best advice you’ve ever been given, in one sentence.",
  "Describe your morning in exactly three words.",
  "Something you’re quietly good at.",
  "A talk, video, or podcast that changed how you think.",
  "If you had to teach a five-minute class tomorrow, what would it be on?",
  "A word from your first language you wish English had.",
];

/** Consecutive days of practice ending today (or yesterday, so the streak isn't lost before you practice today). */
export function streak(days: string[], today: string) {
  const set = new Set(days);
  const prev = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  let d = set.has(today) ? today : prev(today);
  let n = 0;
  while (set.has(d)) { n++; d = prev(d); }
  return n;
}

export const FEEL = ["Hard", "A stretch", "Getting easier", "Comfortable"];
