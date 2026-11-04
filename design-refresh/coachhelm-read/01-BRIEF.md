# CoachHelm read: the brief

Approved by Nick, 31 Oct 2026: "Beautiful, polish it and let's get it ready for implementation."
Design page: https://claude.ai/artifact/SUL5hLtah5MmBd2dkU8mTK (local copy `redesign/coachhelm-read.html`).

## What it is

Today a CoachHelm read is a green card, two numbers and a sentence, and the rest sits on a separate Deep dive page in seven look-alike sections. The engine behind every read already stores far more: where the misses gather, both sides of the comparison, how sure it is, which holes, what each miss cost. This redesign puts that on screen as pictures first with the words beside them, and ends every read on what to do.

One read answers four questions in order:
1. What is off (headline, the number, a ladder against the team pool and the Tour, what closing it is worth)
2. Where it shows up (the narrowing funnel, observed counts, not a cause)
3. Why CoachHelm thinks so (the cause in one of three states: counted, likely, not traced yet), and how sure it is
4. What to do (the drill, its targets, Assign as focus)

How it has moved and the rounds behind it sit beside those as evidence.

## Where it lives in today's app

- A new view on the existing CoachHelm route: `src/clubhouse/routes/coachhelm.tsx`, `?view=read`. Coach: `&player=<id>&insight=<id>`. Player: `&insight=<id>`.
- Behind its own flag, `coachhelm_read_v1`, off everywhere. With it off nothing changes: every link still opens today's Deep dive.
- Every link to a read goes through one helper, `readHref(player, insight, on)` in `data/coachhelm-views-shape.ts`, so the Board, the player file, Standing and the other lanes all open the same page and fall back together.
- New files only for the page: `screens/coachhelm/read/` (`ReadPage` and one file per card), `styles/coachhelm-read.css` with the `.ch-hr-` prefix, `data/coachhelm-read-view-shape.ts` and `data/coachhelm-read-view.ts` shaping one `ChReadView` from what the Deep dive already loads (`coachhelm-read-shape.ts` is taken by an existing file), and `data/coachhelm-read-calls.ts` holding the three calls below as one `READ_CALLS` config.
- A preview, `/clubhouse-preview/coachhelm-read?q=approach|penalties|putts&viewer=coach|player&screen=read|board&state=…`, reaches every state for review and for the side-by-side check.
- Phone: today's green bar unchanged (back label is the player's first name for a coach, "CoachHelm" for a player). Desktop: today's sidebar and glass top bar, then three columns (reads rail, the read, the evidence).

`02-PLAN.md` has the file-by-file plan against main 75b4956, and `03-DATA-CHECKS.md` maps every card to the `InsightEvidence` field it reads.

## Rules this build keeps

- Evidence rule stays strict. Nothing is claimed without its counts. A likely cause says "Likely". A player never sees a likely cause, only "Not traced yet" (Q3). A gap says what it is waiting for. The coach-only support pass stays stripped for players (`delivery/player-projection.ts`).
- Nothing changes what shot tracking collects, stores or sends. Every card reads fields already written on the read. The count-down state says so on screen: "Nothing new is asked. It fills as Jonah plays."
- No migration, no new table, no new write. Assign, Dismiss and Message use today's writes.
- The page only says what the read stores. The data map (`03-DATA-CHECKS.md`) found design copy that claimed more; version 3 of the page was corrected to match: a likely cause shows its slice alone, the miss shape is words not a bar, movement reads Before and Now (no dates are stored), players see the sample with no target, worth says "estimated", and the rounds list holds 8.
- PR 0 comes first and stands alone: on main today `diagnosisFor` in `data/coachhelm-dive-shape.ts` keeps the likely-cause drivers for every role and `views/DeepDive.tsx` draws them, so a player can see both arms of a likely cause. PR 0 strips them for the player viewer. It is a fix to today's app, needed whether or not the read ships.
- Design language: flat page, titles inside cards, one feature card per view, amber for losses only, no accent left-border cards, every figure written beside its picture, sizes follow iPhone Text Size, page edge 16 (20 on large phones).
- Prep only: draft PRs, never merged, deployed or flagged on by this work.

## Lanes around it

- This lane does not edit `CoachBoard.tsx` or `PlayerBoard.tsx`. Lane 1 (team board) and the Lenses lane (player file) own those and call `readHref()`.
- Lane 1's ReadSheet and the Lenses lane's EvidenceSheet become one peek sheet. Its "Open the full read" link pushes this page. This lane exports `ReadSummaryCard` for that sheet and for the Board.
- Reduce Motion fade: every crossfade uses `CH_FADE_MS` from `lib/motion.ts`, 180ms today (package rule, SHARED-6), the same as Lenses.

## Nick's three calls (built with the recommended picks, each a default he can flip)

| Call | Built as default | How to flip |
|---|---|---|
| 1. Bring pictures back into the read (design call D8 took the gauges out) | Yes: ladder, funnel, dots, bars and the slope chart, each with its number written beside it | Hide the SVGs; the words already stand alone |
| 2. What players see of the cause | Keep Q3 (no likely cause for players) and show players the funnel, which is observed counts | Don't render Where it shows up for the player viewer |
| 3. Team pool beside the Tour on the ladder | Yes, once `coachhelm_team_pool_v1` is on after the first deploy; until then the ladder shows the player and the Tour | Leave that flag off |

## Done means

Each PR in `02-PLAN.md` passes the side-by-side check in `04-FIDELITY-SPEC.md` §10 (design against built, light and dark, 390, 430, XXL and desktop, plus the motion clips), the contrast pairs in §2, and the Reduce Motion run. Anything that can't be built as drawn is written under "Can't match as drawn" with two options, and the rest carries on.
