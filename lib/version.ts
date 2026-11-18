// The site's version. Every change that ships bumps it by 0.0.1 and adds an entry at the top of CHANGELOG.
// The footer shows VERSION and links to /changelog.

export const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
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
