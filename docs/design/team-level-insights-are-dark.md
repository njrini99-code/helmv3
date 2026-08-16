# Team-level CoachHelm insights are fully built and completely dark

Status: **capability exists end-to-end, produces nothing, needs a product decision.**
Measured 2026-08-16 against production.

`golf_coach_insights` holds 596 rows. **Zero** are team-level
(`player_id IS NULL`). Not "few" — none, ever.

That is not because the feature was never built. Every layer of it exists.

---

## The chain, layer by layer — all present

| layer | file | state |
|---|---|---|
| Type allows it | `v2/insights/types.ts:235` | `player_id: string \| null` |
| Upsert handles it | `v2/insights/upsert.ts:181` | explicit `input.player_id === null ? lookup.is('player_id', null)` branch |
| DB supports it | — | `UNIQUE NULLS NOT DISTINCT (signature, player_id, coach_id, team_id)` — designed for a null player |
| Generator exists | `v2/orchestrator.ts:1027` | `generateTeamPatternInsights(teamId)` — ~80 lines, headline/body/CTA/reasoning chain |
| Writer exists | `actions/insights.ts:1037` | step "6.25", writes `player_id: null`, `insight_type: 'team_trend'`, `cross_player: true` |
| Action exists | `actions/insights.ts:1173` | `generateTeamInsights()` |
| **UI entry point** | `components/golf/coachhelm/insights/InsightsFeed.tsx:74` | **NOT MOUNTED — this is the break** |

`InsightsFeed` is referenced only by its own barrel (`insights/index.ts:12`)
and by `CoachInsightCard.test.tsx`. **No page or component renders it.** Its
mount was removed with the legacy dual-tree in `ffd0fd8ab` ("W1 — Fairway
unconditional, legacy dual-tree deleted") and never replaced.

So `generateTeamInsights()` — the ONLY caller of `generateTeamPatternInsights` —
is never invoked in production, and the entire team-level branch is unreachable.

The consolidated surface does not pick it up either: `intelligence-dashboard.ts`
and `insight-delivery.ts` contain no reference to `team_trend`,
`cross_player`, or a null `player_id`.

## The gate would pass easily — this is not a data problem

`generateTeamPatternInsights` keeps global patterns where
`playerCount >= 2 && confidence >= 0.6`. Production, active roster members,
by team and pattern type:

| team | pattern type | players | instances | avg conf | instances ≥0.6 |
|---|---|---|---|---|---|
| Guilford College | contextual | **11** | 125 | 0.69 | 91 |
| UNC Wilmington | contextual | 5 | 14 | 0.66 | 12 |
| Lynchburg Women's | contextual | 4 | 35 | 0.70 | 24 |
| Guilford College | conditional | 6 | 11 | 0.53 | 5 |

Eleven Guilford players share a single pattern at 0.69 confidence. The gate is
not close to binding. If the entry point existed, this would emit today.

## What a coach is not seeing

The generator already composes exactly the line a D1 coach would want:

> "Team Priority: {pattern} affecting 11 players. Average impact: +X strokes
> per round across 125 observed instances. Estimated team cost: +Y strokes per
> competitive round. Consider a team-wide practice focus targeting this area."

Cross-player synthesis is the thing a per-player insight engine structurally
cannot give a coach, and it is the part of CoachHelm most specific to coaching
a squad rather than an individual. It has never rendered.

## The two `team_trend` rows are NOT this feature

A query for `insight_type = 'team_trend'` returns 2 rows, which looks like the
feature has fired twice. It has not. Both rows:

- carry a non-null `player_id`;
- have `metadata.cross_player` = null (the real writer sets it `true`);
- have a null `signature`;
- are titled "200+ yards: Distance Control Issue (200+ yards)" and
  "200+ yards: Asymmetric Miss Pattern (200+ yards)" — player-scoped approach
  findings mislabelled, from May 2026.

Do not use them as evidence the path works.

## Why this is not fixed here

Wiring it is a product decision, not a mechanical one:

1. **Where does it surface?** The old entry point was a coach-clicked "generate"
   button on a page that no longer exists. The consolidated
   `/dashboard/intelligence` has no team-level view; `?view=signals` is a
   per-player queue and a team insight has no player to attach to.
2. **What triggers it?** Per-player v3 generators run automatically after a
   round. Team insights have NO automatic trigger of any kind — only the manual
   action. Adding one is a scheduling decision.
3. **It writes to the shared production database.** Turning this on starts
   creating `golf_coach_insights` rows for every team on a DB that also serves
   Baseball and Lift Lab.

Any of those three is an owner call. All three together are not something to
enable unattended.

## Suggested next step

Smallest honest slice: mount the existing `InsightsFeed` (or just its generate
control) behind the consolidated intelligence page as a team-scoped section,
run it once against Guilford, and read what it actually emits before deciding
whether it deserves an automatic trigger. The generator's output quality is
unverified precisely because it has never run.
