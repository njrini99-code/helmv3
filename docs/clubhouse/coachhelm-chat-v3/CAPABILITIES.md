# CoachHelm chat v3: every capability, as the coach sees it (11 Nov 2026)

`SPEC.md` is the turn and the card's shell (frame, buttons, ring, receipt row,
work line). `MOTION.md` is every
movement. This file is what goes **inside**: for each thing the assistant can do
in the app, what a coach must be able
to check before saying yes, how it is laid out, every state, the words, and the
proof afterwards. It also covers what
an answer can show (evidence, visuals, links, notes, computed answers), the
fixed set of components that draws all of
it (section S, the studio), and the step each capability shows while CoachHelm
works (section W, the workspace).

Read from the code, not from memory: `registry.ts`, `tasks.ts`,
`create-tools.ts`, `action-planners.ts`,
`practice-planner.ts`, `practice-draft.ts`, `tasks/event-tasks.ts`,
`context/notes.ts`, `context/find-in-app.ts`,
`readers.ts`, `readers-direct.ts`, `engine/protocol.ts`, `engine/loop.ts`. Where
a plan does not carry something a
coach needs, the card does not invent it: it is listed under "Requests to the
engine" with the field needed.

Gallery: `/clubhouse-preview/coachhelm-capabilities` (no sign-in, no model
call). Deep link per capability and state:
`?task=create_trip&state=held&density=compact`. Code:
`src/clubhouse/screens/coachhelm/chat/cards/**` (task card
bodies, edit mode, approve all),
`src/clubhouse/screens/coachhelm/chat/studio/**` (the renderer and registry),
`src/clubhouse/styles/coachhelm-ask-cards.css`.

## Count

The engine registers 32 task tools, 6 draft tools, 2 note tools and the reads
(the catalogue test reads the task
names from the engine's own files and fails when one has no card). They make
**65 designed capabilities**, drawn by
**16 studio components**:

| Group | Count | What |
| --- | --- | --- |
| A. Tasks (a card, Confirm, 8 seconds of Undo) | 32 | every `kind: 'task'` tool: 22 that make something (A1 to A22), 10 that change or close something (A23 to A32) |
| B. Drafts and hand-offs (a card, nothing written) | 6 | practice brief, practice plan, document, message, poll, board |
| C. Instant, no card | 2 | save a note, remove a note |
| D. Reads and answers | 17 | 12 kinds of evidence, the visual, a link into the app, a computed answer, "that isn't tracked", an answer that declines |
| E. The player's Ask | 1 | the read-only set, as one entry with its differences |
| F. Thinking and working | 5 | waiting, reading, working out, drafting, a task's own states on the work line |
| Across cards | 2 | edit mode (0.8), several cards and approve all (0.9) |

Section S is the component set those are drawn with; section W is the workspace
step each one shows.

## 0. What is the same for every task card

### 0.1 The seam with the shell

The shell (chat UI lead) draws the frame, the head (what it will become, the
badge), the "On confirm" line, the
button row, the ring, the receipt row and the "Told" line, and derives the
state. A **body** fills the space between
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
  onEdit?: (patch: Record<string, unknown>) => void; // 0.8: only the fields that changed; absent: no Edit key
  editing?: boolean;             // the edit is with the server
  editError?: string | null;     // the server refused it, in its words
  onEditOpen?: (open: boolean) => void; // the shell holds Confirm while the form is open
}
```

A body reads `facts`, `affects`, `notifications`, `visual`, `publish`,
`neighbours` and `missing`. It never reads
`input` (the write's arguments are not a display contract and hold ids). The
fact labels each body depends on are
the table in 0.7; a test holds the fixtures to the labels the planners write.

A body may not: draw a button in the button row or any Confirm, Cancel, Undo or
Open of its own; fetch, poll or
start a timer; animate its arrival, its height or its layout; draw a ring, a
check, a badge or a receipt. It may hold
a disclosure the coach taps ("Show all 40", "Show the whole message"), which
changes height in one frame on their
tap (MOTION: "because the coach tapped"). Dimming a cancelled or undone draft is
the shell's opacity on the body.

`cards/catalog.ts` holds each capability's words as data (head, primary, busy,
badge, hold line, undone line, home,
and `dismiss`: the quiet key's word, "Cancel" except where that would read as
the action: "Keep the event", "Keep
it"), so the shell's labels and the body cannot drift. `cardCopy(tool,
proposal)`. Reach, how many are told and
whether there is an Undo window come from the plan itself when it says (0.10).

### 0.2 The order inside a body (and the VoiceOver order)

Head (shell): what will happen. Then the body, always in this order, each part
present only when it has something
true to say:

1. **Reach**: who is affected and how far it travels. First, because "does this
   reach my players" is the check that
   cannot be undone by reading the rest.
2. **Subject**: the thing itself, drawn the way its home screen draws it (an
   event as a calendar tile, a task as a
   Tasks row, a poll as a Messages poll, a drill as the drill bank's card).
3. **Words**: anything a person will read, word for word, in the frame they will
   read it in (a notification, a
   message bubble, a note under the round).
4. **Details**: the remaining facts as label and value rows.
5. **Changes**: what this replaces or leaves alone ("Replaces the earlier note",
   "2 players are left as they are").
6. **Warning**: anything that cannot be taken back, in amber, last before the
   shell's "On confirm" line.

Read aloud: the head ("Add to calendar. Short-game practice."), the reach
("Sends to 6 players: Eli Brandt, …"),
the subject, the words, then the shell's line and buttons. The body is one
`role="group"` labelled by the reach
sentence; avatars are decorative (names are text).

### 0.3 Reach: three levels, one vocabulary

Every card says which of three things is true, in the same place, with the same
three marks. A coach learns it once.

| Level | Meaning | Mark | Lead words (proposed) |
| --- | --- | --- | --- |
| **Sends** | Players get a notification, a message or an email | `Badge tone="accent"` with the send glyph: "Sends" | "Sends to 6 players" |
| **Visible** | Nothing is sent, but players can see it in the app | `Badge tone="info"`: "Players can see it" | "On the team's calendar", "In Documents" |
| **Private** | Only the coach, or only coaches | `Badge tone="neutral"` with the lock glyph: "Only you" / "Coaches only" | "Only you see this" |

- The level comes from the plan's `notifications` and the capability's own rule
  (catalog), never from a guess: a
  line that begins "Nobody is told" or an empty list is not Sends.
- **People**: named players as avatars (at most 5, then "+35") and names as
  text: one name in full; two or three
  joined ("Eli Brandt, Jonah Reyes and Max Ortiz"); more: the first two "and 4
  more" with **Show all 6** (a ghost
  `Button`, small), which opens the full list in roster order, wrapped, each an
  avatar and a name. The whole roster
  is "All 7 players" plus Show all. Forty names never print by default and are
  always one tap away.
- Tense follows the state: "Sends to" (proposed, confirming), "Sending to … when
  the ring closes" is the shell's
  line, "Sent to" (saved), "Not sent" (undone, cancelled, set aside, failed, no
  longer available). For Visible and
  Private the words do not change with state; only the shell's line does.
- A card that Sends always shows the recipients and the words (0.4). If the plan
  carries no recipients by name or no
  words, the card says exactly that in the place they would be ("The plan does
  not list who: 6 players") and the gap
  is an engine request. It never draws a made-up preview.

### 0.4 Words: verbatim, in the reader's frame

- Text another person will read is drawn in the frame they will read it in: a
  **notice** (app glyph, bold title,
  body: the notification as a phone shows it), a **bubble** (the coach's own
  sent bubble from Messages), a **note**
  (quoted, with its author line).
- It is the plan's text, never a summary. The whole text is in the DOM. Past 6
  lines (4 in compact) it is clamped
  with **Show the whole message · 1,240 characters**; the count is always shown
  when clamped so a coach knows how
  much is under the fold before they confirm.
- When the plan has the channel but not the words ("6 players get a push and an
  email"), the card shows the channel
  line and, under it, "The exact wording is not shown here." in secondary ink.
  No fake notification.

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

The gallery's switcher offers these by name; "Play" runs proposed, Confirm, the
8 seconds and saved at real timing,
and "Play with Undo" presses Undo at 3 seconds.

### 0.7 The fact labels each body reads (the contract with the planners)

`create_event`: When, Length, Type, Where, Invited, Replies; visual `cal`.
`create_recurring_practice`: Repeats,
Dates, Occurrences, Timezone, Location, Invites, RSVP. `add_blocked_time`: When.
`add_team_break`: Dates.
`save_team_term`: Classes, Exams end. `create_trip`: Leaves, How, From, Back,
Hotel, Rooms, Uniform, Gear; visual
`trip`. `create_qualifier`: Starts, Rounds, Squad, Players, Rules; visual
`qual`. `create_goal`: Player, Target, By,
How; visual `goal`. `create_focus_area`: Player, Focus, Area, Target, By, Over,
Status. `create_task`: Task, Assigned
to, Due, Priority; visual `task`. `create_team_announcement`: Title, Message,
To, Urgency, Acknowledgement.
`add_round_note`: Earlier note, Adding; visual `note`. `set_availability_note`:
Replaces, Note. `create_recruit`:
Grad year, Status, Hometown. `create_drill`: Area, Length, Setup, Goal.
`publish_practice_plan`: When, Where, Tells,
What they get; `publish`. `publish_artifact`: Who can see it, Goes to, Words.
`send_message`: Thread, Message; visual
`msg`. `set_lineup`: Lineup; visual `lineup`. `lock_lineup`: Tournament.
`send_event_reminder`: Event, To (n), Will
not get it, They see, How, When. `record_attendance`: Event, Present (n), Late
(n), No-show (n), Changes a mark
already recorded, Not marked, Players are told. An unknown label is drawn as a
plain row, so a new fact is never lost.

### 0.8 Edit mode: changing a card before Confirm

A plan may declare fields a coach can change without asking again
(`proposal.editable`, engine E28, PLANS P11). The
card then has two ways to change: a field it declares (edit mode), or anything
else, in words (a new card replaces
this one). The design holds four things true.

- **It looks editable only where it is.** With no `editable` on the plan, or no
  `onEdit` from the shell, or in any
  state but proposed, there is no Edit key and nothing in the body is a control.
  With them, the body ends with one
  quiet key, "Edit", and a caption that names exactly what it opens ("You can
  change the title, the day and who is
  invited."). Rows do not turn into inputs in place: a row that is sometimes
  text and sometimes a field is how a
  coach changes something by accident.
- **One real control per kind of field**, the app's own: text and long text
  (`.ch-input`, `.ch-textarea` with the
  character count against the limit), a day (`DateField`), a time (`TimeField`),
  a day and time (both), a number, a
  choice (`Segmented` up to four options, `Select` beyond), a yes or no
  (`Switch`), people (the roster as
  `Checkbox` rows with "5 of 8"), a list (rows with Add one and Remove). A field
  that is not required says
  "Optional".
- **What is on screen is what would be confirmed.** The form opens under the
  card's own rows, which do not change
  while it is open; its first line says so. The shell holds Confirm while the
  form is open ("Update or discard your
  changes first."). "Update the preview" sends only the fields that changed
  (`onEdit(patch)`; an optional field that
  was emptied is `null`). It is unavailable until something changed, and a
  required field emptied says which
  ("Title cannot be empty.") without sending.
- **The server plans the card again; the card never edits itself.** In flight
  the form goes still and its key reads
  "Updating the preview…" (`editing`). Accepted: the re-planned proposal arrives
  with the next `revision`, the form
  closes, and the body is the new plan (reach, recipients and the words a player
  receives are all planned again, so
  an edit to who is invited changes the "Sends to" line too). Refused: the form
  stays open with what was typed and
  the server's reason, then "The card has not changed." (`editError`, the
  `reason` of a `data-card-revision` with
  `accepted: false`). The form's last line: "Everything else on this card is
  fixed. To change it, ask in words and a
  new card replaces this one."

Which cards offer what is the plan's to say (today: the create flows' main
fields; `cancel_event` its reason,
`set_goal_state` its reason when abandoned, `set_qualifier_coach_pick` its
reasoning, `send_event_reminder` its
recipients; CONTRACT_NOTES C12 to C14). The seam: `onEdit`, `editing`,
`editError`, `onEditOpen` on `CardBodyProps`;
the body marks its root `data-editing` while the form is open. Code: `cards/edit.tsx`.

### 0.9 Several cards in one answer, and the one safe "approve all"

One answer may propose several tasks (engine E29). Each is its own card, decided
on its own, in any order. Under
them one bar may approve several together. It is designed so that pressing it
can never do something the coach did
not read:

- It **names each card it would confirm** and each card it leaves out, with the
  reason. Left out: a card with a
  detail missing ("needs a detail first"), a card with an edit open ("has
  changes you have not updated"), and a card
  with no Undo ("cannot be undone, so it is confirmed on its own": a lineup lock
  is never approved in a batch).
- It **says what approving them does in total**: "3 actions. 2 send to 9 people;
  1 tells nobody." People are counted
  once across cards when the plans name them.
- It is **not drawn for one card** (that is the card's own Confirm), and its key
  is the secondary style: each card's
  named Confirm stays the primary.
- Its key reads "Approve all 3", or "Approve these 3" when a card is left out,
  so "all" is never said of less than
  all.
- **One Undo window for the batch.** Held: "Not saved yet. All 3 save in 6
  seconds." with "Undo all 3"; each card
  keeps its own ring and its own Undo (the engine holds every card of a batch to
  the same moment). Saved: "All 3
  saved". Undone: "Undone. None of the 3 was saved. Nobody was told."
- **The first failure stops the batch** (the engine's rule). The bar says where:
  "Stopped at “Team announcement”.
  It could not be saved, so nothing after it was tried. 1 card is waiting for
  you again." Those cards are back to
  proposed; nothing is retried by itself.

Code: `cards/ApproveAll.tsx` (`batchPlan(cards)` is the rule, tested;
`ApproveAll` is the bar). The shell owns where
it sits in the turn, the shared ring and the calls (`approveAll(keys)`, Undo for
each key).

### 0.10 What the plan itself now says

The server builds these on the plan and the receipt (CONTRACT_NOTES P1 to P11,
E12 to E19, E25 to E29). A body draws
each when it is present and keeps its honest "not shown here" line when it is
absent (a card stored before 11 Nov).

| Field | What the body does with it | Request it answers |
| --- | --- | --- |
| `recipients`, `not_reached` | the reach row's people, by name and role; "Will not get it: Max Ortiz (no account yet)" | E-1, E-19, E-20 |
| `delivery` (channels, the words per channel, `each`) | the notification drawn in the reader's frame, a switch between channels, "Whose words" when each player's differ; `null` means nothing is sent and nothing is drawn | E-2, E-18 |
| `visible_to`, `visible_note` | the reach mark ("Only you", "Coaches only", "Players can see it") and its sentence | E-6, E-24 |
| `undo` (`window`, `after`) | no window: the first row is the warning "This happens the moment you press. There is no Undo."; `after`: the body's last line, "After the 8 seconds: change or cancel it on the Calendar." | new |
| `editable`, `revision` | edit mode (0.8) | new |
| receipt `href` | Open, on the shell's receipt row | E-12 |
| receipt `missed`, `notifications[].to` | "Did not get it: …" by name; who was told, by name | E-13, E-23 |
| receipt status `cancelled` | a restored card is Undone without asking the ledger | E-27 |
| receipt `error: 'card_out_of_date'` | no Try again: "Things changed since this card was made. Ask again and it is prepared from what is true now." (`isOutOfDate`) | new |
| `data-computed`, `coverage: 'not_tracked'` | D15 and D16 are on the wire | E-25, E-26 |

Whether each planner fills each field is the plans worker's ledger, not this
file's. The body's rule does not depend
on it.

---

## A. Tasks

Each entry: the idea; what the coach checks, in order; layout; long values;
reach; receipt and Open; Undo; failure;
compact; what is not shown; requests. "Hold line" is the shell's sentence during
the 8 seconds. Motion: none of a
body's own in any entry (MOTION Moment 7 moves the card; bodies are still).
Primary, busy and badge words are the
catalog's.

### A1. Add one event to the calendar (`create_event`)

- **Idea.** The event as the calendar will show it: a date tile and the block of
  time, so a wrong day or a wrong
  hour is seen before a word is read.
- **Checks.** Who is invited and whether they are asked to reply; the day, start
  and end; where; the type.
- **Layout.** Reach: Sends ("Sends to 6 players, asks for a reply") when replies
  are asked for and someone is
  invited; Visible ("On the team's calendar. Nobody is told.") otherwise, with
  the invited players still shown as
  people. Subject: date tile (weekday, day, month), title, "3:00 to 5:30 PM",
  place, type chip. A length the engine
  assumed ("2.5 hours, the usual practice") carries the "Assumed" chip and its
  source line, and is the first row a
  tap can change. Details: Replies.
- **Long.** Title two lines. Invited: people rule.
- **Words.** Primary "Add to calendar", busy "Adding…", badge "Added". Hold:
  "Not saved yet. Saves in 8 seconds,
  then 6 players are told." / without people "Saves in 8 seconds."
- **Receipt.** "{title} is on the calendar." Open: Calendar, on the event's day,
  with the event marked.
- **Undo.** Within 8 seconds: nothing was saved, nobody was told. After: the
  event is edited or deleted in Calendar.
- **Failure.** "A timed event needs a start and an end" is asked before a card
  exists. A failed write: the reason,
  "Nothing was saved." and Try again; when the server could not check: "Look in
  the Calendar before trying again."
- **Compact.** Reach line, then one row: tile, title, time. Place and type fold
  into a meta line.
- **Not shown.** The week grid around the day in compact (the page behind is the
  calendar). The time zone when it is
  the team's own.
- **Requests.** E-1 (affects by id), E-2 (the invitation's words), E-3 (Notes is
  written but not on the card),
  E-13 (told-count on the receipt).

### A2. A repeating practice (`create_recurring_practice`)

- **Idea.** Every date that will be created, as a run of day tiles grouped by
  month. The coach counts tiles, not a
  number in a sentence.
- **Checks.** How many, which days, the first and last date, the time, the
  place, who is invited, replies.
- **Layout.** Reach: Sends ("Sends to 7 players: an invitation, an email and a
  push. Each is asked to reply") when
  RSVP is required; Visible ("On 7 players' calendars. Nobody is told.") when
  not. Subject: "Every Tuesday and
  Thursday at 3:00 PM", then the tiles under month labels, the first and last
  tinted. Details: Location (Not set is
  amber and blocks Confirm), Replies and its deadline, Time zone only when it
  differs from the viewer's.
- **Long.** 26 tiles wrap; none hidden in full.
- **Words.** Primary "Add 8 practices", busy "Adding…", badge "Added". Hold:
  "Not saved yet. Saves in 8 seconds,
  then 7 players are invited."
- **Receipt.** "8 practices created, every Tuesday and Thursday at 3:00 PM."
  Open: Calendar at the first date.
  Partial: "6 of 8 created" with the two missing dates named when the receipt
  names them.
- **Undo.** Nothing was saved. After: each practice is its own event in Calendar.
- **Failure.** Reason and "Nothing was saved."; a retry that finds the first
  attempt's rows says so ("an earlier
  attempt created them and I did not create them again").
- **Compact.** Sentence, first 4 tiles and "+4", Show all.
- **Not shown.** The description.
- **Requests.** E-4 (end time and a `series` visual), E-2, E-13.

### A3. Block the coach's own time (`add_blocked_time`)

- **Idea.** A private mark on the coach's own calendar. The card's job is to say
  plainly that no player sees it.
- **Checks.** The day or days, the hours, the title.
- **Layout.** Reach: Private ("Only you see this"). Subject: date tile, title,
  "3:00 to 4:00 PM" or "All day".
- **Words.** Primary "Block time", busy "Blocking…", badge "Blocked". Hold: "Not
  saved yet. Saves in 8 seconds."
- **Receipt.** "That time is blocked." Open: Calendar.
- **Undo / Failure.** As A1, with no people.
- **Compact.** One row.
- **Requests.** E-5 (the end date of a block that spans days is written but not
  on the card).

### A4. A team break from class (`add_team_break`)

- **Idea.** A span of days on one line: first day, last day, and how many days between.
- **Checks.** The first and last day, the count, the label.
- **Layout.** Reach: the plan's own line ("Nobody is told."); the level is
  Visible only once the engine says who
  sees a break (E-6); until then the neutral mark and the plan's words. Subject:
  two date tiles joined by a rule
  with "5 days" on it.
- **Words.** Primary "Add break", badge "Added". Receipt: "{label} is on the
  calendar." No Open (E-12).
- **Undo.** Nothing was saved. **Failure.** "A break is one to 21 days" is asked
  before a card.
- **Requests.** E-6, E-12.

### A5. A school term (`save_team_term`)

- **Idea.** The term as a bar: classes from A to B, then exams to C. Three dates
  a coach knows by heart, checked at
  a glance.
- **Checks.** Name, classes start and end, exams end.
- **Layout.** Reach: the plan's line ("Nobody is told."). Subject: the name,
  then a two-part bar with the three
  dates under its joints (drawn in place, not to scale beyond the two segments'
  real lengths).
- **Words.** Primary "Save term", badge "Saved". Receipt "{name} is saved." No
  Open (E-12).
- **Not shown.** Whether a term of the same name is replaced (E-7).
- **Requests.** E-7, E-12.

### A6. A trip (`create_trip`)

- **Idea.** The itinerary line: where from, how, where to, out and back, as one
  drawn route, then what a player
  needs for it (hotel, rooms, uniform, gear).
- **Checks.** Leave date and time, transport, from and to, return, hotel, rooms,
  uniform, gear.
- **Layout.** Reach: Visible ("Players see it as new travel. Nobody is told.").
  When there is a hotel confirmation
  number the plan's own sentence is the warning row: "Every team member can read
  the hotel confirmation number."
  Subject: from, a rule with the transport word and glyph, to; under it "Leaves
  Fri 14 Nov, 6:30 AM" and "Back Sun
  16 Nov". Details: Hotel, Rooms, Uniform, Gear (as chips).
- **Long.** Rooms and gear: 3 lines, Show all.
- **Words.** Primary "Add the trip", badge "Added". Receipt "The trip to
  {destination} is added." Open: Travel.
- **Undo / Failure.** As A1. "The return is before the leave date" is asked first.
- **Compact.** Route line and dates; the rest under Show details.
- **Requests.** E-8 (flight info, hotel address, phone, the confirmation number
  and notes are written but not on the
  card).

### A7. A qualifier (`create_qualifier`)

- **Idea.** The format as a board head: rounds, who plays, how many make the
  squad and how many are the coach's
  picks, drawn as seats (filled for qualifying spots, outlined for picks).
- **Checks.** Start, rounds, squad size and picks, the field by name, the rules,
  the entry deadline.
- **Layout.** Reach: Sends ("Sends to 9 players: a push and an email"). Subject:
  name, "3 rounds from Mon 17 Nov",
  the seat row ("4 qualify, 1 coach pick"), "9 in the field". Details: Rules,
  Entry deadline.
- **Long.** Rules 3 lines. Field: people rule.
- **Words.** Primary "Set qualifier", busy "Setting…", badge "Set". Hold: "Not
  saved yet. Saves in 8 seconds, then
  9 players are told."
- **Receipt.** "{name} is set." Open: Qualifiers.
- **Compact.** Name, the format sentence, people.
- **Requests.** E-1, E-2, E-9 (description and end date written, not shown), E-13.

### A8. A goal for a player (`create_goal`)

- **Idea.** One player, one stat, one number, one date. The number is the hero.
- **Checks.** The player, the stat, the target, by when, assigned or suggested.
- **Layout.** Reach: Sends ("Sends to Eli Brandt: a push"). Subject: avatar and
  name; the stat label; the target in
  the large numeral; "in 30 days"; chip "Assigned" or "Suggested".
- **Words.** Primary "Set goal", badge "Set". Receipt "The goal is set for
  {name}." No Open (E-12).
- **Not shown.** Where the player stands now and which way is better: the plan
  has no baseline, so the card does
  not draw a from-to (E-10). The target prints as the plan gives it.
- **Requests.** E-10, E-2, E-12, E-13.

### A9. A focus area for a player (`create_focus_area`)

- **Idea.** The focus as the player's own list will show it, with the one fact
  coaches get wrong: it is a proposal
  until the player accepts.
- **Checks.** The player, the title, the area, the measurable target (current to
  target), by a date or over rounds,
  that the player must accept.
- **Layout.** Reach: Sends ("Sends to Eli Brandt, who is asked to accept it").
  Subject: area chip, title, target
  line ("Putts per round 31.2 to 29.5"). Details: By or Over. Changes: "Starts
  when Eli accepts. Until then it is
  proposed." A missing measurable target is the amber row.
- **Words.** Primary "Assign focus", busy "Assigning…", badge "Proposed" (not
  "Assigned": the receipt says
  "{title} is proposed to {name}."). Open: the player's focus areas. Told: "Told
  1 in the app".
- **Failure.** A duplicate active focus is not retryable: the reason, no Try again.
- **Requests.** E-11 (description is written, not shown), E-2.

### A10. A task for players (`create_task`)

- **Idea.** The task as the Tasks list shows it: an open check circle, the
  title, the due date, the assignees.
- **Checks.** The words of the task, who gets it, the due date, the priority.
- **Layout.** Reach: Sends ("Sends to 4 players, in the app"). Subject: the
  Tasks row. Details: Priority. "No due
  date" is amber (the plan marks it missing; Confirm waits for it, by the
  engine's rule).
- **Words.** Primary "Assign task", badge "Assigned". Receipt "{title} assigned
  to 4 players." Open: Tasks, the row
  marked. Told: "Told 4 in the app".
- **Compact.** The row and the reach line.
- **Requests.** E-11 (description), E-2.

### A11. A team announcement (`create_team_announcement`)

- **Idea.** The words, exactly, in the frame a player's phone shows them, and
  every recipient one tap away. This is
  the card where a coach approves text written by the assistant for their whole
  team.
- **Checks.** The title and the whole message; who gets it; urgency; whether
  each player must acknowledge.
- **Layout.** Reach: Sends ("Sends to all 7 players"). Words: the notice (title
  bold, body under it, verbatim).
  Details: Urgency when it is not normal, Acknowledgement when it is required.
- **Long.** 0.4: six lines, Show the whole message with the character count.
- **Words.** Primary "Post to 7 players", busy "Posting…", badge "Posted". Hold:
  "Not sent yet. Sends in 8 seconds
  to 7 players." Receipt "{title} sent to 7 players." Open: Announcements. Told:
  "Told 7 in the app".
- **Undo.** "Undone. Nothing was posted." After the window it is in every
  player's Announcements; whether it can be
  taken down from there is the app's, and the card does not claim either way.
- **Compact.** Reach, the notice at two lines.
- **Requests.** none of substance (the plan carries names and words).

### A12. A coach note on a round (`add_round_note`)

- **Idea.** The round's note as the player will read it: what is already there,
  then the new words under it.
- **Checks.** Whose round; the earlier note stays; the new words; the player
  will see it.
- **Layout.** Reach: Visible ("Eli Brandt will see this note on the round").
  Words: the earlier note, quoted and
  quiet, then the new note. Changes: "The earlier note stays. This goes under it."
- **Words.** Primary "Add note", badge "Added". Receipt "The note is on the
  round." Undo: "Undone. Your earlier
  notes are as they were."
- **Failure.** "With the earlier note this passes 2,000 characters. Nothing was
  changed; shorten the new note."
- **Requests.** E-14 (which round: course, date and score are not on the card),
  E-12.

### A13. A coach-only availability note (`set_availability_note`)

- **Checks.** The player, the words, that it replaces the earlier note, that
  players never see it.
- **Layout.** Reach: Private ("Coaches only. Eli never sees this."). Words: the
  note. Changes: "Replaces: {earlier}"
  struck through in secondary ink when the plan gives it.
- **Words.** Primary "Save note", badge "Saved". Receipt "The note is saved." No
  Open (E-12).
- **Requests.** E-15 (the earlier note is the model's claim, not read by the
  server), E-12.

### A14. A recruit (`create_recruit`)

- **Layout.** Reach: Private ("Coaches only"). Subject: avatar from the name,
  name, "Class of 2028 · Austin, TX",
  status chip.
- **Words.** Primary "Add recruit", badge "Added". Receipt "The recruit is
  added." Open: Recruiting.
- **Requests.** E-16 (email, phone and notes are written but not on the card).

### A15. A drill for the drill bank (`create_drill`)

- **Idea.** The drill bank's own card: area, name, minutes, setup, goal.
- **Layout.** Reach: Visible, later ("Players see it only when a published plan
  uses it. Nobody is told.").
  Subject: the drill card.
- **Words.** Primary "Add to drill bank", badge "Added". Receipt "{name} is in
  the drill bank." No Open (E-12).
- **Requests.** E-17 (the kind, skill, random or pressure, is written, not
  shown), E-12.

### A16. Publish a practice plan (`publish_practice_plan`)

- **Idea.** Who hears, what one of them gets, where it is filed, and whether it
  also posts in Team chat.
- **Checks.** The plan's title, when and where; who is told (players and
  coaches); the notification one player
  gets, with the note that each player's is their own; the Team chat post.
- **Layout.** Reach: Sends ("Sends to 6 players and 2 coaches: push and bell").
  The plan lists six names and a
  count beyond them, so Show all is offered only when the list is complete;
  otherwise "and 4 more". Words: the
  notice labelled "What Eli gets. Each player sees their own start." Details:
  When, Where, Filed in Practice
  plans, Team chat ("Also posts in Team chat, with no second push" / "Not posted
  in Team chat").
- **Words.** Primary "Publish to 8 people", busy "Publishing…", badge
  "Published". Receipt "Published. 8 people
  told." (and "The Team chat post didn't send." when it did not). Open: the
  plan. Failure line: "Nothing was sent."
- **Requests.** E-18 (the count, the time and the notification line are the
  model's inputs, not built by the server
  from the plan), E-19 (every name; the Team chat post's words).

### A17. Publish a document (`publish_artifact`, Ask)

- **Layout.** Reach: Visible ("All 7 active players can open it in Documents.
  Nobody gets a notification.").
  Subject: the document as a page: title, then its words (0.4, six lines, "Show
  the whole document · 3,180
  characters").
- **Words.** Primary "Publish to 7 players", badge "Published". Receipt "{title}
  is in Documents." No Open (E-12).

### A18. Send a message (`send_message`, quick chat)

- **Idea.** The thread it goes into and the bubble it will be, as Messages draws
  the coach's own bubble.
- **Layout.** Reach: Sends ("Sends as you to 6 players in Travel squad"). Words:
  the last message in the thread,
  quiet, when the plan has it, then the draft as a sent bubble. Nothing else.
- **Words.** Primary "Send", busy "Sending…", badge "Sent". Hold: "Not sent yet.
  Sends in 8 seconds." Receipt
  "Sent to {thread}." Open: the thread.
- **Undo.** "Undone. Nothing was sent." After: a sent message is deleted in Messages.
- **Requests.** E-20 (the member count is the model's number and the members are
  not named).

### A19. Set a tournament lineup (`set_lineup`, flag)

- **Layout.** Reach: the plan's line ("Nobody is told."). Subject: seats 1 to 5
  as numbered rows with avatar and
  name, alternates under a rule, individuals last.
- **Words.** Primary "Set lineup", badge "Set". Receipt "Lineup set." Open: the
  tournament. Undo: "Undone. The
  earlier lineup is as it was."
- **Requests.** E-21 (which tournament; the lineup it replaces; the reasoning
  per seat is written, not shown).

### A20. Lock a tournament lineup (`lock_lineup`, flag): the one with no Undo

- **Idea.** The only card that writes on the press. It must not look like the others.
- **Layout.** Warning first, as the body's first row, in amber: "This locks the
  moment you press. There is no
  Undo." Then the plan's own line: "Substitutions only work if the event allows
  them."
- **States.** proposed, confirming, saved, failed. No held, no ring.
- **Words.** Primary "Lock the lineup", busy "Locking…", badge "Locked".
  Failure: "The lineup is still going
  through. It isn't locked; lock it once it lands."
- **Requests.** E-22 (the plan says only "Tournament: As set": no name, no
  seats. The coach locks without seeing
  what is locked. The card says so: "The plan does not show the lineup. Open the
  tournament to check it first.").

### A21. Remind players about an event (`send_event_reminder`)

- **Idea.** The model card for anything sent: every recipient by name, anyone
  who will not get it and why, and the
  reminder exactly as it arrives. The engine carries all of it.
- **Checks.** The event; who gets it; who will not ("no account yet"); the
  words; how and when it arrives.
- **Layout.** Reach: Sends ("Sends to 5 players"). Under the people, when
  present: "Will not get it: Max Ortiz (no
  account yet)" in amber. Words: the notice ("Reminder: Short-game practice" /
  "Thu 12 Nov, 3:00 PM at the short-
  game area"). Details: How ("A notification in the app that opens the event").
- **Words.** Primary "Send reminder", busy "Sending…", badge "Sent". Hold: "Not
  sent yet. Sends in 8 seconds to 5
  players." Receipt "The reminder about {event} went to 5 players." Open: the event.
- **Partial.** "4 of 5 got it." with the receipt's sentence. **Failure.** "The
  event changed after this card was
  made, so the reminder would no longer say what you approved. Nothing was sent.
  Ask for the reminder again." (no
  Try again); "The reminder may or may not have gone out … Sending it again is
  safe, nobody gets it twice." (Try
  again).
- **Requests.** E-23 (the names of who was missed, on a partial receipt).

### A22. Record attendance (`record_attendance`)

- **Idea.** A roll, in roster order, each player with the mark they will get,
  grouped Present, Late, No-show, and
  the two things a coach worries about: marks that change, and players left alone.
- **Layout.** Reach: Private in effect ("Nothing is sent to players."), with the
  event's name and time as the
  subject line. The roll: three groups with counts, people rule inside each.
  Changes: "Changes a mark already
  recorded: Jonah Reyes: Present now, Late after." and "2 players on the roster
  are left as they are."
- **Words.** Primary "Save attendance", busy "Saving…", badge "Saved". Receipt
  "Attendance is saved for 7 players
  at {event}. Nothing was sent to players." Open: the event.
- **Partial.** "Saved for 5, and not for Max Ortiz and Sam Lee." with each
  reason. **Failure.** "I could not check
  which marks were saved: look at the event in the Calendar. Saving again is
  safe, it writes the same marks."
- **Requests.** E-24 (whether a player can see their own mark).

## A, continued. Tasks that change something that exists (A23 to A32)

These ten change or close a thing rather than make one. They share one body
(`PlanBody`): reach first, then the
thing by name, then **what it is now against what it becomes** when the plan
carries "Now" and "After", then the
words anyone receives, then the remaining rows. The dismiss key says what
keeping means where "Cancel" would read
as the action.

| # | Tool | Head and primary | Reach | What the coach checks | Dismiss | After Undo |
| --- | --- | --- | --- | --- | --- | --- |
| A23 | `update_event` | Change an event · "Change the event" | sends when anyone is told | the event by name and day; each changed field as now and after; who is told and the words | Cancel | "Undone. The event is as it was, and nobody was told." |
| A24 | `cancel_event` | Cancel an event · "Cancel the event" | sends when anyone is told | the event; who is told; the reason, in the words they receive (editable) | **Keep the event** | "Undone. The event is still on, and nobody was told." |
| A25 | `set_focus_area_status` | Focus area · "Mark completed" or "Reopen" | players can see it | the player and the focus area; the status now and after | Cancel | "Undone. The focus area is as it was." |
| A26 | `set_goal_state` | Goal · "Pause the goal", "Resume the goal", "Abandon the goal" (the summary's verb) | players can see it | the goal; the state now and after; the reason when abandoned (editable) | Cancel | "Undone. The goal is as it was." |
| A27 | `mark_signal_handled` | Signal · "Mark handled" | players can see it | the signal's own sentence and who it is about | Cancel | "Undone. The signal is still open." |
| A28 | `dismiss_signal` | Signal · "Dismiss the signal" | players can see it | the signal; that it leaves the board | **Keep it** | "Undone. The signal is still on your board." |
| A29 | `set_qualifier_coach_pick` | Coach’s pick · "Make the pick" | coaches only | the qualifier, the player picked, the seat; the reasoning (editable) | Cancel | "Undone. No pick was made." |
| A30 | `set_task_reminder` | Task reminder · "Set the reminder" | sends | the task; who is reminded; when; the words | Cancel | "Undone. No reminder was set." |
| A31 | `log_focus_progress` | Focus area progress · "Log progress" | players can see it | the focus area; the entry as it will read | Cancel | "Undone. The focus area is as it was." |
| A32 | `record_focus_outcome` | Focus area outcome · "Record the outcome" | players can see it | the focus area; the outcome and what it closes | Cancel | "Undone. No outcome was recorded." |

States are those of 0.6. None is immediate. Gaps: A25, A26, A28, A31 and A32
have no home to open from the receipt
until their receipts carry `href`.

---

## B. Drafts and hand-offs (a card that writes nothing)

These are reads on the contract: no Confirm, no ring. Each card says, in the
reach position, the one true thing:
**"Nothing is sent until you press Send in Messages."**

| # | Capability | Idea and layout | States | Words |
| --- | --- | --- | --- | --- |
| B1 | Practice brief (`ask_practice_brief`) | Up to four questions as choice rows (the read's default already picked, its source as the hint). The turn stops and waits. | asking, answered (the answers become the coach's next message and the card reads as a summary of them), set aside | "Build the plan" primary; work line "Waiting for you" |
| B2 | Practice plan draft (`draft_practice_plan`) | The plan as a run sheet: blocks down a time rail from the start time, each with its length, place, drill and Aim; a Because with its source chip, or "Lean read" when no read backs the number; stations as a grid; what to bring. Version badge "Draft 2". | drafting (a read row), drafted, revised (the newest replaces the older in place), refused ("The blocks add up to 170 minutes; you asked for 180": said in prose, no card) | "Open in the builder", "Save"; "Nothing is saved yet." |
| B3 | A long document (`write_artifact`) | A page card: kind ("Player report"), title, first lines, version time. Opens beside the chat. | writing, written, revised, published (through A17) | "Open"; "It stays in this chat until you publish it." |
| B4 | A message draft (`draft_message`) | The recipients (people rule) or the thread, then the words as a bubble. | drafted, opened | "Open in Messages"; "Nothing is sent until you press Send." |
| B5 | A poll draft (`draft_poll`) | Messages' own poll: question, options as the poll's rows at zero votes, "Choose one" or "Choose any", when it closes, "Names show on votes". | drafted, opened | "Open in Messages"; "Nothing is posted until you press Send." |
| B6 | A board for a player (`draft_board`) | The visuals already drawn in this answer, tiled under the coach's note, as the image the player will get. | drafted, drawing (the image is being made on tap), failed to draw ("Couldn't draw the board. Your note is in the message. Nothing was sent.") | "Open in Messages" |

Compact (quick chat has B1, B2, B6 only): the head and the reach line, then the
first two rows and Show all.

## C. Instant, no card: standing notes (`save_note`, `remove_note`)

A note saves at once, with no confirmation, because it is the coach's own
sentence about how they want answers. So
the proof and the undo are the same small thing, in the thread, where it happened.

- **Saved** (`data-coach-note`, op `saved`): a chip under the paragraph: the
  note glyph, "Noted" and the sentence in
  the coach's words, with a remove key (44px reach). Long notes (280 at most)
  wrap to three lines.
- **Removed** (op `removed`): the same chip, the sentence struck through,
  "Removed". No key.
- **Refused**: no chip. The answer says why in prose ("That is about a named
  player's health… The coach-only
  availability note is the place for it.").
- **Undo**: the remove key on a saved chip. It is the only write in the chat
  without Confirm, so the chip always
  says who can see it: "Only you. Players never see notes."
- Motion: arrives as a link row does (MO-5-9). A request to the lead: the chip's
  remove is `MO-1-7`'s fade.

## D. Reads and answers

A figure in an answer carries a marker (a space, then `[e3]`; drawn as a chip,
SPEC ST-5.chip). Tapping it opens the read it came
from (sheet on the phone, panel on desktop, SPEC Moment 6). Every read opens
with the same head, so a coach always
knows what they are looking at before the numbers: **what was read** ("Putting
by distance"), **whose** (a player,
the team), **the window and the sample** ("Last 8 rounds · Sep 1 to Sep 29 · 212
putts"), and **as of**. A sample
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

- **Empty** ("No putts recorded in this window." with the window) and **failed**
  ("This read didn't come back.") are
  SPEC ST-6.empty-read and ST-6.failed-read.
- **D13. A visual** (`show_visual`). In the thread, under the paragraph that
  cites it, complete at first paint
  (Q-153), in the visual frame: title, who and window, the marks, a foot ("From
  3 reads"), a Table toggle. Blocks a
  composition can hold: headline, KPIs, trend, ranking, bands, split, compare,
  note, miss pattern, putt profile,
  season compare, hole strip; and the strokes-gained anatomy figure. Phone: full
  column width, blocks stacked.
  Desktop: 720 column, KPIs in a row, split and compare two-up. The frame never
  grows after paint.
- **D14. A link into the app** (`find_in_app`, `data-app-link`). A quiet row
  under the paragraph: arrow, "Open
  Roster requests", and the place's one line. At most two (a near tie). Never an
  address in prose. For one player's
  page: "Open Stats for Eli Brandt".
- **D15. An answer computed across the whole team.** The model reads many
  players and calculates in code. The
  coach never sees code or a tool name. The work line says "Working it out
  across the team" while it runs; the
  folded line reads "14 reads · 1 calculation · 4s"; and under the answer the
  foot row carries a **Worked out**
  chip. Tapping it opens the evidence panel on a "How this was worked out" page:
  one sentence of method in plain
  words ("Averaged each player's putts per round over their last 8 rounds, then
  ranked them"), what was read (14
  players, 212 rounds, the window), and the result table. Figures in such an
  answer have no markers (reads called
  from code cannot be cited), so the chip and this page are how it shows its
  work. Built against a typed stub
  (E-25).
- **D16. "That isn't tracked."** When the coach asks for something the app does
  not collect, the answer says so in
  its first sentence, and a quiet row under it shows the nearest thing that is:
  "Not tracked: club used off the tee.
  Closest: fairways hit, driving distance." Never an empty chart and never a
  zero. Built against a typed stub
  (E-26); today it is prose only.
- **D17. An answer that declines.** A model refusal is a complete turn marked
  `declined`, not an error. It is drawn
  as an answer: the mark at rest, the assistant's own sentence in the answer's
  type, no warning colour, no Try again,
  no failed-turn notice, and the composer ready. Nothing about it says something
  broke, because nothing did. The
  workspace shows no steps for it (there was no work), and follow-ups are
  offered as after any answer. It is the
  shell's to draw (SPEC Moment 4, `declined`); it is catalogued here so that no
  card or studio component is ever
  used to dress a refusal as a failure.

## E. The player's Ask (read-only)

Ten tools, all reads of the player's own game. Everything in D applies with
these differences, enforced where the
data is built and tested in the DOM:

- No task card, no draft card, no note chip, no "Worked out" chip (code is off
  for players), no D3 ranking, no D2
  across teammates, no D10 beyond the player's own line, no D8 for anyone else.
- Evidence heads say "your": "Your last 8 rounds". Comparisons are to the team
  average and Tour as the player's own
  Stats page shows them, never to a named teammate.
- D14 links open only the player's places. D11 shows their own focus areas,
  goals and reads.
- A drill their coach set is a quiet card they can open (SPEC ST-11.drill).

## F. Thinking and working: the work line and the mark

The mark turns while anything is live and rests when nothing is. The work line
is the only place status is said
(SPEC Moment 4). A tool name is never shown; every label below is the server's
own `progress` string or the shell's
sentence.

| Kind of work | Mark | Work line (and read row label) | After |
| --- | --- | --- | --- |
| Nothing from the server yet | turning | nothing; at 1.2 s "Sending"; at 6 s "Still sending. This is taking longer than usual."; at 20 s "No answer yet. You can stop and ask again." | |
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

For a player the labels are the server's player forms: "Reading your
statistics", "Reading your season", "Reading
your CoachHelm", "Working out your figures".

---

## S. The studio: the fixed set of things CoachHelm can put on screen

The assistant never invents interface. It fills a typed part, the server fills
every figure from a read, and exactly
one component draws it. The set is `STUDIO_KINDS`
(`src/lib/coachhelm/v3/chat/visuals/studio-kinds.ts`), the one list
the schema side and this side are both tested against. The renderer and registry
are
`src/clubhouse/screens/coachhelm/chat/studio/**`:

```tsx
<Studio part={fromBlock(block)} size="full" read={ref} onAsk={fillComposer} />
```

`part.kind` picks the component; `size` is `full` (the thread on a desk) or
`compact` (quick chat, and any column
down to 320px); `read` is the read or artifact the part came from. **Nothing
falls through to nothing**: an unknown
kind, and a part its own component cannot draw, are drawn by the table from
whatever rows or fields the part
carries (`tableOf`). A component takes what it draws already in the app's words
(`from.ts`: `fromBlock` for a
composition block, `fromEvidence` for a read's evidence); no component computes
a figure.

### S.1 The sixteen, and what folded into what

| Kind | A coach sees | Draws (what folded in) | Tap an element to ask about | Arrow opens |
| --- | --- | --- | --- | --- |
| `figure` | one figure set large, or up to six beside each other, each with its sample in words | composition `headline` and `kpis`; the season read; D1's tiles | that figure ("Jonah Okafor, putts per round, 31.8 over 4 rounds") | the player's stats |
| `comparison` | players across the same measures, the best in each marked with a dot | composition `compare`; D2 | a player (their row against the others) | the player's stats |
| `ranking` | place, name, sample, a bar on one fitted axis, the figure; gain right of zero and loss left for strokes gained | composition `ranking`; D3; the old bars-of-players | a player on that measure | the player's stats |
| `trend` | one measure round by round with its reference line; or this season against last on one scale | composition `trend` and `season_compare`; D4 | the trend as a whole (its summary); each season | none |
| `round` | the scorecard: two nines in the app's own scorecard table, then the holes that cost and gained the most | composition `hole_strip`; `get_round`, `get_rounds`; D5 | a hole ("hole 7, 2 over") | the round |
| `strokes_gained` | the parts of the game on one axis, gain right and loss left | composition `split`; the `sg_anatomy` scene; D7 | a part of the game | none |
| `distance_profile` | make rate or feet left by distance band, each with its attempts; where the misses go | composition `bands`, `putt_profile`, `miss_pattern`; `get_shots`; D6 | a band; a miss direction | none |
| `schedule` | days as the calendar's tile, each event with time, place, replies in and class conflicts | `get_schedule`; D9 | an event | the event on the Calendar; the Calendar |
| `qualifier_board` | place, player, each round, total, to par, with the cut drawn between the last seat and the first player outside it | `get_qualifiers`, `get_tournaments`; D10 | a player's qualifier | the player's rounds; the board |
| `practice_plan` | a plan as a run sheet; the questions asked before one is drafted | `data-practice-plan`, `data-brief`, `get_practice`; B1, B2 | the plan card's own asks | the plan card's own |
| `document` | a long piece kept beside the chat; a draft handed to Messages | `data-artifact`, `data-handoff`; B3 to B6 | none (it is a draft to send or publish) | where it is going |
| `app_link` | a way into a screen of the app | `data-app-link`; D14 | none | the screen |
| `note` | one sentence about a visual, said as what it is (Measured, Pattern, Hypothesis); a note the coach asked to keep; what is on record | composition `note`; `data-coach-note`; `get_coachhelm`, `get_reference`; C; D11 | a row of what is on record | none |
| `action_preview` | what a task will do, to check, edit, confirm or dismiss | `data-action-proposal`; all of A | rows that can be changed ask for the change | none until saved |
| `receipt` | what a task did, with the way to the thing it made | `data-action-receipt` | none | the thing it made |
| `table` | rows and columns with a caption that names the source: the fallback, always available | composition `table` (planned); `data-evidence`; `query_team_data`, `summarise_data`, `find_thread`; D8, D12; anything unknown | none yet | none |

`action_preview` and `receipt` are two kinds on the shared list and one object
on screen: the same body in its next
tense, so a receipt is the preview the coach confirmed, never a second card.
`round`, `schedule` and
`qualifier_board` are new here; the rest reuse the thread's own drawing
(`Trend`, the distance marks, `PlanCard`,
`DataTable`) so a composed visual and a plain read look the same.

**Proposed to the plans worker, not yet in the shared list** (the registry
follows the list as it stands): merge
`action_preview` and `receipt` into one kind `action`; give "what is on record"
its own kind instead of sharing
`note`; stop offering the model a bare `note` block and fold `headline` into
`kpis` (one figure is `kpis` of one).

### S.2 Tappable elements, the link, and the touch feedback

- **A tap asks; it never sends.** The element is a real button. It fills the
  composer with a question about that
  element ("Ask about this: hole 7, 2 over") which the coach can edit, and
  carries a typed reference: the kind, the
  read and the element (`data-ask-ref="round:r5:hole:7"`, and the `StudioAsk`
  object handed to `onAsk`).
- **The row asks; the arrow opens.** Where the element is something the app has
  a screen for, a separate arrow at
  the row's end goes there, with its own 44px target and its own name ("Open Eli
  Brandt’s stats"). One target never
  does both.
- **It looks tappable only where it is.** With no `onAsk` (a printed answer, a
  thread that cannot be continued) the
  same content is drawn as plain text: no button, no pressed state, no reference.
- **Feedback** is the app's own pressed wash on the row (`data-ch-pressed`,
  lib/press.ts): rows do not scale. On a
  pointer device the row takes the quiet well on hover. Focus is the app's ring.
  Nothing else moves; the composer
  filling is the answer to the tap.
- **A comparison's cells are read, not pressed.** Twelve players across four
  measures would be forty-eight keys; the
  player's name is the key and the cell is a figure.

### S.3 Sizes

`full` and `compact` are the same component, never two designs. What changes in
`compact`: a ranking's bar drops
under the name; a comparison always puts players in rows under short measure
names, keeps every measure on screen where four fit, and drops the arrow per row
(the name still asks; the link is in the full size); a
qualifier board keeps place, name, total and to par and leaves the rounds to the
board itself; a round names three
holes each way instead of four; a figure set wraps to two across.

### S.4 Copy

Sentence case. A sample is said in words, from the read: "over 4 rounds", "from
126 attempts" (`sampleSaid`). Never
"n=", never "N-4", never a count alone in brackets, no abbreviation a coach
would not say. A missing figure in a
comparison reads "None". A test renders every component in both sizes and fails
on any of those forms, in text or in
a screen reader's label.

---

## W. The workspace: the step each capability shows

The activity island (SPEC Moment 4; `chat/island/**`, the chat UI lead's) shows
what CoachHelm is doing as steps.
This is the catalogue of those steps: for each thing the assistant can do, its
words while it runs and once it is
done, what joins its row, what its tally counts, what opening the finished step
shows, and its words when it fails.
A person's words, never a tool's name. "Opening" a finished step shows the read
as its studio component (S.1); a
step with nothing of its own to open does not look openable.

The island's head lines are the lead's: "Reading your question", then the
running step's own words (with "and 2
more"), "Putting it together", "Writing the answer", "Waiting for you", "Saves
in 5", "Saved" / "Undone" / "Not
saved", "Done · 4 steps · 6s", "Stopped · 2 of 4 steps". A failed step never
stops the turn by itself: the answer
says what it lacks.

### W.1 Reads

| Capability | While it runs | Done | Joins the row | Tally | Opening it shows | Failed |
| --- | --- | --- | --- | --- | --- | --- |
| A player's statistics (`get_player_stats`) | Reading Jonah’s statistics | Read Jonah’s statistics | the player; a second and third player as they are read | rounds ("8 rounds and counting") | `figure`, or `comparison` for several players | Couldn’t read Jonah’s statistics |
| The team's statistics (`get_team_stats`) | Reading the team’s statistics | Read the team’s statistics | the team, then each player as their figures arrive | players ("12 players") | `ranking`, or `strokes_gained` by part of the game | Couldn’t read the team’s statistics |
| Rounds (`get_rounds`) | Reading the rounds | Read the rounds | each round as it is found (course and day) | rounds | `round` for one, `table` for a list | Couldn’t read the rounds |
| One round (`get_round`) | Reading the round hole by hole | Read the round hole by hole | the round | holes ("18 holes") | `round` | Couldn’t read that round |
| Logged shots (`get_shots`) | Reading the logged shots | Read the logged shots | the player | shots ("212 shots and counting") | `distance_profile` | Couldn’t read the logged shots |
| The season (`get_season`) | Reading the season | Read the season | the team | rounds | `figure`; `trend` for this season against last | Couldn’t read the season |
| Qualifiers (`get_qualifiers`) | Reading the qualifier | Read the qualifier | the qualifier, then players | players | `qualifier_board` | Couldn’t read the qualifier |
| Tournaments (`get_tournaments`) | Reading the tournaments | Read the tournaments | each tournament | tournaments | `qualifier_board` for one field, `table` for a list | Couldn’t read the tournaments |
| The schedule (`get_schedule`) | Reading the calendar | Read the calendar | each event as it is found | events | `schedule` | Couldn’t read the calendar |
| What CoachHelm has on record (`get_coachhelm`) | Reading what is on record | Read what is on record | the player it is about | reads, goals and tasks, as one count of items | `note` (what is on record) | Couldn’t read what is on record |
| Practice (`get_practice`) | Reading practice reviews | Read practice reviews | each plan | plans | `practice_plan`, or `table` | Couldn’t read practice reviews |
| Reference (`get_reference`) | Looking it up | Looked it up | none | none | `note` | Couldn’t look that up |
| Team data (`query_team_data`, `summarise_data`) | Reading the team’s records | Read the team’s records | none | rows | `table` | Couldn’t read the team’s records |
| A thread (`find_thread`) | Finding the thread | Found the thread | the thread by name | none | `table` | Couldn’t find that thread |
| A place in the app (`find_in_app`) | Finding where that is | Found where that is | none | none | `app_link` | Couldn’t find where that is |

### W.2 Comparing, calculating, drawing

| Capability | While it runs | Done | Joins the row | Tally | Opening it shows | Failed |
| --- | --- | --- | --- | --- | --- | --- |
| Ranking or comparing players | Comparing strokes gained by player | Compared strokes gained by player | the players compared | players and measures ("12 players, 4 measures") | `ranking` or `comparison` | Couldn’t compare them |
| A calculation across the team (code) | Working it out across the team | Worked it out across the team | none of its own: its reads are nested under it, each with its faces | what it covered ("12 of 12 players") | "How this was worked out" (D15): the method in one sentence, what was read, the result as a `table` | Couldn’t work it out |
| Arithmetic over rows already read | Working out the figures | Worked out the figures | none | none | the read it worked from | Couldn’t work out the figures |
| A visual (`show_visual`) | Drawing the comparison (named for what it draws: "Drawing the trend", "Drawing the round") | Drew the comparison | none | what it draws ("12 players across 4 measures") | the visual itself, in place under the answer | Couldn’t draw it; the figures are in the answer |

### W.3 Drafts (a card arrives; nothing is written)

| Capability | While it runs | Done | Joins the row | Tally | Opening it shows | Failed |
| --- | --- | --- | --- | --- | --- | --- |
| The practice brief (`ask_practice_brief`) | Working out what to ask | Has questions for you | none | questions | the brief card | Couldn’t prepare the questions |
| A practice plan (`draft_practice_plan`) | Drafting the plan | Drafted the plan | the plan by name | blocks ("5 blocks and counting") | `practice_plan` | Couldn’t draft the plan |
| A document (`write_artifact`) | Writing it up | Wrote it up | the document by title | none | `document` | Couldn’t write it up |
| A message, a poll, a board (`draft_message`, `draft_poll`, `draft_board`) | Drafting the message / the poll / the board | Drafted the message / the poll / the board | the players or the thread it is for | none | `document` (the hand-off) | Couldn’t draft it |
| A note kept (`save_note`, `remove_note`) | Saving that note / Removing that note | Noted / Removed | none | none | `note` (the chip) | Couldn’t save that note |

### W.4 Tasks (a card arrives; the coach decides)

Every task's step is the same three beats. The words are the catalogue's
(`cardCopy`), so the island, the card and
the receipt cannot disagree.

| Beat | While it runs | Done | Joins the row | Opening it shows | Failed |
| --- | --- | --- | --- | --- | --- |
| Preparing | "Preparing the event" (the thing by its name: the trip, the qualifier, the reminder, the lineup, the change) | "Prepared the event" | the thing by name; the players it names | the card (`action_preview`) | "Couldn’t prepare the event"; no card is shown and the answer says why |
| Checking | "Checking who it reaches" (only for a task that sends) | "Reaches 6 players" | the recipients, joining as they are resolved | the card's reach row | "Couldn’t check who it reaches"; the card says "The plan does not name them" |
| Waiting, then the decision | the island's head: "Waiting for you", then "Saves in 5" | the capability's badge word ("Added", "Sent", "Published") or "Undone" | none | the receipt (`receipt`) | "Not saved" / "Not sent", with what was left untouched on the card |

Several tasks in one answer are several Preparing steps, one per card, then one
"Waiting for you".

### W.5 Where to watch it

`/clubhouse-preview/coachhelm-capabilities?task=workspace:team&play=1` plays a
whole-team comparison (twelve players
joining as their rounds are read, the tally counting to 96 rounds, the
comparison drawn under it), and
`?task=workspace:plan&play=1` a practice plan being drafted, both at real timing
on the lead's `ActivityIsland`
(`&state=3` holds a still frame three seconds in). The steps are the plate's
script in the engine's step shape; the
lead's Ask preview plays the same kind of turn through the whole thread.

---

## Requests to the engine (not built here; nothing is faked in the UI)

A coach could not check these when the catalogue was first written because the
plan did not carry them. Each names
the field wanted. **Status, 11 Nov:** the protocol now has a field for E-1, E-2,
E-6, E-12, E-13, E-18 to E-20, E-23
to E-27 (0.10 says which field answers which); the bodies draw each when a plan
carries it. The rest (E-3 to E-5, E-7
to E-11, E-14 to E-17, E-21, E-22) are facts a planner still has to add, and
their cards keep the honest line until
then.

| # | Tool | What is missing | Field wanted |
| --- | --- | --- | --- |
| E-1 | `create_event`, `create_qualifier` (every flow in `create-tools.ts`) | The invited players only as one comma-joined string; `affects` is empty | `affects: [{ kind: 'player', id, label }]` from every flow that names players |
| E-2 | `create_event`, `create_recurring_practice`, `create_qualifier`, `create_goal`, `create_focus_area`, `create_task` | The channel is named ("a push and an email") but not the words a player receives | `delivery: { channels: string[]; title: string; body: string }` built by the same code that sends, as `send_event_reminder` does |
| E-3 | `create_event` | `notes` is written as the event's description and is not on the card | a `Notes` fact |
| E-4 | `create_recurring_practice` | The end time is written and not shown; no `visual`, so quick chat cannot draw the dates | an `Ends` fact; `visual: { kind: 'series', title, dates: string[], start, end, where }` |
| E-5 | `add_blocked_time` | `end_date` is written and not shown | `When` to carry the range |
| E-6 | `add_team_break` | Whether players see a break | `visible_to: 'coaches' \| 'team'` on the proposal (wanted on every task) |
| E-7 | `save_team_term` | Whether it replaces a term of the same name | a `Replaces` fact when it does |
| E-8 | `create_trip` | Flight info, hotel address, hotel phone, the confirmation number itself and notes are written and not shown | one fact each |
| E-9 | `create_qualifier` | Description and end date are written and not shown; the entry deadline is only in `visual` | facts |
| E-10 | `create_goal` | No baseline, no unit, no direction: a target of 1.2 cannot be judged | `visual.goal` to gain `current: number \| null`, `unit`, `better: 'up' \| 'down'` |
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
| E-25 | the loop | Nothing says a calculation ran, what it covered or how | a `read_started` / `read_finished` pair for the code step with label "Working it out across the team" and a detail; a part `data-computed: { id, method: string, players: number, reads: number, window: string \| null, table?: { columns, rows } }` |
| E-26 | readers | "Not tracked" is prose only | `coverage: 'not_tracked'` with `coverage_note` and `nearest: string[]` on the envelope |
| E-27 | every task | After Undo the stored receipt is still `held` (CONTRACT_NOTES E5) | a `cancelled` receipt status, so a restored card is Undone without asking the ledger |

Asked for by the studio and the workspace (section S and W):

| # | Of | What is missing | Wanted |
| --- | --- | --- | --- |
| E-30 | the request | A tap on an element fills the composer with words only; the reference does not travel | `message.reference?: { kind, read, key }` on the send, so "ask about this" is answered from the same read and element, not from the words |
| E-31 | `get_schedule`, `get_qualifiers`, `get_round` | The studio's `schedule`, `qualifier_board` and `round` are built and drawn from fixtures; there is no adapter from these reads' `detail` yet | each read's `detail` in a stated shape (days with events, replies and conflicts; rows with rounds, total, to par and the seat count; holes with par and score), or the adapter written against today's shape |
| E-32 | `show_visual` | No `table` block (planned, PLANS P12) | the block, drawn by the studio's `table` |
| E-33 | every tool's progress | The words in W are a catalogue, not yet the server's strings | `label` and `done` per tool as W.1 to W.4 give them, with `kind`, `subjects` and `count` where the table says something joins or is counted |
| E-34 | every element with a home | Links are built here from ids (`playerStatsHref`); an event, a round and a board have no address on the part | `href` on the row, from the app map, never from model text |

The shell's side of the seam is settled (see "The seam, as it stands").

## Defaults taken (nobody to ask; change here if wrong)

1. Reach comes first in every body, above the subject. SPEC lists "who" first;
   this makes "who" also say how far it
   travels.
2. Sent words are clamped at six lines with the character count, not shown whole
   by default. A 2,000 character
   announcement shown whole pushes Confirm two screens down on a phone; the
   count and one tap keep it honest.
3. A body never reads `proposal.input`.
4. Where the plan lacks the words a player receives, the card says "The exact
   wording is not shown here." rather
   than drawing a notification from the title.
5. `create_focus_area`'s badge is "Proposed", from the receipt, not "Assigned".
6. `add_team_break`, `save_team_term`, `set_lineup` use the plan's own "Nobody
   is told." with the neutral mark until
   E-6 says who can see them.
7. `lock_lineup` puts its warning first and has no hold states.
8. Dates in facts arrive as ISO (`2026-11-12`); bodies print them as "Thu, Nov
   12" through `lib/dates`, the way the
   planners that already write words do. Never raw.
9. The gallery drives bodies from fixtures of the real `ActionProposal` and
   `ActionReceipt` types inside a stand-in
   frame until the lead's shell exports; the stand-in is labelled in the gallery.
10. Group D forms D1 to D12 reuse the lead's `Evidence.tsx` blocks in the
    gallery; this lane adds only what does
    not exist (D14 row, D15, D16, the note chip).

## What is built, and how to see it

- **Task cards.** `cards/index.tsx`: `CardBody` (32 bodies: 22 of their own and
  the plan-driven one for A23 to
  A32), `cardCopy` and `CARD_TOOLS` from `catalog.ts`, `ApproveAll` and
  `batchPlan`. `cards/edit.tsx`: edit mode.
  `cards/truth.ts`: what the plan itself says. `cards/drafts.tsx`: `BriefBody`,
  `HandoffBody` (message, poll, board),
  `DocBody`. `cards/answers.tsx`: `AppLinkRow`, `CoachNoteChip`, `WorkedOut`,
  `NotTracked`. `cards/work-words.ts`:
  section F as data.
- **The studio.** `studio/registry.tsx` (`Studio`, `STUDIO_COMPONENTS`),
  `studio/components.tsx` (the sixteen),
  `studio/from.ts` (`fromBlock`, `fromEvidence`, `tableOf`, `sampleSaid`),
  `studio/ask.tsx` (the ask key, the open
  arrow, `fillComposer`).
- **The gallery, one page:** `/clubhouse-preview/coachhelm-capabilities`. No
  sign-in, no request, no model call.
  On a desktop everything is drawn twice, as Ask draws it and as quick chat
  does; on a phone a switch chooses.
  - **A. Tasks.** Each has a state switch, a case switch (long text, one
    recipient, forty, something missing, the
    card as it was before the server built its fields) and **Play**, which runs
    Confirm, the request, the 8 seconds
    and the save at real timing; Play with Undo presses Undo at 3 seconds. A
    card whose plan declares fields has
    Edit, with a switch that makes the stand-in server refuse.
  - **Several at once.** Four cards and the approve-all bar; Play runs the batch
    through its one Undo window.
  - **B, C, D, F.** Drafts, notes, evidence, the work line.
  - **S. The studio.** Every component in both sizes; tap an element and the
    line under it says what the composer
    would be filled with and the reference.
  - **W. The workspace.** Two long pieces of work at real timing on the lead's island.
- **Deep links, for a capture.** `?task=<id>&state=<state>&density=full|compact&variant=<case>&play=1|undo`.
  - A task: `task=<tool>`; states `proposed`, `confirming`, `held`, `undoing`,
    `committing`, `saved`, `partial`,
    `undone`, `cancelled`, `superseded`, `failed`, `expired`. Cases: `older` on
    every task with server-built fields;
    `create_event` quiet; `create_recurring_practice` missing; `create_trip`
    bare; `create_focus_area` missing;
    `create_task` one, forty; `create_team_announcement` long, one;
    `send_event_reminder` one, forty.
  - Several cards: `task=batch`, states `waiting`, `confirming`, `held`,
    `saved`, `undone`, `stopped`.
  - A studio component: `task=studio:<id>`, ids `figure`, `figure_six`,
    `comparison`, `ranking`, `trend`, `round`,
    `strokes_gained`, `distance_profile`, `distance_putts`, `schedule`,
    `qualifier_board`, `practice_plan`,
    `practice_brief`, `document`, `handoff`, `app_link`, `note`, `note_kept`,
    `on_record`, `action_preview`,
    `receipt`, `table`, `unknown`.
  - The workspace: `task=workspace:team` or `task=workspace:plan`; `play=1`
    plays it, `state=<seconds>` holds a
    still frame.
  - The other forms by id: `ask_practice_brief`, `draft_practice_plan`,
    `write_artifact`, `draft_message`,
    `draft_poll`, `draft_board`, `save_note`, `save_note_long`, `remove_note`,
    `ev-figure`, `ev-ranking`, `ev-trend`,
    `ev-bands`, `ev-legs`, `ev-empty`, `ev-failed`, `app_link`, `computed`,
    `not_tracked`, `work_line`, `work_words`.

## The seam, as it stands

The seam in 0.1 is live. The chat UI lead's shell, `chat/parts/TaskCard.tsx`,
takes its head, button, busy word,
badge and lines from `cardCopy` and mounts `CardBody` with the stored plan, the
receipt, the phase and the density.
In Ask and in quick chat a task card is that shell around these bodies.

- **Sent to the lead, not yet wired in the shell:** the four edit props (0.8),
  `cardCopy(...).dismiss` for the quiet
  key, `isOutOfDate(receipt)` (no Try again), and `ApproveAll` (0.9), which the
  shell places in the turn.
- **The gallery still draws a stand-in frame** (`PreviewChatCapabilities.tsx`,
  the `ch-akg-*` rules), built to SPEC
  Moment 7, because the real shell's receipt row asks
  `/api/coachhelm/v3/chat/actions/<key>` for the hold's outcome
  and for Undo, and the gallery must make no request. Next step, in order: mount
  `TaskCard` through the lead's
  scripted harness when it has a task script, then delete the stand-in.
- **One thing to settle with the lead.** The shell still prints SPEC's "On
  confirm:" line under the body. With reach
  first in every body, and now with the plan's own recipients and words in it,
  the line says the same thing a second
  time. Recommendation: drop it and keep the hold sentence beside the ring (`cardCopy(...).hold(seconds)`).
- **The studio is not mounted in the thread yet.**
  `chat/visual/CoachComposition.tsx` and `chat/Evidence.tsx` (the
  lead's) still draw blocks and evidence themselves. The hand-over is one line
  per block:
  `<Studio part={fromBlock(block)} size={…} read={ref} onAsk={fillComposer} />`,
  and the same with `fromEvidence`.
  Until then the studio is seen in the gallery, and the thread's ranking and
  comparison are not tappable.

## Below the bar, said plainly

1. **The gallery's frame is a stand-in** (the app's is the real shell). In the
   gallery the ring does not become the
   check (MO-7-9), the receipt does not take the buttons' place by a cross-fade
   (MO-7-5), and nothing arrives
   (MO-7-1). The gallery shows states and timing, not choreography, until it
   mounts the shell through the harness.
   The owner's bar ("one continuous object, never a swap of boxes") is met by
   the bodies (one body through every
   tense, a receipt that is the preview) and is **not yet shown** by the
   gallery's frame.
2. **The studio's components do not arrive with motion of their own**, by rule
   (a component has none; the entrance
   is the composition's beats, the lead's). Standing alone in the gallery they
   appear whole. A ranking's bars do not
   grow and a board's cut is not drawn in. If the benchmark wants that, it is a
   named request to the lead's motion
   vocabulary (bars by `scaleX` on the playbook's stagger, the cut as an opacity
   beat after the rows), not something
   to add here ad hoc.
3. **`schedule`, `qualifier_board` and `round` are drawn from fixtures.** There
   is no adapter from the real reads'
   `detail` yet (E-31), so in the thread those reads still fall to the table.
   They are the three components that
   most show the assistant understands the thing itself, and they are the three
   not yet fed by real data.
4. **The typed reference does not travel.** A tap fills the composer with words;
   the engine does not yet take the
   reference (E-30), so the answer is found from the words.
5. **A trend's points and a comparison's cells are not keys.** The trend asks as
   a whole (the chart is the lead's
   component, not edited here); a comparison asks by player.
6. **Edit mode in the gallery re-plans by standing in for the server**: it
   changes the field's own row, not the
   reach or the words a player receives, which the real server plans again. It
   is labelled there. The real
   round trip is only as good as each planner's `revise`.
7. **Approve all is a bar and a rule, not yet placed in a turn.** The shell has
   not mounted it; the gallery shows it
   under four cards with every state and Play.
8. **A poll draft is drawn in the poll's shape, not by Messages' own
   `PollCard`**, which needs the whole Messages
   api object to mount. Wanted from the Messages owner: a presentational face of
   the poll.
9. **An event is not shown in its week.** A body may not fetch. Wanted: the
   day's other events on the plan
   (`visual.cal.day`), then the grid can come back with no request.
10. **The drill, the task and the trip are drawn like their homes, not with
    their homes' components.** The plan
    draft is the practice lane's real `PlanCard`; a round is the app's real `Nine`.
11. **Cards still say "the plan does not…"** wherever a planner has not added
    the fact (the requests still open
    above). Honest, and not premium.
12. **The scorecard primitive's column head reads "Tot"**, an abbreviation the
    copy rule forbids. It is the shared
    `Nine` (not this lane's to edit); wanted: "Total".
13. **A declined answer (D17) has no plate in this gallery**: it is the shell's
    to draw and is in the lead's Ask
    preview (`coachhelm-ask?state=play&script=declined`).
14. **VoiceOver was checked by structure and by test** (a group's name is the
    reach sentence, every key has a name,
    the arrow is named for where it goes, nothing looks tappable where it is
    not), **not by listening on a phone.**
15. **Not checked on an iPhone.** WebKit captures only.
