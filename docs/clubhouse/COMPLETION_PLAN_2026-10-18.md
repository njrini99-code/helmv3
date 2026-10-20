# Clubhouse: complete and elevate (2026-10-18)

The owner's brief for this pass: be creative, go beyond the guidelines, take command and complete every
aspect of Clubhouse, on the phone and on desktop. Production limits still hold: no deploy, no production
migration and no production flag change without the owner's word. Open owner decisions that are cheap to
reverse are decided here under that delegation and recorded in [PROGRESS.md](PROGRESS.md).

Inputs: the full premium capture of every fixture state at 390 and 1280 (`premium-capture.mjs`, baseline
`afbcf78`), a mining pass over every audit in this folder (18 items still open in code), a code sweep of
`src/clubhouse` (token, state and control consistency) and a research pass on what makes iOS and desktop
apps feel premium and complete.

## Where it stands

Phone and desktop are already crafted: the warm paper canvas, the green home card, honest failure states,
the scorecard grid on desktop Home. What still reads as unfinished:

- Web-form tells: native `mm/dd/yyyy` date and time inputs in the qualifier, round, calendar, class, hub and
  stats forms; primary buttons that turn into the grey "unavailable" look while they save; radio groups that
  are a tab stop per option.
- One generic empty state everywhere (an icon tile, a headline, a button, centred in blank space), plus
  seven page-local empty looks.
- No desktop command layer: no palette, no shortcuts beyond `n` and ⌘\, icon buttons without tooltips, no
  right-click menus.
- No signature moment: finishing a round, the moment the product exists for, lands on a page like any other.
  Nothing can be kept, shared or printed.
- The front door is half built: sign in, sign up and player onboarding exist; reset password, join by code,
  staff invite, coach onboarding, coach pending and the demo still fall back to Fairway.
- Desktop tables wider than the canvas, charts without a way to read a single round, mixed number voices.

## The signature layer (inventive in behaviour, not in new visual vocabulary)

1. **The card you keep.** A finished round becomes a real scorecard (circles, squares, Out/In, putts, the
   strokes-gained strip) that settles in once on the D-64 spring when the round is submitted, exports as an
   image from the device and prints on one page.
2. **The pages that are waiting.** An empty section draws the shape of what will be there, using the real
   layout's rules and alignment and no invented content, with one sentence naming what fills it and who does.
   First run, filtered empty, no permission and failure are distinct states.
3. **A pro tool on desktop.** ⌘K palette (go anywhere, find a player, start any action the role can take),
   G-then-letter navigation, a `?` sheet, tooltips that carry shortcuts, right-click menus that mirror each
   row's actions.
4. **Controls that belong.** Clubhouse date and time fields (sheet on the phone, popover and typing on
   desktop), busy buttons that stay lit, roving focus in every choice group.
5. **Stats you can read like a scorecard.** Tables that fit the canvas and scan, charts with a scrub that
   reads one round in place, one number voice, and print styles for the coach's desk (team stats, the
   qualifier leaderboard, the roster).

## Completion

- P015: Clubhouse screens for every remaining way in (reset password on top of #2204's flow, join by code,
  staff invite, coach onboarding, coach pending, demo), the same server actions and redirects; the front-door
  flag stays off in production.
- P009: selection writes no longer carry `coach_reasoning` in an upsert (#2209), so held `20260929200000`
  can be applied after that deploys.
- The audit backlog still open in code (composer on a failed thread, tracked eyebrows, red sign-out, urgent
  announcements, putting-ring labels, the scrambling reference, the qualifier step strip, Settings desktop).
- Wave 3: the tablet tier (821 to 1180), Dynamic Type for the remaining fixed font sizes, one pill, one
  segmented and one spinner, motion durations codified with a pinning test, the transform-only sidebar fold.

## How it is built

Lanes work in one integration checkout on disjoint paths with one shared dev server, at most three at a
time (memory). Each lane captures before and after at 390 and 1280 in light and dark, runs its own tests and
writes its pages' changelogs; every lane is reviewed visually before the next wave. The result lands as one
Clubhouse PR stacked on #2202, after typecheck, lint, the full unit suite, `clubhouse:check`, the premium
capture and the journeys on a local production build.
