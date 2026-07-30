# CURRENT PRIORITIES

_Updated 2026-07-29 09:50 EDT. Worked strictly in order. A priority marked
**in progress** with no corresponding commit has STALLED — restart it._

> ### ⚠️ READ FIRST — two live incidents interrupted this mission
>
> **RESOLVED 09:43 EDT — the big one: production Postgres was wedged.** It
> stopped serving at **04:10:00Z** and answered zero queries for **9.4 hours**.
> Supabase's control plane never noticed — `GET /v1/projects/{ref}` read
> `ACTIVE_HEALTHY` throughout, so the status page was clear and nothing paged.
> Two sessions independently read the symptom as a transient 522 blip.
>
> What actually settled it: a **9.4-hour gap** in `get_logs(postgres)`
> (checkpoints run every ~5 min, so the silence IS the diagnosis), the gateway
> still logging live with every DB-backed request 522 while `/auth/v1/health`
> answered 401 in ~110ms, and `GET /v1/projects/{ref}/health` returning
> `db: UNHEALTHY, "Failed to connect to database"`. Fixed by a user-approved
> Management API restart at 13:38Z. `/api/health` now returns `database: "ok"`
> in 78ms, having previously hung past 45s. Playbook saved to memory.
>
> **Root cause of the wedge is still unknown** and the restart destroyed the
> evidence. If it recurs, capture `pg_stat_activity` BEFORE restarting. The
> nightly cron cluster (`causality-attribute` 03:00, `coachhelm-calibration`
> 03:40, `coachhelm-insight-lifecycle` 04:00, `refresh-engagement` every 5 min)
> sits right on the window, as does the recurring ~03:45Z deadlock in #790 —
> suggestive, not established.
>
> **07:12 EDT, separate and still undeployed.** A user on **full LTE bars** was
> served `offline.html` and could not get past it. The service worker is
> registered `scope: '/'` from the GOLF DASHBOARD, so it controls the whole
> origin, and `handleDynamicRequest`'s catch turned **any** single `fetch`
> rejection into a full-page "No Connection" — no retry, no `navigator.onLine`
> check, and a "Try Again" that re-entered the same handler.
>
> Fixed in `#1094`. **UPDATE 2026-07-29 evening: #1094, #1097, #1098, #1099 and
> #1101 are all now merged to `main`** — the owner gave merge authorization
> ("Merge what needs to be merged I give authorization", later "Merge don't
> deploy").
>
> ✅ **DEPLOYED 2026-07-29 18:37:10Z — this fix is now LIVE.** The owner asked
> for a single deploy carrying everything ("make one deploy so all fixes will be
> on one deploy").
>
> Production is `dpl_GGoaQYjxpJgf2uL3q8ySK7nPLN5U`, commit `b18c2a174`, state
> READY, aliased to helmsportslabs.com. `/api/health` returns
> `{"status":"healthy","database":"ok"}` in ~100ms and reports its own
> `deploymentId`, which is how the cutover was confirmed rather than assumed.
>
> Shipped in it: **#1094** (offline.html on full LTE), **#1095** (golf dashboard
> blocked on a closed chat drawer), **#1096** (iOS Capacitor), **#1097** (CI seed
> retry), **#1098** (middleware auth fallback taking the whole site down),
> **#1099** (mobile hamburger, Bridge detail, Bridge read gate), **#1101**
> (`describeError`), **#1102** (this record + regenerated types).
>
> ⚠️ **Deployed from a clean detached worktree at `b18c2a174`, NOT from the
> shared working tree.** The shared tree carries another session's uncommitted
> files; `vercel --prod` uploads the local directory, so deploying from there
> would have shipped their in-progress work. Worth remembering — this is the one
> deploy mechanism where the shared-tree hazard below reaches production.
>
> `main` still does not auto-deploy (`vercel.json` →
> `git.deploymentEnabled {"*": false}`), so a future deploy remains an explicit
> `vercel --prod` from a clean tree at main's tip.
>
> **The database-ahead-of-app inversion is now resolved** — while it lasted, the
> migrations were applied against a production serving `bd1e625d4`, verified by
> exercising every affected flow against that commit's own call sites.
>
> ### ⚠️ SHARED-TREE HAZARD
>
> The other session's uncommitted files (27 earlier, 13 at 08:30, since
> committed as #1096/#1097/#1098) overlapped **10 files that the newly merged
> `main` also changed** — `golf/(auth)/welcome/{page,loading}.tsx`,
> `golf/(dashboard)/dashboard/page.tsx`, `golf/loading.tsx`, four
> `fairway/pages/dashboard/*` files, `golf/theme/ThemeScript.tsx`,
> `hooks/use-sequenced-navigation.ts`. Nothing of theirs was touched; all my
> work since 08:30 runs in an isolated `git worktree` for exactly this reason.

---

## ✅ RESOLVED 2026-07-29 — the #1 item is DONE, all six exposures closed

**The owner gave the instruction ("fix all code and database fixes" → "Go do
it") and, later that night, authorized the last one — so all six of the
exposures below are now closed in production.** The section that follows is kept
as the record of what they were; the table's "what leaks" column is past tense
for every row.

| Applied | What it closed |
|---|---|
| `20260729000100` (A) | the seven definer helpers the policies and app need |
| `20260729000200` (B) | `baseball_players`, `baseball_teams`, `baseball_team_invitations`, `baseball_player_percentiles`, `baseball_messages`, `baseball_notifications` |
| `20260729000300` | Lift Lab identity sync — plus the repair itself was run: 21 of 22 athletes were locked out of `/lifting/dashboard`, now 0 |
| `20260729200000` (~01:20Z on the 30th) | `baseball_coaches` — the last P0. Every coach could read every coach's email; now scoped to own-org via `shares_my_baseball_organization()`. Verified as **all ten** live coach accounts. |
| `20260728030000` (same apply window, **golf lane**) | not a security fix — the correlated-RLS rewrite of `putt_details` / `approach_miss_details`. **4403ms → 323ms** (13.6×) with row counts identical to the pre-change control. |

Verified by executing the policies as three real users via role impersonation
(`SET LOCAL ROLE authenticated` + `request.jwt.claims` in a rolled-back
transaction) — a technique I had wrongly recorded as unavailable, and which is
the reason this could be applied with evidence instead of hope. Join-by-code,
the roster email search, and the anon-facing public view were each exercised
through the exact RPC the app calls. Full before/after tables in
`DATABASE_STATUS.md`; PR **#1102**.

**Finding #5, `baseball_coaches`, closed later the same night.** It had been
held as "a product decision plus a 75-call-site audit, not a policy swap" — but
the audit came back and answered the product question by itself: of 74 reads, 66
are self-scoped, 2 are INSERTs, 1 uses the service-role client, and the last 5
are same-org by construction. **Nothing needed a cross-org read**, so there was
no decision left to make and the fix was a policy swap after all. **No unclosed
P0 remains in this document.**

### Post-deploy verification — what was and was NOT confirmed

Confirmed against live production after the 18:37Z cutover:

| Check | Result |
|---|---|
| deployed SHA | `b18c2a174` = main's tip ✓ |
| `/api/health` | `healthy`, `database: ok`, ~100ms ✓ |
| `/`, `/baseball`, `/golf/login`, `/baseball/login` | all HTTP 200 ✓ |
| Vercel runtime errors, 1h window spanning the deploy | **none** ✓ |
| postgres ERRORs | 6, all my own probes (deliberate `Forbidden` + `permission denied` tests, and enum typos) ✓ |

**NOT confirmed, and the reasons are mechanical rather than excuses:**

- **The mobile hamburger was not visually re-verified in production.** Three
  independent blockers: Chrome refuses to resize its window below ~500px;
  Playwright's MCP browser profile is locked by another session; and the site
  correctly refuses to be framed (X-Frame-Options), which kills the iframe
  workaround. It is covered by 5 passing unit tests asserting the lock lands on
  `documentElement` (not `body`) and that the Lenis scroller is stopped and
  restarted, and the fix is confirmed deployed by SHA.

- **Join-by-code was not exercised end-to-end through the UI.** A logged-out
  visitor cannot resolve a code by design — `resolve_baseball_team_by_join_code`
  has anon EXECUTE revoked — so the page requires sign-in, and entering
  credentials is out of scope. The resolver is verified at the database layer
  (returns 1 row for an authenticated non-member).

  ⚠️ **A curl of `/baseball/join/<code>` appears to render "not found" for both
  valid AND invalid codes. That is a FALSE SIGNAL** — `not found` / `notFound`
  are framework identifiers present in the JS chunks of every response, not page
  content. The valid and invalid responses do differ (62041 vs 62065 bytes).
  Anyone repeating this check should not read that string as breakage.

**Residual risk** is therefore a rendering or call-shape bug in the app, not a
policy that denies too much — the policies themselves have been executed as real
users. Production also carries little traffic right now, so "no errors since
deploying" is weak evidence, not strong.

---

## 🔴 (HISTORICAL) THE #1 ITEM FOR THE MORNING — now resolved, see above

**Six live cross-tenant read exposures, plus one write hole.** Five of the six
are the same mistake — an over-broad SELECT policy on a table whose rows belong
to somebody. The sixth is a typo that turns a correct rule into `true`, and it
is the worst of them. All live in prod since the 2026-05-27 baseline, all
verified from migration source.

Two more were confirmed and **deliberately left for a decision**, not fixed:
`baseball_coaches` (below — since **closed**, `20260729200000`) and
`golf_coaches` (**still open**: out of scope for this run, live product —
`DATABASE_STATUS.md`). The write hole, `baseball_notifications`, **is** fixed.

| Table | Policy | What leaks |
|---|---|---|
| **`baseball_messages`** | **`cp.conversation_id = cp.conversation_id`** | **Every private coach↔player message in the database — and INSERT into any conversation. Read the row below.** |
| `baseball_players` | `USING (true)` | Every program's roster PII — email, phone, GPA, SAT/ACT |
| `baseball_teams` | `USING (true)` | Every team's secret `join_code` |
| `baseball_team_invitations` | `USING (is_active = true)` | Every live invitation `code`, with its `team_id` |
| `baseball_player_percentiles` | `USING (true)` | Every player's academic + athletic percentile ranking |

**`baseball_messages` is the one to act on first, and it is also the easiest.**
Three baseline policies compare `cp.conversation_id` to *itself* — always true —
so the predicate means "does the caller participate in any conversation at
all". One conversation anywhere buys every private message everywhere, plus the
ability to post into any thread under your own name. It survived because
`baseball_messages_select` is the same rule written *correctly*, twenty lines
below; permissive policies OR together, so the correct one never mattered.

The fix is **three `DROP POLICY` statements, no `CREATE`, no app change** — each
broken policy already has a correctly-correlated twin. It is safe under old and
new code alike, so it does **not** need to wait for the rest of the sequence
below. If only one thing gets applied in the morning, apply this.

**Only two of the six were reported by recon.** Each of the other four came
from re-asking the previous question one level wider — none needed information
that was not already in the repo:

| # | The question that found it |
|---|---|
| 3 | What *else* uses the same `.eq('code', …)` shape as the join_code leak? → `baseball_team_invitations`, whose policy is named "Anyone can view active invitations by code" and checks no code. Seen twice before and left both times: `20260701000000:173` recorded it as deliberately "untouched"; `20260708141000:86` described the exploit path exactly, narrowed the redemption RPCs, and closed with *"This narrows but does not fully close the surface."* Closing the read closes it — ids stop being discoverable, so the parameter change that migration called for is unnecessary. |
| 4 | What *else* in the baseline is `FOR SELECT … USING (true)`? → `baseball_player_percentiles`. Thirty seconds of grep, and it should have been the first thing run. |
| 5 | *"If a fifth exists it is behind a predicate that is neither `true` nor missing"* — written down at the end of the #4 sweep, then actually executed. → `baseball_coaches`. |
| 6 | Read the policies of the uncovered tables *before* writing their tests. → `baseball_messages`. The task was meant to produce coverage; it produced the worst finding of the run. |

**#5 is confirmed and deliberately NOT fixed.** `baseball_coaches_select` is
`USING (auth.uid() = user_id OR get_my_coach_id() IS NOT NULL)` — the second
clause asks only "am I a coach", never scoping to team or org, so **any coach
reads every coach's email and phone**. It is not in the migration pair because
`20260701014000` explicitly reserved it as a product decision, and because 75
call sites read that table directly (52 already use the
`baseball_coaches_public` view) — each needs auditing before the policy moves.
The question to answer: with recruiting sunset, does any surface still need a
coach to see coaches outside their own organization? Details in
`DATABASE_STATUS.md` §5.

The fix was **written and committed as files, applied to nothing**
(`9c4ad335e`, extended by `2c2c939cf`) at the time this was written. **It has
since been applied in full** — see the RESOLVED section at the top. It shipped as
a sequenced pair so no single step could take production down:

| Step | File | Blast radius |
|---|---|---|
| 1 | `20260729000100_..._a_additive.sql` | **None.** Creates seven functions, grants EXECUTE. No policy, no revoke, no ALTER. |
| 2 | *(deploy the companion app changes)* | Works under both old and new policies. |
| 3 | `20260729000200_..._b_policies.sql` | Replaces five policies and drops three broken ones outright. **This is the one that closes the leaks and the one that can break things.** |

The invitation fix was folded into these two files rather than added as a new
pair, deliberately: a separate A′/B′ would have made the apply sequence five
steps with two deploy barriers, and the extra ordering is exactly what gets
mis-executed at 09:00 with a demo waiting.

Doing 3 before 2 is an outage — join-by-code, join-by-invitation,
Discover/Compare and roster "Add existing player" all return **empty results,
not errors**, so the symptom is "the product quietly stopped working."

**✅ The SQL is verified by execution.** CI on PR #1092 applies both migrations
to a fresh Postgres and runs **six** pgTAP suites, **all passing**: 34/34
tenant isolation, 19/19 invitation codes, 12/12 messages, 10/10 team-scoped
tables, 9/9 player percentiles, 9/9 Lift Lab sync identity — 93 assertions.

The tenant-isolation suite failed three times before it passed: two independent
recursion cycles that would have made *every* query against `baseball_players`
fail on apply, plus five functions left anon-callable. None was visible to
reading; two adversarial line-by-line reviews had already missed them. That is
why each new policy now carries an explicit "USING clause contains no inline
subquery" assertion — and why the `baseball_messages` suite asserts that no
policy on that table may compare a column to itself.

**Action on waking:**
0. **Consider applying migration B SECTION 5 on its own, first.** It is three
   `DROP POLICY` statements against `baseball_messages`, needs no companion app
   change, is safe under old and new code, and closes a live write hole into
   private conversations. It is the only part of this sequence with that
   property.
1. `db-migration-reviewer` on both files (CLAUDE.md mandates it; this is the
   shared Golf + Baseball production database). CI proves the SQL is correct
   against a *fresh* database — not against production's actual state.
2. ~~Re-verify live `pg_policies`~~ — **DONE, 10:40 EDT.** The database came
   back at 13:43Z and every one of the six exposures was confirmed live in
   production, matching migration source exactly; no out-of-band hotfix had
   closed any of them. Two corrections came out of the live read: nothing is
   exposed to `anon` (all `authenticated`-only, so the bar is "any registered
   user", not "anyone on the internet"), and `baseball_player_percentiles`'
   alarming-looking `FOR ALL USING (true)` policy is `service_role`-only and
   therefore not a write hole. Measured blast radius: 80 messages, 35 players
   with email/phone/GPA/SAT/ACT, 13 join codes, 10 coach records — and **0**
   rows behind both the invitation and percentile policies. Full detail:
   `DATABASE_STATUS.md` → § Live verification.
3. Apply step 1. Verify step 2 is deployed by **exercising** it — join a team
   by code, search a transfer by full email — not by reading the diff;
   merged-but-undeployed looks identical in git. Apply step 3.

**Why not applied overnight:** shared production DB with live users; a
mis-scoped RLS policy locks legitimate users out rather than failing safe,
converting a confidentiality bug into an outage. The exposure has been live
~2 months — the marginal risk reduction from applying at 01:00 unattended
versus 09:00 with the owner present does not justify that. Deferred
deliberately, not missed. See `DATABASE_STATUS.md`.

**How it actually went, for the record:** every one of these applies happened
**with the owner present and instructing**, never unattended, and each was
verified by executing the new policies as the real affected users (role
impersonation in a rolled-back transaction) rather than by reading the diff. The
"applying blind is the risk" reasoning above was right; the fix was to stop
applying blind, not to keep waiting.

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
| **Fourth exposure closed** — `baseball_player_percentiles` was `USING (true)` on a per-player table holding GPA/academic percentiles | `2855a0646` |
| **Every private conversation was readable AND writable by any user in any one conversation** — a self-comparison typo in three baseline policies | `e1011f50b` |
| pgTAP coverage closed for the last five untested tables (tasks, travel, announcements, dev plans + messaging) | `4e0b96ccb` |
| Notification spoofing closed — `can_notify_baseball_user()`, after verifying the only two insert paths | `bcbba306b` |
| vitest projects selected ~870 files each instead of 5/0/7; "Business contracts" was re-running the whole suite | `0ae11337b` |
| Select's clear button was nested inside its trigger button (invalid HTML, hydration-crash class) + a repo-wide parser guard | `394d3d875` |
| Calendar's no-team empty state sold recruiting to a college coach, with a **"Browse prospects"** CTA into a sunset-blocked route | `70ea55143` |
| **`/dashboard/activate` — the route that TURNS RECRUITING ON — was reachable by direct URL**; missing from `MODULE_ROUTE_PREFIXES` despite the middleware's comment claiming otherwise | `5f63a686a` |
| The player's **first screen after login** sold recruiting under a button that now redirects — 4 surfaces incl. `/player/today` | `20990857d` |
| **The public landing page still led with recruiting** — `<title>`, H1, hero, and a whole feature section, on the page a buyer reads first | `a6ee7f611` |
| "Recruiting Active" KPI removed from the live showcase-org dashboard — a number nobody can move | `7415d3fb3` |
| Public program page stopped addressing its readers as "recruits" (incl. the meta description that IS the search result) | `d68eeaac0` |
| **Zero dead baseball links, proven** — 283 routes × 2,739 files, with a probe test showing the sweep can fail | `c0e90b958` |
| The nav sweep and the route sweep now check **each other** — the seam `/activate` hid in | `3192ac28f` |
| Two rule-engine rules kept telling players to finish a recruiting profile — a pre-sunset opt-in outlives the sunset | `2654446ec` |
| Public roster stopped blaming players ("haven't activated yet") for a door the product closed | `e6c9ac6fb` |
| Roster legend dropped a "Recruiting active" badge no player can earn | `a15ecb9c5` |
| **The demo seed was still writing a recruiting board into production** — 3 fictional orgs, 8 publicly-named players, 8 watchlist rows | `1e6312168` |
| Seven E2E specs still drove sunset routes; 46 tests now skip, 1 repointed, 2 silent-pass assertions gated | `a694f24d7` |
| Settings hid a "Recruiting / exposure" toggle that no longer changes anything | `8cfecf50c` |
| **A guard against the next inbound link** into a disabled module — the class that produced 5 of tonight's fixes | `60d719507` |
| The E2E seed planted the same recruiting player + camp on every push to `main` | `93531a145` |
| **"One flag flip restores recruiting" — measured.** 54 tests in 7 files fail; `restore` now names them all so nobody deletes the sunset's own coverage | `e1a04eb5e` |
| BaseballHelm demo gate's env vars (incl. the kill-switch) documented in `.env.example` | `894cd261c` |
| **Three separate ways a player could still activate recruiting** after the route was closed — the server ACTION (`eb54fdc97`), SIGNUP creating every new player pre-activated (`ca50ea1de`), and the live Passport page's exposure tiles (`58407b143`) | see cells |
| **The login page could hang forever with no form to type into** — no catch, no timeout on the only effect that clears `checkingAuth` | `52ddac6aa` |
| My own CI red: repo-scanning guards were on vitest's default 5s timeout, so a 2.3s scan flaked on a slower runner | `4853631e0` |
| **PRODUCTION INCIDENT — "No Connection" served to users who are online** | `1da354c4f` → merged to main as `0781a984b` (#1094) |

All work is on PR [#1092](https://github.com/njrini99-code/helmv3/pull/1092)
(draft).

---

## Queued (not started)

| Priority | Item | Note |
|---|---|---|
| ~~P1~~ **DONE** | ~~34% of `baseball_*` tables have zero pgTAP RLS coverage~~ | Closed. Invitations (`2c2c939cf`), messaging (`e1011f50b`), and tasks/travel/announcements/dev-plans (`4e0b96ccb`) all have suites now. Writing them found **two P0s** — the invitation-code leak and the `baseball_messages` typo. Two findings across five previously-untested tables is the evidence for the claim that an untested policy is an unverified claim. |
| P1 | **CI seeds PRODUCTION on every PR** | Still true, but **narrower than this row implied** — investigated 2026-07-29 23:45Z; read the notes under the table before rewriting anything. |
| ~~P1~~ **DONE** | ~~`baseball_notifications_insert` is `WITH CHECK (true)`~~ | In-app phishing, not a leak (reads are correctly self-scoped). **The obvious fix breaks the product:** practice-publish and coach lift messages legitimately write notifications to *other* users through the caller's own session (`practice.ts:516`, `lifting-v11.ts:2411`, both `createClient()` not admin), so `auth.uid() = user_id` would silently stop them. Needs a `can_notify_baseball_user()` definer helper. **Fixed in `bcbba306b`** — a definer `can_notify_baseball_user()` gating on "self, or a player on a team you are staff on", after verifying two ways that those two call sites are the only inserters. 10 pgTAP assertions, weighted toward the PERMITTED cases so a future self-only tightening cannot pass. |
| ~~P1 **BLOCKED**~~ **DONE** | ~~`public_profile_mode` DDL default is `'private'`~~ | **Answered 10:40 EDT once the database came back.** Live column default is `'unlisted'::text` and **all 13 teams are `unlisted`, zero `private`** — so `baseball_teams_public_profile` is NOT default-deny and cross-org discovery is not zeroed. Feared impact was nil. Separately worth knowing: production's column default **drifted** from the committed DDL, a second independent case of production not matching the migration that created it. Zero impact today, recorded not actioned. |
| ~~P2~~ **DONE** | ~~The `integration` vitest project (5 files) runs in no CI workflow~~ | **The item was right about the gap and wrong about the cause, and the real cause was worse.** `vitest.config.ts` set a root-level `include`, and `extends: true` MERGES array options rather than replacing them — so every project inherited the broad root glob. `integration`, `rls` and `business` set `include` but not `exclude`, so each matched **~870 files instead of 5, 0 and 7**. `unit` looked fine only because it also overrides `exclude`. Consequences: CI's "Business contracts" job was re-running the entire unit suite under a name claiming to check 7 contract files (~170s → 3s once fixed), and the integration tests *were* running — by accident, inside that job. Root `include` removed, integration given its own CI step so nothing is lost. Verified by counting: unit 861 (unchanged), integration 5, business 7, rls 0. |
| P2 | Elite stat event model — **13** tables (11 exist), ~10 migrations, **zero rows** | **Re-verified 23:50Z: "dead schema, graveyard it" is the WRONG framing.** ~20 live readers depend on these tables; the missing piece is **ingest** (zero write paths for pitch/batted-ball/catching/fielding/baserunning/workload). Decision is "build the ingest, or remove the read surfaces too" — deleting the tables alone breaks production. Detail: `ISSUE_LEDGER.md` → P1.14. |

**Notes on the P1 above — what "CI seeds production" actually does (verified 2026-07-29 23:45Z):**
`seed:baseball:ci` = `tsx scripts/seed-baseball-demo.ts --confirm --allow-prod`, run
from `ci.yml:466` and `playwright.yml:163` in the `baseball-auth-smoke` job, whose
`env:` passes the production `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
So yes, it writes to production on every PR — but three of the scarier readings are
wrong:

- **The `login_attempts` DELETE is scoped, not a table wipe:**
  `.in('email', [DEMO_COACH_EMAIL, DEMO_PLAYER_EMAIL])` (`seed-baseball-demo.ts:550`),
  with a comment citing the 2026-07-02 forensics where both demo accounts sat at
  10/10 and bricked every later run. Real users' lockout protection is untouched.
- **Fork and Dependabot PRs get no secrets.** Both workflows use `pull_request`, not
  `pull_request_target`, and `ci.yml`'s env block has a documented dummy fallback for
  exactly that case. No service-role key reaches an untrusted PR.
- **The writes are idempotent upserts** into a known demo tenant the script itself
  describes as "safe to ignore in production lists".

**Why it was not simply repointed at a local stack:** `BaseballHelm authenticated
smoke` is a **required** merge gate, and rewiring it means standing up Postgres +
auth + migrations + seeded users in CI. Landing that wrong blocks every PR in the
repo — which already happened once on 2026-07-29 when an unretried CI seed froze all
merges (#1097/#1098). Right eventual change, wrong unattended-at-midnight change.
Needs an owner decision on sequencing.

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
- **A sweep is only as complete as the inventory it iterates.**
  `recruiting-sunset-doors.test.ts` walks `MODULE_ROUTE_PREFIXES` across every
  role × program type and passed all night — while `/activate` sat outside that
  list, unguarded. The inventory now has its own assertion, and the nav sweep
  and route sweep cross-check each other rather than each being separately
  complete on its own axis.
- **Closing a route is half the job; the other half is what pointed at it.**
  Gating `/activate` did not remove the four player surfaces selling it, the
  calendar button linking to `/discover`, or the landing page's pipeline
  section. Every module gate should be followed by a sweep for inbound links
  and inbound *copy* — the copy is the part no route test can see.
- **The sunset is a positioning decision, so the positioning surfaces are in
  scope.** `/baseball` — the page a buyer reads before anything else — still
  led with "Recruiting & Team Management" and sold the pipeline. The registry's
  own stated reason for the sunset is that recruiting "diluted the pitch", and
  this page *is* the pitch. Replaced (not merely stripped) with practice +
  readiness + attendance, all of which ship. **Worth a founder's eye in the
  morning** — it is one flag flip to revert, and the copy lives in one file.

---

## Corrections to earlier claims in this run

Recorded so a wrong claim never gets promoted by repetition.

- **Two of three "open recruiting doors" were not open.** I reported `camps`,
  `scout-packets` and `activate` as reachable, and added gates to all three.
  Only `/activate` was real: `/baseball/dashboard/camps` and
  `/baseball/dashboard/scout-packets` were already in `MODULE_ROUTE_PREFIXES`
  and already enforced at `src/lib/supabase/middleware.ts:408`. Both edits were
  reverted rather than shipped with comments describing gaps that did not exist.
- **The E2E wall of red would have landed on `main`, not on a PR.** I wrote in
  `a694f24d7` that "the first PR touching an E2E-relevant path inherits" it.
  `playwright.yml` runs `Playwright (chromium)` on **push to `main`** or manual
  dispatch only; PRs get the advisory a11y smoke from `pr-smoke.yml`. So the
  breakage had no PR signal at all and would have appeared post-merge — and CI
  cannot verify the fix before merge either, which is why it was verified
  locally against a dead base URL instead.
- **A regex nested-`<button>` detector reported 27 hits; all 27 were false.**
  `<button\b[^>]*/>` cannot match a self-closing button whose attributes contain
  `>` (`onClick={() => x}`), so it never closes and every later button looks
  nested. Rewritten on the TypeScript parser: 0 false positives and **2 real
  hits the regex never saw**.
- **A green test suite proved half of what it claimed.** The first draft of
  `recruiting-activate-door.test.ts` mocked `isRecruitingEnabled` to assert both
  flag directions. `isPathnameModuleDisabled` calls it *internally*, so the mock
  of the module's exports never applied — five of six assertions passed on the
  real flag. Rewritten to assert restoration through attribution, which is
  observable without a working mock.
