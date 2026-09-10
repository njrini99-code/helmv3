<!-- markdownlint-disable MD013 -->
# My rounds — `/golf/dashboard/rounds` (player) · PHONE

Files: `src/components/fairway/pages/rounds/FairwayRoundsLibrary.tsx` (player branch, read only here), `src/components/fairway/pages/rounds/FairwayUnfinishedBanner.tsx` (rewritten). Written while `rounds/**` was held by rounds-polish; the lane was released after 50f4e2321 and 22ceb697a landed #2 and #3.

## What the phone capture shows (this branch, player, 393×852)

7,500 px. Header "Your rounds." + New round ✓. Then "IN PROGRESS 5": FIVE bordered cards, each a big "1 / 18" tile, status pill, course, and TWO buttons (Discard · Continue) — ten buttons before the page's own content. Two stat cards (20 rounds · 74.4 avg, Improving) as separate boxes. The Toolbar: search line; filter pills line ("Tournament" clips at the edge, but that line scrolls); then the Month/Week Segmented alone on a third line, right-pinned (`viewToggle` trailing cluster). The library itself is good: one Surface, month headings, seam rows (day · course · type chip · holes · score · to-par) with the sparkline between months.

## SCREEN (phone)

- Archetype: B (library), phone reading. Dominant: the round list. Supporting: unfinished rounds (one seam group), StatMatrix (rounds · avg · trend). Tertiary: search, type filter, month/week.
- Floating: dock; the Toolbar can be sticky (long list).
- Modal: none new; a Discard confirmation stays a dialog.

## CONTAINERS TO CHANGE (phone)

1. In-progress cards → ONE matte `InsetGroup` "In progress · 5": rows = course · "1 of 18 · 9 d ago" · trailing block "Continue" (`Button size="sm"`); Discard moves into a row overflow `Menu` (destructive). One primary per row, ten buttons become five.
2. Two stat cards → `StatMatrix` (Rounds · Avg score · Trend) `variant="matte"`.
3. Month/Week Segmented → desktop only; below `sm` a "View · Month" control opening a matte Sheet (the roster/tasks pattern), or wait for the Toolbar-level phone fallback accepted for the primitives pass.
4. Everything else stays.

## RISKS

- Rounds tests pin the unfinished-round Continue/Discard names (`FairwayUnfinishedBanner`, library tests) — keep the accessible names.
- `FairwayUnfinishedBanner.tsx:47` computes `Date.now()` in render (AUDIT hydration row) — the "9 d ago" copy must come from a mounted clock.

## RESULT (capture, this branch, player, 393×852)

Item 1 landed: "In progress · 5" is one matte InsetGroup; each row is a 40 px hole tile ("1 / 18", or "Setup" before the first hole, with the hole count sr-only after the course name), the course name, "city · 9d ago" from a mounted clock (blank on the server and first paint, so no hydration mismatch), one primary Continue and an overflow Menu holding the destructive "Discard round". Choosing it swaps the trailing block for Cancel · Confirm discard in the same row (probe: five Continue buttons, zero visible Discard buttons at rest; menu and confirm states captured). The existing `deleteInProgressRound` action is reused unchanged. Items 2 and 3 arrived via rounds-polish (StatMatrix rounds · avg · best · to par · trend; a Month/Week Menu below `md`); the Menu still sits alone right-pinned on the toolbar's last line, which is the accepted Toolbar-level phone fallback. Tests pin the "In progress" heading, the count and the hole tiles, all kept.
