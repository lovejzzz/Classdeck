// 数据模型：课程 → 周 → 课 → 模块。模块是最小单位。

export type Density = "spacious" | "comfortable" | "compact";
export type Autonomy = "sequential" | "free";
export type Horizon = "lesson" | "week" | "term";
export type Entry = "code" | "account";
export type PresetId = "primary" | "secondary" | "higher";

export interface Profile {
  preset: PresetId | "custom";
  density: Density;
  autonomy: Autonomy;
  horizon: Horizon;
  entry: Entry;
}

export type ModuleType =
  | "read"
  | "explore"
  | "practice"
  | "wall"
  | "submit"
  | "quiz"
  | "reflect"
  | "selfcheck"
  | "studio"
  | "builder";

/** 挂在模块上的一个工具：指向某个连接器的某个动作。 */
export interface ToolRef {
  connector: string;
  action: string;
  label?: string;
  defaults?: Record<string, string>;
}

export type AttachmentKind = "image" | "video" | "audio" | "file" | "link";

/** 卡牌上的素材：图片、视频、录音、文件或链接。 */
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  url: string;
  name?: string;
  size?: number;
  /** For video and video links: the segment to watch, in seconds. */
  start?: number;
  end?: number;
  /** Credit line for images found through search. */
  credit?: string;
  /** What was said in a recording, captured by the browser while recording. */
  transcript?: string;
  /** Length of a recording in seconds, when known. */
  duration?: number;
}

/** How a wall card behaves: who posts, how people respond, and moderation. */
export interface WallSettings {
  posting: "students" | "teacher";
  comments: boolean;
  reactions: "likes" | "votes" | "both" | "none";
  anonymous: boolean;
  approval: boolean;
  /** Optional columns, e.g. ["What worked", "Questions", "Ideas"]. Empty: one stream. */
  sections?: string[];
}

export interface Comment {
  id: string;
  /** A student id, or "teacher". */
  from: string;
  text: string;
  at: number;
}

export interface Question {
  id: string;
  /** "choice" (default): pick one. "multi": pick all that apply. "order": put the options in order. "short": type an answer. */
  kind?: "choice" | "multi" | "short" | "order";
  text: string;
  options: string[];
  /** 正确选项的下标。发给学生前会被服务器去掉。 */
  answer?: number;
  /** "multi": every correct option index. Stripped before sending to students. */
  answerSet?: number[];
  /** Short answers: accepted answers (case and punctuation ignored). Stripped before sending to students. */
  accept?: string[];
  /** Why the answer is right. Shown once the student has answered correctly, or after a quiz is submitted. */
  explain?: string;
}

/** A comment pinned to a moment in a recording: “0:12 — you paused here”. */
export interface Mark {
  id: string;
  attachmentId: string;
  /** A student id, or "teacher". */
  from: string;
  sec: number;
  text: string;
  at: number;
}

/** The teacher's response to a student's work on one card. */
export interface Review {
  verdict: "good" | "revise";
  text: string;
  at: number;
  /** Rubric: skill id → level 1–4 (the course's levels). */
  levels?: Record<string, number>;
}

/** The parts of a talk, as the speech builder lays them out. */
export interface SpeechFields {
  audience: string;
  purpose: string;
  hook: string;
  core: string;
  points: { point: string; example: string }[];
  close: string;
  /** Structure template id (lib/structures.ts). */
  structure?: string;
  hookType?: string;
  closeType?: string;
}

/** A learner's plan: why they're here, what they want, how they'll know, and how they feel. Always revisable. */
export interface Plan {
  purposes: string[];
  purposeNote?: string;
  goal?: string;
  objectives: { id: string; lo: string; lm: string; status?: "notyet" | "getting" | "achieved" }[];
  confidence: Record<string, number>;
  /** The first set of confidence answers, kept so growth is visible. */
  confidenceStart?: Record<string, number>;
  prca?: { answers: number[]; score: number; at: number }[];
  focus?: { subskills: string[]; at: number };
  /** Days (YYYY-MM-DD) a practice drill was done, with how it felt (1–4). */
  drills?: { day: string; id: string; feel?: number }[];
  updatedAt: number;
}

/** A reminder the teacher sent to a student. */
export interface Nudge {
  id: string;
  studentId: string;
  text: string;
  moduleId?: string;
  at: number;
}

export type AnswerValue = number | string | number[] | string[];

export type Audience =
  | { kind: "all" }
  | { kind: "branch"; slot: string; variant: string }
  | { kind: "student"; studentId: string };

export interface Module {
  id: string;
  type: ModuleType;
  title: string;
  body: string;
  audience: Audience;
  tools: ToolRef[];
  attachments?: Attachment[];
  questions?: Question[];
  wall?: WallSettings;
  /** 为真时，必须先完成前面的模块才能打开（覆盖课程的自主权设置）。 */
  gate?: boolean;
  /** 只在发给学生时设置：这张卡片不是全班共有的（分支或个人模块）。 */
  personal?: boolean;
  /** Suggested time in minutes, shown on the card like a cost. */
  minutes?: number;
  /** Where students hand in work from this card. */
  submitTo?: "personal" | "studio";
  /** What "done" means for this card. */
  criteria?: string;
  /** Skill ids this card practices (from course.skills). */
  skills?: string[];
  /** Set only for students: this card is one of several paths they can pick from. */
  choice?: { slot: string; variant: string; recommended: boolean; count: number };
  /** Set only for students: the version they picked in a choice slot. */
  picked?: boolean;
  /** Due date, YYYY-MM-DD. */
  due?: string;
  /** A curated sequence of videos (e.g. LinkedIn Learning clips), with optional extras. */
  playlist?: { id: string; title: string; url: string; section?: string; optional?: boolean }[];
  /** Steps students tick off; all must be ticked before the card is done. */
  checklist?: string[];
  /** Guided prompts: each gets its own answer box. */
  prompts?: string[];
  /** Self-check: run the full onboarding questionnaire (purpose, goals, confidence, anxiety check). */
  onboarding?: boolean;
  /** Speech builder: walk the learner through the guided first-speech flow instead of the free builder. */
  flow?: boolean;
  /** Speech builder: the structure template to start from (lib/structures.ts). */
  structure?: string;
  /** Rehearsal timer target, in seconds (practice cards). */
  timer?: number;
  /** Studio: let students review anyone instead of assigning each two peers. */
  freeReview?: boolean;
  /** A form the teacher fills in for each student after the activity (e.g. a workshop). Answers reach the student's card. */
  form?: ActivityForm;
  /** Quiz: how many tries a student gets (default 1). */
  attempts?: number;
  /** Quiz: minutes allowed per try. */
  timeLimit?: number;
  /** Mix up question and option order for each student. */
  shuffle?: boolean;
  /** Draw this many questions at random from the bank, per student and per try. */
  pick?: number;
}

export type FormPart = "feedback" | "next" | "levels" | "score" | "links" | "status";

/** The teacher's form for one card: standard parts plus their own questions. */
export interface ActivityForm {
  /** Shown to students with the answers, e.g. "Workshop 2 feedback". */
  title: string;
  parts: FormPart[];
  /** Score out of this. */
  max?: number;
  /** Extra questions: short answer, or pick one when options are given. */
  questions?: { id: string; text: string; options?: string[] }[];
}

export interface SessionPlan {
  minutes: number;
  agenda: { label: string; minutes: number; roundRobin?: boolean }[];
  /** Rotate Toastmasters-style roles (host, timer, ah-counter, evaluator) through each group. */
  roles?: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  /** One-line goal shown under the lesson title. */
  goal?: string;
  modules: Module[];
  /** Version slots where students pick their own path. lesson.branches then holds the teacher's recommendation. */
  choiceSlots?: string[];
  /** Agenda for this week's group session (Collab Studio). */
  session?: SessionPlan;
  /** An elective: students choose whether to take it. */
  elective?: boolean;
  /** Sent to students only: whether they've chosen this elective, and how many classmates have. */
  chosen?: boolean;
  takenBy?: number;
  /** For an elective the student hasn't chosen: what it contains. */
  catalog?: { cards: number; skills: string[] };
  /** 分支分配：slot → 学生 → 版本。没有记录的学生拿该 slot 的第一个版本。 */
  branches: Record<string, Record<string, string>>;
}

export interface Week {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Student {
  id: string;
  name: string;
  /** Used only to match responses from outside tools (e.g. a Google Form) to this student. */
  email?: string;
  /** A pending one-time link (from a form) for the student to set their PIN. Only its SHA-256 is stored. */
  invite?: { hash: string; exp: number };
  /** When they added themselves with the class code. */
  joinedAt?: number;
}

export interface Skill {
  id: string;
  name: string;
}

export interface Level {
  n: number;
  name: string;
  description: string;
  use: string;
}

export interface Group {
  id: string;
  name: string;
  studentIds: string[];
}

export interface Course {
  id: string;
  /** The teacher account that owns this course. The demo course has none. */
  ownerId?: string;
  title: string;
  subtitle?: string;
  createdAt?: number;
  skills?: Skill[];
  levels?: Level[];
  groups?: Group[];
  joinCode: string;
  access?: { joinOpen: boolean; passcode?: string; guestToken?: string;
    /** Students not on the class list may add themselves: straight in, or after the teacher lets them in. Unset: they can't. */
    selfJoin?: "open" | "approve";
    /** Key for outside tools (Google Forms via Apps Script) to send updates. Only its SHA-256 is stored. */
    hook?: { hash: string; hint: string; createdAt: number; lastUsed?: number; uses?: number } };
  profile: Profile;
  students: Student[];
  /** Students who added themselves and are waiting for the teacher to let them in. Teacher only. */
  waiting?: Student[];
  weeks: Week[];
  currentLessonId: string;
  enabledConnectors: string[];
  /** How many electives each student should take. */
  electiveMin?: number;
}

export type Status = "todo" | "doing" | "done";

export interface Progress {
  status: Status;
  output?: string;
  /** Option index (choice), indexes (multi), text (short), or option texts in order (order). */
  answers?: Record<string, AnswerValue>;
  results?: Record<string, boolean>;
  score?: number;
  /** Recordings, files, and links the student added as their work. */
  work?: Attachment[];
  /** Self-assessment: skill id → level 1–4. */
  ratings?: Record<string, number>;
  /** Kept as one of the student's selected works. */
  starred?: boolean;
  /** Passages the student highlighted in the card text (character offsets), with an optional note. */
  highlights?: { start: number; end: number; note?: string }[];
  /** Playlist items watched, by id. */
  watched?: string[];
  /** Checklist items ticked, by index. */
  checks?: number[];
  /** Answers to the card's guided prompts, by index. */
  responses?: string[];
  /** Timed rehearsals, in seconds, newest last. */
  rehearsals?: number[];
  /** How each timed rehearsal felt, 1 (rough) to 4 (strong), aligned with rehearsals. */
  feel?: number[];
  /** Quiz with a time limit: when this try started. */
  startedAt?: number;
  /** Quiz: which try this is (1-based) and the best score so far. */
  attempt?: number;
  best?: number;
  /** The teacher's feedback on this work. */
  review?: Review;
  /** Updates sent in from outside tools, such as a workshop Google Form. */
  updates?: ExternalUpdate[];
  /** Guided first-speech flow: chosen path, answers per step, and the arranged tiles. */
  flow?: { path?: "idea" | "story"; step?: number; answers: Record<string, string>; tiles?: { id: string; kind: string; text: string }[] };
  /** Speech builder: the current draft and saved versions. */
  speech?: { fields: SpeechFields; versions: { at: number; label?: string; fields: SpeechFields }[] };
  /** Sent to students only: answer keys and explanations they've earned the right to see. */
  reveal?: Record<string, { answer?: number; answerSet?: number[]; order?: string[]; accept?: string; explain?: string }>;
  updatedAt: number;
}

/** A piece of work a student posts to their group's Collab Studio. */
export interface StudioPost {
  id: string;
  moduleId: string;
  studentId: string;
  groupId: string;
  title: string;
  audience: string;
  purpose: string;
  skill: string;
  question: string;
  /** Sub-skills the poster asks peers to give feedback on: their own rubric. */
  rubric?: string[];
  text: string;
  work: Attachment[];
  likes?: string[];
  createdAt: number;
  updatedAt: number;
}

/** Structured peer feedback on a studio post. */
export interface Feedback {
  id: string;
  postId: string;
  fromId: string;
  observed: string;
  effect: string;
  next: string;
  level?: number;
  /** Per-criterion feedback on the poster's rubric. */
  rubric?: Record<string, { level?: number; note?: string }>;
  /** Marked helpful by the person who received it. */
  helpful?: boolean;
  createdAt: number;
}

export interface Post {
  id: string;
  moduleId: string;
  /** Empty when the post is anonymous and you aren't its author or the teacher. */
  studentId: string;
  text: string;
  createdAt: number;
  work?: Attachment[];
  likes?: string[];
  votes?: string[];
  comments?: Comment[];
  anonymous?: boolean;
  /** False while waiting for the teacher's approval. */
  approved?: boolean;
  /** Set only for students: this is your own post. */
  mine?: boolean;
  /** Set by the teacher. */
  pinned?: boolean;
  /** Which column it's in, when the wall has columns. */
  section?: string;
  editedAt?: number;
}

export interface ToolLogEntry {
  studentId: string;
  moduleId: string;
  connector: string;
  action: string;
  at: number;
}

/** 课堂动态：学生做了什么。老师端的通知中心读这个。 */
export interface ClassEvent {
  id: string;
  at: number;
  kind: "done" | "post" | "wrong" | "quiz" | "tool" | "studio" | "feedback";
  studentId: string;
  moduleId: string;
  text: string;
}

/** What's happening live in class right now: a quick poll and raised hands. */
export interface Live {
  poll?: { id: string; question: string; options: string[]; votes: Record<string, number>; open: boolean; at: number };
  hands: Record<string, { kind: "question" | "stuck"; note?: string; at: number }>;
}

export type ProgressMap = Record<string, Record<string, Progress>>; // 学生 → 模块 → 进度

export interface CourseState {
  course: Course;
  progress: ProgressMap;
  posts: Post[];
  toolUse: Record<string, Record<string, number>>; // 学生 → 模块 → 次数
  events: ClassEvent[]; // 只有老师端拿到
  /** Paths students picked: student → slot → variant. */
  choices: Record<string, Record<string, string>>;
  studio: { posts: StudioPost[]; feedback: Feedback[] };
  /** Timestamped notes on recordings this viewer can see. */
  marks: Mark[];
  /** Feedback a student marked as tried: student → feedback key → when. */
  uptake: Record<string, Record<string, number>>;
  /** Reminders from the teacher (students get their own). */
  nudges: Nudge[];
  /** Learner plans (students get their own). */
  plans: Record<string, Plan>;
  /** For students, votes are counts only (plus their own) and hands are their own. */
  live: Live & { myVote?: number; counts?: number[] };
}

/** Feedback, scores, and links sent to a student's card from an outside tool. */
export interface ExternalUpdate {
  id: string;
  /** Where it came from, e.g. "Workshop 2 form". */
  source: string;
  text?: string;
  next?: string;
  /** skill id → level 1–4. Counts as evidence in the student's skill picture. */
  levels?: Record<string, number>;
  score?: { value: number; max?: number };
  links?: { title?: string; url: string }[];
  /** Answers to the teacher's own questions on a card form. */
  answers?: { q: string; a: string }[];
  at: number;
}
