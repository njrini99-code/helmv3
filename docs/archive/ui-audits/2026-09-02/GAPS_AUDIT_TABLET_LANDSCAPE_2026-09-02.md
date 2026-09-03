# GolfHelm Tablet / Mobile-Landscape Gap Audit — 2026-09-02

Follow-up to the earlier mobile-portrait audit. Re-checked the same 5 screens at
two new
in-between sizes to catch layout gaps that don't show up at 390×844 portrait or
at full
desktop width. Golf only — baseball untouched.

**Account used:** Coach (Nick Rini, Demo University Golf), coach dashboard.

**Sizes tested:**

- (a) Tablet portrait — 810×1080 (iPad-ish)
- (b) Mobile landscape — 844×390

Screenshots: `mobile-viewport-shots-2026-09-02/gaps-tablet/`

---

## Summary

**6 new defects found**, none present in an obviously duplicated form at 390×844
portrait
(they're specifically products of the in-between widths and short landscape
height).
2 of the 5 screens (Round Review) are essentially clean at both sizes.

| # | Screen | Size | Severity |
| --- | -------- | ------ | ---------- |
| 1 | Roster | Tablet 810×1080 | **High** |
| 2 | Dashboard | Mobile landscape 844×390 | **High** |
| 3 | Messages | Mobile landscape 844×390 | **High** |
| 4 | Dashboard, Calendar | Tablet 810×1080 | Medium |
| 5 | Calendar | Tablet + mobile landscape | Low–Medium |
| 6 | Messages | Tablet 810×1080 | Medium |

---

## 1. Roster: player names truncate to a single letter at tablet width

**Screen:** Roster · **Size:** 810×1080 tablet portrait
**Screenshot:** `06d-roster-tablet-names-truncated.png`,
`06c-roster-tablet-cards-clipped.png`

**What's wrong:** The roster renders a 2-column player card grid at this width.
Each card
is too narrow for its content, so:

- Player names truncate to a single character + ellipsis — "Cole Bennett" →
  **"C..."**,
  "Dylan Brooks" → **"D..."**. The name is the primary identifying label on the
  card and
  is effectively unreadable.
- Hometown text also truncates ("Austin..." → "Aus...", "DuBoi..." → "Du...").
- The SG:Total / Focus / Goals mini-stat row wraps badly: "3 active" clips to "3
  activ",
  and "Top quartile on your team" breaks across 4 lines instead of 1–2.

**Effect:** A coach scanning the roster grid can't tell players apart by name
without
opening each card or switching sort views. This is the standout defect of the
audit.

**Confidence:** Observed directly, high confidence.

**Fix direction:** Drop to a single-column list (like mobile portrait presumably
does) below
some width threshold above 390px but below current desktop breakpoint, or give
the 2-col
grid a wider card / smaller avatar so the name has room. At minimum, allow names
to wrap
to a second line instead of clipping mid-word.

*Note:* at 844×390 mobile landscape the same grid is marginally better — names
show as
"Cole..." / "Dyla..." (`07b-roster-mobileland-names-truncated.png`) — still
truncated, just
less severely, because the viewport is a bit wider than 810.

---

## 2. Dashboard: sidebar nav items are hidden below the fold with no scroll affordance

**Screen:** Dashboard · **Size:** 844×390 mobile landscape
**Screenshot:** `02a-dashboard-mobileland-top-navcutoff.png`

**What's wrong:** At 390px viewport height the full desktop sidebar renders (not
a
collapsed/hamburger nav). Only "Dashboard" and "CoachHelm AI" are visible before
the nav
list runs out of vertical room; "Team," "Calendar," "Rounds & Stats,"
"Messages,"
"Operations," and "Courses" are cut off below it with **no visible scrollbar or
any other
cue** that more items exist.

**Verified via DOM inspection**, not just visually: the nav element
(`nav.scrollbar-hidden.overflow-y-auto`) has `scrollHeight: 444` vs
`clientHeight: 140` —
it IS scrollable, but the `scrollbar-hidden` class removes the only affordance a
user would
have to discover that. A coach landing here in landscape (e.g. iPad in a case,
or a laptop
in a small window) has no obvious way to reach 6 of 8 primary nav destinations.

**Effect:** Real navigation blocker, not just cosmetic — a first-time user has
no visual
signal to scroll the sidebar.

**Confidence:** Observed + DOM-verified, high confidence.

**Fix direction:** At short viewport heights, either collapse the sidebar to an
icon rail
(more items fit) or restore a visible scroll indicator (thin scrollbar or
fade/chevron cue)
on the nav list.

---

## 3. Messages: floating "Ask CoachHelm" button covers the send button

**Screen:** Messages (thread view) · **Size:** 844×390 mobile landscape
**Screenshot:** `09a-messages-mobileland-fab-blocks-composer.png`

**What's wrong:** The persistent "Ask CoachHelm" floating action button is
fixed-position
bottom-right. At 390px height, it lands directly on top of the message
composer's send
button — the composer shows the paperclip icon and a clipped "Type a m..."
placeholder, but
the send affordance is fully obscured behind the FAB.

**Effect:** Depending on hit-testing, this can make sending a message require
tapping
through/around the FAB, or block it outright. Worth a functional click-test, but
visually
it's a clear overlap on the one primary action of the screen.

**Confidence:** Observed directly (visual overlap confirmed), functional block
not
click-tested — flagging as high confidence on the visual defect, medium on
functional
severity.

**Fix direction:** Suppress or reposition the FAB when a message composer is
focused/visible,
or reserve bottom-safe-area padding for it in short-viewport layouts.

---

## 4. Dashboard/Calendar (tablet): full-width labeled sidebar leaves large dead space

**Screen:** Dashboard, Calendar · **Size:** 810×1080 tablet portrait
**Screenshots:** `01b-dashboard-tablet-top.png`,
`01e-dashboard-tablet-bottom-deadspace.png`

**What's wrong:** The sidebar renders as the full desktop nav with text labels
(~260px)
rather than a collapsed icon rail, even though 810px is materially narrower than
desktop.
That leaves ~550px for content, which then renders as a single stacked column
(same as
mobile) rather than using any 2-column layout. Two visible symptoms:

- The "Good evening, Nick" hero card has a large blank cream area to the right
  of the
  greeting text, next to the action buttons.
- The page trails off into a large empty cream void below the "Top Performers"
  card
  (`01e-dashboard-tablet-bottom-deadspace.png`) — content doesn't fill the
  viewport height
  the way it would in a true mobile single-column layout or a wider multi-column
  desktop one.

**Effect:** Not broken, but reads as an unfinished "neither mobile nor desktop"
layout —
below the premium bar for an in-between width that iPad-class devices actually
use.

**Confidence:** Observed directly, high confidence on the visual, medium on how
much it
matters practically.

**Fix direction:** Collapse the sidebar to an icon rail below ~1024px (matching
what likely
already happens for the messages/roster nested nav), freeing width for a
2-column dashboard
grid at tablet sizes instead of a stretched single column.

---

## 5. Calendar: header stat line wraps into 3–4 broken lines

**Screen:** Calendar · **Size:** both 810×1080 and 844×390
**Screenshots:** `03a-calendar-tablet-textwrap.png`,
`08a-calendar-mobileland-fab-blocks-days.png`

**What's wrong:** The calendar header row packs the month title, the "N upcoming
· N in
view" metadata line, the prev/Today/next controls, and the "New event" button
into one
flex row. At both new sizes the controls crowd the row, leaving too narrow a
column for the
metadata text, which wraps mid-phrase:

```
1
upcoming
· 12 in
view
```

instead of "1 upcoming · 12 in view" on one line.

Separately at 844×390, the FAB additionally sits on top of the Friday/Saturday
day-picker
cells (`08a-calendar-mobileland-fab-blocks-days.png`), partially blocking those
two days.

**Effect:** Cosmetic on the text wrap; the FAB-over-days overlap is a minor
functional
nuisance (still tappable around the edges in testing, but visually broken).

**Confidence:** Observed directly, high confidence.

**Fix direction:** Let the metadata line wrap as a whole phrase (`white-space:
normal` with
sane break points, or move controls to a second row below ~900px) rather than
breaking on
every space.

---

## 6. Messages (tablet): chat thread column doesn't fill available width

**Screen:** Messages (thread view) · **Size:** 810×1080 tablet portrait
**Screenshot:** `04a-messages-tablet-deadspace.png`

**What's wrong:** At 810px, the conversation-list column and the message-thread
column
both stay at roughly their mobile/narrow widths instead of expanding to use the
extra
horizontal room. The result is a chat column that looks centered in a sea of
blank cream
background — dead space to the right of the bubbles and below the composer.

**Effect:** Same "in-between, unfinished" feel as the dashboard — not broken,
just wastes
the tablet's extra width instead of using it for a wider or better-proportioned
thread view.

**Confidence:** Observed directly, high confidence.

**Fix direction:** Let the thread column flex to fill remaining width up to a
readable max
(e.g. 640–720px) rather than a fixed narrow width, or reflow to a true 2-pane
layout with
wider margins/padding instead of blank space.

---

## Screens that held up fine

- **Round Review** — clean at both 810×1080 and 844×390. Only the same generic
  FAB overlap
  described above (covers "Change round type" pill edge / a chart x-axis label)
  shows up;
  no layout-specific breakage. See `05a`–`05c` (tablet) and `10a`–`10c` (mobile
  landscape).

---

## Notes for triage

- The floating "Ask CoachHelm" button is a **repeat offender** across screens
  (dashboard,
  calendar, messages, round review) whenever viewport height drops to ~390px —
  it's fixed
  position and was never given short-viewport-aware positioning. Worth fixing
  once,
  centrally, rather than per-screen.
- The full-width labeled sidebar not collapsing at <1024px widths is the other
  repeat
  pattern (items #2 and #4) — also worth a single breakpoint fix rather than
  per-page patches.
