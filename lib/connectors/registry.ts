import { db } from "../store";
import { ai } from "./ai";
import { BUILTIN_MANIFESTS } from "./builtin";
import { fromManifest } from "./declarative";
import type { Connector, ConnectorInfo } from "./types";
import { chemistry, currency, grammar, nasa, openverse, quakes, species, speech, words, worldbank, youtube } from "./tools";
import { weather } from "./weather";

const BUILTIN: Connector[] = [
  ai,
  ...BUILTIN_MANIFESTS.map((m) => fromManifest(m, "builtin")),
  words, grammar, speech, weather, worldbank, quakes, species, chemistry, currency, openverse, nasa, youtube,
];

export function builtinIds() {
  return BUILTIN.map((c) => c.id);
}

export function allConnectors(): Connector[] {
  return [...BUILTIN, ...db().customConnectors.map((m) => fromManifest(m, "custom"))];
}

export function getConnector(id: string) {
  return allConnectors().find((c) => c.id === id);
}

/** How a connector looks to a browser. `aiReady`: the person (or the course's owner) has connected their own AI. */
export function describe(c: Connector, aiReady = false): ConnectorInfo {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon,
    kind: c.kind,
    category: c.category,
    host: c.host,
    configured: c.configured() || (!!c.usesAi && aiReady),
    requiresEnv: c.requiresEnv ?? [],
    usesAi: c.usesAi,
    actions: c.actions,
  };
}
