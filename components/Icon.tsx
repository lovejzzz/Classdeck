// 单色线性图标（24 网格，描边），取代原来的表情符号。

const P: Record<string, React.ReactNode> = {
  selfcheck: <><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></>,
  studio: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
  clock: <><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3 2" /></>,
  star: <path d="M11.5 2.8a.6.6 0 0 1 1 0l2.6 5.3 5.8.8a.6.6 0 0 1 .3 1l-4.2 4.1 1 5.8a.6.6 0 0 1-.8.6L12 17.7l-5.2 2.7a.6.6 0 0 1-.8-.6l1-5.8-4.2-4.1a.6.6 0 0 1 .3-1l5.8-.8z" />,
  camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></>,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  timer: <><path d="M10 2h4" /><path d="M12 14l3-3" /><circle cx="12" cy="14" r="8" /></>,
  board: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  text: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>,
  video: <><rect x="2.5" y="5" width="14" height="14" rx="2.5" /><path d="m16.5 10 5-3v10l-5-3" /></>,
  audio: <><path d="M2 10v3" /><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /><path d="M22 10v3" /></>,
  file: <><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><path d="M14 2v6h6" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><path d="M12 18v4" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
  play: <path d="M7 4.5v15l12-7.5z" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  read: <><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" /></>,
  explore: <><circle cx="12" cy="12" r="9.5" /><path d="m15.9 8.1-1.9 5.9-5.9 1.9 1.9-5.9z" /></>,
  practice: <><path d="M20.2 6.8a2.1 2.1 0 0 0-3-3L4.3 16.7a2 2 0 0 0-.5.8L2.6 21.4l3.9-1.2a2 2 0 0 0 .8-.5z" /><path d="m14.5 6.5 3 3" /></>,
  wall: <><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z" /><path d="M15 3v4a2 2 0 0 0 2 2h4" /></>,
  submit: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z" /></>,
  quiz: <><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="1.5" /></>,
  reflect: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  plus: <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  grip: <><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></>,
  search: <><circle cx="11" cy="11" r="7.5" /><path d="m20.5 20.5-4.2-4.2" /></>,
  cloud: <path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z" />,
  globe: <><circle cx="12" cy="12" r="9.5" /><path d="M12 2.5a14 14 0 0 0 0 19 14 14 0 0 0 0-19" /><path d="M2.5 12h19" /></>,
  sparkles: <path d="M9.9 15.5a2 2 0 0 0-1.4-1.4l-6.1-1.6a.5.5 0 0 1 0-1l6.1-1.6a2 2 0 0 0 1.4-1.4l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z" />,
  library: <><path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" /></>,
  type: <><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></>,
  plug: <><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  back: <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  split: <><path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M12 22v-8.3a4 4 0 0 0-1.2-2.9L3 3" /><path d="m15 9 6-6" /></>,
  tool: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />,
  external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  trash: <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  eye: <><path d="M2.1 12.3a1 1 0 0 1 0-.6 10.8 10.8 0 0 1 19.8 0 1 1 0 0 1 0 .6 10.8 10.8 0 0 1-19.8 0" /><circle cx="12" cy="12" r="3" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8" /><path d="M3 3v5h5" /></>,
  insert: <><path d="M20 4v7a4 4 0 0 1-4 4H4" /><path d="m9 10-5 5 5 5" /></>,
  arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  settings: <><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></>,
  layers: <><path d="m12.8 2.2a2 2 0 0 0-1.6 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8z" /><path d="m2 12 9.2 4.2a2 2 0 0 0 1.6 0L22 12" /><path d="m2 17 9.2 4.2a2 2 0 0 0 1.6 0L22 17" /></>,
};

export const CONNECTOR_ICON: Record<string, string> = {
  wikipedia: "globe",
  dictionary: "type",
  openlibrary: "library",
  weather: "cloud",
  ai: "sparkles",
};

export function Icon({ name, size = 15, className = "", strokeWidth = 1.7 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className}`}
      aria-hidden="true"
    >
      {P[name] ?? P.plug}
    </svg>
  );
}

/** 像 Linear 一样的状态图标：虚线圈 = 没开始，半圆 = 进行中，实心勾 = 完成。 */
export function StatusIcon({ status, size = 14 }: { status: "todo" | "doing" | "done"; size?: number }) {
  if (status === "done") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="flex-none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="var(--color-ok)" />
        <path d="m5 8.2 2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "doing") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="flex-none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--color-warn)" strokeWidth="1.6" />
        <path d="M8 4.2a3.8 3.8 0 0 1 0 7.6z" fill="var(--color-warn)" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="flex-none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="#8f8f8a" strokeWidth="1.6" strokeDasharray="2.4 2.2" />
    </svg>
  );
}

export function Avatar({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex flex-none items-center justify-center rounded-full bg-[#ececea] font-medium text-ink-2"
      style={{ width: size, height: size, fontSize: size * 0.48 }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  );
}
