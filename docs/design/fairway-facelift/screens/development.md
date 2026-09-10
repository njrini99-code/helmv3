<!-- markdownlint-disable MD013 -->
# Development — `/golf/dashboard/development` (coach)

Files: `src/app/golf/(dashboard)/dashboard/development/page.tsx`, `src/components/fairway/pages/coachhelm/FairwayMyDevelopment.tsx` (the player stage view; `DevelopmentDrill.tsx` was deleted in the mobile pass), `src/components/fairway/pages/coachhelm/{RosterHealthHeader,FocusAreaCard,FairwayGoalCard,GoalsSection}.tsx`.

## What the capture shows

The same welcome, program pulse, "bleeding strokes" cards and urgent card as `/intelligence`, then the Roster health header verbatim from `/roster`, then a player card gallery with three buttons per player (Add focus area · Game fingerprint · View genome). Three routes render the same top half.

## Decision

Development is the coach's focus-area and goals desk — nothing else. Keep the route; remove every section that belongs to the cockpit or the roster.

## SCREEN

- Archetype: B (board) with F detail.
- Dominant object: the development board — one MatrixBoard row per player: identity · active focus areas (count + primary area chip) · goal progress (slim Progress) · last outcome recorded · trend glyph · actions (overflow Menu: Add focus area, Fingerprint, Genome).
- Supporting: StatMatrix (Players with a focus area · Active areas · Outcomes recorded · Awaiting) — the "Did the coaching land?" numbers as one object.
- Tertiary: filter by status (FilterPill), sort.
- Modal: FocusAreaModal (existing) opened from the row; goal creation modal.

## CONTAINERS TO REMOVE

Welcome, quick actions, Ask box, Program pulse, bleeding-strokes cards, urgent card, Roster health header, player cards. The FocusAreaCard/FairwayGoalCard visuals move inside the row's inline DrillPanel (desktop) / Sheet (phone) and lose their card chrome (seam rows, StandingBars for standing).

## COMPOSITION (desktop)

```text
ViewHeader   DEVELOPMENT / Focus areas & goals / 4 of 8 players have an active area   [Add focus area]
StatMatrix   4 players · 8 active areas · 5 outcomes recorded · 0 of 13 awaiting
Toolbar      [🔍 player]  [All · With area · Without area]  [Sort ▾]
MatrixBoard  Cole Bennett  3–5ft putting +2 more  ▮▮▮▯ 62%  Improved · Jun 23  ↗  ⋯
             (expand → areas as seam rows with StandingBars + Record outcome Menu; goals)
```

## RISKS

- FocusAreaCard is also used on the player-facing my-development; keep its API, only change how this route composes it (or wrap).
