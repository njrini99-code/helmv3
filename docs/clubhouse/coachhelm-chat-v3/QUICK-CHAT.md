# CoachHelm quick chat v3: summon, context, the empty start, the landing, coming back (10 Nov 2026)

The QUICK-CHAT worker's addendum to `SPEC.md` and `MOTION.md` beside this file, written before the build. It covers
moments 1, 2, 8 and 9. Everything inside the thread (question, work line, reads, streamed prose, chips, the task card
and its ring, the turn notice) is the lead's and is imported, never forked; this file says only how quick chat frames
it. Where this file is more specific than SPEC.md or MOTION.md on those four moments, this file is the build; where it
changes a sentence of theirs, the change is listed under "Where this refines the spec".

IDs: states keep the spec's (`ST-1.*`, `ST-2.*`, `ST-8.*`, `ST-9.*`) and add to them; a motion row that the spec
already has keeps its `MO-` id; a row that is new here is `MQ-<moment>-<n>`.

## The three ideas

1. **It comes out of the key and goes back into it.** Every way of opening starts at the key; every way of closing
   ends there, from whatever frame the panel is in. The key is also where a running turn lives while the panel is away
   (the live pill), so the coach always knows where the chat is.
2. **The page behind is the coach's place.** It keeps its scroll position, keeps updating, stays readable under a 24%
   veil, and takes no pointer, key or VoiceOver focus while the chat is open. The chat never moves it, with one
   exception that the coach caused: bringing a row they just made into view.
3. **The page is the proof.** When a task is saved and the thing lives on the page behind, the chat gets out of the
   way and the page shows it: where it will be (pending) while the write is held, then the real row, marked once.
   When it lives somewhere else, nothing on this page pretends; the receipt's Open goes there and it lands the same way.

---

## Moment 1. Summoning and dismissing

### The frame

| | Phone (the shell's phone layout) | Desktop |
| --- | --- | --- |
| Shape | A sheet hung from the bar: 8px from each side, top 6px under the bar, foot 8px above the home indicator. Radius `--ch-radius-xl`. | A panel anchored to the key: 432px wide, right edge 14px from the window's, top 6px under the bar, height `min(640px, window height - bar - 28px)`. |
| At 1440x900 | n/a | 432 x 640. It does not widen with the window: a chat column reads best at about 52 characters, and the page beside it is the point. |
| Narrow or short window | Below the shell's phone breakpoint the sheet is used. | Width `min(432px, window - 28px)`; height follows the window down to 360px. |
| Scrim | The whole page under the bar, `--ch-scrim` at 24% (`CH_UNDERLAY_SHIFT`), no blur. | The same, over the canvas and the sidebar. The bar is not veiled: the key lives there. |
| Keyboard | The sheet's frame never changes. The composer is the part that rides: it sits where the keyboard will leave it. | n/a |
| Where it comes from | `transform-origin` = the key's centre in the panel's own box (`pourOrigin`, offsets, never a rect read mid-scale). | same |

Why the phone frame is fixed and only the composer rides: a sheet whose height follows the keyboard is a layout
animation (or a one-frame jump twice per focus). A fixed sheet with a composer on a transform is one motion on the
keyboard's own curve, and the thread above it never re-flows. With the keyboard up, the sheet's foot is behind the
keyboard; nothing is lost, because the composer is the last thing in it.

### States

| State | What is on screen |
| --- | --- |
| `ST-1.closed` | The key. Nothing else. |
| `ST-1.opening` | Panel between the key and its frame; scrim rising. The page is still live: it becomes inert only when the pour has ended. |
| `ST-1.open.empty` | Header ("CoachHelm", "Open in Ask" disabled until a conversation exists, Close). Starts for this screen. Context chip. Composer, focused. On the phone the keyboard is rising or up. |
| `ST-1.open.restoring` | Opened before today's thread has been read (first open after a reload): header and composer are there and usable; the body is empty. It becomes `open.thread` or `open.empty` when the read answers. Never shown if the read answers within the content rise (120 ms). |
| `ST-1.open.thread` | Header; today's thread at the bottom of its last page; chip; composer. Desktop: composer focused. Phone: composer not focused, keyboard down (they came to read; the keyboard would cover half of it). |
| `ST-1.open.live` | Reopened while a turn or a hold runs: the live turn at its current state, drawn at rest (no replayed arrivals). Phone: keyboard down. |
| `ST-1.dragging` | Phone: the sheet is under the finger (header or grab bar). Scrim follows the travel. |
| `ST-1.closing` | The reverse from the live frame. Focus is back on the key in the frame the close starts. |
| `ST-1.live` | Closed with a turn or a hold running: the key is the live pill ("Reading…", "Needs your OK", "Saves in 5", "Added", "Didn't go through"). |
| `ST-1.blocked` | Offline: the panel opens as normal; the composer's line says "You're offline." and sending is refused (SPEC `ST-3.offline`). |

### Every way in, every way out

| Way | Opens | Closes | Notes |
| --- | --- | --- | --- |
| The key (tap, click) | yes | yes | `haptic('press')`. The key is never inert while the panel is open: everything in the bar except the key is. |
| Cmd/Ctrl+J | yes | yes | Works from a text field only when that field is the chat's own. |
| The live pill | yes | n/a | Pill shrinks into the key in the frame the pour starts (M-LIVE-out). |
| Scrim tap or click | n/a | yes | Also during `opening` (a retarget). |
| Escape | n/a | yes | In the composer with words in it: the first Escape leaves the field, the second closes (existing QC-20). In a menu or the evidence sheet: closes that first. |
| Drag (phone) | n/a | yes | On the header or the grab bar, either direction (see MO-1-5). The thread itself scrolls; it is not a drag surface. |
| Back (browser Back, the iOS edge swipe, Android back) | n/a | yes | The panel owns one history entry (same URL). Back pops it and the panel closes; the page behind does not navigate. |
| Close key in the header | n/a | yes | 44px reach. |
| A route change under it | n/a | yes | Existing rule (MOB-QC-10). The panel's history entry is not popped in this case. |
| "Open in Ask", a receipt's Open, a link in an answer | n/a | yes | The destination replaces the panel's history entry, so Back from there returns to the page, not to a ghost of the panel. |

Each close is the same move (MO-1-4) from the frame on screen. Each is interruptible by any open, and each open by any
close: the next move reads the computed transform and opacity, cancels, and continues from there. A turn or a hold in
flight survives every close.

### The page behind

- **Alive.** It keeps rendering: realtime refreshes, a landing row, the clock on Home. Nothing is paused.
- **Legible.** One flat veil at 24%; no blur, no scale, no desaturation. It does not change while the coach types.
- **In place.** Scroll position is untouched. The composer is focused with `preventScroll`; the panel is fixed, so
  iOS has nothing to pan to.
- **Inert.** From the frame the pour ends until the frame a close starts: every sibling of the key's ancestors under
  `.ch-root` except the chat itself carries `inert` ("inert others"), so pointer, Tab and VoiceOver all stay in the
  panel and on the key. The earlier build set `inert` on the phone only and left the desktop page tabbable.
- **Not locked.** No `overflow: hidden` on the body (it resets scroll on iOS): `inert` and the scrim's
  `overscroll-behavior: contain` are enough.

### Focus

| Moment | Focus goes to |
| --- | --- |
| Open, desktop | The composer. |
| Open, phone, `open.empty` | The composer, focused inside the tap handler through a field the key owns, so iOS raises the keyboard in the same gesture; focus moves to the composer when the sheet has mounted it. |
| Open, phone, `open.thread` / `open.live` | The panel itself (`tabindex="-1"`, named "CoachHelm"), so VoiceOver starts at the header and the keyboard stays down. |
| Tab | Stays in the panel; wraps at both ends; the key is one more stop after the last (it closes). |
| Close, any way but a route change | The key. |
| Close by "Open in Ask" or Open | The destination's own first focus (the route's). |

VoiceOver order: "CoachHelm, dialog"; Open in Ask; Close; the thread (or the starts as a list of buttons, each read
"How is Eli putting? Reads putting, Eli"); the context chip ("Asking about Roster, Eli Brandt. Remove"); the composer;
Send.

### The context chip (`ST-1.context`)

One chip, on its own row directly above the composer's capsule, leading edge aligned with the field's text. It is the
visible form of what goes with the question.

| Case | Chip | Sent today |
| --- | --- | --- |
| A screen and a selection (Roster with Eli open, a player's Stats, a round) | "Roster · Eli Brandt" | The player, as the hook's `ChatContextChip` (`initialContext`), as today. The screen is not sent until the CONTEXT lane wires it. |
| A screen, nothing selected (Roster, Calendar, Stats, Rounds, Qualifiers, Tournaments, Messages, Recruiting, Practice, Team) | "Roster" | Nothing yet (drawn from the shell's route). |
| A screen with nothing useful to read (Home, Settings and its pages, What's new, Account) | No chip and no row: the composer sits alone. | Nothing. |
| A long name | The label truncates in the middle of the screen part, never the name: "Tourn… · Eli Brandt". At the largest Text Size it wraps to two lines inside the chip. | |
| A turn in flight | The chip is still: it cannot be removed while a question that carried it is being answered. | |

- The label is the page's own words: the shell's crumb trail (`lookingAt`), joined by a middle dot. The sentence
  "On Roster · Eli Brandt" is the chip's accessible name ("Asking about Roster, Eli Brandt"); the visible chip leads
  with a small pin glyph instead of the word "On", so the name is not pushed off a 390pt screen.
- Real `Badge` (neutral tone) with a remove key inside it: the glyph is 16px, its reach 44px through the shared
  `::after` hit area.
- **Dropping it:** the remove key; or Backspace in an empty composer (as a token field). `haptic('select')`. The chip
  leaves by MO-1-7 and its row keeps its height until the next send, so nothing under the finger moves.
- **Removed means removed for that context in this conversation.** Opening the chat again on the same screen and
  selection shows no chip. Opening it on a different screen or player offers that one: a different thing is a
  different chip.
- Nothing is sent that the chip does not show. With no chip, the hook's context is empty.

### Storyboard

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay / stagger | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-1-1 | Key, Cmd/Ctrl+J, the pill | panel | `transform: scale`, origin the key; `opacity` | scale(.5) > none; 0 > 1 | pour 742 ms; opacity 90 ms linear | none | any close: MO-1-4 from the live frame | opacity, quick | `press` on the tap | It comes out of the key the coach pressed |
| M-CONTENT (kept) | same frame | header, body, composer row | `opacity`, `transform: translateY` | 0 > 1; 8px > 0 | release 280 ms, `--ch-ease` | 60, 90, 120 ms: the one stagger, on a tap only | a close fades each from its value; a reopen turns each around with no delay | they ride the panel's fade | none | Top to bottom is the order the panel is read in |
| MO-1-2 | same frame | scrim | `opacity` | 0 > 1 (the colour is the 24%) | smooth 462 ms | none | reverses from its value | quick | none | The page stays readable; the chat is over it, not instead of it |
| MO-1-3 | same frame, phone, `open.empty` | composer row (chip and capsule as one piece) | `transform: translateY` | keyboard height known (measured earlier this session): placed at `-cover` before the first frame, so it pours already in place. Unknown: 0 > `-cover` when the visual viewport reports the keyboard | sheet 480 ms (`--ch-dur-keyboard`, `--ch-ease-sheet`) | none | the keyboard leaving: the same curve back to 0 from the live offset | placed at once | none | The keyboard and the composer are one arrival. The thread's floor padding is set once, in the same frame, so nothing scrolls |
| MQ-1-8 | the pour ends | the page behind | `inert` on, nothing visible | | none | when MO-1-1's transform effect finishes | a close first: never applied | same | none | The page stays live while the coach could still change their mind mid-pour |
| MO-1-4 | scrim, Escape, key, Back, Close, a route change | panel; scrim; content parts | `transform: scale`; `opacity` | live > scale(.5); opacity held to 40% of the time, then > 0; scrim live > 0; parts live > 0 | panel and scrim 220 ms `--ch-ease-sheet` (`CH_MS.field`); parts 100 ms linear | none | any open: MO-1-1 from the live frame | opacity, quick | none (`press` if it was the key) | It returns to the key |
| MO-1-5 | drag on the header or grab bar (phone) | panel; scrim | `transform: translateY` (panel), `opacity` (scrim) | 1:1 with the finger from the grab point, up or down; scrim 1 > .4 across the sheet's height. Release past 30% of the height or faster than 0.5 px/ms: MO-1-4 from that frame. Otherwise back to 0 | return: settle 417 ms, started with the release velocity | none; a 10px slop before it engages, so a tap is a tap | a second pointer takes over from the live frame; a key press mid-return closes from there | follows the finger; the return is instant | `commit` when the drag closes it | Direct manipulation. Up is toward the key, where it lives; down is the way every sheet goes. Both end in the same close |
| MO-1-6 | panel opens with a context | chip | `opacity`, `transform: translateY` | 0 > 1; 6px > 0 | base 260 ms | with the composer row (M-CONTENT's third beat) | a close: fades with the row | quick | none | It belongs to the composer |
| MO-1-7 | remove key, Backspace in the empty field | chip | `opacity`, `transform: scale` | 1 > 0; 1 > .9 | quick 180 ms | none | none | quick | `select` | It leaves from where it was; its row keeps its height until the next send |
| MQ-1-9 | Back while open | as MO-1-4 | | | | | | | none | Back means "undo the last thing I opened" |
| M-LIVE, M-LIVE-out (kept) | closed with a turn or hold running; reopened | the live pill in the key's slot | `transform: scale`, `opacity` | as 07-MOTION | smooth 462 ms in; 200 ms `--ch-ease-sheet` out | label 90 ms | turns around from its held values | opacity, quick | none | The chat is still working, and this is where it is |

Not animated in this moment: the panel's size (ever), the bar, the page behind, the key's position, the composer's
height (one frame per line, SPEC `ST-3.typing`).

---

## Moment 2. The empty start, for this screen

`ST-2.home` in quick chat. Three starts on the phone (what fits above a raised keyboard at 390x844 without scrolling),
four on desktop. Each is a row: the question on the left, what it reads or makes on the right in secondary ink, one
arrow. A start sends at once.

| Opened on | Starts (label · what it does) |
| --- | --- |
| A player (Roster or Stats with a player) | "How is Eli putting?" · Putting, Eli / "What changed in Eli's last 3 rounds?" · Rounds, Eli / "Give Eli a focus area" · Makes a focus area / "Set Eli a task for this week" · Makes a task |
| Roster | "Who's slipping this month?" · Rounds, team / "Who hasn't posted a round this week?" · Rounds, team / "Add a task for the team" · Makes a task / "Message the team" · Drafts, you send |
| Calendar | "What's on this week?" · Calendar / "Add a practice" · Makes an event / "Set up Thursday's practice" · Makes a plan / "Block time for me" · Makes a block |
| Stats | "Where are we losing shots?" · Strokes gained, team / "Who's putting best?" · Putting, team / "Compare our last two events" · Rounds, team / "Who's slipping this month?" · Rounds, team |
| Rounds | "Who posted this week?" · Rounds, team / "What stands out in the latest rounds?" · Rounds, team / "Who's slipping this month?" · Rounds, team / "Add a task for the team" · Makes a task |
| Qualifiers | "Set up a qualifier" · Makes a qualifier / "Who's leading the qualifier?" · Qualifiers / "Add a practice" · Makes an event / "Message the team" · Drafts, you send |
| Tournaments | "How did we score last event?" · Rounds, team / "Who should travel?" · Rounds, team / "Add a trip" · Makes a trip / "Message the travel squad" · Drafts, you send |
| Messages | "Message the team" · Drafts, you send / "Post an announcement" · Makes an announcement / "Add a practice" · Makes an event / "Who's slipping this month?" · Rounds, team |
| Team (tasks, announcements, travel) | "Add a task for the team" · Makes a task / "Post an announcement" · Makes an announcement / "Add a trip" · Makes a trip / "What's overdue?" · Tasks |
| Recruiting | "Add a recruit" · Makes a recruit / "Who's on the board?" · Recruiting / "Add a task for me" · Makes a task / "Message the team" · Drafts, you send |
| Anywhere else (Home, Settings) | "Who's slipping this month?" · Rounds, team / "Add a practice" · Makes an event / "Message the team" · Drafts, you send / "What can you do?" · A short list |

- The player's first name is the page's (the last crumb); with no player the player rows are not offered.
- `ST-2.home.norounds`: when the session knows the team has no rounds (a fact it does not have yet; request 5), rows
  that read rounds are replaced by ones that make things. Until then the rows above are offered and the answer says
  what is missing.
- Above the starts: nothing. No greeting, no headline: the composer is focused and the keyboard is up; the starts are
  a shortcut, not a welcome.
- Below them, when a thread exists from an earlier day: nothing (it is in Ask's history; the header's Open in Ask is
  disabled until this conversation exists, and reads "Open Ask" when there is none, going to Ask's home).

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay / stagger | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MQ-2-1 | panel opens on the empty start | the starts | none of their own | they are the body: they rise with M-CONTENT's second beat, as one piece | | no stagger between rows | | | none | Four rows arriving one by one would be a performance in front of a coach who opens this ten times a day |
| MQ-2-2 | `open.restoring` resolves to no thread | the starts | `opacity` | 0 > 1 | quick 180 ms | none | a send first: they never appear | at once | none | They were held back so they could not flash before a thread replaced them |
| MO-2-2 | press on a start | the row | `transform: scale` | 1 > .97 > 1 | press 110 / 280 ms | none | release | none | `press` | The app's press |
| MO-2-3 | first send | every start except the one tapped; the chip stays | `opacity` | 1 > 0 | quick 180 ms | none | the thread replaces them when it ends | removed at once | none | The home steps back for the question |
| MO-2-4 | same frame | the question | the lead's MO-3-4, with the tapped row's label (or the field's text) as its source rect | | launch 812 ms | | | fades in place | none | The question is visibly the thing the coach touched |

Until the lead's `MO-3-4` is exported for a foreign source rect, the question arrives by the inherited M-SEND
(settle 417 ms, 10px rise): a stand-in, named in the report.

---

## Moment 8. The action landing in the screen

### The signal (one, typed, in `src/clubhouse/shell/quick-chat/landing.ts`)

A landing is a small record in memory, written by the chat and read by the page. It is never persisted: a reload has
no landing, so a mark never comes back.

```ts
export type LandingKind = 'task' | 'event' | 'blocked_time' | 'focus_area' | 'announcement' | 'message' | 'qualifier' | 'trip' | 'recruit' | 'lineup' | 'plan';
export type LandingPhase = 'held' | 'saved' | 'landed' | 'undone' | 'failed';
export interface Landing {
  key: string;            // the card's idempotency key
  kind: LandingKind;
  home: string;           // the pathname the thing lives on
  label: string;          // its title, as the card shows it
  id: string | null;      // the row's id, when the receipt carries one (request 1)
  day: string | null;     // ISO day, for things that live on a date
  phase: LandingPhase;
  heldUntil: string | null;
}
```

What a screen does with it, all of it:

1. **Stamp its rows:** `data-ch-row="<kind>:<id>"` on each row's root element. One attribute.
2. **Offer a place for the pending row:** `<LandingSlot kind="task" />` where a new row would appear (a list's head, a
   day's agenda; the calendar passes `day`). It renders nothing unless a landing of that kind is held for this page.
3. Optional: `data-ch-row-tag` on the element inside the row that may carry the "New" tag (the title line). Without
   it the row is tinted and not tagged.

Everything else (finding the row, bringing it into view, the mark, the tag, the announcement, the refresh, cleaning up)
is done by the chat, in files this lane owns. A screen that has not been stamped still gets the truth: the page
refreshes and the row is simply there; the receipt's Open still works.

### Per kind, per screen

How each home gets fresh data today is how the landing gets it: the server loader, re-read by `router.refresh()` (in a
transition, so the page on screen stays until the new one lands). Calendar, Qualifiers and Tournaments also re-read on
their own realtime channel (`*/live.ts`, debounced 800 ms); a second re-read of the same loader is harmless. Messages
keeps its own thread state and realtime, so its landing is the thread's own arrival. No second cache is introduced.

| Kind (tool) | Home | The row | Pending place | When home is the page behind | When it is not |
| --- | --- | --- | --- | --- | --- |
| task (`create_task`) | Team (`/golf/dashboard/tasks`) | the task row | head of the open tasks list | lands in place | Open travels there |
| focus area (`create_goal`) | the player's file | the focus area row on the player | head of the player's focus areas | lands in place only when that player's file is the page | Open travels to the player |
| event, practice (`create_event`, `create_recurring_practice`) | Calendar | the event in its day (first occurrence for a series) | that day's agenda or column, when the day is in the visible range | lands in place when the day is visible; otherwise treated as elsewhere | Open travels to Calendar on that day (request 2) |
| blocked time | Calendar | the block in its day | as an event | as an event | as an event |
| announcement (`create_team_announcement`) | Team (`/golf/dashboard/announcements`) | the announcement row | head of the announcements list | lands in place | Open travels there |
| message (`send_message`) | Messages, that conversation | the sent bubble | none: Messages draws its own outgoing bubble | the thread's own arrival is the landing; no mark is added | Open travels to the conversation |
| qualifier | Qualifiers | the qualifier row | head of the list | lands in place | Open travels there |
| trip | Team (`/golf/dashboard/travel`) | the trip row | head of the trips list | lands in place | Open travels there |
| recruit | Recruiting | the recruit's row or card | head of its column | lands in place | Open travels there |
| lineup | that tournament | the lineup block | none | no mark (the block is the page) | Open travels there |
| practice plan | the plan's page | n/a | none | n/a | Open travels there |

### States

| State | What is on screen |
| --- | --- |
| `ST-8.pending` | Home is the page behind and the write is held: the slot shows the thing's title and "Not saved yet · saves in 5" in secondary ink inside a dashed outline, at the place a new row would take. The seconds are the card's (the server's `held_until`). |
| `ST-8.saved-waiting` | Saved; the page's data has not come back yet. The slot stays, its line now "Saved". The dashed outline stays until the real row exists. |
| `ST-8.landed` | The real row is in the page; the slot is gone in the same frame; the row is marked (accent tint behind it, a "New" tag where the row allows one), fading over `--ch-dur-live`. |
| `ST-8.landed.unseen` | Saved while the panel stayed open (the coach was typing): the row is real and unmarked. The mark is held for up to 60 s and plays when the panel next closes. After that it is dropped. |
| `ST-8.undone` | Undo: the slot leaves. Nothing else on the page changed, and no refresh was asked for, because nothing was saved. |
| `ST-8.failed` | The write failed: the slot leaves the same way. The card in the chat holds the reason and Try again; the panel does not recede. With the panel closed, the pill says "Didn't go through" and stays until opened. |
| `ST-8.elsewhere` | Home is another page: no slot, no recede. The card's receipt names the place ("Added to Tasks") and its Open goes there. |
| `ST-8.open` | Open (from quick chat or from Ask): the shared push to the home; when the push ends the row is brought into view if needed and marked. |
| `ST-8.not-found` | The row cannot be identified on its home (no id, and no single row of that kind is new): nothing is marked and nothing is scrolled. A wrong mark is worse than none. |
| `ST-8.late` | The page's data has not shown the row 6 s after the save: one more re-read; at 12 s the slot leaves quietly. The receipt in the chat is the record. |

### The choreography, in order (home is the page behind)

1. **Confirm.** The card's button works (MO-7-4). Nothing in the page moves.
2. **Held.** The receipt row and ring arrive in the card (MO-7-5). One beat later the slot arrives in the page
   (MO-8-1). On the phone the sheet covers most of the page: the slot is there for when it leaves; on desktop it is
   visible beside the panel, under the veil.
3. **The hold.** The ring drains in the card; the slot's seconds tick with it. Closing the panel here shows the page
   with its slot and the pill "Saves in 5".
4. **Saved.** In this order, each a consequence of the one before:
   a. the card's ring becomes the check (MO-7-9), `success`;
   b. the page is asked to re-read (`router.refresh()`), and the slot's line becomes "Saved";
   c. if the slot is not comfortably in view, the page scrolls to it now, while the panel is still over it (MO-8-3);
   d. one beat after the check starts, the panel recedes into the key (MO-1-4) and the key's pill says "Added";
   e. when the real row is in the DOM the slot is hidden in the same frame (before paint) and the row is marked
      (MO-8-2). If the panel is still closing, the mark waits until it has passed half way.
5. **After.** The mark is gone in 2.8 s; the row is an ordinary row. The pill returns to the key 1.8 s after "Added".

The panel does not recede when: the composer has text; the coach focused the composer after Confirm; a new turn has
started; the thing's home is not the page behind; the write failed or was undone. It never recedes while the hold runs.

**Bringing the row into view without yanking the page (MO-8-3).** Only when no part of the row is inside the comfort
band (from 16px under the bar to 16px above the dock or the window's foot). The page moves the shortest distance that
centres the row; it moves once; it is the browser's smooth scroll and it starts before the panel leaves, so by the time
the page is uncovered it is already where it needs to be or arriving. If the coach has touched, wheeled or keyed the
page since Confirm (the panel was closed during the hold and they carried on working), the page is not scrolled at all:
the mark plays where the row is and the pill's "Added" is the way to it. Reduce Motion: the scroll is instant, and
happens before the panel fades.

### Storyboard

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay / stagger | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-8-1 | the hold begins and home is the page behind | the slot | `opacity`, `transform: scale` | 0 > 1; .98 > 1 | settle 417 ms | 1 beat after MO-7-5 | Undo or a failure: MO-8-4 from its live values | opacity, quick | none | The page shows where it will be before it is saved, in a look that cannot be mistaken for saved |
| MQ-8-6 | each second of the hold | the slot's seconds | none | a text swap | | | | same | none | A clock ticks; it does not count |
| MQ-8-7 | saved | the slot's line | `opacity` (cross) | "Not saved yet · saves in 1" > "Saved" | quick 180 ms | none | the real row arriving: the slot is hidden at once | at once | (the card's `success`) | Said where the coach will look next |
| MO-8-3 | saved, row or slot outside the comfort band, page untouched since Confirm | the page's scroll position | scroll | the shortest move that centres it | the browser's smooth scroll | in the frame of the save, before MO-1-4 | any touch, wheel or key on the page: the browser stops it | instant | none | The proof has to be on screen to be proof |
| MO-1-4 (as recede) | 1 beat after the check starts | panel, scrim | as MO-1-4 | | 220 ms `--ch-ease-sheet` | 120 ms (`BEAT_MS`) | a tap on the key or a key press: the usual retarget | opacity, quick | none | The chat gets out of the way of what it made |
| MO-8-2 | the real row is in the DOM, and the panel is closed or past half way | the row's mark: a tint layer over the row, and the tag | `opacity` | tint 0 > 1 in the first 180 ms, held to 1.2 s, > 0 at 2.8 s; tag the same | one effect of `--ch-dur-live` 2.8 s, `--ch-ease` on each segment | none | reopening the chat: the mark keeps running; a second landing on the same row restarts it from its live opacity | the same opacities (it is already opacity only) | none (not a second `success`) | The eye is led to it once, then it is an ordinary row |
| MQ-8-8 | the same frame | the slot | none | hidden in the frame the row appears (a `MutationObserver` runs before paint) | | | | same | none | Never a frame with both, never a frame with neither |
| MO-8-4 | Undo, or a failed write | the slot | `opacity`, `transform: scale` | 1 > 0; 1 > .98 | quick 180 ms | none | none | opacity | (the card's `warning` or `error`) | It leaves the way it came |
| MO-8-5 | Open on a receipt whose home is another page | the panel (MO-1-4); the route (the shared push, 462 ms smooth, the page behind at -24%); then MO-8-3 and MO-8-2 on the destination | | | | the mark starts when the push ends | Back: the shared reverse; the mark is dropped | crossfade quick, then the mark | `press` | One way of landing, wherever it started |
| MQ-8-9 | `ST-8.late` at 12 s | the slot | `opacity` | 1 > 0 | quick 180 ms | none | the row arriving first: MQ-8-8 | at once | none | It does not hang on the page as a promise |

Announced once, politely, when the row lands: "Added to Tasks: Putting ladder for Eli." Nothing is announced for a
slot.

Deliberately not built: a flight of the card from the panel to the row. On the phone the row is under the sheet for
the whole flight; on desktop it would cross the veil and the page at a size that reads as a toy. The ring becoming the
check, then the panel leaving, then the row holding the eye, is the same sentence in three true steps.

---

## Moment 9. Coming back

| State | What is on screen |
| --- | --- |
| `ST-9.qc.today` | The last page of today's thread at rest, at its bottom. Above earlier pages, where today's first question is, a quiet centred rule: "Earlier today". No starts. The composer is empty and the chip shows the screen it is opened on now. |
| `ST-9.qc.today.restored` | The same after a reload: the thread is read from the server when the key is first warmed (pointer down, focus or hover), newest conversation started today on the quick chat surface. Every turn at rest: reads folded, cards in their stored state, a held card inside its window with the ring at the time left. |
| `ST-9.qc.newday` | The empty start. Yesterday's thread is in Ask's history. The session's conversation is dropped at local midnight or on the first open of a new day, never while a turn runs. |
| `ST-9.qc.live` | The live turn where it is; the pill has shrunk into the key. |
| `ST-9.qc.unread` | A turn finished or a card started waiting while the panel was closed: the key carries its flag. Opening shows the thread at the top of that turn (the question at the top of the page, Rule P), not at the bottom, because it has not been read. |
| `ST-9.to-ask` | "Open in Ask": the panel closes into the key while Ask pushes in on the same conversation, the same store (`useQuickChatRun`), the same scroll position expressed as "the top of the last page". A turn in flight keeps running. |
| `ST-9.from-ask` | The key is hidden on CoachHelm (existing). Leaving Ask for another page and pressing the key shows the same conversation if it was started today; Ask's other threads never appear in quick chat. |
| `ST-9.restore-failed` | The read failed: the empty start, with no error. Sending starts a new conversation; the old one is in Ask. |

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay / stagger | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-9-1 | reopened the same day | the panel (MO-1-1); the thread | thread: none | at rest | | | | | | The conversation is where the coach left it; only the panel moves |
| MQ-9-4 | `open.restoring` resolves to a thread | the thread | `opacity` | 0 > 1 | quick 180 ms | none | none | at once | none | It was not here a moment ago; it does not slide, because it did not come from anywhere |
| MO-9-2 | "Open in Ask" | panel MO-1-4; Ask pushes in | the shared push | | 462 ms smooth | same frame | Back: the shared reverse; the panel stays closed | crossfade quick | `press` | The chat grows from a panel into the full screen without the thread changing under the coach |
| MQ-9-5 | the key's flag (a turn finished unseen) | the flag | `transform: scale`, `opacity` | 0 > 1 | settle 417 ms (M-KEY-flag) | when the pill has shrunk | opening: removed at once | opacity | none | Something is waiting, and this is where |

---

## Where this refines the spec

| Spec says | Built instead | Why |
| --- | --- | --- |
| MO-1-3: the panel rests where the keyboard will leave it | The sheet's frame is fixed; the composer rides | Transform only, and the thread never re-flows |
| MO-1-5: drag down | Drag in either direction | The sheet hangs from the bar; pushing it back up to the key is the gesture its shape asks for, and down is the sheet habit. Both follow the finger and end in MO-1-4 |
| `ST-1.context`: "Removed, it stays removed for this conversation" | Removed for that screen and selection in this conversation | Otherwise removing Eli once hides every later player silently |
| `ST-1.open.empty`: "Composer, focused" | Focused on desktop always; on the phone only on the empty start | A reopened thread is for reading |
| `ST-8.landed`: "scrolls it to the middle first" | Only when it is outside the comfort band, and never after the coach has touched the page | "Without yanking the page" |
| `ST-8.landed`: marked when the write is in | Marked when it can be seen (`ST-8.landed.unseen`) | A mark that plays under the sheet leads no eye anywhere |
| MOTION "Shared files 2": the mark as a class in `ui.css` | The mark is drawn by the chat on stamped rows; its two rules sit in `quick-chat.css` (loaded app-wide with the key) until the coordinator moves them | No screen file is edited by this lane |

## Defaults taken (no one to ask; change here if wrong)

1. Desktop has a scrim and an inert page (the older table had neither on desktop). The brief asks for the page to be
   inert to pointer, keyboard and VoiceOver.
2. Three starts on the phone, four on desktop; no greeting above them.
3. No chip on Home and Settings.
4. The panel recedes on save on both phone and desktop, under the conditions listed; never during the hold.
5. A mark waits up to 60 s to be seen, then is dropped.
6. Today's thread means the newest conversation started today on the quick chat surface; until the list says which
   surface a conversation came from (request 4) it is the newest started today.
7. `BEAT_MS` (120) is imported from the lead's `turn-timing.ts` when it exists; until then a constant of the same
   name and value in this lane.
8. A message's landing is Messages' own outgoing bubble; no extra mark.
9. The receipt's Open, when home is the page behind and the write is held, saves now and lands in place (no push).

## Requests

Engine and protocol:
1. `created[].id` on the final receipt (the saved row's id), so a row is found by id and not by being the one new row.
2. `created[].href` that goes to the thing, not its section (Calendar on that day, the player's file for a focus area).
3. A `lands` object on the proposal (`{ kind, home, day? }`), so the pending slot does not depend on a client map of
   tool names (`LANDING_HOMES` in `landing.ts` stands in).
4. `surface` on each row of `GET /api/coachhelm/v3/chat/conversations`.
5. Whether the team has any rounds, on the session, for `ST-2.home.norounds`.
6. The screen context on the request (SPEC request 7); the chip's `screen` half is drawn and not sent until then.

The lead (`chat-ux`):
1. The shared thread pieces at compact size, and `MO-3-4` callable with a foreign source rect (a start's label).
2. The shared task card's phase changes as a callback (`onPhase(key, 'held' | 'saved' | 'undone' | 'failed', receipt)`),
   because Undo is the card's own state and is not in the messages.
3. Ask's receipt Open calling `announceLanding(...)` from `landing.ts` before it pushes (one line).

The shell (coordinator): none needed to build; one to tidy: move the two mark rules to `ui.css`.

Other screens (one-line hooks, listed per file in the build report): `data-ch-row`, `<LandingSlot />`, optional
`data-ch-row-tag`.

## How each moment is checked

As MOTION.md's six steps, plus for these moments:
1. the pour and a landing as frame sequences at 60 fps in WebKit;
2. the interrupts: close at 140 ms into an open, open at 90 ms into that close, Escape mid-pour, Back while open, a
   drag released at 20% (returns) and at 40% (closes), Undo during the hold with the slot visible;
3. `document.getAnimations()` during the pour, the recede and the mark: `transform` and `opacity` only;
4. the page's `scrollY` before open and after close: equal, except after MO-8-3;
5. with the panel open: `document.activeElement` stays inside the panel or on the key through a full Tab cycle, and
   the canvas carries `inert`.

---

## Build notes (10 Nov 2026, after the first build)

### Where it is

| Piece | File |
| --- | --- |
| The frame: pour, scrim, inert others, focus, history entry, drag, keyboard ride, header | `src/clubhouse/shell/quick-chat/QuickChatSession.tsx`, `useQcMotion.ts` |
| The conversation: hook, starts, thread, chip, composer, the key's pill | `QuickChatThread.tsx` |
| Context and starts per screen | `starts.ts` |
| The landing signal, row finding, the comfort band, the mark | `landing.ts` |
| The pending slot | `LandingSlot.tsx` |
| The driver (re-read, bring into view, recede, hide the slot before paint, mark when seen) | `use-landing-driver.ts` |
| Thresholds and timer lengths | `qc-timing.ts` |
| Today's thread read | `earlier-today.ts` (`readTodayThread`) |
| Styles | `src/clubhouse/styles/quick-chat.css`, the block headed "Quick chat v3" |
| Preview | `src/clubhouse/preview/PreviewQuickChat.tsx`, `fixtures-quick-chat.ts` |

### Decided while building (each differs from, or adds to, the text above)

1. **The panel's history entry is popped when the close has ended**, not when it starts. A reopen inside the 220 ms of
   a close keeps the entry it had; popping at the start raced the browser's own asynchronous Back.
2. **The key's pill follows the card, not the stored receipt.** The hook's messages keep the `held` receipt after the
   write (the final one arrives by the card's own poll until SPEC request 2 lands), so "Saves in 5", "Saving…" and
   "Added" are driven from the card's phase.
3. **A landing has a `subject`** (the player's id) beside `day`, so a one-player page shows only that player's slot:
   `<LandingSlot kind="focus_area" subject={playerId} />`.
4. **The slot reads the shell's pathname from the quick chat's context**, which is the browser's in the app and the
   screen's own in a preview.
5. **The starts sit at the foot of the open page**, on the composer they feed; the one that is tapped rises to the top
   as the question. (The first build had them under the header, with the page's space under them: the hand and the
   eye are at the composer.)
6. **The chip truncates in its screen part** and never in the name, by drawing the two as separate runs.
7. **In WebKit's default Tab mode** (text fields only) Tab moves between the composer and the browser's own chrome;
   no element of the page behind is reached. With full keyboard access on, the order is the one in "Focus".

### Stand-ins (named, to be replaced, none hidden)

| Stand-in | For | Replace when |
| --- | --- | --- |
| The inherited `Steps`, `AssistantTurn` and `TaskCard` in this folder | The Ask lane's shared thread pieces at compact size (work line, read list, the card with the countdown ring and "Not saved yet", turn notice, Rule P's scroller) | The lead exports them. The inherited card still says "Added" and shows a check during the hold, which contradicts the slot's "Not saved yet"; the shared card fixes that |
| `.ub[data-new]` rising 10px on settle | The lead's MO-3-4 from a foreign source rect | It is exported |
| `LANDING_HOMES` (tool name to kind, home and place) | `lands` on the proposal | Engine request 3 |
| Row found as "the one new row of its kind", or by its title | `created[].id` | Engine request 1 |
| `BEAT_MS` in `qc-timing.ts` | The lead's `chat/turn-timing.ts` | It lands |
| `PreviewLandingHost` in `PreviewQuickChat.tsx` | A screen that has taken the hooks: it stamps the Team Hub's task rows, places the slot, and plays the loader's part by adding the saved row 520 ms after the save | The Hub takes its two lines |

### The one-line hooks each screen needs (none is in a file this lane owns)

| Screen | File | Hook |
| --- | --- | --- |
| Team Hub, tasks | `screens/hub/parts.tsx`, `TaskRow`'s `PresenceRow` and the `.ch-hb-tasks` list in `Tasks` | `data-ch-row={`task:${t.id}`}` on the row; `data-ch-row-tag=""` on its title `<b>`; `<LandingSlot kind="task" />` as the list's first child |
| Team Hub, announcements | `screens/hub/parts.tsx`, `Announcement`'s `PresenceRow` and its list | `data-ch-row={`announcement:${a.id}`}`; `<LandingSlot kind="announcement" />` at the head |
| Team Hub, travel | `screens/hub/parts.tsx` (`TripPass`), `widgets.tsx` (`TripTile`) | `data-ch-row={`trip:${id}`}`; `<LandingSlot kind="trip" />` at the head |
| Calendar | the day's agenda list and the event chip in `screens/calendar/**` | `data-ch-row={`event:${id}`}` (and `blocked_time:${id}`) on each event; `<LandingSlot kind="event" day={isoDay} />` in each visible day |
| A player's focus areas | `screens/stats/StatsPlayer.tsx` (and its phone twin) | `data-ch-row={`focus_area:${id}`}`; `<LandingSlot kind="focus_area" subject={playerId} />` at the head |
| Qualifiers | `screens/qualifiers/QualifiersList.tsx` | `data-ch-row={`qualifier:${id}`}`; `<LandingSlot kind="qualifier" />` at the head |
| Recruiting | the board's row or card in `screens/recruiting/**` | `data-ch-row={`recruit:${id}`}`; `<LandingSlot kind="recruit" />` at the head of its column |
| Messages | none | Its own outgoing bubble is the landing |

The Hub's task row already has a wash for a task a notification named (`is-focus`): the landing's mark is the same idea
arriving by a different road, and the coordinator may prefer to fold the two into one class when the mark's rules move
to `ui.css`.

### Preview URLs (no sign-in, no model call)

Base `http://127.0.0.1:3100/clubhouse-preview/`. Any coach screen takes `?qc=<state>`; `&qcopen=0` starts closed so
the pour can be driven from the key.

| Moment | URL |
| --- | --- |
| 1. Summon, from the key | `roster?qc=hello&qcopen=0`, then the key or Cmd/Ctrl+J |
| 1. Open on the empty start, with a chip | `roster?qc=hello`, `calendar?qc=hello`, `stats?qc=hello` |
| 1. No chip (nothing to read) | `home?qc=hello` |
| 1. Phone, keyboard up (a block stands where the keyboard would be) | `calendar?qc=hello-kb` at 390x844 |
| 1. Live pill | `roster?qc=live`, `roster?qc=live-work` |
| 2. Starts per screen; tap one to see them step back | `roster?qc=hello`, `calendar?qc=hello`, `qualifiers?qc=hello`, `hub?qc=hello`, `messages?qc=hello` |
| 8. Landing on the thing's home: Confirm, 8 s hold with the slot, save, recede, mark | `hub?tab=tasks&qc=land` (`land-fast` holds 1.6 s) |
| 8. Undo during the hold | `hub?tab=tasks&qc=land`, Confirm, then Undo |
| 8. A failed write | `hub?tab=tasks&qc=land-fail` |
| 8. Home is elsewhere (no slot, no recede, Open travels) | `roster?qc=land-fast` |
| 9. Reopened later the same day | `hub?tab=tasks&qc=today`, `roster?qc=today` |
| Inherited task states | `calendar?qc=confirm-cal`, `receipt-cal`, `told-cal`, `failed-cal`, `undone-cal`, and the `msg`, `qual`, `plan` sets |
