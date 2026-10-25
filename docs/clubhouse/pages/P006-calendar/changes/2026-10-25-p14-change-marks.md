# 2026-10-25 — Calendar: change marks (P-14)

## 2026-10-25 — A moved, re-timed, relocated, renamed or cancelled event shows what changed

```text
Design package: none (Clubhouse premium features, build plan P-14 and the 2026-10-25 changelog)
PR/commit:      claude/clubhouse-change-marks
Contract IDs:   CH-6023
Actions:        none (the mark is written by a database trigger, held: migration 20261025080000)
Data impact:    reads golf_events.metadata->change; nothing is written by the app
Held items:     supabase/migrations/20261025080000_golf_events_change_marks.sql (HELD.md)
```

Built as version B of the plan's open call 12.5: no automatic push to players.
Anything that reaches players is a message the coach sends.

### Changed

- When the stored mark exists and is live (72 hours after the last edit, or
  until the event ends), the phone Day row shows the old value struck under the
  title ("~~1:00 PM~~ · Team room"; a changed place reads "Team room ~~Lonnie
  Poole~~"; a rename puts the old name first), a small Moved / New time /
  Renamed / Changed badge in the trailing slot (Reply > overlap
  > Cancelled > the mark > Now), and says so in its accessible name ("…, moved, was 1:00 PM").
- The event's detail opens on one quiet panel under the title: "Moved from 1:00
  PM", "By Coach Reyes · Tue 2:14 PM" (or "By you"). A change in more than one
  field lists Time, Day, Place, Name or Type beside what they were. Got it hides
  the change on this device (everywhere it shows, and after a reload: the
  `ch_marks` cookie); Show it again brings it back without drawing the strike a
  second time. A cancellation never hides and quotes its reason. A cancelled
  event with no live mark still says when it was cancelled.
- The strike draws once, the first time this device sees it: a CSS one-shot
  animation on a pending mark (transform only, so it ends struck with no
  script); one shared observer only records that it was seen. A seen or cleared
  mark paints that way on the first frame. Reduced motion and Animations off
  show it struck at once.
- Desktop. A tall week or day block carries the old value struck as the last
  part of its time line ("3:30 – 5:00 PM · Finley GC ~~3:00 PM~~"; a changed
  place reads the new one with the old struck after it); a short or cascaded
  block wears a small glyph in the top-right slot the overlap mark uses (overlap
  keeps the slot). Hovering, focusing or selecting a changed block draws a
  hairline across its column at the old start, labelled "Was 3:00 PM". The
  agenda row strikes the old time before the type and shows the badge; the month
  cell shows a small glyph after the title and counts it in the cell's name ("1
  changed"). The peek card adds "Moved from 3:00 PM · Coach Reyes".
- Cancelled events are struck everywhere: the week and day block (with
  "Cancelled" in its time line and ", cancelled" in its name; before, only the
  detail and the phone struck it), the all-day bar, the agenda row, the month
  title. No dimming.
- The day an event left keeps a quiet row at its old time ("~~3:00~~ Recovery
  nine · Moved to Sat at 3:30 PM", a hollow ring on the rail) on the phone Day
  and List and the desktop agenda. It opens the event on its new day (a full
  load when that day is outside the loaded weeks), is not counted in the day's
  total, never takes part in an overlap check, and is not made for a
  cancellation.
- A change that arrives while the page is open (the realtime refresh) is said
  once in a polite live region ("Recovery nine moved to 3:30 PM. It was 3:00
  PM."); what was there at load, the reader's own change and a repeat are not.
- The loader (`data/calendar.ts`) reads `change:metadata->change` with the
  event, builds every string with the shared copy engine
  (`src/lib/calendar/change-mark.ts`) and reports a mark it cannot read once per
  load (CH-6023), showing a bare Changed badge.

### Why

- Players had no way to see that practice moved other than a generic "Event
  updated" notice that only reaches events that ask for replies. The mark is on
  the event itself, for everyone who can see it.

### Verification

- calendar-change-marks.test (the loader's marks, the phone row, the strike
  states, Got it and Show it again, the panel, contrast from the tokens, no left
  stripe), calendar.test › CH-6023, marks-cookie.test, change-mark.test (every
  string). Wants an iPhone look at 390px and a dark pair; the migration is held,
  so nothing shows until it is applied.

### Coach side (version B)

- A coach who can edit the event gets **Message players** in the change panel,
  beside Got it (a cancellation has it alone, since it never hides). It opens
  Messages with the invited players chosen and the change written as the draft
  ("Travel briefing moved to 1:30 PM (was 1:00 PM). See Calendar for details.");
  the coach reads it and presses Send. It opens no thread and sends nothing from
  the Calendar, and it has no haptic. The draft and the people stay out of the
  URL (the prefill key, as on Home).
- The same panel tells the coach "Invited players see this on their calendar."
  when the event has invitees. It makes no claim about a notification: nothing
  about a change is pushed on its own.
- The save, cancel, restore and drag toasts are unchanged. Each already says
  only what happened (and, for a cancel of an event that asks for replies,
  "attendees notified", which the existing notice does), and none promised a
  push; the 2026-10-08 rule that an event without replies notifies no one still
  holds.

### The subscribed calendar

- The iCal team feed (`/api/calendar/feeds/[token]`) reads
  `change:metadata->change` with each event and, while the mark is live, leads
  the event's DESCRIPTION with one line ("Moved from 1:00 PM by Coach Okafor on
  Wed 14 October."), ahead of the coach's own notes. Each occurrence of a series
  says its own change. An event with no mark, an old one or one this version
  cannot read is exactly what it was (`src/lib/calendar/change-feed.ts`,
  feed-change-line.test).

### Together with P-4 (drag and drop)

- Merged onto `claude/clubhouse-drag-drop`. The week and day blocks keep P-4's
  drag engine, grips, tiers and cancelled paper look; the change marks sit on
  them (the old value struck in the time line, the glyph slot, the hairline "Was
  3:00 PM"). A block in hand (`card`) carries no mark; the footprint it leaves
  (`held`) does.
- The month is P-4's `DndMonth`: a changed chip wears the glyph after its title
  and the day's name says ", N changed". The all-day lane bars say ", cancelled"
  and strike a cancelled title.
- The phone Day keeps P-4's lift and Adjust time on the rows; moved-away rows
  sit in the same list.
- The Calendar read selects both `updated_at` (P-4's concurrency token) and the
  change mark. The mark trigger sets `updated_at` on a tracked change, and P-4's
  touch trigger skips a write the mark trigger made.
- Not built: the remote-move glide. P-4's settle path is for scrolling and for
  the card in hand, not for a block another person moved, so a glide would need
  its own position tracking across refreshes.
