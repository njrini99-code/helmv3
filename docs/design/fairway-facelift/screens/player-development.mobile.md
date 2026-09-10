<!-- markdownlint-disable MD013 -->
# My development — `/golf/dashboard/my-development` → `/coachhelm?view=development` (player) · PHONE · SPEC ONLY

Files: the route redirects into the coachhelm page; the view is `PlayerCoachHelmHome` (legacy, `src/components/golf/coachhelm/home/`) hosting `src/components/fairway/pages/coachhelm/FairwayMyDevelopment.tsx` (874 lines) + `FocusAreaCard`, `FairwayGoalCard`, `GoalsSection`. `development.md` (the peer's screen) already re-plans FocusAreaCard/FairwayGoalCard as seam rows for the coach route and notes the player view shares FocusAreaCard.

## What the phone capture shows (this branch, player, 393×852)

15,300 px — the longest player screen. In order: sub-tabs; "← Home · Development" bar with "Message coach" and "New focus area"; "No active goals yet" empty card + "Set a goal"; "CoachHelm suggests" (two suggestion cards, Accept · Dismiss each); "Why your scores move" — SIX stacked pattern cards, each with nested stat blocks (Effect strength, Confidence, Team-wide); "Your plan" → "Development progress" as THREE stat cards (3 areas · 3 completed · 50%); "Active focus areas" — three tall cards, each with an evidence panel, "Log progress" and "Mark complete"; "Completed" rows. The Log progress affordance opens the legacy `@/components/ui/drawer` (AUDIT M3).

## SCREEN (phone)

- Archetype: A/B (personal plan). Dominant: active focus areas as seam rows (title · evidence one-liner · slim Progress), tap → Sheet with the full evidence + Log progress + Mark complete. Supporting: StatMatrix (Active · Completed · Plan complete). Tertiary: suggestions (one InsetGroup, Accept as the row's trailing action, Dismiss in overflow), patterns ("Why your scores move" collapsed to one row per pattern with a Sheet for the detail), goals empty state as an InlineNotice with one action.
- Modal: the focus-area Sheet; Log progress becomes a `Sheet` (replaces the vaul Drawer — M3).

## CONTAINERS TO CHANGE (when the development lane takes it)

1. Three progress stat cards → StatMatrix.
2. Six pattern cards → one Surface of seam rows; detail in a Sheet.
3. Active focus-area cards → seam rows with the two actions inside the row's Sheet (one visible affordance per row).
4. Suggestions → InsetGroup rows.
5. `LogProgressDrawer` → `Sheet` (frost only when settled; body mounts after settle).
6. Header actions: one primary ("New focus area"); "Message coach" into the overflow.

## RISKS

- FocusAreaCard is shared with the coach development route; `development.md` says to wrap, not fork.
- The vaul Drawer swap touches focus/keyboard handling in `LogProgressDrawer` (lines 160–346); test the number input on iOS (keyboard lift relies on `interactive-widget=resizes-content` in the browser).
