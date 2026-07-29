# CURRENT PRIORITIES

_Updated 2026-07-29 01:25 EDT. Worked strictly in order. A priority marked
**in progress** with no corresponding commit has STALLED — restart it._

---

## 🔴 THE #1 ITEM FOR THE MORNING (human decision required)

**Two live cross-tenant data exposures.** `baseball_players_select` and
`baseball_teams_select` are both `USING (true)` — any authenticated user reads
every program's roster PII (email, phone, GPA, SAT/ACT) and every team's secret
`join_code`. Verified from migration source; live in prod since 2026-05-27.

The fix is **written and committed as files, applied to nothing** (`9c4ad335e`).
It ships as a sequenced pair so no single step can take production down:

| Step | File | Blast radius |
|---|---|---|
| 1 | `20260729000100_..._a_additive.sql` | **None.** Creates three functions, grants EXECUTE. No policy, no revoke, no ALTER. |
| 2 | *(deploy the companion app changes)* | Works under both old and new policies. |
| 3 | `20260729000200_..._b_policies.sql` | Swaps the two policies. **This is the one that closes the leak and the one that can break things.** |

Doing 3 before 2 is an outage — join-by-code, Discover/Compare and roster
"Add existing player" all return **empty results, not errors**, so the symptom
is "the product quietly stopped working."

**✅ The SQL is now verified by execution.** CI on PR #1092 applies both
migrations to a fresh Postgres and runs the pgTAP suite: **`Result: PASS`,
34/34**. It failed three times first — two independent recursion cycles that
would have made *every* query against `baseball_players` fail on apply, plus
five functions left anon-callable. None was visible to reading; two
adversarial line-by-line reviews had already missed them.

**Action on waking:**
1. `db-migration-reviewer` on both files (CLAUDE.md mandates it; this is the
   shared Golf + Baseball production database). CI proves the SQL is correct
   against a *fresh* database — not against production's actual state.
2. Re-verify live `pg_policies`. It could not be read overnight; Supabase's
   Postgres connections timed out on every attempt and CI's own seed step got
   a Cloudflare 522. See `DATABASE_STATUS.md` → ops note.
3. Apply step 1. Verify step 2 is deployed by **exercising** it — join a team
   by code, search a transfer by full email — not by reading the diff;
   merged-but-undeployed looks identical in git. Apply step 3.

**Why not applied overnight:** shared production DB with live users; a
mis-scoped RLS policy locks legitimate users out rather than failing safe,
converting a confidentiality bug into an outage. The exposure has been live
~2 months — the marginal risk reduction from applying at 01:00 unattended
versus 09:00 with the owner present does not justify that. Deferred
deliberately, not missed. See `DATABASE_STATUS.md`.

---

## In progress

| Workstream | Scope | State |
|---|---|---|
| RLS companion app | Repoint join-by-code → RPC, Discover/Compare → `baseball_teams_public_profile` view, roster search → exact-email RPC. Unblocks step 2 above. | 🔄 `w300nbjhy` |
| Seed + UI | Seed gaps (Announcements/Travel/Documents/Post-Game Reviews/lifting), verifier honesty, `PlayerProfileClient` Fairway pass, Settings design unification. | 🔄 `wophbac3a` |

Every packet goes through an independent adversarial reviewer whose default
assumption is that the claim is overstated. All four reviewers on the first
wave returned HOLDS UP with specific corroborating evidence.

---

## Completed

| Item | Commit |
|---|---|
| Mission state + recovery contract | `58c49d7fd` |
| Central product-module registry (the sunset mechanism) | `ee8264989` |
| Recruiting hidden from all navigation (13 coach + 4 player entries) | `e5d5bec19` |
| Recon findings landed (75 findings, 16 P0, 19 P1) | `6a669c40c` |
| Middleware closes direct-URL access to recruiting | `9a55282ff` |
| **Recruiting doors closed** at route guards + hub resolver, restoration path kept under test | `2112fc2a7` |
| Bottom nav no longer silently renders 3 tabs for JUCO coach / JUCO+HS players | `88d467ce2` |
| "Sync Athletes" actually syncs; assigning a team seeds its athletes; honest result copy | `b9597ec25` |
| Roster status changes propagate to Lift Lab (`is_active`, never delete) | `8660e0579` |
| RLS tenant-isolation fix authored as a safe 3-step deploy sequence | `9c4ad335e` |
| Public scout-packet share link closed under the sunset | `f72731974` |

---

## Queued (not started)

| Priority | Item | Note |
|---|---|---|
| P0 | Staff invite accept RPC has no email-ownership check | Any authenticated user holding a leaked invite token can join any team **as staff**. Combined with open self-signup the blast radius is large. Same review gate as the RLS work — author, do not apply. |
| P1 | 35% of `baseball_*` tables have zero pgTAP RLS coverage | Messaging, tasks, travel, announcements, invitations, dev plans. A hole in any of them would not be caught. |
| P1 | `vitest` `rls` project is declared (`vitest.config.ts:99`) but run by **no CI workflow** | So the RLS tests that do exist gate nothing. |
| P1 | `helm_lifting_athletes.user_id` is write-once at seed time, never re-synced, verified stale in prod | Any player synced before their account is linked permanently fails the athlete-self gate at `/lifting/dashboard`. |
| P1 | `baseball_team_invitations` uses the same unaudited `.eq('code', code)` shape | Sibling of the join_code exposure; never audited. |
| P2 | Elite stat event model — 8 tables, ~10 migrations, **zero rows** in production | Dead schema. Decide: keep, or graveyard it. |

---

## Decisions taken tonight (challengeable)

- **Recruiting sunset preserves rather than deletes.** Tests that asserted
  pre-sunset behaviour were kept and re-run under a mock-enabled module
  ("restoration path") instead of being flipped to expect the new behaviour.
  Flipping them would prove the door is shut while deleting the only proof that
  opening it again works.
- **`/player/[id]`, `/team/[id]`, `/program/[id]` stay public.** Only
  `/packet/[token]` was gated. A player's own public profile is not a
  recruiting artifact the way a scout packet is; gating it removes a feature we
  still sell. Same reasoning that kept `/academics` out of the sunset.
- **Bottom-nav sunset fallback is applied at read time, not by editing
  `program-type-variants.ts`.** The variant table still declares Recruiting for
  JUCO/HS because that is still the right answer when the module returns.
- **Roster "Add existing player" narrows from substring browse to exact email.**
  The old search returned strangers' email addresses from every program — the
  leak shipped as a feature. The legitimate capability is "add a player I
  already know of", not "browse players I don't".
