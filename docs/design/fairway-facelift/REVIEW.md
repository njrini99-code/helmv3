<!-- markdownlint-disable MD013 -->
# Facelift review notes (after-captures, coach persona)

Harsh pass over `ui-intelligence/facelift/captures/coach/*` after each screen lands. One row per defect; "Owner" is the polish pass that fixes it. Before shots are in `ui-intelligence/facelift-before/`.

| Screen | Viewport | Defect | Fix | Owner |
| --- | --- | --- | --- | --- |
| Coach home | phone | Inside the Today card, "Clear schedule today." is indented differently from the "NEXT 3 DAYS" eyebrow and the rows under it; two left edges in one box. | one content inset for the card; the empty-today line becomes the first seam row, not a floating sentence | home-polish |
| Coach home | phone | Team performance is a card with a 5-way segmented range control and two large numbers below the fold; the hero, Today and Team performance stack as three same-radius boxes. | keep the hero unboxed (page-level welcome), Today and pulse as seam sections with hairlines, range control demoted to a Menu | home-polish |
| Team stats | phone | Eyebrow "TEAM STATS" repeats the H1 "Team Stats". | drop the eyebrow when it equals the title (ViewHeader rule) | stats-polish |
| Team stats | phone | Subtitle is clamped mid-sentence ("…roster: ranked,…"). | shorten the copy to one line or let it wrap to two | stats-polish |
| Team stats | phone | Freshness line is four UTC timestamps in a row ("stats cache as of 2026-07-21 01:06 UTC · rank snapshot as of …"). Coaches read none of it. | one relative line ("Updated 2 h ago") with the detail behind a Tooltip/Menu item; never raw UTC on a phone | stats-polish |
| Team stats | phone | KPI values render in a wide monospace ("−4.8 / rd", "0→"), which reads as a terminal, not a scoreboard. | tabular-nums display face from the StatMatrix spec; arrows as icons, not glyphs | stats-polish |
| Roster | phone, desktop | Route error boundary "Failed to load roster" on the coach account. | root cause pending (probe running) | blocker |
| Qualifiers | phone | Search field and the All/Active/Concluded pills sit inside their own rounded box, above a second box holding the "ACTIVE" list: three stacked cards (hero, toolbar, list). | toolbar is a bare Toolbar row with a hairline, list sections are seam groups, only the live qualifier keeps a card | qualifiers-polish |
| Qualifiers | phone | Search placeholder clips ("…course, or de"). | "Search qualifiers" | qualifiers-polish |
| Tasks | phone | Both fold and full shots show the loading skeleton after network idle (13 s); the page never painted content in the capture. | root cause pending (probe) | blocker |
| Round detail | phone | Eyebrow says "ROUND REVIEW · AUGUST 31, 2026" on the detail page; the review is a different screen. | eyebrow "ROUND · Aug 31, 2026"; keep "Round review" for the review route only | rounds-polish |
| Round detail | phone | The player is named three times above the fold: "Qualifier · 18 holes · Cole Bennett", "Viewing Cole Bennett's round", then "QA Test Course · August 31, 2026 · Cole Bennett" inside the panel. | one meta line under the title; the panel carries only what the header does not (score, delta, grade) | rounds-polish |
| Round detail | phone | Hero panel stacks two eyebrows ("FINAL SCORE", then "STROKES") above one number, sets the delta in monospace with a ▼ glyph for +3 over par, and nests the AI recap in a sunken well inside the card (nested boxes). | one eyebrow, display numeral with tabular-nums, delta as a Chip (tone by sign), recap as plain prose under a hairline | rounds-polish |
| Round review | phone | In-page error state "We couldn't load this review · An unexpected error occurred" on a scorecard-only round (the before shot showed a 45 s skeleton on the same round). | root cause pending (probe on the review route; suspect the auto-generate LLM call failing in dev, see AUDIT perf row 15) | blocker |
| Rounds library | phone | KPIs are a horizontal carousel of identical cards (97 ROUNDS, 75.4 AVG SCORE, a third clipped at the edge). | StatMatrix, 2-up on phone, no carousel | rounds-polish |
| Rounds library | phone | Search, "All players" select, filter pills and a Month/Week segmented control share one boxed card; the pill row runs under the card edge ("Practice" is cut). | bare Toolbar: search on row one, a single horizontally scrolling pill row with edge fade on row two; the Month/Week switch moves into the overflow Menu on phone | rounds-polish |
