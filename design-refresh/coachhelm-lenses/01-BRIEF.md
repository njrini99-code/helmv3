# CoachHelm Lenses: brief

> Read 05 to 08 first (3 Nov). `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md` and `08-ACCEPTANCE.md` are the build contract, with `../ACCEPTANCE-SHARED.md` over them. Where this file differs from them, they win. Two changes matter most: Reduce Motion is the app's 180ms fade (`CH_FADE_MS`, SHARED-6), not 120ms; and the feature card is flat green with no corner highlight (SHARED-2).

## The problem (Nick, Oct 31)

"The coach vs player view... it's kind of confusing right now like you have to click on a player to get his specific reads. I feel like a lot of the coachhelm data isn't making it into there."

Today a coach reaches one player through a chip strip that swaps a single card, plus separate Deep dive and Standing pages. A lot of what CoachHelm knows about a player (the plan, the focus handshake, the field, corrections, the coach's own plan for the player) never shows up in one place, and the coach can't see what the player sees.

## What changes

1. One file per player. Every player row on the CoachHelm list pushes that player's file. The file replaces the chip strip's single card and the separate Deep dive and Standing coach pages. Old links redirect.
2. A lens. At the top of the file the coach flips between "Coach view" and "As {first name} sees it". The second shows exactly the player's own board for the same data, with a pill saying it's a preview.
3. The coach's plan for the player. The aim, alert level, what the coach is watching and a note (`golf_coach_player_intent`) get their own card on the coach side, in the coach's words, with a sheet to edit. The player never sees it.
4. Players compare against the PGA Tour and team averages, never teammates, named or not.

Nick said yes to all four on Oct 31 ("All four on Lenses").

## Screens

- Coach, phone: CoachHelm list (rows only; the team view above it is lane 1's) and the player file.
- Coach, desktop: sidebar and glass top bar as today, player rail on the left, two column file.
- Player, phone and desktop: their own CoachHelm board, same cards as the lens.
- Two sheets: a read's evidence, and the coach's plan.

## What must not change

- The green phone top bar and the desktop sidebar with glass top bar.
- What shot tracking collects. This is a view of existing data only.
- The CoachHelm evidence rule. Every read keeps its evidence and its strict bar.
- Today's Segmented, Corrections and focus actions. Reuse them.
- No accent left-border cards anywhere.
- Prep only: no deploys, no migrations, no flag flips. Build behind the CoachHelm player file flag named in `02-PLAN.md`, off in prod.

## Done when

- Every state in `04-FIDELITY-SPEC.md` section 5 exists on a preview route and matches the page side by side, phone and desktop, light and dark, normal text and XXL.
- Every tap in section 6 calls the named server action and the screen changes as drawn.
- Every motion in section 7 matches on the clips, and Reduce Motion is the app's 180ms fade (`CH_FADE_MS`, SHARED-6).
- The player lens matches the player's own board for the same fixture, and never shows coach-only data.
- Every figure on screen comes from a source in `03-DATA-CHECKS.md`, or is hidden.
- Typecheck, lint and the existing CoachHelm tests pass.
