# ISSUE LEDGER — BaseballHelm overnight

_Source: 35-agent reconnaissance workflow, 2026-07-29 ~00:05 UTC. 75 findings;
release-blocking claims were adversarially verified by an independent skeptic._

**How to read this.** `state` is what the code actually does today, not what a
doc claims. P0 = blocks a sellable demo or exposes data. Work strictly in
priority order.

---

## ➕ ADDED 2026-07-30 — found by pointing CI at a fresh database

_These are not from the reconnaissance workflow. They came out of repointing the
required smoke gate off production (PR #1125), which is why nothing above caught
them: **every check in this repo had only ever run against a database that already
had the missing piece.**_

### Fixed in the same pass

| # | Finding | State | Anchor |
|---|---|---|---|
| N.1 | `on_auth_user_created` on `auth.users` is in **no tracked migration** — on any DB built from migrations, signup never creates the `public.users` row, so every FK into it fails | `missing` | `supabase/migrations/20260730020000_auth_user_created_trigger.sql` |
| N.2 | The `avatars` storage bucket + its 4 `storage.objects` policies are in **no tracked migration** — avatar upload dead on every local stack / preview branch, and it is on the **golf onboarding** path | `missing` | `supabase/migrations/20260730030000_avatars_storage_bucket_rls.sql` |
| N.3 | The demo seed never wrote `baseball_team_coach_staff` — the demo coach belonged to no team, so **every authenticated page** sat on "Opening your command center" | `renders_but_inert` | `scripts/seed-baseball-demo.ts` |
| N.4 | `scripts/seed-baseball-e2e.ts` had **no production-target guard at all** while `playwright.yml` ran it against prod on every push to `main`, creating auth users and DELETEing camp registrations | `insecure` | `scripts/lib/seed-target-guard.ts` |

N.1 and N.2 share one structural cause: the active baseline
`20260527000000_prod_public_baseline.sql` is a **public-schema-only** dump, so
nothing in `auth`, `storage`, `cron` or `realtime` could ever have been captured by
it. N.2 was found by deliberately sweeping for the class after N.1.

### 🔴 OPEN — two golf features have never worked, anywhere

**N.5 — `golf-attachments` and `expense-receipts` buckets do not exist**

- **Anchor:** `src/lib/storage/attachments.ts:11`, `src/app/golf/actions/travel.ts:885`
- **State:** `renders_but_inert`
- **Evidence:** Verified by read-only SQL against production 2026-07-30: neither id
  is in `storage.buckets`, `storage.objects` holds **zero** rows for either, and
  both backing tables are empty (`golf_message_attachments` 0,
  `golf_travel_expenses` 0). No migration creates them either. Both upload paths
  are genuinely reachable, checked past the import: `expense-receipts` ←
  `uploadExpenseReceipt` ← `FairwayExpenseForm.tsx:164` ← `FairwayTravel.tsx:478`;
  `golf-attachments` ← `sendGolfMessageWithAttachments` ←
  `use-message-attachments.ts` ← `FairwayMessages.tsx:117`.
- **Impact:** Golf message attachments and travel expense receipts have **never
  worked** — every upload fails at the storage call. Severity is tempered by the
  zero rows: this is **broken-and-unused**, not users hitting errors. Nobody has
  ever successfully attached a file or a receipt.
- **Why not fixed in that pass:** creating them means designing **new RLS** for the
  shared production database — conversation-membership scoping for attachments,
  team-staff scoping for receipts (which also needs `public = true`, since the code
  calls `getPublicUrl`). Hand-written RLS on this database produced two recursion
  cycles and five anon-callable functions earlier in this same run, none of which
  was visible to reading. Needs a deliberate reviewed pass, and creating buckets in
  production is an owner action.
- **Not lost:** recorded as `KNOWN_MISSING_BUCKETS` in
  `src/test/schema/storage-buckets-tracked.test.ts`, with a stale-entry assertion
  that forces the lines out once they are fixed.

**N.6 — two `.rpc()` targets exist nowhere (dormant)**

- **Anchor:** `src/app/baseball/actions/recruiting-philosophy.ts:344,398`
- **State:** `missing`
- **Evidence:** `calculate_grad_year_percentiles` and
  `calculate_player_match_score` are created by no migration, and `pg_proc` returns
  **zero rows** for both in production in any schema. Both sit in exported functions
  nothing calls; the module's one consumer imports only
  `saveRecruitingPhilosophy`.
- **Impact:** Dormant. They would fail if reached, and they are not reachable —
  sunset recruiting surface. **Deliberately not fixed either way:** authoring them
  builds out an intentionally-hidden feature; deleting the call sites deletes
  recruiting code.

**N.7 — the CSP omits PostHog's origin, so the analytics integration cannot work**

- **Anchor:** `next.config.mjs` (`connect-src`), `src/components/providers/PostHogProvider.tsx:19`
- **State:** `missing`
- **Evidence:** `PostHogProvider` is mounted in the ROOT layout
  (`src/app/layout.tsx:126`) and initialises with
  `api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'`.
  Neither that host nor any `*.posthog.com` appears in `connect-src`, so every
  `posthog.capture()` would be refused by the browser — the identical mechanism
  that made the local Supabase stack unusable (N.8 below / PR #1125).
- **What is NOT claimed:** that this is why PostHog has no data. The provider
  no-ops without `NEXT_PUBLIC_POSTHOG_KEY`, and that key is **commented out** in
  `.env.example`, absent from `.env.local`, and in no CI or deploy config in this
  repo. Vercel's environment could not be read from here, so the key may simply
  never have been set. Both explanations are live and this entry does not pick one.
- **Why it matters either way:** it is a latent trap with a very expensive failure
  mode. Someone sets the key, PostHog initialises, every request is silently
  refused, and it presents as "PostHog is dark" — a conclusion already recorded for
  other reasons, so the CSP would not be suspected. Diagnosing the equivalent
  Supabase case took three CI rounds and was only found in a Playwright trace's
  console.
- **Deliberately NOT fixed here, and this differs from the Supabase case.** The
  Supabase fix provably adds NOTHING in production (the origin is only emitted when
  the target is loopback). Allowing a third-party analytics origin is a
  privacy/security decision about sending user data off-platform, not a mechanical
  repair — that is the owner's call, not a 2am one. The ready-made shape, if
  wanted, mirrors `src/lib/security/local-supabase-csp.mjs`: derive the origin from
  `NEXT_PUBLIC_POSTHOG_HOST` at build time and emit it **only when
  `NEXT_PUBLIC_POSTHOG_KEY` is also set**, so a deployment not using PostHog keeps
  a byte-identical CSP.
- **Papercut found alongside it:** `.env.example:85` suggests
  `NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com` while the code defaults to
  `https://us.i.posthog.com`. Whichever is right, an allowlist would have to match
  the one actually used.

**N.8 — our own CSP blocked the local Supabase stack** — FIXED in PR #1125.
`connect-src` allowed `ws://127.0.0.1:*` (Next's HMR socket) but no `http://`
loopback origin, so the browser refused every `supabase-js` call. It presented as a
hang, not an auth error: the client `getUser()` fetch was refused, so
`DashboardSessionGuard` never settled and sat on "Opening your command center".
This is why all 16 authenticated smoke renders failed once the gate was repointed at
a local stack — and it means `supabase start` + `npm run dev` had never been able to
authenticate in a browser either, which is plausibly part of why nobody used the
local stack, the same blind spot that let N.1 and N.2 survive for months.

**N.9 — `baseball_team_coach_staff_select` differs between production and the
migrations, so a rebuilt database hides staff from players**

- **Anchor:** `supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql`
  vs live `pg_policies`
- **State:** `inconsistent`
- **Evidence:** read live from production 2026-07-30, the policy is
  `is_baseball_team_staff(team_id) OR is_baseball_team_member(team_id)`. The last
  tracked migration to create it produces
  `is_baseball_team_staff(team_id) OR coach_id = get_my_coach_id()`. No later
  migration redefines it.
- **Impact:** benign for recursion — both forms call only `SECURITY DEFINER`
  helpers, so neither cycles. But the visibility rule genuinely differs: in
  production a **player on the team can see their team's staff rows**; on a
  database built from migrations they cannot, because the second branch narrows to
  "this staff row is my own coach row". A rebuilt or preview database would hide
  coaching staff from players, and the table carries a `visible_to_players` column,
  which suggests production's behaviour is the intended one.
- **Not fixed:** deciding which predicate is correct is a product call about what
  players may see, and changing production's policy is the owner's, not a
  by-product of a CI repair. Filed with both predicates written out so the decision
  is a reading rather than an investigation.
- **How it was found:** pre-emptively, while checking whether the coach half of the
  smoke failure had a *different* cause from the player half (N.10). It did not —
  every context-path policy on the coach side uses definer helpers only — but the
  comparison surfaced this.

**N.10 — the migrations create an infinitely-recursive RLS policy** — FIXED in
`20260730040000`. `baseball_team_members_select` from the 2026-05-27 baseline
contains `EXISTS (… JOIN baseball_team_members btm …)` — a subquery over the table
the policy is on — so Postgres rejects **every** select against it with
`infinite recursion detected in policy for relation "baseball_team_members"`. No
later migration replaced it. Production instead has
`… OR is_baseball_team_member(team_id)`, a definer call, applied out of band and
never committed. `20260729000200`'s own comments trace this exact cycle and cite the
baseline's line numbers — its author escaped it for `baseball_players_select` and
left the other half in place. **This breaks any restore or rebuild of production
from migrations**, which is the disaster-recovery path.

### Swept and clean — recorded so nobody re-runs it

- **Tables and views: 255 relation names addressed from `src/`, all created by
  tracked migrations.** The only three misses were false positives — `documents` and
  `logos` are storage *buckets* reached via `supabase.storage.from(...)`, and `t` is
  a variable.
- **RPCs: 63 of 65 tracked** (the 2 above are the exception).
- **Non-public schemas:** production's one `pg_cron` job
  (`purge-admin-event-telemetry`) is tracked (`20260703043000`), 7 of 8 storage
  buckets were tracked before N.2, and 23 of 27 storage policies.

Four guards under `src/test/schema/` now hold this class shut. All are
**source-text**, on purpose: a database test cannot catch a missing object, because
it runs against the database that is missing it — which is exactly why the pgTAP
suites saw none of N.1–N.4.


## P0 (16)

| # | Finding | State | Anchor |
|---|---|---|---|
| 1 | Settings hub stacks three unrelated design systems on one page | `inconsistent` | `src/app/baseball/(dashboard)/dashboard/settings/page.tsx:10` |
| 2 | Recruiting is NOT sunset/hidden behind any flag — fully live, real, DB-wired feature | `works` | `src/app/baseball/actions/watchlist.ts:90` |
| 3 | Recruiting is NOT sunset/flagged despite the stated plan — full recruiting surface still live in nav | `inconsistent` | `src/lib/baseball/nav-registry.ts:638` |
| 4 | Native Lift Lab "Sync Athletes" button (Athletes page) reports fake success | `renders_but_inert` | `src/app/lifting/actions/athletes.ts:25` |
| 5 | Staff-invite accept RPC in production has no email-ownership check — any authenticated user can join any team as staff via a leaked token | `insecure` | `supabase/migrations/20260624000081_baseball_staff_roles_scope_audit.sql:268` |
| 6 | Three independently-maintained copies of the recruiting program-type set | `inconsistent` | `src/lib/supabase/middleware.ts:146` |
| 7 | No existing on/off flag — every current gate answers 'is this program recruiting-CAPABLE', which is TRUE for college | `missing` | `src/lib/baseball/server-route-guards.ts:100` |
| 8 | Player-side 'Recruiting' hub row is unconditional — bypasses the registry filter entirely | `insecure` | `src/app/baseball/(dashboard)/BaseballFairwayShell.tsx:269` |
| 9 | scout-packets, camps, and activate pages bypass both central recruiting route guards | `inconsistent` | `src/app/baseball/(dashboard)/dashboard/scout-packets/page.tsx:30` |
| 10 | Public unauthenticated share-link routes are the actual external recruiting product and sit outside all gating discussed | `missing` | `src/app/baseball/(public)` |
| 11 | baseball_players SELECT policy is USING(true) — any authenticated user reads every player's PII across every tenant | `insecure` | `supabase/migrations/20260527000000_prod_public_baseline.sql:18179` |
| 12 | baseball_teams SELECT policy is USING(true) — every team's secret join_code is world-readable to any authenticated user | `insecure` | `supabase/migrations/20260527000000_prod_public_baseline.sql:18377` |
| 13 | Broader Playwright suite is chronically red on main, including real baseball regressions, and blocks nothing | `insecure` | `.github/workflows/playwright.yml:28` |
| 14 | 35% of baseball_* tables have zero pgTAP RLS test coverage, including messaging, tasks, travel, announcements, invitations, dev plans | `missing` | `supabase/tests/rls` |
| 15 | Helm Lift Lab's real schema (helm_lifting_*, not baseball_*) is mostly untested at the RLS layer — including the set-results table itself | `missing` | `supabase/tests/rls` |
| 16 | Lift-session lifecycle transitions (start/complete) have zero test coverage | `missing` | `src/app/lifting/actions/player-sessions.ts:189` |

<details><summary>P0 detail</summary>

**P0.1 — Settings hub stacks three unrelated design systems on one page**

- **Anchor:** `src/app/baseball/(dashboard)/dashboard/settings/page.tsx:10`
- **State:** inconsistent
- **Evidence:** Imports `SectionMasthead` from Living Annual (line 9) for the header, `InlineNotice` from Fairway (line 10) below it, then renders every card below with legacy shadcn `Card`/`CardContent` from `@/components/ui/card` (line 3), including `<Card variant="glass">` at lines 121, 320, 328, 337 and raw `text-warm-900`/`text-warm-500`/`bg-primary-100`/`text-primary-600` classes throughout (lines ~237-317). `variant="glass"` is the exact bg-white/70-backdrop-blur anti-pattern Fairway's Surface primitive (src/components/fairway/surfaces/surface.tsx:5-8) was built to replace.
- **Impact:** The page a coach uses to manage their account, program, staff, and billing-adjacent settings visibly does not match the polish of Command Center or Roster right next to it in the nav — undermines the 'this looks like one finished product' read a buyer needs in the first 5 minutes.

**P0.2 — Recruiting is NOT sunset/hidden behind any flag — fully live, real, DB-wired feature**

- **Anchor:** `src/app/baseball/actions/watchlist.ts:90`
- **State:** works
- **Evidence:** Grepped the entire codebase for any recruiting kill-switch (isRecruitingEnabled, RECRUITING_ENABLED, sunsetRecruiting, etc.) — zero hits outside an unrelated per-org golf DB column. src/lib/baseball/nav-registry.ts:636-690 shows Pipeline/Discover/Watchlist nav items gated only by pre-existing coach_type business logic, not a sunset toggle. Read addToWatchlistAction (watchlist.ts:90-195) end to end: real auth+capability check, real assertCoachCanRecruitPlayer() privacy gate, real INSERT into baseball_watchlists, real revalidatePath, real notification email. Same for addToInterests (interests.ts:73-140) and player-peek.ts's full P0 privacy-gated read path.
- **Impact:** The mission brief instructs recruiting be hidden behind a flag with code preserved, for a college-program buyer demo tomorrow morning. As of this codebase snapshot that work has not started at all — Discover, Watchlist, Pipeline, Scout Packets, and Interests are all fully reachable, fully functional, and will render to any coach whose coach_type supports recruiting. If the founder's plan depends on recruiting being invisible by morning, no gating mechanism exists yet to flip.

**P0.3 — Recruiting is NOT sunset/flagged despite the stated plan — full recruiting surface still live in nav**

- **Anchor:** `src/lib/baseball/nav-registry.ts:638`
- **State:** inconsistent
- **Evidence:** nav-registry.ts declares 12 fully-wired recruiting nav ids as live, unguarded entries: pipeline (638), college-interest (656), discover (670), watchlist (682), compare (696), comparisons (709), scout-packets (721), scouting (788), colleges (1021), journey (1009), analytics (983), player-activate (1055), camps (761, role:'both'). A repo-wide search for a recruiting feature flag (RECRUITING_SUNSET / recruitingSunset / isRecruitingEnabled / RECRUITING_ENABLED etc. in src/lib and src/app/baseball) returns zero hits.
- **Impact:** The mission states recruiting should be 'hidden behind a flag, code preserved' before the buyer demo. As of this recon, a coach account will see Pipeline, Discover, Watchlist, Compare, Scouting, etc. as normal, fully clickable nav items with real data behind them — nothing is hidden. Whoever owns the sunset work has not started it, or it lives outside src/lib/baseball/nav-registry.ts.
- **Fix:** Add a single boolean gate (e.g. in getVisibleBaseballNav / isBaseballNavEntryVisible) keyed off the recruiting-hub ids, default OFF, and confirm the routes themselves (pipeline/discover/watchlist/compare/comparisons/scout-packets/scouting/colleges/journey/analytics/college-interest/player-activate/camps page.tsx guards) also honor it so direct-URL access is blocked too, not just the nav link.

**P0.4 — Native Lift Lab "Sync Athletes" button (Athletes page) reports fake success**

- **Anchor:** `src/app/lifting/actions/athletes.ts:25`
- **State:** renders_but_inert
- **Evidence:** syncOrgAthletes() calls `supabase.rpc('helm_lifting_sync_org_athletes', { p_org_id: orgId })` without destructuring/checking {error}. The deployed prod function (confirmed via `select pg_get_function_arguments(oid)` on public.helm_lifting_sync_org_athletes) is `(p_org uuid, p_sport text, p_team_id uuid)` — no defaults, and no `p_org_id` parameter exists at all, so PostgREST rejects the call. Since the error is never inspected, execution falls through to `return { success: true }` regardless. Called from src/components/lifting/athletes/AthleteRosterClient.tsx:118 on the 'Sync Athletes' button.
- **Impact:** A coach clicks 'Sync Athletes' in the native Lift Lab Athletes page, sees the toast "Athletes synced.", and believes newly-rostered players are now provisioned — but zero rows are actually inserted. Demo-critical: this is the exact self-service control a program admin would use and trust.

**P0.5 — Staff-invite accept RPC in production has no email-ownership check — any authenticated user can join any team as staff via a leaked token**

- **Anchor:** `supabase/migrations/20260624000081_baseball_staff_roles_scope_audit.sql:268`
- **State:** insecure
- **Evidence:** Live query `SELECT pg_get_functiondef(...) WHERE proname='baseball_accept_staff_invite'` against prod (qmnssrrolpinvwjjnufo) returns a function body that: (1) looks up the invite by token+status+expiry only — NO email comparison at all; (2) upserts `public.baseball_coaches(user_id, email=<invite's email>, ...)` for the CALLING user regardless of whether the invite was addressed to them; (3) inserts into `baseball_team_coach_staff` with the invite's role/capabilities; (4) returns `{ok:false, error:'invalid_or_expired_token'}` on failure (key is `error`, not `reason`). This matches NEITHER committed migration: 20260624000062_baseball_accept_staff_invite_rpc.sql:60-164 and its supersede at 20260624000081_baseball_staff_roles_scope_audit.sql:268-403 both check `IF v_email IS NULL OR lower(v_invite.email) <> v_email THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_email')` (line ~311-313 of the 000081 re-emit) before ever touching baseball_team_coach_staff, and never write the invite's email onto the coach's own profile. `information_schema.routine_privileges` confirms EXECUTE is GRANTed to `authenticated` (and service_role/postgres) on this exact function (single OID, one signature `p_token text`) — so it is callable directly via `supabase.rpc('baseball_accept_staff_invite', {p_token})` from any signed-in client, bypassing src/app/baseball/actions/staff.ts:387-394's email-match check and src/app/baseball/staff/join/[code]/page.tsx:136-165's page-level 'Wrong account' gate entirely. Both of those app-layer checks are dead-end UX only; the true trust boundary (the SECURITY DEFINER function) does not enforce them. Control check: the structurally identical `helm_lifting_accept_invite(uuid)` RPC (supabase/migrations/20260625000030_helm_lifting_accept_invite_rpc.sql:36-106) DOES match its migration exactly in prod, including `AND lower(email) = lower(v_email)` inside the SELECT — proving this is a real, isolated defect in the baseball path and not a query-tooling artifact.
- **Impact:** A college program buying BaseballHelm cannot trust that only the coaches they explicitly invited can join their staff. Any user with a Baseball account (which is open self-signup, see signup finding) who sees or guesses a pending staff-invite token — e.g. forwarded in an email thread, visible in a URL a browser/analytics tool logged, or leaked via a screenshot — can grant themselves a coaching seat on that team with whatever capabilities the invite carried (potentially can_manage_settings, can_invite_staff, can_view_medical), and the RPC will silently overwrite that user's own baseball_coaches.email with the invite's email in the process, corrupting their profile. This is a genuine unauthorized-access / privilege-escalation path into a customer's roster and settings, discoverable by any competent security reviewer before a deal closes.

**P0.6 — Three independently-maintained copies of the recruiting program-type set**

- **Anchor:** `src/lib/supabase/middleware.ts:146`
- **State:** inconsistent
- **Evidence:** Identical `RECRUITING_PROGRAM_TYPES = new Set(['college','juco','showcase','academy','club'])` literal is independently declared in middleware.ts:146, src/lib/baseball/server-route-guards.ts:12, and src/app/baseball/(dashboard)/_components/resolve-active-hub.ts:35 (the latter exported and reused by BaseballFairwayShell.tsx:86,303). No shared constant module.
- **Impact:** A sunset flag added to only one of these three leaves recruiting routes reachable in another (e.g. middleware still 200s a route the sidebar hides, or vice versa). Any fix must touch and test all three or consolidate them first.

**P0.7 — No existing on/off flag — every current gate answers 'is this program recruiting-CAPABLE', which is TRUE for college**

- **Anchor:** `src/lib/baseball/server-route-guards.ts:100`
- **State:** missing
- **Evidence:** requireRecruitingCoachRoute (line 100-110) allows coach_type in ['college','juco','showcase'] OR program_type in the recruiting set. A college program — the exact buyer being demoed tomorrow — passes this check today. grep for isRecruitingEnabled/RECRUITING_ENABLED/recruitingEnabled/ENABLE_RECRUITING across src returned zero hits.
- **Impact:** Simply 'reusing' the existing eligibility logic to hide recruiting will not work for the target buyer, since college programs are exactly the ones current logic marks eligible. A genuinely new, unconditional flag is required, not a repurposed check.

**P0.8 — Player-side 'Recruiting' hub row is unconditional — bypasses the registry filter entirely**

- **Anchor:** `src/app/baseball/(dashboard)/BaseballFairwayShell.tsx:269`
- **State:** insecure
- **Evidence:** buildPlayerNavSections (lines 224-289) hard-sets itemsById for PLAYER_HUB_ROW_IDS.recruiting with no ctx.programType or player_type check, and PLAYER_RAIL_SECONDARY_IDS (hub-definitions.ts:415) always includes it. resolve-active-hub.ts's playerHubs() (lines 101-132) likewise has zero gating for the recruiting hub — only coachHubs() checks showRecruiting (line 87). Today a college player (recruiting status 'Never' per CLAUDE.md) already sees this nav row and lands on an honest 'not available' page rather than having the row hidden.
- **Impact:** Filtering BASEBALL_NAV_REGISTRY by a new recruiting flag will NOT remove this player-facing nav item — it is constructed outside the per-entry filter. Missing this means the player sidebar/bottom-nav still advertises 'Recruiting' after the sunset ships.

**P0.9 — scout-packets, camps, and activate pages bypass both central recruiting route guards**

- **Anchor:** `src/app/baseball/(dashboard)/dashboard/scout-packets/page.tsx:30`
- **State:** inconsistent
- **Evidence:** scout-packets/page.tsx gates only on capabilities.can_export_reports (line 35) — no requireRecruitingCoachRoute call. camps/page.tsx gates only on `if (!session) redirect(...)` (no role/program check at all — file's own comment says 'no role check, just signed in'). activate/page.tsx (lines 20-40) reimplements its own `player.player_type === 'college'` / `recruiting_activated` inline logic rather than calling requireRecruitingPlayerRoute. Verified via `grep -oE 'require[A-Za-z]+Route'` across all 11 recruiting page.tsx files.
- **Impact:** A sunset implemented by editing only requireRecruitingCoachRoute/requireRecruitingPlayerRoute silently misses these three routes; they currently rely solely on middleware.ts's RECRUITING_ROUTES list (for scout-packets/camps) or nothing but capability (for scout-packets) — and middleware and the guards are the two independently-duplicated copies from finding #1.

**P0.10 — Public unauthenticated share-link routes are the actual external recruiting product and sit outside all gating discussed**

- **Anchor:** `src/app/baseball/(public)`
- **State:** missing
- **Evidence:** src/app/baseball/(public)/{player/[id], team/[id], program/[id], packet/[token], packet/[token]/csv} are no-auth-required routes (isPublicBaseballRoute in middleware.ts:222-227) meant for recruiters/scouts/family with a link. None of these are in BASEBALL_NAV_REGISTRY, RECRUITING_ROUTES, or either requireRecruiting*Route guard — they are reached only via generated share links (scout-packet, passport share tokens per docs/audits/BASEBALLHELM_CANONICAL_SPEC.md:267).
- **Impact:** Every gating mechanism enumerated above only affects the AUTHENTICATED in-app UI. If 'sunset' is meant to include the external-facing recruiting artifact (a scout still opening a previously-shared packet link), none of nav-registry, middleware RECRUITING_ROUTES, or the route guards touch this surface at all — it needs its own explicit decision and mechanism.

**P0.11 — baseball_players SELECT policy is USING(true) — any authenticated user reads every player's PII across every tenant**

- **Anchor:** `supabase/migrations/20260527000000_prod_public_baseline.sql:18179`
- **State:** insecure
- **Evidence:** Live pg_policies query: {"tablename":"baseball_players","policyname":"baseball_players_select","cmd":"SELECT","roles":"{authenticated}","qual":"true"}. Confirmed columns on baseball_players (information_schema.columns): email, phone, gpa, sat_score, act_score, high_school_name/city/state, city, state, instagram, twitter, about_me. No later migration (checked baseball_rls_helpers_and_policies, harden_baseball_phase1_rls_rollup, baseball_scope_player_ids_rls, baseball_rls_legacy_policy_cleanup, baseball_players_recruiting_guard — none touch this policy name) narrows this. The staff-scoping helper can_view_baseball_player() (added supabase/migrations/20260630180000_baseball_scope_player_ids_rls.sql) exists and is wired into other tables' policies (e.g. baseball_class_conflicts insert) but was never applied to baseball_players' own SELECT policy.
- **Impact:** Any logged-in coach or player belonging to any team on the platform can query baseball_players directly and pull every other program's full roster PII — email, phone, GPA, SAT/ACT scores, high school, hometown — for players who are largely minors. For a program buying this platform, their roster's private recruiting/academic data is readable by every other customer's users.

**P0.12 — baseball_teams SELECT policy is USING(true) — every team's secret join_code is world-readable to any authenticated user**

- **Anchor:** `supabase/migrations/20260527000000_prod_public_baseline.sql:18377`
- **State:** insecure
- **Evidence:** Live pg_policies query: {"tablename":"baseball_teams","policyname":"baseball_teams_select","cmd":"SELECT","roles":"{authenticated}","qual":"true"}. baseball_teams.join_code column confirmed UNIQUE NOT NULL (unique constraint baseball_teams_join_code_key) — the token used by the self-join flow.
- **Impact:** Any authenticated user, regardless of which team they belong to, can SELECT * FROM baseball_teams and read every other program's join_code, defeating the purpose of a secret invite code and enabling unauthorized self-join attempts against unrelated programs (actual insert is gated by can_insert_baseball_team_member, but the code itself should never be broadly enumerable).

**P0.13 — Broader Playwright suite is chronically red on main, including real baseball regressions, and blocks nothing**

- **Anchor:** `.github/workflows/playwright.yml:28`
- **State:** insecure
- **Evidence:** gh run view 30397148960 (latest main push, 2026-07-28) shows job "Playwright (chromium)" concluded failure with 47 failed / 85 passed. Distinct failing baseball specs (verified via gh run --log-failed): camps.spec.ts (Camps - Player Flow: browse/view/register+unregister; Camps - Coach Flow: list roster, view roster) at lines 45/56/68/102/111; baseball-box-score.spec.ts:193 (create game -> box-score redirect); baseball-pipeline.spec.ts:62 and :163 (board render, keyboard nav); baseball-stats-smoke.spec.ts:110/138/170 (Command Center and Stats Center "real stats not empty state" assertions); baseball-route-crawler.spec.ts (coach + player, 3 retries each, still failing). docs/CI_RUNBOOK.md:28 and .github/branch-protection.md classify this job as advisory on main.
- **Impact:** Camp registration, box-score game creation, and stats-center real-data rendering can regress in production and no CI check will ever go red in a way that blocks a merge or is required to fix before shipping to a buyer.

**P0.14 — 35% of baseball_* tables have zero pgTAP RLS test coverage, including messaging, tasks, travel, announcements, invitations, dev plans**

- **Anchor:** `supabase/tests/rls`
- **State:** missing
- **Evidence:** Diffed the 93 real baseball_* table names extracted from src/lib/types/database.ts (Tables block, lines 41-19506) against every baseball_[a-z_0-9]+ token referenced across all 48 files in supabase/tests/rls/*.sql. 33 tables never appear in any RLS test file, including baseball_messages, baseball_conversations, baseball_conversation_participants, baseball_tasks, baseball_task_assignments, baseball_task_templates, baseball_travel_itineraries, baseball_travel_expenses, baseball_announcements, baseball_announcement_recipients, baseball_announcement_acknowledgements, baseball_team_invitations, baseball_developmental_plans, baseball_watchlists, baseball_player_stats, baseball_player_aggregates, baseball_player_percentiles, baseball_camps, baseball_camp_registrations, baseball_videos, baseball_notifications, baseball_event_attendance, baseball_team_lineups, baseball_lineup_positions. Confirmed with spot-check grep that RLS IS enabled on these tables via migrations (e.g. supabase/migrations/20260527000000_prod_public_baseline.sql:17703/18046/18283/18325/18445/18477) — the policy exists, its correctness is just never asserted.
- **Impact:** A broken RLS policy on messaging, tasks, travel, announcements, or staff invitations — e.g. a coach on Team A reading Team B's messages or tasks — would not be caught by the RLS suite that IS part of the CI hard gate.

**P0.15 — Helm Lift Lab's real schema (helm_lifting_*, not baseball_*) is mostly untested at the RLS layer — including the set-results table itself**

- **Anchor:** `supabase/tests/rls`
- **State:** missing
- **Evidence:** Helm Lift Lab uses a separate helm_lifting_* namespace (33 base tables, distinct from baseball_lifting_visibility's baseball_ prefix), extracted from database.ts. Only 4 of 48 RLS files reference it at all (baseball_full_phase1.sql, baseball_lifting_visibility.sql, baseball_v11_lifting_visibility.sql, baseball_strength_group_audit.sql). 15 of the 33 tables are referenced in none of those 4 files: helm_lifting_set_results, helm_lifting_readiness_checkins, helm_lifting_athletes, helm_lifting_coaches, helm_lifting_coach_assignments, helm_lifting_coach_invites, helm_lifting_org_viewers, helm_lifting_import_rows, helm_lifting_import_runs, helm_lifting_nutrition_plans, helm_lifting_nutrition_plan_assignments, helm_lifting_exercise_substitutions, helm_lifting_soreness_check_requests, helm_lifting_soreness_check_schedules, helm_lifting_soreness_maps, helm_lifting_weight_checkin_requests, helm_lifting_weight_checkin_schedules.
- **Impact:** helm_lifting_set_results is the literal weight/rep data an athlete writes during a workout, and helm_lifting_readiness_checkins is the daily wellness input — a cross-tenant RLS hole on either (a different team seeing/writing another team's lift data) would ship undetected.

**P0.16 — Lift-session lifecycle transitions (start/complete) have zero test coverage**

- **Anchor:** `src/app/lifting/actions/player-sessions.ts:189`
- **State:** missing
- **Evidence:** src/app/lifting/actions/player-sessions.ts exports getMyLiftToday, submitLiftReadiness, startMySession (line 189), logMySetResult, completeMySession (line 273). src/app/lifting/actions/__tests__/player-sessions.test.ts only covers logMySetResult's onConflict target and submitLiftReadiness (auth rejection + revalidation) — grep confirms no test file references startMySession or completeMySession anywhere in the repo. Same gap on the coach side: src/app/lifting/actions/sessions.ts exports advanceSessionLifecycle (line 201), addSessionNote, modifySectionForAthlete, listSessions, getSessionWithExercises — only logSetResult (also just its onConflict target + revalidation) is covered by sessions.test.ts.
- **Impact:** The actual state-machine transitions that make a lift session real — a player starting it, a player finishing it, a coach advancing/modifying it — have no automated check that they work, error correctly, or respect authorization.


</details>

## P1 (19)

| # | Finding | State | Anchor |
|---|---|---|---|
| 1 | 'TasksFairway' is Fairway in name only — its two main children are unmigrated legacy components | `inconsistent` | `src/components/baseball/tasks/TasksFairway.tsx:33` |
| 2 | PlayerProfileClient — the primary player detail screen — is 1701 lines with almost no Fairway usage | `inconsistent` | `src/components/baseball/player-profile/PlayerProfileClient.tsx:54` |
| 3 | Raw warm-*/cream-* Tailwind utilities used inside files that already import Fairway components | `inconsistent` | `src/app/baseball/(dashboard)/dashboard/academics/AcademicsClient.tsx` |
| 4 | seed-baseball-demo.ts + seed-baseball-demo-program.ts write to 3 tables graveyarded on 2026-07-04; silently no-op on every run | `dead` | `scripts/seed-baseball-demo.ts:598` |
| 5 | verify-baseball-demo-coverage.ts does not check the tables it should — its PASS verdict overstates real coverage | `inconsistent` | `scripts/verify-baseball-demo-coverage.ts:58` |
| 6 | Demo team is genuinely missing data for Announcements, Travel, Documents, Post-Game Reviews, and lifting maxes/bodyweight — no seed script covers them | `missing` | `scripts/seed-baseball-surfaces-demo.ts` |
| 7 | Helm Lift Lab (/lifting/**) is unreachable inside the shipped native iOS app | `dead` | `src/proxy.ts:22` |
| 8 | Native Lift Lab "Sync Athletes" button (Settings page) is permanently broken | `renders_but_inert` | `src/app/lifting/actions/assignments.ts:157` |
| 9 | Removing/deactivating a baseball player does not deactivate their Lift Lab athlete row | `missing` | `src/app/baseball/actions/roster.ts:215` |
| 10 | helm_lifting_athletes.user_id is write-once at seed time — never re-synced, verified stale in prod | `inconsistent` | `supabase/migrations/20260625000030_helm_lifting_accept_invite_rpc.sql:214` |
| 11 | Signals AI inbox surfaces recruiting-category alerts outside the recruiting hub | `inconsistent` | `src/lib/baseball/operational-rule-engine.ts:929` |
| 12 | Mobile bottom-nav test hard-locks a recruiting slot for JUCO/HS coach and player | `inconsistent` | `src/lib/baseball/__tests__/bottom-nav.test.ts:99` |
| 13 | Recruiting settings content is interleaved inside a general settings page, not isolated | `inconsistent` | `src/components/baseball/settings/ProgramSettingsClient.tsx:693` |
| 14 | "Elite stat event model" (8 tables, ~10 dedicated migrations) has zero rows in production | `dead` | `supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql` |
| 15 | Signals -> Actions -> Decision-Log -> AI-Audit pipeline and staff/team invitations are empty in production | `dead` | `supabase/migrations/20260624000092_baseball_signals_and_actions.sql` |
| 16 | Mandatory baseball E2E hard gate only checks a heading renders, never real data or interaction | `renders_but_inert` | `e2e/baseball-smoke.spec.ts:42` |
| 17 | vitest 'integration' and 'rls' projects are declared but never run in any CI workflow | `dead` | `vitest.config.ts:99` |
| 18 | Staff invitation workflow (inviteStaff/revokeStaffInvite/resendStaffInvite/acceptStaffInvite) has zero unit-test coverage | `missing` | `src/app/baseball/actions/staff.ts:164` |
| 19 | Full fresh-account onboarding is a self-documented, never-built gap | `missing` | `e2e/baseball-onboarding-smoke.spec.ts:26` |

<details><summary>P1 detail</summary>

**P1.1 — 'TasksFairway' is Fairway in name only — its two main children are unmigrated legacy components**

- **Anchor:** `src/components/baseball/tasks/TasksFairway.tsx:33`
- **State:** inconsistent
- **Evidence:** TasksFairway.tsx:33-34 imports `TasksList` and `CreateTaskModal` from the same directory. `TasksList.tsx:55-61` renders `bg-warm-100`/`text-warm-400`/`text-warm-900`/`text-warm-500` raw classes for its empty state (a hand-rolled empty state, not Fairway's `EmptyState`); `CreateTaskModal.tsx:31,165,181,210,227` render priority-pill and form-label styling in raw `bg-warm-100 text-warm-700` / `bg-cream-50` / `border-warm-200` etc.
- **Impact:** Naming implies the Tasks surface (an active Team feature per CLAUDE.md) is done; it is not — the visible list rows and the create-task modal both look like the pre-Fairway product. A reviewer trusting file names would miss this.

**P1.2 — PlayerProfileClient — the primary player detail screen — is 1701 lines with almost no Fairway usage**

- **Anchor:** `src/components/baseball/player-profile/PlayerProfileClient.tsx:54`
- **State:** inconsistent
- **Evidence:** Only 1 Fairway import in the whole file (`InlineNotice`, line 54). Buttons/form controls come from `@/components/ui/button`, `@/components/ui/textarea`, `@/components/ui/select`, `@/components/ui/confirm-dialog` (lines 60-64) — the pre-redesign kit. Uses CSS custom properties (`var(--hairline)`, `var(--paper)`, `var(--paper-canvas)`) directly inline at lines 665, 698, 715, 972, 1055, 1087, 1104, 1236, 1272, 1397, 1411 instead of the documented Living Annual atoms (`PaperCard`, `HairlineRule`) that wrap those same tokens. Also contains its own hand-rolled `role="tablist"` and its own `fixed inset-0` modal.
- **Impact:** This is the screen a coach opens most often when evaluating a specific player (roster -> player) and the screen a recruit's page links out to — it is the least systemized major surface in the product, and its raw `var(--hairline)` usage means any future token rename (already flagged in CLAUDE.md as a live risk — two competing z-index ladders) silently breaks it without a compiler error.

**P1.3 — Raw warm-*/cream-* Tailwind utilities used inside files that already import Fairway components**

- **Anchor:** `src/app/baseball/(dashboard)/dashboard/academics/AcademicsClient.tsx`
- **State:** inconsistent
- **Evidence:** Counted raw `warm-*`/`cream-*`/`red-*`/`amber-*` utility-class occurrences inside the 43 baseball files that import from `@/components/fairway`: AcademicsClient.tsx has 33, dashboard/settings/page.tsx has 23, stats/games/create/NewGameClient.tsx has 19, PassportVisibilityControls.tsx has 18, dashboard/events/EventsClient.tsx has 17, program/ProgramClient.tsx has 8, and even the flagship RosterFairway.tsx has 2. Repo-wide, 162 of ~564 baseball .tsx files use `warm-*`/`cream-*` at all (2,499 total occurrences), concentrated inside the live dashboard route tree (41 distinct dashboard/* route dirs hit), not confined to marketing/auth chrome.
- **Impact:** The drift isn't a clean 'old pages vs new pages' split that could be fixed by finishing a migration list — it's interleaved inside files that are already 'on' Fairway, meaning a page-by-page audit checklist (does this route import Fairway?) would false-positive as done on files that are only partially migrated.

**P1.4 — seed-baseball-demo.ts + seed-baseball-demo-program.ts write to 3 tables graveyarded on 2026-07-04; silently no-op on every run**

- **Anchor:** `scripts/seed-baseball-demo.ts:598`
- **State:** dead
- **Evidence:** scripts/seed-baseball-demo.ts:598-600 upserts 'baseball_lift_assignments', 'baseball_lift_results', 'baseball_readiness_checkins'; scripts/seed-baseball-demo-program.ts:709 upserts 'baseball_lift_results' again. All three tables were moved `SET SCHEMA graveyard` by supabase/migrations/20260704070000_graveyard_dead_liftlab_tables_phase2.sql (confirmed live: information_schema.tables query returns baseball_exercises but NOT baseball_lift_assignments/baseball_lift_results/baseball_readiness_checkins in the public schema). The upsert() wrapper (seed-baseball-demo.ts:191-208) catches the resulting PostgREST 'could not find the table' error and silently deletes the table from the printed row-count summary, logging only a console.warn a reader would have to scroll past. seed-baseball-demo.ts was last edited 2026-07-15, 11 days AFTER the graveyard migration, and never updated to drop this dead code.
- **Impact:** The script's own header comments (lines 44-49, 57-68) and console summary claim these rows exist; they never land. Two derived rows are then orphaned: the 'insight:readiness' coach insight (line 616) cites source_refs pointing at baseball_readiness_checkins/baseball_lift_results (never created), and the 'timeline:lift' player-timeline event (line 673) cites a baseball_lift_results row id that was never inserted. A buyer or engineer who traces data lineage on those two rows finds the cited evidence doesn't exist. No live app code depends on this (grep confirms only a stale comment in player-today-lift.ts:10 mentions baseball_readiness_checkins; the real UI reads helm_lifting_readiness_checkins, which IS fully seeded), so there is no user-visible breakage today — this is stale/misleading seed code, not a broken feature.
- **Fix:** Delete the baseball_lift_assignments/baseball_lift_results/baseball_readiness_checkins blocks from seed-baseball-demo.ts (lines ~526-600) and seed-baseball-demo-program.ts Section D (lines ~681-709), and repoint the two coach-insight/timeline source_refs at the equivalent helm_lifting_* rows that actually exist.

**P1.5 — verify-baseball-demo-coverage.ts does not check the tables it should — its PASS verdict overstates real coverage**

- **Anchor:** `scripts/verify-baseball-demo-coverage.ts:58`
- **State:** inconsistent
- **Evidence:** PHASE1_SURFACE_COVERAGE (lines 58-81) tracks 19 tables; live query against the prod demo team (id 4032c079-494f-5967-9ffc-3dd206663d3c) confirms all 19 currently have rows, so the script genuinely PASSes today. But it never checks baseball_lift_assignments/baseball_lift_results/baseball_readiness_checkins (the graveyarded finding above), nor baseball_announcements, baseball_camps, baseball_documents, baseball_travel_itineraries, baseball_travel_expenses, baseball_postgame_reviews, baseball_notifications, helm_lifting_maxes, or helm_lifting_bodyweight_entries — all confirmed 0 rows for the demo team by direct SQL, none of them in either SURFACE_COVERAGE or INTENTIONALLY_EMPTY (lines 115-127).
- **Impact:** A coach or engineer who runs `npm run seed:baseball:demo` (which ends by running this verifier, package.json:16) and sees 'PASS — all 19 required surfaces have demo coverage' would reasonably believe the demo is fully populated. It is not: Announcements, Travel, Documents, and Post-Game Review pages will render empty for the demo login with zero warning from this tool.
- **Fix:** Add the confirmed-empty tables above to either SURFACE_COVERAGE (if a route depends on them and should be seeded) or INTENTIONALLY_EMPTY (with a documented reason), matching the same discipline already applied to baseball_recruiting_interests/Decision Room tables.

**P1.6 — Demo team is genuinely missing data for Announcements, Travel, Documents, Post-Game Reviews, and lifting maxes/bodyweight — no seed script covers them**

- **Anchor:** `scripts/seed-baseball-surfaces-demo.ts`
- **State:** missing
- **Evidence:** grep of upsert() calls across all 4 Phase1-4 scripts shows zero references to baseball_announcements, baseball_travel_itineraries, baseball_travel_expenses, baseball_documents, baseball_camps (only seed-baseball-e2e.ts seeds a camp, for a completely different E2E team), baseball_postgame_reviews, baseball_notifications, helm_lifting_maxes, or helm_lifting_bodyweight_entries. Live SQL confirms all are 0 rows for the demo team (baseball_announcements=0, baseball_travel_itineraries=0, baseball_documents=0, baseball_camps=0, baseball_postgame_reviews=0, helm_lifting_maxes=0, helm_lifting_bodyweight_entries=0).
- **Impact:** Per CLAUDE.md's own routing table these are real Team-feature and Lifting routes (/dashboard/announcements, /dashboard/travel, /dashboard/documents, plus 1RM/bodyweight tracking under Helm Lifting Lab). A buyer walking the public demo login into any of these surfaces sees an honest-but-empty state, not a populated one — inconsistent with the founder's 'sellable by morning' bar for a team-management product being demoed.
- **Fix:** Extend seed-baseball-surfaces-demo.ts (or a new Phase-5 script) to seed a few announcements, a travel itinerary + expenses, 2-3 documents, and helm_lifting_maxes/bodyweight_entries for the roster, then add them to the coverage contract.

**P1.7 — Helm Lift Lab (/lifting/**) is unreachable inside the shipped native iOS app**

- **Anchor:** `src/proxy.ts:22`
- **State:** dead
- **Evidence:** APP_ROUTE_PREFIXES (src/proxy.ts:22-32) lists '/golf','/baseball','/admin','/api','/auth','/support','/privacy','/terms','/dev' — '/lifting' is absent. isMarketingRoute() (line 39-44) returns true for any pathname not matching a listed prefix, and proxy() (line 59-63) hard-redirects any native-UA request on a marketing route to '/golf/login'. Confirmed /lifting has zero inbound links from BaseballHelm nav or components (grep for '/lifting' href across src/app/baseball and src/components/baseball returned nothing) and its own login/join flow (src/app/lifting/(auth)/login/page.tsx, src/app/lifting/join/[token]/page.tsx) is invite-token-only.
- **Impact:** A strength coach who receives a /lifting/join/[token] invite and opens it in the Capacitor iOS app gets redirected to /golf/login instead of the invite-accept flow — the entire Lift Lab product is inaccessible on mobile for its actual users. On web this doesn't trigger (native-UA check only), but there is no discovery path there either.
- **Fix:** Add '/lifting' to APP_ROUTE_PREFIXES in src/proxy.ts, and decide/implement a discovery path (marketing link or in-app entry point) from BaseballHelm/GolfHelm for coaches who should have Lift Lab access.

**P1.8 — Native Lift Lab "Sync Athletes" button (Settings page) is permanently broken**

- **Anchor:** `src/app/lifting/actions/assignments.ts:157`
- **State:** renders_but_inert
- **Evidence:** syncOrgAthletes() calls the same RPC with `{ p_org_id: ctx.orgId, p_sport: input.sport ?? null }` — same wrong param name, still missing required p_team_id, and additionally destructures a JSON return shape `{ok, reason, athlete_count}` (line 169) that doesn't match the RPC's actual `RETURNS integer`. rpcErr is checked here, so the action correctly returns `{success:false}`, surfaced in src/app/lifting/(dashboard)/dashboard/settings/settings-client.tsx:675-691 as "Could not sync athletes. Please try again."
- **Impact:** Every click of Settings → 'Sync Athletes' fails with a generic error, with no way for staff to self-heal a stale roster from this surface. Combined with finding #1, BOTH manual sync entry points in the native Lift Lab UI are non-functional.

**P1.9 — Removing/deactivating a baseball player does not deactivate their Lift Lab athlete row**

- **Anchor:** `src/app/baseball/actions/roster.ts:215`
- **State:** missing
- **Evidence:** removePlayerFromTeam() does `supabase.from('baseball_team_members').delete()...` with zero references to helm_lifting anywhere in the file (grep confirmed 0 hits). baseball_players itself has no is_active/status column (supabase/migrations/20260527000000_prod_public_baseline.sql:8003-8041). No app code or migration ever sets helm_lifting_athletes.is_active = false (grep for writes to that column returned 0 app-code hits).
- **Impact:** A player cut from the roster keeps a live, is_active=true helm_lifting_athletes row forever — still eligible for dynamic group membership, still visible in the Live Weight Room, and a coach can still assign them new lifts after they've left the team. The two rosters silently diverge with no reconciliation path.

**P1.10 — helm_lifting_athletes.user_id is write-once at seed time — never re-synced, verified stale in prod**

- **Anchor:** `supabase/migrations/20260625000030_helm_lifting_accept_invite_rpc.sql:214`
- **State:** inconsistent
- **Evidence:** The seeding RPC does `... ON CONFLICT (organization_id, sport, sport_player_id) DO NOTHING` — no UPDATE branch, so an existing row's user_id is frozen at whatever it was when first inserted. Verified live against production via SQL: of the athlete rows joined back to baseball_players, every row where bp.user_id is populated but hla.user_id is NULL was produced by scripts/seed-baseball-lifting-demo.ts:311 (`user_id: null ... // player logins from Phase-1 don't auto-link here`) — the seed script's own comment documents exactly this scenario as expected/normal. The athlete-self access gate in src/app/lifting/(dashboard)/layout.tsx:78-81 and src/lib/lifting/access.ts:91-97 both match strictly on helm_lifting_athletes.user_id = auth.uid().
- **Impact:** Any real player rostered/synced into Lift Lab before their account is linked (a documented, expected sequence) will pass auth but permanently fail the /lifting/dashboard athlete-self gate and get redirected to /lifting/login — even after signing up. Their baseball-embedded surfaces (Player Today, /baseball/dashboard/lift) are unaffected since those resolve identity via sport_player_id (src/lib/baseball/read-models/player-lift.ts:112-130), so the blast radius is scoped to direct /lifting portal access, but there is no code path that ever heals it once it happens.

**P1.11 — Signals AI inbox surfaces recruiting-category alerts outside the recruiting hub**

- **Anchor:** `src/lib/baseball/operational-rule-engine.ts:929`
- **State:** inconsistent
- **Evidence:** The 'signals' nav entry (nav-registry.ts:349-360) is hub:'dashboard', requiredCapability:null — visible to every coach regardless of program type. Its rule engine (operational-rule-engine.ts:929-1002) generates 'recruiting'-category cards ('A recruiting-active player has an incomplete showcase profile', 'no linked video') gated only on the PLAYER's own recruitingActive flag, not any program-level switch.
- **Impact:** Even after hiding the Recruiting hub and its routes, a college program's Signals inbox can still surface recruiting-flavored alert cards for any roster player who happens to have recruiting_activated=true — an inconsistent half-sunset visible on the one dashboard surface every coach opens daily.

**P1.12 — Mobile bottom-nav test hard-locks a recruiting slot for JUCO/HS coach and player**

- **Anchor:** `src/lib/baseball/__tests__/bottom-nav.test.ts:99`
- **State:** inconsistent
- **Evidence:** Line 99: `expect(getBaseballBottomNavKeys(coach('juco'))).toEqual(['dashboard','team','recruiting','messages'])`. Lines 120-127 assert the SAME for HS/JUCO players at slot 3 ('player-recruiting-hub'), explicitly titled 'HS and JUCO players surface Recruiting/Exposure in slot 3 — not drawer/More-only'.
- **Impact:** Any sunset that removes 'recruiting' from the visible nav breaks this test's exact-equality assertions and leaves an empty 4th bottom-nav slot for those program types with no replacement item designed — a real UX gap to resolve, not just a test to update.

**P1.13 — Recruiting settings content is interleaved inside a general settings page, not isolated**

- **Anchor:** `src/components/baseball/settings/ProgramSettingsClient.tsx:693`
- **State:** inconsistent
- **Evidence:** The 'Scout & Showcase Access' SectionCard (anchorId='showcase-profile', lines 693-745: scout_access_enabled, scout_show_unverified_metrics, scout_can_export, scout_packet_visibility toggles) sits directly between the Guardian Access section (line 662) and AI Settings section (line 748) inside one consolidated client component. The dedicated /settings/recruiting-preferences route (separate page, legacy cream-100/warm-900 styling, not Fairway) is a second, disconnected recruiting settings surface.
- **Impact:** Cannot hide 'recruiting settings' by hiding one route — one recruiting-only page exists AND one recruiting-only anchor section is embedded mid-page in a shared component alongside unrelated Guardian/AI settings that must keep rendering.

**P1.14 — "Elite stat event model" (8 tables, ~10 dedicated migrations) has zero rows in production**

- **Anchor:** `supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql`
- **State:** dead
- **Evidence:** Live COUNT(*) via mcp__supabase__execute_sql: baseball_plate_appearances=0, baseball_pitch_events=0, baseball_batted_ball_events=0, baseball_baserunning_events=0, baseball_catching_events=0, baseball_fielding_events=0, baseball_swing_events=0, baseball_workload_events=0. Meanwhile the coarser stat tables are populated: baseball_box_score_batting=179, baseball_box_score_pitching=53, baseball_player_stats=268, baseball_player_season_stats=26.
- **Impact:** Significant schema/RLS/index investment across ~10 migrations backs a pitch-by-pitch/PA-by-PA analytics model that has never received a single row in production. Any coach-facing surface built on top of these tables will always render an empty state, including in front of a buyer demo.

**UPDATE 2026-07-29 23:50Z — re-verified. The zero-rows finding holds; `state: dead` is wrong and points at the one action that would break production.**

- **13 tables, not 8**, and only **11 exist** — `baseball_stat_facts` and `baseball_import_field_mappings` were **never created in production**, a third independent case here of prod not matching the migration that declared it. All 11 that exist are at **exactly 0 rows** by `count(*)` (not `reltuples`, which is -1 across the board — never ANALYZEd, consistent with never written but not proof).
- **`baseball_stat_facts` is harmless despite being absent:** its only appearance in `src/` is a comment at `src/lib/types/baseball-stat-events.ts:467`. Nothing queries it, so no PostgREST 400.
- **The schema is NOT dead — ~20 live `.from()` read sites depend on it**, across `read-models/stats-center.ts`, `read-models/stat-visuals.ts`, `read-models/player-snapshot-cards.ts`, `coachhelm/engine-run.ts`, `coachhelm/engine-event-derived.ts`, `admin/data/users.ts`. Dropping these tables breaks all of them. "dead" reads as "safe to remove"; it is the opposite.
- **The gap is ingest, not schema.** Of the granular event tables — pitch, batted-ball, catching, fielding, baserunning, workload — **not one has a write path** anywhere in `src/`. The only two written at all are `baseball_video_events` (4 write calls) and `baseball_stat_sources` (1). The reads were built; the collection never was.

**So the decision is "build the ingest, or remove the read surfaces along with the tables"** — not "keep or graveyard", where graveyarding alone is the single clearly-wrong option.

_Empty-state handling was spot-checked and the limit is stated rather than implied: `buildPitcherWorkload` (`stat-visuals.ts:428`) degrades honestly to `[]` with no fabricated zeros. That is **one** of ~20 sites; whether every consumer shows an honest empty state instead of a confident `0.00` is **unverified** and worth a sweep. Note `read-models/player-snapshot-cards.ts` was carrying another session's uncommitted work at the time and was deliberately not touched._

**P1.15 — Signals -> Actions -> Decision-Log -> AI-Audit pipeline and staff/team invitations are empty in production**

- **Anchor:** `supabase/migrations/20260624000092_baseball_signals_and_actions.sql`
- **State:** dead
- **Evidence:** Live COUNT(*): baseball_signals=0, baseball_actions=0, baseball_decision_log=0, baseball_ai_audit=0, baseball_postgame_reviews=0, baseball_postgame_review_items=0, baseball_team_lineups=0, baseball_lineup_positions=0, baseball_staff_invitations=0, baseball_team_invitations=0, baseball_class_conflicts=0, baseball_academic_eligibility=0, baseball_practice_scrimmages=0, baseball_practice_effectiveness_reviews=0, baseball_box_score_uploads=0 (despite box_score_batting/pitching being populated, implying stats are entered through a path — e.g. the save_full_box_score RPC — that never writes an upload-tracking row), helm_lifting_maxes=0, helm_lifting_prs=0.
- **Impact:** The signals/actions/decision-log/ai-audit chain is the operational backbone CLAUDE.md routes coaches through (Alerts/Patterns/Insights consolidation under /dashboard/intelligence equivalents on baseball); zero rows means it has either never fired end-to-end in prod or writes are silently failing. Staff and team invitation tables both at 0 rows is a stronger signal — the entire invite-a-coach/invite-a-player flow may never have been exercised against production, which is a core onboarding path for a program the founder wants to sell into by morning.

**P1.16 — Mandatory baseball E2E hard gate only checks a heading renders, never real data or interaction**

- **Anchor:** `e2e/baseball-smoke.spec.ts:42`
- **State:** renders_but_inert
- **Evidence:** expectAuthenticatedSurface() (lines 42-63) asserts: no /login redirect, no ERROR_BOUNDARY_TEXT_RE match, and `heading.first()` visible. Every one of the 12 tests (coach: Command Center, Calendar, Roster, Stats Center, Performance, Settings; player: Player Today, Calendar, Roster, My Stats, Lift, Settings) uses only this helper — zero assertions on roster contents, stat values, or any click/submit interaction. This is the suite wired as a required PR gate in ci.yml:417-424 and confirmed green on the latest run.
- **Impact:** A page can render with a broken roster query, empty stats, or a non-functional Save button and still pass the only baseball E2E check that actually blocks merges.

**P1.17 — vitest 'integration' and 'rls' projects are declared but never run in any CI workflow**

- **Anchor:** `vitest.config.ts:99`
- **State:** dead
- **Evidence:** vitest.config.ts:94-113 defines `integration` (include: src/**/*.integration.test.{ts,tsx}) and `rls` (include: src/**/*.rls.test.{ts,tsx}) projects with their own npm scripts (test:integration, test:rls). Grepping every file in .github/workflows/*.yml and .circleci/config.yml for those script names returns zero matches — only `npm run test:run` (--project unit, ci.yml:175) and `npm run verify:business` (ci.yml:197) run. 3 baseball *.integration.test.ts files exist (publish-lift-day-helm-bridge.integration.test.ts, coach-onboarding-staff-row.integration.test.ts, player-access-action-gate.integration.test.ts, 14 tests total) and pass locally (verified: npx vitest run --project integration) but are never executed by CI.
- **Impact:** A regression in Helm Bridge lift-day publishing, coach-onboarding staff-row creation, or player-access action gating can land on main with a fully green CI status because the only tests written for it never run.

**P1.18 — Staff invitation workflow (inviteStaff/revokeStaffInvite/resendStaffInvite/acceptStaffInvite) has zero unit-test coverage**

- **Anchor:** `src/app/baseball/actions/staff.ts:164`
- **State:** missing
- **Evidence:** src/app/baseball/actions/staff.ts (578 lines) exports inviteStaff (164), revokeStaffInvite (265), resendStaffInvite (294), updateStaffCapabilities (465), removeStaff (536), acceptStaffInvite (574). Grepped every *.test.ts/*.test.tsx in the repo for `actions/staff'` imports — zero results. RLS-layer coverage exists (supabase/tests/rls/baseball_staff_invite_accept.sql, baseball_staff_capabilities.sql, baseball_staff_audit_events.sql) but the action layer's own validation/error-handling/business-rule logic (duplicate invites, revoke-then-resend, capability updates) is never exercised.
- **Impact:** A bug in invite validation, duplicate-invite handling, or capability assignment during staff onboarding — the exact workflow a new coaching staff needs on day one — ships without any test catching it.

**P1.19 — Full fresh-account onboarding is a self-documented, never-built gap**

- **Anchor:** `e2e/baseball-onboarding-smoke.spec.ts:26`
- **State:** missing
- **Evidence:** File docstring (lines 26-32): "DEFERRED: full fresh-account onboarding — actually creating a brand-new coach/player account, completing the multi-step wizard end-to-end, and tearing the account down afterwards — is intentionally NOT covered here... Tracked as a separate follow-up issue (file one referencing #372 if it doesn't already exist)." Corroborated by e2e/README.md:322-333 ("Known gap / follow-up"). Confirmed no other test file (unit, integration, or e2e) exercises the multi-step onboarding wizard end-to-end for either coach or player.
- **Impact:** The actual first-run experience for a new program signing up is untested end-to-end; only the anonymous first-screen render and the final single-row DB upsert (complete-player-onboarding.test.ts) are covered.


</details>

## P2 (19)

| # | Finding | State | Anchor |
|---|---|---|---|
| 1 | No baseball surface uses the Fairway DataTable primitive — 16 files hand-roll <table> | `inconsistent` | `src/components/baseball/season-stats/SeasonStatsTable.tsx:194` |
| 2 | Only 6 files use ModalShell; 16 hand-roll fixed inset-0 overlays, including all 4 Documents modals | `inconsistent` | `src/components/baseball/documents/EditDocumentModal.tsx:82` |
| 3 | #379 stat-layer reconciliation Phase 2/3 still incomplete — Player Today's rolling-form window reads the deprecated legacy table directly | `inconsistent` | `src/lib/baseball/stat-layer-manifest.ts:126` |
| 4 | Production-safety gate is `--confirm` only — no project-ref or environment check, and every local .env file already points at prod | `insecure` | `scripts/seed-baseball-demo.ts:267` |
| 5 | No pending/expired invites, no deactivated roster member, no second real tenant for RLS/isolation testing, no sparse/empty-state player | `missing` | `scripts/seed-baseball-demo.ts` |
| 6 | A separate, un-audited demo-seed lineage exists (seed-rini-baseball-demo.ts) that breaks the 'never delete' guarantee generalized elsewhere | `inconsistent` | `scripts/seed-rini-baseball-demo.ts:7` |
| 7 | Lifting duplication resolved: one canonical data model (helm_lifting_*), two separate, unlinked product UIs | `inconsistent` | `src/app/baseball/(dashboard)/dashboard/performance/page.tsx:4` |
| 8 | Roster add does not automatically provision Lift Lab eligibility | `missing` | `src/app/baseball/actions/roster.ts:85` |
| 9 | Coach-facing Player Passport has zero Lift Lab / workout content | `missing` | `src/app/baseball/(dashboard)/dashboard/players/[id]/passport/page.tsx:20` |
| 10 | Email verification is not enforced in production despite UI copy implying it is | `inconsistent` | `src/app/baseball/(auth)/complete-signup/CompleteSignupClient.tsx:142` |
| 11 | recruiting_activated / pipeline_stage are columns on the core baseball_players table, not an isolated table | `works` | `supabase/migrations/20260527000000_prod_public_baseline.sql:8037` |
| 12 | Camps is wired 100% as a recruiting route today despite dual coach+player, non-recruiting-flavored purpose | `inconsistent` | `src/app/baseball/(dashboard)/dashboard/camps/page.tsx:1` |
| 13 | admin/feature-registry.ts is a telemetry taxonomy, not a runtime feature flag — do not mistake it for a gating mechanism | `missing` | `src/lib/admin/feature-registry.ts:20` |
| 14 | baseball_players cascades ON DELETE through 20+ tables including populated box-score history, with no soft-delete column | `inconsistent` | `supabase/migrations/20260527000000_prod_public_baseline.sql:15151` |
| 15 | Recurring schema/code drift pattern — 8+ reactive '*_reconcile'/'*_drift_*' migrations | `inconsistent` | `supabase/migrations/20260708011000_baseball_player_stats_drift_columns.sql` |
| 16 | Service-role (admin) client used in 11 baseball action files — 2 spot-checked as legitimate, 9 not individually traced | `works` | `src/app/baseball/actions/player-access.ts:89` |
| 17 | test finding | `missing` | `docs/test.md` |
| 18 | A CI hard-gate test suite ("Business contracts") partly asserts source-code strings, not runtime behavior | `renders_but_inert` | `src/contracts/baseball/product-trust.contract.test.ts:9` |
| 19 | Daily Contract action layer (681 lines, player accountability workflow) has zero test coverage; coach-notes.ts and ai-governance.ts likewise | `missing` | `src/app/baseball/actions/daily-contract.ts` |

<details><summary>P2 detail</summary>

**P2.1 — No baseball surface uses the Fairway DataTable primitive — 16 files hand-roll <table>**

- **Anchor:** `src/components/baseball/season-stats/SeasonStatsTable.tsx:194`
- **State:** inconsistent
- **Evidence:** `grep -rl DataTable src/components/baseball src/app/baseball` returns zero hits against `src/components/fairway/data-table/**`. 16 files independently implement `<table>`: SeasonStatsTable.tsx:194, PlayerGameLog.tsx:152/249, BoxScoreView.tsx:193/279, PipelineClient.tsx, WatchlistClient.tsx, AcademicsClient.tsx, PlayerProfileClient.tsx, ImportWizardClient.tsx, EventImportWizard.tsx, ImportDiffViewer.tsx, BoxScoreEntry.tsx, PracticePrintExport.tsx, PlayerPassportFairway.tsx, demo-sessions/page.tsx, each with its own sticky-column, density, and header-styling logic (e.g. `sticky left-0 bg-warm-50/80` duplicated verbatim in SeasonStatsTable.tsx:197 and PlayerGameLog.tsx:155/252).
- **Impact:** Every future table change (sort affordance, row density, sticky-column a11y fix, mobile card-collapse pattern) has to be hand-applied to 16 places instead of one; the tables already visibly differ in density and header treatment across Stats Center, Season Stats, Box Score, and Roster's saved lineups.

**P2.2 — Only 6 files use ModalShell; 16 hand-roll fixed inset-0 overlays, including all 4 Documents modals**

- **Anchor:** `src/components/baseball/documents/EditDocumentModal.tsx:82`
- **State:** inconsistent
- **Evidence:** `fixed inset-0 z-50 flex items-center justify-center p-4` appears verbatim (or near-verbatim) in EditDocumentModal.tsx:82, MoveToFolderModal.tsx:80, DocumentVersionHistoryModal.tsx:131, UploadNewVersionModal.tsx:95, plus PlayerProfileClient.tsx, PeekPanel.tsx, PlayerInspectorPanel.tsx, LiftOnboardingFlow.tsx, PlayerQuickView.tsx, coach-onboarding/page.tsx, player/page.tsx, TeamsClient.tsx, EventsClient.tsx — none composed from `src/components/fairway/overlays/ModalShell.tsx`, which is documented as THE one modal/one slide-over. None of these get the escape-key-stacking fix (ModalShell.handleContentEscapeKeyDown) or the z-index-on-Positioner-not-Popup contract documented as hard-won Fairway invariants — meaning a Select/Combobox opened inside any of these 16 modals is a candidate for the exact 'options mount but paint invisibly' bug the invariant doc warns about.
- **Impact:** Documents (an active Team feature, #9 in CLAUDE.md) has 4 separate modal implementations, each capable of independently drifting on focus-trap, escape-key, and backdrop behavior; a bug fix to one won't propagate to the other three.

**P2.3 — #379 stat-layer reconciliation Phase 2/3 still incomplete — Player Today's rolling-form window reads the deprecated legacy table directly**

- **Anchor:** `src/lib/baseball/stat-layer-manifest.ts:126`
- **State:** inconsistent
- **Evidence:** stat-layer-manifest.ts (the team's own live migration-backlog contract, enforced by stat-layer-contract.test.ts) still lists src/lib/baseball/read-models/player-today.ts (line 158) and src/app/baseball/actions/practice-effectiveness.ts (line 129) as GRANDFATHERED consumers of DEPRECATED_STAT_TABLES (baseball_player_stats/baseball_player_aggregates), 13 days after docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md (2026-07-15, commit ad259554f) reported this reconciliation as 'mid-flight, Phases 2/3 not started.' The manifest's own note at line 126 states the 'recent N games' rolling window and loadGameFacts's official-stats existence check 'still read baseball_player_stats game-type rows directly (no canonical per-game rolling-window primitive exists yet to replace them).' insights.ts, by contrast, WAS migrated off (no longer in the grandfathered list), confirming partial progress, not total stagnation.
- **Impact:** Player Today (/baseball/player/today) is a primary player-facing home surface. Its recent-form/rolling-window numbers source from the older, less-audited legacy stat layer rather than the canonical box-score/event layer the rest of the readiness doc treats as source-of-truth — for a program whose stats only exist via the newer box-score-upload RPC path, this window can silently diverge from what the coach sees on the Stats Center. The fallback is documented and tested (not concealed), but it is real, current, unresolved architecture debt on a surface a buyer will likely click during a demo.

**P2.4 — Production-safety gate is `--confirm` only — no project-ref or environment check, and every local .env file already points at prod**

- **Anchor:** `scripts/seed-baseball-demo.ts:267`
- **State:** insecure
- **Evidence:** seed-baseball-demo.ts:267-268 (`const confirmed = process.argv.includes('--confirm'); DRY = !confirmed;`) is the entire write gate, identical in seed-baseball-lifting-demo.ts:185-186, seed-baseball-surfaces-demo.ts:212-213, seed-baseball-demo-program.ts:397-398, seed-baseball-e2e.ts:231-232. Grepped all 6 files for the prod project ref, 'PRODUCTION', 'are you sure' — zero hits. `.env.local`, `.env.development.local`, and `.env.production.local` all define `NEXT_PUBLIC_SUPABASE_URL=https://qmnssrrolpinvwjjnufo.supabase.co` (verified by grep) — there is no separate staging/demo Supabase project anywhere in the repo, so no environment check would even have a non-prod target to distinguish.
- **Impact:** Anyone who runs the documented `DOTENV_CONFIG_PATH=.env.local npx tsx ... --confirm` command (or `npm run seed:baseball:ci`, which hardcodes `--confirm` with no dry-run step, package.json:19) writes directly to production with a single flag and no further confirmation. This is mitigated, not eliminated, by real org/team-id scoping: every write in these 5 scripts (excluding seed-rini-baseball-demo.ts, separately flagged below) is keyed to a deterministic uuid under a namespace fixed to the demo identity, and none of the 5 scripts contains a `.delete()` call — so it is structurally impossible for a `--confirm` run to touch another customer's org/team/player rows, only ever the same demo rows. This appears intentional (the demo team is meant to be a real, live production account for the public /baseball/demo gate — confirmed by src/app/baseball/actions/demo-access.ts and the runtime demo-read-only guard in src/lib/baseball/with-baseball-action.ts), not an oversight, but it means there is zero technical barrier between a mistyped `--confirm` and a production write.
- **Fix:** No fix required if accepted as intentional (documented risk, scoped blast radius). If tighter safety is wanted: add a project-ref allowlist check against NEXT_PUBLIC_SUPABASE_URL before any write, or require a second explicit env var (e.g. I_UNDERSTAND_THIS_IS_PROD=1) alongside --confirm.

**P2.5 — No pending/expired invites, no deactivated roster member, no second real tenant for RLS/isolation testing, no sparse/empty-state player**

- **Anchor:** `scripts/seed-baseball-demo.ts`
- **State:** missing
- **Evidence:** Live SQL: baseball_team_invitations=0, baseball_staff_invitations=0 for the demo team; `SELECT status, count(*) FROM baseball_team_members WHERE team_id=... GROUP BY status` returns exactly one row, `{status:'active', count:8}` — every one of the 8 roster members is 'active', none 'pending'/'inactive'/'cut'. The Phase-4 feeder orgs (Cypress Ridge HS, Lakeview Showcase, Tri-County JUCO — seed-baseball-demo-program.ts:280-308) exist only as recruiting-pipeline sources scoped by baseball_watchlists, not as a second independently-usable coach/team account for testing cross-tenant RLS isolation.
- **Impact:** A buyer testing invite flows, a deactivated/cut player, or asking 'can another program's coach see my data' finds no seeded example of any of these states — every demonstrable state is the single happy-path 'everyone active, everything populated' team.
- **Fix:** Add one pending and one expired invite row, flip one bench player to an 'inactive'/'cut' team_members status, and seed a fully separate second org+team+coach login as a live tenant-isolation demo.

**P2.6 — A separate, un-audited demo-seed lineage exists (seed-rini-baseball-demo.ts) that breaks the 'never delete' guarantee generalized elsewhere**

- **Anchor:** `scripts/seed-rini-baseball-demo.ts:7`
- **State:** inconsistent
- **Evidence:** Not in this task's assigned file list, but directly referenced by verify-baseball-demo-coverage.ts's 'rini' profile (lines 27-28, 39-42, 83-104) and package.json has no npm script for it. Its own header (line 7) says 'upsert-only (no destructive writes except the explicit old-team delete below)', and its main() gates a `.delete()` on a specific OLD_TEAM_ID (line ~204: `console.log(would delete old empty team ...)`) behind the same DRY/--confirm split as the other scripts — i.e. it DOES call `.delete()`, unlike every other seed script in this family. It seeds a completely different org (reusing 'njrini99's existing Rini University org', hardcoded ORG_ID/COACH_USER_ID/PLAYER_USER_ID at lines 24-27) and requires 3 extra env vars (RINI_DEMO_COACH_PASSWORD/RINI_DEMO_PLAYER_PASSWORD/RINI_DEMO_FILLER_PASSWORD) it will hard-exit without.
- **Impact:** The data contract doc (docs/seed/BASEBALLHELM_DEMO_DATA_CONTRACT.md) and every Phase1-4 script's safety claims say 'no .delete() anywhere' — true for the 4 phases audited here, false for this adjacent script that shares the same verify tool. Someone auditing 'is the seed suite delete-free' by reading the contract doc alone would be misled about this file.
- **Fix:** Either fold seed-rini-baseball-demo.ts's delete-scope disclosure into the shared data-contract doc, or move it out of scripts/ into a clearly personal/one-off location so it isn't discoverable alongside the reusable demo-seed family.

**P2.7 — Lifting duplication resolved: one canonical data model (helm_lifting_*), two separate, unlinked product UIs**

- **Anchor:** `src/app/baseball/(dashboard)/dashboard/performance/page.tsx:4`
- **State:** inconsistent
- **Evidence:** performance/page.tsx:4-6 states 'W2-G REWIRE: all READS now go through helm_lifting_* tables ... instead of the legacy baseball_lift_* tables' and imports resolveBaseballLiftingOrg/resolveBaseballAthleteIds (src/lib/lifting/resolve-baseball-context.ts) plus adaptSessionToAssignment/adaptExercise/adaptHelmReadinessCheckin (src/lib/lifting/adapters/baseball-view-adapter.ts) to map Lift Lab data into baseball's own components. Repo-wide grep for `.from('baseball_lift...')` returns zero matches — no code still queries the legacy tables. Meanwhile src/app/lifting/** is a fully separate app: its own login (liftingLoginAction, src/app/lifting/(auth)/login/page.tsx:14), own sidebar (src/components/lifting/shell/LabNav.tsx, 11 hand-listed items, no relation to BASEBALL_NAV_REGISTRY), own multi-sport org model (organization_id + sport filter, src/app/lifting/(dashboard)/dashboard/page.tsx:36-51).
- **Impact:** Not a data-integrity risk (single source of truth, confirmed no write-path fork), but a product-coherence one: BaseballHelm's Performance/Lift pages and the standalone Lift Lab are two different codebases, two different login screens, two different nav systems with zero cross-links — a buyer or strength coach has no way to discover that the fuller Lift Lab product exists from inside BaseballHelm.
- **Fix:** Decide the canonical answer for the demo: either present Lift Lab as a distinct upsell product with an explicit link from BaseballHelm's Performance hub, or treat BaseballHelm's embedded Performance/Lift pages as the only surface a baseball buyer should ever see and don't mention /lifting at all.

**P2.8 — Roster add does not automatically provision Lift Lab eligibility**

- **Anchor:** `src/app/baseball/actions/roster.ts:85`
- **State:** missing
- **Evidence:** assignPlayerToTeam has zero references to lifting/helm_lifting (grep confirmed). A player is only seeded into helm_lifting_athletes as an incidental side effect of a coach calling createStrengthGroup, setGroupMembers, recomputeDynamicGroup, setAvailabilityStatus, or setStrengthMax for that team (src/app/baseball/actions/lifting-v11.ts:287,342,586,1625,2586,2631 — each calls ensureBaseballAthletesSynced first). Until one of those fires, player-self reads degrade to an honest empty state (src/app/baseball/actions/player-today-lift.ts:73,89-94; src/lib/baseball/read-models/player-lift.ts:154-157).
- **Impact:** A newly-rostered player can sit indefinitely with zero Lift Lab data if the coach hasn't happened to touch one of those five specific actions for that team — there's no explicit 'enable Lift Lab for this player' affordance on the roster page itself, and the two dedicated 'Sync Athletes' buttons meant to be that affordance are both broken (see findings #1, #2).

**P2.9 — Coach-facing Player Passport has zero Lift Lab / workout content**

- **Anchor:** `src/app/baseball/(dashboard)/dashboard/players/[id]/passport/page.tsx:20`
- **State:** missing
- **Evidence:** Passport page header explicitly enumerates its sections: "Identity + Verified Measurables + Development Story + Media + Baseball Performance + File Readiness" (lines 20-21). Grep for helm_lifting/lift across this page and its backing read model src/lib/baseball/read-models/player-passport.ts returns 0 hits.
- **Impact:** A coach pulling up the full passport 'for a player meeting or roster evaluation' (page.tsx:23) — the stated purpose of this surface — sees no strength/workout-completion history at all, even though that data exists live in helm_lifting_sessions and is already surfaced elsewhere (Player Today, Live Weight Room).

**P2.10 — Email verification is not enforced in production despite UI copy implying it is**

- **Anchor:** `src/app/baseball/(auth)/complete-signup/CompleteSignupClient.tsx:142`
- **State:** inconsistent
- **Evidence:** `SELECT count(*) FILTER (WHERE email_confirmed_at IS NULL) FROM auth.users` against prod returns 0 unconfirmed out of 123 total users, and `supabase/config.toml:205` sets `enable_confirmations = false` under `[auth.email]`. Meanwhile CompleteSignupClient.tsx:142 displays the header 'Email verified!' as a signup-flow step, and BaseballSignInForm.tsx:20 has dead code specifically for an 'email not confirmed' Supabase error that will never fire given the confirmed prod setting.
- **Impact:** The product presents a confirmation step to users ('Email verified!') that doesn't correspond to any real verification gate — a buyer or their security team who tests this by signing up with a fake/typo'd email will get full account access immediately, with no way to prove the email is real. Minor trust/compliance gap, not a data-access hole.

**P2.11 — recruiting_activated / pipeline_stage are columns on the core baseball_players table, not an isolated table**

- **Anchor:** `supabase/migrations/20260527000000_prod_public_baseline.sql:8037`
- **State:** works
- **Evidence:** `"recruiting_activated" boolean DEFAULT false` and `"recruiting_activated_at"` (lines 8037-8038) and `"pipeline_stage" "public"."baseball_pipeline_stage"` (line 8282) are declared inside the baseball_players CREATE TABLE, alongside an index idx_baseball_players_recruiting (line 13081). Genuinely isolated recruiting-only tables confirmed via grep across all migrations: baseball_coach_recruiting_philosophy, baseball_recruiting_interests, baseball_watchlists, baseball_player_comparisons, baseball_camps, baseball_camp_registrations.
- **Impact:** A DB-level sunset cannot 'drop the recruiting tables' and be done — the two most load-bearing recruiting fields live on the shared Players entity every non-recruiting feature (roster, stats, profile) also reads. Any migration work must never touch baseball_players' schema; it only needs to leave these columns unused by UI.

**P2.12 — Camps is wired 100% as a recruiting route today despite dual coach+player, non-recruiting-flavored purpose**

- **Anchor:** `src/app/baseball/(dashboard)/dashboard/camps/page.tsx:1`
- **State:** inconsistent
- **Evidence:** middleware.ts RECRUITING_ROUTES (line 137) includes '/baseball/dashboard/camps', and nav-registry.ts tags the 'camps' entry hub:'recruiting' (line 778) — yet the entry's own comment (lines 765-774) says CampsClient is 'genuinely SHARED' (coach manage + player browse/register) with 'no role check' at the page level (confirmed: camps/page.tsx has zero program-type or recruiting-specific guard, only requires a signed-in session).
- **Impact:** If the founder's intent for 'sunset' is narrowly 'hide the college-recruiting funnel' rather than 'hide all camp/showcase-event registration,' Camps is the one route in the recruiting hub that is not unambiguously recruiting-only by its own code — worth an explicit product call before folding it into the blanket hide.

**P2.13 — admin/feature-registry.ts is a telemetry taxonomy, not a runtime feature flag — do not mistake it for a gating mechanism**

- **Anchor:** `src/lib/admin/feature-registry.ts:20`
- **State:** missing
- **Evidence:** The file's own doc comment: 'single source of truth for the feature key written to admin_events.feature ... passed as feature in withAdminObserved opts.' It lists baseball_camps, baseball_compare, baseball_discover as FeatureKey enum values purely for admin-analytics labeling — no code path reads these values to show/hide UI.
- **Impact:** This is the one file in the repo literally named 'feature-registry' — a natural first place to look for an existing flag system, but using it for gating would be a no-op (nothing consumes it for authorization). The real gating primitives are nav-registry.ts's hub field + the two server-route-guard functions + middleware's route lists.

**P2.14 — baseball_players cascades ON DELETE through 20+ tables including populated box-score history, with no soft-delete column**

- **Anchor:** `supabase/migrations/20260527000000_prod_public_baseline.sql:15151`
- **State:** inconsistent
- **Evidence:** baseball_players_user_id_fkey: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE (line 15151); baseball_box_score_batting_player_id_fkey and baseball_box_score_pitching_player_id_fkey (lines 14871, 14886) are also ON DELETE CASCADE. Live row counts: baseball_box_score_batting=179, baseball_box_score_pitching=53 (the main populated stat tables). baseball_players has no deleted_at/is_archived column (contrast with baseball_coach_notes, which explicitly documents 'SOFT DELETE only (deleted_at), never a hard row delete' per supabase/migrations/20260624000900_baseball_coach_notes.sql:37). Checked src/app/baseball/actions/roster.ts:187-217 (removePlayerFromTeam) — it only deletes the baseball_team_members join row, never baseball_players/users, so this cascade is not reachable from any current UI action.
- **Impact:** No exploitable path today, but there is no safe way to ever delete a player's account (GDPR-style request, admin cleanup, future account-deletion feature) without silently and permanently destroying that player's box-score contribution to team season history — which also skews any team-level aggregate that sums those rows.

**P2.15 — Recurring schema/code drift pattern — 8+ reactive '*_reconcile'/'*_drift_*' migrations**

- **Anchor:** `supabase/migrations/20260708011000_baseball_player_stats_drift_columns.sql`
- **State:** inconsistent
- **Evidence:** Migration comment verbatim: 'Schema drift repair: BaseballPlayerStats TS type ... declare hit_by_pitch / sacrifice_flies, but the live table never got them — an explicit PostgREST select naming them 400s.' Same pattern repeats in supabase/migrations/20260708022000_baseball_player_stats_real_stat_columns.sql, 20260702095900_baseball_651_column_reconcile.sql, 20260703050000_baseball_651_settings_os_reconcile.sql, 20260711180000_baseball_postgame_shape_reconcile.sql, 20260711180100_baseball_signals_category_check_reconcile.sql, 20260701013000_baseball_elite_event_tables_reconcile.sql, 20260702100200_baseball_practice_effectiveness_v7_reconcile.sql.
- **Impact:** Each of these was a live prod 400 caused by a TS type declaring columns the DB didn't have, fixed only after being hit. This is a systemic gap (no CI check compares src/lib/types/database.ts against the live schema) rather than isolated incidents — it is reasonable to assume at least one more instance is currently live and unreported.

**P2.16 — Service-role (admin) client used in 11 baseball action files — 2 spot-checked as legitimate, 9 not individually traced**

- **Anchor:** `src/app/baseball/actions/player-access.ts:89`
- **State:** works
- **Evidence:** createAdminClient imported in passport-settings.ts, operational-signals.ts, notifications.ts, postgame.ts, coachhelm-actions.ts, demo-access.ts, teams.ts, onboarding.ts, scout-packet.ts, demo-tracking.ts, player-access.ts. Read player-access.ts:57-131 (activateRecruitingExposure/deactivateRecruitingExposure) and teams.ts:380-450 (JUCO auto-activation on join): both use createAdminClient narrowly and only after prior RLS-scoped/application-level auth checks pass, specifically to write through a DB trigger (supabase/migrations/20260709010200_baseball_players_recruiting_guard.sql) that blocks the authenticated role from writing recruiting_activated directly — a defensible, well-commented pattern. operational-signals.ts:33, notifications.ts:20, postgame.ts:27, and coachhelm-actions.ts:26 all carry explicit comments ('no service_role in client path') suggesting the admin import there is unused or scoped to a narrow non-mutating helper, but I did not read those 4 files' actual createAdminClient call sites line-by-line, nor onboarding.ts/scout-packet.ts/demo-tracking.ts's.
- **Impact:** The two files inspected show no RLS-bypass abuse. The remaining 9 files were not fully traced in this pass and should be spot-checked by whoever owns the action-file security audit, since a bypass in a user-facing write path is exactly the class of P0 the mission is looking for.

**P2.17 — test finding**

- **Anchor:** `docs/test.md`
- **State:** missing
- **Evidence:** test evidence
- **Impact:** test impact

**P2.18 — A CI hard-gate test suite ("Business contracts") partly asserts source-code strings, not runtime behavior**

- **Anchor:** `src/contracts/baseball/product-trust.contract.test.ts:9`
- **State:** renders_but_inert
- **Evidence:** `const read = (path) => readFileSync(join(repo, path), 'utf8')` then e.g. `expect(src).toContain('riskFeedError')`, `expect(src).toMatch(/Standing by/i)` (lines 9-18), repeated across the file (14 toContain/toMatch calls) and in route-shell.contract.test.ts, coachhelm-product-truth.contract.test.ts, and demo-stats-smoke.contract.test.ts. This project (business) is a required check via ci.yml:196-197 `npm run verify:business`.
- **Impact:** These tests pass as long as the named identifier exists anywhere in the file text (including a dead branch or a comment) — they do not render the component or exercise the error/empty-state logic they claim to "contract" on, so a real regression in that logic would not be caught by a hard CI gate that looks like it covers this.

**P2.19 — Daily Contract action layer (681 lines, player accountability workflow) has zero test coverage; coach-notes.ts and ai-governance.ts likewise**

- **Anchor:** `src/app/baseball/actions/daily-contract.ts`
- **State:** missing
- **Evidence:** src/app/baseball/actions/daily-contract.ts exports saveDraftContract, commitContract, saveDraftAndCommit, toggleContractItem, completeContract, setContractVisibility, acknowledgeDailyContract. Grepped for test-file imports of `actions/daily-contract'`, `actions/coach-notes'`, `actions/ai-governance'` — zero hits in each case. (Note: src/lib/baseball/daily-contract/__tests__/* and src/lib/baseball/read-models/__tests__/player-daily-contract.test.ts DO test adjacent lib-layer logic like streak computation and ack visibility — but never this actions/ file's own mutation entry points.)
- **Impact:** The server-side mutations behind the player's daily accountability contract (commit, complete, toggle items, coach visibility) can regress with no automated signal.


</details>

## P3 (21)

| # | Finding | State | Anchor |
|---|---|---|---|
| 1 | Legacy cross-sport EmptyState (imports IconGolf) still backs baseball's chart empty states | `inconsistent` | `src/components/baseball/stat-visuals/StatVisualFrame.tsx:40` |
| 2 | operations and scouting hub landing pages have no loading.tsx | `missing` | `src/app/baseball/(dashboard)/dashboard/operations/page.tsx` |
| 3 | decision-room.ts comment falsely claims its tables are in unapplied migrations | `inconsistent` | `src/app/baseball/actions/decision-room.ts:41` |
| 4 | lift-onboarding.ts comment claims a migration is 'NOT applied' that is actually live in prod | `inconsistent` | `src/app/baseball/actions/lift-onboarding.ts:12` |
| 5 | Demo credentials, idempotency, and realistic naming — all confirmed working as documented | `works` | `scripts/seed-baseball-demo.ts:129` |
| 6 | Settings → Integrations Level-4 'Direct API' rows are permanently inert by design (honestly disclosed, but a demo trap) | `renders_but_inert` | `src/components/baseball/settings/IntegrationsClient.tsx:464` |
| 7 | Player-detail sub-routes (stats/passport/scout-packet) are absent from nav-registry.ts but are NOT orphans — confirmed linked from parent page | `works` | `src/components/baseball/player-profile/PlayerProfileClient.tsx` |
| 8 | /baseball/dashboard/stats/games (and /games/[gameId], /games/create) reachable only via a hand-declared hub supplement, not nav-registry.ts | `works` | `src/app/baseball/(dashboard)/_components/hub-definitions.ts:44` |
| 9 | 'team' nav id intentionally duplicates 'command-center' href — documented alias, not a bug | `works` | `src/lib/baseball/nav-registry.ts:966` |
| 10 | No formal injury/restriction system; soreness→exercise conflict is advisory-only, never blocking | `inconsistent` | `src/lib/baseball/exercise-conflict.ts:15` |
| 11 | Orphaned parallel Live Weight Room read model / action, superseded but not removed | `dead` | `src/lib/baseball/read-models/live-weight-room.ts:81` |
| 12 | Player Today genuinely combines Lift Lab + baseball data live (positive control) | `works` | `src/lib/baseball/read-models/player-today.ts:736` |
| 13 | Duplicate-athlete prevention is real at the DB layer (positive control) | `works` | `supabase/migrations/20260625000000_helm_lifting_identity.sql:103` |
| 14 | Google SSO on signup is a permanently-disabled placeholder button | `placeholder` | `src/components/auth/baseball-sign-up-form.tsx:223` |
| 15 | Removed/suspended coaching staff retain middleware-level access to most of the dashboard (mitigated at data layer, not route layer) | `inconsistent` | `src/lib/supabase/middleware.ts:321` |
| 16 | Canonical spec doc claims a 'Recruiting/Showcase' player-profile tab that does not exist in current code | `inconsistent` | `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md:151` |
| 17 | Canonical spec's P0-7 finding names a hook that no longer exists under that name | `inconsistent` | `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md:622` |
| 18 | Confirmed genuinely NOT recruiting despite adjacent naming — safe to leave fully visible | `works` | `src/app/baseball/(dashboard)/dashboard/academics/AcademicsClient.tsx` |
| 19 | living-annual design system is 206-file shared infrastructure; only RecruitCard/CommitSeal are recruiting-specific | `works` | `src/components/baseball/living-annual/molecules/RecruitCard.tsx` |
| 20 | Duplicate-athlete protection is adequate — no gap found | `works` | `supabase/migrations/20260527000000_prod_public_baseline.sql` |
| 21 | FK-covering-index gaps already remediated 2026-07-10; live re-verification blocked by Supabase MCP outage | `inconsistent` | `supabase/migrations/20260710004100_fk_covering_indexes_batch1_admin_baseball_a_m.sql` |

<details><summary>P3 detail</summary>

**P3.1 — Legacy cross-sport EmptyState (imports IconGolf) still backs baseball's chart empty states**

- **Anchor:** `src/components/baseball/stat-visuals/StatVisualFrame.tsx:40`
- **State:** inconsistent
- **Evidence:** StatVisualFrame.tsx:40 imports `EmptyState` from `@/components/ui/empty-state`, whose own header comment (`src/components/ui/empty-state.tsx:1-30`) confirms it is the pre-redesign kit and its icon import list includes `IconGolf` (line 9) — a golf-specific icon shipped inside a component now rendering baseball stat-visual empties. StatVisualFrame.tsx's own top comment (line ~24) admits: 'uses the GolfHelm UI primitives VERBATIM.'
- **Impact:** The empty state for 'not enough EV/LA data yet' on a real hitting chart renders through a component literally named/typed for the other sport product, not Fairway's `InsufficientData` (which exists precisely for this 'data exists but not enough of it' case per its own doc comment) — a visible tell that this surface was ported, not designed for baseball.

**P3.2 — operations and scouting hub landing pages have no loading.tsx**

- **Anchor:** `src/app/baseball/(dashboard)/dashboard/operations/page.tsx`
- **State:** missing
- **Evidence:** Directory listing of `src/app/baseball/(dashboard)/dashboard/operations/` and `.../scouting/` contains `page.tsx` but no `loading.tsx`, unlike the other ~30 dashboard route folders which all pair page.tsx with loading.tsx (confirmed via `for d in dashboard/*/; do [ -f page.tsx ] && [ ! -f loading.tsx ] && echo $d; done` — only operations, scouting, and the trivial stats redirect stub matched).
- **Impact:** Low severity (both are server components reading through capability-gated nav registry lookups, so the blocking window is short), but it's an inconsistency a founder walkthrough could hit as a blank flash while every sibling hub page has a shaped skeleton.

**P3.3 — decision-room.ts comment falsely claims its tables are in unapplied migrations**

- **Anchor:** `src/app/baseball/actions/decision-room.ts:41`
- **State:** inconsistent
- **Evidence:** Comment block at decision-room.ts:41-49 says 'baseball_meeting_items and baseball_decision_log are defined in unapplied migrations.' Verified via Supabase MCP list_migrations that both migrations (20260624000230_baseball_meeting_items-equivalent, 20260624000310_baseball_decision_log) are applied to production. The team's own readiness doc flagged this exact staleness on 2026-07-15 ('the LooseClient cast... are now stale... should be cleaned up with a db:types regen') and it is still unfixed 13 days later.
- **Impact:** Not a functional bug — Decision Room works — but a future engineer reading this file will believe the tables are gated behind an unapplied migration and may waste time re-verifying or avoiding a feature that's actually safe to build on.

**P3.4 — lift-onboarding.ts comment claims a migration is 'NOT applied' that is actually live in prod**

- **Anchor:** `src/app/baseball/actions/lift-onboarding.ts:12`
- **State:** inconsistent
- **Evidence:** lift-onboarding.ts:10-20 and the migration file supabase/migrations/20260702120000_baseball_helm_lifting_athletes_onboarded_at.sql both say 'DB-GATED — NOT APPLIED.' Verified via Supabase MCP execute_sql that helm_lifting_athletes.onboarded_at column exists (data_type timestamptz) and the helm_lifting_mark_athlete_onboarded SECURITY DEFINER RPC exists in prod (applied under migration version 20260703005940, a differently-timestamped migration entry, not the exact filename in supabase/migrations/).
- **Impact:** Inconsequential for the buyer — the feature actually persists onboarding state correctly, better than the code's own defensive comments assume. Only a documentation-accuracy issue; flagging so it isn't mistaken for an open blocker by whoever reads it next.

**P3.5 — Demo credentials, idempotency, and realistic naming — all confirmed working as documented**

- **Anchor:** `scripts/seed-baseball-demo.ts:129`
- **State:** works
- **Evidence:** Credentials: demo-coach@baseballhelmdemo.com / demo-player@baseballhelmdemo.com / demo-lift-coach@baseballhelmdemo.com, all password 'BaseballDemo2026' (seed-baseball-demo.ts:129-132, seed-baseball-lifting-demo.ts:76-78); E2E-only testcoach@helm.test/TestCoach123! and testplayer@helm.test/TestPlayer123! (seed-baseball-e2e.ts:76-79), force-reset every run to prevent lockout drift (lines 228-262, 197-227). Idempotency: every id is `sha1(namespace:key)` reshaped to a v5 UUID (detId(), consistent across all files), every write is `.upsert({onConflict})`, zero `.delete()` in any of the 5 assigned scripts; live query confirms the demo team's rows match the documented shapes exactly (8 players, 20 games, 120/40 box-score lines, etc.). Names: full realistic roster (Marcus Rodriguez, Jake Thompson, Caleb Williams, ...) and 8 realistic recruit names (Tyler Ramirez, DeShawn Carter, ...) — no 'Test User'/'Player 1' placeholders outside the E2E-only fixture file, where 'Test Player' is intentionally scoped to automated specs only.
- **Impact:** This part of the mission's safety/quality bar is met — re-running the seed chain is safe, and the visible-to-a-buyer roster reads as a real team, not test fixtures.
- **Fix:** None needed.

**P3.6 — Settings → Integrations Level-4 'Direct API' rows are permanently inert by design (honestly disclosed, but a demo trap)**

- **Anchor:** `src/components/baseball/settings/IntegrationsClient.tsx:464`
- **State:** renders_but_inert
- **Evidence:** Line 51 hint text: 'Level 4 — Direct API: Inert until pilot evidence + explicit vendor permission.' The enable/disable toggle is explicitly disabled for level-4 rows (line 464: `disabled={isPending \|\| i.integration_level === 4}`) with a title tooltip explaining it (472-476). No credential fields exist anywhere in the form.
- **Impact:** This is an honestly-labeled limitation, not a bug — but if a buyer's IT staff asks 'does this connect live to TrackMan/Rapsodo/GameChanger,' the true answer is 'no, by design, ever pending.' Worth the founder knowing before a live demo Q&A, not worth engineering time before morning.
- **Fix:** No code fix needed; brief the founder so this doesn't get demoed as a working live sync.

**P3.7 — Player-detail sub-routes (stats/passport/scout-packet) are absent from nav-registry.ts but are NOT orphans — confirmed linked from parent page**

- **Anchor:** `src/components/baseball/player-profile/PlayerProfileClient.tsx`
- **State:** works
- **Evidence:** src/app/baseball/(dashboard)/dashboard/players/[id]/{stats,passport,scout-packet,scout-packet/preview}/page.tsx have no nav-registry.ts entry (by design — nav-registry.ts:632-634 documents deep-link-only detail pages are intentionally excluded). Grep confirms PlayerProfileClient.tsx and src/components/baseball/season-stats/SeasonStatsTable.tsx contain the `id}/stats`/`id}/passport`/`id}/scout-packet` template-literal links that make these routes reachable from the players/[id] parent page.
- **Impact:** None — listed for completeness since these routes initially looked orphaned from the nav-registry href diff alone.
- **Fix:** None required.

**P3.8 — /baseball/dashboard/stats/games (and /games/[gameId], /games/create) reachable only via a hand-declared hub supplement, not nav-registry.ts**

- **Anchor:** `src/app/baseball/(dashboard)/_components/hub-definitions.ts:44`
- **State:** works
- **Evidence:** hub-definitions.ts:44-51 declares STATS_GAMES_TAB as a manually-added 'supplementary leaf tab' inside the Stats & Performance hub sub-nav, explicitly called out (line 20) as 'the ONE surviving supplement' after Ruling 2 folded Season/Upload into Stats Center's own matchPrefixes. GameDetailHeader.tsx:28 also links back to it.
- **Impact:** None functionally, but this is the one hand-maintained exception to the 'registry is the only source of truth' architecture — a future refactor that only touches nav-registry.ts could silently drop this tab without any test catching it unless nav-manifest.test.ts covers hub-definitions.ts too.
- **Fix:** Verify nav-manifest.test.ts (src/lib/baseball/__tests__/nav-manifest.test.ts) actually asserts STATS_GAMES_TAB stays wired; if not, add coverage.

**P3.9 — 'team' nav id intentionally duplicates 'command-center' href — documented alias, not a bug**

- **Anchor:** `src/lib/baseball/nav-registry.ts:966`
- **State:** works
- **Evidence:** nav-registry.ts:966-981: the 'team' entry's href is literally '/baseball/dashboard/command-center', with an inline comment explaining it's a 'backward-compatible secondary landing' and that hub-definitions.ts deliberately excludes it from rendered tabs.
- **Impact:** None — flagged only because a naive href-collision scan would misreport this as a duplicate/dead route.
- **Fix:** None required.

**P3.10 — No formal injury/restriction system; soreness→exercise conflict is advisory-only, never blocking**

- **Anchor:** `src/lib/baseball/exercise-conflict.ts:15`
- **State:** inconsistent
- **Evidence:** No CREATE TABLE for anything named injury/restriction exists in supabase/migrations (grep 0 hits). scoreExerciseConflict/suggestSubstitutions are genuinely wired into the manual builder (src/components/baseball/performance/lift-canvas/LiftCanvas.tsx:66,420,444,486,546) using self-reported soreness (helm_lifting_soreness_maps) and deliberately avoid medical language by contract ('NEVER use injury, must, cannot' — file header comment, line 24-25).
- **Impact:** Soreness only produces a soft warning ('worth reviewing', 'consider substituting') in the interactive builder canvas; nothing prevents a coach from assigning/publishing a conflicting exercise, and there is no automatic exclusion in publishLiftDay or any bulk-assignment path. This matches the product's own design intent (soft advisory, not medical gate) but means there is no hard restriction enforcement anywhere in the pipeline — worth confirming this is the intended posture for a selling program with an athletic trainer workflow.

**P3.11 — Orphaned parallel Live Weight Room read model / action, superseded but not removed**

- **Anchor:** `src/lib/baseball/read-models/live-weight-room.ts:81`
- **State:** dead
- **Evidence:** getLiveWeightRoomData() and its action wrapper getLiveWeightRoomSnapshot (src/app/baseball/actions/lifting-v11.ts:2218) have zero callers in any .tsx across the app (grep confirmed); the actual live page (src/app/baseball/(dashboard)/dashboard/performance/live/page.tsx:82-289) builds its own inline buildLiveRoomData() instead, per its own header comment: 'LANE C — ONE LIFT LAB: repointed at the canonical ... instead of the legacy'.
- **Impact:** Low risk (fully honest empty-vs-error handling, real readiness gating) but pure dead weight — a full parallel implementation of coach-facing readiness/soreness logic that no user can ever reach, worth deleting or documenting as retired rather than leaving as an apparent second source of truth.

**P3.12 — Player Today genuinely combines Lift Lab + baseball data live (positive control)**

- **Anchor:** `src/lib/baseball/read-models/player-today.ts:736`
- **State:** works
- **Evidence:** buildTodayFeed (or equivalent) resolves resolveBaseballLiftingOrg + resolveMyBaseballAthleteId (lines 736-737) then Promise.all-fans-out real queries: baseball_events, box-score activity, helm_lifting_sessions ('Lifts Due', lines 776-787), baseball_actions (deduped against lift_modification, lines 788-799+), readiness checkin, tasks, coach notes, practice — all athlete/player-id scoped, degrading to an honest empty feed (not an error) when unlinked.
- **Impact:** This is the strongest evidence the founder-mission concern ('is this integration just table names implying wiring, or real') is answered WORKS for the player-facing surface — it is real, live, correctly-scoped engineering, not mock data.

**P3.13 — Duplicate-athlete prevention is real at the DB layer (positive control)**

- **Anchor:** `supabase/migrations/20260625000000_helm_lifting_identity.sql:103`
- **State:** works
- **Evidence:** CONSTRAINT uq_helm_lifting_athlete UNIQUE (organization_id, sport, sport_player_id), paired with the seeding RPC's ON CONFLICT DO NOTHING (migrations/20260625000030:214, verified against the live prod function signature via SQL). Zero duplicate (org, sport, sport_player_id) rows found in production (all 22 baseball/golf rows have sport_player_id populated with no collisions).
- **Impact:** A coach or an admin re-running any of the correctly-wired sync paths (the baseball-embedded ensureBaseballAthletesSynced) cannot create a second athlete identity for the same player — this specific P0 concern from the mission brief is NOT present at the data layer, only in the broken client-side UI wrappers (findings #1, #2) which fail before they'd ever reach the point of risking a duplicate.

**P3.14 — Google SSO on signup is a permanently-disabled placeholder button**

- **Anchor:** `src/components/auth/baseball-sign-up-form.tsx:223`
- **State:** placeholder
- **Evidence:** <Button variant="outline" type="button" disabled ...>Continue with Google</Button> — hardcoded disabled prop, no onClick, no OAuth provider wiring anywhere in the component.
- **Impact:** A prospect clicking the obviously-present Google button gets nothing (it's inert), which reads as broken rather than 'coming soon.' Should be removed or clearly labeled if SSO isn't shipping before the demo.

**P3.15 — Removed/suspended coaching staff retain middleware-level access to most of the dashboard (mitigated at data layer, not route layer)**

- **Anchor:** `src/lib/supabase/middleware.ts:321`
- **State:** inconsistent
- **Evidence:** checkRouteAuthorization (middleware.ts:308-441) only fetches/evaluates the caller's baseball_team_coach_staff row for recruiting/org/academics routes or routes listed in STAFF_CAPABILITY_ROUTES (middleware.ts:38-54); line 321's early return (if (!isRecruitingRoute && !isOrgRoute && !isAcademicsRoute && !isLegacyTeamRoute && !requiredCapability) return {authorized:true}) means Command Center, Roster (view), Calendar, Messages, Tasks, Travel, and most of /baseball/dashboard/* never check status. staffHasCapability (line 290-306) does check status in ['suspended','removed','invited'] but only runs when a capability route is hit. By contrast, getActiveBaseballContext() (src/lib/baseball/active-context.ts:101-105) — used by every withBaseballAction-wrapped server mutation — DOES filter out suspended/removed/invited staff, so actual data mutation is blocked; this is a route/render-layer inconsistency, not a full authz bypass, since RLS-backed reads are also independently status-scoped per migration 20260630230000_baseball_is_team_staff_active_status.
- **Impact:** A coach removed from a team via removeStaff() can still navigate to and render most dashboard pages (mutations and most real data reads are blocked elsewhere), which is confusing/inconsistent rather than a hard security hole. Worth tightening for polish but not launch-blocking.

**P3.16 — Canonical spec doc claims a 'Recruiting/Showcase' player-profile tab that does not exist in current code**

- **Anchor:** `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md:151`
- **State:** inconsistent
- **Evidence:** Doc: 'Player profile (10 tabs) \| Snapshot, Timeline, Stats, Video, Practice, Performance, Academics/Availability, Notes, Recruiting/Showcase (when enabled), Settings/Permissions'. Actual code: `type MainTab = 'overview' \| 'stats' \| 'videos' \| 'performance' \| 'passport' \| 'timeline' \| 'notes' \| 'tasks'` (PlayerProfileClient.tsx:220) — 8 tabs, zero recruiting-related tab, verified against the rendered tab array at line 620-633.
- **Impact:** The doc is stale for this surface — no work is needed to gate a 'Recruiting/Showcase' player-profile tab because it does not exist. Following the doc's claim would waste sunset effort searching for dead code.

**P3.17 — Canonical spec's P0-7 finding names a hook that no longer exists under that name**

- **Anchor:** `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md:622`
- **State:** inconsistent
- **Evidence:** Doc: 'Wire useTeamRouteProtection — hook is defined but never called; college players can reach recruiting surfaces without authorization \| src/hooks/use-route-protection.ts'. That file actually exports `usePlayerRecruitingGate` (not `useTeamRouteProtection`), and — separately from that client hook — journey/page.tsx, colleges/page.tsx, and analytics/page.tsx now call the server-side `requireRecruitingPlayerRoute` guard (server-route-guards.ts:184-190) which explicitly checks player_type==='college' before render.
- **Impact:** The specific P0 gap the doc describes (college players reaching recruiting surfaces unauthorized) appears superseded by a newer server-side guard added after the doc was written. Treat this doc line as evidence to re-verify, not a live bug to fix as part of the sunset — don't duplicate work.

**P3.18 — Confirmed genuinely NOT recruiting despite adjacent naming — safe to leave fully visible**

- **Anchor:** `src/app/baseball/(dashboard)/dashboard/academics/AcademicsClient.tsx`
- **State:** works
- **Evidence:** Zero case-insensitive 'recruit' matches in AcademicsClient.tsx; the academics nav entry (nav-registry.ts:748-759) is hub:'academics' (its own hub, distinct from hub:'recruiting'), gated on can_view_academics, and its own module toggle (academics_module_enabled) is unrelated to recruiting per requireAcademicsCoachRoute's doc comment (server-route-guards.ts:120-131). Organization/Teams/Events (hub:'management', gated on SHOWCASE_ORG_PROGRAM_TYPES + can_manage_settings) are showcase multi-team org admin, unrelated to the recruiting funnel despite both being showcase-flavored.
- **Impact:** None — confirms these should NOT be touched by the sunset. Listed to prevent an overzealous grep-and-hide pass from catching academics or organization/teams/events by mistake (both share 'showcase'-adjacent vocabulary with real recruiting surfaces).

**P3.19 — living-annual design system is 206-file shared infrastructure; only RecruitCard/CommitSeal are recruiting-specific**

- **Anchor:** `src/components/baseball/living-annual/molecules/RecruitCard.tsx`
- **State:** works
- **Evidence:** `grep -rl "from '@/components/baseball/living-annual'"` returns 206 files spanning auth, onboarding, academics, calendar, dev-plans, documents, events, etc. — it is the app-wide editorial design kit (Masthead, PaperCard, GradeStamp, HairlineRule, motion primitives), not recruiting infrastructure. `RecruitCard` (the only recruiting-specific molecule) is imported only by PipelineClient.tsx and WatchlistClient.tsx.
- **Impact:** Confirms the P0 shared-component risk is narrow and well-contained: deleting or hiding RecruitCard/CommitSeal's recruiting usage is safe; nothing about living-annual itself needs to change, and any blanket 'remove living-annual recruiting imports' sweep must not touch the other 204 files.

**P3.20 — Duplicate-athlete protection is adequate — no gap found**

- **Anchor:** `supabase/migrations/20260527000000_prod_public_baseline.sql`
- **State:** works
- **Evidence:** Unique constraints confirmed live: baseball_players_user_id_key UNIQUE(user_id), baseball_team_members_team_id_player_id_key UNIQUE(team_id, player_id), baseball_team_coach_staff_team_id_coach_id_key UNIQUE(team_id, coach_id), baseball_teams_join_code_key UNIQUE(join_code), uq_helm_lifting_athlete UNIQUE(organization_id, sport, sport_player_id), uq_helm_lifting_coach_user_org UNIQUE(user_id, organization_id). baseball_players.user_id is NOT NULL, so every player row is tied 1:1 to a real auth account (no orphan/placeholder duplicate-player risk).
- **Impact:** No action needed — cited so the write-agent doesn't spend time re-deriving this.

**P3.21 — FK-covering-index gaps already remediated 2026-07-10; live re-verification blocked by Supabase MCP outage**

- **Anchor:** `supabase/migrations/20260710004100_fk_covering_indexes_batch1_admin_baseball_a_m.sql`
- **State:** inconsistent
- **Evidence:** Migration header states: 'Advisor cleanup (unindexed_foreign_keys, batch 1/4): covering indexes for FKs. Applied to prod 2026-07-10 via MCP (post-apply: 0 unindexed FKs in public).' Companion batches: 20260710004200 (baseball p-z), 20260710004400 (helm_lifting). Attempted a live re-verification query (pg_index vs FK columns) but mcp__supabase__execute_sql began timing out and then returned Cloudflare 502 'origin_bad_gateway' for all subsequent calls, including a bare `select 1`.
- **Impact:** No new index gap found in code; treating the migration's own audit note as credible but unverified live in this session. Whoever picks this up next should re-run mcp__supabase__get_advisors(type='performance') once the MCP connection is healthy to confirm 0 unindexed FKs still holds after 3 weeks of subsequent migrations.


</details>
