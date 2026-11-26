// CaPS V4 program flows #1 and #2, as course files a new course can start from (POST /api/courses with start
// "caps1" or "caps2"). Weeks 0–7: each week's self-paced solo work, then the facilitated Collab session. The live
// session itself happens outside Questhand (Questhand is async-only): its card holds the agenda and the meeting link.
// Videos and the Virtual Speech / LinkedIn Learning links are placeholders the facilitator fills in.

type Card = Record<string, unknown> & { id: string };
type Lesson = { title: string; goal?: string; modules: Card[] };
type Week = { title: string; lessons: Lesson[] };
export type CourseFile = { title: string; subtitle?: string; weeks: Week[] };

const content = (id: string, title: string, body: string, minutes = 5): Card => ({ id, type: "read", kind: "content", title, body, minutes });
const answer = (id: string, title: string, body: string, minutes = 10): Card => ({ id, type: "submit", kind: "answer", title, body, minutes });
const poll = (id: string, title: string, text: string, options: string[], opts: { multi?: boolean; next?: (string | string[] | null)[]; body?: string } = {}): Card => ({
  id, type: "practice", kind: "choice", poll: true, title, body: opts.body ?? "",
  questions: [{ id: `${id}-q`, text, options, ...(opts.multi ? { kind: "multi" } : {}), ...(opts.next ? { next: opts.next } : {}) }],
});
const group = (id: string, title: string, body: string, members: string[]): Card => ({ id, type: "group", kind: "group", title, body, members });
const discussion = (id: string, title: string, body: string, replies = 2): Card => ({
  id, type: "wall", kind: "discussion", title, body, minutes: 15,
  wall: { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false, replies, structured: true },
});
const worksheet = (id: string, title: string, body: string, minutes = 20): Card => ({ id, type: "read", kind: "worksheet", writers: "each", title, body, minutes });

/** The Collab session's card: what happens in it, and where to join (the facilitator adds the date and link). */
const session = (id: string, title: string, steps: string[]): Card =>
  content(id, title, `**When:** this lesson’s date. Add the time here.\n**Join:** add the Zoom, Meet or Teams link to this card; students get a Join button.\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`, 60);
const beforeLeaving = (id: string) => answer(id, "Before leaving: one thing to work on", "Name one thing you’ll work on before the next session, and how you’ll practise it.", 3);

/** Intro survey (Week 0 in both flows): a card group of a poll and open answers. */
const introSurvey = (p: string): Card[] => [
  group(`${p}-survey`, "Intro survey", "A few questions so your facilitator knows where you’re starting from.", [`${p}-why`, `${p}-prior`, `${p}-hopes`]),
  poll(`${p}-why`, "Why you joined", "Why did you join CaPS? Pick all that apply.", ["Job interviews", "Presenting at work or school", "Pitching myself or an idea", "Confidence speaking up", "Speaking in English"], { multi: true }),
  answer(`${p}-prior`, "Your experience so far", "What training or practice in speaking and presenting have you had before?", 5),
  answer(`${p}-hopes`, "Hopes and concerns", "What do you hope to get from CaPS? Is anything worrying you about it?", 5),
];

// ——— Flow #1: Virtual Speech for content and practice; three tracks in Weeks 2–6 ———

const TRACKS = ["Elevator pitch", "Presentation (public speaking)", "Interviewing"];

function flow1Practice(n: number): Week {
  const p = `f1w${n}`;
  return {
    title: `Week ${n} · Track practice`,
    lessons: [{
      title: "Practise your track",
      goal: "Work on the track you pick, and come ready to share something in the Collab session.",
      modules: [
        poll(`${p}-track`, "Pick this week’s track", "Which track will you work on this week?", TRACKS, {
          body: "You can repeat a track from an earlier week.",
          next: TRACKS.map((_, i) => `${p}-t${i}`),
        }),
        ...TRACKS.map((t, i) => content(`${p}-t${i}`, `Track: ${t}`, `Open the **${t}** course in Virtual Speech (add the link here). Work through this week’s part, then practise with the avatar role-play and read its feedback.`, 45)),
        answer(`${p}-share`, "What you’ll share", "Everyone shares something every week. Record or upload what you’ll bring to the session, and say what you want feedback on.", 10),
        session(`${p}-session`, `Collab session ${n}`, ["Icebreaker: build community and prime the topic", "Groups and roles: assign roles and hand out the peer-feedback scaffold", "Practice: practise and give peer feedback", "Before leaving: each person names one thing to work on"]),
        discussion(`${p}-feedback`, "Peer feedback", "Post the take you practised in the session (or a new one). Give two people in your group feedback: what you noticed, the effect it had, and one thing to try next."),
        beforeLeaving(`${p}-next`),
      ],
    }],
  };
}

export function capsFlow1(): CourseFile {
  return {
    title: "CaPS V4 · Flow 1",
    subtitle: "Virtual Speech practice, three tracks, weekly Collab sessions",
    weeks: [
      { title: "Week 0 · Orient to CaPS", lessons: [{ title: "Orient to CaPS", goal: "Meet CaPS and tell us where you’re starting from.", modules: [
        content("f1w0-video", "Welcome to CaPS", "Watch the intro video: communication skills and CaPS, with stories from past participants. (Add the video here.)", 5),
        ...introSurvey("f1w0"),
        content("f1w0-ready", "Get ready for Week 1", "Once you’re accepted: set up your Virtual Speech account (add the link) and try one short practice so it’s familiar. There’s no Collab session this week; the group first meets in Week 1.", 10),
      ] }] },
      { title: "Week 1 · Personal pitch", lessons: [{ title: "Develop a short personal pitch", goal: "Everyone develops a one-minute personal pitch.", modules: [
        content("f1w1-course", "Personal pitch in Virtual Speech", "Open the personal pitch course and practice in Virtual Speech (add the link). Work through it and practise with the avatar.", 45),
        answer("f1w1-pitch", "Record your 1-minute pitch", "Record your personal pitch on camera (about one minute). You’ll practise it with your group in the session.", 15),
        session("f1w1-session", "Session 1: intro to CaPS", ["Intro to CaPS: facilitator, norms, skill levels, round-robin intros", "Groups and roles (optional)", "Peer practice and feedback on pitches", "Identify one thing to work on next"]),
        discussion("f1w1-feedback", "Pitch feedback", "Post your pitch. Give two classmates feedback: what you noticed, the effect it had, and one thing to try next."),
        beforeLeaving("f1w1-next"),
      ] }] },
      ...[2, 3, 4, 5, 6].map(flow1Practice),
      { title: "Week 7 · Next steps", lessons: [{ title: "Plan next steps and celebrate", goal: "Plan how to keep improving, and celebrate your progress.", modules: [
        content("f1w7-finish", "Finish up (optional)", "Complete anything you haven’t finished yet.", 10),
        content("f1w7-keep", "Keep learning", "The best ways to keep practising after CaPS, and how to keep using the tools you’ve learned.", 10),
        group("f1w7-debrief", "Debrief", "Tell us what worked and what didn’t, so we can improve CaPS.", ["f1w7-rate", "f1w7-worked", "f1w7-ideas"]),
        poll("f1w7-rate", "How useful was CaPS?", "How useful was CaPS for you?", ["Very useful", "Somewhat useful", "Not very useful"]),
        answer("f1w7-worked", "What worked, what didn’t", "What worked best for you? What didn’t?", 5),
        answer("f1w7-ideas", "Ideas to improve CaPS", "One idea that would make CaPS better.", 5),
        session("f1w7-session", "Final session: celebrate", ["Keep learning: best ways to practise", "Debrief: what worked, what didn’t", "Celebrate and hand out certificates"]),
      ] }] },
    ],
  };
}

// ——— Flow #2: sequenced weeks, focus areas picked each week, LinkedIn Learning videos ———

type Topic = { n: number; name: string; tag: "learn" | "practice"; focus: string[] };
const TOPICS: Topic[] = [
  { n: 1, name: "Foundational concepts 1", tag: "learn", focus: ["Audience identification", "Attention-grabbing intro", "Personal credibility", "Establishing importance", "Persuasive evidence", "Transitions", "Compelling conclusion"] },
  { n: 2, name: "Foundational concepts 2", tag: "learn", focus: ["The STAR method (interviewing)", "The presentation body", "Virtual setup: camera and lighting"] },
  { n: 3, name: "Delivery 1: your voice", tag: "practice", focus: ["Pace and tempo", "Pitch, volume and expressiveness", "Reducing filler words", "Clarity and articulation"] },
  { n: 4, name: "Delivery 2: body language", tag: "practice", focus: ["Posture", "Purposeful gesture", "Eye contact and connecting", "Movement and use of space", "Facial expression"] },
  { n: 5, name: "Rehearsal and recall", tag: "practice", focus: ["Rehearsal strategies", "Speaking from notes", "Remembering your flow", "Recovering when you lose your place"] },
  { n: 6, name: "Visual support", tag: "practice", focus: ["Slide design principles", "Showing data clearly", "Things not to do"] },
];
const vid = (n: number, i: number) => `f2w${n}-v${i}`;
/** "Choose focus": a pick-all-that-apply poll whose picks deal that week's videos. */
const chooseFocus = (id: string, t: Topic) =>
  poll(id, `Choose your Week ${t.n} focus`, `Which areas of ${t.name.toLowerCase()} do you want to work on? Pick all that apply.`, t.focus, { multi: true, next: t.focus.map((_, i) => vid(t.n, i)), body: "Your picks decide which videos and activities you get." });
const selfAssess = (id: string, t: Topic) => poll(id, "Self-assessment", `How confident are you with ${t.name.toLowerCase()} right now?`, ["Not yet", "Getting there", "Confident"], { body: `Week ${t.n} check-in on what you need.` });
const journal = (id: string, practice: boolean) => practice
  ? answer(id, "Practice Journal", "Your takeaways from this week’s practice, and how you’d rate your recording against the video’s checklist.", 10)
  : answer(id, "Learning Journal", "Key takeaways, your strengths, the areas you want to improve, and questions to bring to the Collab session.", 10);
const revise = (id: string) => content(id, "Revise your speech (optional)", "Go back to your Speech Starter in Week 0 and improve your draft with what you’ve learned. Be ready to share it in the Collab session.", 15);

function flow2Week(t: Topic, pickedEarlier: boolean): Week {
  const p = `f2w${t.n}`;
  const videos = t.focus.map((f, i) => content(vid(t.n, i), `Video: ${f}`, t.tag === "practice"
    ? `Watch the LinkedIn Learning video on ${f.toLowerCase()} (add the link), then do its practice activity: record yourself practising it on camera.`
    : `Watch the LinkedIn Learning video on ${f.toLowerCase()} (add the link). Jot Learning Journal notes as you go.`, 10));
  const modules: Card[] = [];
  if (!pickedEarlier) modules.push(selfAssess(`${p}-self`, t), chooseFocus(`${p}-focus`, t));
  modules.push(...videos, content(`${p}-more`, "More growth areas (optional)", `Every Week ${t.n} video, for the areas you didn’t pick: ${t.focus.join(", ")}.`, 10));
  if (t.tag === "learn") {
    modules.push(journal(`${p}-journal`, false), revise(`${p}-revise`));
    if (t.n === 2) modules.push(answer(`${p}-camera`, "Camera setup (optional)", "Record a few seconds of yourself with your camera and lighting set up for a virtual presentation or interview.", 5));
    modules.push(session(`${p}-session`, `Collab session ${t.n}: discuss and learn`, ["Icebreaker: build community and prime the topic", "Discuss and learn: facilitator-led, with suggested materials and activities", "Before leaving: preview next week and name one thing to work on"]));
  } else {
    if (t.n === 6) modules.push(answer(`${p}-visuals`, "Create visuals", "Build slides for your speech and upload them.", 30));
    modules.push(
      answer(`${p}-record`, t.n === 6 ? "Record your full speech with visuals" : "Record your practice", "Record yourself practising on camera. Record again as many times as you like, and keep your strongest take.", 20),
      journal(`${p}-journal`, true),
      discussion(`${p}-best`, "Best take and feedback focus", "Post your strongest take, and say what you want peers to watch for. In your group, give two people feedback: what you noticed, the effect it had, and one thing to try next."),
      session(`${p}-session`, `Collab session ${t.n}: peer feedback`, ["Icebreaker: build community and prime the topic", "Peer feedback: handout with logistics and tips; groups start", "Before leaving: preview next week and name one thing to work on"]),
    );
  }
  modules.push(beforeLeaving(`${p}-next`));
  return { title: `Week ${t.n} · ${t.name}`, lessons: [{ title: t.name.charAt(0).toUpperCase() + t.name.slice(1), goal: t.tag === "learn" ? "Learn and reflect." : "Deliberate practice.", modules }] };
}

export function capsFlow2(): CourseFile {
  const w1 = TOPICS[0];
  return {
    title: "CaPS V4 · Flow 2",
    subtitle: "Sequenced weeks: pick your focus, watch, practise, Collab session",
    weeks: [
      { title: "Week 0 · Preparation", lessons: [{ title: "Preparation", goal: "Meet CaPS, share your goals, draft a first speech, and choose what to explore in Week 1.", modules: [
        content("f2w0-video", "Welcome to CaPS", "Watch the intro video: an overview of CaPS, with stories from past participants. (Add the video here.)", 5),
        ...introSurvey("f2w0"),
        worksheet("f2w0-starter", "Speech Starter", "## My first speech\n\n**Title:** \n\n**Who is my audience, and what do they care about?** \n\n**My goal: what should they think or do afterwards?** \n\n**Opening that grabs attention:** \n\n**Why it matters to them:** \n\n| Main point | My evidence or story |\n| --- | --- |\n| 1 | |\n| 2 | |\n| 3 | |\n\n**Transitions between points:** \n\n**Conclusion and call to action:** ", 25),
        // The Week 0 picks deal Week 1's videos (Week 1 has no Choose focus of its own).
        chooseFocus("f2w0-focus", w1),
      ] }] },
      ...TOPICS.map((t) => flow2Week(t, t.n === 1)),
      { title: "Week 7 · Wrap-up", lessons: [{ title: "Wrap-up", goal: "Plan how to keep improving, reflect on CaPS, and celebrate your progress.", modules: [
        content("f2w7-finish", "Finish up (optional)", "Complete anything left over.", 10),
        content("f2w7-keep", "Keep learning", "Ways to keep practising, and how to keep using the CaPS tools.", 10),
        group("f2w7-debrief", "Debrief", "What worked, what didn’t, and how to improve CaPS.", ["f2w7-rate", "f2w7-worked", "f2w7-ideas"]),
        poll("f2w7-rate", "How useful was CaPS?", "How useful was CaPS for you?", ["Very useful", "Somewhat useful", "Not very useful"]),
        answer("f2w7-worked", "What worked, what didn’t", "What worked best for you? What didn’t?", 5),
        answer("f2w7-ideas", "Ideas to improve CaPS", "One idea that would make CaPS better.", 5),
        session("f2w7-session", "Final session: celebrate", ["Keep learning: ways to practise and keep using CaPS tools", "Debrief: what worked, what didn’t", "Celebrate and hand out certificates"]),
      ] }] },
    ],
  };
}
