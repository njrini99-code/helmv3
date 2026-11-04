# Wiring pass: coachhelm-lenses (4 Nov 2026)

Checked against helmv3 03d9087, read only. Written: `coachhelm-lenses/06-SCREEN-SPECS.md` and `08-ACCEPTANCE.md` (`## Wiring, 4 Nov 2026`, W-LNS-1 to W-LNS-21), with pointer lines under both H1s. Shot tracking: nothing changes; field and SG read round and standing rows, and the penalty strip reads `golf_rounds.total_penalties`, never `golf_shots`.

## 1. Gaps found and filled (9)
- Data (2): §2.4 (line 503) and §9 still said "Edit plan" is a link with no write. §13 item 2 had already moved it to an in-place sheet with `setIntent`; both rows are fixed in place. `setIntent` revalidates only Roster, so after Save the card swaps from the saved values with no `router.refresh()`, which would also record the file's exposure again.
- Actions (3): Save plan failure had no code; it is now CH-13760, the first of the lane's block CH-13760 to CH-13779, fixed in 02, 05, 06 and 08. Accept and Decline reuse today's `ProposalRow`, so their codes are today's CH-13004 and CH-13005 (`Proposals.tsx:35, 44`), not new ones. Dismiss and Undo were cited in the wrong file; they are `insights-feed.ts:681` and 790.
- Privacy (1): L0. `readPlans` (`data/coachhelm-dive.ts:53-71`) loads goals through the admin client with no share filter, so today's coach Deep dive can show a player's private goal. Fix: a viewer parameter; for a coach, keep a goal only when `creator_role === 'coach' || shared_with_coach` and it is on this team (the `goals_coach_view` rule). It ships alone with every flag off. The lens never calls `getInsightsForPlayer`. The player's field card has no dots and needs `field_n` of 5 or more.
- Notifications (1): Assign sends the player a bell row and an email gated by `email_task_reminders`; no push. Accept and Decline notify nobody; the coach sees the handshake on the next load.
- Flags (1): the plan said the shown-reads migration was held; HELD.md row 216 says it was applied 2026-10-21. The track card doesn't use it.
- Handoffs (1): the evidence sheet imports Team's `ReadPanel` with nothing of its own inside. Also confirmed: `playerFileHref(…, on)`, the Roster `?player=` profile link, and Messages `?player=` (`Messages.tsx:179`).

## 2. Citations moved and fixed (75b4956 to 03d9087)
- Route: `ClubhouseCoachHelmRoute` 166, track record 183, `coachDrill` 191-197, player branch 224-233, `CoachPlayerPage` 114-132 (two places).
- CSS import after line 41.
- `DeepDive.tsx` open-read session key 661 to 677.
- Dismiss and Undo file corrected to `insights-feed.ts`.
- Shown reads marked APPLIED.

## 3. New held migrations
None. Every write is an existing action. The SG card reads lifetime standing while `20261024151000_golf_player_standing_season` is held, as Standing does today.

## 4. Product calls
- Question: should the coach be told when a player accepts or declines a focus? Options: A, no change (the handshake shows it on the next load); B, a new bell row to the coach. My pick: A, since B is a new notification the brief doesn't ask for.

## 5. Shared-file text for the lead
- DECISIONS error codes: "Lenses uses CH-13760 to CH-13779 (Save plan failure CH-13760); Accept and Decline keep today's CH-13004 and CH-13005."
- BUILD_BRIEF order: "Lenses PR 0, the goals share filter in `readPlans` (`data/coachhelm-dive.ts:53`, callers 121 and `coachhelm-player.ts:194`), ships first and alone with every flag off. A test proves a private player goal never reaches a coach's shape."
- START_HERE links row: the same `playerFileHref` and `readHref` text as the Read report.
- Ownership note: Lenses PR 6 and Read's S-READ-BOARD both add a flag branch to `PlayerBoard.tsx`. When both flags are on, the Lenses feature card wins; whichever PR lands second rebases.
