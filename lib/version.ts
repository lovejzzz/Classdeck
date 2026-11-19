// The site's version. Every change that ships bumps it by 0.0.1 and adds an entry at the top of CHANGELOG.
// The footer shows VERSION and links to /changelog.

export const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
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
