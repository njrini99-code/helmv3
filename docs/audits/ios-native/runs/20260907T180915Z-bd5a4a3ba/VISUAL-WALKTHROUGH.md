# Visual walkthrough — the real app, driven by hand

## How this was done, and why it took a workaround

Every screenshot below came from the **shipped Release build in the iOS 26.5
simulator**, not a browser. Both accounts were used: the coach side was already
signed in, and the player account was signed in through the app's own login
form.

The automation toolchain could not drive it. Every `tap`, `swipe` and
`type-text` command in `xcodebuildmcp ui-automation` requires an `elementRef`
from a UI snapshot, and the snapshot of this app contains **zero interaction
targets** (F-A11Y-NATIVE-01). The walkthrough therefore ran on raw screen
coordinates read off screenshots via the bundled `axe tap -x -y`. That is a
practical demonstration of what F-A11Y-NATIVE-01 costs: the app cannot be
driven by the normal iOS automation path at all.

Read-only throughout: navigations, scrolls, one dismissal, one sign-out and one
sign-in. Nothing was created, sent, edited or deleted. "Enable Notifications"
was deliberately never tapped, because it raises the iOS system permission
dialog, which would both block automation and change device state.

## What is genuinely good, and should not be touched

- **Courses** is the strongest screen in the app. Real course photography,
  confident card treatment, a pinned hero that looks designed rather than
  assembled. It would not look out of place in a shipping App Store app.
- **The player Stats "Strokes Gained" card** — dark green, one big number, a
  You/Team/Tour scale, a ranked priority list. Best single component seen.
- **The login screen** — clean card, illustrated horizon, no autofocus, so the
  keyboard does not ambush you. Consistent with the audit's static finding that
  `golf-sign-in-form.tsx` carries no `autoFocus`.
- **Role-aware bottom nav.** Coach gets Home/Helm/Team/Calendar/More; player
  gets Home/Helm/Rounds/Stats/More. Correct, and not something to redo.
- **The push soft-ask remembers a dismissal.** Tapping "Not now" and relaunching
  did NOT bring it back. This was tested specifically because it had appeared on
  three consecutive launches; those were three launches where it had never been
  answered. Not a defect.

## What makes it read as a website

### 1. Content is hard-cut behind the bottom nav, on nearly every screen
Dashboard, Team, Rounds & Stats, Operations, Courses, player Rounds and player
Stats all end mid-card or mid-row behind the tab bar, with no fade, inset or
scroll padding. On the coach Rounds & Stats screen a player's data row is
sliced horizontally through the middle. A native list ends; this one is
guillotined.

### 2. The selected pill escapes its own segmented control
Seen three times, identically: the dashboard WINDOW selector (`All`), the
calendar view switch (`Agenda`), and the notifications filter (`All`). The
active pill sits flush against the track's right or left edge with no inset
while the other side has padding, its drop shadow bleeds outside the track, and
a small green status dot sits half outside the pill's top-right corner. One
shared component, one bug, three visible instances.

### 3. Display-size numbers render as broken text
The mono numerals are **deliberate** — `src/styles/design-tokens.css` sets
`--fw-font-mono` to Fragment Mono and its own comment says "Numbers stay mono."
But Fragment Mono's period is a **square block** on a full monospace advance, so
at display size the player's strokes-gained figure renders as `−3 ▪ 62`: three
tokens, not one number. See `native/walkthrough/crop-sg.png`. The same typeface
produces slashed zeros in the priority list (`01 02 03`), in the coach
trajectory row (`3 ▲ 0 → 4 ▼`), and wide gapping in `−4.8 / rd`.

It is also applied **inconsistently**: the player Stats screen sets its numbers
in mono, while the player Rounds screen sets the same class of numbers
(`20`, `74.4`, `68`, `+2.5`, `30%`) in the sans face — and the sans version
reads better. Message previews and relative dates on the Messages screen are
also mono, which makes a chat list look like log output.

### 4. Text truncates mid-word, everywhere
"Trending down · no f…" on the Team roster, in a narrow column while the button
beside it has room to spare. The invite link reads
`https://helmsportslabs.com/gol` with no ellipsis and no way to see the rest.
Also: the Rounds & Stats description, the player dashboard subtitle, an event
title, a venue name, and the Stats subtitle. Six screens, same failure.

### 5. Implementation detail is shown to users
The coach Rounds & Stats screen prints three raw UTC timestamps in a row —
"stats cache as of 2026-07-21 01:06 UTC · rank snapshot as of 2026-09-07 02:20
UTC · oldest signal insight: 2026-08-17 02:03 UTC". The Operations screen shows
lowercase category chips (`administrative`, `compliance`, `development`,
`practice`, `preparation`, `travel`) straight from the data, sitting beside a
properly-cased "All categories". Courses says "57 courses in the cloud library".

### 6. The New event sheet clips a field behind its own footer
The scroll region's bottom padding does not account for the pinned footer, so
the "End time" label is sliced horizontally by the "Create event" button. The
disabled primary button is a washed-out green with white text that does not
read as disabled. Two input styles coexist in one form: a bare text field with
a green left bar for the name, filled rounded boxes for dates and times. Only
one of the three has a chevron.

### 7. Smaller things
- Messages shows a conversation from **"Unknown User"** with initials "US".
- The Notifications sheet titles itself "Notifications" twice, once as the sheet
  title and again as a section header directly beneath.
- The player Stats screen has a tab strip containing exactly one tab.
- The player Rounds grid forces equal card heights, so "20 ROUNDS" and "68 BEST
  ROUND" are half empty next to neighbours holding sparklines.
- "↓ Improving" pairs a down arrow with a positive word three times; on the
  "AVG TO PAR +2.5" card it reads as a plus and a down arrow together.
- The Helm tab showed a skeleton for several seconds, and the skeleton is so low
  in contrast against the cream ground that it reads as a blank screen.
- The coach date strip uses three-letter day abbreviations (SUN/MON) while the
  player one uses two (MO/TU), and the selected day is a capsule in one and a
  rounded rectangle in the other.
- The Team "Who needs your attention" card has ~37px of left margin and ~12px of
  right margin — it is not centred in its column.

## The one functional bug

**Sign-out silently failed on the first attempt.** Tapping "Sign out" showed a
"Signing out…" pending state, the sheet closed, and ~29 seconds later the app
was still fully signed in on the coach dashboard with all team data visible. No
error, no toast, no retry prompt. A second attempt signed out immediately.

Observed once, so the mechanism is unproven — but the failure mode matters more
than the frequency: the user is shown a sign-out affordance that completes its
animation and leaves them logged in. On a borrowed or shared phone that is a
privacy problem, not a polish one. Evidence:
`native/walkthrough/15-signout.png` (pending), `16-login.png` (+14s, still
signed in), `17-after-wait.png` (+29s, still signed in), `18-signout2.png`
(second attempt, login screen).
