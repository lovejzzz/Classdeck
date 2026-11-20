/**
 * The home page's picture of what Questhand does: one quiz, three paths, and three students who each take a different
 * one. Drawn in SVG; the students move along their paths on a loop (still for anyone who prefers less motion).
 */
export function HeroTree() {
  const quiz = { x: 40, y: 92 };
  const ends = [
    { y: 14, tint: "#3d68a6", kind: "LEARN", title: "Go over it again", why: "Score below 60%" },
    { y: 92, tint: "#a0561f", kind: "DO", title: "Practice two takes", why: "Score 60–89%" },
    { y: 170, tint: "#9a4a8c", kind: "DO", title: "Stretch: a new setting", why: "Score 90% and up" },
  ];
  const sx = quiz.x + 150, ex = 372;
  const path = (y: number) => `M ${sx} ${quiz.y + 34} C ${sx + 90} ${quiz.y + 34}, ${ex - 90} ${y + 34}, ${ex} ${y + 34}`;
  // The students stop just short of the card they're dealt.
  const walk = (y: number) => `M ${sx} ${quiz.y + 34} C ${sx + 90} ${quiz.y + 34}, ${ex - 104} ${y + 34}, ${ex - 16} ${y + 34}`;
  const students = [
    { d: walk(ends[0].y), c: "#3d68a6", t: "Ana", begin: "0s" },
    { d: walk(ends[1].y), c: "#a0561f", t: "Ben", begin: "1.1s" },
    { d: walk(ends[2].y), c: "#9a4a8c", t: "Cal", begin: "2.2s" },
  ];
  return (
    <svg viewBox="0 0 600 252" className="hero-tree h-auto w-full max-w-[600px]" role="img" aria-label="One quiz deals three different next cards, depending on each student's score">
      <defs>
        <filter id="hero-shadow" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#141412" floodOpacity="0.12" /></filter>
      </defs>
      {ends.map((e, i) => (
        <path key={i} d={path(e.y)} fill="none" stroke="#a3a8cf" strokeWidth="2" pathLength={1} className="hero-wire" style={{ animationDelay: `${0.35 + i * 0.15}s` }} />
      ))}
      <g filter="url(#hero-shadow)" className="hero-card" style={{ animationDelay: "0.1s" }}>
        <rect x={quiz.x} y={quiz.y} width="150" height="68" rx="14" fill="#fff" stroke="#e6e6e3" />
        <rect x={quiz.x} y={quiz.y} width="150" height="5" rx="2.5" fill="#a0561f" />
        <text x={quiz.x + 14} y={quiz.y + 26} fontSize="10" fontWeight="600" letterSpacing="0.06em" fill="#a0561f">QUIZ</text>
        <text x={quiz.x + 14} y={quiz.y + 46} fontSize="14" fontWeight="600" fill="#1b1b1a">Quick check</text>
        <circle cx={sx} cy={quiz.y + 34} r="6" fill="#4b56a8" stroke="#fff" strokeWidth="2" />
      </g>
      {ends.map((e, i) => (
        <g key={i} filter="url(#hero-shadow)" className="hero-card" style={{ animationDelay: `${0.55 + i * 0.15}s` }}>
          <rect x={ex} y={e.y} width="196" height="68" rx="14" fill="#fff" stroke="#e6e6e3" />
          <rect x={ex} y={e.y} width="196" height="5" rx="2.5" fill={e.tint} />
          <text x={ex + 14} y={e.y + 24} fontSize="10" fontWeight="600" letterSpacing="0.06em" fill={e.tint}>{e.kind}</text>
          <text x={ex + 14} y={e.y + 42} fontSize="13.5" fontWeight="600" fill="#1b1b1a">{e.title}</text>
          <text x={ex + 14} y={e.y + 58} fontSize="10.5" fill="#6b6b66">{e.why}</text>
        </g>
      ))}
      {students.map((s) => (
        <g key={s.t} className="hero-student">
          <circle r="11" fill={s.c} stroke="#fff" strokeWidth="2.5">
            <animateMotion dur="3.3s" begin={s.begin} repeatCount="indefinite" path={s.d} keyPoints="0;1;1" keyTimes="0;0.6;1" calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1" />
          </circle>
          <text fontSize="8.5" fontWeight="700" fill="#fff" textAnchor="middle" dy="3">
            {s.t}
            <animateMotion dur="3.3s" begin={s.begin} repeatCount="indefinite" path={s.d} keyPoints="0;1;1" keyTimes="0;0.6;1" calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1" />
          </text>
        </g>
      ))}
    </svg>
  );
}
