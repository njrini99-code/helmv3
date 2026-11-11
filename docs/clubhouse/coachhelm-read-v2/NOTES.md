# CoachHelm read v2: build notes (10 Nov 2026)

The read page rebuilt from the owner's 7 Nov design (`design-refresh/coachhelm-read/redesign/coachhelm-read.html`,
artifact SUL5hLtah5MmBd2dkU8mTK). That page wins over the lane's 05 to 08 files where they differ. Messages was
rebuilt the same way; its notes are `docs/clubhouse/messages-v2/`.

## What is where

| Piece | File |
|---|---|
| The page, its states, the bar, the stepper and J/K, the skeleton | `src/clubhouse/screens/coachhelm/read/ReadPage.tsx` |
| The parts (head, measured, moved, cause, where, rounds, how sure, this week, plan, chips, more reads, rail) | `read/parts.tsx` |
| The coach's and the player's action rows | `read/actions.tsx` |
| Layout CSS, tokens only, `ch-hr-` prefix | `src/clubhouse/styles/coachhelm-read.css` |
| What each viewer's copy carries | `src/clubhouse/data/coachhelm-read-view-shape.ts` |
| Preview fixtures and states | `src/clubhouse/preview/fixtures-coachhelm-read.ts`, `PreviewCoachHelmRead.tsx` |

Preview: `/clubhouse-preview/coachhelm-read?q=penalties|putts|approach&viewer=coach|player&state=…`.
Coach states: open, assigning, assigned, dismissed, stale, partfail, loading, failed, gone. Player states: open,
proposed, focus, stale, loading, failed, gone. Also off, no-rounds, stress.

The class prefix is `ch-hr-`, not the design page's `ch-rd-`: `ch-rd` is the Rounds page's root class.

## Privacy

A player's read never carries a likely cause, another player's figures or the team pool. It is enforced where the
payload is made (`toChReadDetail`, `benchmarkLadder`, `readCauseOf`), not in the view:

- the ladder has no `team_pool` line for a player, whatever `READ_CALLS.teamPoolOnLadder` and the flag say;
- the What line takes the comparison the card draws, never the pooled line;
- the board card's pooled figure (`insight.compare.team`) is nulled on a player's copy;
- what CoachHelm checked, the rung, the arms, the verdict and the range are not built for a player.

`read/__tests__/read-view-privacy.test.ts` searches the whole player payload; `read-page.test.tsx` searches the DOM.

## Can't match as drawn

Each of these is a slot the design draws that the loader has no real source for. The slot is left out.

1. **The eight-round trend line and the Last 8 / Season switch.** The engine stores a read's change as two figures
   (`metadata.movement.from`, `.to`), not a round-by-round series. The card says the change in words.
   Options: (a) the engine writes a per-round series for the read's metric beside `movement`; (b) keep the sentence.
2. **Remove focus, and Undo on the assign toast.** Assign creates a proposed focus area; there is no write that
   withdraws one from the read. Options: (a) add a withdraw write (the focus area's id is returned by the assign
   action) and wire both; (b) keep Message as the assigned row and send the coach to Development to remove it.
3. **Re-check now** (the stale line and the More menu). The only re-check is the whole team's
   (`refreshTeamAnalysisAsCoach`), which spends the team's rate limit. Options: (a) a per-player re-check action;
   (b) link the stale line to the board's team re-check.
4. **"2 newer rounds aren't counted yet".** The read knows the day of the newest round, not how many are newer. The
   line says "A round played Oct 3 isn't counted yet". Options: (a) count the rounds after the read's day in the
   loader; (b) keep the day.
5. **The split under a counted cause** ("Off the tee, per round 0.8 · 17 counted") and **"+1" on each hole.** A
   counted cause stores its path, its count and its example holes; no per-part rate and no per-hole cost. Options:
   (a) the root-cause pass stores them; (b) keep the count sentence.
6. **A count on each round row** ("2 penalties"). Only the example holes (five at most) are stored per round, so a
   per-round count would undercount. Options: (a) store counts per source round; (b) leave the row as date, course,
   score.
7. **"Downhill, against the team and Tour"** on the putting read. The slope read's own figure is the gap (23 pts);
   it stores no downhill rate for the pool or the Tour. Options: (a) the generator stores both; (b) the gap bars only.
8. **The What sentence as prose** ("Eli takes 1.1 penalty strokes a round over 21 rounds. Tour is 0.3. Closing half
   of that gap…"). The What line is the Deep dive's own four-line grammar (`readLines`), the same on every surface.
   Options: (a) a generator-written What sentence per read; (b) keep one grammar.
9. **"Message Coach Reyes"** for a player. The player's read does not load who their coach is; the link says
   "Message your coach" and opens Messages. Options: (a) load the head coach's name and user id with the read;
   (b) keep the general link.
10. **"Cause failed to load".** The cause arrives with the read, so it cannot fail alone. The same pattern is built
    for the parts that can (the rounds, the plan): a notice inside the card with Try again.

## Decisions made while building

- A stale read offers no Assign (the board's rule, `assignStateOf`); the design's stale frame still drew it.
- An assigned read's head pill says Assigned (`stanceOf`), where the design kept Priority.
- The rail keeps the Deep dive's order (by where on the hole), so Eli's penalties read is 2 of 3, not 1 of 3.
- The approach fixture's lift is 2.2 (12 of 20 against 11 of 40); the design page printed 2.1.
- "This read is no longer open" keeps the three true reasons (replaced, cleared, dismissed); the design said replaced.
