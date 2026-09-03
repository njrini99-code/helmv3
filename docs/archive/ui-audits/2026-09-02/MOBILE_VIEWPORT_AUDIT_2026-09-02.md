# Mobile viewport UX audit — 2026-09-02

**Target:** <https://helmsportslabs.com> · **Viewport:** 390x844 (iPhone-sized),
held for the entire session
**Scope:** exactly two defect classes — (1) container overflow / clipping when
viewing or entering data on mobile, and (2) modal/sheet/dropdown popups that
overflow, clip, or mis-position on open. Backend/data-integrity issues noticed
in passing (e.g. synthetic QA qualifier date strings like "Feb 2, 60824") were
explicitly out of scope and are not covered here.
**Accounts used:** the "player" credential (<njrini99@gmail.com>) actually
authenticates as **Nick Rini, a coach** on Demo University Golf; the "coach"
credential (<rinin376@gmail.com>) actually authenticates as **Cole Bennett, a
player** on the same team. Findings below are labeled by the real role each
account presented, not by the credential name.
**Screenshots:** `docs/ui-audits/mobile-viewport-shots-2026-09-02/`

## Method

Every route reached from the coach and player dashboards was opened at 390x844
and checked programmatically for any element whose right edge fell outside the
real device width (`element.getBoundingClientRect().right > ~390`), after
excluding elements inside intentional `overflow-x-auto` swipe carousels (course
pickers, filter-chip rows, hole navigators — all standard, working mobile
patterns, not defects). Every reachable button that opens a dialog, drawer,
dropdown, or popover was opened and checked for viewport containment and a
reachable close control. Positive findings were re-verified with a live
screenshot before being included.

Pages/flows walked included: dashboard, calendar (+ New Event, RSVP), roster (+
Invite player, Actions menu, Set intent), qualifiers (+ Create qualifier),
rounds list, round detail, team stats, recruiting HQ (+ Add prospect), travel (+
Add itinerary), messages (+ New message, conversation composer), announcements
(+ New Announcement), tasks/operations (+ Create task), courses (+ Add course),
CoachHelm/intelligence (all three sub-views + Ask CoachHelm sheet),
settings/profile, global search (⌘K), notifications bell, and the full player
"New Round" flow (course picker → holes setup → live hole-by-hole shot entry
with club/result/distance inputs). Everything not listed below was checked and
found to have no overflow and no broken popups at this viewport.

## Container overflow / clipping

| # | Page / route | Screenshot | What's wrong | Role |
| --- | --- | --- | --- | --- |
| 1 | `/golf/dashboard/rounds/[id]` (Round Review → "Score to par through the round" chart, in the "Pulse" section) | `coach-round-detail-score-chart-overflow.png` | The line-chart SVG renders at a fixed **520px** width inside a container that's only **~208px** wide on this viewport (`overflow-x: auto`, no visible scrollbar, no swipe hint). Only the leftmost ~40% of the round's hole-by-hole score-to-par line is ever shown; the remaining holes are scrolled off to the right with nothing on screen to indicate more content exists. Because the visible slice happens to form a plausible-looking little V-shaped line (dip then recovery), it reads as a complete chart rather than a truncated one — a coach reviewing this player's round would not realize they're seeing a partial trend. Reproduced on a coach viewing a player's round. | Coach |
| 2 | Same page/component, `/golf/dashboard/rounds/[id]` | `player-round-detail-score-chart-overflow.png` | Identical bug, same chart, same 520px-in-a-208px-box overflow, reproduced on a player's own round-review page (own round, own view). Confirms this is a shared component defect affecting both roles, not a coach-only issue. | Player |

No other page in the walk (dashboard, team stats, calendar, roster, qualifiers,
messages, announcements, recruiting, travel, courses, settings,
CoachHelm/intelligence in all sub-views, or the full multi-step "New Round"
shot-entry flow including the live club/shot-result/distance-to-pin inputs)
showed a genuine element extending past the device width. A few near-edge
measurements (2px past the true 390px device width on the Team Stats charts)
were checked and are sub-pixel rounding, not a visible defect, so they are not
listed.

## Modal / sheet / dropdown popups

No defects found. Every popup opened during the audit rendered fully inside the
390x844 viewport with a reachable close control and no clipped content:

- New Event (calendar), RSVP dialog (calendar)
- Invite player, roster row "Actions" menu, "Set intent" popover
- Create qualifier (full-page form sheet)
- Add prospect (recruiting)
- Add itinerary (travel)
- New message + conversation composer (messages)
- New Announcement (announcements)
- Create task (operations)
- Add course (courses)
- Ask CoachHelm chat sheet, and the "Choose a course" bottom-sheet in the New
  Round flow
- Global search (⌘K), notifications bell popover
- "More" navigation sheet, Exit-round confirmation dialog

## Notes

- One early lead — the "Next: configure holes →" button on the New Round setup
  step appearing clipped at the bottom of the viewport — was investigated and
  disproven: it was an artifact of a still-open "Choose a course" drawer skewing
  layout measurement, not a real defect. Closing the drawer properly (via its
  visible X) showed the button in normal, unclipped document flow.
- Total genuine, screenshot-verified defects: **2** (one root cause, both
  roles), 0 modal/popup defects.

## Player-side messaging/typing/shot-entry/error-state follow-up

**Target:** <https://helmsportslabs.com> · **Viewport:** 390x844 · **Account:**
<rinin376@gmail.com> → **Cole Bennett, player**, Demo University Golf (same role
mapping noted above).
**Scope:** four specific items only — messaging scroll position, typing
legibility, shot/round-entry visual polish, and error-message quality. Overflow
and modal positioning were explicitly out of scope for this pass (already
covered above). Backend/API/session causes noted below are described only to the
extent needed to explain what a player would see; they were not chased further
per instructions.
**Screenshots:**
`docs/ui-audits/mobile-viewport-shots-2026-09-02/player-followup-*`

### 1. Messaging scroll position

**What's wrong:** Confirmed the same pattern already found on the coach side.
Opening a conversation (fresh navigation to `/golf/dashboard/messages`, then
selecting a thread) does land the message container scrolled to its true maximum
— `scrollTop: 2491` of `scrollHeight: 2763` with `clientHeight: 272` (verified
via direct DOM measurement, not just visual impression), so mathematically the
newest message is in view.
**Effect:** In practice it doesn't read that way. The outer "Messages / Team
messages / 3 conversations / New message" page header stays rendered above the
thread panel and never collapses when a thread is open, so the actual scrollable
message area only gets **272px of the 844px viewport** (~32%). The newest
message sits at the very bottom edge of that sliver, right above the compose
box, so it looks like the thread opened scrolled *up*, not down.
**Severity:** Medium — no data is wrong, but the perceived "did my message load
right" experience is confusing on every thread open, every time, for every
player.
**Confidence:** Verified (DOM measurement + screenshot), same root cause the
coach-side audit already flagged.
**Screenshot:** `player-followup-messaging-scroll-initial-load.png`
**Fix direction:** collapse/hide the parent list header (or shrink it to a
compact back-button bar) once a thread is open, the same fix already recommended
on the coach side — this is one shared component, not two separate bugs.

### 2. Typing legibility

**Messaging compose box:** clean — dark text on a light field, clear green focus
ring, not clipped or covered by other UI, wraps correctly across 4 lines at
390px. No issue. See `player-followup-messaging-compose-legibility.png`.
**Round-entry numeric fields** ("Distance remaining (yds)", "Proximity to hole
(ft)"): also clean — large centered digits, high contrast, clear green focus
ring, no covering elements. No dedicated free-text "round notes" field was found
anywhere in the player round flow (live shot entry or the completed round-detail
page) to test separately — the numeric shot/distance inputs are the closest
analog and they're legible.
**Verdict:** no legibility problems found in this pass.

### 3. Shot tracking / round entry — polish pass

Beyond overflow (out of scope here), the flow is mostly well-executed:
consistent pill/button styling for club, shot result, break, and slope
selectors; a live trajectory graphic that updates per shot; an auto-computed
"Shot distance ~230 yds" readout; clear disabled/enabled CTA states; and a
genuinely good "Recover Unsaved Progress?" dialog when re-entering an
interrupted round (see error section below). Two things stood out as below that
bar:

- **Tee-selection step is mostly dead space.** After picking a course, the "Pick
  the tee set you played" screen shows a single tee card with roughly 500px of
  blank background above it and 500px below it on a 390x844 screen — well over
  half the viewport is empty. It reads as an unfinished or placeholder screen
  rather than a deliberate design choice. Screenshot:
  `player-followup-round-setup-tee-select-empty-space.jpg`. Severity:
  low/cosmetic, but easy to fix (center the card properly, or add supporting
  content — course photo, tee comparison table, recently-used tee — to fill the
  space intentionally).
- **Silent "Next hole" nav control.** The `Next →` link in the top header bar
  (next to "Exit" and the hole counter) is fully enabled — not `disabled`, no
  `aria-disabled` — on Hole 1 even before any shot has been recorded. Clicking
  it does nothing at all: no navigation, no toast, no shake, no inline message.
  A player tapping it (a very natural thing to try) gets zero feedback and may
  think the app is frozen. This is a distinct issue from the error-messaging
  findings below because there's no message at all, styled or otherwise — see
  error section, item 4a.

### 4. Error messages

Mixed results — some of the best-styled validation in the app, and one genuinely
confusing gap, found side by side in the same flow:

**4a. Silent no-op on incomplete-hole navigation (needs fixing).** Described
above: clicking the enabled-looking top-bar `Next →` while the current hole
isn't finished produces no feedback whatsoever. Compare to the bottom "Next
shot" button, which correctly disables itself and shows contextual gray helper
text ("Select a shot result" / "Enter the distance remaining") — the top-bar
control should follow the same pattern (disable it, or show a toast/inline
message explaining why it can't proceed yet).

**4b. Inline field validation (genuinely good, worth protecting as a pattern).**
Typing an invalid value (tested with `-50`) into the required "Distance
remaining" field produces: a red-highlighted input border, red inline helper
text ("Please enter a valid distance") directly under the field, a disabled CTA,
and matching gray helper copy above the button ("Enter a valid distance"). This
is clean, on-brand, and far better than a raw browser alert or unstyled red
text. Screenshot: `player-followup-round-entry-invalid-distance-error-good.png`.
Minor nit only: the auto-computed "Shot distance ~430 yds" readout below the
invalid field still renders in the app's positive/green success color even while
the field above it is actively invalid — low priority, but slightly undercuts
the error state's clarity.

**4c. Unlabeled "Save failed" indicator (needs fixing — visible-copy gap, not
styling).** During normal shot entry (no deliberate error injected), the app's
autosave began failing — network capture showed the in-flow autosave POSTs
starting to receive `307` redirects to `/golf/login` partway through the
session, i.e. the session was invalidated server-side mid-round (session/auth
cause, not chased further per scope). The frontend's response to this is a small
`<span role="status" aria-label="Save failed">` badge in the header next to
"Exit" — but the visible badge contains **only an SVG warning-triangle icon, no
visible text**. The accessible name ("Save failed") exists for screen readers
only; a sighted player sees nothing but an ambiguous orange triangle with no
label, no tap target (it's not a button, no `onClick`), and no way to learn
what's wrong or retry. Screenshot:
`player-followup-round-entry-save-failed-unlabeled-icon.png`. Severity: medium —
a player could lose in-progress hole data without any legible warning. Fix
direction: add a visible short label ("Save failed" or "Offline — retrying…")
next to the icon, and ideally make it tappable for more detail / manual retry.

**4d. Recovery dialog (genuinely good).** As a direct consequence of the above
session drop, reopening "New Round" surfaced a well-built "Recover Unsaved
Progress?" dialog — warning icon, plain-language explanation ("Found shots saved
locally for a hole in progress. This data may have been saved when the app was
interrupted."), and two clear actions, "Discard" / "Restore". This is exactly
the right way to handle an interrupted-session edge case and is worth calling
out as a positive pattern to reuse elsewhere. Screenshot:
`player-followup-round-setup-recover-progress-dialog-good.jpg`.

**4e. Exit-round dialog (also good).** "Exit round" mid-round correctly offers
"Save for later" vs. "Delete round" with descriptive subtext, a clear note that
stats only compute on full completion, and a two-step "Tap again to confirm —
this cannot be undone" pattern before actually deleting — no accidental data
loss risk observed.

### Summary for this pass

| # | Item | Verdict |
| --- | --- | --- |
| 1 | Messaging scroll position | Confirmed same header-doesn't-collapse issue as coach side — Medium |
| 2 | Typing legibility (compose + round-entry numeric fields) | No issues found |
| 3a | Tee-selection empty space | Low/cosmetic |
| 3b / 4a | Silent no-op "Next hole" nav | Needs fixing — Medium |
| 4b | Invalid-distance inline validation | Good — no action needed (minor color nit only) |
| 4c | Unlabeled "Save failed" icon | Needs fixing — Medium |
| 4d | Recover Unsaved Progress dialog | Good — no action needed |
| 4e | Exit-round / delete-round confirmation | Good — no action needed |
