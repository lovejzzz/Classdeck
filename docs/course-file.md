# Questhand course file

One JSON file holds a whole course: its weeks, lessons and cards, with the answers that deal cards and the card
groups. **Settings → Export course** writes one; **New course → From a course file** makes a new course from one.
The code is `lib/coursefile.ts` (reading and writing) and `POST /api/courses` with `{ file }` (making the course).

The cards are the site's own card objects (`Module` in `lib/types.ts`), so an exported file goes back in with
nothing lost. Hand-written files can leave most fields out: the reader fills in what's missing.

## The file

```json
{
  "format": "questhand-course",
  "version": 1,
  "title": "Ocean Explorers",
  "subtitle": "Year 7 Science · Term 2",
  "weeks": [
    { "title": "Week 1", "lessons": [ { "title": "Zones of the ocean", "goal": "…", "modules": [ … ] } ] }
  ]
}
```

- `format` and `version` may be left out (a file with `weeks` is read as a course file). A newer `version` is turned away.
- `title` names the course unless the teacher types a name in the New course dialog. `subtitle` is optional.
- Each week needs at least one lesson. Limits: 52 weeks, 40 lessons a week, 200 cards a lesson, 3,000 cards in all.
- A lesson may have `goal` and `elective: true` (students choose it).
  `cards` is accepted as another name for `modules`.

## Cards

Every card needs an `id` (any text, unique in the file) and a `title`. Ids are replaced on import; every reference
to them (wires, group members, sign-up groups) follows. Common fields:

| field | what it is |
| --- | --- |
| `kind` | `content` (students read), `choice` (questions with options), `answer` (open answer: words, drawing, recording, files), `worksheet` (students write in the card's text), `discussion`, `group` (a card group) |
| `title`, `body` | The card's name and its text (Markdown) |
| `attachments` | `[{ "kind": "image" \| "video" \| "audio" \| "file" \| "link", "url": "https://…", "name": "…" }]`. Addresses must be safe (`https://`, or files already on the site) |
| `minutes` | Suggested time |
| `audience` | `{ "kind": "all" }` (the default). Cards for named students or groups from another class become cards for everyone |

`type` (the stored card type) follows from `kind` and can be left out.

### Questions (`kind: "choice"`)

```json
{ "id": "q-zone", "kind": "choice", "title": "Which zone?",
  "questions": [ { "id": "q", "text": "Where do most sea creatures live?",
                   "options": ["Sunlight zone", "Twilight zone", "Midnight zone"], "answer": 0,
                   "explain": "Plants need light, and most life follows the plants.",
                   "next": [null, "c-review", "c-review"] } ] }
```

- `answer` is the index of the right option. `kind: "multi"` uses `answerSet`; `"short"` uses `accept` (accepted answers);
  `"order"` lists the options in the right order. Leave `answer` out and set `"poll": true` for a poll.
- `next[i]` deals a card to a student who picks option `i`: a card id, a list of ids, or `null`. The dealt card is
  hidden until then. It must be in the same lesson or a later one.

### Card groups (`kind: "group"`)

```json
{ "id": "g-check", "kind": "group", "title": "Zone check", "members": ["q-zone", "q-depth"],
  "bands": [ { "min": 0, "next": "c-review" }, { "min": 100, "next": null } ] }
```

- `members` lists the cards in the group, in order (cards of the same lesson). A member may itself be a group, two
  levels at most. A group needs at least two members.
- The group's score counts its questions' first answers. `bands` deal by that score: each band runs from its `min`
  (a percentage) up to the next band's; `next` is the card it deals, or `null`.
- A card dealt by an answer can't be in a group (group the cards, then deal the group).

## Example

A complete lesson: a reading, a two-question group that deals a review card to anyone under 100%, and an open answer.

```json
{
  "format": "questhand-course", "version": 1, "title": "Ocean Explorers",
  "weeks": [{ "title": "Week 1", "lessons": [{ "title": "Zones of the ocean", "modules": [
    { "id": "c-read", "kind": "content", "title": "Three zones of the ocean",
      "body": "The ocean has three layers of light. The **sunlight zone** is the top 200 metres…" },
    { "id": "g-check", "kind": "group", "title": "Zone check", "members": ["q-zone", "q-depth"],
      "bands": [{ "min": 0, "next": "c-review" }, { "min": 100, "next": null }] },
    { "id": "q-zone", "kind": "choice", "title": "Which zone?",
      "questions": [{ "id": "q", "text": "Where do most sea creatures live?", "options": ["Sunlight zone", "Twilight zone", "Midnight zone"], "answer": 0 }] },
    { "id": "q-depth", "kind": "choice", "title": "How deep is the sunlight zone?",
      "questions": [{ "id": "q", "text": "", "options": ["About 200 metres", "About 4,000 metres"], "answer": 0 }] },
    { "id": "c-review", "kind": "content", "title": "Look again: the zones", "body": "Not quite yet. Read the first card again." },
    { "id": "a-draw", "kind": "answer", "title": "Draw a deep-sea creature",
      "body": "Draw one creature from the midnight zone and write how it finds food without light." }
  ]}]}]
}
```
