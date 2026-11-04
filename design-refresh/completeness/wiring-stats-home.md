# Wiring report: stats-home (4 Nov 2026)

Checked against helmv3 main 03d9087 (read only). Written:
- `## Wiring, 4 Nov 2026` at the end of 06-SCREEN-SPECS.md. It holds the rules plus tables W.1 gate, flag and denied; W.2 My stats; W.3 Team Stats; W.4 Home leg link; W.5 handoffs; W.6 notifications that land here.
- The same heading at the end of 08-ACCEPTANCE.md, with checks W-STATS-1 to W-STATS-20.
- The pointer line under both H1s.
- Fixes in place, each marked "(fixed 4 Nov wiring: ...)".

## 1. Gaps by kind (each now wired in 06)

- **Data: 1.** Practice rounds count today: the default filter is `types: []` (`data/stats-filter.ts:96`) and `matchesFilter` (257) lets every kind through. Fix: with `shs` on and no type picked, `matchesFilter` drops rounds that fail the shared `countsForScoring(r)`. Home applies the same helper in `fullOf` (`player-home.ts:120`). The pressure gap (`stats-figures.ts:175` to 198) and GameMore's Practice row (`GameMore.tsx:52`) keep the uncut window, because they compare practice with tournament play.
- **Actions: 0.** Every write is today's action through `useAction`. Goal and focus actions don't revalidate `/stats`, but each caller already calls `router.refresh()`: GoalSheet 146, Goals 38, 47 and 101, ProposalAnswer 19 and 28. The rule is to keep those calls when re-homing.
- **Privacy: 0.** These are the server filters. A player gets `team.playerId` whatever the address says (`routes/stats.tsx:34` to 41), and the team branch is coach only (55). Teammates' rounds and the team mean are read only for a coach (`stats-player.ts:291` to 303, 398), and the player comparison is Tour only (404 to 407).
- **Notifications: 0 added.** Three rows in 05's "Every way in" were wrong (below).
- **Flags: 1.** `clubhouse_stats_redesign_v1` is not on main. `isFlagEnabled` is server only, so the flag is read in `routes/stats.tsx` and the Home route's player branch and passed down as the prop `shs`.
- **Handoffs: 1.** The Home leg link had no helper. The new one is `ownLegHref(leg)` in `screens/stats/links.ts`, returning `/golf/dashboard/stats#gm-<LEG_SECTION[leg]>`, beside `legDetailHref`. Messages uses `messages?player=` (`StatsPlayer.tsx:172`).

## 2. Moved or wrong citations fixed

- `dev_plan_assigned` is a bell row plus email, not a push. `development.ts:1403` to 1412 stores `CLUBHOUSE_DEV_PLAN_PATH`; it is delivered by `lib/notifications/index.ts:195` to 218, and no sender pushes it. Fixed in 05 "Every way in", 02 (the Goals routing row) and 08 CP-151.
- The `round_submitted` push opens `/golf/dashboard/rounds/<roundId>`, today's round page (`round-submit.ts:1835` to 1838; `push.ts:162` to 167). `/stats/team` is only the fallback when no id is sent. Fixed in 02 (two places) and 05.
- 05 flagoff said "the Home leg rows link as today". On main they are not links (`PlayerGame.tsx` 315 and 354). Fixed.
- For the record: `coach_assigned_goal` lands on CoachHelm Plan (`surface-registry.ts:92`), not S-STATS.goals. It is unchanged and documented in W.6.

## 3. New held migrations

None.

## 4. Product calls for Nick

None needed. Calls I made:
- The practice cut applies only to the default type set. An explicit Practice pick counts practice rounds.
- The pressure gap keeps practice rounds.
- The unused `dev_plan_assigned` push URL mismatch is left alone. `push.ts:219` to 224 would open CoachHelm Plan, but nothing sends that push.

## 5. Exact text for shared files (lead to apply)

The same START_HERE shared-values row and §4 note as in wiring-classes-roster-home.md: one `countsForScoring` helper for Roster, Home and Stats, and figures that differ while only one lane flag is on.
