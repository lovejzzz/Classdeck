/** A template's size as words ("3 weeks · 12 lessons · 82 cards"): for the page and for emails. */
export const size = (o: { weeks: number; lessons: number; cards: number }) => `${o.weeks} week${o.weeks === 1 ? "" : "s"} · ${o.lessons} lesson${o.lessons === 1 ? "" : "s"} · ${o.cards} card${o.cards === 1 ? "" : "s"}`;
