# 2026-11-10 — messages

## 2026-11-10 — Messages brought to its approved design (release train)

```text
Design package: design-refresh/messages/redesign
PR/commit:      agent/clubhouse-release-train (#2497)
Contract IDs:   none new; CH-7303 now names the conversation search's "No results"
Actions:        Delete conversation is in the row menu only; Remind, Close poll and Share result are in the message menu only
Data impact:    none
Held items:     "Seen 8:15 AM" (needs the other person's read time from the data branch)
```

### Thread

- A bubble is at most 76% of the thread (desktop: 520 px or 72%). The cap sits
  on the message's column, so a bubble no
  longer shrinks to a quarter of the row. One definition each for the row, the
  bubble and the composer in
  `styles/messages.css`; the older generations are deleted.
- Reaction badges sit on the bubble's corner (10 px out, 14 px up) and use `--ch-elevation-badge`.
- A reply's quote sits above the bubble in its column.
- The composer pill is radius 24 with a 10 px inset; the desktop hint line is
  for screen readers only.
- A poll's foot is one row. Remind, Close poll and Share result left the card
  and stay in the message's menu.
- The "New" divider is gone; the jump key's count says what is new.
- "Closes tomorrow 6 PM": the design's wording, with `:00` dropped on a 12-hour
  clock.

### Motion

- Send: the bubble starts at the field's own line (it started 56 px above it),
  rises on `launch`, slides sideways on
  the house curve and scales on `pop`. The words stay in field ink while the
  fill comes up under them. Every running
  animation is replace-mode on transform, translate, scale or opacity.
- Desktop Details opens without animating the grid: the track changes once, the
  panel slides by transform and opacity
  on `smooth` (462 ms) and the thread glides to its new place. Closing and
  reopening part-way carries on from where it is.
- Drag for times: a thread grabbed on its way back carries on from where it is,
  and a scroll or tap caught mid-settle
  still returns it to rest and hides the times.

### Details, New message, inbox

- Details: Delete conversation is in the row menu only; Schedule is its own card
  after Photos and files; the Files icon
  is a document; the back label is the conversation's name.
- New message: Suggested and Quick groups are cards with one header each; the To
  field has one focus treatment.
- Inbox: first run and "No messages yet" are the shared first-run empty state;
  the Announcements card has one ring.
- Faces are Avatar's steps: pins `xl` (64), rows `lg` (40) on phone and rail,
  the Seen by sheet `md` (36). The lane's
  forced sizes and types are deleted. Seen faces are the shared coin.
- First run's two actions are the shared Button (primary, ghost).
- Seen by rows: a strong name over the class year or title (a coach's view), the
  separator runs under the time too,
  and the column fits the 36 px face. Under "Not seen yet" a coach comes first.
- A lifted message with no menu rows draws no menu (someone else's photo drew an
  empty box), and someone else's
  photo or file can be replied to.
- Phone thread bar: above the default Text Size the role line gives way, so the
  title never hangs below the bar. A
  pushed thread lands focus on the name's box, not on the Details key, so a
  fresh load draws no keyboard ring.
- Card shadows are `--ch-card-shadow`; the pin bubblet and the receipt pill are
  a hairline ring plus
  `--ch-elevation-bubblet` or `--ch-elevation-badge`.

### Tests

- The 23 catalog states and three Bridge IDs that lost their tests when the flag
  was retired have tests of the
  redesigned behaviour again (`messages.test.tsx`,
  `wiring-p007-messages.test.tsx`, `messages-polls.test.tsx`,
  `messages-seen-by.test.tsx`).
- `messages.test.tsx` and `wiring-p007-messages.test.tsx` mock the open thread's
  typing channel, so neither opens a
  Realtime socket.

### Not matched as drawn

Listed in `docs/clubhouse/messages-v2/GAP.md`, Part H.
