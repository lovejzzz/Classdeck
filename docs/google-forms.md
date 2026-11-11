# Connecting Google Forms (or any tool) to a Classdeck class

A form can do two things in Classdeck:

1. **Set up each student's board** from their answers: which electives they take, Guided or Stretch path, and their plan (why they're here, goal, objectives, confidence).
2. **Post an update to a card** after an activity or workshop: feedback, a "try next", skill levels, a score, links, and whether the card is done or needs revising.

Students see updates on the card itself and in their feedback inbox. Skill levels count as evidence on their skill chart, the same way a teacher review does.

Nothing here needs a paid service. Google Apps Script is free.

## Option A: send responses automatically (Apps Script)

1. In Classdeck, open **Settings → Google Forms and other tools** and choose **Create key**. Copy the key; it is shown only once. Anyone with the key can post updates to your class, so treat it like a password. You can replace or turn it off at any time.
2. Open **Connect a Google Form**. Fill in "Shown to students as" (e.g. *Workshop 2 form*) and, if every response is about the same card, pick that card. Choose **Copy script**.
3. In your Google Form: **⋮ → Apps Script**. Replace everything with the copied script and save.
4. In Apps Script, open **Triggers** (clock icon) → **Add Trigger**: function `sendToClassdeck`, event source *From form*, event type *On form submit*. Save and allow the permissions Google asks for.
5. Submit a test response. In Apps Script → **Executions** you'll see Classdeck's reply, including anything it couldn't match.

Classdeck must be reachable from the internet for this to work. A copy running on your own computer (`localhost`) can't receive these requests. Use option B instead.

### New students get their own private board automatically

When an onboarding form adds a student (or sets up one who has never signed in), Classdeck makes a **one-time link** for them, and the script emails it to the address the form collected. (Turn on *Collect email addresses* in the form's settings. Emails go out from your Google account, so Google's daily sending limit applies: about 100 a day on a free account.)

The student opens the link, chooses a 4-digit PIN, and lands on their board, already set up with their electives, path, and plan. After that they sign in with the class code, their name, and their PIN.

- Each link works once and expires after 14 days. Sending the form again makes a fresh link.
- Until the link is used, no one can claim that name with the class code, so a classmate can't get into someone else's board first.
- The link's secret is in the part after `#`, which browsers never send to servers, and the page removes it from the address bar right away.
- Each student only ever receives their own cards, progress, feedback, and plan. Choices they didn't make (other electives, the other path) aren't sent to their browser at all.

To turn emails off, set `EMAIL_LINKS = false` in the script and share links from a CSV import instead.

## Option B: import a CSV (no setup)

In Google Forms: **Responses → ⋮ → Download responses (.csv)**. In Classdeck: **Settings → Google Forms and other tools → Import a CSV of responses**. Each row is reported back: which student it matched, what changed, and anything skipped. New students' one-time links are listed too, with **Copy all links** (name, email, link) for a mail merge.

## How to word your questions

Classdeck reads each answer by its question title. Titles only need to *contain* these words; other questions are ignored.

| Question title contains | What it does |
|---|---|
| **Name**, or **Email** (turn on *Collect email addresses*) | Which student. Names must match the class list. A student who isn't in the class yet is added when the form sets choices (not for card updates). An email is remembered for next time. |
| **Elective** (checkboxes with elective titles) | Sets exactly the electives ticked. |
| **Path** / **Track** ("Guided" or "Stretch") | Sets that path in every week that offers both. |
| **Why** / **Purpose** / **What brings you** | Purposes on the student's plan. Answers that aren't one of the standard purposes are kept as a note. |
| **Goal** | The goal on their plan. |
| **Objective** / **Learn to** | Up to three objectives, one per line. "Open with a hook — two peers repeat my main point" splits into the objective and how they'll know. |
| **Confidence [A job interview]** … (a 1–5 grid) | Confidence by situation. Grid rows can be: job interview, class, meeting, unexpected question, research, English. |
| **Card** / **Activity** | The card the response is about: its title, or "Week 2 · Build my talk". |
| **Feedback** / **Comment** / **Observed** | Feedback text. |
| **Try next** / **Next step** | One thing to try next. |
| A skill name, e.g. **Vocal delivery**, or a grid **Scores [Vocal delivery]** | A level 1–4 for that skill ("3" or "Meeting the goal"). |
| **Score**, and optionally **Out of** | A number, e.g. 8 and 10, or "8/10". |
| **Link** / **Recording** / **Slides** | https links. Shown with the update and added to the student's work on that card. |
| **Status** | "Done" marks the card done. "Revise" puts it back in the student's hand with the feedback as the reason. |

Sending the same response twice changes nothing: each response's id is remembered.

## For other tools: the JSON format

```
POST https://<your Classdeck>/api/hooks/<course id>
Authorization: Bearer <key>
Content-Type: application/json

{ "items": [
  { "id": "resp-123", "student": { "email": "ava@example.edu" },
    "electives": ["Speaking with less anxiety", "Interview answers with STAR"],
    "path": "Stretch",
    "plan": { "goal": "Pitch at demo day", "confidence": { "interview": 2 } } },

  { "id": "resp-124", "student": { "name": "Leo" },
    "card": "Week 2 · Build my talk", "source": "Workshop 2 form",
    "feedback": "Clear hook; the middle section ran long.", "next": "Cut one example.",
    "scores": { "structure": 3, "Vocal delivery": "Developing" },
    "score": { "value": 8, "max": 10 },
    "links": [{ "title": "Recording", "url": "https://example.com/rec" }],
    "status": "done" }
] }
```

You can also send `{ "row": { "<question title>": "<answer>", ... } }` and Classdeck reads it with the wording rules above. Up to 300 items per request. The reply lists, for each item, the student and card matched, what changed, warnings, and errors.
