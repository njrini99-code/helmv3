# CURRENT PRIORITIES

_Updated 2026-07-29 04:20 EDT. Worked strictly in order. A priority marked
**in progress** with no corresponding commit has STALLED — restart it._

---

## 🔴 THE #1 ITEM FOR THE MORNING (human decision required)

**Four live cross-tenant data exposures**, all the same mistake: an over-broad
SELECT policy on a table whose rows belong to somebody. All live in prod since
the 2026-05-27 baseline, all verified from migration source.

| Table | Policy | What leaks |
|---|---|---|
| `baseball_players` | `USING (true)` | Every program's roster PII — email, phone, GPA, SAT/ACT |
| `baseball_teams` | `USING (true)` | Every team's secret `join_code` |
| `baseball_team_invitations` | `USING (is_active = true)` | Every live invitation `code`, with its `team_id` |
| `baseball_player_percentiles` | `USING (true)` | Every player's academic + athletic percentile ranking |

**Only two of these were reported by recon.** #3 came from asking what else
used the same `.eq('code', …)` shape as the join_code leak. #4 came from
sweeping the baseline for *every* `FOR SELECT … USING (true)` on a baseball
table instead of stopping at what had been flagged — thirty seconds of grep
that should have run first, and that turned up a policy named "Anyone can view
percentiles" sitting on a per-player table nothing had touched since May.

The third is named "Anyone can view active invitations by code" and never
checks the code. One authenticated account could enumerate every live invite
code in the database and join any team. It was seen twice before and left:
`20260701000000:173` recorded it as deliberately "untouched"; `20260708141000:86`
described the exploit path exactly, narrowed the redemption RPCs, and closed
with *"This narrows but does not fully close the surface."* Closing the read
closes it — invitation ids stop being discoverable, so the parameter change
that migration called for is unnecessary.

The fix is **written and committed as files, applied to nothing**
(`9c4ad335e`, extended by `2c2c939cf`). It ships as a sequenced pair so no
single step can take production down:

| Step | File | Blast radius |
|---|---|---|
| 1 | `20260729000100_..._a_additive.sql` | **None.** Creates six functions, grants EXECUTE. No policy, no revoke, no ALTER. |
| 2 | *(deploy the companion app changes)* | Works under both old and new policies. |
| 3 | `20260729000200_..._b_policies.sql` | Swaps the four policies. **This is the one that closes the leaks and the one that can break things.** |

The invitation fix was folded into these two files rather than added as a new
pair, deliberately: a separate A′/B′ would have made the apply sequence five
steps with two deploy barriers, and the extra ordering is exactly what gets
mis-executed at 09:00 with a demo waiting.

Doing 3 before 2 is an outage — join-by-code, join-by-invitation,
Discover/Compare and roster "Add existing player" all return **empty results,
not errors**, so the symptom is "the product quietly stopped working."

**✅ The SQL is verified by execution.** CI on PR #1092 applies both migrations
to a fresh Postgres and runs the pgTAP suites: **34/34** (tenant isolation) and
**9/9** (Lift Lab sync identity), with **18** more added for the invitation fix
(`2c2c939cf` — awaiting its first CI run). The tenant-isolation suite failed
three times first: two independent recursion cycles that would have made
*every* query against `baseball_players` fail on apply, plus five functions
left anon-callable. None was visible to reading; two adversarial line-by-line
reviews had already missed them. That is why the invitation policy carries an
explicit "USING clause contains no inline subquery" assertion.

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

Nothing. Both parallel workstreams landed and their adversarial reviews were
worked through — see Completed below. The heartbeat (`9234a858`, hourly at
:11) picks up the Queued list.

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
| **P0 retracted** — the staff-invite RPC does check email ownership, at 3 layers | `1f9cc239a` |
| Companion app changes so migration B can be applied (6 call sites, not 4) | `d6a8caffc` |
| Roster "Add existing player": cross-tenant browse → exact-email lookup | `278313df3` |
| **Seed's production guard allowlisted production** — now a deny, + 2 bypasses closed | `f7ffa28b9` |
| **Withheld player data was in the public page's HTML**, not just hidden from it | `403a89f5e` |
| Settings hub unified on one design system (28 files) + a11y contrast fix | `7f7528471` |
| RLS recursion ×2, anon grants, pgTAP write-guard — **CI now PASSES 34/34** | `59037eb9…a61a9b0f` |
| Lift Lab account links repair on re-sync (was write-once, permanently stale) | `30f343e2a` and its migration |
| **Cross-tenant invitation-code exposure closed** — the third `USING`-can't-see-the-query leak, seen and skipped by two earlier migrations | `2c2c939cf` |

All work is on PR [#1092](https://github.com/njrini99-code/helmv3/pull/1092)
(draft).

---

## Queued (not started)

| Priority | Item | Note |
|---|---|---|
| P1 | 34% of `baseball_*` tables have zero pgTAP RLS coverage | Messaging, tasks, travel, announcements, dev plans. Invitations came off this list with `2c2c939cf`; the others are still uncovered, and a hole in any of them would not be caught. The invitation leak is the argument for finishing this — it sat in plain sight for two months in a table nothing tested. |
| P1 | **CI seeds PRODUCTION on every PR** | `seed:baseball:ci` creates auth users and deletes `login_attempts` rows in the production project. Now explicit (`--allow-prod` in package.json) rather than hidden behind a constant named "demo" — but it should probably target a local stack instead. Needs a decision. |
| P1 | `public_profile_mode` DDL default is `'private'`; a 2026-07-09 live read recorded `'unlisted'` | If the DDL is what is live, `baseball_teams_public_profile` is default-**deny** and zeroes cross-org discovery. Recruiting is sunset so impact today is zero. `select public_profile_mode, count(*) from baseball_teams group by 1`. |
| P2 | The `integration` vitest project (5 files) runs in no CI workflow | Includes `coach-onboarding-staff-row` and `player-access-action-gate` — the auth/access tests that matter most. The `rls` project has zero files; pgTAP covers RLS and DOES run. |
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
