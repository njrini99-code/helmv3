---
paths:
  - "src/app/baseball/**"
  - "src/lib/baseball/**"
  - "src/lib/recruiting/**"
  - "src/components/baseball/**"
  - "src/app/api/baseball/**"
---

# BaseballHelm review checklist

BaseballHelm is a college **baseball recruiting + team-management** product
(coach types: College / JUCO / High School / Showcase; only College/JUCO
recruit). Buyer = the program/coach; players/recruits are often minors.
Business context: `docs/business/07-baseballhelm-context.md`,
`docs/business/03-product-invariants.md`. Code map (point-in-time — this
subsystem is under active rework, trust DB enums/RLS over route detail):
`memory/context/baseballhelm-{database,features,workflows}.md`.

## Always check

- **Recruiting is opt-in** — a player must explicitly activate recruiting
  (`recruiting_activated`); College players can NEVER activate. Nothing may set
  that flag except the player's own activation.
- **Player-type vs. coach-type access** — recruitability has 8 conditions
  (`src/lib/baseball/recruitability.ts` `assertCoachCanRecruitPlayer`). A
  recruit-off / private / college / own-roster player must never surface as
  recruitable. Watch for the three divergent implementations
  (`recruitability.ts`, `discover.ts` inline, `public-profile-access.ts`)
  drifting apart.
- **Pipeline stage consistency** — `baseball_pipeline_stage` has EXACTLY 5
  values (`watchlist, high_priority, offer_extended, committed, uninterested`).
  Any sixth value is rejected by Postgres. `src/lib/recruiting/stages.ts`
  previously declared `contacted` / `campus_visit`, which the UI surfaced and
  the server silently rejected; **that was fixed — they are removed, and a NOTE
  in the file records why.** Do not re-add them.
- **Team data isolation** — every read model/action resolves the active team
  server-side; staff-only reads return `authorized:false` + zero rows for
  non-members. Never trust a client-supplied teamId/coachId/playerId.
- **Duplicate detection** — roster join, watchlist add, and interest add are
  idempotent via unique keys `(team_id,player_id)` / `(coach_id,player_id)` /
  `(player_id,organization_id)`. Preserve those guards. There is NO fuzzy /
  name-based prospect dedup — don't assume one exists.
- **Stat correctness** — respect the three-layer model (`legacy` grandfathered,
  `box-score` canonical, `event-grain` elite; see
  `docs/operations/BASEBALL_STATS_SOURCE_OF_TRUTH.md`). Box-score saves must be
  atomic via the `save_baseball_full_box_score` RPC, never unwrapped
  DELETE-then-INSERT. Zero-stat honesty (null on zero denominator).
- **Idempotent imports** — re-import updates/merges, never duplicates; preserve
  source/timestamp/confidence.

## Block if

- a non-recruitable (recruit-off, private, college, own-roster) player appears
  or acts as recruitable, or recruiting opt-in / role-based visibility breaks;
- a coach can read or mutate another team's data;
- pipeline stages drift from the 5 canonical enum values;
- duplicate recruits/players/events/import rows can be silently created;
- stats are calculated without tests or via non-atomic box-score writes;
- an import is not idempotent, or discards source-system metadata.

## Suggest (non-blocking)

- Speed to key recruiting info (fewer clicks from prospect → decision), and
  finishing a recruiting/roster workflow's "coach can act" step.
- Consolidating the three divergent recruitability checks behind one gate.
- A pipeline-stage state machine (`getNextStage()` exists but is unused) or
  transition validation, if the product wants ordered progression.
- Missing RLS/business-contract tests on recruiting, roster, or stats surfaces.
- Player-facing mobile clarity (a recruit/player understanding their status at a
  glance).

---
*Promoted 2026-08-09 from `src/app/baseball/.greptile/rules.md`, orphaned when
Greptile was dropped 2026-07-20. Claims re-verified at promotion time; the
`contacted`/`campus_visit` item was rewritten — the source rule still called it
a live bug, but it had been fixed.*
