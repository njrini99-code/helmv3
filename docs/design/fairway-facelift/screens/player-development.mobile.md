<!-- markdownlint-disable MD013 -->
# My development — `/golf/dashboard/my-development` → `/coachhelm?view=development` (player) · PHONE

Files: the route redirects into the coachhelm page; the view is `PlayerCoachHelmHome` (legacy, `src/components/golf/coachhelm/home/`) hosting `DevelopmentDrill.tsx` (same folder), which is a verbatim port of `src/components/fairway/pages/coachhelm/FairwayMyDevelopment.tsx` (the Fairway page is only mounted by the fairway preview; the live route never renders it, found during the pass). Shared pieces: `FocusAreaCard`, `GoalsSection`, `CausalWhyPanel`, and now `development-parts.tsx`. `development.md` (the peer's screen) already re-plans FocusAreaCard/FairwayGoalCard as seam rows for the coach route and notes the player view shares FocusAreaCard.

## What the phone capture shows (this branch, player, 393×852)

15,300 px — the longest player screen. In order: sub-tabs; "← Home · Development" bar with "Message coach" and "New focus area"; "No active goals yet" empty card + "Set a goal"; "CoachHelm suggests" (two suggestion cards, Accept · Dismiss each); "Why your scores move" — SIX stacked pattern cards, each with nested stat blocks (Effect strength, Confidence, Team-wide); "Your plan" → "Development progress" as THREE stat cards (3 areas · 3 completed · 50%); "Active focus areas" — three tall cards, each with an evidence panel, "Log progress" and "Mark complete"; "Completed" rows. The Log progress affordance opens the legacy `@/components/ui/drawer` (AUDIT M3).

## SCREEN (phone)

- Archetype: A/B (personal plan). Dominant: active focus areas as seam rows (title · evidence one-liner · slim Progress), tap → Sheet with the full evidence + Log progress + Mark complete. Supporting: StatMatrix (Active · Completed · Plan complete). Tertiary: suggestions (one InsetGroup, Accept as the row's trailing action, Dismiss in overflow), patterns ("Why your scores move" collapsed to one row per pattern with a Sheet for the detail), goals empty state as an InlineNotice with one action.
- Modal: the focus-area Sheet; Log progress becomes a `Sheet` (replaces the vaul Drawer — M3).

## CONTAINERS TO CHANGE (phone)

1. Three progress stat cards → StatMatrix.
2. Six pattern cards → one Surface of seam rows; detail in a Sheet.
3. Active focus-area cards → seam rows with the two actions inside the row's Sheet (one visible affordance per row).
4. Suggestions → InsetGroup rows.
5. `LogProgressDrawer` → `Sheet` (frost only when settled; body mounts after settle).
6. Header actions: one primary ("New focus area"); "Message coach" into the overflow.

## RISKS

- FocusAreaCard is shared with the coach development route; `development.md` says to wrap, not fork.
- The vaul Drawer swap touches focus/keyboard handling in `LogProgressDrawer` (lines 160–346); test the number input on iOS (keyboard lift relies on `interactive-widget=resizes-content` in the browser).

## RESULT (capture, this branch, player, 393×852)

15,300 px became 5,660 px. Items 1 to 6 landed, in both hosts, because the shared pieces now live in one file (`pages/coachhelm/development-parts.tsx`: `LogProgressSheet`, `FocusAreaRow`, `FocusAreaSheet` + `useFocusAreaSheet`, `ActiveFocusAreaList`, `ProposedAreaCard`, `DevelopmentOverviewInstrument`, `standingForArea`); `DevelopmentDrill` dropped its three verbatim copies and gained the `focusAreaCount` it never forwarded to the goals empty state.

1. "Development progress" below `md` is one matte StatMatrix, 2×2: Active · Completed · All areas · Plan complete (muted, never alarming, until a first completion). The InstrumentPanel stays from `md`.
2. "Why your scores move" below `md` is one matte InsetGroup: chains first, then relationships, each row the path (accent arrow glyphs, "to" for screen readers) over "Direct · dose-responsive · 70% strength · 88% confidence". A tap opens a matte Sheet: path, mechanism sentence, readouts as label · value rows. The cards stay from `md`; their two em dashes became a period and colons.
3. Active focus areas below `md` are one matte InsetGroup of rows: area icon · title · "Putts Made 3-5 ft · now 46.5 · target 68.5 · 40% there" (or "No target set yet") · slim ProgressTrack when the bar is honest · the card's own Sparkline at the right when the merged history has two points or more (none in the demo data, so nothing is drawn). The row opens the full `FocusAreaCard frame="bare"` in a Sheet; the card mounts after the sheet settles (360 ms fallback timer, same as the event sheet), Log progress closes this sheet and opens the log sheet after it has slid away, Mark complete closes it and runs the same handler as desktop (toast with Undo). Probe: zero visible Log progress buttons on the page, one inside the sheet.
4. Suggestions are a heading line over one matte InsetGroup: label · target line, one Accept, a 44 px Dismiss glyph (`aria-label="Dismiss"`, the suite's name pin holds). The two text buttons had crushed the label to three characters.
5. `LogProgressSheet` is a Fairway Sheet (bottom below `md`, docked right above; matte, since it is a form, so no frost to gate). The legacy `@/components/ui/drawer` import is gone from both hosts (AUDIT M3, this consumer).
6. Header: "Message coach" is a 44 px icon-only link below `md` (label sr-only, one link in the DOM at every width); "New focus area" is the one primary.

Also fixed on the way: the completed row on phone showed the icon, two pills and Reopen and no title (the status cluster left the title a few pixels wide); below `sm` the cluster takes its own line. Left: the goals empty state is still a tall EmptyState card (GoalsSection is shared with the coach board; an InlineNotice reading is a follow-up), and the coach-voice sentence in the chain detail ("this player's own rounds") is shared copy.
