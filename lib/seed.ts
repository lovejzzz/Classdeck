import { isoDay } from "./grading";
import type { Attachment, ClassEvent, Mark, Course, Feedback, Lesson, Module, Post, ProgressMap, SessionPlan, StudioPost } from "./types";

// The demo course: CaPS, a seven-week presentation skills course (Week 0 onboarding + six skill weeks),
// built from the CaPS Week 0–6 course plan. Each week has one common theme and six cards; one card per
// week comes in two versions that students choose between (Guided and Stretch).

const S = "/samples/caps";
const ask = { connector: "ai", action: "ask", label: "Ask the coach" };
const define = { connector: "dictionary", action: "define", label: "Define a word" };
const better = { connector: "words", action: "better", label: "Find a better word" };
const coach = (target: number) => ({ connector: "speech", action: "analyze", label: "Check my script", defaults: { target: String(target) } });
const grammarCheck = { connector: "grammar", action: "check", label: "Check my writing" };
const draftFeedback = { connector: "ai", action: "feedback", label: "Get feedback on my draft" };
const A = (id: string, kind: Attachment["kind"], url: string, name: string, size?: number): Attachment => ({ id, kind, url, name, size });

function M(id: string, type: Module["type"], title: string, body: string, o: Partial<Module> = {}): Module {
  return { id, type, title, body, audience: { kind: "all" }, tools: [], ...o };
}

/** Two versions of one card that students pick between. */
function paths(slot: string, guided: Module, stretch: Module): Module[] {
  return [
    { ...guided, audience: { kind: "branch", slot, variant: "Guided" } },
    { ...stretch, audience: { kind: "branch", slot, variant: "Stretch" } },
  ];
}

const session = (minutes: number, ...agenda: [string, number, boolean?][]): SessionPlan => ({
  minutes,
  agenda: agenda.map(([label, m, rr]) => ({ label, minutes: m, roundRobin: rr || undefined })),
});

const students = [
  ["s1", "Mia"], ["s2", "Leo"], ["s3", "Ava"], ["s4", "Noah"], ["s5", "Zoe"], ["s6", "Ethan"],
  ["s7", "Lily"], ["s8", "Owen"], ["s9", "Priya"], ["s10", "Mateo"], ["s11", "Hana"], ["s12", "Sam"],
].map(([id, name]) => ({ id, name }));

const weeks: { id: string; title: string; lesson: Lesson }[] = [
  {
    id: "w0",
    title: "Week 0",
    lesson: {
      id: "l0",
      title: "Onboarding and peer feedback",
      goal: "Establish an initial performance, identify personal goals, and learn to give specific peer feedback.",
      branches: { w0p: { s2: "Stretch", s3: "Stretch" } },
      choiceSlots: ["w0p"],
      session: session(60, ["Introductions and group agreements", 10], ["Feedback example", 10], ["Round-robin presentations", 30, true], ["Personal goals and closing", 10]),
      modules: [
        M("w0-1", "read", "Welcome and course overview",
          "Over seven weeks you’ll build one real presentation, 4–5 minutes long, and get better at six skills along the way: audience and purpose, structure and storytelling, vocal delivery, body language and presence, rehearsal and recall, and visual support.\n\nEach week has one common theme. You choose the practice activities that fit your level, keep drafts on your personal board, and bring one piece of work to your Collab Studio group for feedback.\n\nTo start: choose a real communication context (an interview, a research presentation, a project pitch, a class talk) and describe one aspect of your speaking you want to improve.",
          { minutes: 10, submitTo: "personal", criteria: "You’ve named a real speaking context and one thing to improve.", skills: [], attachments: [A("a-w0-map", "image", `${S}/skills-map.svg`, "The six skill areas")],
            questions: [{ id: "w0q1", text: "Where do you keep drafts and first recordings?", options: ["In the Collab Studio", "On your personal board", "On the class wall"], answer: 1, explain: "Your personal board holds your own drafts; Collab Studio is where you bring one piece for feedback." }] }),
        M("w0-2", "selfcheck", "My starting point",
          "Rate yourself on each of the six skill areas using the four levels (Starting, Developing, Meeting the goal, Adapting). Be honest: this is your baseline, and you’ll compare against it in Week 6.\n\nThen record a 90-second introduction or project overview. Keep this original version on your personal board; don’t re-record it until it’s perfect.",
          { minutes: 20, submitTo: "personal", criteria: "All six skills rated and a 90-second recording saved.", skills: ["audience", "structure", "vocal", "body", "rehearsal", "visual"] }),
        ...paths("w0p",
          M("w0-3g", "practice", "Three-step speech starter",
            "Try your introduction again using three steps:\n\n1. Say who you are and what you are talking about.\n2. Make one main point, with one example.\n3. Give one takeaway, and thank the audience.\n\nRecord the new version and keep it next to your first one.",
            { minutes: 15, submitTo: "personal", criteria: "A second recording that follows the three steps.", skills: ["structure"], tools: [ask] }),
          M("w0-3s", "practice", "Same talk, new audience",
            "If you’ve presented before: give your introduction again for a different audience (for example, a hiring manager instead of classmates, or a ten-year-old instead of an expert).\n\nRecord it, then note what you changed and why: vocabulary, detail, the example you chose.",
            { minutes: 15, submitTo: "personal", criteria: "A recording for a new audience and a note explaining your adjustments.", skills: ["audience"], tools: [ask] })),
        M("w0-4", "wall", "Giving good feedback",
          "Listen to the same teacher example your peers are hearing. Then post your feedback on the wall in three parts:\n\n• What worked.\n• What evidence you noticed (a word, a moment, a timestamp).\n• What the speaker could try next.\n\nGood feedback describes something observable, explains its effect on you, and offers one thing to try. “It was good” isn’t feedback yet. When you’ve posted, vote for the two most specific posts from your classmates.",
          { minutes: 15, submitTo: "studio", criteria: "One post with a specific observation and a suggestion, and two votes.", skills: [], attachments: [A("a-w0-fb", "audio", `${S}/feedback-example.m4a`, "Teacher example: take the stairs (20 sec)")], tools: [ask],
            wall: { posting: "students", comments: true, reactions: "votes", anonymous: false, approval: false } }),
        M("w0-5", "studio", "First Collab Studio session",
          `Share your initial presentation and one goal with your group. In the session you’ll practice taking turns, keeping time, and restating another person’s message before you respond.`,
          { minutes: 60, submitTo: "studio", criteria: "You posted your initial presentation and gave one peer a suggestion backed by a specific observation.", skills: [] }),
        M("w0-6", "reflect", "My practice commitment",
          "Write down your goal for the course, how much time you plan to practice each week, and any support you need. If speaking in front of people makes you anxious, you can say so here; it’s only visible to you and your teacher.",
          { minutes: 10, submitTo: "personal", criteria: "Goal, practice time, and support needs recorded." }),
      ],
    },
  },
  {
    id: "w1",
    title: "Week 1",
    lesson: {
      id: "l1",
      title: "Audience and purpose",
      goal: "Explain who the audience is, what they need to know, and what you want them to do after listening.",
      branches: { w1p: { s5: "Guided", s7: "Guided", s2: "Stretch", s9: "Stretch" } },
      choiceSlots: ["w1p"],
      session: session(60, ["Diagnostic and example", 10], ["Audience analysis", 10], ["Round-robin practice and feedback", 30, true], ["Revision commitments", 10]),
      modules: [
        M("w1-1", "explore", "This week’s goal",
          "Choose one specific audience for your presentation. Describe:\n\n• What they already know about your topic.\n• What matters to them.\n• The one action you want them to take after listening.",
          { minutes: 10, submitTo: "personal", criteria: "A short audience analysis with all three parts.", skills: ["audience"], tools: [ask] }),
        M("w1-2", "explore", "One topic, two audiences",
          "Read both versions of the same explanation. Note the differences in vocabulary, level of detail, and emphasis.\n\nFor city engineers: “Permeable pavement reduces peak stormwater runoff by 30–50% by allowing infiltration into the sub-base, lowering the load on combined sewer systems during high-intensity rainfall.”\n\nFor neighbors at a town meeting: “You know how the street floods after a big storm? This new kind of pavement soaks up rain like a sponge, so less water rushes into the drains and our basements stay dry.”\n\nWhich words changed? What did each version leave out, and why?",
          { minutes: 15, submitTo: "personal", criteria: "Three differences noted, with a reason for each.", skills: ["audience"], tools: [define, ask] }),
        M("w1-3", "practice", "My core message",
          "Write the main point of your presentation in one sentence. Then go through your notes and cross out anything that doesn’t support that sentence.\n\nA useful test: could someone in your audience repeat your sentence to a friend afterwards?",
          { minutes: 10, submitTo: "personal", criteria: "One core-message sentence, and a list of what you cut.", skills: ["audience"], tools: [better, ask] }),
        M("w1-q", "quiz", "Quick check: audience and purpose",
          "Four quick questions on this week’s ideas. You get two tries; your best score counts.",
          { minutes: 5, skills: ["audience"], attempts: 2, questions: [
            { id: "w1q1", text: "You’re speaking to neighbors at a town meeting. Which sentence fits them best?",
              options: ["Peak runoff falls 30–50% through sub-base infiltration.", "This pavement soaks up rain like a sponge, so basements stay dry.", "Permeability coefficients vary with the aggregate used."], answer: 1,
              explain: "Non-specialists need a picture and a reason to care, not the technical cause." },
            { id: "w1q2", text: "What’s the best test of a core message?",
              options: ["It uses technical terms correctly", "Someone could repeat it to a friend afterwards", "It’s longer than 30 words", "It includes a statistic"], answer: 1,
              explain: "If listeners can restate it in one sentence, it landed." },
            { id: "w1q3", kind: "short", text: "In one word: before you write anything, what should you choose first?", options: [], accept: ["audience", "your audience", "the audience", "an audience"],
              explain: "Every other choice (vocabulary, examples, level of detail) depends on who is listening." },
            { id: "w1q4", text: "After listening, your audience should…",
              options: ["Know everything you know", "Take the one action you planned", "Remember every slide", "Have no questions"], answer: 1,
              explain: "Purpose is what you want them to do, not how much they absorb." },
          ] }),
        ...paths("w1p",
          M("w1-4g", "practice", "One-minute practice (guided)",
            "Explain your topic in 60–90 seconds. Use these prompts to plan it:\n\n• Who am I speaking to?\n• Why does this topic matter to them?\n• What do I want to happen when I’m done?\n\nInclude one example that is relevant to your audience. Record it and save it on your personal board.",
            { minutes: 20, submitTo: "personal", criteria: "A 60–90 second recording with an audience-relevant example.", skills: ["audience"], tools: [coach(60), ask], timer: 60,
              checklist: ["Plan with the three prompts", "Include one example that matters to your audience", "Record a 60–90 second take", "Listen back once before you save it"] }),
          M("w1-4s", "practice", "One-minute practice (two audiences)",
            "Record two 60–90 second versions of your topic: one for specialists and one for non-specialists. Then explain your choices: what you added, removed, or reworded for each, and why.",
            { minutes: 25, submitTo: "personal", criteria: "Two recordings and a short explanation of your choices.", skills: ["audience"], tools: [coach(60), ask], timer: 60,
              checklist: ["Record the specialist version", "Record the non-specialist version", "Explain what you added, removed, or reworded"] })),
        M("w1-5", "studio", "Ask the audience to restate the message",
          `Post your one-minute practice for the group with your audience, purpose, and a feedback question. Ask each peer to restate the core message they heard, in one sentence.`,
          { minutes: 60, submitTo: "studio", criteria: "Peers can restate your main point with reasonable accuracy.", skills: ["audience"] }),
        M("w1-6", "reflect", "Revise using feedback",
          "Compare what you meant with what your peers understood. Revise your opening or your example, and record the single most important change you made.",
          { minutes: 15, submitTo: "personal", criteria: "One revision made, and the change explained.", skills: ["audience"], tools: [draftFeedback, grammarCheck],
            prompts: ["What did your peers think your core message was?", "What did you change: your opening or your example?", "Why will that change help your audience?"] }),
      ],
    },
  },
  {
    id: "w2",
    title: "Week 2",
    lesson: {
      id: "l2",
      title: "Structure and storytelling",
      goal: "Organize an opening, body, and closing, and support the core message with a relevant example or story.",
      branches: {},
      choiceSlots: ["w2p"],
      session: session(60, ["Opening examples", 10], ["Outline review", 10], ["Presentations and peer feedback", 30, true], ["Revision and closing", 10]),
      modules: [
        M("w2-1", "explore", "Choose a structure",
          "Pick one structure that fits your presentation:\n\n• Cause and effect, or comparison: for an informative talk.\n• STAR (Situation, Task, Action, Result): for an interview story.\n• Problem → solution: for a persuasive talk.\n\nSay which one you chose and why it suits your audience.",
          { minutes: 10, submitTo: "personal", criteria: "A structure chosen, with a reason.", skills: ["structure"], attachments: [A("a-w2-st", "image", `${S}/structure.svg`, "Opening, body, closing")] }),
        M("w2-2", "explore", "Observe openings and closings",
          "Listen to two openings on a similar topic. For each one, identify the hook, where the core message appears, and what the audience is asked to do at the end.\n\nWhich opening made you want to keep listening? What exactly did it do?",
          { minutes: 15, submitTo: "personal", criteria: "Hook, core message, and call to action identified for both.", skills: ["structure"], attachments: [A("a-w2-oa", "audio", `${S}/opening-a.m4a`, "Opening A"), A("a-w2-ob", "audio", `${S}/opening-b.m4a`, "Opening B")] }),
        M("w2-w", "wall", "Hooks that worked",
          "Post one opening line that made you want to keep listening (from a talk, a video, or a classmate) in the column for its kind of hook. Upvote the two you’d steal.",
          { minutes: 10, skills: ["structure"], wall: { posting: "students", comments: true, reactions: "votes", anonymous: false, approval: false, sections: ["A question", "A story", "A surprising fact"] } }),
        M("w2-3", "practice", "Build my story bank",
          "Write down one experience that relates to your topic. Describe the situation, what you did, and the result. Then say which point in your presentation the story supports.",
          { minutes: 15, submitTo: "personal", criteria: "One story with situation, action, result, and the point it supports.", skills: ["structure"], tools: [ask] }),
        ...paths("w2p",
          M("w2-4g", "practice", "Three-minute structure practice (outline)",
            "Use the scaffolded outline to plan an opening, two or three points with examples, transitions, and a closing. Then deliver a 2–3 minute presentation from the outline and record it.",
            { minutes: 25, submitTo: "personal", criteria: "A completed outline and a 2–3 minute recording.", skills: ["structure"], attachments: [A("a-w2-tpl", "file", `${S}/outline-template.txt`, "outline-template.txt", 912)], tools: [coach(180), ask] }),
          M("w2-4s", "practice", "Three-minute structure practice (restructure)",
            "Outline and record a 2–3 minute version of your talk. Then reorganize the same content using a different structure and record that too. Which one suits your audience better, and why?",
            { minutes: 30, submitTo: "personal", criteria: "Two outlines, two recordings, and a comparison.", skills: ["structure"], tools: [coach(180), ask] })),
        M("w2-5", "studio", "Ask listeners to map the structure",
          `Post your structure practice. Ask peers to write down the sequence they heard and mark one point where it was easy, or hard, to follow.`,
          { minutes: 60, submitTo: "studio", criteria: "Listeners can identify your opening, main points, and closing.", skills: ["structure"] }),
        M("w2-6", "reflect", "Revise the structure",
          "Change one part of the sequence or one transition. Keep both the original and the revised outline, and explain the change.",
          { minutes: 15, submitTo: "personal", criteria: "Original and revised outlines kept, change explained.", skills: ["structure"],
            prompts: ["Which part of the sequence or which transition did you change?", "Where did listeners get lost before?", "How does the new version fix that?"] }),
      ],
    },
  },
  {
    id: "w3",
    title: "Week 3",
    lesson: {
      id: "l3",
      title: "Vocal delivery",
      goal: "Adjust pace, pauses, emphasis, and volume on purpose to make your message easier to understand.",
      branches: {},
      choiceSlots: ["w3p"],
      session: session(60, ["Listening and examples", 10], ["Paired practice", 15], ["Comparisons and feedback", 25, true], ["Reflection", 10]),
      modules: [
        M("w3-1", "explore", "Choose one vocal delivery goal",
          "Pick one: pace, pauses, emphasis, volume, or filler words. Explain why this is your priority right now. Your Week 0 recording is a good place to look for evidence.",
          { minutes: 5, submitTo: "personal", criteria: "One goal chosen, with evidence from your own recording.", skills: ["vocal"] }),
        M("w3-2", "explore", "Hear the difference",
          "Listen to two deliveries of the same passage. Which one is easier to understand? Point to a specific sentence and explain what made the difference.",
          { minutes: 10, submitTo: "personal", criteria: "A specific sentence identified and the difference explained.", skills: ["vocal"], attachments: [A("a-w3-r", "audio", `${S}/vocal-rushed.m4a`, "Delivery 1"), A("a-w3-p", "audio", `${S}/vocal-paced.m4a`, "Delivery 2")] }),
        M("w3-3", "practice", "Mark the passage",
          "Take a 60–90 second passage from your talk. Mark it up:\n\n/ a short pause    // a long pause    UPPERCASE for a word to emphasize\n\nExample: “The hardest part / is the first TEN seconds // when everyone decides / whether to listen.”",
          { minutes: 15, submitTo: "personal", criteria: "A marked-up passage of 60–90 seconds.", skills: ["vocal"] }),
        ...paths("w3p",
          M("w3-4g", "practice", "Two comparable attempts (one variable)",
            "Use one short passage and change only one thing, such as your pace. Record your usual delivery, then record the marked version. Keep both, and note a timestamp where you can hear the change.",
            { minutes: 20, submitTo: "personal", criteria: "Two recordings of the same passage and one timestamped change.", skills: ["vocal"], tools: [ask] }),
          M("w3-4s", "practice", "Two comparable attempts (tone and density)",
            "Record your usual delivery and a marked version. Then try a third take in a different tone or for a different context (a noisy room, a formal panel). Note timestamps for each change you made.",
            { minutes: 25, submitTo: "personal", criteria: "At least two comparable recordings with timestamped changes.", skills: ["vocal"], tools: [ask] })),
        M("w3-5", "studio", "Listener feedback",
          `Post both versions. Peers explain which one is easier to understand and point to specific evidence. If you use an AI tool for suggestions, check whether they actually fit your goal.`,
          { minutes: 60, submitTo: "studio", criteria: "Two comparable versions posted and feedback given to two peers.", skills: ["vocal"] }),
        M("w3-6", "reflect", "Record an effective strategy",
          "What did you change? How did listeners respond? What will you keep doing in your next practice?",
          { minutes: 10, submitTo: "personal", criteria: "One strategy you’ll keep, with evidence.", skills: ["vocal"] }),
      ],
    },
  },
  {
    id: "w4",
    title: "Week 4",
    lesson: {
      id: "l4",
      title: "Body language and presence",
      goal: "Use posture, gesture, eye contact, and space to support the message.",
      branches: {},
      choiceSlots: ["w4p"],
      session: session(60, ["Observation example", 10], ["Paired practice", 10], ["Round-robin presentations and feedback", 30, true], ["Reflection", 10]),
      modules: [
        M("w4-1", "explore", "Choose a nonverbal goal",
          "Review your earlier recordings. Choose posture, eye contact, gesture, or movement, and explain how it relates to this presentation. Seated delivery and alternatives to direct eye contact are completely fine; choose what fits you.",
          { minutes: 10, submitTo: "personal", criteria: "One nonverbal goal, connected to your talk.", skills: ["body"] }),
        M("w4-2", "explore", "Connect movement with meaning",
          "Watch the example in class twice: first with the sound off, then with sound. Write down where a movement helped you understand, and where it got in the way.",
          { minutes: 15, submitTo: "personal", criteria: "At least two moments noted, one helpful and one distracting.", skills: ["body"] }),
        M("w4-3", "practice", "Plan three moments",
          "Mark three places in your outline where a gesture, eye contact, or a pause could support your message. For each, say what it’s for.",
          { minutes: 15, submitTo: "personal", criteria: "Three planned moments, each with a purpose.", skills: ["body"] }),
        ...paths("w4p",
          M("w4-4g", "practice", "Standing presentation (one behavior)",
            "Record a 2–3 minute presentation with your movement visible. Focus on one behavior only, and do it consistently. Keep your own observation notes with the recording.",
            { minutes: 20, submitTo: "personal", criteria: "A video recording and your observation notes.", skills: ["body"] }),
          M("w4-4s", "practice", "Standing presentation (new space)",
            "Record a 2–3 minute presentation in a different arrangement: a larger room, a circle of chairs, or standing beside a screen. Note how you adapted your movement to the space.",
            { minutes: 25, submitTo: "personal", criteria: "A video recording and notes on how you adapted.", skills: ["body"] })),
        M("w4-5", "studio", "Group observation and feedback",
          `Post your recording. Peers identify specific movements using timestamps or sentences, and explain their effect on understanding and connection.`,
          { minutes: 60, submitTo: "studio", criteria: "Practice and observation notes posted; two peers given timestamped feedback.", skills: ["body"] }),
        M("w4-6", "reflect", "Make a deliberate adjustment",
          "Pick one piece of feedback and practice a passage again. Record what improved and what still feels difficult.",
          { minutes: 15, submitTo: "personal", criteria: "One adjustment practiced and described.", skills: ["body"] }),
      ],
    },
  },
  {
    id: "w5",
    title: "Week 5",
    lesson: {
      id: "l5",
      title: "Rehearsal and recall",
      goal: "Speak from an outline and recover the flow after losing your place or being interrupted.",
      branches: {},
      choiceSlots: ["w5p"],
      session: session(60, ["Rehearsal strategies", 10], ["Recovery practice", 10], ["Group rehearsal", 30, true], ["Final presentation preparation", 10]),
      modules: [
        M("w5-1", "explore", "Prepare the full presentation",
          "Bring together your audience analysis, structure, vocal delivery, and body language. List the main sections of your presentation and the core message of each.",
          { minutes: 20, submitTo: "personal", criteria: "Main sections listed with one idea each.", skills: ["rehearsal"] }),
        M("w5-2", "practice", "From script to speaking notes",
          "Reduce your full script to key words and transition prompts, keeping one main idea per section. Use the template if it helps.",
          { minutes: 20, submitTo: "personal", criteria: "Speaking notes with key words and transitions.", skills: ["rehearsal"], attachments: [A("a-w5-tpl", "file", `${S}/speaking-notes-template.txt`, "speaking-notes-template.txt", 512)] }),
        M("w5-3", "practice", "Plan three short rehearsals",
          "Rehearse three times, each with a different focus: sequence, delivery, then timing. Before each one, write its goal; after it, write the result.",
          { minutes: 30, submitTo: "personal", criteria: "Goal and result recorded for at least two rehearsals.", skills: ["rehearsal"] }),
        ...paths("w5p",
          M("w5-4g", "practice", "Practice recovery (numbered notes)",
            "Number your speaking notes and split your talk into shorter sections. In a low-stakes run, stop on purpose mid-section, find your number, say the transition, and continue.",
            { minutes: 20, submitTo: "personal", criteria: "One recorded recovery using your numbered notes.", skills: ["rehearsal"] }),
          M("w5-4s", "practice", "Practice recovery (fewer prompts)",
            "Cut your prompts down further. Ask someone to interrupt you with an unexpected question, answer it, then return to your point. Also practice deciding what to drop when you’re told you have one minute less.",
            { minutes: 25, submitTo: "personal", criteria: "A recorded recovery after a question and a shortened version.", skills: ["rehearsal"] })),
        M("w5-5", "studio", "Group rehearsal",
          `Deliver a 3–4 minute presentation to your group. Ask peers to watch for clarity, how you use your notes, and how you recover after an interruption.`,
          { minutes: 60, submitTo: "studio", criteria: "One complete presentation delivered; feedback given to two peers.", skills: ["rehearsal"] }),
        M("w5-6", "submit", "Prepare the final work",
          "Write your next revision priority. Then hand in your Week 6 topic, audience, and the visual support you plan to use.",
          { minutes: 10, submitTo: "personal", criteria: "Topic, audience, and planned visual support handed in.", skills: ["rehearsal", "visual"] }),
      ],
    },
  },
  {
    id: "w6",
    title: "Week 6",
    lesson: {
      id: "l6",
      title: "Visual support and final presentation",
      goal: "Use visual support to reinforce the core message, deliver an integrated presentation, and explain your progress and next steps.",
      branches: {},
      choiceSlots: ["w6p"],
      session: session(75, ["Opening", 7], ["Final presentations and feedback (about 8 min each)", 48, true], ["Comparing work", 10], ["Next steps and closing", 10]),
      modules: [
        M("w6-1", "explore", "One main point per slide",
          "Look at the overloaded slide, then the revised one. Identify the core message, and describe how the title, text, and image were reorganized to support it.",
          { minutes: 15, submitTo: "personal", criteria: "Core message identified and three changes described.", skills: ["visual"], attachments: [A("a-w6-bad", "image", `${S}/slide-overloaded.svg`, "Before"), A("a-w6-good", "image", `${S}/slide-clean.svg`, "After")] }),
        M("w6-2", "practice", "Make data easier to understand",
          "Choose a chart type, or a clear example, that fits one number in your talk. Write the one-sentence conclusion it supports. Add a short text description for any important image.",
          { minutes: 15, submitTo: "personal", criteria: "One chart or example with its conclusion and a text description.", skills: ["visual"], tools: [ask] }),
        ...paths("w6p",
          M("w6-3g", "practice", "Revise my slides (template)",
            "Using a simple slide template, prepare about 4–6 slides. Check type size, contrast, hierarchy, data labels, and sources.",
            { minutes: 30, submitTo: "personal", criteria: "4–6 slides checked against the list.", skills: ["visual"] }),
          M("w6-3s", "practice", "Revise my slides (complex data)",
            "Prepare 4–6 slides, including one that explains complex data to a non-specialist audience. Check type size, contrast, hierarchy, data labels, and sources.",
            { minutes: 35, submitTo: "personal", criteria: "4–6 slides including one non-specialist data slide.", skills: ["visual"] })),
        M("w6-4", "studio", "Final presentation",
          `Post your 4–5 minute presentation or a link to it, your slides, your audience, your purpose, and your feedback focus.`,
          { minutes: 75, submitTo: "studio", criteria: "Final presentation and slides posted; feedback given to two peers.", skills: ["audience", "structure", "vocal", "body", "rehearsal", "visual"] }),
        M("w6-5", "selfcheck", "Feedback and comparison",
          "Rate yourself again on the same six skill areas, then compare with your Week 0 starting point. Where can you point to observable progress? What needs more practice?",
          { minutes: 15, submitTo: "personal", criteria: "All six skills rated and one note on progress.", skills: ["audience", "structure", "vocal", "body", "rehearsal", "visual"] }),
        M("w6-6", "reflect", "My next steps",
          "Star three pieces of work to keep from this course (use the star on any card). Then write a four-week practice plan: the speaking context, how often, and where your feedback will come from.",
          { minutes: 20, submitTo: "personal", criteria: "Three works starred and a four-week plan written.", attachments: [A("a-w6-plan", "file", `${S}/practice-plan.csv`, "practice-plan.csv", 120)] }),
      ],
    },
  },
];

export function seedCourse(): Course {
  return {
    id: "demo",
    title: "CaPS",
    subtitle: "Presentation skills · Weeks 0–6",
    joinCode: "CAPS26",
    profile: { preset: "custom", density: "comfortable", autonomy: "free", horizon: "term", entry: "code" },
    students,
    skills: [
      { id: "audience", name: "Audience & purpose" },
      { id: "structure", name: "Structure & storytelling" },
      { id: "vocal", name: "Vocal delivery" },
      { id: "body", name: "Body language & presence" },
      { id: "rehearsal", name: "Rehearsal & recall" },
      { id: "visual", name: "Visual support" },
    ],
    levels: [
      { n: 1, name: "Starting", description: "The target behavior isn’t evident yet; substantial prompting is needed.", use: "Identify one priority for practice." },
      { n: 2, name: "Developing", description: "The target behavior is partly evident but inconsistent.", use: "Point to an effective passage and a place to adjust." },
      { n: 3, name: "Meeting the goal", description: "The target behavior is clear and consistent in this activity.", use: "Explain its effect using specific evidence." },
      { n: 4, name: "Adapting", description: "The speaker adjusts intentionally for audience and context.", use: "Explain the choice and its effect on the audience." },
    ],
    groups: [
      { id: "gA", name: "Studio A", studentIds: ["s1", "s2", "s3", "s4", "s5", "s6"] },
      { id: "gB", name: "Studio B", studentIds: ["s7", "s8", "s9", "s10", "s11", "s12"] },
    ],
    currentLessonId: "l1",
    enabledConnectors: ["ai", "dictionary", "wikipedia", "words", "grammar", "speech", "translate", "openalex", "openverse"],
    weeks: weeks.map((w) => ({
      id: w.id, title: w.title,
      lessons: [{ ...w.lesson, modules: w.lesson.modules.map((m) => (m.id in DUE ? { ...m, due: isoDay(DUE[m.id]) } : m)) }],
    })),
  };
}

/** Due dates, in days from today, so the demo always looks like "this week". */
const DUE: Record<string, number> = { "w1-1": -2, "w1-3": -1, "w1-q": 1, "w1-4g": 2, "w1-4s": 2, "w1-5": 3, "w1-6": 5, "w2-4g": 9, "w2-4s": 9, "w2-6": 12 };

// —— a believable class, one week in ——

const RATINGS: Record<string, number[]> = {
  s1: [2, 2, 2, 1, 2, 3], s2: [3, 2, 1, 2, 2, 2], s3: [2, 3, 2, 2, 1, 3], s4: [2, 1, 2, 2, 1, 2],
  s5: [2, 2, 1, 3, 2, 2], s6: [1, 2, 2, 1, 2, 1], s7: [1, 1, 2, 2, 1, 2], s8: [3, 3, 2, 2, 3, 2],
  s9: [2, 2, 3, 2, 2, 2], s10: [2, 1, 1, 2, 2, 1], s11: [3, 2, 2, 3, 2, 3],
};
const SKILL_IDS = ["audience", "structure", "vocal", "body", "rehearsal", "visual"];
const INTROS: Record<string, [string, string]> = {
  s1: ["mia-intro.m4a", "My starting point (90 sec)"], s2: ["leo-intro.m4a", "My starting point (90 sec)"],
  s3: ["ava-intro.m4a", "My starting point (90 sec)"], s4: ["noah-intro.m4a", "My starting point (90 sec)"],
  s5: ["zoe-intro.m4a", "My starting point (90 sec)"],
};
const CONTEXTS: Record<string, string> = {
  s1: "Presenting my research poster to a panel in December. I want to stop reading from my slides.",
  s2: "Internship interviews. I want to explain my capstone project to non-engineers without rushing.",
  s3: "Client pitches for design projects. I get nervous at the start and want stronger openings.",
  s4: "A startup competition pitch. I lose track of where I am, so structure is my focus.",
  s5: "A talk to parents about why messy art matters. People say I speak too quietly.",
  s6: "Team stand-ups at my part-time job. I ramble and want to be more concise.",
  s7: "My first conference talk. I’m anxious about questions from the audience.",
  s8: "Leading a club meeting. I want people to remember the one action I ask for.",
  s9: "A teaching demo for a TA position. I want to use the whiteboard better.",
  s10: "A scholarship interview. I want to tell my story in a clear order.",
  s11: "Presenting survey results to my lab. I want my charts to be easier to read.",
};

export function seedProgress(): ProgressMap {
  const now = Date.now();
  const day = 86400000;
  const at = (d: number) => now - d * day;
  const out: ProgressMap = {};
  for (const s of students) {
    const p: ProgressMap[string] = (out[s.id] = {});
    if (s.id === "s12") continue; // joined late; hasn't started
    p["w0-1"] = { status: "done", output: CONTEXTS[s.id], updatedAt: at(8) };
    const r = RATINGS[s.id];
    p["w0-2"] = {
      status: "done",
      ratings: Object.fromEntries(SKILL_IDS.map((k, i) => [k, r[i]])),
      output: "",
      work: INTROS[s.id] ? [A(`wk-${s.id}-intro`, "audio", `${S}/${INTROS[s.id][0]}`, INTROS[s.id][1])] : [],
      starred: s.id === "s1" || s.id === "s2",
      updatedAt: at(8),
    };
    p["w0-4"] = {
      status: "done",
      output: "Worked: the opening question about the elevator got my attention. Evidence: at 0:05 she says “it’s faster when the elevator is busy”, which I could picture. Try next: replace “there’s a study, I think” with the actual number, and cut the “so yeah” before the ending.",
      updatedAt: at(7),
    };
    p["w0-6"] = { status: s.id === "s10" ? "doing" : "done", output: "Goal: sound confident in Q&A. I’ll practice 3 × 20 minutes a week. Support: I’d like feedback on filler words.", updatedAt: at(6) };
  }
  // Week 0 paths and studio
  for (const id of ["s1", "s4", "s5", "s6", "s7", "s9", "s10", "s11"]) out[id]["w0-3g"] = { status: "done", output: "Second take used the three steps; it was 20 seconds shorter.", updatedAt: at(7) };
  for (const id of ["s2", "s3", "s8"]) out[id]["w0-3s"] = { status: "done", output: "Gave it for a hiring manager: dropped the jargon and led with the result.", updatedAt: at(7) };
  for (const id of ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s11"]) out[id]["w0-5"] = { status: "done", updatedAt: at(6) };
  out.s10["w0-5"] = { status: "doing", updatedAt: at(6) };
  // Week 1, in progress
  const w1: Record<string, string[]> = {
    s1: ["w1-1", "w1-2", "w1-3"], s2: ["w1-1", "w1-2", "w1-3", "w1-4s"], s3: ["w1-1", "w1-2"], s4: ["w1-1"],
    s5: ["w1-1", "w1-2", "w1-3"], s6: [], s7: ["w1-1"], s8: ["w1-1", "w1-2", "w1-3", "w1-4s"], s9: ["w1-1", "w1-2"], s11: ["w1-1", "w1-2", "w1-3"],
  };
  const notes: Record<string, string> = {
    "w1-1": "Audience: the hiring panel. They know engineering basics but not soil science. I want them to ask me a follow-up question about the field test.",
    "w1-2": "The neighbor version swaps numbers for a picture (“like a sponge”), drops the technical cause, and leads with what they care about: dry basements.",
    "w1-3": "Core message: watering only when the soil asks for it saves water and effort. Cut: the history of moisture sensors and the circuit diagram.",
    "w1-4s": "Specialist version kept the calibration numbers; the non-specialist version opens with dead houseplants.",
  };
  for (const [sid, ids] of Object.entries(w1)) for (const mid of ids) out[sid][mid] = { status: "done", output: notes[mid], updatedAt: at(1) };
  out.s2["w1-4s"].work = [{
    ...A("wk-s2-w1", "audio", `${S}/leo-week1.m4a`, "Non-specialist version (60 sec)"),
    transcript: "So, um, have you ever come home and found your houseplants dead? Basically that happens because we water on a schedule, not when the soil actually needs it. My project is a small soil sensor. It's, like, calibrated to measure moisture, and it tells you when to water. In my tests it cut water use by about a third. So yeah, next time you water, ask the soil first.",
  }];
  out.s8["w1-4s"].review = { verdict: "good", text: "Both versions work; the non-specialist one is clearly adapted.", at: at(0.7), levels: { audience: 4 } };
  out.s11["w1-3"].review = { verdict: "good", text: "Clear and short.", at: at(0.9), levels: { audience: 2 } };
  for (const sid of ["s2", "s8"]) Object.assign(out[sid]["w1-4s"], { checks: [0, 1, 2], rehearsals: sid === "s2" ? [74, 66, 61] : [88, 59] });
  // Teacher feedback already given on some of this week's work.
  out.s1["w1-3"].review = { verdict: "good", text: "Sharp sentence. Cutting the circuit diagram was the right call.", at: at(0.6), levels: { audience: 3 } };
  out.s3["w1-2"].review = { verdict: "good", text: "Good eye: “like a sponge” is exactly the kind of swap to notice.", at: at(0.4), levels: { audience: 3 } };
  out.s3["w1-1"] = { ...out.s3["w1-1"], status: "doing", review: { verdict: "revise", text: "Good start. Make the action more specific: what exactly do you want the panel to ask you about?", at: at(0.25) } };
  out.s5["w1-3"].review = { verdict: "revise", text: "Your sentence has two ideas. Pick the one your audience needs most.", at: at(0.5), levels: { audience: 2 } };
  out.s5["w1-3"].status = "doing";
  // The quick check: a few students have taken it.
  const quiz = (sid: string, a: (number | string)[], ok: boolean[], tries = 1) => {
    out[sid]["w1-q"] = {
      status: "done", attempt: tries, score: ok.filter(Boolean).length, best: ok.filter(Boolean).length, updatedAt: at(0.8),
      answers: Object.fromEntries(a.map((x, i) => [`w1q${i + 1}`, x])), results: Object.fromEntries(ok.map((x, i) => [`w1q${i + 1}`, x])),
    };
  };
  quiz("s1", [1, 1, "audience", 1], [true, true, true, true]);
  quiz("s2", [1, 1, "the audience", 1], [true, true, true, true]);
  quiz("s8", [1, 0, "purpose", 1], [true, false, false, true], 2);
  quiz("s11", [0, 1, "audience", 1], [false, true, true, true]);
  out.s2["w1-5"] = { status: "doing", updatedAt: at(0.2) };
  out.s3["w1-3"] = { status: "doing", output: "Draft: a bus stop designed for older riders is a better bus stop for everyone.", updatedAt: at(0.5) };
  out.s6["w1-1"] = { status: "doing", updatedAt: at(0.3) };
  return out;
}

export function seedChoices(): Record<string, Record<string, string>> {
  const c: Record<string, Record<string, string>> = {};
  for (const id of ["s1", "s4", "s5", "s6", "s7", "s9", "s10", "s11"]) c[id] = { w0p: "Guided" };
  for (const id of ["s2", "s3", "s8"]) c[id] = { w0p: "Stretch" };
  c.s2.w1p = "Stretch";
  c.s8.w1p = "Stretch";
  return c;
}

export function seedStudio(): { posts: StudioPost[]; feedback: Feedback[] } {
  const now = Date.now();
  const day = 86400000;
  const names = Object.fromEntries(students.map((s) => [s.id, s.name]));
  const posts: StudioPost[] = [];
  const feedback: Feedback[] = [];
  const groupA = ["s1", "s2", "s3", "s4", "s5", "s6"];
  const groupB = ["s7", "s8", "s9", "s10", "s11"];
  const questions: Record<string, string> = {
    s1: "Does my project sound clear in the first 15 seconds?", s2: "Am I still too fast in the middle part?",
    s3: "Does the opening make you want to keep listening?", s4: "Could you tell where each part started?",
    s5: "Could you hear me clearly the whole way through?", s6: "Which sentence could I cut?",
    s7: "Did I sound nervous? Where?", s8: "What action did you think I wanted you to take?",
    s9: "Was the order easy to follow?", s10: "Did my story have a clear end?", s11: "Was the example about my lab useful?",
  };
  for (const sid of [...groupA, ...groupB]) {
    const intro = INTROS[sid];
    posts.push({
      id: `sp0-${sid}`, moduleId: "w0-5", studentId: sid, groupId: groupA.includes(sid) ? "gA" : "gB",
      title: `${names[sid]} · Week 0 · My starting point`,
      audience: sid === "s2" ? "Internship interviewers" : sid === "s5" ? "Parents of my art students" : "My Collab Studio group",
      purpose: "Introduce myself and the presentation I’ll build this term",
      skill: "audience",
      question: questions[sid],
      text: intro ? "" : CONTEXTS[sid] ?? "",
      work: intro ? [A(`spw-${sid}`, "audio", `${S}/${intro[0]}`, intro[1])] : [],
      createdAt: now - 6.2 * day, updatedAt: now - 6.2 * day,
    });
  }
  const fb = (from: string, to: string, observed: string, effect: string, next: string, level?: number, ago = 6) =>
    feedback.push({ id: `fb-${from}-${to}`, postId: `sp0-${to}`, fromId: from, observed, effect, next, level, createdAt: now - ago * day });
  fb("s2", "s1", "At 0:12 you said “what I want to get better at is not reading off my slides”.", "It made your goal concrete, and I trusted you more.", "Open with the pharmacy distance number. It’s more surprising than your name.", 2);
  fb("s3", "s1", "You said “um” twice in the first five seconds.", "I noticed the filler more than the topic at first.", "Take one breath before your first word.", 2);
  fb("s1", "s2", "From 0:06 to 0:14 the sentences ran together with no pauses.", "I missed what the sensor actually does.", "Pause after “soil moisture” and before “people who aren’t engineers”.", 2);
  fb("s4", "s2", "You named your audience directly: people who aren’t engineers.", "I knew exactly who the talk was for.", "Give one everyday example, like houseplants.", 3);
  fb("s1", "s3", "You admitted you get nervous at the start.", "It made the room feel safe, and I wanted you to do well.", "Try opening with the bus stop image instead of your name.", 3);
  fb("s5", "s4", "You listed three things the app does.", "I could follow the order easily.", "Say “first”, “second”, “third” out loud so we hear the structure.", 2);
  fb("s6", "s5", "Your voice dropped at the end of each sentence.", "I lost the last word of “why messy art matters”.", "Lift the last word of each sentence a little.", 2);
  fb("s4", "s6", "Your context was one long sentence.", "I had to read it twice to get your goal.", "Split it into: where you speak, and what you want to fix.", 1);
  fb("s8", "s7", "You wrote that questions make you anxious.", "It’s a very common, honest goal.", "Prepare two likely questions and answer them out loud.", undefined);
  fb("s9", "s8", "Your action was “come to the next meeting”.", "It was clear and easy to remember.", "Say it again at the very end.", 3);
  fb("s7", "s9", "You said you want to use the whiteboard better.", "I could picture you teaching.", "Plan exactly one diagram you’ll draw.", 2);
  fb("s11", "s10", "Your story had a beginning but you didn’t say how it ended.", "I wasn’t sure what happened.", "Add one sentence with the result.", 2);
  fb("s10", "s11", "You mentioned charts in your lab meeting.", "I wanted to see one.", "Bring one chart and say its conclusion first.", 2);
  // Week 1: Leo has posted his non-specialist version; one peer has replied
  posts.push({
    id: "sp1-s2", moduleId: "w1-5", studentId: "s2", groupId: "gA",
    title: "Leo · Week 1 · Soil sensor for non-engineers",
    audience: "Internship interviewers who aren’t engineers", purpose: "Get them to ask about my field test", skill: "audience",
    question: "Can you restate my core message in one sentence?",
    text: "Second attempt after Week 0 feedback: I slowed down and opened with houseplants.",
    work: [A("spw-s2-w1", "audio", `${S}/leo-week1.m4a`, "Non-specialist version (60 sec)")],
    createdAt: now - 0.2 * day, updatedAt: now - 0.2 * day,
  });
  feedback.push({
    id: "fb1-s1-s2", postId: "sp1-s2", fromId: "s1", createdAt: now - 0.1 * day, level: 3,
    observed: "At 0:03 you start with “Imagine checking your plants…” and there’s a clear pause after “guessing”.",
    effect: "I could restate it: water only when the soil asks for it. Much slower than last week.",
    next: "End with what you want the interviewer to ask you about.",
  });
  return { posts, feedback };
}

export function seedPosts(): Post[] {
  const now = Date.now();
  const day = 86400000;
  const p = (id: string, sid: string, text: string, votes: string[], ago: number, comments: Post["comments"] = []): Post => ({
    id, moduleId: "w0-4", studentId: sid, text, votes, comments, createdAt: now - ago * day,
  });
  return [
    p("pw1", "s3", "Worked: opening with the elevator made me picture it. Evidence: at 0:05, “faster when the elevator is busy”. Try next: give the real number instead of “there’s a study, I think”.", ["s1", "s2", "s4", "s8", "s9"], 7.2,
      [{ id: "c1", from: "teacher", text: "Great: a timestamp, an effect, and one concrete next step. This is the model.", at: now - 7 * day }]),
    p("pw2", "s8", "It was clear and short. Maybe more confidence?", ["s7"], 7.1,
      [{ id: "c2", from: "s9", text: "Where did it sound unconfident? A timestamp would help.", at: now - 7 * day }]),
    p("pw3", "s1", "The “um” at 0:01 and “so yeah” at 0:17 made the start and end feel unplanned. Try a one-breath pause instead of “um”, and end on “take the stairs”.", ["s3", "s5", "s6", "s11"], 7.0),
    p("pw4", "s5", "I liked the health point, but three reasons came in a list without examples, so I forgot the second one. Try one reason with a story.", ["s2", "s10"], 6.9),
    { id: "ph1", moduleId: "w2-w", studentId: "s2", section: "A question", text: "“How many of you watered a plant this week that didn’t need it?”", votes: ["s1", "s3", "s9"], createdAt: now - 0.5 * day },
    { id: "ph2", moduleId: "w2-w", studentId: "s8", section: "A story", text: "“Last spring I killed eleven tomato plants. Here’s what I learned.”", votes: ["s2", "s5"], createdAt: now - 0.4 * day },
    { id: "ph3", moduleId: "w2-w", studentId: "s11", section: "A surprising fact", text: "“Half the water used on lawns evaporates before it reaches the roots.”", votes: ["s1"], createdAt: now - 0.3 * day },
    { id: "ph4", moduleId: "w2-w", studentId: "s1", section: "A question", text: "“What if your phone told you when your plants were thirsty?”", votes: [], createdAt: now - 0.2 * day },
    p("pw5", "s11", "Evidence at 0:12: “I think” right before the study made me doubt it. Effect: I stopped trusting the claim. Next: cite it or cut it.", ["s1", "s3", "s8"], 6.8),
  ];
}

export function seedEvents(): ClassEvent[] {
  const now = Date.now();
  const e = (min: number, kind: ClassEvent["kind"], studentId: string, moduleId: string, text: string): ClassEvent => ({
    id: `seed-${min}-${studentId}-${kind}`, at: now - min * 60000, kind, studentId, moduleId, text,
  });
  return [
    e(300, "done", "s8", "w1-4s", "Finished “One-minute practice (two audiences)”"),
    e(240, "done", "s2", "w1-4s", "Finished “One-minute practice (two audiences)”"),
    e(180, "studio", "s2", "w1-5", "Posted “Leo · Week 1 · Soil sensor for non-engineers” to Studio A"),
    e(140, "feedback", "s1", "w1-5", "Gave feedback to Leo: “End with what you want the interviewer to ask…”"),
    e(60, "done", "s5", "w1-3", "Finished “My core message”"),
    e(25, "done", "s11", "w1-3", "Finished “My core message”"),
    e(8, "tool", "s3", "w1-2", "Used “Define a word”: infiltration"),
  ];
}

/** A few timestamped notes on Leo’s Week 1 recording, from the teacher and a peer. */
export function seedMarks(): Mark[] {
  const now = Date.now();
  return [
    { id: "mk1", attachmentId: "wk-s2-w1", from: "teacher", sec: 2, text: "Strong hook: the dead houseplants picture lands right away.", at: now - 3600_000 },
    { id: "mk2", attachmentId: "wk-s2-w1", from: "s1", sec: 9, text: "I lost you here: what does “calibrated” mean?", at: now - 1800_000 },
    { id: "mk3", attachmentId: "wk-s2-w1", from: "teacher", sec: 16, text: "Slow down for the call to action and pause after it.", at: now - 3500_000 },
  ];
}
