# CURRENT PRIORITIES

_Updated 2026-07-29 00:45 EDT. Worked strictly in order. A priority marked
**in progress** with no corresponding commit has STALLED — restart it._

---

## 🔴 THE #1 ITEM FOR THE MORNING (human decision required)

**Two live cross-tenant data exposures.** `baseball_players_select` and
`baseball_teams_select` are both `USING (true)` — any authenticated user reads
every program's roster PII and every team's secret join_code. Verified from
migration source; live in prod since 2026-05-27.

The migration and pgTAP tests are being **authored tonight but deliberately NOT
applied** — this is the shared production database with live users, a
mis-scoped RLS policy causes an outage rather than failing safe, and CLAUDE.md
mandates `db-migration-reviewer` for exactly this. See `DATABASE_STATUS.md`.

**Action on waking:** review the migration, run the RLS tests, apply.

---

## In progress (4 parallel teams, strict file ownership)

| Team | Scope | Owns | State |
|---|---|---|---|
| A | Finish recruiting sunset — close direct URLs, remove the unconditional player hub row, consolidate 3 copies of RECRUITING_PROGRAM_TYPES | BaseballFairwayShell, resolve-active-hub, server-route-guards, bottom-nav.test | 🔄 |
| B | **Author (not apply)** RLS tenant-isolation migration + pgTAP tests | 2 new files under supabase/ | 🔄 |
| C | Kill fake-success "Sync Athletes" (reports success, inserts nothing) | lifting/actions/athletes.ts, assignments.ts | 🔄 |
| D | Roster deactivation must propagate to Lift Lab athlete row | baseball/actions/roster.ts | 🔄 |

Each team output goes through an independent reviewer whose default assumption
is that the claim is overstated.

---

## Completed

| Item | Commit |
|---|---|
| Mission state + recovery contract | `58c49d7fd` |
| Central product-module registry (the sunset mechanism) | `ee8264989` |
| Recruiting hidden from all navigation (13 coach + 4 player entries) | `e5d5bec19` |
| Recon findings landed (75 findings, 16 P0, 19 P1) | `6a669c40c` |

---

## Queued (not started)

| Priority | Item | Note |
|---|---|---|
| P0 | Public share-link routes under `src/app/baseball/(public)/` sit outside every recruiting gate | Decide: are these in scope for the sunset? They are the external-facing recruiting artifact. |
| P0 | `middleware.ts:146` — the 4th copy of RECRUITING_PROGRAM_TYPES | Team A reports the needed change; coordinator applies (shared file). |
| P0 | Settings hub stacks three design systems on one page | Highest-visibility UI defect in the demo path. |
| P1 | Seed gaps: Announcements, Travel, Documents, Post-Game Reviews, lifting maxes/bodyweight have NO seed coverage | Demo will show empty states on real routes. |
| P1 | `verify-baseball-demo-coverage.ts` PASS verdict overstates real coverage | It does not check the tables it claims to. |
| P1 | `PlayerProfileClient` — 1,701 lines, almost no Fairway usage | The screen a coach opens most. |
| P1 | Staff invite accept RPC has no email-ownership check | Security; same review gate as the RLS work. |
