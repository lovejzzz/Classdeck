// The site's version. Every change that ships bumps it by 0.0.1 and adds an entry at the top of CHANGELOG.
// The footer shows VERSION and links to /changelog.

export const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: "0.2.84",
    date: "2026-11-25",
    changes: [
      "Class sessions are gone (the timed agenda, Run the class session, turns and notes sent after class): Questhand courses are taken at each student’s own pace. Lessons that had one keep everything else.",
      "When work is handed in after its due date, the teacher sees it: “handed in Nov 25, 2 days late” (or “on time”), for revisions too.",
      "Students invited by email who haven’t joined yet are listed apart (“Haven’t joined yet”, marked “invited”), not counted as overdue or as not started, and Remind all no longer goes to them.",
    ],
  },
  {
    version: "0.2.83",
    date: "2026-11-25",
    changes: [
      "Questhand is for courses students take at their own pace, so the live-class tools are gone: raising a hand, live polls and the random picker. Writing a document together stays live: you see who’s there, their cursor and their words as they type.",
    ],
  },
  {
    version: "0.2.82",
    date: "2026-11-25",
    changes: [
      "Feedback keeps its rounds. When a student hands in a revision, the teacher sees what changed since their last feedback (words added and taken out, with what they said then), and the note starts empty for the new round. Earlier feedback stays on the card for both the teacher and the student, under “Earlier feedback”.",
      "Approving a card you had sent back for a revision, or taking that request back, finishes it again (it stayed in the student’s hand saying “Hand in”).",
      "Feedback notes can be up to 5,000 characters, and the box says how many are left near the end (longer notes used to be cut at 2,000 without a word).",
    ],
  },
  {
    version: "0.2.81",
    date: "2026-11-25",
    changes: [
      "Fixes from testing teachers and students working together. A student waiting to be let into a class sees the course open up on their page as soon as the teacher says yes (it said “Waiting for your teacher” until they reloaded).",
      "A student the teacher removes from a class is told so (“You’re no longer in …”), instead of “You’ve been signed out”.",
      "Students see “Teacher is here” in a group doc only while the teacher has the group’s live copy open, not while it sits folded under a hand-in. Before a group doc is handed in, the teacher’s panel says it hasn’t been handed in yet (it said “Nothing written yet” under a doc full of writing).",
    ],
  },
  {
    version: "0.2.8",
    date: "2026-11-25",
    changes: [
      "Cards a card group deals by score now follow the score as it is now. When the teacher fixes a right answer or changes the score bands, students get the cards for their new score, and cards for the old one they haven’t opened go away (ones they’ve opened stay). A question added to a group counts once it’s answered; until then the score they finished with stands.",
    ],
  },
  {
    version: "0.2.7",
    date: "2026-11-25",
    changes: [
      "The same course open in two tabs (or two teachers on one lesson): saving in a tab that still shows an older copy no longer undoes what was changed in the other. Each save keeps only what that tab changed; cards changed, added or deleted elsewhere stay that way. Coming back to a tab reads the course at once. A student's writing saved in one tab shows in another tab with the same card open.",
      "Faster with many courses and busy classes: a save now writes only its own course (each save used to look through every course on the site), and a page re-reads the course at most once a second when many changes come together (a whole class answering at once).",
      "Math typed into a card ($x^2$) is no longer saved with an extra $, and $$…$$ keeps its \\frac. Text with < > or & shows those characters, not “&lt;”. Very long words and links wrap inside cards and answers.",
      "The ⋯ menu of a lesson near the bottom of the screen opens upward, so its last items (the week’s) can be reached. A copied week takes the next unused week number (“Week 9”, not “Week 1 (copy)” again). Teachers see at most 24 names on each Needs attention card, with the rest one click away. Adding a week from a template says its real name.",
      "A card the teacher wires to an answer after students have already answered now reaches the students who gave that answer (it reached only students who answered later). Cards added to an answer that already dealt cards reach everyone who chose it, as before, and changes to later weeks show on students’ boards straight away.",
      "Changing a question after students have answered it: when an option is removed, each student's answer stays with the option they chose (it used to slide onto the next option, and the cards it dealt disappeared); an answer whose option is removed can be given again. When the right answer is changed, students' first answers are marked again and card group scores follow.",
      "A card saved without saying who gets it (from a file or another tool) no longer stops students' pages in that course from opening. A card or question removed while a student had it open says so in plain words.",
      "One save at a time for each lesson, so a save that fails while another is on its way can't lose the first one's changes.",
    ],
  },
  {
    version: "0.2.6",
    date: "2026-11-25",
    changes: [
      "Fixes from building three whole courses by hand and taking them as students. An edit made a moment before closing or reloading the page is now saved (it was lost); leaving with a very big unsaved lesson asks first.",
      "Electives start at “choose at least 1” (they started at 2, so with two electives students had to take both).",
      "In a group doc, a classmate who has left no longer shows as “here” with their cursor.",
      "On the map: answers that deal the same card share one label (“B · Sand / C · Seawater”) instead of one hiding the other; a card a group’s score deals says “dealt by a score”; there’s room below the last lesson so + Lesson isn’t under the map’s tools.",
      "Student View always offers to add another demo student. A class session starts as Warm-up, Main activity, Wrap-up (not a speaking class’s round of presentations), and its panel names the lesson. Long group names from a sign-up (“Yes: start at 10am”) no longer get “Group” added. The card editor’s tip about dealing cards by answer shows only on Choice cards, and an order question no longer says “Put these in order” twice.",
    ],
  },
  {
    version: "0.2.5",
    date: "2026-11-25",
    changes: [
      "A new demo course: Mission to Mars. Three weeks of cadet training for Year 6 (how far Mars is, packing the rocket, air and water on Mars, a greenhouse), with NASA photos, and a class of six part-way through. It shows answers that deal follow-up cards, a fuel check that deals a bonus or a refuel card by score, a base inspection made of two groups, a sign-up poll that makes the crew’s groups, two electives, hand-ins with feedback and a revision asked for, a discussion, and a student waiting to be let in. Open it from the home page, no account needed.",
      "The student marks on map cards are gone. The counts of how many students went down each answer stay (Settings → Course map → Show students’ paths).",
    ],
  },
  {
    version: "0.2.4",
    date: "2026-11-25",
    changes: [
      "Your courses no longer jumps down as it loads: the photo’s place at the top is kept while it arrives.",
      "Opening a course from Your courses shows it straight away, without a moment of grey placeholder cards: pointing at a course starts loading it, and a slow load waits half a second before showing placeholders.",
      "The small round marks on map cards (where students are: a student’s initial, orange after 2 days on one card) now say whose they are as soon as you point at one. Clicking one doesn’t open the card.",
      "Privacy and Terms are one page, Privacy & Terms (the old links still work).",
      "Press your photo in the account menu to choose a new one. It’s kept (a Google sign-in no longer replaces it).",
      "Faster everywhere: the server brought every course’s saved data up to date on every look, many times a request, so pages got slower as the site grew. It now does that once, when it starts.",
    ],
  },
  {
    version: "0.2.3",
    date: "2026-11-25",
    changes: [
      "The map’s tabs say what they do in fewer words: “Show 2 follow-ups” and “Hide follow-ups” on a card’s right edge, “Expand group” and “Collapse group” on a card group’s bottom edge. Their tips are drawn over everything, so the map’s edge and the cards beside no longer cut them off.",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-11-25",
    changes: [
      "New course → From a course file: make a whole course from a Questhand course file (.json), with its weeks, lessons, cards, card groups and the answers and scores that deal cards, all wired as they were. The dialog shows what’s in the file and fills in its name; anything that had to change on the way in (a card for named students from another class goes to everyone) is said once the course opens.",
      "Settings → Export course now writes that same file (nothing about the course’s students in it), so a course can be kept, sent to a colleague and made again. Wires that reach into later weeks are kept on the way back in.",
      "Import weeks and every save now clean a card the same way (attachments, look, forms), and a file that isn’t a course file, or has two cards with one id, is turned away with a reason.",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-11-25",
    changes: [
      "Fixes from making a course by hand, start to finish. A student who finished a card group no longer reads “Your answer opened …” under their last answer when it was the group’s score that opened the card; the group’s score says so instead. A wrong answer inside a group now says the group’s score counts the first answer.",
      "Branch by score on a small card group starts with ranges its score can reach (for 2 questions: 0–99% and 100%), instead of showing an impossible range marked “never” until it saved.",
      "In a course with no cards yet, its hint no longer covers the + Card menu.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-11-24",
    changes: [
      "The map’s fold controls are now small paper tabs, with no words (pointing at one says what it does). A tab at the top of a card’s right edge, where its wires leave, shows or folds the cards it deals; a tab in the middle of a card group’s bottom edge shows all its cards or cuts it back to a card’s height. White with an arrow: something is folded away; pale blue: it’s showing. They replace the “› 2 cards” pill and the Show all row.",
      "The wires under a card group now run below its bottom tab, so their labels don’t cover it.",
    ],
  },
  {
    version: "0.1.99",
    date: "2026-11-24",
    changes: [
      "The cards fanned out of a card group’s sleeve on the map can be used one by one: click one to open it in the panel, drag one along the fan to put it in another place in the group, or hold one: the fan’s cards wiggle, each with a delete button. Holding a card on the map still wiggles only the map’s cards and the group as a whole.",
      "A card group on the map is now always a card’s height with its fan: its card rows are cut off (with Show all to open it to full height, and Show fewer to close it), and its Group score stays in view at the bottom.",
      "Fixed: opening a card at the far right of the map left it under the card panel. The map now has room to scroll it clear, as it does for other cards.",
    ],
  },
  {
    version: "0.1.98",
    date: "2026-11-24",
    changes: [
      "A card group’s panel: the dashed card at the end of its hand now says Add a card, and offers what + Card does (Content, Question, or one of your Saved cards), instead of always adding a question.",
      "Drag a card along the group’s hand to put it in another place (the arrow buttons are gone). Hold a card and the cards wiggle, each with a button to delete it; or pick a card and press Delete. Open the whole card is now Edit this card.",
      "On the map, drag a card onto a card group’s sleeve: before you let go, it shows at the end of the group’s fan with the group’s own cards see-through. Let go and it joins the group; drag it away and nothing changes.",
      "Fixed: deleting a group’s second-to-last card (so the group comes apart) left the page squeezed as if the card panel were still open.",
    ],
  },
  {
    version: "0.1.97",
    date: "2026-11-24",
    changes: [
      "A card group on the map is now as tall as the cards beside it: its fanned cards and its sleeve together take one card’s height, instead of the sleeve alone being a card tall with empty space at the bottom. A group with many cards still grows to fit them.",
    ],
  },
  {
    version: "0.1.96",
    date: "2026-11-24",
    changes: [
      "A group of groups counts its answers once in the grades. A student’s quiz average uses the outer group’s score; each inner group is still listed under it in their Scores (“↳ Sea motion · in The ocean”) but isn’t counted again. Low quiz scores goes by the outer group too, so one weak inner group doesn’t flag a student who did well overall.",
    ],
  },
  {
    version: "0.1.95",
    date: "2026-11-24",
    changes: [
      "Students now see the scores of the groups inside a group. The last card of an inner group shows that group’s own score (and any card it opened), and the last card of the whole group shows the outer score with each inner score beside it. Each card of an inner group names it too, as “The ocean › Ocean life”.",
    ],
  },
  {
    version: "0.1.94",
    date: "2026-11-24",
    changes: [
      "Card groups can hold card groups (two levels at most). Hold a group, press its group button, and drag another group into the empty place: the two go together in a new group, like a unit. A group of groups can also hold loose cards. Box-picking groups and pressing Make a card group works too.",
      "The outer group’s sleeve fans out its groups (each a small stack) and lists each group with its cards. Every inner group keeps its own score and can still deal cards by it; the outer group’s score counts all their questions together.",
      "Students see a group of groups as one frame of all its cards, with the outer group’s score. Ungrouping an inner group keeps its cards in the outer one; ungrouping the outer keeps its groups. Saving it to My cards keeps every group and card in it.",
    ],
  },
  {
    version: "0.1.93",
    date: "2026-11-24",
    changes: [
      "A card group on the map is a sleeve with its cards fanned out of the top, like a hand of cards: a wider fan for more cards (up to seven shown, then +more). The cards rise out of the sleeve when the group is made, and spread a little when you point at it.",
      "The group’s name is on its sleeve: a new group is called Group 1, Group 2… and its name is ready to type as soon as it’s made. The pencil renames it, and the star saves the group, with its name and cards, to My cards.",
    ],
  },
  {
    version: "0.1.92",
    date: "2026-11-24",
    changes: [
      "The map’s tools are one small bar of icons: zoom, search, fold, and trash. Point at one to see its name. Group cards is gone from it (drag a box around cards instead).",
      "Where students are is always on: the map shows who is on which card and how many went down each answer. Turn it off in Settings → Course map.",
      "Hold a card and every card wiggles with two buttons: delete (top left) and group (top right). Press group, and the card gets a frame with an empty place beside it (a big +): drag cards into it. The first one makes a card group, and the place stays for more until you press Done or click elsewhere. On a card group, the button adds cards to it.",
      "A card group looks like a small stack of its cards, each edge in its card’s colour. Cards fly into a group when it’s made, the stack fans out, and on Ungroup the cards slide out of the stack to their places.",
    ],
  },
  {
    version: "0.1.91",
    date: "2026-11-24",
    changes: [
      "Inbox: a notification you’ve opened loses its blue dot and isn’t counted any more. It stays in the list, quieter, until you clear notifications.",
      "While a student’s work is open on the right, the top bar moves over to make room, so the Inbox and the rest of the bar stay in reach (as with the card panel).",
      "The card panel no longer says “Everyone gets this card” over a card kept for some students or groups.",
    ],
  },
  {
    version: "0.1.90",
    date: "2026-11-24",
    changes: [
      "Inbox: one button at the top of a course (in place of the bell) counts new messages and new class activity together. It opens a drawer: on the left, All, Messages (every conversation, from all your courses), each kind of notification, your courses, and Notify me about; on the right, the list, or a conversation to read and answer right there. New message is at the top. The Inbox in the photo’s menu is still there on pages without one.",
      "Notifications start with only Handed in on for teachers (Feedback for students); turn on Mentions, Discussions or Progress in Notify me about. Messages are always counted. @mentions and markdown read as plain words in the list.",
      "A card’s ⋮ is a quiet button on the card itself (it tilts with it), and its menu opens beside the card, not over it: Picture, then twelve colours, three to a row: six soft washes, gold, silver and platinum, and three holographic foils (Aurora, Nebula, Prism). Metal and foil cards have an edge of their own.",
    ],
  },
  {
    version: "0.1.89",
    date: "2026-11-24",
    changes: [
      "The card in the card panel has a ⋮ in its corner (on hover): change its picture (upload one, or use one of the card’s own pictures) and its colour (eight colours, or its family’s). The map and students’ boards show the card that way.",
      "Collect keeps the card’s picture and colour in My cards. A collected card, or one put down from My cards, remembers it: change it, and when you close it (or open another card) you’re asked whether to save the changes to My cards too. Collect on it again updates My cards instead of making a second copy.",
    ],
  },
  {
    version: "0.1.88",
    date: "2026-11-24",
    changes: [
      "The map’s contents float as a card with rounded corners and a soft shadow, a little in from the window’s edge.",
      "A course’s pages use the window’s width (up to 1600px) and start near its left edge, so the map has more room.",
      "Clicking the map’s empty space closes the card panel.",
      "The card panel: its first section is called Content. Collect (was Save to my cards, at the bottom) is at the top beside Duplicate, and the card’s place is short (4/9). While the panel is open, the map’s own undo, redo and history are hidden: the panel’s are the same ones.",
      "Every group is called “… Group” (Red Group, Kelp forest Group): type only the name, and Group is added. Groups named “Group 2” or with no name become colours (Blue Group); names with “group” in them lose it (Review group 1 is Review 1 Group). New groups start as Red, Blue, Green…",
      "Access for some groups: the students it reaches today fold out from “3 students”, and the line about groups changing is gone.",
      "Due: No due date or a date. The calendar button beside the date opens the whole course’s calendar, with every lesson day and due date; switch to another of your courses or all of them. Tap a day to make it the card’s due date.",
    ],
  },
  {
    version: "0.1.87",
    date: "2026-11-24",
    changes: [
      "A student’s page has three places at the top: Today, All cards and My board. The course title stands alone (no subtitle or student name), and the keyboard tips bar is gone (? still lists every shortcut).",
      "Today is the one card to play now, big, with why it’s next (up next, a revision, overdue…), its lesson, and Play. When a revision is asked, the teacher’s words are under the title. Beside it, Also needs you: the other cards to revise, overdue or due soon, and electives to choose. Below, today’s lesson.",
      "All cards is every week, as before (T and A switch between them). A card dealt into a lesson that isn’t on Today shows in All cards.",
      "My board shows the course as a route: each lesson a stop, filled when done, today’s bigger, a number for cards to revise. Three weeks at a time (last week, this week, next), sideways for the rest; one week at a time on a phone. Tap a lesson to see only your work from it.",
    ],
  },
  {
    version: "0.1.86",
    date: "2026-11-24",
    changes: [
      "The map’s contents (every week and lesson) slide out from the window’s left edge, over the page, instead of from the map’s edge.",
      "A student’s tags under today’s progress count work the teacher asked to revise, and cards overdue or due soon, wherever they are in the course (a card two lessons ahead was missed).",
      "A worksheet written with the groups from a sign-up poll: a student who hasn’t picked a group yet is asked to pick one first, instead of writing in a copy of their own that would be left behind.",
      "Duplicating a lesson (or week) with a sign-up poll makes the copy’s groups at once, so the copied cards that use them, or go to one of them, find them.",
      "Saving refuses two cards with the same id in one course (one of them would vanish from the map and share the other’s work).",
    ],
  },
  {
    version: "0.1.85",
    date: "2026-11-23",
    changes: [
      "Questhand 101 names the Students tab’s Class list and groups as it’s labelled.",
    ],
  },
  {
    version: "0.1.84",
    date: "2026-11-23",
    changes: [
      "Students and Grades are one tab. On the left, the class list: Whole class, then each student with tags for what needs you (work to review, new messages, overdue, not started), a search, and Class list and groups.",
      "Whole class is a lesson at a glance (pick the lesson at the top): who needs attention, everyone’s cards and the votes. Each discussion is folded to one line with its posts and replies until you open it.",
      "A student is their whole course: work waiting for your feedback (open it to review), your feedback so far, week by week (every card as a square; click one to see their work), scores, and their skills next to yours. Try as them and Message are at the top.",
      "Export in Whole class adds the whole course’s grades (CSV). Messages and Electives settings moved to Settings. Shortcuts: 1 Map, 2 Students, 3 Settings.",
      "Questhand 101 says where things are now.",
    ],
  },
  {
    version: "0.1.83",
    date: "2026-11-23",
    changes: [
      "The map lines up with the rest of the page: it starts where the tabs start and ends where the page does, instead of running to the window’s edges.",
    ],
  },
  {
    version: "0.1.82",
    date: "2026-11-23",
    changes: [
      "A card group’s hand sits on a gentler arc: the cards lie on one curve, turning only a few degrees in all, a little more as the group holds more cards.",
    ],
  },
  {
    version: "0.1.81",
    date: "2026-11-23",
    changes: [
      "A card group’s panel shows its cards as a hand, fanned like in a card game. Point at a card and it lifts while its neighbours lean away; click it and it rises out of the hand, and its title, question and choices open right under the hand to edit, so a whole quiz is written in one place.",
      "On each card in the hand, a green dot means it’s ready and an amber one that it still needs something. The dashed card at the end adds a question (and opens it); ← and → move the open card, and Take out of the group removes it. The arrow keys move between cards.",
    ],
  },
  {
    version: "0.1.80",
    date: "2026-11-23",
    changes: [
      "A picked card stands out more: on the map, a card open in the editor (or picked with others) has a thick blue edge; in a card’s panel, the chosen answer form has a thicker border.",
      "The bell has sections. Teachers: Messages, Handed in, Discussions, Progress. Students: Your teacher, Feedback, Discussions, New cards. Each is a tab with how many are new, and the settings button turns any section off, so it isn’t counted or listed (kept on that device).",
      "The handle on the map’s left edge (it opens the contents) is bigger and bolder.",
      "A student’s board: picking a reply or mention in the bell (in the week view) opens its discussion again.",
    ],
  },
  {
    version: "0.1.79",
    date: "2026-11-23",
    changes: [
      "One undo for the whole site: a card’s panel no longer has its own undo and redo. The course’s Undo, Redo and History sit at the top of the card’s panel too, and cover every change in it.",
      "A card can go to whole groups: Only some students or groups… lists every group (from the course’s groupings and sign-up polls). Whoever is in a picked group gets the card, also when the group changes.",
      "Due dates: No due date is a choice of its own, picked on every new card, beside Today, +3 days, +1 week and a date.",
      "Demo students: add as many as you need and name them yourself (Students → Demo students, or Add a demo student in Student View). Remove one at a time or all at once; a demo student’s work goes with them.",
      "Students: “Add students without email” is gone. Every student signs in with an email address, so they’re added by email (or join with the class code).",
      "Delete a lesson or a whole week from its ⋯ menu (you’re asked first; students’ work stays saved).",
      "Peer review on a discussion: a student in a small group replies to as many classmates as there are (a card asking for 2 in a group of 2 asks for 1). Students → Waiting for feedback and Owe feedback count discussions that ask for replies, as they did Collab Studio.",
      "Map: a sign-up poll shows its groups on its card (it said Add its question). A post box in a group’s discussion says “your group”. Avatars of names ending in a single letter (Demo Student A) show that letter.",
      "Questhand 101 is three weeks: who gets a card, one undo, deleting lessons, a group worksheet made from a sign-up poll, a card only for one group, and peer review with structured feedback in groups.",
    ],
  },
  {
    version: "0.1.78",
    date: "2026-11-23",
    changes: [
      "Map: a card’s coloured top bar follows the card’s rounded corners (it stuck out past the border), also on a card being dragged; the card’s type (Multiple choice…) stays on one line.",
      "Map: room under the last lesson for the floating toolbar, so it no longer covers + Lesson and the week buttons; on a phone the toolbar is one row of icons.",
      "Map: a card’s preview keeps its line breaks (a heading no longer runs into the text after it).",
      "Students: a line saying what the page shows sits beside Export. Grades: a student’s details label Your feedback. My board is called “Name’s board”. Avatars always show a capital letter.",
    ],
  },
  {
    version: "0.1.77",
    date: "2026-11-23",
    changes: [
      "Collab Studio is folded into Discussion. A discussion can ask for Structured feedback: a reply to a classmate’s post has three parts (what I noticed, the effect it had on me, one thing to try next), and the post’s author can mark a reply helpful.",
      "Importing a document makes a peer-review session a discussion in groups: each student posts their work and gives structured feedback to two groupmates.",
      "An older Collab Studio card keeps working with its posts and feedback; switching it to Each group carries the peer review over (reply to 2, structured feedback).",
      "Questhand 101 describes Structured feedback.",
    ],
  },
  {
    version: "0.1.76",
    date: "2026-11-23",
    changes: [
      "Feedback to a group. On a group’s worksheet, the panel says who wrote it together, and your feedback, Ask to revise and comments on passages go to the whole group; it’s listed once, under the group’s name, in Ready for your feedback. Replies on it say which member wrote them.",
      "On work each student did on their own, Send the same feedback to everyone in the group gives the whole group one note at once (everyone in the group who handed it in).",
      "View-only co-teachers read discussions without the post, reply, approve or pin controls.",
      "Collab Studio’s feedback goal follows the card’s own groups (a small group’s goal is smaller), and the class total adds those up.",
      "The week tabs on a student’s board count a path’s versions once, like each lesson does.",
      "Demo students a teacher puts in groups stay there.",
    ],
  },
  {
    version: "0.1.75",
    date: "2026-11-23",
    changes: [
      "Feedback is for work handed in: an Open answer or a Worksheet. A Content card, a quiz question or a discussion has no feedback box; instead the panel says why and offers Message.",
      "Work handed in again after Ask to revise comes back to Ready for your feedback (and Grades’ To review).",
      "A group worksheet is one piece of work: feedback (or Ask to revise) goes to everyone in the group. Handing it in records the time.",
      "A worksheet filled in by a group or the class, or a discussion, always goes to everyone: answers can’t deal it and Only some students isn’t offered. A sign-up poll’s answers make groups and no longer deal cards.",
      "Card groups can’t take a quiz (it has its own score and tries) or a card for only some students (the group’s score would never come).",
      "A started elective stays on the student’s board (no Drop once there’s work in it).",
      "Students: Haven’t started and the class numbers count only students with cards in the lesson; demo students are tagged and left out of the class numbers and the grade export, and don’t join the class’s own groups. View-only co-teachers see the work without feedback, reminder or form controls.",
      "Quizzes that draw from a question bank show the right total everywhere. Grades shows students’ self-ratings from any card. The electives prompt no longer asks for more than the course has. A class worksheet says Done (nothing is reviewed one by one).",
      "Removing a set of groups that cards use asks first. The guest link no longer shows groups or unfinished cards.",
    ],
  },
  {
    version: "0.1.74",
    date: "2026-11-23",
    changes: [
      "Fixed: after trying the course in Student View and going Back to teaching, the map's changes could fail to save (“Not saved: That student isn’t in this class”). Your saves were still being sent as the student you'd tested as.",
      "If a save doesn't go through, your changes stay on screen and saving is tried again by itself; Try now tries at once.",
      "History, beside Undo and Redo: every change since you opened the course, newest first (Added, Deleted, Renamed, Moved, Edited…). Pick one to go back to before it; Redo brings the steps back.",
    ],
  },
  {
    version: "0.1.73",
    date: "2026-11-23",
    changes: [
      "A calmer board for students: the For you / To-do / Starred panel and the Electives shelf are gone.",
      "Under the lesson's progress, small tags show only what needs the student: cards to revise, overdue, due soon, to catch up, and electives to choose. Click one to open its card (or see the list).",
      "Up next puts a revision first, then anything overdue in any lesson, then where you left off.",
      "Electives sit in their own week, cards face down, with Choose. A chosen one is a lesson like the others, marked Elective, with Drop until you start it.",
      "My board has Starred and Suggestions (skills to focus on, feedback to try). Turn on reminders is in the menu under your photo.",
    ],
  },
  {
    version: "0.1.72",
    date: "2026-11-23",
    changes: [
      "The demo students are called Demo Student A and Demo Student B.",
      "Closing a card without finishing it (Later, ✕ or Esc) shrinks it back into the card it came from, like rewinding the way it opened.",
    ],
  },
  {
    version: "0.1.71",
    date: "2026-11-23",
    changes: [
      "Edit a picture on a card: crop it, add text, and draw on it with pens in different colours and sizes. Save puts the edited picture in its place.",
      "Draw has layers: drawing layers, text, and pictures. Add a picture with Add a picture or by dropping it on the page; move it, resize it from its corner, or erase parts of it. Hide, reorder or delete layers; Undo (⌘Z) steps back.",
      "Demo students: add Odessa Brightwell and Caspian Thornbury to the class list (Students, or the Student View menu) to try the course as them. What you do as them is kept and shows in Grades; Start over clears it. Remove them any time.",
      "Student View's menu lists the demo students first, then the quick test students, then the class.",
    ],
  },
  {
    version: "0.1.70",
    date: "2026-11-23",
    changes: [
      "Card editor: a card's files are listed under Attachments, each with a preview. Click a recording to hear it right there; click a video or picture to see it big.",
      "Draw opens in a large panel of its own, for teachers and students.",
      "A card can go to some students: Only some students… lets you pick any number of them (it was one). The map shows how many get it.",
    ],
  },
  {
    version: "0.1.69",
    date: "2026-11-23",
    changes: [
      "Students only ever read a Content card. When they should write, a Question card has a fourth way to answer: Worksheet. Your text is the worksheet, and Who fills it in is Each student, Each group or Whole class.",
      "Content cards students wrote in are now worksheets, with everything students wrote and handed in kept. They show as Question cards (brown) on the map and boards.",
      "A Content card's Access is who gets it and when it's due; Students can… is gone.",
      "Questhand 101 has a card on worksheets.",
    ],
  },
  {
    version: "0.1.68",
    date: "2026-11-23",
    changes: [
      "Card editor: a new Access section brings together what students can do with a card, who gets it and when it's due.",
      "On a Content card, Students can: Read it, Each edit their own copy, Edit together in groups, or Edit together as a class (it was Who writes in it, under the text).",
      "Access says who gets the card: everyone, or the students an answer (or a score) deals it to, with a link to that card. Only one student… is still there for the odd exception.",
      "Map: Add a card opens to the right of + Card, so it doesn't cover the lesson's cards; the map scrolls to show it when needed.",
      "Questhand 101 describes Access.",
    ],
  },
  {
    version: "0.1.67",
    date: "2026-11-23",
    changes: [
      "Map: each lesson's band is as wide as its own cards, with + Card right after them, instead of as wide as the longest lesson.",
      "Adding a card: the menu is called Add a card and says which lesson it goes in. Content and Question are two small cards to pick from, and your saved cards are a stack under them.",
      "Map: a new Question card with no question yet no longer shows its empty options and the Add its question line at once.",
    ],
  },
  {
    version: "0.1.66",
    date: "2026-11-23",
    changes: [
      "Card faces follow what's in the card. A card students write in shows as a Worksheet (each their own) or a Group doc / Class doc (written together); a file shows its type (PDF…); text with a table shows as a Table.",
      "Question faces say what they ask for, each with its own picture: Multiple choice, Checkboxes (pick all that apply), Put in order, Short answer, Quiz (several questions), Poll, and Sign-up (a poll that makes groups).",
      "Map: Put in order and Short answer cards show their question, the right order or the accepted answers (they no longer looked unfinished).",
      "Map: Checkboxes cards mark every right answer.",
      "Map: a question card's picture, video, recording or file shows above its answers.",
      "Map: a card's preview leaves tables out (no more “Name · Min A · 3”), and a card full of answers no longer spills its text below its edge.",
    ],
  },
  {
    version: "0.1.65",
    date: "2026-11-23",
    changes: [
      "Removing a student now takes them out of every set of groups too, including a sign-up poll's (it no longer counted them, or showed a blank name).",
      "A student can't be renamed to a classmate's name.",
      "A live poll no longer blocks the top bar: students can open their account menu, Inbox, notifications and board while it shows. It sits below the bar, a poll they close stays closed, and a closed poll's results stop showing a few hours after class.",
      "Grades: a student's details list each quiz and card group with its score (and tries), and use the full width when the course has no skills.",
      "Students → Groups counts every card using a set of groups (discussions in groups and the sign-up poll too). Removing a sign-up poll's groups makes it a plain poll.",
      "Writing boxes are named for screen readers (“Your copy of …”, “Shared text”).",
    ],
  },
  {
    version: "0.1.64",
    date: "2026-11-23",
    changes: [
      "Sign-up polls: tick Make groups from the answers on a poll, and each option becomes a group. Students join one by picking it and can switch until the teacher locks the groups. Set how many fit in each group (a full group can't be picked), and whether students see who's in each.",
      "The groups a sign-up poll makes are kept under the card's name, for other cards' Each group to use. Move students on the poll changes them by hand, and those changes stay when the card is edited.",
      "@mentions: type @ in a discussion post or reply and pick a classmate or the teacher from the list. The name shows as a tag, and the person mentioned is told.",
      "Two students in a class can't share a name. Someone joining with a name a classmate already has is asked to add something, like a last initial, before they're in.",
      "Questhand 101: a card on sign-up polls with one to try, and notes on @mentions and names.",
    ],
  },
  {
    version: "0.1.63",
    date: "2026-11-23",
    changes: [
      "Discussion cards are a conversation now, like a forum: one feed of posts, Newest or Top first, each post with its replies, and replies to replies as threads.",
      "Posts and replies are written like a card: formatting, lists, tables and math, and Record (audio, video, screen, photo), Upload, Draw and Link. Students can select words in the card's text and quote them in a post.",
      "Topics (instead of columns): give two or more and students tag each post with one; everyone filters the feed by topic.",
      "Each group is a feed per group, using the groups picked on the card: students see their group's posts and the teacher's; the teacher sees every group's, each marked with its group. Older group discussions (Collab Studio) stay as they were until changed.",
      "Students are told when someone replies to their post or to their reply.",
      "Fixed: a teacher couldn't post in a discussion (the post was refused).",
    ],
  },
  {
    version: "0.1.62",
    date: "2026-11-23",
    changes: [
      "Groups are made on the card that needs them: choose Each group (writing together, or a discussion in groups), then Make groups. Name the groups, split the class at random into as many groups as you like, or tap students into each group; name each group too.",
      "Groups you make are kept in the course: another card picks them from the list instead of making them again. Make new ones whenever the groups change; changing groups changes them on every card that uses them.",
      "Students → Groups lists every set of groups in the course, to change or remove. New courses no longer start with a group, and new students aren't put in one.",
      "A card on Each group with no groups made yet has the whole class as one group.",
    ],
  },
  {
    version: "0.1.61",
    date: "2026-11-23",
    changes: [
      "Write together: Who writes in a Text card can be Each group (every discussion group shares one copy) or Whole class (everyone shares one). They write at the same time, live, each cursor showing its writer's name, with who's there above the text.",
      "History on a shared copy: a version is kept every few minutes, with who wrote in it. Look at any version, or go back to it.",
      "In a group, anyone can Hand in for the whole group; each member gets it handed in, and it waits for your feedback. In Students you can watch a group's or the class's copy as it's written, and write in it too.",
      "Tables that add up: Σ Total adds a row that adds up each column (write =AVERAGE, =COUNT, =MIN or =MAX instead of =SUM for those), and Bar, Line or Pie puts a chart of the table under it. Both keep up as the table is filled in. The editor shows how they look under the text.",
      "Questhand 101 has a card on writing together, and a class table to try it.",
    ],
  },
  {
    version: "0.1.60",
    date: "2026-11-23",
    changes: [
      "Who writes in a Text card: Only you (students read it), or Each student, in their own copy. Your text is where each student starts, like a worksheet with its headings and tables; they write in their copy, it saves as they go, and they Hand in.",
      "A handed-in copy waits for your feedback in Grades and Students like any other work, shown as the student wrote it. Select any words and press Comment: the student sees your comment on those words (they're marked in the text) and can reply, and you can reply back or remove it.",
      "Students see their handed-in copy, formatted, on My work.",
      "Questhand 101 has two new cards on this, one of them a copy to write in.",
    ],
  },
  {
    version: "0.1.59",
    date: "2026-11-23",
    changes: [
      "Inbox: click your photo at the top right. Every conversation is there, from all your courses, newest first; a red number on your photo counts new messages. New message picks who to write to.",
      "Students write to their teacher from the same Inbox, and to classmates too. A teacher can turn messages between students off for a class (Students → Students can message each other; it's on to start). Messages between students are private to them.",
      "Message beside a student in Students opens the same conversation. The Messages button on the student board moved into the Inbox.",
      "Questhand 101 has a card on messages.",
    ],
  },
  {
    version: "0.1.58",
    date: "2026-11-23",
    changes: [
      "A card's text is written like a document now: headings, bold, italic, strikethrough, links, bulleted and numbered lists (lists inside lists too), callouts for a tip or a key idea, dividers, and tables. Use the bar above the text box. A table can grow and shrink (+ Row, + Column, − Row, − Column), and one pasted from Google Sheets, Excel or Docs stays a table.",
      "Students see it formatted, on their cards and on guest links. Cards written before look the same as they did; their lists now show as lists.",
      "Math keeps working: $…$ in the text box becomes a small math chip (click it to change it), and it's kept exactly as written.",
      "Map previews, read-aloud and card search read the words, without the formatting marks.",
      "Questhand 101 has a new card, Format a card, showing what a card's text can do.",
    ],
  },
  {
    version: "0.1.57",
    date: "2026-11-23",
    changes: [
      "Schedule lessons from here… (in a lesson's ⋯ menu): pick the first class, the days class meets and any days off, and this lesson and every one after it get their dates, shown before they're set. Electives keep no date.",
      "Save a whole lesson (its ⋯ menu → Save lesson to my cards), or a card group with its cards (Save to my cards on the group). Put either down from Saved cards in any of your courses: the cards come with the answers and scores that deal cards inside them still wired. Saving a card group used to save only the group, without its cards.",
      "Find a card: Search under the map (or press /) looks through every card's title, text, questions and choices. Pick a result and the map goes to it and opens it.",
      "Messages: talk with one student privately. In Students, each student has Message; students write back from Messages on their board. Unread messages show beside the student's name and in Class activity. Reminders from the teacher are part of the same conversation.",
      "Opening a card from elsewhere (a search, a link) brings it into view up and down, not only sideways.",
    ],
  },
  {
    version: "0.1.56",
    date: "2026-11-23",
    changes: [
      "Every new teacher account starts with Questhand 101 in its courses: a four-week course on using Questhand, made in Questhand. Try it as a student with Student View, or borrow from it.",
      "When an answer deals cards, they're dealt onto the board: once the card closes, each new card flies into its place and glows, and it says New until it's opened.",
      "A map menu (an answer's menu, or + Card) that would run past the edge of the map moves back into view.",
      "The Google Forms connection is gone: Questhand's own card forms do the same job.",
    ],
  },
  {
    version: "0.1.55",
    date: "2026-11-23",
    changes: [
      "Saved cards are a choice wherever you add a card: next to Content and Question, Saved cards opens the cards you saved (with Save to my cards) in any of your courses. Pick one to put down a copy. It's there in + Card on a lesson and when you make the card an answer deals.",
    ],
  },
  {
    version: "0.1.54",
    date: "2026-11-23",
    changes: [
      "Cards you save with Save to my cards can be used again: + Card on any lesson, in any of your courses, lists them under From my cards. Pick one to put down a copy. The × beside one removes it from My cards. (Saving worked before, but there was no way to use a saved card.)",
    ],
  },
  {
    version: "0.1.53",
    date: "2026-11-23",
    changes: [
      "Questhand 101's sample media has two new narrated videos (getting around the map, and inviting your class), and the Student View video shows the student board as it is now.",
      "Pressing Esc on the full-screen QR code closes only the QR code, not the invite box under it too.",
      "The demo course's tour and Student View cards are worded for the current site (no List tab; Student View is never graded).",
    ],
  },
  {
    version: "0.1.52",
    date: "2026-11-23",
    changes: [
      "The map's contents marker on the left edge is easier to spot: a darker bar with a › in it.",
      "On a student's board, a week's heading is its name (“Getting started”), not “Week 1 · Getting started” again under the Week 1 tab.",
      "On a student's board, today's lesson row starts where every other row does (it used to open scrolled to the far left).",
    ],
  },
  {
    version: "0.1.51",
    date: "2026-11-23",
    changes: [
      "Students no longer have a Map view: their board is the cards. A card an answer deals goes straight into their hand, and the card says which cards it opened. The map is the teacher's.",
      "A Content card that was added and left blank (no words, no media, still called “New Content card”) stays off students' boards until it has something in it. On the map it says so.",
      "A card with an uploaded video is labelled Video and drawn as one (it was labelled Recording, with a microphone). Recording is for voice notes.",
    ],
  },
  {
    version: "0.1.50",
    date: "2026-11-23",
    changes: [
      "The open demo course (/teach/demo) is new: Questhand 101, with a class part-way through it. Six students on different paths, one waiting to be let in, work waiting for feedback, a revision asked for, a voice note from the teacher, a reminder, a discussion, due dates, a class session, an elective, and every kind of question. It resets every night. The sign-in page links to it.",
      "Questhand 101's videos and voice notes have new, more natural narration.",
      "Replying to a classmate's post: the Record menu (Audio, Video, Screen, Photo) was cut off inside the post, so only Photo showed. It now opens above everything.",
      "Recordings made in the browser show their real length and can be skipped through (they showed 0:00 before).",
      "A student's My work page plays the teacher's voice notes and shows files attached to feedback, not only the words.",
    ],
  },
  {
    version: "0.1.49",
    date: "2026-11-22",
    changes: [
      "Everyone signs in. One Questhand account (Google, or email and password) is for everything: the courses you teach and the classes you take.",
      "Your courses has two parts: As Teacher and As Student. As Student shows only when you're in a class. If you first came from an invitation or a class code, As Student comes first; if you came to teach, As Teacher does.",
      "A student's invitation link asks them to sign in or make an account, then adds the class to it for good. A link already used by one account can't be used by another, and a teacher can't take a student's place with it.",
      "The class code still works, after signing in: enter it under As Student (Join a class). The class link opens Questhand with the code ready. Whether anyone with the code can join, or only after you let them in, or only invited students, is set as before.",
      "The old ways in without an account (picking your name and a 4-digit PIN, adding yourself by name) are gone. Students who used them can be sent their invitation link from Settings (Invitation link, beside each student who hasn't joined with an account yet). Reset sign-in now unlinks the account.",
      "The home page is now the way in: the sample course and the feature cards are gone.",
    ],
  },
  {
    version: "0.1.48",
    date: "2026-11-22",
    changes: [
      "The Privacy and Terms links and the version number now show only on the home page and in Settings, not at the bottom of every page.",
    ],
  },
  {
    version: "0.1.47",
    date: "2026-11-22",
    changes: [
      "With a card's panel open, the course page's top bar (class code, Student View, notifications) and the tab row's Saved and undo move left so the panel doesn't cover them, sliding with the panel.",
      "The “No students yet” box can be closed with the ✕ in its corner (remembered for that course on this device). Students waiting to be let in still show.",
    ],
  },
  {
    version: "0.1.46",
    date: "2026-11-22",
    changes: [
      "The map's contents panel now hangs from the window's left edge, so the pointer that opens it is already inside it: it no longer flickers open and shut.",
      "Opening a card's panel moves the map at the same time: it makes room and, if the card would end up under the panel, slides it into view as the panel comes in, instead of after.",
    ],
  },
  {
    version: "0.1.45",
    date: "2026-11-22",
    changes: [
      "The course map fills the page and starts at 100%. The contents panel stays out of the way until the pointer reaches the map's left edge; then it slides in and pushes the map over. The card panel pushes it from the right, so with both open the map sits between them.",
      "Lessons on the map no longer have a one-line goal box.",
      "A box to pick cards can start anywhere on a lesson's empty space, its header row included.",
    ],
  },
  {
    version: "0.1.44",
    date: "2026-11-22",
    changes: [
      "The course map has a contents panel on the left: every week and its lessons, with today's lesson marked and the lesson you're looking at highlighted. Click a lesson to go there. (It replaces “Go to a lesson”.)",
      "Pick several cards by dragging a box around them on the map's empty space (Shift adds to what's picked). Then make them a card group, or delete them all at once, with one Undo. To move the map by dragging, hold Space (on a touch screen, drag as before).",
      "A card group can hold any kind of card, not only questions. Its score ranges show only when it has question cards in it.",
    ],
  },
  {
    version: "0.1.43",
    date: "2026-11-22",
    changes: [
      "The List tab is now part of the Map. Each lesson on the map shows its date (or Today), its one-line goal (click to write one), and an elective badge. Its ⋯ menu has the lesson and week actions: make it today's lesson, run or plan the class session, show students every path, make it an elective (or required), duplicate it, and add a lesson to the week, rename the week or duplicate it. New week (blank or from a template) sits next to + Lesson at the bottom of the map.",
      "The course page's tabs are now Map, Students, Grades and Settings (keys 1 to 4).",
    ],
  },
  {
    version: "0.1.42",
    date: "2026-11-22",
    changes: [
      "The card panel no longer has an “A card for each answer” button (it only jumped to the map). Branches are made on the Map by dragging an answer's dot; the card an answer deals still shows next to it in the panel, and opens with a click.",
    ],
  },
  {
    version: "0.1.41",
    date: "2026-11-22",
    changes: [
      "A card to read or watch says Done, and has a Later button beside it: close the card without finishing, and it stays in your hand for another time.",
      "Opening and closing a card is smoother: the card itself grows into the open card and shrinks back, instead of a blank white sheet growing out of it.",
      "On a student's Map, a question they haven't answered shows one question-mark card, not one for every answer (they'd only ever get some of them). Once answered, only the card it opened shows.",
      "Polls: pick an option (pick it again to clear it), then Submit vote. Once it's in, it can't be changed. Then Done closes the card; closing it without Done still counts it as done.",
      "Students can star cards to come back to: they're listed under Starred, next to To-do at the top of the board.",
    ],
  },
  {
    version: "0.1.40",
    date: "2026-11-22",
    changes: [
      "Every course has a Demo student in Student View, even before anyone joins. Their progress is kept between tests, so you can walk through the course over several days and pick up where you left off. They're never in your class list, grades or notifications, and Start over clears their work.",
      "Fixed: opening Student View from the course page first asked for the student's real board (and briefly failed) before switching to the test.",
    ],
  },
  {
    version: "0.1.39",
    date: "2026-11-22",
    changes: [
      "After a vote or an answer that deals cards, the card says which ones it opened (all of them, each a link to the card), not only a passing notice. A quiz says which cards its score opened. A notice for two or three new cards names them.",
      "A discussion you've posted on, with no classmate's post to reply to yet, no longer holds up your next card: the board moves on, and the discussion comes back once someone posts.",
      "The audio player on a card shows the recording's real waveform.",
      "The sample media for the Questhand 101 course (short narrated videos, voice notes and pictures) is part of the site.",
    ],
  },
  {
    version: "0.1.38",
    date: "2026-11-22",
    changes: [
      "One answer can deal more than one card. Drag an answer to a second card and it's added beside the first, each with its own line, instead of replacing it. The answer's menu lists every card it deals, each with its own Disconnect.",
      "Cards dealt by the same answer can be dragged to reorder them among themselves.",
      "On the course map, a card's video shows a frame of it; click it and the video grows out of the card and plays, full screen too. A picture opens large the same way. A recording plays right on the card.",
      "Recordings show their real waveform, on the map, on students' cards and in the card panel.",
      "Holding a card to delete cards: the “Tap to delete” bar sits in the map's top-right corner, and pressing Done no longer makes the whole map flash.",
      "Fixed: with Where students are on, a quiz's score ranges again count the students who went each way (they showed none since 0.1.36).",
    ],
  },
  {
    version: "0.1.37",
    date: "2026-11-22",
    changes: [
      "On the course map, a click anywhere on a card opens it, not just its top. Its answers' dots, buttons and boxes keep working as before.",
      "In the card panel, the card preview plays its media: a video plays in place with its controls and a full-screen button, and a recording plays and pauses right on the card, its waveform filling as it goes.",
    ],
  },
  {
    version: "0.1.36",
    date: "2026-11-22",
    changes: [
      "A quiz that deals cards by score now goes by the student's best try: a better retake also deals the card for its new score range, and the cards from earlier tries stay. On the map the score ports read “Score (best try)”.",
    ],
  },
  {
    version: "0.1.35",
    date: "2026-11-22",
    changes: [
      "Quizzes with more than one try keep the answers to missed questions hidden until the last try, so the next try isn't copying. The quiz says so under “Try again”.",
      "A student who falls behind sees “Catch up on …” with how many cards are left, instead of “You’re on track”. Once today's cards are done, the next card comes from earlier lessons before later ones, and a revision your teacher asked for always comes first.",
      "The last card of a card group says the group's score and which cards it opened.",
      "Class activity gives work handed in (an open answer, a note to the teacher) its own line with what the student wrote, instead of folding it into “Worked through N cards”.",
      "In Students, a poll shows how many chose each option, not a score. A new “Low quiz scores” list shows who got under half on a quiz or card group in the lesson.",
      "In Grades, work waiting for feedback opens straight in the review panel, in its lesson.",
      "On a discussion, a classmate's post says “Reply” next to the reply count, so it's clear where to reply.",
      "A student's My work page shows quiz scores, their quiz average, and the teacher's feedback under each piece of work.",
      "On a phone, the student Map starts zoomed out a little more.",
    ],
  },
  {
    version: "0.1.34",
    date: "2026-11-21",
    changes: [
      "A student's Map is laid out like the teacher's: each lesson is a row, one under another, and the cards an answer opened hang below the card that opened them. Lines leave the bottom of a card and come into the top of the next.",
      "The student Map can zoom: the − and + buttons, a trackpad pinch, or ⌘/Ctrl + scroll. Zoomed far out, each week becomes a column, so the whole course fits on one screen; the percentage button fits a lesson's row first, then the whole course.",
    ],
  },
  {
    version: "0.1.33",
    date: "2026-11-21",
    changes: [
      "Class activity groups a student's quick answers by lesson: catching up on several lessons in one sitting shows a note per lesson, not one note for everything.",
      "In the List, a card dealt from more than one answer says so (“If C: Hard · +1 more”), instead of naming only the first.",
    ],
  },
  {
    version: "0.1.32",
    date: "2026-11-21",
    changes: [
      "Zoomed far out, the course map shows each week as a column with its lessons stacked, so a six-week course fits on one screen. Zoom in and lessons are rows again. The zoom button's second press now fits this whole-course view.",
      "The List shows each lesson of a week on its own row of cards, so a week's second lesson is never cut off at the right edge.",
    ],
  },
  {
    version: "0.1.31",
    date: "2026-11-21",
    changes: [
      "Reorder cards on the course map: drag a card along its lesson's row and the others slide aside to show where it will land. Drag it into another lesson to move it there, in the spot you drop it.",
      "A trash bin at the end of the map's toolbar: drag a card onto it to delete it (with the cards it deals). Click it to see deleted cards and restore them, back in their places and with the answers that dealt them.",
      "The map opens folded, showing each lesson's main path; unfold a card (or Unfold all) to see its branches. A card you wire or create from an answer stays in view.",
      "An answer's circle on the map fills with its colour when you point at it, instead of growing and shrinking, and is easier to hit.",
      "New card in: other lessons are named with their week, like “Week 2: Comparing and adding”.",
      "The rainbow shine on “For you” cards blends smoothly, without hard edges showing as you move over a card.",
      "Students see each lesson of a week on its own row of cards, instead of the week's lessons side by side.",
    ],
  },
  {
    version: "0.1.30",
    date: "2026-11-21",
    changes: [
      "Fold a card's follow-ups on the course map: the button under a card that deals other cards hides them (it then shows how many), so you see just that card. Fold all shows only the main path; Unfold all brings everything back. Opening a folded-away card unfolds what hides it.",
      "Pinching on a trackpad (or ctrl/⌘ + scroll) over the map zooms the map only, not the whole page.",
      "With a card open in the side panel, the map's right edge moves in to meet the panel instead of hiding under it. Scroll right to see what's beyond.",
    ],
  },
  {
    version: "0.1.29",
    date: "2026-11-21",
    changes: [
      "A student's run of cards in Class activity reads “Worked through 4 cards”, since some may be reading cards rather than answers.",
    ],
  },
  {
    version: "0.1.28",
    date: "2026-11-21",
    changes: [
      "Student View: a button next to the class code. Pick a student (each has their own cards, from their own answers) or a new student with no work, and try the course as them. It’s a test: nothing you do there is saved or graded, and no one is notified. Start over goes back to where the student really is.",
      "In the card panel, the card an answer deals is a link: click it to open that card, and “Back to …” takes you back to the question.",
      "Wiring an answer to a card everyone gets now asks first, since only students who pick that answer will see it. Students who already started the card keep it.",
      "Class activity is quieter: a student’s quick answers close together are one note (“Worked through 4 cards · 1 wrong”, with the misses spelled out) instead of two notes per card.",
      "With Where students are on, how many students took each answer shows in the answer’s row on the map, not in a bubble over the wires.",
      "The map: “Go to a lesson” zooms in when you’re zoomed far out; the zoom button first fits the map’s width, then (pressed again) the whole course; scrolling inside the map no longer scrolls the page.",
    ],
  },
  {
    version: "0.1.27",
    date: "2026-11-21",
    changes: [
      "Score ranges on a quiz or card group stay on one line on the map (“75–100%   3–4 right”) instead of running into each other. Hover the count for the full “3–4 of 4 right”.",
    ],
  },
  {
    version: "0.1.26",
    date: "2026-11-21",
    changes: [
      "Wires on the course map run at right angles through the gaps between cards: out of an answer to the right, down, across, and into the top of the card it deals. A wire never hides behind the card it leaves, and a long wire into a later lesson finds a gap without cards in its way.",
      "Drag a wire (or a card) to the edge of the map and it scrolls, so you can reach a card in a lesson further down.",
      "See the whole course zooms out further, so a long course fits.",
    ],
  },
  {
    version: "0.1.25",
    date: "2026-11-21",
    changes: [
      "The course map reads like shelves: each lesson is a row, its cards side by side in order. What an answer deals hangs below the card that deals it, and the wire comes into the card's top. A card dealt from an earlier lesson gets its wire from the row above.",
    ],
  },
  {
    version: "0.1.24",
    date: "2026-11-21",
    changes: [
      "Each student sees a question’s choices in a different order, so the right answer isn’t always the first one. Polls keep the order you wrote.",
      "Delete a reply on a discussion: students can take back their own replies, and the teacher can remove anyone’s. If a student deletes the reply that finished a peer-review card, the card goes back to in progress.",
      "The Share and discuss card from the Standard weeks template now asks each student to reply to two classmates, as its text says.",
    ],
  },
  {
    version: "0.1.23",
    date: "2026-11-21",
    changes: [
      "Replies on a discussion are small content cards: write a few words, record a video or a voice reply, or add a picture or file. Each reply is labelled Video reply, Voice reply or Text.",
      "Peer review: on a Discussion card, choose how many classmates each student replies to. The card is done once a student has posted and replied to that many, and students see what’s left.",
      "Let all in: when several students are waiting to join, let them all in with one click.",
      "Students waiting to join show at the top of the Map and List, not only on the Students tab, so nobody is left on the waiting page.",
    ],
  },
  {
    version: "0.1.22",
    date: "2026-11-21",
    changes: [
      "Math in cards: write $2^{o(n)}$ in a card’s text, a question, its choices or the explanation, and students see it typeset. $$…$$ puts it on its own line; \\$ is a plain dollar sign. The editor shows how it will look.",
      "A link to a card opens it, and reloading the page keeps the open card open, for students and in the teacher’s editor. Before, the card was dropped.",
      "A teacher who opens a class’s join page is warned that joining as a student signs them out of their teacher account, with a way back.",
      "The right-answer switch on a Question card reads “Has a right answer: Yes / No (a poll)”, which also fits questions with several right answers.",
      "The sign-in screen shows the Questhand mark instead of a plain square.",
    ],
  },
  {
    version: "0.1.21",
    date: "2026-11-21",
    changes: [
      "Click a lesson’s name on the map to rename it. Before, a lesson could only be renamed in the List view.",
      "Add the next question, on a Question card: the next question goes on a new card, and the cards become a card group, answered together.",
      "Put-in-order questions always reach students mixed up. Before, they could arrive already in the right order.",
      "Card labels say what a single question asks for: Put in order or Short answer, not Multiple choice.",
      "Your feedback can carry a recording or a file, such as you playing it the way you mean. Students hear it on the card.",
      "Recording waits for the microphone or camera and says so, with what to do if the browser never asks. Before, Start did nothing until it was ready.",
      "The gradebook’s quiz average counts card groups of questions too.",
      "Phones no longer show the keyboard shortcut for handing in, and old “Class tab” hints now point to the Students tab. The Standard weeks description matches what it makes.",
    ],
  },
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
