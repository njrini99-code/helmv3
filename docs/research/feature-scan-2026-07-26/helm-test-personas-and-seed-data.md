# Helm Test Personas and Seed Data Blueprint

**Research date:** 2026-07-26  
**Rule:** Fictional data only. Never use production PII. Never put service-role keys in Playwright browser context.

---

## 1. Environment recommendation

| Env | Purpose |
|-----|---------|
| **Local Supabase** (`supabase start`) or **dedicated preview branch DB** | Deterministic reset |
| Production Helm-Production | **Do not** run mutating feature scan |

Existing seeds:
- Baseball: `npm run seed:baseball:ci`, `seed:baseball:e2e -- --confirm`, demo chain
- Golf: `supabase/demo/*.sql`, `scripts/seed-demo-team-*.ts` (manual; no `seed:golf` npm script)
- Auth helpers: `e2e/helpers/auth.ts`, `playwright/baseball-auth.setup.ts`, `scripts/save-golf-auth.mjs`

**Gap:** Golf lacks first-class CI seed parity with baseball — **blocker for reliable golf E2E**.

---

## 2. Minimum personas

| ID | Persona | Auth | Org | Team | Role | Access expectations |
|----|---------|------|-----|------|------|---------------------|
| P-ANON | Visitor | none | — | — | anon | Marketing; join entry; public packets only |
| P-INCOMPLETE | Registered incomplete | user | — | — | — | Forced onboarding; no dashboard |
| P-G-HEAD-A | Golf head coach Org A | email | OrgA | TeamA1, TeamA2 | head_coach | Switch teams; full coach UI; Ask writes |
| P-G-ASST-A | Golf assistant Org A | email | OrgA | TeamA1 | assistant_coach | Coach UI; **no** team switch; limited writes to verify |
| P-G-PLY-A1 | Golf player complete stats | email | OrgA | TeamA1 | player | Rounds/stats/coachhelm player; no intelligence |
| P-G-PLY-A2 | Golf player incomplete/no rounds | email | OrgA | TeamA1 | player | Empty states |
| P-G-PLY-B | Golf player Org B “Sam Carter” | email | OrgB | TeamB1 | player | Must not see OrgA |
| P-G-HEAD-B | Golf head coach Org B | email | OrgB | TeamB1 | head_coach | Twin naming for isolation tests |
| P-G-MULTI | Dual coach+player | email | OrgA | — | both profiles | Session prefer coach; test edge |
| P-G-EXPIRED | Expired invite | token only | OrgA | — | invited | Reject join |
| P-G-ADMIN | Golf admin | email | — | — | users.role=admin | `/golf/admin` only |
| P-SUPER | Super admin | allowlist | — | — | SUPER_ADMIN | `/admin` |
| P-BB-HEAD | Baseball head | email | OrgBB | TeamBB | all caps | Smoke suite |
| P-BB-STAFF | Baseball staff limited caps | email | OrgBB | TeamBB | subset caps | Deny roster/import |
| P-BB-PLY | Baseball player | email | OrgBB | TeamBB | player | Today/passport |
| P-BB-FIXTURE-* | #375 seeded users | fixture | e2e ns | — | — | camps/pipeline/box-score |
| P-LIFT-COACH | Lift coach | email | OrgL | — | coach | Programs |
| P-LIFT-ATH | Lift athlete | email | OrgL | — | athlete | Today |
| P-TRIAL / P-PAID | Billing personas | — | — | — | N/A | **Skip** — no product billing |

Passwords: env-injected (`E2E_*`), never committed.

---

## 3. Cross-tenant naming trap (required)

| Org A | Org B |
|-------|-------|
| Name: `Raleigh Hawks Golf` | Name: `Raleigh Hawks Academy Golf` |
| Player: `Sam Carter` (id deterministic) | Player: `Sam Carter` (different id) |
| Team code: `HAWKS-A` | Team code: `HAWKS-B` |
| Event: `Tuesday Practice` same local time | Same title |

Any query returning the other org’s UUID fails the test.

---

## 4. Seed dataset blueprint (Golf Org A)

Deterministic UUIDs (example scheme — generate once and freeze in seed manifest JSON):

| Entity | Lookup key | Notes |
|--------|------------|-------|
| org | `seed.org.hawks_a` | |
| team | `seed.team.hawks_a_men` | timezone `America/New_York` |
| head coach | `seed.coach.hawks_a_head` | staff head_coach |
| assistant | `seed.coach.hawks_a_asst` | |
| players | `seed.player.sam_carter_a`, `seed.player.no_stats_a`, `seed.player.improving_a`, `seed.player.declining_a` | |
| courses | 2 tees with distinct hole yards | avoid #913 clone bug masking |
| rounds | 8–12 completed + 1 in_progress | shots for putting/approach |
| events | past practice, upcoming, recurring series (3) | RSVP yes/no/maybe/none |
| attendance | mixed | |
| focus/goals | 2 active goals + 1 suggested | |
| tasks | open + completed | watch dual-table |
| messages | coach↔player thread | |
| announcements | 1 unacked | |
| qualifier | 1 in_progress with entries | |
| insights | mix v3 matured + v2 + archived | visibility tests |
| chat | 1 conversation with prior tool calls | |
| notifications | unread + read | |

Org B: minimal mirror (coach, Sam Carter, 1 round, 1 event).

---

## 5. Baseball / Lift seed

Reuse existing:
- `seed-baseball-demo.ts` for smoke
- `seed-baseball-e2e.ts` for write flows (`PLAYWRIGHT_BASEBALL_SEEDED=1`)
- Lift: include via baseball demo lifting scripts or minimal `helm_lifting_*` seed

Add isolation org twin if scanning recruiting/public packets.

---

## 6. Reset strategy

1. Prefer **truncate seed schema / dedicated seed namespace** or recreate branch DB.  
2. Idempotent seed with upsert on deterministic emails + external keys.  
3. Global setup: migrate → seed → write storageState per persona.  
4. Per-test: API cleanup of created rows tagged `meta.seed_run_id` where possible.  
5. Never reset production.  
6. Cron side effects: disable crons in test env or assert ignoring async eventual consistency windows.

---

## 7. DB assertion access pattern

| Method | Safe? |
|--------|-------|
| Playwright → Server Action → UI | Yes primary |
| Node helper in setup using service role **server-side only** | Yes in CI |
| Expose service role to browser | **Never** |
| Dedicated `/api/test/verify` gated by `TEST_PROOF_TOKEN` on non-prod | Optional |
| pgTAP for RLS | Already in CI |

Assert: team_id, org_id, actor ids, status, no duplicate, no cross-tenant rows, side-effect tables.
