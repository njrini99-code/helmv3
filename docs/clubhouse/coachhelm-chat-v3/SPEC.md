# CoachHelm chat v3: what the coach sees (10 Nov 2026)

The states and content of every moment of a CoachHelm turn, in Ask (the full screen) and in quick chat (over any
page), on the engine rebuilt on 10 Nov (`useCoachHelmChat`, `engine/protocol.ts`). `MOTION.md` beside this file is
every movement. Where the approved design pages and the engine's real behaviour disagree, the engine wins; each such
place is listed in "Where this departs from the design pages" with what is built instead.

Read with: `design-refresh/coachhelm/AGENT_KIT.md` (the kit), `design-refresh/ask/05..08`,
`design-refresh/coachhelm/05..08` (quick chat), `docs/clubhouse/messages-v2/MOTION.md` (the nearest relative).

IDs: a state is `ST-<moment>.<name>`; a motion is `MO-<moment>-<n>` (MOTION.md). Old IDs (`S-ASK.*`, `M-ASK-*`,
`M-OPEN` and the rest of the quick chat table) are quoted where a v3 row keeps or replaces one.

## The five ideas everything else follows

1. **The question takes the top of the page.** When the coach sends, their question rises to the top of the thread
   and the screen under it is clear. The answer writes down that open page. Nothing already on screen moves again:
   not when reads start, not when they fold, not when a chart lands, not while text streams. (Rule P, below.)
2. **What is written stays put.** The thread never scrolls itself to chase streaming text. A fast model writes
   faster than a person reads; a thread that follows the newest word pulls the sentence out from under the reader.
   When the answer runs past the bottom of the screen the coach is told there is more ("Latest" key with the live
   dot) and goes there when they are ready. The thread follows the newest words only when the coach has scrolled to
   the live edge themselves.
3. **The mark is the instrument.** CoachHelm's wheel turns while it works and comes to rest at a spoke when it is
   done. One sign means "this is still happening": the live dot (a breathing accent dot). It is the dot on a running
   read, the dot after the last word while the next is pending, and the dot on the Latest key. There is no spinner
   anywhere and no second vocabulary.
4. **Say only what is known, and only when it will be read.** Nothing appears that will be gone in under 300 ms.
   Nothing claims more than the browser knows: before the server answers there is the turning mark and no words;
   "Reading your question" is said only once the server has started the turn (never a bare "Thinking"); a read is named with the server's own words; a
   held write says "not saved yet" until it is saved.
5. **Things come from somewhere and go somewhere.** The question comes out of the thing the coach touched (the
   field, a start, a follow-up). The reads fold into the line that summarises them. The countdown ring becomes the
   check. The draft goes to the row where it will live. The failed turn keeps what arrived and holds its own way
   back.

## Rule P: the page (shared by Ask and quick chat)

- A **page** is one question and everything that answers it (the assistant turn, its cards, its follow-ups), until
  the next question.
- The **last page** has a minimum height of the thread's visible height (the scroller's client height less its top
  inset). So a short answer leaves open space under it instead of pulling the previous turn back into view, and a
  growing answer grows into space that already exists.
- **On send** the thread's scroll position is set so the new question sits at the top (top inset: 12px under the
  header; on the phone under the scope line). Earlier pages are above, one scroll away.
- **While the answer arrives** the thread does not scroll. If the coach is at the live edge (within 24px of the
  bottom of the content, after scrolling there themselves) it follows the newest line; otherwise it stays.
- **Latest key** (`ST-5.more`): shown when content exists below the fold. While the turn is live it carries the live
  dot; when the turn has ended it is the plain arrow. Tap: glide to the bottom, then follow.
- **Opening a saved thread** shows the bottom of its last page (the newest words), as today.
- A thread that fits on one screen has one page and never scrolls.

## Surfaces and viewers

| | Ask (coach) | Ask (player) | Quick chat (coach) |
| --- | --- | --- | --- |
| Where | CoachHelm > Ask, phone and desktop | CoachHelm > Ask, behind `coachhelm_player_ask_v1` | The CoachHelm key in the top bar, over any page |
| Reads | team data | their own rounds and shots only | team data |
| Tasks | yes, confirm-gated | never | yes, confirm-gated; the page behind is the proof |
| History | rail (desktop), drawer (phone) | none | "Earlier today" in the panel; full history in Ask |
| Thread pieces | the shared set below | the shared set, minus cards | the shared set at compact size |

**The shared thread pieces** (owned by the Ask lane, used by both surfaces; the quick chat worker imports them and
never forks them): question bubble, assistant turn (mark, name, work line), read list, streamed prose, evidence chip,
visual frame, task card, receipt, turn notice (stopped or failed), follow-ups, Latest key.

---

## Moment 1. Summoning quick chat, and dismissing it (QUICK-CHAT builds)

Kept from the approved page: a frosted panel that pours out of the CoachHelm key. v3 changes the content it opens on
and adds the context chip. Geometry and springs stay as `design-refresh/coachhelm/07-MOTION.md` (M-KEY-press, M-OPEN,
M-CLOSE, M-RETARGET, M-SCRIM, M-CONTENT, M-LIVE).

| State | What is on screen |
| --- | --- |
| `ST-1.closed` | The key in the top bar. Nothing else. |
| `ST-1.opening` | Panel between the key and its rest frame; scrim rising to 24% (`underlay`), page behind still readable and still live (it is not `inert` until the panel rests). |
| `ST-1.open.empty` | Header: "CoachHelm" and "Open in Ask". Context chip (below). Starts for this screen. Composer, focused. |
| `ST-1.open.thread` | Same header; today's thread at its last page; composer. |
| `ST-1.closing` | The reverse of opening from wherever it is. Focus returns to the key. |
| `ST-1.live` | Closed while a turn or a hold is running: the key becomes the live pill ("Reading…", "Saves in 5", "Added"). |

- **Context chip** (`ST-1.context`): one removable chip above the composer naming what the chat was opened on, in the
  page's own words: "Roster · Eli Brandt", "Calendar · Thu 12 Nov", "Stats · last 8 rounds". Real `Badge`-family chip
  with a remove key (44px reach). Removed, it stays removed for this conversation. No selection: the chip names the
  screen only ("Roster"). It is the visible form of what is sent (the hook's `ChatContextChip`); nothing is sent that
  the chip does not show. Wiring arrives from the engine (CONTEXT lane); until then the chip is drawn from the shell's
  route and is not sent.
- **Dismiss**: tap the scrim, drag the panel down (phone; follows the finger 1:1, releases on velocity or past 30%),
  Escape, the key again, browser Back (the panel owns one history entry). Each is the same close from the current
  frame.
- **Keyboard (iPhone)**: the panel pours into the frame it will have with the keyboard up; the composer is focused in
  the tap handler so the keyboard rises in the same motion. If the keyboard height is not yet known (first open of a
  session) the panel rests in its tall frame and rides up with `--keyboard-height` on the keyboard curve.
- **A turn in flight survives close.** Closing never stops a turn or a hold; the live pill carries it.

## Moment 2. The empty start

What Ask and quick chat offer before a word is typed. Not a menu of features: three or four starts that fit this
coach, this screen, today.

| State | Ask | Quick chat |
| --- | --- | --- |
| `ST-2.home` | Greeting by time of day and first name. One line of what it can read. "Since Monday": up to three lines from the CoachHelm board, each a start. Up to three suggested questions. Composer (desktop: in the page; phone: docked). | Starts for the screen it was opened on (Roster with a player selected: "How is Eli putting?", "Give Eli a focus area"), then the context chip and the composer. |
| `ST-2.home.nopulse` | The pulse card is absent (it failed or there is nothing since Monday); the suggestions move up. No error for a missing nicety. | n/a |
| `ST-2.home.norounds` | Suggestions that need rounds are replaced by ones that do not ("What can you do?", "Set up Thursday's practice"). | same |
| `ST-2.home.player` | "Morning, Jonah." Their own focus lines (what the coach set, what moved), three questions about their own game, the allowance meter. No team pulse, no teammates. | n/a |
| `ST-2.leaving` | First send. The start that was tapped (or the typed text) becomes the question at the top of the page; everything else on the home fades. One frame later the thread exists. | same |

- A start is a row, not a chip cloud: label on the left, what it reads on the right ("Putting · team"), one arrow.
- A start sends at once. It does not fill the field for a second tap.
- Returning to an empty Ask with a draft in the field (`drafts.ts`) shows the home and the draft.

## Moment 3. Composing and sending

| State | What is on screen |
| --- | --- |
| `ST-3.idle` | Field with its hint ("Ask about your team", player: "Ask about your game", in a thread: "Ask a follow-up"). `+` (starters), `@` (mention), send key dimmed (not hidden: the key's place never changes). |
| `ST-3.typing` | The field grows a line at a time to six lines, then scrolls inside itself. Height changes without animating. The send key is full strength from the first non-space character. The scope line above ("Reading Varsity · this season") follows the text. |
| `ST-3.mention` / `ST-3.slash` | The existing pickers (`@` players, rounds, events; `/` jobs). Unchanged. |
| `ST-3.dictating` | The mic (where the platform has one) replaces `@` while listening; the words arrive in the field as typed text. Unchanged from `useDictation`. |
| `ST-3.sent` | The field is empty in the same frame as the tap. The send key is the stop key (ink disc, rounded square) in the same frame. The question is on its way to the top of the page (Rule P). The keyboard stays up; focus stays in the field. |
| `ST-3.busy` | Stop key. The coach can type the next question; Return does not send while a turn runs (the key is Stop), and the field says so only by the key. |
| `ST-3.card-waiting` | A task card waits. The field is **open** (v3; it was blocked). Hint: "Ask, or answer the card" (short enough for the phone's field). Sending cancels the card first (the engine declines it, "Nothing was written"), and the card shows `ST-7.superseded`. |
| `ST-3.offline` | Sending is refused before anything leaves: the shell's offline toast and the text stays in the field (existing CH-1903). |
| `ST-3.paused` | Player out of allowance: the field is disabled with "Ask is paused until Monday" (existing). |
| `ST-3.failed-send` | The request never left or was refused: the question stays at the top of its page with the turn notice under it (`ST-10.*`); the text is not put back in the field (v3: the notice's Try again resends; putting it back made two places to act). |

- Send: the key, Return on a fine pointer, a start, a follow-up, a chart's "ask about this". All one path.
- The send key becomes the stop key in the frame of the tap, not when the server answers: the coach can stop a
  question that has not been answered yet, and Stop is what the key does from that instant.
- Stop: the turn ends where it is; what arrived stays (`ST-10.stopped`). The key is the send key in the same frame.

## Moment 4. Waiting and reading (send to first word, and the work after it)

Revised 10 Nov 2026 for the owner's two references (the live workspace, the activity island). Where this section and
an older line disagree, this section wins. The inline read list under the name is superseded in Ask by the island;
quick chat keeps the list until it mounts the island (`density="compact"`).

One assistant turn exists from the frame the question lands: mark and name. The times are from the tap.

| Time | Nothing from the server yet | Server started the turn, no step | One step running | Two or more steps |
| --- | --- | --- | --- | --- |
| 0 to 150 ms | The question rising. No assistant turn yet. | same | same | same |
| 150 ms | `ST-4.present`: mark (turning) and "CoachHelm". | same | same | `ST-4.island`: the island, one line |
| 600 ms after the step began | | | `ST-4.island` if it is still running; a step that finished sooner is only ever said on the turn's line | three or more, or a calculation: `ST-4.island.open` |
| 1.2 s | `ST-4.sending`: work line "Sending" | `ST-4.reading-question`: work line "Reading your question" | the turn's line names the step until the island takes over | the island speaks; the turn's line is silent |
| 6 s | "Still sending. Check your connection." | "Still working on it. Long questions take a little longer." | unchanged (a named step is its own explanation) | unchanged |
| 20 s | "No answer yet. You can stop and ask again." | same sentence | same | same |

**There is no bare "Thinking" anywhere.** Each wait says what is being done: "Sending", "Reading your question", a
step's own label, "Putting it together" (steps finished, no words yet), "Writing the answer".

### The activity island (`ST-4.island`)

Where CoachHelm's work is shown. Built in `chat/island/` (`ActivityIsland`, `useIsland`, pure model in `model.ts`).

- **Where it lives.** In chrome that already exists, so in its one-line form it covers nothing and nothing the coach
  is reading moves: the phone's scope row under the tabs (the scope line fades while the island is there and
  returns when it leaves; the row keeps one height), the desktop's conversation header, centred (the title always
  leaves the middle to it). Quick chat: its header, compact.
- **The look.** The product's feature green (`--ch-feature-bg`) with the feature inks; 32px tall, 16px corners; on
  the phone the width of the thread's column, on desktop 380px. Its own shadow (`--ch-feature-shadow`), and the
  raised shadow when open. The same plate in dark.
- **One line** (`ST-4.island`): the mark (a turning ring), what is being done right now in the step's own words
  ("Reading Jonah's strokes gained", then " and 2 more" for the others running), "1 of 3", the seconds, a chevron.
  The earliest step still running leads, so the line moves down the list and never back up.
- **Open** (`ST-4.island.open`): the steps under the line, in the order they started. Each has one of three real
  states. **Done**: closed ring with a check, the label in the past tense, what it found ("8 rounds"), how long it
  took, and a chevron when it produced a read: the row opens that read in the evidence panel (sheet on the phone)
  **while the rest continues and while the answer streams**. **Active**: turning ring, bright label, a running tally
  ("22 rounds and counting") and the faces or names it has touched so far, joining one at a time. **Waiting**: a dim
  disc, dim label; shown only when the server has said the step is coming (it queued three reads and is on the
  first). A step the server did not announce is never invented. Failed: closed amber ring with a bar, "Couldn't
  read practice reviews", the server's sentence under it. A read the model's code called sits indented under its
  calculation ("Working it out").
- **When it appears.** Two or more steps, or one step still running after 600 ms. A single quick read never raises a
  panel and takes it away: it is said on the turn's line. A resumed turn (Confirm) earns it only with new steps.
- **When it opens by itself.** Three or more steps, or a calculation, and only while the turn has no answer text:
  nothing is being read under it then. It covers the top of the thread, the question included; that is the moment
  the work is the subject. At the first word it folds to one line, in the same frame the words begin, unless the
  coach opened it themselves. The coach's tap always wins and is remembered for the turn.
- **Folded while the answer streams:** "Writing the answer · 3 of 3 · 5s". A step that starts mid-answer names
  itself there; the text does not move.
- **When the work finishes** the ring closes into a check and the line reads "Done · 3 steps · 6s" (stopped or
  failed: "Stopped · 1 of 3 steps", the ring left open). It rests 6 s, then leaves, unless the coach has it open. A
  card waiting on the coach: "Waiting for you" for the same rest.
- **The way back** is the turn's own line, which reads "3 steps · 6s" with a chevron once the island has left
  (never both at once): tapping it opens that turn's steps in the island, for any turn in the thread, and tapping
  again, pressing Escape or pressing anywhere else folds it.
- **Every change is an engine event.** A step and its state are the turn's stored `data-progress` parts, folded by
  the shared reducer; the island's model is a pure function of them, and replaying a harness script gives the same
  island twice (`island/__tests__/island.test.ts`). The only clocks are the 600 ms threshold, the 6 s rest and the
  seconds counter.
- **A computed answer** (programmatic reads, `via: 'code'`) carries no citation markers: it shows its work here
  (the calculation, its reads, "12 of 12 players") and each read opens from its row.
- VoiceOver: the line is a button ("Reading Jonah's strokes gained and 2 more, 1 of 3, collapsed"); the steps are a
  list labelled "What CoachHelm is doing", inert while folded; a polite live region says each step once as it
  finishes ("Read his last 7 rounds, 7 rounds"), never the seconds, never a restored turn's history.
- Reduce Motion: the ring does not turn (an open ring is running, a closed one with a check is done); the plate
  takes its size at once; arrivals are fades.

Harness: `?state=play&script=isl-one | isl-three | isl-team | isl-fail | isl-chart | isl-draft | isl-open`
(`&isl=<ms>` presses the island, `&islstep=<ms>` then its first openable step).

### The turn's own line

The text after the name on the turn's first row. It says the wait's words (table above) and a lone quick step's
label; it is silent while the island is on screen for its turn; afterwards it is the summary and the way back. It
never adds or removes a row: the answer's first line is under the name whatever happened before it.

## Moment 5. The answer arriving

| State | What is on screen |
| --- | --- |
| `ST-5.streaming` | Prose under the name row, arriving in bursts. New words fade in as a group per burst. Figures in tabular numerals; a figure the model set bold is bold, same size, same baseline. |
| `ST-5.pending` | No new text for 400 ms while the turn is live: the live dot sits after the last word, on the baseline, joined to that word so it never wraps alone. It goes in the frame more words arrive. |
| `ST-5.chip` | A read's chip, in the sentence where the model cited it. It arrives as a word does (same fade), is the line's height, wraps as one piece, and never starts a line on its own (it keeps the word before it). One chip per read per paragraph. |
| `ST-5.visual` | A chart or figure in its frame, complete at first paint: title, marks, foot, "Table" toggle. No skeleton, no grow (owner decision Q-153). The frame fades in; the marks are already there. |
| `ST-5.link` | A link into the app ("Open Roster requests") as a quiet row under the paragraph that names it: arrow, label, where it goes. |
| `ST-5.more` | The answer has passed the bottom of the screen: the Latest key, with the live dot while the turn is live. |
| `ST-5.settled` | The turn is done: the mark is at rest; the work line is the summary; the reads' own tables, if any, are under the prose; the foot row has "3 reads" (opens the sources) and Copy; follow-ups (at most three, each only when the reads support it) sit under the turn. |
| `ST-5.discarded` | The model withdrew the words of the step in progress (`text_discard`, rare): those words fade out in place and the next words take their position. |

- **Half-written syntax is never shown.** An unclosed `**` draws as bold in progress with no asterisks; a lone
  trailing `*` or `[`, a partial read marker (`[e`, `[e1`), a list marker with no text and a table row with no
  closing pipe are held back until they complete. A table draws when its header and rule have both arrived.
- **No lead size.** The first paragraph is the answer (the engine's instructions lead with it) and is set in body
  text like the rest. A larger lead could only be chosen once the paragraph was whole, and changing its size then
  re-wraps words the coach is already reading.
- **A read's own table or figure** (a worked-out list, a count, a ranking: the `summarise_data` mechanism, kept) is
  drawn under the answer's prose, once the turn has finished. While the answer is being written the set can still
  change (a visual may stand in for a read), and a card that came or went above the text would move it. A stored read
  from before the rebuild (no ref) stays where it was.
- **Reduce Motion**: text appears a sentence at a time with no fade; the live dot is still.
- VoiceOver: streamed text is announced a sentence at a time (on `.`, `?`, `!` or a line end, and once more when the
  turn ends), never per word. A chart is announced by its title and its table is reachable. The Latest key is
  announced once when it appears: "More below".

## Moment 6. Evidence

| State | Phone | Desktop |
| --- | --- | --- |
| `ST-6.closed` | Chips in the text; "3 reads" in the turn's foot. | same |
| `ST-6.open` | A sheet (the shared `Modal`, detent 0.62, drag to dismiss): the read's name, its window and sample ("38 rounds · Sep 1 to Sep 29"), the figures it returned as rows, its chart if it has one, its table. | The evidence panel beside the thread, same content. The thread keeps its width at 1440 and wider; below that the chats rail steps aside (existing). |
| `ST-6.open.chip` | The chip that opened it is selected (accent tint) for as long as it is open, so the figure and its source are visibly one thing. | same |
| `ST-6.switch` | Another chip tapped while open: the content swaps in place; the sheet does not close and reopen. | same |
| `ST-6.empty-read` | The read returned nothing: "No putts recorded in this window." and the window. | same |
| `ST-6.failed-read` | "This read didn't come back." No figures. | same |

- Coming back: close key, drag down, scrim, Escape. Focus returns to the chip that opened it.
- A player's evidence shows only their own reads; the panel model is built from the player's own message parts, so
  there is nothing else to show.

## Moment 7. A task, end to end

The card is the preview and the record. The prose around it never claims a write the receipt does not show.

| State | What is on screen |
| --- | --- |
| `ST-7.draft` | Arrives after the sentence that introduces it. Head: what it will become ("New event"), its one-line summary, a "Draft" badge. Body: what a coach must check, in this order: **who** (named players as avatars, or "All 7 players"), **what** (the title or text, exactly), **when** (date tile and time, or "Not set"), **what a player will see** (the notification or the post, as their phone will show it), **where it lands** (the screen and the row, with its neighbours when known). Foot: "On confirm:" and exactly what is sent ("Nothing is sent." when nothing is). Cancel and the named primary ("Add to calendar"). Whole at first paint: the engine sends the plan complete. |
| `ST-7.draft.missing` | A fact the coach must supply reads "Not set" in the row and the primary is disabled with the reason under it ("Needs a time"). Tapping the row asks for it in the composer. |
| `ST-7.waiting` | The turn's work line: "Waiting for you". The composer stays open (`ST-3.card-waiting`). |
| `ST-7.confirming` | Primary pressed: its label is the verb in progress ("Adding…") with the sweep; Cancel is gone but keeps its space. Both locked on the first tap. |
| `ST-7.hold` | The server accepted and is holding the write. Receipt row in the card: the **countdown ring** with the seconds left inside it (8 to 1), the summary, the line "Not saved yet. Saves in 8 seconds." (with people to tell: "Saves in 8 seconds, then 6 players are told."), and **Undo**. Badge: "Holding". The draft's place on its screen is shown as pending (dashed). |
| `ST-7.hold.undoing` | Undo pressed: the ring stops where it is; "Undoing…". |
| `ST-7.undone` | "Undone. Nothing was saved, and nobody was told." (or the flow's own line). Badge "Undone". The draft dims. A quiet "Put it back" re-proposes it. |
| `ST-7.committing` | The ring reached zero and the result has not come back: the ring is full and still, "Saving…". Appears only if the result takes more than 300 ms. |
| `ST-7.done` | The ring's place holds the check. Summary. "Open" (goes to the row; see Moment 8). Badge: the flow's past tense ("Added"). Under it, when people were told: "Told 6 by push". |
| `ST-7.done.partial` | Check in amber ring: what was done and what was not, each named; "Open". No Try again (a second run could double what worked). |
| `ST-7.failed` | The write did not happen. Amber ring with a bar, the reason in one sentence, "Nothing was saved." (or, when the server could not check: "Look in Calendar before trying again."), and **Try again** inside the card when a retry is safe. The draft stays readable. |
| `ST-7.cancelled` | "Cancelled. Nothing was created." Draft dimmed, buttons gone. |
| `ST-7.superseded` | The coach asked something else while it waited: "Set aside when you asked something else. Nothing was created." Same look as cancelled. |
| `ST-7.returned` | The coach came back (reload, History) and the card still waits: the draft draws at rest (no arrival), buttons live, work line "Waiting for you". If the server can no longer take the answer: `ST-7.expired`, "This draft can't be confirmed any more. Ask again and I'll prepare it." |
| `ST-7.returned.hold` | Came back inside the 8 seconds: the ring starts at the time that is left. Past it: `ST-7.done` or `ST-7.failed` from the stored receipt. |
| `ST-7.late-undo` | Undo pressed as the window closed and the server had already saved: "Too late to undo. It's saved. Open it to change it." |

- The 8 seconds are the server's (`held_until`), never a client timer: the ring and the number are drawn from the
  time left on arrival, so a slow response shows 7 or 6, not a false 8.
- The closing sentence the model writes after Confirm arrives **under** the card and may say "it will be saved at
  3:04" while the ring runs; the card, not the sentence, is the record.
- "Open" during the hold saves now and goes there (the server's `?now=1`); its label is "Save now and open".
- VoiceOver: the card is a region named by its action. On hold: "Add to calendar. Not saved yet. Undo is available
  for 8 seconds." once (the countdown is not read out each second; the Undo button's label carries the seconds left
  when focused). On done: "Added. Open." On failure: `role="alert"` with the reason.

## Moment 8. The action landing in the screen (QUICK-CHAT builds; Ask's part is "Open")

| State | What is on screen |
| --- | --- |
| `ST-8.pending` | During the hold, from quick chat: the page behind already shows where the thing will be, as a pending row (dashed outline, secondary ink, "Saving in 5"), when the page is the thing's home (the task list, the calendar day, the player's focus areas). On any other page there is no pending row. |
| `ST-8.landed` | The write is in. The panel recedes to the key (it does not close itself while the coach is typing). The pending row becomes the real row and is **marked**: accent tint behind it and a "New" tag, both fading out over the live beat. If the row is off screen the page scrolls it to the middle first. |
| `ST-8.open` | From Ask, "Open" on a receipt: the app's shared push to the thing's home, which arrives with the same marked row. |
| `ST-8.undone` | Undo: the pending row leaves; nothing else on the page changed. |
| `ST-8.elsewhere` | The coach is not on the thing's home: the receipt's "Open" is the way there. Nothing on the current page pretends. |

- The mark is one treatment for every home: the row's own background at the accent tint, never a border, ring or
  rail (banned), plus the "New" tag. It lasts `--ch-dur-live` and is gone; it does not come back on reload.
- A landed row is announced once: "Added to Tasks: Putting ladder for Eli."

## Moment 9. Coming back

| State | What is on screen |
| --- | --- |
| `ST-9.qc.today` | Quick chat reopened later the same day: the last page of today's thread, at rest, under a quiet "Earlier today" rule; the composer empty; starts are not shown (the thread is the context). A new question starts a new page in the same conversation. |
| `ST-9.qc.newday` | A new day: the empty start. Yesterday's thread is in Ask's history. |
| `ST-9.qc.live` | Reopened while a turn or hold is still running: the live turn, at its current state. |
| `ST-9.to-ask` | "Open in Ask": the panel closes into the key while Ask pushes in on the same conversation at the same scroll position. A turn in flight keeps running (the session is the same store). |
| `ST-9.ask.history` | Ask's rail (desktop) or drawer (phone): today, this week, earlier. Opening a chat dims the thread until it lands (existing view switch). |
| `ST-9.ask.restored` | A saved thread: every turn at rest. No arrival motion, no word fades, reads folded ("3 steps"), cards in their stored state (`ST-7.returned*`). |

## Moment 10. When it goes wrong

A failed turn keeps everything that arrived. The way to recover is inside the turn that failed: the **turn notice**,
the last thing in that turn, never a banner above the thread and never a toast for something the coach is looking
at. Amber, not red (red means under par and nothing else).

| State | When | Sentence (server's where it sends one) | Offer |
| --- | --- | --- | --- |
| `ST-10.offline` | The device is offline when the turn fails, or goes offline mid-answer | "You're offline. What arrived is above." | Try again, disabled until the device is back online; then enabled with "Back online." |
| `ST-10.lost` | The connection dropped: the request failed, or the stream ended without its last event | "The connection dropped before the answer finished." | Try again |
| `ST-10.model` | The model failed mid-answer (`error`, action `retry`) | the server's sentence; default "Something went wrong while answering." | Try again |
| `ST-10.declined` | The model declined. Not an error: the engine ends a COMPLETE turn marked `declined: true` in `data-turn-meta` | the turn itself, as an answer: the server's sentence under the name, no amber notice, no Try again, no sources row, follow-ups if the server sent any | none; the composer is the way on |
| `ST-10.truncated` | The answer hit its length limit | the server's sentence | none; "Ask for the rest" as a follow-up |
| `ST-10.budget` | The team's budget for the day or month is reached (429 with a reason) | the server's sentence, which names when it resets | none |
| `ST-10.off` | CoachHelm is off for the team, or this account may not use it (403) | "CoachHelm isn't turned on for this team." / "Ask CoachHelm is for coaches." | none |
| `ST-10.rate` | Too many questions in a row (429, no reason) | "Too many questions in a row. Give it a few seconds." | Try again |
| `ST-10.signed-out` | 401 | "Your session ended. Sign in again, then retry." | Try again |
| `ST-10.gone` | The conversation no longer exists (404) | "That conversation isn't available." | Start a new chat |
| `ST-10.read-failed` | One read failed and the turn went on | on the row: "Couldn't read practice reviews"; the answer says what it is missing | none on the row |
| `ST-10.stopped` | The coach pressed Stop | "Stopped." With a write neither proposed nor confirmed: "Nothing was saved." | Try again |
| `ST-10.card-retry` | A Confirm's response was lost | "That didn't reach us. Your draft is still here." on the card | Try again (the same decision; the server runs a key once) |
| `ST-10.retrying` | Try again pressed | The notice leaves; the turn restarts in place under the same question: same page, same position, mark turning. An answered key replays its stored answer; nothing is asked twice. | |

- "Nothing was changed." is added only when it is true of the turn (no receipt, no confirmed card); with a
  confirmed card and no receipt: "You confirmed an action in this answer. Check whether it was created before you
  ask again." (existing `failedAnswerChangedNothing`).
- A failure with no text at all still has a turn (mark, name, notice), so the notice is always in the same place.
- VoiceOver: the notice is `role="alert"`; its button is the next focus stop.

## Moment 11. The player's Ask

Same thread, same motion, a narrower world.

| State | What is on screen |
| --- | --- |
| `ST-11.home` | `ST-2.home.player`. |
| `ST-11.turn` | Reads named in their terms ("Reading your last 8 rounds"); prose in the encouraging voice, never a rank against a teammate; charts of their own rounds; chips for their own reads; follow-ups about their own game only (`playerFollowUps`). |
| `ST-11.drill` | A drill their coach set is shown as a quiet card they can open; Ask never writes. |
| `ST-11.out` | Allowance used: the existing out card ("You've used this week's questions"), past answers stay open, "Request more" after a confirm; composer `ST-3.paused`. |
| `ST-11.off` | Not turned on for players: the existing page, no chat. |

- Never in a player's DOM or payload: a teammate's name or figure, team rankings, "CoachHelm knows", coach history,
  task cards, coach-only reads, the tone switch. Mentions are plain text. This is enforced where the data is built
  (the player's route and loader hand none of it over), and tested in the DOM
  (`chat/parts/__tests__/player-out.test.tsx` and the new harness test).

---

## The studio: the shell's states (specified 10 Nov; NOT built yet unless a line says so)

The owner's studio direction, as the thread's shell will carry it. Card bodies are CAPABILITIES'; these are the
shell's states and they use only MOTION's vocabulary. The engine's parts exist (`data-draft`, `data-card-revision`,
`data-computed`); the shell does not draw the first two yet.

- **A draft appearing as it is written** (`ST-S.draft`, part `data-draft`). Reverses "a card arrives whole" for
  drafts only. The card's frame arrives once, at its final width, when the first field does; each field appears
  when the server sends it, in the card's own field order, the field being written carrying the live dot after its
  last word (the same sign as pending text). Nothing is staged on a timer: a field the server has not sent is not
  on screen, and there is no skeleton for it. The primary is absent until the draft is accepted and becomes the
  proposal (same part position, so the card does not move); a draft that fails keeps what it showed and says so in
  the card's amber line. The island's step ("Drafting the focus area") is the same event seen from above.
- **An edit in flight** (`ST-S.editing`, part `data-card-revision`). The coach changes a waiting card by saying so or
  by a control in the body (`onEdit`). At once: the changed field dims to 60% and carries the live dot; Confirm is
  held (not disabled-looking: it reads "Updating") so a stale card cannot be confirmed. The revision replaces the
  field in place with a quick cross-fade; a field that changed keeps a "Changed" tag for one live period
  (`--ch-dur-live`). A refused edit restores the field and says why in one line under it.
- **Several previews in one turn** (`ST-S.many`). Each card is decided on its own and keeps its own hold and Undo.
  Above the first, one row: "3 drafts to check" and **Approve all**, which exists only when every card is waiting
  and none has been edited since it was last read. It is safe by construction: it asks once ("Save all 3?" in the
  row itself, never a modal), then confirms them in order through the same request each card would make, and each
  card shows its own held ring; one Undo row offers "Undo all" for the shared hold and each card keeps its own.
  A card that fails does not stop the others and is named in the row.
- **The acknowledgement** (`ST-S.ack`). When a hold ends, the card's receipt is the record (built, Moment 7). In
  the thread nothing else is added: no toast, no second sentence. The island says "Done" if it is on screen.
- **Suggested actions** (`ST-S.suggest`; the engine's end-of-turn event and the empty start). They are the
  follow-up chips (built for follow-ups, MO-5-7): they arrive one beat after the turn settles, together, never
  while words are arriving, and never push anything (their row's space is reserved by the last page's minimum
  height). Tapping one is a prompt leaving from the thing touched (MO-3-4, built). When the next question is sent
  by any means the remaining chips fade in the frame of the send; they do not come back for an older turn.
- **Gestures as prompts** (`ST-S.askable`). Anything that can be asked about (a figure in a card, a row of a read, a
  face) carries `ch-ak-askable` and a `data-ask-ref`: on a pointer it shows the hover wash and an "Ask about this"
  tooltip; on touch a long press (500 ms, cancelled by 8px of movement, so it never fights scroll or a tap) lifts
  it one step (`scale 1.02`, press tokens) with the `select` haptic and puts "About: Jonah's approach" as a chip on
  the composer, which takes focus. Nothing is sent until the coach sends. One feedback, everywhere; no swipe
  gestures on rows (they belong to scroll and to Back).
- **Copy.** Sentence case everywhere. A sample is said in words ("8 rounds", "4 of his last 10"), never notation:
  no "N-4", no "n=8". Durations are "6s", "1m 12s". No "Thinking".

## Sizes, both viewports

| | Phone 390 | Desktop 1440 |
| --- | --- | --- |
| Thread column | page edge 16px (20px at 414 and wider) | 720px, centred in the conversation column |
| Question bubble | max 84% of the column, right | max 560px, right |
| Assistant turn | full column, flat (no card): mark 28px, name row 28px tall, prose in body size | same |
| Read rows | 32px, detail under the label | same |
| Composer | docked capsule above the home indicator and the keyboard | docked, column width |
| Evidence | sheet, detent 0.62 | panel 380px |
| Latest key | 44px disc at the column's right edge, 12px above the composer (over line ends, not over the words being read) | same |

Largest Text Size (`--ch-type-scale` 1.353): the name row wraps the work line under the name rather than
truncating; read labels wrap to two lines; chips wrap as one piece; card buttons stack (Cancel under the primary);
the ring keeps its size and the seconds stay inside it.

Light and dark: every colour is a token; the question bubble is the sent tint, the assistant turn sits on the page.

## Where this departs from the design pages (the engine's behaviour wins)

| Design page | Engine | Built instead |
| --- | --- | --- |
| The answer lands whole after the steps; steps fold when it lands | Text streams live, may start before, between or after reads | The list is open only before the first word; later reads live on the work line; the fold precedes the first word (Moment 4) |
| "Each word fades in over 320ms", one word at a time on a 26 ms ticker | Words arrive in bursts at uneven speed | Each burst fades in as a group on the same 320 ms token; no artificial ticker (a ticker would make a fast answer slow) |
| Skeleton becomes chart; bars grow from zero | A visual arrives complete; owner decision Q-153 | No skeleton; the frame fades in with its marks already drawn |
| The draft assembles as fields arrive, one every 260 ms | The proposal arrives whole | The card arrives whole. Staging data that is already here is decoration; it also delayed the Confirm button by over a second |
| The receipt shows a check and the summary during the 8 seconds | The write has not happened during the hold | The ring with the seconds, "Not saved yet"; the check is drawn only when the server says it is saved |
| The composer is blocked while a card waits | A new message cancels the card first | The composer is open; the card shows it was set aside |
| A withheld-answer card, a "checking the figures" row, a repair pass | Gone | Removed from the thread; `data-grounding-flag` parts in old stored threads still draw their note |
| The thread follows the answer while within 0.9 of a screen of the bottom | Fast model | Rule P: no self-scrolling; follow only at the live edge |
| A failed answer is a red block under the thread, and its text returns to the composer | Failures are specific and carry an action | The turn notice inside the failed turn, amber; the question stays where it is |
| Inline edit of a draft field | The server confirms exactly the stored plan | A field tap asks for the change in words; the new card replaces the old (existing) |
| The "Told" row lights up player by player | No per-recipient events | "Told 6 by push" as one fact when the receipt says so |

## Deliberately still (and why)

- **Streamed text never moves once painted.** No per-line slide, no typewriter caret, no scroll-follow. Reading is
  the task; motion under the eye is the enemy of it.
- **Charts and figures.** Drawn in place (Q-153). Only their frame fades.
- **Field height, card height, list height.** Layout never animates. A height change happens in one frame, and only
  where nothing the coach is reading sits below it, or because they tapped.
- **The seconds in the ring** change at once each second (a clock, not a count-up). Only the ring itself drains.
- **The mark** does not bounce, glow or pulse. It turns, one spoke at a time, and stops.
- **Numbers** never count up.
- **The page behind quick chat** does not blur further or scale while the coach types.
- **Follow-ups and the foot row** arrive together, not staggered: they are one thought ("here is what you can do
  next").
- **A restored thread** is entirely still.

## Defaults taken (no one to ask; change here if wrong)

1. No auto-follow past the fold (Rule P). Default chosen for a fast model; the brief's "following the text only
   while the coach has not scrolled away" is met at the live edge.
2. The read list auto-opens only before the first word; the owner's "steps stay open, then fold" is kept there.
3. No chart skeleton.
4. The card arrives whole.
5. "Open" during the hold saves now (existing server behaviour), relabelled "Save now and open".
6. A failed send keeps the question in the thread; the text is not returned to the field.
7. No haptic when an answer finishes; haptics are for the coach's own acts and for writes (MOTION.md).
8. Stop offers Try again, not "Continue" (the engine cannot resume a stopped turn).
9. The 1.2 s, 6 s and 20 s waits are constants in `chat/turn-timing.ts`, not tokens: they are thresholds, not
   durations of a motion.
10. Built so far, differing from a row above (each is listed in the build report): the home leaves at once on the
    first send (MO-2-3's fade is not built); the desktop evidence panel keeps the existing column layout (MO-6-3's
    slide is not built); a finished read's past tense ("Read…", "Checked…") is derived in the browser from the
    server's one label until the engine sends its own.

## Requests (not built here; typed stubs stand in)

Engine and protocol:

1. `read_finished.detail` for every read that has one ("38 rounds", "1,412 putts"): the event has the field; the
   contract notes say tools do not fill it yet (`progress_detail`).
2. The final receipt on the stream when a hold ends (TOOLS' note 6: wait out the hold inside the Confirm request), so
   the card needs no poll. Until then the card polls `GET /actions/[key]` as today.
3. An `error` event field `kind: 'offline' | 'lost' | 'model' | 'declined' | 'truncated' | 'budget' | 'off' | 'rate'
   | 'signed_out' | 'gone' | 'card_retry' | 'card_gone'`, so the notice is chosen by kind and not by reading the
   sentence or the HTTP status.
4. A `decision` event (approved false, `reason: 'superseded'`) on the message that holds a card when a new question
   cancels it, so `ST-7.superseded` is a fact and not inferred from position.
5. `message_start.started_at` (ISO) and a turn's stored duration, so a restored turn can say "3 steps · 2s" and a
   returned card "waiting since 3:42".
6. A `phase` event (`thinking`), or the model's own progress notes (`thinking.display: 'updates'`), so "Thinking" is
   the server's word. Until then it is inferred from `message_start` with no parts.
7. The screen context on the request body and echoed on `message_start` (`context: { screen, label }`), for the
   context chip.

8. **The island's step shape** (asked 10 Nov; the harness sends it today as `data-progress` parts, the stored part the
   reads already use, so nothing breaks before it lands). Every field is optional and additive:
   `{ label, tool, state: 'waiting' | 'active' | 'done' | 'failed', done_label?, detail?, kind?: 'read' | 'find' |
   'compare' | 'calculate' | 'visual' | 'draft' | 'check', parent_id?, subjects?: Array<{ kind: 'player' | 'team' |
   'round' | 'event' | 'qualifier' | 'tournament' | 'plan' | 'document'; id; label }>, count?: { n, unit, more },
   covers?: { n, of, unit }, evidence_ref?, started_at?, ended_at? }`. `waiting` only for a step the server has
   really queued. `subjects` and `count` may be re-sent as they grow (same part id). A player's turn sends only that
   player's own subjects. Without these the island still works from `read_started` / `read_finished`: it loses the
   faces, the tally, the waiting state and the per-step open.
9. `data-computed` (still coming): the island needs nothing more from it; the evidence panel's "How this was worked
   out" is CAPABILITIES' body.

Shared files (coordinator):

1. `ui/Button`: a `busy` state that keeps the button's width and shows the sweep (the card's primary draws its own
   capsule today).
2. A shared "marked row" treatment for a row that just landed (`ST-8.landed`): tint and "New" tag fading over
   `--ch-dur-live`, as a class in `ui.css`, so every home marks the same way.
3. No token requests. Every duration and curve used is already in `tokens.css`.
