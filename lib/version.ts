// The site's version. Every change that ships bumps it by 0.0.1 and adds an entry at the top of CHANGELOG.
// The footer shows VERSION and links to /changelog.

export const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: "0.1.20",
    date: "2026-11-20",
    changes: [
      "Make it today’s lesson, in each lesson’s ⋯ menu. A course without lesson dates could never move past its first lesson before.",
      "Resetting a student’s sign-in also signs out whoever is signed in as them now, so a link that went to the wrong person stops working right away.",
      "A teacher who opens a course shared with them but can’t get in is told why: a share needs a Google sign-in with the invited address, or the course isn’t shared with that account.",
      "On a student’s map, a lesson’s name stays whole: its week and “Today” sit on a line below.",
      "The shortcuts list shows the week keys properly ([ ]).",
    ],
  },
  {
    version: "0.1.19",
    date: "2026-11-20",
    changes: [
      "Your cards in the List view show their due date in the corner, so a card that’s overdue for students is easy to spot.",
      "A student’s progress page shows what they posted to a class discussion, and the current card icons; “Recorded takes” is now “Recordings”.",
      "The lesson goal box is wide enough for its hint.",
      "A guest link no longer tries to open the teacher’s live updates (it just checks now and then).",
    ],
  },
  {
    version: "0.1.18",
    date: "2026-11-20",
    changes: [
      "The Standard weeks template fits any subject: a goal, an example, a quick check that deals a review or a stretch card, a task, a class discussion and a reflection. Its words no longer come from a public-speaking course, and its quick-check questions start blank, so students don’t see them until you write them.",
      "A lesson’s class session is called that (not “Collab Studio”), and the template no longer gives every lesson one.",
      "On a phone, the course map opens at the start of today’s lesson instead of cut off in the middle, and all five tabs fit.",
      "A student’s first visit on a new device still shows the last week’s feedback and reminders as new.",
      "The class table no longer has a column for a card group itself, only for its cards.",
      "A student’s attachments are labelled “Your files”, separate from “Your work”.",
    ],
  },
  {
    version: "0.1.17",
    date: "2026-11-20",
    changes: [
      "In a card group, each card says where it is (“Light check · 2 of 3”) and has a Next button to the group’s next card; the last one has Finish the group.",
      "A wrong answer that opens a card says so: “Your answer opened ‘Why the lower third’ to help”, with a link to it.",
      "Group cards on the map’s toolbar: tap the Question cards to put together, then Make a card group (shift-click still works).",
      "The map starts a little zoomed out, so a lesson shows more of its cards at once. Fixed “cards” showing as “card$s”.",
      "In the question editor, the right answer is labelled Right, and the hint says it starts as the first option.",
      "Students and teachers get the same media buttons: Record (audio, video, screen or photo), Upload, Draw and Link.",
    ],
  },
  {
    version: "0.1.16",
    date: "2026-11-20",
    changes: [
      "A Question card’s question box is optional: leave it empty and the card’s title asks the question. A card with options is no longer hidden from students for want of separate question words.",
      "A card with one question no longer numbers it “01”, for students or in the editor.",
      "The course map fits the screen below whatever sits above it (like the “No students yet” banner), so the zoom bar stays in view. A card you add comes into view on the map, and a Question card with nothing more to say shows its drawing instead of empty space.",
      "Wording brought up to date: the home page picture, the map and editor hints (no more “make it a quiz”), polls say Option like other questions, “1 card” not “1 cards”, “Your work” for a student’s files.",
      "A card a student’s answer opens is announced as “Your answer opened a new card”, not “Your teacher added a card”. A score below full shows without a green tick.",
      "When students are waiting, the banner names them and its button says Review.",
      "Grades no longer explain skill levels in a course with no skills; group discussion groups and the AI summary button appear only where they apply.",
      "The sign-in page has the Questhand logo, and no second Privacy and Terms line.",
    ],
  },
  {
    version: "0.1.15",
    date: "2026-11-20",
    changes: [
      "Building a card, More is now Record: pick Audio, Video, Screen or Photo.",
      "Students’ maps show playing-card shapes too, with each card’s picture; a path not yet taken is a card back.",
      "The course map fills the screen; the Privacy, Terms and version line sits below it.",
    ],
  },
  {
    version: "0.1.14",
    date: "2026-11-20",
    changes: [
      "Two kinds of card: Content and Question. A Question card is answered with choices (a right answer, or a poll), an open answer, or a discussion; pick which under “How students answer”.",
      "Swap a card between Content and Question with the button beside it at the top of the editor. “Start from” and the kind picker are gone.",
      "Cards on the course map are playing-card shaped, with their picture or drawing on the face.",
      "Hold a card on the map to delete cards, like apps on a phone: they jiggle and each gets a − button. Tap Done or an empty spot to stop.",
      "Who’s working on a card is off on the map until you turn on “Where students are”, and sits at the card’s lower left so it doesn’t look like a close button.",
    ],
  },
  {
    version: "0.1.13",
    date: "2026-11-20",
    changes: [
      "The course map is easier to read: each answer has its own colour (A, B, C…) on its letter, its port and its wire, and score ranges go from rose (low) to green (high). Wires have a soft halo, and hovering a card fades the other paths and labels its own.",
      "Cards on the map have a cleaner shadow and a colour bar on top; each lesson is a soft panel with its number.",
      "Score ranges say how many questions they mean (“3 of 4 right”), and a range no score can land in is marked “never”. When a card group gains or loses a question, its ranges move to scores that can happen.",
      "Students’ maps use the same colours for the paths they took, with a gentle flow along them.",
      "On phones, less empty space between weeks.",
    ],
  },
  {
    version: "0.1.12",
    date: "2026-11-20",
    changes: [
      "Content cards have a Done button again, so students can finish them (it went missing in 0.1.9).",
      "A Choice card with no question written yet stays hidden from students. On the map it says so, and in a card group it shows as “No question yet”.",
      "Multiple choice cards no longer show a notes box and a Save button: answering is all they need.",
      "On phones: the For you and To-do tabs no longer break across lines, and the keyboard tips are hidden.",
      "A poll never keeps a right answer, even one saved from an older copy of the card.",
    ],
  },
  {
    version: "0.1.11",
    date: "2026-11-20",
    changes: [
      "Fewer kinds of card: Content, Q&A, Choice and Discussion (plus card groups). Existing cards were moved over and keep everything they had.",
      "One Content card for words, pictures, videos, links and recordings. Its face follows its first piece of media, so a card with a video looks like a video, and a card with only words looks like a page.",
      "Choice cards cover quiz questions and polls: set Right answer to “One is right” or “None (a poll)”. Switching keeps the choices and their branches.",
      "Card groups have an Add a question button: it adds the next Choice card to the end of the group, so a quiz can be built one question at a time.",
    ],
  },
  {
    version: "0.1.10",
    date: "2026-11-20",
    changes: [
      "A new week now starts with a lesson, so you can add cards to it right away.",
      "Polls and Multiple choice cards no longer show the hand-in box (recording, file or link) to students.",
      "Fixed a student’s map failing to open when a card group had paths they hadn’t taken.",
    ],
  },
  {
    version: "0.1.9",
    date: "2026-11-20",
    changes: [
      "Cards come in two families. Content: Text, Image, Link and Recording. Questions: Q&A, Multiple choice, Poll and Discussion. Pick the kind in the card’s panel; older cards were given theirs.",
      "Each family has its own shell (Content a clean frame, Questions a dashed frame and a coloured foot), and each kind its own picture, with the kind named in the card’s corner.",
      "Polls: no right answer; students vote and then see how the class voted. Each choice can deal its own card.",
      "Multiple choice cards hold one question and answer right away. To ask several, put them in a card group.",
      "Card groups: on the map, shift-click cards (or shift-drag a box around them) and choose Make a card group. A group shows as one node listing its cards; its score counts the first answers to its Multiple choice cards and can deal a card by range. Students see its cards together in a frame, with the score once done. Ungroup keeps the cards.",
      "Q&A takes any kind of homework: typed answers, audio, video, files and links. A Discussion is for the whole class or for each group (the old Collab Studio).",
      "Content cards no longer ask for notes, and on the map only cards that can branch offer to add a question. New courses and the sample course use card groups and a poll.",
    ],
  },
  {
    version: "0.1.8",
    date: "2026-11-20",
    changes: [
      "On the map, double-click a card’s title, a question or an answer to change it right there. Enter saves, Escape cancels.",
      "Drag a card by its head to another lesson. The map says if a move would break a branch (a card can’t go before the card that deals it, or after one it deals).",
      "Try a sample course: anyone can open their own copy of a small course as a student from the home page, no sign-up. It opens on the map and is gone after a day.",
      "On a student’s map, paths from a card they haven’t answered yet say “Answer to see where this leads”.",
    ],
  },
  {
    version: "0.1.7",
    date: "2026-11-20",
    changes: [
      "The course map is now the main view (the Map tab): every lesson side by side, each card in its tree, wires between lessons. Zoom out to see the whole term as titles; zoom in to see what each card asks. The old view is the List tab.",
      "Click a card on the map to edit it in the panel. Arrow keys move between cards and Enter opens one. Each lesson has + Card, and there is + Lesson at the end.",
      "The card panel starts with the card’s neighbours: what deals it and what each of its answers or score ranges deals. Click one to move to it, or open the card on the map.",
      "Where students are: on the map, each card shows who is working on it; a card where two or more have been stuck for over two days turns orange.",
      "Students get a Map view of their own path: the cards they have, why each follow-up came (“You chose …”), and a card back for every path they didn’t take. A lesson’s ⋯ menu can show students every path instead.",
      "Deleting a card in any way now removes the follow-ups only it dealt, even when saved from outside the website.",
      "New courses from the template start with a small tree: a quick check that deals a review card below 60% and a stretch card at 90% and up.",
      "A new home page: “Every answer opens a different door”, with an animated card tree.",
    ],
  },
  {
    version: "0.1.6",
    date: "2026-11-20",
    changes: [
      "Fixed: undoing the delete of a card whose follow-ups were in a later lesson could lose its wiring, and the follow-ups would then show for everyone. Changes that span lessons are now saved together.",
      "Fixed: Undo and Redo at the top of the deck (and ⌘Z) now undo a change across several lessons as one step.",
      "Making a card in a later lesson from the card tree saves the card and its wire together.",
    ],
  },
  {
    version: "0.1.5",
    date: "2026-11-19",
    changes: [
      "Branch by score: a quiz in the card tree can deal a different card for each score range (below 60%, 60–89%, 90% and up to start; change the lines, add or remove ranges). A student’s first submitted score decides, out of the questions they were given.",
      "Across lessons: an answer or a score can deal a card in a later lesson. Choose the lesson when you make the card, or deal one already there. The tree has ‹ › to move between lessons and shows cards from other lessons with a dashed edge.",
      "The card tree moves: cards rise in, wires draw themselves, cards glide to their new place when the tree changes, a new card pulses, and dots flow along the branches students took. Fit and zoom ease too.",
      "Students: a card dealt by their own answer shimmers and says For you. The message about it names the lesson and has Show, which takes them to the card.",
      "Deleting a card takes its follow-ups in other lessons with it (Undo restores all of them). A week copied with its lessons keeps the wires between them. Class % done counts only the cards each student was dealt.",
    ],
  },
  {
    version: "0.1.4",
    date: "2026-11-19",
    changes: [
      "Card trees: a choice question can deal a different card for each answer. Open Card tree from a lesson’s ⋯ menu, drag from an answer onto a card, or into empty space to make a new one.",
      "Follow-up cards stay hidden until a student’s answer deals them, and they can have questions of their own, so a lesson can branch more than once.",
      "A student’s first answer decides their path; a quiz deals when it’s submitted. They see “New card on your board” when one arrives.",
      "The tree shows how many students went down each branch. Follow-up cards in the deck say which answer deals them.",
      "Deleting a card also removes the follow-ups only it deals (undo brings them back). Duplicating a lesson keeps its tree.",
    ],
  },
  {
    version: "0.1.3",
    date: "2026-11-18",
    changes: [
      "A new look for the invitation email: the Questhand mark, the course name up top, one clear Open my board button, and a note that the same link gets them back in on any device.",
    ],
  },
  {
    version: "0.1.2",
    date: "2026-11-18",
    changes: [
      "A student’s invitation link opens their board straight away: no PIN to choose.",
      "The link keeps working for 120 days, so the same email gets them back in on another device. Sending again doesn’t break the links already sent.",
      "Reset PIN is now Reset sign-in: it also turns off that student’s links.",
    ],
  },
  {
    version: "0.1.1",
    date: "2026-11-18",
    changes: [
      "Signing in (or going home) no longer flashes the class-code page first.",
      "Invite students: Questhand can email each student a personal invitation with their own one-time link (once sending email is turned on for the site).",
      "Drag a card past as many others as you like.",
      "The Run Collab Studio button moved into the lesson’s ⋯ menu.",
      "Today’s lesson shows Today where its date goes; click it to change the date.",
      "Adding media to a card: Link, Upload, Draw, and More (audio, video and screen recordings, and a photo). A video link takes the video’s own title. Make cover works. Find an image is gone.",
      "A card keeps the suit you put it down as. Who sees the answers is a switch inside What comes back, and You is now Teacher.",
      "Text fields show a small × to clear them.",
      "The card editor has undo and redo for that card at the top; Save to my cards moved to the bottom.",
      "In delete mode, click anywhere off the cards to finish. Deleting asks in the site’s own style.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-11-17",
    changes: [
      "A new home page: the Questhand name and mark, with a way in for teachers and for students.",
      "Courses are cards now, the same 5 by 7 shape as every other card. Making a course asks for a name and whether to start blank or from the standard weeks.",
      "Class and Students are one tab, Students. Invite students in a share box: add them by email, copy the class link, or show the QR code. The class list shows each student’s name and email.",
      "Share a course with other teachers from Settings. Editors can change it; viewers can only look. They sign in with Google using the address you add.",
      "In the deck: undo and redo next to the save status, a date for every lesson (later weeks follow the first week until you change them), and Today follows the dates.",
      "Adding a lesson numbers it by its place in the course, and the lessons after it move up one.",
      "Press and hold a card to show delete buttons on that week’s cards.",
      "Dragging a card no longer gets stuck when you let go outside it.",
      "Connectors moved to Settings in the menu under your photo.",
      "The demo course is hidden from the course list, and Privacy, Terms and this version number sit at the bottom of every page.",
    ],
  },
];

export const VERSION = CHANGELOG[0].version;
