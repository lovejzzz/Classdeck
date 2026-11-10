// A tiny in-process change feed: every save bumps a version and tells open pages to refresh.
// With more than one server instance this would move to a shared channel (Redis, Postgres LISTEN).

type Listener = (version: number) => void;
const g = globalThis as unknown as { __lmsbus?: { version: number; listeners: Set<Listener> } };
const bus = (g.__lmsbus ??= { version: 0, listeners: new Set() });

export function publish() {
  bus.version += 1;
  bus.listeners.forEach((l) => l(bus.version));
}

export function subscribe(l: Listener) {
  bus.listeners.add(l);
  return () => bus.listeners.delete(l);
}

export const currentVersion = () => bus.version;
