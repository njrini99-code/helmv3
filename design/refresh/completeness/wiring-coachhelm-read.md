# Wiring pass: coachhelm-read (4 Nov 2026)

Checked against helmv3 03d9087, read only. Written: `coachhelm-read/06-SCREEN-SPECS.md` and `08-ACCEPTANCE.md` (`## Wiring, 4 Nov 2026`, W-READ-1 to W-READ-20), with pointer lines under both H1s. Shot tracking: nothing changes; the read draws stored engine evidence and round rows, never `golf_shots`.

## 1. Gaps found and filled (14)
- Data (2): the coach read had no corrections, because `loadCoachPlayerDeepDive` never calls `readCorrections`. Fix: `loadCoachRead` calls it with `role: 'coach'`, as the coach board does. The page's searchParams type lacked `insight`; it is a type-only fix.
- Actions (3): the Read "failed" code CH-13860 collided with Standing's How you play (`docs/clubhouse/catalog/coachhelm.md:261`), so it is now CH-13866, fixed in 02, 05, 06, 08 and README. Assign on the board card and the Do card go through `assignStateOf`, a pure mirror of `FocusActions` with a table test. Copy link gained a failure toast, "Couldn't copy the link".
- Privacy (3): CR0. `diagnosisFor` (`data/coachhelm-dive-shape.ts:328-350`) has no role, so a player's payload carries the drivers, cause and reason of a likely cause. Fix: pass the role and return null for a player unless `observed_sequence`; the words don't change, because `whyOf` already says "Not traced yet". The second gap: `ChInsight.why` holds the full text, so the read filters it with `writeUpFor` on the server. The third: plan goals use the Lenses L0 filter in `readPlans`.
- Notifications (1): Assign was undocumented. It sends a bell row `dev_plan_assigned` (no settings gate) and an email gated by `email_task_reminders`, both linking `/golf/dashboard/stats?tab=dev`. No push goes out on this path. Accept and decline notify nobody. This is kept as today's behaviour.
- Flags (2): client modules can't read flags, so `readOn` and `fileOn` are props from the route. The S-READ-BOARD host with Lenses off is section 4.
- Handoffs (3): `readHref(player, insight, on = false)` and `playerFileHref` are in `data/coachhelm-views-shape.ts` after line 130. Ask comes through `askAboutReadHref` (absent while it returns null). Practice exports nothing, so "Add to practice plan" stays absent.

## 2. Citations moved and fixed (75b4956 to 03d9087)
- 02 §3.4: `loadPlayerDeepDive` 103 to 101, feed 135 to 127, `readRounds` 162 to 156.
- 02 §3.5: `ESTIMATED` 94 to 90.
- 03: `coachhelm_team_pool_v1` 708-735 to 710-747.

## 3. New held migrations
None. Corrections (`20261020121000`) and shown reads (`20261021090000`) are applied. Nothing in Read reads the held season standing table.

## 4. Product calls
- Question: with Read on and Lenses off, where does the board's read card (S-READ-BOARD) show? Options: A, as one flag branch on the player's top focus card (`PlayerBoard.tsx:44`) and on the coach Deep dive dossier head; B, ship Read only together with Lenses. My pick: A. With both on, Lenses' feature card draws and this card doesn't. Team never draws it.

## 5. Shared-file text for the lead
- DECISIONS or START_HERE, error codes: "CoachHelm Read uses CH-13861 to CH-13869; its failed state is CH-13866 (CH-13860 is Standing's How you play). Lenses uses CH-13760 to CH-13779."
- START_HERE shared values, links: "Cross-lane CoachHelm links take `on` from the server: `readHref(player, insight, on = false)` and `playerFileHref(playerId, at?, on = false)`, both in `data/coachhelm-views-shape.ts` after line 130; `on` false returns today's address byte for byte."
- BUILD_BRIEF order: "CR0 (the Why role filter) and Lenses PR 0 (the goals share filter in `readPlans`) ship first and alone, with every flag off; each fixes a leak in today's Deep dive."
- To the Ask lane: "Export `askAboutHref` and `askAboutReadHref` from `screens/coachhelm/chat/ask-links.ts` and add `coachhelm_ask_v2` to `config/feature-flags.yml`."
- Ownership note: S-READ-BOARD adds one flag branch each to `PlayerBoard.tsx` (shared with Lenses PR 6) and to the Deep dive head.
