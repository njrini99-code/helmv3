# CoachHelm read v2: build notes (10 Nov 2026)

The read page rebuilt from the owner's 7 Nov design (`design-refresh/coachhelm-read/redesign/coachhelm-read.html`,
artifact SUL5hLtah5MmBd2dkU8mTK). That page wins over the lane's 05 to 08 files where they differ. Messages was
rebuilt the same way; its notes are `docs/clubhouse/messages-v2/`.

How the design is read (owner, 10 Nov): its structure, content, states, motion and ideas are followed closely; every
control is Clubhouse's real primitive from `src/clubhouse/ui/**`, never the mockup's own.

## What is where

| Piece | File |
|---|---|
| The page, its states, the bar, the stepper and J/K, the skeleton | `src/clubhouse/screens/coachhelm/read/ReadPage.tsx` |
| The parts (head, measured, moved, cause, where, rounds, how sure, this week, plan, chips, more reads, rail) | `read/parts.tsx` |
| The coach's and the player's action rows, the held writes, Re-check now | `read/actions.tsx` |
| Layout CSS, tokens only, `ch-hr-` prefix | `src/clubhouse/styles/coachhelm-read.css` |
| What each viewer's copy carries, the What sentence | `src/clubhouse/data/coachhelm-read-view-shape.ts` |
| The read's own rounds: trend, round notes, newer rounds, hole scores | `data/coachhelm-read-extras-shape.ts` (pure), `data/coachhelm-read-extras.ts` (reads) |
| The loaders, the player's coach | `data/coachhelm-read-view.ts` |
| Preview fixtures and states | `src/clubhouse/preview/fixtures-coachhelm-read.ts`, `PreviewCoachHelmRead.tsx` |

Preview: `/clubhouse-preview/coachhelm-read?q=penalties|putts|approach&viewer=coach|player&state=…`.
Coach states: open, assigning, assigned, dismissed, stale, partfail, loading, failed, gone. Player states: open,
proposed, focus, stale, loading, failed, gone. Also off, no-rounds, stress.

The class prefix is `ch-hr-`, not the design page's `ch-rd-`: `ch-rd` is the Rounds page's root class.

## Privacy

A player's read never carries a likely cause, another player's figures or the team pool. It is enforced where the
payload is made, not in the view:

- `toChRead` (the Deep dive's shaper, so the Deep dive too) builds a player's What line without the pool sentence;
- the ladder has no `team_pool` line for a player, whatever `READ_CALLS.teamPoolOnLadder` and the flag say;
- the board card's pooled figure (`insight.compare.team`) is nulled on a player's copy;
- what CoachHelm checked, the rung, the arms, the verdict and the range are not built for a player;
- the trend, the round notes and the hole scores are the player's own rounds, read for the one player the page is
  scoped to. The one name on a player's page is their own coach's.

`read/__tests__/read-view-privacy.test.ts` searches the whole player payload; `read-page.test.tsx` searches the DOM;
`src/clubhouse/__tests__/coachhelm-read-team-pool.test.ts` holds the Deep dive to the same rule.

## The ten slots the first build left out

| # | Slot | Now | Source, or the exact gap |
|---|---|---|---|
| 1 | The trend line and the Last 8 / Season switch | Built | The read's metric per round from the attribution registry's per-round source (`lib/coachhelm/v3/causality/metric-sources.ts`: `golf_rounds` and `golf_round_stats_cache` columns), over countable rounds. A metric the registry marks as having no per-round series (putt make rate by distance, miss bias, the slope gap, proximity bands) and one it does not know draw no trend; the stored before and after is then a quiet row under the measure. To cover those: a per-round cache for the bucket (the registry's own note names `golf_round_putt_distance_cache`), which is a schema change. |
| 2 | Undo on Assign, and Remove focus | Built | Both wait behind an eight-second Undo in the page (the pattern of the board's Decline): nothing is saved and the player is told nothing until it closes; leaving the page sends it at once. Remove focus is the coach's existing `deleteFocusArea`, offered on a focus made from this read. |
| 3 | Re-check now | Built for a coach | `refreshPlayerAnalysisAsCoach(playerId)`: the existing per-player re-check (auth, the engine's rate limit and team membership checked in the action). It takes Assign's place on a stale read. A player has no re-check action; theirs says the line only. |
| 4 | "2 newer rounds aren't counted yet" | Built | Countable completed rounds dated after the read's last refresh (else its window's end). |
| 5 | The split under a counted cause; "+1" on each hole | Built | The split (`splitOf`) is the narrowing's first step over the read's rounds, beside everything else ("17 of 23" over 21 rounds is 0.8 a round off the tee and 0.3 everywhere else). It is drawn only where that arithmetic is sound: the read is a count a round over a sample of rounds, its own figure times those rounds is the cause's event count, and the step counts those same events. Any other read draws none. "+1" is the hole's score less its par (`golf_holes`). |
| 6 | A count on each round row | Built | The same per-round source as the trend ("2 penalties", "9 of 14 fairways"). |
| 7 | "Downhill, against the team and Tour" on the putting read | Not built | The slope generator (`lib/coachhelm/v3/generators/putt-slope-bias.ts`) stores the player's two make rates and the gap. No downhill make rate is stored for the team pool, and `golf_pga_standards` has no make rate by slope, so there is no figure to draw. Needs: the generator to pool `downhill_pct` across the team, and a Tour value by slope and distance (new reference data). |
| 8 | The What line as prose | Built | `whatProse`: the generator's own first sentence, the sample when it did not say it, the comparison by name, what closing the gap is worth. No new figure. |
| 9 | "Message Coach Reyes" | Built | Home's rule for who a player's coach is (`player-home.ts coachFor`): the coach who made the team, else the organisation's first coach with an account. Without one, "Message your coach" opens Messages. |
| 10 | "Cause failed to load" | Built as the part that can fail | The cause arrives inside the read's own row, so it cannot fail alone. The holes behind a counted cause come from the rounds read (`whereFor` over the loader's rounds); when that read fails (`failed.rounds`) and no hole came through, "Where it happened" says so in its card with Try again, and the count above stays. With the rounds loaded and no hole on file, the card is not drawn. |

## Decisions made while building

- A stale read offers no Assign (the board's rule, `assignStateOf`); Re-check now is its one primary.
- An assigned read's head pill says Assigned (`stanceOf`), where the design kept Priority.
- The rail keeps the Deep dive's order (by where on the hole), so Eli's penalties read is 2 of 3, not 1 of 3.
- The approach fixture's lift is 2.2 (12 of 20 against 11 of 40); the design page printed 2.1.
- "This read is no longer open" keeps the three true reasons (replaced, cleared, dismissed); the design said replaced.
- The trend's caption is the window's own figure ("1.5 a round over the last 8 rounds"), not the design's "1.4 to
  1.1", which is the engine's stored before and after and stays in its own row.
- The season is 1 August on (`data/season.ts seasonStartDate`), on the default zone; the switch shows only when the
  season holds other rounds than the last eight.

## Still shared, not this lane's to change

- The Segmented's options are 36px tall on the phone and 34px at `sm` (`styles/controls.css`, the phone block that
  sets `.ch-root .ch-seg .ch-seg__b { height: 36px }`). The read's three tabs and the trend's window switch inherit it.
- The pushed bar's back label falls to "Back" when the centred title leaves no room (`ui/PhoneBar.tsx`), as for a
  player's "Course management".
