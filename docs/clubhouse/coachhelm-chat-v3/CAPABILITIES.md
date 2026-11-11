# CoachHelm chat v3: every capability, as the coach sees it (10 Nov 2026)

`SPEC.md` is the turn and the card's shell (frame, buttons, ring, receipt row, work line). `MOTION.md` is every
movement. This file is what goes **inside**: for each thing the assistant can do in the app, what a coach must be able
to check before saying yes, how it is laid out, every state, the words, and the proof afterwards. It also covers what
an answer can show (evidence, visuals, links, notes, computed answers) and every state of the work line.

Read from the code, not from memory: `registry.ts`, `tasks.ts`, `create-tools.ts`, `action-planners.ts`,
`practice-planner.ts`, `practice-draft.ts`, `tasks/event-tasks.ts`, `context/notes.ts`, `context/find-in-app.ts`,
`readers.ts`, `readers-direct.ts`, `engine/protocol.ts`, `engine/loop.ts`. Where a plan does not carry something a
coach needs, the card does not invent it: it is listed under "Requests to the engine" with the field needed.

Gallery: `/clubhouse-preview/coachhelm-capabilities` (no sign-in, no model call). Deep link per capability and state:
`?task=create_trip&state=held&density=compact`. Code: `src/clubhouse/screens/coachhelm/chat/cards/**`,
`src/clubhouse/styles/coachhelm-ask-cards.css`.

## Count

47 tools are registered across the three surfaces (43 on Ask, 46 with `golf_tournaments_v1`; quick chat swaps
`publish_artifact` for `send_message`; a player has 10). They make **52 designed capabilities**:

| Group | Count | What |
| --- | --- | --- |
| A. Tasks (a card, Confirm, 8 seconds of Undo) | 22 | every `kind: 'task'` tool |
| B. Drafts and hand-offs (a card, nothing written) | 6 | practice brief, practice plan, document, message, poll, board |
| C. Instant, no card | 2 | save a note, remove a note |
| D. Reads and answers | 16 | 12 kinds of evidence, the visual, a link into the app, a computed answer, "that isn't tracked" |
| E. The player's Ask | 1 | the read-only set, as one entry with its differences |
| F. Thinking and working | 5 | waiting, reading, working out, drafting, a task's own states on the work line |

## 0. What is the same for every task card

### 0.1 The seam with the shell

The shell (chat UI lead) draws the frame, the head (what it will become, the badge), the "On confirm" line, the
button row, the ring, the receipt row and the "Told" line, and derives the state. A **body** fills the space between
the head and the "On confirm" line. One body per capability, from `cards/index.tsx`:

```ts
interface CardBodyProps {
  tool: string;                  // TaskProposal.tool
  proposal: ActionProposal;      // the stored plan, untouched
  receipt: ActionReceipt | null; // held, final, or none
  phase: CardPhase;              // below
  density: 'full' | 'compact';   // Ask / quick chat
  roster?: ReadonlyArray<{ id: string; name: string; avatarUrl?: string | null }>;
  team?: string;
  onAsk?: (text: string) => void; // a row tap asks for the change in words; absent: rows are not buttons
}
```

A body reads `facts`, `affects`, `notifications`, `visual`, `publish`, `neighbours` and `missing`. It never reads
`input` (the write's arguments are not a display contract and hold ids). The fact labels each body depends on are
the table in 0.7; a test holds the fixtures to the labels the planners write.

A body may not: draw a button in the button row or any Confirm, Cancel, Undo or Open of its own; fetch, poll or
start a timer; animate its arrival, its height or its layout; draw a ring, a check, a badge or a receipt. It may hold
a disclosure the coach taps ("Show all 40", "Show the whole message"), which changes height in one frame on their
tap (MOTION: "because the coach tapped"). Dimming a cancelled or undone draft is the shell's opacity on the body.

`cards/catalog.ts` holds each capability's words as data (head, primary, busy, badge, hold line, undone line, home),
so the shell's labels and the body cannot drift. `cardCopy(tool, proposal)`.

### 0.2 The order inside a body (and the VoiceOver order)

Head (shell): what will happen. Then the body, always in this order, each part present only when it has something
true to say:

1. **Reach**: who is affected and how far it travels. First, because "does this reach my players" is the check that
   cannot be undone by reading the rest.
2. **Subject**: the thing itself, drawn the way its home screen draws it (an event as a calendar tile, a task as a
   Tasks row, a poll as a Messages poll, a drill as the drill bank's card).
3. **Words**: anything a person will read, word for word, in the frame they will read it in (a notification, a
   message bubble, a note under the round).
4. **Details**: the remaining facts as label and value rows.
5. **Changes**: what this replaces or leaves alone ("Replaces the earlier note", "2 players are left as they are").
6. **Warning**: anything that cannot be taken back, in amber, last before the shell's "On confirm" line.

Read aloud: the head ("Add to calendar. Short-game practice."), the reach ("Sends to 6 players: Eli Brandt, …"),
the subject, the words, then the shell's line and buttons. The body is one `role="group"` labelled by the reach
sentence; avatars are decorative (names are text).

### 0.3 Reach: three levels, one vocabulary

Every card says which of three things is true, in the same place, with the same three marks. A coach learns it once.

| Level | Meaning | Mark | Lead words (proposed) |
| --- | --- | --- | --- |
| **Sends** | Players get a notification, a message or an email | `Badge tone="accent"` with the send glyph: "Sends" | "Sends to 6 players" |
| **Visible** | Nothing is sent, but players can see it in the app | `Badge tone="info"`: "Players can see it" | "On the team's calendar", "In Documents" |
| **Private** | Only the coach, or only coaches | `Badge tone="neutral"` with the lock glyph: "Only you" / "Coaches only" | "Only you see this" |

- The level comes from the plan's `notifications` and the capability's own rule (catalog), never from a guess: a
  line that begins "Nobody is told" or an empty list is not Sends.
- **People**: named players as avatars (at most 5, then "+35") and names as text: one name in full; two or three
  joined ("Eli Brandt, Jonah Reyes and Max Ortiz"); more: the first two "and 4 more" with **Show all 6** (a ghost
  `Button`, small), which opens the full list in roster order, wrapped, each an avatar and a name. The whole roster
  is "All 7 players" plus Show all. Forty names never print by default and are always one tap away.
- Tense follows the state: "Sends to" (proposed, confirming), "Sending to … when the ring closes" is the shell's
  line, "Sent to" (saved), "Not sent" (undone, cancelled, set aside, failed, no longer available). For Visible and
  Private the words do not change with state; only the shell's line does.
- A card that Sends always shows the recipients and the words (0.4). If the plan carries no recipients by name or no
  words, the card says exactly that in the place they would be ("The plan does not list who: 6 players") and the gap
  is an engine request. It never draws a made-up preview.

### 0.4 Words: verbatim, in the reader's frame

- Text another person will read is drawn in the frame they will read it in: a **notice** (app glyph, bold title,
  body: the notification as a phone shows it), a **bubble** (the coach's own sent bubble from Messages), a **note**
  (quoted, with its author line).
- It is the plan's text, never a summary. The whole text is in the DOM. Past 6 lines (4 in compact) it is clamped
  with **Show the whole message · 1,240 characters**; the count is always shown when clamped so a coach knows how
  much is under the fold before they confirm.
- When the plan has the channel but not the words ("6 players get a push and an email"), the card shows the channel
  line and, under it, "The exact wording is not shown here." in secondary ink. No fake notification.

### 0.5 Long values

| Value | Limit in the plan | Full | Compact |
| --- | --- | --- | --- |
| A title or name | 80 to 200 | wraps to two lines, then ellipsis; full text in `title` and to VoiceOver | one line |
| Words that are sent | 2,000 (message, announcement), 8,000 (document) | 6 lines, then Show the whole message | 4 lines, then the same (two lines of a message is not enough to approve it) |
| A note | 280 to 2,000 | 6 lines, then Show all | 2 lines |
| A list of dates | 26 | every date as a day tile, wrapping (a date is the thing being approved; none is hidden) | first 4 tiles and "+22", Show all |
| A list of people | 80 | 0.3 | 0.3 with 3 avatars |
| Rules, rooms, gear | 1,000 to 5,000 | 3 lines, then Show all | one line, then Show all |
| A value marked `missing` | n/a | "Not set" in amber; the row is a button that asks for it (`onAsk`) | same |

### 0.6 States every task card has

`CardPhase`, with what the body does; the shell's part is in SPEC Moment 7.

| State | SPEC id | Body |
| --- | --- | --- |
| proposed | ST-7.draft | whole, rows that can be changed are buttons (`onAsk`) |
| proposed, something missing | ST-7.draft.missing | the missing row reads "Not set", amber, first among details |
| confirming | ST-7.confirming | unchanged; rows are no longer buttons |
| held (the ring) | ST-7.hold | unchanged; a place-in-the-app drawing shows the new thing as pending (dashed) |
| undoing | ST-7.hold.undoing | unchanged |
| committing | ST-7.committing | unchanged |
| saved | ST-7.done | reach turns to past tense ("Sent to"); the pending place becomes solid; disclosures stay |
| partly saved | ST-7.done.partial | the people who were missed are named when the receipt names them, else the count |
| undone | ST-7.undone | reach reads "Not sent" / "Not saved"; the shell dims the body |
| cancelled | ST-7.cancelled | as undone |
| set aside by a new question | ST-7.superseded | as undone |
| failed | ST-7.failed | reach reads "Not sent" / "Not saved"; everything else stays readable |
| waiting when the coach came back | ST-7.returned | as proposed (no arrival; the shell's concern) |
| held when the coach came back | ST-7.returned.hold | as held |
| no longer available | ST-7.expired | as undone |
| too late to undo | ST-7.late-undo | as saved |
| immediate (lock a lineup only) | n/a | no held, no undo: proposed, confirming, saved or failed |

The gallery's switcher offers these by name; "Play" runs proposed, Confirm, the 8 seconds and saved at real timing,
and "Play with Undo" presses Undo at 3 seconds.

### 0.7 The fact labels each body reads (the contract with the planners)

`create_event`: When, Length, Type, Where, Invited, Replies; visual `cal`. `create_recurring_practice`: Repeats,
Dates, Occurrences, Timezone, Location, Invites, RSVP. `add_blocked_time`: When. `add_team_break`: Dates.
`save_team_term`: Classes, Exams end. `create_trip`: Leaves, How, From, Back, Hotel, Rooms, Uniform, Gear; visual
`trip`. `create_qualifier`: Starts, Rounds, Squad, Players, Rules; visual `qual`. `create_goal`: Player, Target, By,
How; visual `goal`. `create_focus_area`: Player, Focus, Area, Target, By, Over, Status. `create_task`: Task, Assigned
to, Due, Priority; visual `task`. `create_team_announcement`: Title, Message, To, Urgency, Acknowledgement.
`add_round_note`: Earlier note, Adding; visual `note`. `set_availability_note`: Replaces, Note. `create_recruit`:
Grad year, Status, Hometown. `create_drill`: Area, Length, Setup, Goal. `publish_practice_plan`: When, Where, Tells,
What they get; `publish`. `publish_artifact`: Who can see it, Goes to, Words. `send_message`: Thread, Message; visual
`msg`. `set_lineup`: Lineup; visual `lineup`. `lock_lineup`: Tournament. `send_event_reminder`: Event, To (n), Will
not get it, They see, How, When. `record_attendance`: Event, Present (n), Late (n), No-show (n), Changes a mark
already recorded, Not marked, Players are told. An unknown label is drawn as a plain row, so a new fact is never lost.

---

## A. Tasks

Each entry: the idea; what the coach checks, in order; layout; long values; reach; receipt and Open; Undo; failure;
compact; what is not shown; requests. "Hold line" is the shell's sentence during the 8 seconds. Motion: none of a
body's own in any entry (MOTION Moment 7 moves the card; bodies are still). Primary, busy and badge words are the
catalog's.

### A1. Add one event to the calendar (`create_event`)

- **Idea.** The event as the calendar will show it: a date tile and the block of time, so a wrong day or a wrong
  hour is seen before a word is read.
- **Checks.** Who is invited and whether they are asked to reply; the day, start and end; where; the type.
- **Layout.** Reach: Sends ("Sends to 6 players, asks for a reply") when replies are asked for and someone is
  invited; Visible ("On the team's calendar. Nobody is told.") otherwise, with the invited players still shown as
  people. Subject: date tile (weekday, day, month), title, "3:00 to 5:30 PM", place, type chip. A length the engine
  assumed ("2.5 hours, the usual practice") carries the "Assumed" chip and its source line, and is the first row a
  tap can change. Details: Replies.
- **Long.** Title two lines. Invited: people rule.
- **Words.** Primary "Add to calendar", busy "Adding…", badge "Added". Hold: "Not saved yet. Saves in 8 seconds,
  then 6 players are told." / without people "Saves in 8 seconds."
- **Receipt.** "{title} is on the calendar." Open: Calendar, on the event's day, with the event marked.
- **Undo.** Within 8 seconds: nothing was saved, nobody was told. After: the event is edited or deleted in Calendar.
- **Failure.** "A timed event needs a start and an end" is asked before a card exists. A failed write: the reason,
  "Nothing was saved." and Try again; when the server could not check: "Look in the Calendar before trying again."
- **Compact.** Reach line, then one row: tile, title, time. Place and type fold into a meta line.
- **Not shown.** The week grid around the day in compact (the page behind is the calendar). The time zone when it is
  the team's own.
- **Requests.** E-1 (affects by id), E-2 (the invitation's words), E-3 (Notes is written but not on the card),
  E-13 (told-count on the receipt).

### A2. A repeating practice (`create_recurring_practice`)

- **Idea.** Every date that will be created, as a run of day tiles grouped by month. The coach counts tiles, not a
  number in a sentence.
- **Checks.** How many, which days, the first and last date, the time, the place, who is invited, replies.
- **Layout.** Reach: Sends ("Sends to 7 players: an invitation, an email and a push. Each is asked to reply") when
  RSVP is required; Visible ("On 7 players' calendars. Nobody is told.") when not. Subject: "Every Tuesday and
  Thursday at 3:00 PM", then the tiles under month labels, the first and last tinted. Details: Location (Not set is
  amber and blocks Confirm), Replies and its deadline, Time zone only when it differs from the viewer's.
- **Long.** 26 tiles wrap; none hidden in full.
- **Words.** Primary "Add 8 practices", busy "Adding…", badge "Added". Hold: "Not saved yet. Saves in 8 seconds,
  then 7 players are invited."
- **Receipt.** "8 practices created, every Tuesday and Thursday at 3:00 PM." Open: Calendar at the first date.
  Partial: "6 of 8 created" with the two missing dates named when the receipt names them.
- **Undo.** Nothing was saved. After: each practice is its own event in Calendar.
- **Failure.** Reason and "Nothing was saved."; a retry that finds the first attempt's rows says so ("an earlier
  attempt created them and I did not create them again").
- **Compact.** Sentence, first 4 tiles and "+4", Show all.
- **Not shown.** The description.
- **Requests.** E-4 (end time and a `series` visual), E-2, E-13.

### A3. Block the coach's own time (`add_blocked_time`)

- **Idea.** A private mark on the coach's own calendar. The card's job is to say plainly that no player sees it.
- **Checks.** The day or days, the hours, the title.
- **Layout.** Reach: Private ("Only you see this"). Subject: date tile, title, "3:00 to 4:00 PM" or "All day".
- **Words.** Primary "Block time", busy "Blocking…", badge "Blocked". Hold: "Not saved yet. Saves in 8 seconds."
- **Receipt.** "That time is blocked." Open: Calendar.
- **Undo / Failure.** As A1, with no people.
- **Compact.** One row.
- **Requests.** E-5 (the end date of a block that spans days is written but not on the card).

### A4. A team break from class (`add_team_break`)

- **Idea.** A span of days on one line: first day, last day, and how many days between.
- **Checks.** The first and last day, the count, the label.
- **Layout.** Reach: the plan's own line ("Nobody is told."); the level is Visible only once the engine says who
  sees a break (E-6); until then the neutral mark and the plan's words. Subject: two date tiles joined by a rule
  with "5 days" on it.
- **Words.** Primary "Add break", badge "Added". Receipt: "{label} is on the calendar." No Open (E-12).
- **Undo.** Nothing was saved. **Failure.** "A break is one to 21 days" is asked before a card.
- **Requests.** E-6, E-12.

### A5. A school term (`save_team_term`)

- **Idea.** The term as a bar: classes from A to B, then exams to C. Three dates a coach knows by heart, checked at
  a glance.
- **Checks.** Name, classes start and end, exams end.
- **Layout.** Reach: the plan's line ("Nobody is told."). Subject: the name, then a two-part bar with the three
  dates under its joints (drawn in place, not to scale beyond the two segments' real lengths).
- **Words.** Primary "Save term", badge "Saved". Receipt "{name} is saved." No Open (E-12).
- **Not shown.** Whether a term of the same name is replaced (E-7).
- **Requests.** E-7, E-12.

### A6. A trip (`create_trip`)

- **Idea.** The itinerary line: where from, how, where to, out and back, as one drawn route, then what a player
  needs for it (hotel, rooms, uniform, gear).
- **Checks.** Leave date and time, transport, from and to, return, hotel, rooms, uniform, gear.
- **Layout.** Reach: Visible ("Players see it as new travel. Nobody is told."). When there is a hotel confirmation
  number the plan's own sentence is the warning row: "Every team member can read the hotel confirmation number."
  Subject: from, a rule with the transport word and glyph, to; under it "Leaves Fri 14 Nov, 6:30 AM" and "Back Sun
  16 Nov". Details: Hotel, Rooms, Uniform, Gear (as chips).
- **Long.** Rooms and gear: 3 lines, Show all.
- **Words.** Primary "Add the trip", badge "Added". Receipt "The trip to {destination} is added." Open: Travel.
- **Undo / Failure.** As A1. "The return is before the leave date" is asked first.
- **Compact.** Route line and dates; the rest under Show details.
- **Requests.** E-8 (flight info, hotel address, phone, the confirmation number and notes are written but not on the
  card).

### A7. A qualifier (`create_qualifier`)

- **Idea.** The format as a board head: rounds, who plays, how many make the squad and how many are the coach's
  picks, drawn as seats (filled for qualifying spots, outlined for picks).
- **Checks.** Start, rounds, squad size and picks, the field by name, the rules, the entry deadline.
- **Layout.** Reach: Sends ("Sends to 9 players: a push and an email"). Subject: name, "3 rounds from Mon 17 Nov",
  the seat row ("4 qualify, 1 coach pick"), "9 in the field". Details: Rules, Entry deadline.
- **Long.** Rules 3 lines. Field: people rule.
- **Words.** Primary "Set qualifier", busy "Setting…", badge "Set". Hold: "Not saved yet. Saves in 8 seconds, then
  9 players are told."
- **Receipt.** "{name} is set." Open: Qualifiers.
- **Compact.** Name, the format sentence, people.
- **Requests.** E-1, E-2, E-9 (description and end date written, not shown), E-13.

### A8. A goal for a player (`create_goal`)

- **Idea.** One player, one stat, one number, one date. The number is the hero.
- **Checks.** The player, the stat, the target, by when, assigned or suggested.
- **Layout.** Reach: Sends ("Sends to Eli Brandt: a push"). Subject: avatar and name; the stat label; the target in
  the large numeral; "in 30 days"; chip "Assigned" or "Suggested".
- **Words.** Primary "Set goal", badge "Set". Receipt "The goal is set for {name}." No Open (E-12).
- **Not shown.** Where the player stands now and which way is better: the plan has no baseline, so the card does
  not draw a from-to (E-10). The target prints as the plan gives it.
- **Requests.** E-10, E-2, E-12, E-13.

### A9. A focus area for a player (`create_focus_area`)

- **Idea.** The focus as the player's own list will show it, with the one fact coaches get wrong: it is a proposal
  until the player accepts.
- **Checks.** The player, the title, the area, the measurable target (current to target), by a date or over rounds,
  that the player must accept.
- **Layout.** Reach: Sends ("Sends to Eli Brandt, who is asked to accept it"). Subject: area chip, title, target
  line ("Putts per round 31.2 to 29.5"). Details: By or Over. Changes: "Starts when Eli accepts. Until then it is
  proposed." A missing measurable target is the amber row.
- **Words.** Primary "Assign focus", busy "Assigning…", badge "Proposed" (not "Assigned": the receipt says
  "{title} is proposed to {name}."). Open: the player's focus areas. Told: "Told 1 in the app".
- **Failure.** A duplicate active focus is not retryable: the reason, no Try again.
- **Requests.** E-11 (description is written, not shown), E-2.

### A10. A task for players (`create_task`)

- **Idea.** The task as the Tasks list shows it: an open check circle, the title, the due date, the assignees.
- **Checks.** The words of the task, who gets it, the due date, the priority.
- **Layout.** Reach: Sends ("Sends to 4 players, in the app"). Subject: the Tasks row. Details: Priority. "No due
  date" is amber (the plan marks it missing; Confirm waits for it, by the engine's rule).
- **Words.** Primary "Assign task", badge "Assigned". Receipt "{title} assigned to 4 players." Open: Tasks, the row
  marked. Told: "Told 4 in the app".
- **Compact.** The row and the reach line.
- **Requests.** E-11 (description), E-2.

### A11. A team announcement (`create_team_announcement`)

- **Idea.** The words, exactly, in the frame a player's phone shows them, and every recipient one tap away. This is
  the card where a coach approves text written by the assistant for their whole team.
- **Checks.** The title and the whole message; who gets it; urgency; whether each player must acknowledge.
- **Layout.** Reach: Sends ("Sends to all 7 players"). Words: the notice (title bold, body under it, verbatim).
  Details: Urgency when it is not normal, Acknowledgement when it is required.
- **Long.** 0.4: six lines, Show the whole message with the character count.
- **Words.** Primary "Post to 7 players", busy "Posting…", badge "Posted". Hold: "Not sent yet. Sends in 8 seconds
  to 7 players." Receipt "{title} sent to 7 players." Open: Announcements. Told: "Told 7 in the app".
- **Undo.** "Undone. Nothing was posted." After the window it is in every player's Announcements; whether it can be
  taken down from there is the app's, and the card does not claim either way.
- **Compact.** Reach, the notice at two lines.
- **Requests.** none of substance (the plan carries names and words).

### A12. A coach note on a round (`add_round_note`)

- **Idea.** The round's note as the player will read it: what is already there, then the new words under it.
- **Checks.** Whose round; the earlier note stays; the new words; the player will see it.
- **Layout.** Reach: Visible ("Eli Brandt will see this note on the round"). Words: the earlier note, quoted and
  quiet, then the new note. Changes: "The earlier note stays. This goes under it."
- **Words.** Primary "Add note", badge "Added". Receipt "The note is on the round." Undo: "Undone. Your earlier
  notes are as they were."
- **Failure.** "With the earlier note this passes 2,000 characters. Nothing was changed; shorten the new note."
- **Requests.** E-14 (which round: course, date and score are not on the card), E-12.

### A13. A coach-only availability note (`set_availability_note`)

- **Checks.** The player, the words, that it replaces the earlier note, that players never see it.
- **Layout.** Reach: Private ("Coaches only. Eli never sees this."). Words: the note. Changes: "Replaces: {earlier}"
  struck through in secondary ink when the plan gives it.
- **Words.** Primary "Save note", badge "Saved". Receipt "The note is saved." No Open (E-12).
- **Requests.** E-15 (the earlier note is the model's claim, not read by the server), E-12.

### A14. A recruit (`create_recruit`)

- **Layout.** Reach: Private ("Coaches only"). Subject: avatar from the name, name, "Class of 2028 · Austin, TX",
  status chip.
- **Words.** Primary "Add recruit", badge "Added". Receipt "The recruit is added." Open: Recruiting.
- **Requests.** E-16 (email, phone and notes are written but not on the card).

### A15. A drill for the drill bank (`create_drill`)

- **Idea.** The drill bank's own card: area, name, minutes, setup, goal.
- **Layout.** Reach: Visible, later ("Players see it only when a published plan uses it. Nobody is told.").
  Subject: the drill card.
- **Words.** Primary "Add to drill bank", badge "Added". Receipt "{name} is in the drill bank." No Open (E-12).
- **Requests.** E-17 (the kind, skill, random or pressure, is written, not shown), E-12.

### A16. Publish a practice plan (`publish_practice_plan`)

- **Idea.** Who hears, what one of them gets, where it is filed, and whether it also posts in Team chat.
- **Checks.** The plan's title, when and where; who is told (players and coaches); the notification one player
  gets, with the note that each player's is their own; the Team chat post.
- **Layout.** Reach: Sends ("Sends to 6 players and 2 coaches: push and bell"). The plan lists six names and a
  count beyond them, so Show all is offered only when the list is complete; otherwise "and 4 more". Words: the
  notice labelled "What Eli gets. Each player sees their own start." Details: When, Where, Filed in Practice
  plans, Team chat ("Also posts in Team chat, with no second push" / "Not posted in Team chat").
- **Words.** Primary "Publish to 8 people", busy "Publishing…", badge "Published". Receipt "Published. 8 people
  told." (and "The Team chat post didn't send." when it did not). Open: the plan. Failure line: "Nothing was sent."
- **Requests.** E-18 (the count, the time and the notification line are the model's inputs, not built by the server
  from the plan), E-19 (every name; the Team chat post's words).

### A17. Publish a document (`publish_artifact`, Ask)

- **Layout.** Reach: Visible ("All 7 active players can open it in Documents. Nobody gets a notification.").
  Subject: the document as a page: title, then its words (0.4, six lines, "Show the whole document · 3,180
  characters").
- **Words.** Primary "Publish to 7 players", badge "Published". Receipt "{title} is in Documents." No Open (E-12).

### A18. Send a message (`send_message`, quick chat)

- **Idea.** The thread it goes into and the bubble it will be, as Messages draws the coach's own bubble.
- **Layout.** Reach: Sends ("Sends as you to 6 players in Travel squad"). Words: the last message in the thread,
  quiet, when the plan has it, then the draft as a sent bubble. Nothing else.
- **Words.** Primary "Send", busy "Sending…", badge "Sent". Hold: "Not sent yet. Sends in 8 seconds." Receipt
  "Sent to {thread}." Open: the thread.
- **Undo.** "Undone. Nothing was sent." After: a sent message is deleted in Messages.
- **Requests.** E-20 (the member count is the model's number and the members are not named).

### A19. Set a tournament lineup (`set_lineup`, flag)

- **Layout.** Reach: the plan's line ("Nobody is told."). Subject: seats 1 to 5 as numbered rows with avatar and
  name, alternates under a rule, individuals last.
- **Words.** Primary "Set lineup", badge "Set". Receipt "Lineup set." Open: the tournament. Undo: "Undone. The
  earlier lineup is as it was."
- **Requests.** E-21 (which tournament; the lineup it replaces; the reasoning per seat is written, not shown).

### A20. Lock a tournament lineup (`lock_lineup`, flag): the one with no Undo

- **Idea.** The only card that writes on the press. It must not look like the others.
- **Layout.** Warning first, as the body's first row, in amber: "This locks the moment you press. There is no
  Undo." Then the plan's own line: "Substitutions only work if the event allows them."
- **States.** proposed, confirming, saved, failed. No held, no ring.
- **Words.** Primary "Lock the lineup", busy "Locking…", badge "Locked". Failure: "The lineup is still going
  through. It isn't locked; lock it once it lands."
- **Requests.** E-22 (the plan says only "Tournament: As set": no name, no seats. The coach locks without seeing
  what is locked. The card says so: "The plan does not show the lineup. Open the tournament to check it first.").

### A21. Remind players about an event (`send_event_reminder`)

- **Idea.** The model card for anything sent: every recipient by name, anyone who will not get it and why, and the
  reminder exactly as it arrives. The engine carries all of it.
- **Checks.** The event; who gets it; who will not ("no account yet"); the words; how and when it arrives.
- **Layout.** Reach: Sends ("Sends to 5 players"). Under the people, when present: "Will not get it: Max Ortiz (no
  account yet)" in amber. Words: the notice ("Reminder: Short-game practice" / "Thu 12 Nov, 3:00 PM at the short-
  game area"). Details: How ("A notification in the app that opens the event").
- **Words.** Primary "Send reminder", busy "Sending…", badge "Sent". Hold: "Not sent yet. Sends in 8 seconds to 5
  players." Receipt "The reminder about {event} went to 5 players." Open: the event.
- **Partial.** "4 of 5 got it." with the receipt's sentence. **Failure.** "The event changed after this card was
  made, so the reminder would no longer say what you approved. Nothing was sent. Ask for the reminder again." (no
  Try again); "The reminder may or may not have gone out … Sending it again is safe, nobody gets it twice." (Try
  again).
- **Requests.** E-23 (the names of who was missed, on a partial receipt).

### A22. Record attendance (`record_attendance`)

- **Idea.** A roll, in roster order, each player with the mark they will get, grouped Present, Late, No-show, and
  the two things a coach worries about: marks that change, and players left alone.
- **Layout.** Reach: Private in effect ("Nothing is sent to players."), with the event's name and time as the
  subject line. The roll: three groups with counts, people rule inside each. Changes: "Changes a mark already
  recorded: Jonah Reyes: Present now, Late after." and "2 players on the roster are left as they are."
- **Words.** Primary "Save attendance", busy "Saving…", badge "Saved". Receipt "Attendance is saved for 7 players
  at {event}. Nothing was sent to players." Open: the event.
- **Partial.** "Saved for 5, and not for Max Ortiz and Sam Lee." with each reason. **Failure.** "I could not check
  which marks were saved: look at the event in the Calendar. Saving again is safe, it writes the same marks."
- **Requests.** E-24 (whether a player can see their own mark).

---

## B. Drafts and hand-offs (a card that writes nothing)

These are reads on the contract: no Confirm, no ring. Each card says, in the reach position, the one true thing:
**"Nothing is sent until you press Send in Messages."**

| # | Capability | Idea and layout | States | Words |
| --- | --- | --- | --- | --- |
| B1 | Practice brief (`ask_practice_brief`) | Up to four questions as choice rows (the read's default already picked, its source as the hint). The turn stops and waits. | asking, answered (the answers become the coach's next message and the card reads as a summary of them), set aside | "Build the plan" primary; work line "Waiting for you" |
| B2 | Practice plan draft (`draft_practice_plan`) | The plan as a run sheet: blocks down a time rail from the start time, each with its length, place, drill and Aim; a Because with its source chip, or "Lean read" when no read backs the number; stations as a grid; what to bring. Version badge "Draft 2". | drafting (a read row), drafted, revised (the newest replaces the older in place), refused ("The blocks add up to 170 minutes; you asked for 180": said in prose, no card) | "Open in the builder", "Save"; "Nothing is saved yet." |
| B3 | A long document (`write_artifact`) | A page card: kind ("Player report"), title, first lines, version time. Opens beside the chat. | writing, written, revised, published (through A17) | "Open"; "It stays in this chat until you publish it." |
| B4 | A message draft (`draft_message`) | The recipients (people rule) or the thread, then the words as a bubble. | drafted, opened | "Open in Messages"; "Nothing is sent until you press Send." |
| B5 | A poll draft (`draft_poll`) | Messages' own poll: question, options as the poll's rows at zero votes, "Choose one" or "Choose any", when it closes, "Names show on votes". | drafted, opened | "Open in Messages"; "Nothing is posted until you press Send." |
| B6 | A board for a player (`draft_board`) | The visuals already drawn in this answer, tiled under the coach's note, as the image the player will get. | drafted, drawing (the image is being made on tap), failed to draw ("Couldn't draw the board. Your note is in the message. Nothing was sent.") | "Open in Messages" |

Compact (quick chat has B1, B2, B6 only): the head and the reach line, then the first two rows and Show all.

## C. Instant, no card: standing notes (`save_note`, `remove_note`)

A note saves at once, with no confirmation, because it is the coach's own sentence about how they want answers. So
the proof and the undo are the same small thing, in the thread, where it happened.

- **Saved** (`data-coach-note`, op `saved`): a chip under the paragraph: the note glyph, "Noted" and the sentence in
  the coach's words, with a remove key (44px reach). Long notes (280 at most) wrap to three lines.
- **Removed** (op `removed`): the same chip, the sentence struck through, "Removed". No key.
- **Refused**: no chip. The answer says why in prose ("That is about a named player's health… The coach-only
  availability note is the place for it.").
- **Undo**: the remove key on a saved chip. It is the only write in the chat without Confirm, so the chip always
  says who can see it: "Only you. Players never see notes."
- Motion: arrives as a link row does (MO-5-9). A request to the lead: the chip's remove is `MO-1-7`'s fade.

## D. Reads and answers

A figure in an answer carries a marker (` [e3]`, drawn as a chip, SPEC ST-5.chip). Tapping it opens the read it came
from (sheet on the phone, panel on desktop, SPEC Moment 6). Every read opens with the same head, so a coach always
knows what they are looking at before the numbers: **what was read** ("Putting by distance"), **whose** (a player,
the team), **the window and the sample** ("Last 8 rounds · Sep 1 to Sep 29 · 212 putts"), and **as of**. A sample
of 12 or fewer says "Small sample" beside it. Then one of these forms:

| # | Kind of evidence | From | Form |
| --- | --- | --- | --- |
| D1 | A single figure | `get_player_stats`, `get_team_stats`, `get_season` | Tiles: the figure cited is first and largest; team and Tour beside it as its comparison; the others quiet. A loss is amber, a strokes-gained gain green, never red. |
| D2 | A comparison across players | `get_player_stats` with 2 to 6 players | A table: players as columns when there are more metrics than players, else as rows; the best in each row marked; strokes gained by sign. Scrolls sideways inside itself on the phone, first column fixed. |
| D3 | A ranking | `get_team_stats` with `rank_by` | Rank, avatar, name, sample ("6 rounds"), value, a bar on a fitted axis (either side of zero for strokes gained). The player the answer names is highlighted. |
| D4 | A trend, round by round | `get_player_stats` section rounds | A line with a point per round and the reference line (team or goal); fewer than 3 points is a table ("a change, not a trend"). |
| D5 | A round, hole by hole | `get_round` | The card as the Round page draws it: two nines, score marks, par, the tallies (per par, putts, penalties). |
| D6 | A putting or proximity profile | `get_player_stats` sections putting, approach; `get_shots` | Bands as bars: make rate by distance, or feet left by approach band, each with its attempts ("14 of 22"). A band under 5 attempts is drawn hollow and says so. |
| D7 | Strokes gained by area | `get_team_stats`, `get_player_stats` | Four legs from zero, gain right, loss left, with the one-line takeaway the read returned. |
| D8 | Rounds list and counts | `get_rounds` | Per player: rounds that count, average; then the newest rounds as rows. "Counts" marks say which rounds are in an average. |
| D9 | A schedule | `get_schedule` | Days with their events as agenda rows: time, title, replies in ("5 of 7"), class conflicts in amber; trips as a route line; attendance totals as tiles. |
| D10 | A qualifier board | `get_qualifiers` | The Qualifiers board: place, player, rounds, total, to the cut; the cut drawn as a rule between rows; a nine-hole round shown as nine holes, never as missed. |
| D11 | What CoachHelm has on record | `get_coachhelm` | Open reads as rows (area, title, value) that open the Deep dive; focus areas, goals and tasks as their own rows. |
| D12 | Practice, reference, the long tail | `get_practice`, `get_reference`, `get_tournaments`, `query_team_data`, `summarise_data`, `find_thread` | A table with a caption that names the source in the coach's words ("Team records: 38 rows"), capped rows said ("Showing 200 of 412"). A definition is prose with its source. |

- **Empty** ("No putts recorded in this window." with the window) and **failed** ("This read didn't come back.") are
  SPEC ST-6.empty-read and ST-6.failed-read.
- **D13. A visual** (`show_visual`). In the thread, under the paragraph that cites it, complete at first paint
  (Q-153), in the visual frame: title, who and window, the marks, a foot ("From 3 reads"), a Table toggle. Blocks a
  composition can hold: headline, KPIs, trend, ranking, bands, split, compare, note, miss pattern, putt profile,
  season compare, hole strip; and the strokes-gained anatomy figure. Phone: full column width, blocks stacked.
  Desktop: 720 column, KPIs in a row, split and compare two-up. The frame never grows after paint.
- **D14. A link into the app** (`find_in_app`, `data-app-link`). A quiet row under the paragraph: arrow, "Open
  Roster requests", and the place's one line. At most two (a near tie). Never an address in prose. For one player's
  page: "Open Stats for Eli Brandt".
- **D15. An answer computed across the whole team.** The model reads many players and calculates in code. The
  coach never sees code or a tool name. The work line says "Working it out across the team" while it runs; the
  folded line reads "14 reads · 1 calculation · 4s"; and under the answer the foot row carries a **Worked out**
  chip. Tapping it opens the evidence panel on a "How this was worked out" page: one sentence of method in plain
  words ("Averaged each player's putts per round over their last 8 rounds, then ranked them"), what was read (14
  players, 212 rounds, the window), and the result table. Figures in such an answer have no markers (reads called
  from code cannot be cited), so the chip and this page are how it shows its work. Built against a typed stub
  (E-25).
- **D16. "That isn't tracked."** When the coach asks for something the app does not collect, the answer says so in
  its first sentence, and a quiet row under it shows the nearest thing that is: "Not tracked: club used off the tee.
  Closest: fairways hit, driving distance." Never an empty chart and never a zero. Built against a typed stub
  (E-26); today it is prose only.

## E. The player's Ask (read-only)

Ten tools, all reads of the player's own game. Everything in D applies with these differences, enforced where the
data is built and tested in the DOM:

- No task card, no draft card, no note chip, no "Worked out" chip (code is off for players), no D3 ranking, no D2
  across teammates, no D10 beyond the player's own line, no D8 for anyone else.
- Evidence heads say "your": "Your last 8 rounds". Comparisons are to the team average and Tour as the player's own
  Stats page shows them, never to a named teammate.
- D14 links open only the player's places. D11 shows their own focus areas, goals and reads.
- A drill their coach set is a quiet card they can open (SPEC ST-11.drill).

## F. Thinking and working: the work line and the mark

The mark turns while anything is live and rests when nothing is. The work line is the only place status is said
(SPEC Moment 4). A tool name is never shown; every label below is the server's own `progress` string or the shell's
sentence.

| Kind of work | Mark | Work line (and read row label) | After |
| --- | --- | --- | --- |
| Nothing from the server yet | turning | nothing; at 1.2 s "Sending"; at 6 s "Still sending. Check your connection."; at 20 s "No answer yet. You can stop and ask again." | |
| The server has the turn | turning | at 1.2 s "Thinking"; at 6 s "Still thinking. Long questions take a little longer." | |
| Reading | turning | "Reading the statistics", "Reading the rounds and statistics", "Reading Team Stats", "Reading the rounds", "Reading the round hole by hole", "Reading the logged shots", "Reading the season", "Reading the qualifiers", "Reading the qualifier board", "Reading tournament results", "Checking the schedule", "Checking the schedule and travel", "Checking outstanding tasks", "Reading what CoachHelm has on record", "Reading practice", "Reading the standards", "Looking it up in the golf reference", "Looking that up", "Reading the team's records", "Finding the thread", "Finding that in the app" | check, and the detail when sent ("38 rounds") |
| Comparing and ranking | turning | "Ranking the team", "Comparing the seasons" | check |
| Calculating | turning | "Working out the figures" (arithmetic over rows already read); across the team in code: "Working it out across the team" (E-25) | "14 reads · 1 calculation · 4s" |
| Drawing | turning | "Building the visual", "Putting the board together" | the visual arrives whole |
| Drafting | turning | "Drafting a task", "Drafting a focus area", "Drafting a team update", "Drafting the goal", "Drafting the note", "Drafting the drill", "Drafting the message", "Drafting the poll", "Drafting the practice plan", "Writing it up", "Putting the questions together" | the card arrives whole |
| Preparing a task | turning | "Preparing the event", "Preparing the practice dates", "Preparing the trip", "Preparing the qualifier", "Preparing the blocked time", "Preparing the break", "Preparing the term", "Preparing the recruit", "Preparing the lineup", "Preparing to lock the lineup", "Preparing to publish", "Preparing to publish the plan", "Preparing the reminder", "Preparing attendance", "Reading the note on that round" | the card arrives whole |
| Saving a note | turning | "Saving that note", "Removing that note" | the chip |
| Waiting for the coach | at rest | "Waiting for you" | |
| Confirm pressed | turning | the capability's busy word on the button ("Adding…"); the work line keeps "Waiting for you" until the hold answers | |
| Holding | at rest | "Not saved yet" (the ring and its sentence are on the card) | |
| Saving | turning | "Saving…" only if the result takes over 300 ms | |
| Saved | at rest | the capability's badge word ("Added", "Sent", "Published") | |
| Undone | at rest | "Undone" | |
| Cancelled, set aside | at rest | "Cancelled" / "Set aside" | |
| Failed | at rest | "Not saved" / "Not sent" | |
| A read failed | turning on | row: "Couldn't read practice reviews" | the answer says what it lacks |
| Done | at rest | "3 reads · 2s" (a restored turn: "3 reads") | |

For a player the labels are the server's player forms: "Reading your statistics", "Reading your season", "Reading
your CoachHelm", "Working out your figures".

---

## Requests to the engine (not built here; nothing is faked in the UI)

A coach cannot check these today because the plan does not carry them. Each names the field wanted.

| # | Tool | What is missing | Field wanted |
| --- | --- | --- | --- |
| E-1 | `create_event`, `create_qualifier` (every flow in `create-tools.ts`) | The invited players only as one comma-joined string; `affects` is empty | `affects: [{ kind: 'player', id, label }]` from every flow that names players |
| E-2 | `create_event`, `create_recurring_practice`, `create_qualifier`, `create_goal`, `create_focus_area`, `create_task` | The channel is named ("a push and an email") but not the words a player receives | `delivery: { channels: string[]; title: string; body: string }` built by the same code that sends, as `send_event_reminder` does |
| E-3 | `create_event` | `notes` is written as the event's description and is not on the card | a `Notes` fact |
| E-4 | `create_recurring_practice` | The end time is written and not shown; no `visual`, so quick chat cannot draw the dates | an `Ends` fact; `visual: { kind: 'series', title, dates: string[], start, end, where }` |
| E-5 | `add_blocked_time` | `end_date` is written and not shown | `When` to carry the range |
| E-6 | `add_team_break` | Whether players see a break | `visible_to: 'coaches' | 'team'` on the proposal (wanted on every task) |
| E-7 | `save_team_term` | Whether it replaces a term of the same name | a `Replaces` fact when it does |
| E-8 | `create_trip` | Flight info, hotel address, hotel phone, the confirmation number itself and notes are written and not shown | one fact each |
| E-9 | `create_qualifier` | Description and end date are written and not shown; the entry deadline is only in `visual` | facts |
| E-10 | `create_goal` | No baseline, no unit, no direction: a target of 1.2 cannot be judged | `visual.goal` to gain `current: number | null`, `unit`, `better: 'up' | 'down'` |
| E-11 | `create_focus_area`, `create_task` | `description` is written and not shown | a `Details` fact |
| E-12 | `add_team_break`, `save_team_term`, `create_goal`, `add_round_note`, `set_availability_note`, `create_drill`, `publish_artifact`, `lock_lineup` | The receipt has no `href`, so there is no Open | `created[0].href` to the thing's home |
| E-13 | `create_event`, `create_qualifier`, `create_goal`, `create_recurring_practice` (without RSVP it is right to be empty) | The receipt's `notifications` is empty although players are told, so "Told 6 by push" cannot be shown | `notifications: [{ channel, recipients, status }]` from the action's own result |
| E-14 | `add_round_note` | Which round: only an id | `visual.note` to gain `round: { course, date, score }` |
| E-15 | `set_availability_note` | "Replaces" is supplied by the model, not read | a `prepare` that reads the current note, as the round note does |
| E-16 | `create_recruit` | Email, phone and notes are written and not shown | facts |
| E-17 | `create_drill` | `kind` is written and not shown | a `Kind` fact |
| E-18 | `publish_practice_plan` | `people`, `when` and `first_player_line` are the model's inputs; the card's "What they get" may not be what is sent | built by the server from the plan, with `commit` refusing if it no longer matches (as the reminder does) |
| E-19 | `publish_practice_plan` | Names beyond six; the Team chat post's words | `publish.people: Array<{ name, role }>`; `publish.chatPost: string` |
| E-20 | `send_message` | The member count is the model's number; members are not named | `visual.msg.members: string[]` read by the server |
| E-21 | `set_lineup` | Which tournament; what it replaces; the reasoning per seat | `visual.lineup` to gain `tournament: { name, date }`, `replaces`, `seats[].reasoning` |
| E-22 | `lock_lineup` | Nothing about what is locked ("Tournament: As set") | the tournament's name and the seats, read in `prepare` |
| E-23 | `send_event_reminder` | A partial receipt gives a count of who was missed, not names | `partial_failures` by name |
| E-24 | `record_attendance` | Whether a player can see their own mark | `visible_to` (E-6) |
| E-25 | the loop | Nothing says a calculation ran, what it covered or how | a `read_started` / `read_finished` pair for the code step with label "Working it out across the team" and a detail; a part `data-computed: { id, method: string, players: number, reads: number, window: string | null, table?: { columns, rows } }` |
| E-26 | readers | "Not tracked" is prose only | `coverage: 'not_tracked'` with `coverage_note` and `nearest: string[]` on the envelope |
| E-27 | every task | After Undo the stored receipt is still `held` (CONTRACT_NOTES E5) | a `cancelled` receipt status, so a restored card is Undone without asking the ledger |

Also needed from the shell (asked of the chat UI lead, not built here): a slot between the head and the "On confirm"
line; the body's wrapper dimmed on cancelled, undone, set aside and expired; no arrival of its own for anything
inside the body.

## Defaults taken (nobody to ask; change here if wrong)

1. Reach comes first in every body, above the subject. SPEC lists "who" first; this makes "who" also say how far it
   travels.
2. Sent words are clamped at six lines with the character count, not shown whole by default. A 2,000 character
   announcement shown whole pushes Confirm two screens down on a phone; the count and one tap keep it honest.
3. A body never reads `proposal.input`.
4. Where the plan lacks the words a player receives, the card says "The exact wording is not shown here." rather
   than drawing a notification from the title.
5. `create_focus_area`'s badge is "Proposed", from the receipt, not "Assigned".
6. `add_team_break`, `save_team_term`, `set_lineup` use the plan's own "Nobody is told." with the neutral mark until
   E-6 says who can see them.
7. `lock_lineup` puts its warning first and has no hold states.
8. Dates in facts arrive as ISO (`2026-11-12`); bodies print them as "Thu, Nov 12" through `lib/dates`, the way the
   planners that already write words do. Never raw.
9. The gallery drives bodies from fixtures of the real `ActionProposal` and `ActionReceipt` types inside a stand-in
   frame until the lead's shell exports; the stand-in is labelled in the gallery.
10. Group D forms D1 to D12 reuse the lead's `Evidence.tsx` blocks in the gallery; this lane adds only what does
    not exist (D14 row, D15, D16, the note chip).

## What is built, and how to see it

- `cards/index.tsx`: `CardBody` (the 22 task bodies and the generic one), `cardCopy` and `CARD_TOOLS` from
  `catalog.ts`. `cards/drafts.tsx`: `BriefBody`, `HandoffBody` (message, poll, board), `DocBody`. `cards/answers.tsx`:
  `AppLinkRow`, `CoachNoteChip`, `WorkedOut`, `NotTracked`. `cards/work-words.ts`: section F as data.
- The gallery, one page: `/clubhouse-preview/coachhelm-capabilities`. On a desktop each task is drawn twice, as Ask
  draws it and as quick chat does; on a phone a switch chooses. Each has a state switch, a case switch (long text, one
  recipient, forty, something missing) and Play, which runs Confirm, the request, the 8 seconds and the save at real
  timing; Play with Undo presses Undo at 3 seconds.
- One capability, for a capture: `?task=<tool>&state=<state>&density=full|compact&variant=<case>&play=1|undo`.
  States: `proposed`, `confirming`, `held`, `undoing`, `committing`, `saved`, `partial`, `undone`, `cancelled`,
  `superseded`, `failed`, `expired`. Cases: `create_event` quiet; `create_recurring_practice` missing; `create_trip`
  bare; `create_focus_area` missing; `create_task` one, forty; `create_team_announcement` long, one;
  `send_event_reminder` one, forty. The other forms by id: `ask_practice_brief`, `draft_practice_plan`,
  `write_artifact`, `draft_message`, `draft_poll`, `draft_board`, `save_note`, `save_note_long`, `remove_note`,
  `ev-figure`, `ev-ranking`, `ev-trend`, `ev-bands`, `ev-legs`, `ev-empty`, `ev-failed`, `app_link`, `computed`,
  `not_tracked`, `work_line`, `work_words`.

## The seam, as it stands

The seam in 0.1 was sent to the chat UI lead at the start; no answer had come when this was written, so:

- The gallery's frame (head, buttons, ring, receipt row, Told line) is a **stand-in** built to SPEC Moment 7, in
  `PreviewChatCapabilities.tsx` and the `ch-akg-*` rules. It is not the shell and is not imported by the app. Its 8
  seconds are a page timer; the real card draws the server's `held_until`. When the shell exports, the gallery mounts
  it and the stand-in is deleted.
- One thing to settle with the lead: with reach first in every body, SPEC's "On confirm:" line under the draft says
  the same thing a second time. The stand-in leaves it out. Recommendation: the shell drops the line and keeps only
  the hold sentence beside the ring (`cardCopy(...).hold(seconds)`), so one fact lives in one place.
- The shell's head shows `cardCopy.head` over `proposal.summary`. Bodies are written not to repeat the summary.

## Below the bar, said plainly

1. **The frame is a stand-in.** The ring does not become the check here (MO-7-9), the receipt does not take the
   buttons' place by a cross-fade (MO-7-5), and nothing arrives (MO-7-1). Those are the shell's motions; the gallery
   shows states and timing, not choreography.
2. **A poll draft is drawn in the poll's shape, not by Messages' own `PollCard`**, which needs the whole Messages
   api object to mount. Wanted from the Messages owner: a presentational face of the poll (question, options, head
   words) that takes a `Poll` and nothing else.
3. **An event is not shown in its week.** The old card's five-day grid read the real week from the server; a body
   may not fetch. The date tile says the day; whether the day is free is not on the card. Wanted: the day's other
   events on the plan (`visual.cal.day: Array<{ title, start, end }>`), then the grid can come back with no request.
4. **The drill, the task and the trip are drawn like their homes, not with their homes' components.** They use the
   same tokens and shapes; they are not the drill bank's card or the Tasks row imported. The plan draft is the
   practice lane's real `PlanCard`.
5. **Twelve cards say "the plan does not…"** (the wording a player receives, who is in a thread, which round, which
   tournament, where a player stands on a goal). That is honest and it is not premium. Each one goes away with its
   engine request (E-1 to E-24); none is hidden.
6. **Evidence forms D2, D5, D8, D9, D10** (comparison table, a round hole by hole, the rounds list, a schedule, a
   qualifier board) are specified here and not in the gallery: there is no fixture envelope for them yet. D1, D3, D4,
   D6, D7, empty and failed are the lead's blocks with the Ask fixtures.
7. **VoiceOver was checked by structure and by test** (the group's name is the reach sentence, avatars are
   decorative, every name is text, a body holds no button of the shell's), **not by listening on a phone.**
8. **Not checked on an iPhone.** WebKit captures only: phone and desktop, light and dark, the largest Text Size,
   Reduce Motion (a body has no motion to reduce).
