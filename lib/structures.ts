// Talk structures, hooks, and closings from the CaPS v4 sub-skills (Structure module).

export interface Structure { id: string; family: string; label: string; parts: { label: string; hint: string }[] }

export const STRUCTURES: Structure[] = [
  { id: "points", family: "General", label: "Two or three points", parts: [
    { label: "Point 1", hint: "Your first point, with an example" }, { label: "Point 2", hint: "Your second point, with an example" }, { label: "Point 3", hint: "Optional third point" }] },
  { id: "cause", family: "Informative", label: "Cause → effect", parts: [
    { label: "Cause", hint: "What happens or is done" }, { label: "Effect", hint: "What it leads to, with evidence" }, { label: "What it means", hint: "Why it matters to this audience" }] },
  { id: "compare", family: "Informative", label: "Compare and contrast", parts: [
    { label: "Option A", hint: "The first approach" }, { label: "Option B", hint: "The second approach" }, { label: "The difference", hint: "What sets them apart, and which fits when" }] },
  { id: "problem", family: "Persuasive", label: "Problem → solution", parts: [
    { label: "Problem", hint: "What’s wrong, felt by this audience" }, { label: "Solution", hint: "What you propose" }, { label: "Why it works", hint: "Evidence it will help" }] },
  { id: "aida", family: "Persuasive", label: "AIDA", parts: [
    { label: "Interest", hint: "Why this deserves their attention" }, { label: "Desire", hint: "What they gain" }, { label: "Action", hint: "What to do, made easy" }] },
  { id: "scr", family: "Business", label: "Situation, complication, resolution", parts: [
    { label: "Situation", hint: "Where things stand" }, { label: "Complication", hint: "What changed or got in the way" }, { label: "Resolution", hint: "What you recommend" }] },
  { id: "whatsowhat", family: "Business", label: "What, so what, now what", parts: [
    { label: "What", hint: "The fact or result" }, { label: "So what", hint: "Why it matters" }, { label: "Now what", hint: "The next step" }] },
  { id: "scal", family: "Story", label: "Situation, challenge, action, lesson", parts: [
    { label: "Situation", hint: "Where and when" }, { label: "Challenge", hint: "What was hard" }, { label: "Action", hint: "What you did" }, { label: "Lesson", hint: "What you learned" }] },
  { id: "star", family: "Interview", label: "STAR story", parts: [
    { label: "Situation", hint: "The context, briefly" }, { label: "Task", hint: "What you had to do" }, { label: "Action", hint: "What you did, specifically" }, { label: "Result", hint: "The outcome, with a number if you can" }] },
  { id: "prep", family: "Interview", label: "PREP (point, reason, example, point)", parts: [
    { label: "Reason", hint: "Why your point holds" }, { label: "Example", hint: "A concrete case" }, { label: "Point again", hint: "Restate it, sharper" }] },
  { id: "ppf", family: "Interview", label: "Past, present, future", parts: [
    { label: "Past", hint: "Where you started" }, { label: "Present", hint: "Where you are now" }, { label: "Future", hint: "Where you’re headed, and why here" }] },
  { id: "lightning", family: "Lightning talk", label: "Question, method, finding, implication", parts: [
    { label: "Question", hint: "What you set out to learn" }, { label: "Method", hint: "How you found out" }, { label: "Finding", hint: "What you found" }, { label: "Implication", hint: "What it means for them" }] },
];

export const HOOKS: [string, string, string][] = [
  ["story", "Personal story", "Last year, I "],
  ["question", "Question", "Have you ever "],
  ["hands", "Show of hands", "Raise your hand if "],
  ["stat", "Surprising number", "Did you know that "],
  ["claim", "Bold claim", ""],
  ["imagine", "Imagine…", "Imagine "],
  ["news", "Current event", "This week, "],
  ["humor", "Humor", ""],
];

export const CLOSES: [string, string, string][] = [
  ["summary", "Summarize", "So remember: "],
  ["callback", "Call back to the opening", "Remember "],
  ["story", "Closing story", ""],
  ["line", "Memorable line", ""],
];

export const structureOf = (id?: string) => STRUCTURES.find((s) => s.id === id) ?? STRUCTURES[0];
