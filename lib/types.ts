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
  | "studio";

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
  /** Steps students tick off; all must be ticked before the card is done. */
  checklist?: string[];
  /** Guided prompts: each gets its own answer box. */
  prompts?: string[];
  /** Rehearsal timer target, in seconds (practice cards). */
  timer?: number;
  /** Studio: let students review anyone instead of assigning each two peers. */
  freeReview?: boolean;
  /** Quiz: how many tries a student gets (default 1). */
  attempts?: number;
  /** Quiz: minutes allowed per try. */
  timeLimit?: number;
  /** Mix up question and option order for each student. */
  shuffle?: boolean;
  /** Draw this many questions at random from the bank, per student and per try. */
  pick?: number;
}

export interface SessionPlan {
  minutes: number;
  agenda: { label: string; minutes: number; roundRobin?: boolean }[];
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
  title: string;
  subtitle?: string;
  createdAt?: number;
  skills?: Skill[];
  levels?: Level[];
  groups?: Group[];
  joinCode: string;
  access?: { joinOpen: boolean; passcode?: string; guestToken?: string };
  profile: Profile;
  students: Student[];
  weeks: Week[];
  currentLessonId: string;
  enabledConnectors: string[];
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
  /** Checklist items ticked, by index. */
  checks?: number[];
  /** Answers to the card's guided prompts, by index. */
  responses?: string[];
  /** Timed rehearsals, in seconds, newest last. */
  rehearsals?: number[];
  /** Quiz with a time limit: when this try started. */
  startedAt?: number;
  /** Quiz: which try this is (1-based) and the best score so far. */
  attempt?: number;
  best?: number;
  /** The teacher's feedback on this work. */
  review?: Review;
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
  /** For students, votes are counts only (plus their own) and hands are their own. */
  live: Live & { myVote?: number; counts?: number[] };
}
