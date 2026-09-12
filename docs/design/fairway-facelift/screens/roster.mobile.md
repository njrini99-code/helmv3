<!-- markdownlint-disable MD013 -->
# Roster — `/golf/dashboard/roster` (coach) · PHONE

Files: `src/components/fairway/pages/roster/FairwayCoachRoster.tsx` (phone branches only; the desktop composition from `roster.md` stays as it is). Read-only here: `MatrixBoard`, `Toolbar`, `PlayerIdentity`, `SignalChip`, `TrendGlyph`, `RosterHealthHeader` helpers.

## What the phone capture shows (this branch, coach, 393×852)

The desktop composition already collapses reasonably, with four phone defects: (1) the header Surface clips its right edge — the attention copy and every "Add focus area" button run past the panel, because the header's `grid` has no `minmax(0,…)` track below `lg`, so the `truncate` (nowrap) meta lines make the auto track wider than the screen; (2) the toolbar's third line puts the four-option sort Segmented and the Export button on one line — the Export clips at the viewport edge; (3) board rows carry four columns plus the overflow menu in 289 px: names truncate at nine characters, the avg overlaps the trend cell ("74.7↗ Improvin"), the Signal chip wraps to two lines; (4) two "ROSTER" eyebrows (page header + StatMatrix label).

## SCREEN (phone)

- Archetype: B (operational board), phone reading.
- Dominant object: the roster board — one row per player.
- Supporting: header Surface (StatMatrix 2×2 · attention seam rows).
- Floating: the dock only. No FAB (Invite is the header's primary action).
- Modal: the player Sheet (matte, side bottom) — goals · intent · sticky block "Open profile"; the sort Sheet (matte) — four sort rows + Export.
- EXISTING FAIRWAY: ViewHeader, Surface, StatMatrix, PlayerIdentity, Toolbar, SearchField, FilterPill, MatrixBoard, SignalChip, TrendGlyph, Sheet (+Body/Footer), InsetGroup, Button, IconButton.
- NEW FAIRWAY NEEDED: none.

## CONTAINERS TO REMOVE / CHANGE (phone)

1. Header grid → `grid-cols-[minmax(0,1fr)]` below `lg` so the two halves can shrink and their rows truncate instead of overflowing. StatMatrix drops its `label` (the page header already says Roster; REVIEW.md "one eyebrow").
2. Toolbar below `sm` → line 1 search, line 2 [Needs attention · N] [Sort · Name]; the sort Segmented and the Export IconButton are desktop-only (`hidden sm:contents` wrappers keep them in the DOM for the pinned tests and for `sm`+). The Sort button opens a matte Sheet: one InsetGroup of four rows (current one checked, `aria-pressed`), then an Export CSV row. Selecting closes the sheet.
3. Board columns → the Trend column uses MatrixBoard's literal `trend` key (hidden below 940 px, 96 px sparkline track on desktop — the width the desktop code already pins by hand); below 940 px the trend arrow rides inside the Avg cell ("74.7 ↗") with the verdict word sr-only. Signal chip text is `whitespace-nowrap`. Three phone columns: identity · avg+arrow · signal, plus the overflow menu.
4. Player Sheet → `Sheet.Body` (goals · intent) + `Sheet.Footer` with `Button shape="block"` "Open profile" (the desktop inline band keeps its row layout).

## MOBILE

- 44 px: rows are MatrixBoard PressTargets (≥44); Sort button and FilterPill are `size="sm"` controls, which clear 44 px under a coarse pointer via the Button recipe.
- Haptics: `selection` on sort change (the Sheet rows), the FilterPill keeps its own; the row tap's haptic is the PressTarget's.
- Context preservation: search, sort and the attention filter live in FairwayCoachRoster state and survive both sheets.
- Reduced motion: nothing added animates; Sheet handles its own.
- Hydration: the presence dot already defers `Date.now()` to after mount (`mounted`); `useMediaQuery` is false on the server so the first paint is the phone reading.

## STATES

- Loading: `FairwayRosterSkeleton` unchanged.
- Empty: EmptyState unchanged (no board, no toolbar).
- Search/filter empty: EmptyState `search` unchanged.

## RISKS

- `FairwayCoachRoster.test.tsx` pins "Who needs your attention", the "Add focus area" buttons, "…, expandable row" names, a "Needs attention" button and "Roster's covered" — all kept in the DOM at every width.
- Changing the Trend column key to `trend` changes the desktop track from `minmax(44px,1fr)` to the 96 px track the sparkline is already drawn at (desktop lane informed).
- `MatrixBoard` `gap-x-1` and `px-5` are the module's own; not touched.

## RESULT (capture, this branch, coach, 393×852)

Items 1–4 landed. Header card no longer clips; one eyebrow; toolbar = search / [Needs attention · 6] [Sort · Name]; board = identity · avg+arrow · signal + overflow; sort Sheet (matte, four rows + Export) and player Sheet (matte, block "Open profile" footer) render in the viewport. Left for the module owners (REVIEW.md): board names still truncate at ~10 characters (MatrixBoard's first track), and the attention meta line truncates (PlayerIdentity `truncate`).
