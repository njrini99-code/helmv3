# BaseballHelm Overnight Completion — Execution Plan

## 1. THE PRODUCT TRUTH

BaseballHelm is **not half-finished** — the founder's assumption is **pessimistic**, and dangerously so because it points effort at the wrong problem. This is a mature, heavily-hardened product: 107 routes with zero dead nav links, zero TODO/stub markers repo-wide, a registry-driven nav architecture more disciplined than most Series B products, a data layer where every action file checks auth and every catch block returns honest `{success:false}` instead of fake success, and a real demo team with 8 players / 20 games / 120+40 box-score lines verified live in production. The actual state is: **a real, working team-management + stats product** (Roster, Calendar, Messaging, Tasks, Documents, Stats Center, Command Center) sitting behind **two classes of genuine, specific, fixable defects** — (a) three live cross-tenant security holes in RLS/RPCs that would fail any buyer's security review, and (b) an in-flight, half-wired recruiting sunset that leaves the exact surface the founder wants hidden fully live and clickable. Neither of these is "half-finished feature work" — they are a short, precise list of wiring and policy fixes on top of a product that otherwise works. The design-system fragmentation (3 generations of UI, 162/564 files with raw `warm-*`/`cream-*`) and the empty advanced-analytics tables (elite stat-event model, signals/actions pipeline) are real but **cosmetic/opt-in**, not launch-blocking — they don't crash, they don't lie, they render honest empty states. The one legitimately alarming discovery, found mid-session: **someone already started the recruiting sunset tonight** (`src/lib/baseball/product-modules.ts`, commit `ee8264989`, 23:53 same day) — a well-built, fully-tested kill switch that is wired into **zero consumers**. That is simultaneously the best news (the hard design work is done) and the most urgent risk (a founder who greps for it and finds it will falsely believe recruiting is already off).

## 2. THE CRITICAL PATH TO SELLABLE

**Must work, survives scrutiny, in order of what a buyer/security-conscious IT contact will actually poke at:**

1. **The two `USING(true)` RLS policies are closed** (`baseball_players`, `baseball_teams`). This is not optional — it's the single fastest way to lose the deal if their IT person runs one `select * from baseball_players` from a test account and pulls every other program's minors' PII and phone numbers. Non-negotiable, ship tonight.
2. **The staff-invite RPC is patched to check email ownership.** Any competent security reviewer testing "can I self-escalate into a coaching seat" during diligence will find this in under 10 minutes. Fix the deployed function to match the two migrations that were already written and reviewed for it — the correct code exists, it just isn't what's live.
3. **Recruiting is actually invisible**, not "sunset in theory." Wire the already-built `product-modules.ts` into the 4-5 real choke points (nav-registry, hub resolution/BaseballFairwayShell, server-route-guards, the recruiting server actions, and the `(public)` share-link routes). A buyer must not see Pipeline/Discover/Watchlist/Scouting in the nav, must not be able to load them by URL, and a previously-generated scout-packet link must not still render.
4. **The demo team the founder will actually drive is fully populated**, not the one the automated coverage check happens to validate. Per finding #21/#22, there are *two* demo teams — confirm which one gets driven in the demo tomorrow, and make sure Announcements/Travel/Documents/Post-Game Review aren't blank on it.

**What should be HIDDEN, not fixed, tonight:**
- The entire elite stat-event / signals-actions-decision-log / AI-audit pipeline (0 rows in prod, ~10 migrations of investment) — do not attempt to populate or wire this live tonight. It already degrades to honest empty states; leave it. If a coach clicks into it, an EmptyState is a perfectly fine answer to "what's this."
- Level-4 "Direct API" integration rows — already inertly disclosed, brief the founder verbally, no code change.
- `/lifting` native-app reachability — confirmed NOT reachable via any real invite path tonight (AASA scoping means the invite flow never hits the broken redirect). Leave it. Do not touch `proxy.ts`.
- Design-system fragmentation (3 generations of UI). A visually inconsistent-but-functional Settings page will not fail a demo. Do not spend overnight hours on this — it's a multi-day redesign effort explicitly deferred in the team's own docs.
- Fixing the broken native Lift Lab "Sync Athletes" buttons — real bug, but `/lifting` isn't the surface being sold; the baseball-embedded lift surfaces (`/baseball/dashboard/performance`, `/lift`, `/readiness`) that ARE being sold don't depend on this button.
- Playwright red suite (47 failures) — advisory-only, doesn't block anything, and chasing 47 E2E failures overnight against a live product freeze is how you introduce new regressions hours before a demo. Triage only if a failure maps to something on the critical path above (camps.spec.ts does map to a live route — worth a 10-minute look, not a rewrite).
- Elite stat-event tables, staff-invitation empty tables, decision-room — REJECTED already per the adversarial pass, don't re-litigate.

## 3. TEAM DESIGN

Strict non-overlapping file ownership. No two teams touch the same file. Where a file must be touched by multiple concerns, one team owns the whole file and takes instructions from others via a short spec, not a shared edit.

---

### Team A — RLS & RPC Security Lockdown
**Scope**: Close the three verified P0 security holes in the DB layer only.
**Owns exclusively**:
- New migration file(s) under `supabase/migrations/` (new files only — never edit an already-applied migration; e.g. `20260729000100_baseball_players_teams_rls_lockdown.sql`, `20260729000101_baseball_accept_staff_invite_fix.sql`)
- Applied via `mcp__supabase__apply_migration` directly to prod (this is a migration-file-only team; it does not touch `src/`)
**Does NOT touch**: any `src/` file, any app code.
**Work**:
- Scope `baseball_players_select` to `can_view_baseball_player()` (already exists, wired elsewhere — reuse it) or minimally to `team membership OR self`.
- Scope `baseball_teams_select` to caller's own team(s), or move `join_code` behind a SECURITY DEFINER lookup RPC and drop it from the general SELECT-able columns.
- Redeploy `baseball_accept_staff_invite` to match the two already-written migrations (`20260624000062`, `20260624000081`) that include the `lower(v_invite.email) <> v_email` check — the correct SQL body already exists in the repo, this is a re-apply/reconcile, not new design.
**Dependencies**: none upstream. Everything else can proceed in parallel against current schema since these are additive RLS narrowings, not breaking changes to columns/shapes.
**Acceptance criteria**:
- Live query: `SELECT qual FROM pg_policies WHERE tablename='baseball_players' AND policyname='baseball_players_select'` no longer returns `true`.
- Same for `baseball_teams_select`.
- Live `pg_get_functiondef` for `baseball_accept_staff_invite` contains an email-comparison branch and returns `reason` (matching app-layer expectations in `staff.ts`), not `error`.
- Manually verify: a second test account cannot `select * from baseball_players` and see another team's roster; cannot self-accept a staff invite addressed to a different email.
**Required tests**: new pgTAP RLS tests in `supabase/tests/rls/` for both tables (currently zero coverage — this closes part of finding on 33 untested baseball_* tables, scoped to just these two). Do not attempt the full 33-table gap tonight.

---

### Team B — Recruiting Sunset Wiring
**Scope**: Finish wiring the already-built `src/lib/baseball/product-modules.ts` kill switch into every real enforcement point. This is the highest-leverage team — do not let it duplicate Team A's migration work or touch RLS.
**Owns exclusively**:
- `src/lib/baseball/nav-registry.ts` (verify/complete the in-flight `isHubDisabled()` wiring into `isBaseballNavEntryVisible`)
- `src/lib/baseball/server-route-guards.ts` (`requireRecruitingCoachRoute`, `requireRecruitingPlayerRoute` — add `isPathnameModuleDisabled`/`isRecruitingEnabled` check)
- `src/lib/supabase/middleware.ts` — add the module check alongside the existing `RECRUITING_PROGRAM_TYPES` gate at the recruiting-route branch (does not touch unrelated middleware logic)
- `src/app/baseball/(dashboard)/_components/resolve-active-hub.ts` and `hub-definitions.ts` (COACH_HUB_ORDER, playerHubs()/coachHubs() showRecruiting)
- `src/app/baseball/(dashboard)/BaseballFairwayShell.tsx` (`buildPlayerNavSections`, `buildCoachHubSections` — gate the hardcoded player recruiting row)
- `src/lib/baseball/product-modules.ts` itself (extend `MODULE_ROUTE_PREFIXES.recruiting` to include `activate`, and to cover the `(public)` share-link group if a decision is made to gate those too — see §5)
- The 11 recruiting `page.tsx` files' guard calls only (add `isRecruitingEnabled()` / `isPathnameModuleDisabled()` check at top — a one-line addition per file, not a rewrite): `pipeline`, `discover`, `watchlist`, `compare`, `comparisons`, `scout-packets`, `scouting`, `camps` (decide scope per §5), `colleges`, `journey`, `analytics`, `player-activate`, `college-interest`
- Recruiting server actions — add `isRecruitingEnabled()` guard at top of each exported mutation: `watchlist.ts`, `interests.ts`, `discover.ts`, `player-peek.ts`, `scout-packet.ts` (mixed files like `player-access.ts`, `teams.ts` — touch ONLY the recruiting-specific exports, coordinate via comment, don't reformat the file)
- `src/lib/baseball/__tests__/bottom-nav.test.ts` and `product-modules.test.ts` (update the pinned assertions for JUCO coach / HS+JUCO player slot-3 now resolving to something other than recruiting — needs a replacement nav item decision, see Risks)
- `src/app/baseball/(dashboard)/dashboard/settings/page.tsx` / `ProgramSettingsClient.tsx` — gate the "Scout & Showcase Access" SectionCard and the standalone `/settings/recruiting-preferences` route
- `src/lib/baseball/operational-rule-engine.ts` — suppress the two recruiting-category Signals rules (`profile_incomplete`, `missing_video`) when module disabled
**Does NOT touch**: `product-modules.ts`'s core `PRODUCT_MODULES` object semantics beyond adding route prefixes; any RLS/migration file (that's Team A); any Team C/D file.
**Dependencies**: none blocking — can start immediately, it's purely `src/` wiring against existing schema.
**Acceptance criteria**:
- Logged in as a college-program coach: no recruiting nav item anywhere (sidebar, mobile bottom-nav, command palette, breadcrumb).
- Direct URL to any of the 11 recruiting routes redirects/404s, does not render.
- Calling any recruiting server action directly (simulated) returns a fail-closed error, not a silent success.
- Signals inbox shows zero recruiting-category cards.
- `npx vitest run --project unit -- product-modules bottom-nav nav-manifest` all green.
**Required tests**: extend `product-modules.test.ts` with integration-style assertions that the actual guard functions call it (not just the pure function in isolation); update `bottom-nav.test.ts` pinned expectations; add one Playwright smoke assertion (if time allows) that a college coach hitting `/baseball/dashboard/pipeline` gets redirected.

---

### Team C — Demo Data Completeness
**Scope**: Make whichever demo team gets driven tomorrow fully populated on the surfaces a buyer will click.
**Owns exclusively**:
- `scripts/seed-baseball-surfaces-demo.ts` (extend, or add a new `scripts/seed-baseball-demo-phase5.ts`)
- `scripts/verify-baseball-demo-coverage.ts` (extend `PHASE1_SURFACE_COVERAGE` / `INTENTIONALLY_EMPTY` to include the currently-unchecked tables)
- `docs/seed/BASEBALLHELM_DEMO_DATA_CONTRACT.md` (update to reflect reality)
**Does NOT touch**: `scripts/seed-baseball-demo.ts`, `seed-baseball-lifting-demo.ts`, `seed-baseball-demo-program.ts`, `seed-rini-baseball-demo.ts` core bodies (read-only reference for patterns; if the dead graveyarded-table writes need removing, that's a single small, isolated diff this team can make in `seed-baseball-demo.ts`/`seed-baseball-demo-program.ts` ONLY on those specific 3-table blocks — coordinate timing with whoever runs seeds last, since it's a `--confirm` production write).
**Dependencies**: **First decide which login is actually demoed** (`demo-coach@baseballhelmdemo.com` vs. `njrini99`'s Rini University account) — this is a 5-minute founder/PM decision that gates all of this team's work. Do not seed both blindly.
**Acceptance criteria**:
- `baseball_postgame_reviews`, `helm_lifting_maxes`, `helm_lifting_bodyweight_entries` have rows for the demo team on whichever login is chosen.
- If demo-coach@baseballhelmdemo.com is chosen: also seed `baseball_announcements`, `baseball_travel_itineraries`+`expenses`, `baseball_documents` (patterns already exist in `seed-rini-baseball-demo.ts` — port them).
- `npm run seed:baseball:demo` (or the Rini equivalent) still exits idempotently, `--confirm` gated, zero `.delete()` added.
- `verify-baseball-demo-coverage.ts` PASS is now actually true for what a buyer will click, not just the original 19 tables.
**Required tests**: run the existing `scripts/__tests__/baseball-demo-seed-surfaces.test.mjs` pattern, extended to assert the new upserts exist in the target script.

---

### Team D — RLS Test Coverage Backfill (scoped, not the full 35%)
**Scope**: Do NOT attempt full 33-table + 15-table RLS coverage backfill overnight — too large, too risky against a live schema on a deadline. Instead, this team writes pgTAP tests ONLY for the tables actually touched by Team A's lockdown, plus a smoke-level cross-tenant check on `baseball_messages`/`baseball_tasks` (the two most sensitive untested tables) if time remains.
**Owns exclusively**: new files under `supabase/tests/rls/` only (net-new files, never edits existing ones — avoids collision with any other team).
**Dependencies**: waits on Team A's policy SQL landing (needs the final `USING` clause to test against) — this is the one hard serial dependency between teams.
**Acceptance criteria**: `supabase test db` (pgTAP) green for new files; CI's `supabase` job in `ci.yml` still passes.
**Required tests**: itself.

---

### Team E (optional, only if time remains after A–D) — Playwright Triage
**Scope**: Investigate ONLY the failing specs that map to critical-path surfaces: `camps.spec.ts`, `baseball-box-score.spec.ts` (create-game→box-score redirect), `baseball-stats-smoke.spec.ts`. Do not touch `baseball-pipeline.spec.ts` or `baseball-route-crawler.spec.ts` (recruiting-adjacent, about to be intentionally hidden by Team B — those failures may become moot/expected).
**Owns exclusively**: the 3 named spec files, and only the minimal app-code fix each points to (coordinate file ownership live with whichever team owns that file if it overlaps — e.g. if `baseball-box-score.spec.ts` points to a bug in `roster.ts`, hand off, don't edit Team B/C files directly).
**Dependencies**: soft — best run last, after A–D are stable, since a fix here touching a Team B/D file needs a handoff not a direct edit.
**Acceptance criteria**: named specs pass locally; no new regressions in the unit suite.

---

## 4. SEQUENCING

**Must land before any parallel work starts (nothing, actually — this is the good news):**
There is no schema/identity/flag-architecture prerequisite blocking parallel start. The recruiting kill-switch (`product-modules.ts`) already exists and is stable — Team B doesn't need to design anything, only wire. The RLS fixes (Team A) are additive policy narrowings against existing tables/columns — no breaking schema change. These two teams can start **simultaneously, at minute zero**, since they touch fully disjoint files (Team A = migrations only, Team B = `src/` only).

**Serial dependencies:**
1. Team D (RLS tests) is the only genuinely serial dependency — it must wait for Team A's final policy SQL to know what to assert against. Start Team D's test *scaffolding* immediately, finalize assertions after Team A lands.
2. Team C needs one **human decision** before starting (which demo login is canonical) — get this from the founder/PM in the first 15 minutes, don't let an agent guess.
3. Team E should run last, after A–D stabilize, since its fixes may need to hand off into files those teams own.

**Fully parallel from minute one**: Team A, Team B, Team C (once the demo-login decision is made).

**Serial checkpoint before declaring done**: after A and B land, run one end-to-end manual pass logged in as a college coach: confirm (a) no recruiting anywhere, (b) cannot cross-read another team's players/join_code, (c) staff invite email-check works. This is a 15-minute human/agent smoke test, not a team — do it as the final gate.

## 5. THE RECRUITING SUNSET PLAN

**Central mechanism**: `src/lib/baseball/product-modules.ts`'s existing `PRODUCT_MODULES.recruiting.enabled = false`, consumed via `isRecruitingEnabled()` / `isHubDisabled(hub)` / `isPathnameModuleDisabled(pathname)` / `moduleForPathname()`. This is already correctly designed as "the outermost gate, checked before role/capability/program-type" — do not build a second mechanism, do not re-derive `RECRUITING_PROGRAM_TYPES` as the gate (that set answers "is this program recruiting-*capable*", which is true for the buyer persona and is the wrong question).

**The specific choke points that must ALL be wired** (miss any one and recruiting remains reachable through that seam):
1. `nav-registry.ts` → `isBaseballNavEntryVisible` (sidebar/mobile-nav/CommandPalette/breadcrumb — single source, in progress per uncommitted diff)
2. `resolve-active-hub.ts` → both `coachHubs()` AND `playerHubs()` (currently only coach side references `showRecruiting`; player side is unconditional — this is the specific gap in finding #5)
3. `BaseballFairwayShell.tsx` → `buildPlayerNavSections` (hardcodes the player recruiting row outside the registry entirely — must be patched directly, filtering the registry alone will NOT catch this)
4. `server-route-guards.ts` → `requireRecruitingCoachRoute`/`requireRecruitingPlayerRoute` (blocks direct-URL access for the 8 routes that call it)
5. The 3 routes that bypass those guards entirely today: `scout-packets/page.tsx` (only checks `can_export_reports`), `camps/page.tsx` (only checks session), `activate/page.tsx` (inline `player_type==='college'` check, not the shared guard) — each needs its own explicit `isPathnameModuleDisabled` call, and `activate` needs adding to `MODULE_ROUTE_PREFIXES.recruiting` first since it's currently absent from that list
6. `middleware.ts`'s `RECRUITING_ROUTES` branch — add the module check here too, as defense-in-depth below the page-level guards (this is what stops a raw `fetch`/curl, not just Next navigation)
7. Recruiting server actions directly (`watchlist.ts`, `interests.ts`, `discover.ts`, `player-peek.ts`, `scout-packet.ts`) — a coach could otherwise call the server action via a stale client bundle or dev tools even with the page hidden; this is the only layer that closes that
8. `operational-rule-engine.ts`'s two recruiting Signals rules — otherwise the Signals inbox (a surface every coach sees daily, NOT itself hub-tagged recruiting) leaks recruiting-flavored cards even after everything else is hidden
9. `ProgramSettingsClient.tsx`'s embedded "Scout & Showcase Access" section + the standalone `/settings/recruiting-preferences` page — settings content, not a route-level thing, needs its own conditional render

**Explicit product decision needed tonight** (don't let an agent silently choose): the `(public)` share-link routes (`baseball/(public)/{player,team,program}/[id]`, `packet/[token]`) sit **completely outside** every mechanism above — they're unauthenticated, no session, no nav. If "sunset" is meant to include "an old scout-packet link someone already has should stop working," that needs its own explicit gate inside those 5 route files (e.g., check `isRecruitingEnabled()` and render a generic "not available" page) — a straightforward addition to Team B's scope, but it must be a **conscious yes/no**, not skipped by accident.

**Specific breakage risks to guard**:
- **Bottom-nav slot 3 for JUCO coach / HS+JUCO player goes empty** unless a replacement nav item is chosen before flipping the flag — `program-type-variants.ts` already has non-recruiting differentiator patterns (`development`, `stats-performance`, `player-stats-hub`) to copy. Decide the replacement (likely "Stats" or "Development") before wiring, not after — an empty slot 3 is a visible defect a buyer would notice on mobile.
- **`Camps` is genuinely dual-purpose** (coach管理 + player browse/register, shared, "no role check"). Blanket-hiding it under the recruiting module may remove a legitimate non-recruiting team feature (showcase event registration). Get an explicit call: hide Camps entirely, or carve it out of `MODULE_ROUTE_PREFIXES.recruiting`.
- **`activate` isn't in `MODULE_ROUTE_PREFIXES.recruiting` today** — if Team B only wires existing prefixes and forgets to add it, the player "Activate recruiting" page survives the sunset untouched.
- **Test suite pins will break on purpose** (`bottom-nav.test.ts` exact-equality assertions) — update them as part of this work, don't let a red test block the merge or get silently skipped.

## 6. RISKS

1. **Two teams silently touch the same file and corrupt each other's diff.** Guard: the ownership lists above are exhaustive and disjoint by design — enforce via a pre-flight `git diff --stat` check before each team commits; any file appearing in two teams' diffs is a hard stop, resolve via handoff not merge.
2. **Team A's RLS narrowing breaks a legitimate query pattern that currently relies on the broad `USING(true)`** (e.g., some cross-team read that's actually intentional, like a coach viewing a recruit from another program via Discover). Guard: before applying, grep every `.from('baseball_players')`/`.from('baseball_teams')` call site (roster.ts, discover.ts, teams.ts, calendar.ts, messages.ts, etc. — 20+ files per the recon) and confirm the new policy's `USING` clause covers the recruiting-Discover legitimate-cross-team-read case (which `can_view_baseball_player()` was apparently built for — reuse it, don't hand-roll a narrower one that breaks Discover before Discover itself is hidden).
3. **Recruiting-sunset wiring ships fail-open instead of fail-closed** — e.g., a guard added as `if (isRecruitingEnabled()) { ...allow }` with a bug where the function throws/returns undefined and falls through to allow. Guard: every new check must be written as an explicit early-return deny (`if (!isRecruitingEnabled()) return notFound()/redirect()`), and Team B must manually test each of the 11+ routes logged in as a college coach before calling it done — not just unit-test the pure function.
4. **The `--confirm` seed script run (Team C) is a live production write with zero project-ref safety net**, and if run against the wrong understanding of "which demo team," could pollute or partially-seed the wrong tenant. Guard: confirm the demo-login decision in writing before any `--confirm` run tonight; dry-run (`--confirm` omitted) first and read the diff output before the real write.
5. **Chasing the Playwright red suite or the design-system fragmentation eats the night and nothing in §2's critical path lands.** Guard: hard time-box — Team E only starts after A/B/C report done, and only touches the 3 named specs; if any team runs over its window, cut scope (drop Team D's extra tables, drop Team E entirely) rather than let it bleed into the RLS/recruiting work.

## 7. WHAT NOT TO DO

- Do **not** attempt full RLS test coverage for all 33 untested `baseball_*` tables or all 15 untested `helm_lifting_*` tables tonight — real gap, multi-day effort, not tonight's problem (messaging/tasks/travel policies exist and are presumably fine, just unasserted; asserting them is valuable but not release-blocking by itself).
- Do **not** touch `src/proxy.ts` / `APP_ROUTE_PREFIXES` for `/lifting` — verified non-issue for tonight's actual invite flow (AASA scoping means it never triggers), and it's a decision (should Lift Lab live in the iOS app at all?) not a bug fix.
- Do **not** fix the native Lift Lab "Sync Athletes" buttons (`athletes.ts`, `assignments.ts`) — real bugs, wrong product surface for tonight's buyer (they're buying BaseballHelm's embedded lift surfaces, not the standalone `/lifting` portal).
- Do **not** attempt the Settings-page / PlayerProfileClient design-system unification, DataTable primitive consolidation, or ModalShell migration — all real, all explicitly deferred by the team's own docs, none of them will fail a demo, and touching 16 hand-rolled tables or 16 hand-rolled modals overnight is exactly the kind of change most likely to introduce a last-minute regression.
- Do **not** try to populate the elite stat-event / signals-actions-decision-log tables with synthetic rows to make them "look alive" — this is explicitly the wrong move; it would violate the "never fake data" discipline that's currently one of the product's strengths, and the honest-empty-state handling already built for these tables is the correct answer to a buyer's question.
- Do **not** "fix" `seed-rini-baseball-demo.ts`'s delete-scoped behavior or reconcile it with the other scripts' "never delete" doc claim tonight — flag it for follow-up, don't refactor seed infrastructure under deadline pressure.
- Do **not** let any team consolidate the 3 duplicated `RECRUITING_PROGRAM_TYPES` Set literals (`middleware.ts`, `server-route-guards.ts`, `resolve-active-hub.ts`) into a shared module tonight — real architectural debt, but refactoring a shared constant across 3 files while those exact 3 files are being actively edited by Team B for the sunset wiring is how you get merge conflicts and subtle behavior changes hours before a demo. File it as a fast-follow.
- Do **not** run `npm run test:e2e` (full Playwright) as a gate for calling tonight's work "done" — it's advisory, chronically red for unrelated reasons, and waiting on it wastes time. Gate on `npm run typecheck`, `npm run test:run` (unit), and the manual smoke pass described in §4 instead.