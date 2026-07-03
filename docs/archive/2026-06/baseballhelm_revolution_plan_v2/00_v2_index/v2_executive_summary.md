# V2 Executive Summary

## Verdict

The V1 BaseballHelm plan was ambitious and directionally strong, but it was not build-ready enough to hand to an autonomous coding agent. It covered too much, prioritized too little, and did not adequately cross-check the proposed future system against the current `helmv3` repo.

The V2 product thesis is sharper:

> BaseballHelm should be the import-first, baseball-specific command layer for college baseball programs that live across spreadsheets, official stat exports, device dashboards, lift systems, class schedules, travel docs, coach notes, and text threads.

It should not become Teamworks with a baseball skin. It should not become a Rapsodo clone. It should not become a full strength platform. It should not become a giant recruiting marketplace. It should win by connecting the baseball program's daily reality into one trusted operating graph.

## What V2 prioritizes

1. **Coach Command Center** — staff landing page answering what changed, who needs attention, what happens today, and what must be acted on.
2. **Player Today** — simple mobile home for schedule, check-ins, tasks, lift/workout, personal focus, and acknowledgements.
3. **Roster + Player Timeline** — the core identity/story layer that connects stats, practice, development, lifts, wellness, academics, availability, and notes.
4. **Import-to-Insight Engine** — messy CSV/upload workflow that maps, matches, validates, commits, rolls back, and generates grounded insights.
5. **Practice Intelligence Loop** — practice focus connected to recent games, coach grades, player goals, availability, workload, and upcoming schedule.
6. **Performance Lite** — lift compliance, wellness/readiness, availability, and workload context without rebuilding TeamBuildr.
7. **Embedded CoachHelm AI** — briefs, flags, summaries, meeting prep, import cleanup, and recommendations with source references.
8. **Demo Mode** — seeded college program showing the full product story immediately.

## What V2 cuts or defers

- Full direct vendor integrations: defer. Import-first is the strategy.
- Recruiting marketplace: do not build. Internal board can be Phase 4 or separate.
- Full compliance engine: do not build. Class conflicts and coach-visible academic context only.
- Full strength platform/exercise library: defer. Build assignments/results/compliance first.
- Open-ended AI chatbot as centerpiece: do not build. AI belongs inside workflows.
- 18+ coach tabs: delete. Navigation must shrink.

## Repo-aware warning

The current repo already has baseball routes, role-aware auth, a command-center route, player/team dashboard routing, sidebar navigation, and existing `baseball_*` data expectations. V2 should extend and refactor those assets. A clean-room implementation would likely create duplicate routes, duplicate schemas, and preventable RLS/auth regressions.

## Build-ready answer

V2 is build-ready as a plan **after** the next coding agent performs a live schema and route verification pass. It is intentionally written to make that first verification mandatory.
