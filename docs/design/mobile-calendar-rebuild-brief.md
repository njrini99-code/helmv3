# Mobile calendar rebuild — implementation brief

Design canvas: https://claude.ai/code/artifact/7854474d-08b9-45e2-aab0-6ef486265c43
Seven artboards. Read it before you read this; the boards are the spec, this
is the wiring.

Owner decision 2026-09-04: build it. Ship in the slices below, one PR each.

---

## 1. Why

Measured on the shipped screen at 390x844: **~780px of the 844px viewport is
chrome before a single event renders.** The hero card alone stacks a 32px
month title, a counts line, a prev/Today/next row, a full-width "New event"
button and the day strip; then a Day/Week/Month/Agenda switcher, then "Add to
phone", then the avatar rail, then a "Show 17 earlier events" wall. The first
real event is off-screen.

That violates four rules AGENTS.md already states:

- "Reduce top-of-screen chrome so users reach content earlier."
- "Do not stack multiple utility rows in the header unless there is no viable
  alternative." (five rows are stacked)
- "Each screen should expose one clear primary action, a small number of
  secondary actions, and move lower-priority actions into overflow."
  (~14 controls compete)
- "Prefer calmer, denser, more scannable mobile layouts over decorative or
  oversized sections."

Target: **~200px of chrome, 4-5 events above the fold.**

---

## 2. Fairway constraints — non-negotiable, and the first pass got these wrong

`.claude/rules/design-system.md` is binding and `src/styles/design-tokens.css`
outranks it. Specifics that were violated in review and must not be
re-violated:

**The card recipe is `src/components/fairway/surfaces/surface.tsx`.** Do not
hand-roll a card.

- `Surface` = `bg-surface` + `rounded-card` (**20px**, not 18) + `p-6` default,
  and elevation is EITHER `border border-border-subtle` with
  `[box-shadow:var(--fw-shadow-card)]` OR a borderless `shadow-soft`.
  **Never a border together with `shadow-soft`** — surface.tsx calls that
  "the cheap-UI tell" in those words.
- Rows nested INSIDE a card are `Inset`: `bg-surface-sunken`, **no border**
  ("tint step, never card-in-card with two borders"). The Today plinth's event
  rows are Insets, not nested Surfaces.
- `Elevated` = `bg-elevated` + `shadow-raise`, for things that truly float.
- `--fw-shadow-card` carries `inset 0 1px 0 oklch(1 0 0 / 0.55)` — the lit top
  edge. It is most of the depth in these boards; do not flatten it to a 1px
  drop shadow.

Also binding: no `bg-white` (the card is warm cream), no `glass-*`, no raw
`red-*`/`amber-*`/`rose-*`/`violet-*`, no new `cream-*`/`warm-*`. Type roles
are `font-fw-display` / `font-fw-sans` / `font-fw-mono` only.

Reuse, do not rebuild: `Segmented` (`controls/segmented.tsx`) for the
D/W/M/Agenda switcher, `Sheet`/`ModalShell` (`overlays/`) for the pickers,
`EmptyState` (`feedback/`) for empty days, `Skeleton` for `loading.tsx`
(it must shape-match the new first paint — the current one matches the old
hero and will flash).

---

## 3. The interaction model — corrected

The first design pass got this wrong; do not inherit it from any earlier
description.

**Selecting avatars overlays PLAYER SCHEDULES.** `FairwayCalendar.tsx:300`
labels the block "avatar rail -> overlay player schedules", and the fetch
comment names the real job: the **"find common free time" overlay (audit
P237)**. It is not "who is free for this team event" — that feature does not
exist and must not be built here.

Data already available: `getPlayerAvailability(playerId, start, end, tzOffset)`
returns `{ start, end, type: 'event' | 'class' | 'blocked', title? }[]`.
Anchor to the coach's local day via `new Date().getTimezoneOffset()` — the
4th arg exists because UTC bucketing put evening events on the wrong day in
western timezones (audit P237).

**The colour ceiling is the load-bearing constraint.** `PLAYER_COLORS`
(`CalendarAvatarSidebar.tsx:49`) has **8** entries; rosters run larger — the
code itself names Hampden-Sydney 15, Shenandoah 12, Guilford 12, UNCW 10. So
the view SWITCHES ENCODING rather than degrading:

| selection | encoding |
|---|---|
| 1-8 players | one track per player in their `PLAYER_COLORS` entry, plus an `ALL FREE` track |
| more, or "whole team" | **drop colour entirely** — a per-half-hour count of how many are busy, and a ranked list of free windows |

In the whole-roster view, identity returns ONLY where it is actionable: name
the one or two players blocking an otherwise-complete window ("Maya has
class"), never a row of 14 avatars.

`MAX_SELECTION = 8` already exists and silently drops clicks at the cap. The
picker must state the cap BEFORE it is hit.

---

## 4. Slices — one PR each, in this order

**S1 · Chrome collapse** (`FairwayCalendarHero.tsx`, `FairwayCalendar.tsx`,
`FairwayDayStrip.tsx`)
Retire the hero card. Month becomes the page title with a picker chevron; the
"Calendar" title row goes (it duplicates the Calendar tab). Day strip becomes
the week navigation — swipe, no prev/Today/next row — rendered as a SUNKEN
track (`bg-surface-sunken` + inset shadow) with the selected day as a raised
pill. Counts drop to a single meta line. "Add to phone"
(`CalendarSyncButton`) moves to overflow. `QuickAddEventFAB` ALREADY EXISTS —
use it and delete the full-width "New event" button. Open on today; "Show N
earlier" becomes a quiet inline link, never a wall.

**S2 · Member picker** (`FairwayCalendarMemberRail.tsx` -> avatar stack +
`Sheet`)
Replace the horizontal rail with an overlapping avatar stack in the header
that opens a `Sheet`. Multi-select, real names + handicap, the 8-colour swatch
on selected rows, initials fallback with the existing warm tints for members
with no photo, and the cap stated up front. Keep `selectedPlayerIds` as the
state contract so nothing downstream changes.

**S3 · Few-player overlay** (new `FairwayAvailabilityTracks.tsx`)
<=8 selected: one horizontal track per player over a 6a-9p axis, busy blocks
by `type` (class solid, event lighter, blocked hatched), plus the derived
`ALL FREE` track and a ranked "best windows" list.

**S4 · Whole-roster find-time** (new `FairwayFreeTimeFinder.tsx`)
Colour-free. Half-hourly busy counts as a bar chart, then ranked free windows
with an N-of-M badge and the blocking player named. Tapping a window opens the
event editor prefilled with that range.

**S5 · Event sheet** (`FairwayEventEditor.tsx` / `EventWhenFields.tsx`)
Name field first and large; type chips unchanged in vocabulary; the three
stacked full-width When fields become a 2x2 grid plus duration chips; Create
moves into the header (the X is the only dismiss — delete the redundant
Cancel); Location / Who's invited / Notes collapse into rows. **Fix the
clipped End time field** — the current sheet hides it behind the button bar.

---

## 5. What does NOT exist yet — build it

**Common-free-time intersection.** `getPlayerAvailability` returns BUSY
intervals per player. "Everyone free 2:00-4:00 PM" is derived and nothing
computes it today. Write it as a pure, unit-tested function — busy intervals
in, ranked free windows out:

- merge each player's overlapping busy intervals,
- invert against the working window,
- intersect across players,
- rank by (players free DESC, duration DESC), and for near-misses carry the
  ids of who is blocked so S4 can name them.

Put it in `src/lib/golf/` with tests beside it. Do NOT compute this in a
component and do NOT do it in SQL — TypeScript, pure, tested, same discipline
as `computeDbHealthDelta`.

Timezone: intersect in the coach's local day. The tzOffset arg exists for
exactly this bug.

---

## 6. Traps

- `loading.tsx` must shape-match the new first paint or the redesign flashes
  the old hero on every navigation.
- Realtime: `use-calendar-range-events.ts` refetches the visible range on
  every re-`SUBSCRIBED`. If you add a second subscription for availability,
  give it the same reconnect refetch — a stale availability overlay is
  invisible and wrong. (`use-qualifier-realtime.ts` was missing this until
  2026-09-04.)
- Never nest interactive children inside a `BentoCell` with `onOpen` — the
  cell is one `<button>`; a nested button is a hydration-crash class.
- Hit targets in mockup content: >=44px.
- Do not draw a fake iOS status bar. The boards deliberately leave that space
  empty; the real one renders there.

---

## 7. Acceptance

Per slice: `npm run typecheck`, `npm run lint` (`--max-warnings 0`, read the
exit code directly, never through a pipe), `npm test`. `npm run build` for any
slice touching a `'use server'` surface. S4/S5 need a unit test for the
intersection and one for the sheet's field wiring.

Visual: measure the chrome height on a 390x844 viewport. If content does not
start by ~200px, S1 is not done.

Sample data in the boards — event names, handicaps, the 14-player counts,
"Maya has class" — is illustrative. Wire real data; do not copy the strings.
