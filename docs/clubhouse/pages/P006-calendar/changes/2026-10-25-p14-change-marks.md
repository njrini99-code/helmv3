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

Built as version B of the plan's open call 12.5: no automatic push to players. Anything that reaches players is a message
the coach sends.

### Changed

- When the stored mark exists and is live (72 hours after the last edit, or until the event ends), the phone Day row
  shows the old value struck under the title ("~~1:00 PM~~ · Team room"; a changed place reads "Team room ~~Lonnie Poole~~";
  a rename puts the old name first), a small Moved / New time / Renamed / Changed badge in the trailing slot (Reply > overlap
  > Cancelled > the mark > Now), and says so in its accessible name ("…, moved, was 1:00 PM").
- The event's detail opens on one quiet panel under the title: "Moved from 1:00 PM", "By Coach Reyes · Tue 2:14 PM" (or "By
  you"). A change in more than one field lists Time, Day, Place, Name or Type beside what they were. Got it hides the change
  on this device (everywhere it shows, and after a reload: the `ch_marks` cookie); Show it again brings it back without
  drawing the strike a second time. A cancellation never hides and quotes its reason. A cancelled event with no live mark
  still says when it was cancelled.
- The strike draws once, the first time this device sees it: a CSS one-shot animation on a pending mark (transform only, so
  it ends struck with no script); one shared observer only records that it was seen. A seen or cleared mark paints that way
  on the first frame. Reduced motion and Animations off show it struck at once.
- The loader (`data/calendar.ts`) reads `change:metadata->change` with the event, builds every string with the shared copy
  engine (`src/lib/calendar/change-mark.ts`) and reports a mark it cannot read once per load (CH-6023), showing a bare
  Changed badge.

### Why

- Players had no way to see that practice moved other than a generic "Event updated" notice that only reaches events that
  ask for replies. The mark is on the event itself, for everyone who can see it.

### Verification

- calendar-change-marks.test (the loader's marks, the phone row, the strike states, Got it and Show it again, the panel,
  contrast from the tokens, no left stripe), calendar.test › CH-6023, marks-cookie.test, change-mark.test (every string).
  Wants an iPhone look at 390px and a dark pair; the migration is held, so nothing shows until it is applied.
