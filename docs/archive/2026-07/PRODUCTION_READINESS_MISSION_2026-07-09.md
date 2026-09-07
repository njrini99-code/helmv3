# Production-Readiness Mission — 2026-07-09

> Living mission doc. Owner directive: full autonomous page-by-page UI/UX +
> architecture review; coach and player at ~8 nav tabs each; routing/shell/UI
> all on the newest systems; whole database production-ready; iterate until
> done. Orchestration: Fable plans, Sonnet executes. Ground truth from the
> 20-agent discovery sweep (2026-07-09, ~2.9M tokens) + live prod DB audit.

## Ground truth (discovery synthesis)

**Nav counts today** (primary+secondary rail destinations, Settings footer excluded):
| Surface | Today | Target |
|---|---|---|
| Baseball coach | **≤8 hubs** ✅ (8 standard: Dashboard, Messages, Team, Stats & Performance, Development, Recruiting, Academics, Management; 7 for High School — Recruiting hidden by design, `RECRUITING_PROGRAM_TYPES`; showcase variant has its own two-level org→team rail) | keep |
| Baseball player | **9** (7 primary + exposureNoun + Settings-in-rail) | **8** — move Settings to pinned footer (parity with coach shell) |
| Golf coach (Fairway, live) | **15** (7 primary + 8 secondary) | **8 hubs** |
| Golf player (Fairway, live) | **12** (8 primary + 4 secondary) | **8** |

**Shells**: Baseball = ONE unconditional `BaseballFairwayShell` ✅ (Coherence
Ruling 1). Golf = DUAL shells still live; `NEXT_PUBLIC_REDESIGN` hardcoded
true in prod + CI for 5+ weeks; ~65 golf pages ship both a legacy tree
(dead-in-prod) and a Fairway tree. Largest flag/legacy debt in the codebase.

**Design systems in the wild**: baseball has 4 coexisting languages
(Living Annual ~28 routes; legacy cream ~50 routes incl. `player/today` —
the highest-traffic player screen; Lift Lab component library; bespoke
Entry-World login/onboarding [login is owner-approved, keep]). Golf Fairway
adoption is essentially complete on live paths, but edge/error branches and
`FeatureUnavailable` render un-gated legacy chrome; stats never got the
green ruled-leader treatment the owner asked for.

**DB posture (live advisors 2026-07-09)**: RLS on every table ✅; 0 anon
SECURITY DEFINER ✅; types file zero drift ✅. Open: 4 ERROR
security_definer_view (the *_public views); 109 SECDEF functions EXECUTE-able
by authenticated (18 admin-sounding need body gate-checks — gap-fill running);
golf_course_tee_holes/tees always-true RLS (owner's open-edit call — REPORT
ONLY); avatars bucket public listing; 691 perf findings (multiple permissive
policies on hot golf tables, 199 unindexed FKs, 256 unused indexes).
**Migration-vs-live drift**: 8 tables named in migrations but ABSENT live
(5 baseball import-lineage + 3 coachhelm support).

**Adversarially verified findings (gap-fill fleet, 2026-07-09)**:
- **CONFIRMED P0**: `discover.ts` `getDiscoverPlayers`/`getStateCounts` never
  check `baseball_player_settings.profile_visibility` (unlike
  `recruitability.ts`) — private players surface in Discover search/map.
- CONFIRMED P1: Activate-Recruiting bypass — `updatePlayer` in
  `use-auth.ts:165-175` does a raw browser UPDATE; RLS (`user_id=auth.uid()`,
  no column guard) lets any player set `recruiting_activated` directly,
  bypassing the `recruiting_exposure_enabled` toggle. Fix = remove client
  write path + BEFORE UPDATE trigger guard (baseball DB, check-first).
- CONFIRMED P1: sign-out never calls `invalidateAuthCache()` on
  use-baseball-auth's 5s module cache (only sign-in does) — back-nav within
  ~5s of logout re-authorizes from stale verified state.
- CONFIRMED P1: `is_anonymous` column doesn't exist on
  `baseball_player_engagement_events`; 4 unchecked inserts (watchlist.ts ×3,
  player-peek.ts ×1) silently 42703-fail forever — engagement events never
  recorded. Fix = drop the field from those 4 call sites.
- CONFIRMED P1 (DB views): `baseball_team_coach_staff_public` ignores
  `visible_to_players` + `status`; `baseball_teams_public_profile` ignores
  `public_profile_mode` — anon sees data owners opted out of sharing.
  Recreate views with filters (REVOKE anon re-grant after recreate; verify
  relacl).
- CONFIRMED P1 (DB fn): `get_admin_event_summary(int)` has zero self-gating
  and EXECUTE granted to PUBLIC/anon — gate + revoke.
- CONFIRMED P1 (email): weekly-coach-email cron has NO opt-out gate;
  task-reminders cron ignores `email_task_reminders` preference.
- CONFIRMED P1 (rounds): FairwayShotTracking discards the player's METERS
  unit preference (corrupts distances/proximity/GIR — unit-audit bug class
  returns); new-round-client re-edit path missing `allHolesScored` refresh
  (stale scorecard submit) that continue-round already has.
- CONFIRMED P1 (API): /api/account/delete fails on RESTRICT FKs for most
  active coach/admin accounts.
- REFUTED: password-change reauth (changePasswordActionImpl re-authenticates
  via signInWithPassword, rate-limited, tested — already correct).
- REFUTED: "8 phantom tables" — migration-filename shorthand for ADD COLUMN
  sets; nothing missing live, nothing broken.
- ~12 baseball dashboard routes still client-only auth (college-interest,
  camps, colleges, journey, dev-plans, program, tasks, messages,
  announcements, travel, videos; comparisons returns raw string) — server
  guards needed. Middleware fails open (no Sentry), golf-side capability
  layer thinner than baseball's.
- PWA/native P1s: web-push server pipeline has ZERO client callers (dead);
  universal links have no in-app handler (join-code/reset deep links
  dropped); native shell force-bounces non-/golf/ URLs (baseball deep links
  architecturally blocked); baseball dashboard inherits the GOLF manifest.
- A11y P1s: box-score grid ~40 unnamed inputs + headers without scope;
  3 of 4 command palettes lack focus trap/restore; coach InviteModal has no
  dialog semantics at all; BaseballInviteButton lacks trap/restore.
- Docs: golfhelm-features.md claims "Availability Polling" done — feature
  does not exist in code. Readiness matrix + gap map confirmed stale.
- Admin: Bridge (SUPER_ADMIN_USER_IDS) vs legacy /golf/admin (role='admin')
  authorize two different unreconciled populations; the role='admin'
  post-login redirect is copy-pasted across 4 call sites.
- Golf features vs live DB: NO baseball-class drift; 18 doc-named absent
  tables all deliberately graveyarded. Rounds flow otherwise sound
  (beaconPartialSave wired; honest-error patterns hold).
- P2s for W4: public player/[id] "no stats table" comment is FALSE
  (baseball_player_season_stats live) but prop is dead — wire or drop;
  program/[id] Facilities/Commitments = permanently-dead sections (tables
  don't exist) — remove sections.

## Target IA (~8 tabs, owner directive)

### Baseball coach — unchanged (≤8 hubs: 8 standard; 7 for HS — Recruiting hidden by design; showcase variant has its own two-level rail) ✅
### Baseball player — 8 (move Settings out of rail to pinned footer)
Today · Schedule · My Profile · Stats · Development · Team · Messages · [exposureNoun]

### Golf coach — 8 hubs (adopt baseball's proven hub+subtab pattern on FairwayDashboardShell)
1. **Dashboard** (Overview; What's New folds in as card/CTA)
2. **CoachHelm AI** (Intelligence · Alerts · Insights · Patterns · Analytics — cluster activeMatch already exists)
3. **Team** (Roster · Recruiting HQ)
4. **Calendar** (Calendar · Travel)
5. **Rounds & Stats** (Rounds · Stats · Team Stats · Qualifiers)
6. **Messages** (Messages · Announcements)
7. **Operations** (Tasks · Documents)
8. **Courses**
Footer: Settings · Sign out. Mobile bottom bar: Home, CoachHelm, Team, Calendar, Messages (code renders label "Team", opening the Team hub — not "Roster"; unchanged from live behavior).

### Golf player — 8
1. **Dashboard** (merge Hub into Dashboard landing — two "homes" is duplicative)
2. **CoachHelm AI** (cluster: coachhelm · my-development · my-game-profile · my-standing)
3. **My Rounds**
4. **My Stats**
5. **Calendar**
6. **Team** (Roster · Team Info · Team Hub · My Qualifiers as sub-tabs)
7. **Messages**
8. **Courses**
Footer: Settings · Sign out.

## Waves (each: Sonnet executor(s), ≤~15-file PRs where possible, gates = tsc/lint/unit with captured exit codes, merge before next dependent wave)

- **W0 — P0/P1 security & correctness** (3 sub-PRs):
  - W0a code: discover.ts profile_visibility filter; Activate-Recruiting
    client-write removal; sign-out invalidateAuthCache; is_anonymous field
    dropped from 4 insert sites; server guards on ~12 client-only routes;
    comparisons redirect; coaching-intelligence player redirect (golf);
    middleware Sentry + tighten; account/delete FK-order fix.
  - W0b DB (baseball additive, check-first; REVOKE-after-recreate):
    recreate 2 leaky public views with visible_to_players/status +
    public_profile_mode filters; gate + revoke get_admin_event_summary;
    BEFORE UPDATE trigger guarding recruiting_activated.
  - W0c product correctness: FairwayShotTracking meters preference;
    new-round-client allHolesScored re-edit refresh; weekly-coach-email
    opt-out gate; task-reminders honor email_task_reminders.
- **W1 — Golf legacy-tree deletion** (the Coherence Ruling for golf):
  Fairway unconditional; delete GolfDashboardShell + GolfSidebar + every
  `isRedesignEnabled()/useRedesign()` fork's legacy branch (~65 pages);
  migrate un-gated legacy edge/error branches (roster error states,
  FeatureUnavailable users) to Fairway equivalents; delete flag plumbing
  (keep print route as-is by design). Likely 3–5 PRs by route cluster.
- **W2 — Golf nav consolidation 15/12 → 8/8**: hub-grouped rail per target
  IA above (port nav-registry/hub-definitions pattern or restructure
  buildNavSections with sub-tab strips); align legacy-vs-fairway nav parity
  claims; delete unreachable GolfSidebar redesign branch (dead code).
- **W3 — Baseball player nav → 8**: Settings to footer; verify manifest
  invariants + nav tests.
- **W4 — Baseball Living Annual completion (priority order)**: player/today
  FIRST; travel client; recruiting cluster (journey, colleges, analytics,
  discover, compare, comparisons, camps, dev-plans); settings hub + subpages;
  public profiles (team/[id] loading+error, shared tiered-access helper);
  command-center empty state; error.tsx cluster → shared RouteErrorBoundary;
  off-palette red/amber status boxes → tokens.
- **W5 — Lift Lab / Performance reskin** to Living Annual tokens (lift,
  readiness, performance/{groups,live,programs,builder}).
- **W6 — Golf polish**: port RuledStatLine + leader ticks to golf stats
  (owner's green/contrast ask); 2 emerald banned-color fixes; golf/join
  invisible-orbs fix (helm-primary-* → primary-*); rounds flow fixes from
  gap-fill deep read.
- **W7 — Dead code + docs truth**: prune 8 settings redirect stubs (verify
  no inbound links) + /coach stub + demo-mode anchor; dead loading/error on
  stubs; refresh BASEBALLHELM_FEATURE_READINESS_MATRIX (advisory check green)
  + re-grade gap map; baseball not-found handler.
- **W8 — DB remediation**: 8 phantom-migration tables (create if code needs,
  else clean migrations — per gap-fill verdict); 4 security_definer_view
  fixes (or documented acceptance); un-gated admin SECDEF functions (per
  gap-fill); dedupe multiple permissive policies on golf_shots/golf_holes/
  golf_causal_relationships/golf_insight_effectiveness/putt_details; FK
  indexes on admin_events/admin_analytics_events/crm_coaches; avatars bucket
  listing. Course-tees open-edit: REPORT to owner, do not change.
- **W9 — Admin**: role='admin' post-login → Bridge; Bridge route-level error
  boundaries; tracer completion or explicit deferral (size via gap-fill).
- **W10 — API/PWA/email/a11y fixes** from gap-fill findings.
- **Phase D — adversarial verify loop** until 2 consecutive dry rounds.
- **Phase E — advisors re-run + ONE production deploy + final report.**

## Standing constraints (bind every executor)
- No browser automation on this laptop; verify via tsc/tests/code-reads.
- No destructive writes in save/submit/sync paths; upsert/stage-and-swap.
- EIN… n/a. Golf DB functions untouchable without owner sign-off; baseball
  additive migrations pre-approved CHECK-FIRST (verify live schema before).
- Never GRANT to anon; REVOKE after matview/table recreate; verify relacl.
- Vercel: no preview deploys; ONE intentional production deploy at the end.
- Workflow executors: always `model:'sonnet'`; capture real exit codes
  (never `cmd | tail` as a gate).
- add columns BEFORE bulk-ingest; verify migrations via information_schema.

---

- **Phase D — adversarial verify loop** until 2 consecutive dry rounds
  (ledger below; loop still open as of `8f820639`).
- **Phase E — advisors re-run + ONE production deploy + final report**
  (checklist below; merge/deploy both pending Nick).

## Phase D — verification ledger

Six numbered adversarial-verify rounds plus one mega-wave have landed on
`integration/mission-verify` (15 commits ahead of `origin/main` as of
`8f820639`). Each round: an adversarial pass re-reads the diff/runtime
behavior against its own claims, fixes what it confirms, and gates before
merge — no round has yet come back dry.

| Round | Commit | Scope | Confirmed findings | Gates |
|---|---|---|---|---|
| 1 | `c9935b63` | P0 recruiting-guard trigger widened (flip-type-then-activate laundering closed); golf CoachHelm breadcrumb derivation; 16 baseball `loading.tsx` rebuilds; docs/registry truth | **19** | tsc 0, lint 0, unit 4614, build 0 |
| 2 | `fbcac248` | JUCO write-ordering fix (2nd `recruiting_activated` site the round-1 trigger note missed); golf mobile-nav active-state; glass purge on 46 baseball files + 14 more emerald-hue files; 3 pre-existing CodeQL findings; box-score colspan; stale e2e specs deleted | **6** + follow-ups | tsc 0, lint 0, unit green, build 0 |
| — | `2019db30` | **W7 re-grade** (docs, not an adversarial round): every one of 22 readiness-matrix rows re-verified against live source + prod migrations. Rollup moved **0 ready / 18 partial → 10 ready / 10 partial / 1 route-only / 1 hidden**. `check:readiness-matrix` exit 0; `readiness-matrix-routes` 204 tests passed | n/a | n/a |
| 3 | `afa2bfaa` | Final glass residue: `glass-standard/prominent/subtle` → **zero** under `src/app/baseball/**` (join/staff-join/demo-sessions/public-program); `EventsClient` badges onto `InkBadge` tone matrix | not itemized in commit trailer [verify] | tsc 0, lint 0, unit green, build 0 |
| 4 | `70aa5dab` | Signal Inbox silently discarded mutation results (toast now surfaces failures, convert-dialog stays open on failure); program-profile loading-header color flash fixed | **2** | tsc 0, lint 0, unit 4611/455 files |
| 5 | `2f0eb19f` | One finding-class, 7 sites: client awaits a server action and discards the result, so failures render as success (golf insight rate/dismiss ×3, baseball import approve, readiness check-in, lift program editor, recruiting pipeline) | **7** | tsc 0, lint 0, unit 4611/455 files |
| **mega** | `11180c54` | **"Phase D mega-wave"** — 4 fleets in one gated commit: Defect Sweep 1 (CRM unsubscribe false-ok, LLM spend-record logging, JUCO revert-only-if-it-flipped, 4 silent-failure fixes, double-submit guards, bounded chat fetch, paginated admin queries past the 1000-row cap, 4 tz day-bucketing fixes, round-submit a11y, 2 error boundaries); Defect Sweep 2 (email-route truth, HTML-injection escaping, 6 settings-stub regressions, Datadog client env, idempotent digest crons, registered refresh-engagement cron, batched golf N+1s, auth-redirect fallback chain, 2 mission tests made to actually gate); Authz Hardening (4 unauthenticated admin-client drivers de-exported from `'use server'` modules, zero client callers, coverage tripwire honestly re-derived **425 → 419**, −6 verified); Taste-Polish Wave (28 packets from a 15-cluster Opus design review: ~14 `loading.tsx` rewrites, legacy-island rebuilds onto Living Annual/Fairway, date/numeral unification) | **22 + 16** (Defect Sweeps 1+2); 28 polish packets not counted as "findings" | build 0, tsc 0, lint 0, unit 4616/455 files (4 test files repaired in-wave) |
| 6 | `8f820639` | Rebuild regressions from the mega-wave's own rewrites (Escape-key focus trap, overdue-task badge collision, deterministic aria-labels, off-by-one date anchoring, unearned "verified" checkmark, `InkNotice` error-ink var, Messages scroll guard + dead-component deletion, safe-area double-counting, 4 skeleton/board mismatches); missed-adjacent glass/color residue (PositionPlanner/PositionPlayerPill, 5 more components onto `InkBadge`/`InkNotice`, `CalendarFairway` event-ink map); 2 comment-terminator bugs from the fixer wave itself, caught by gates | **26** | build 0, tsc 0, lint 0, unit 0 (no count restated in trailer) |

Running total of discretely-counted confirmed findings across rounds 1, 2,
4, 5, 6 and the mega-wave's two defect sweeps: **19 + 6 + 2 + 7 + 22 + 16 +
26 = 98** [verify — sum of trailer-stated counts; round 3's residue batch
and the mega-wave's 28 taste packets are excluded as not discretely
numbered in their own commits].

**Status**: no round has come back dry yet, so the stated exit criterion
(2 consecutive dry rounds) is not met. A round-7 pass is in flight —
**uncommitted at HEAD** as of this ledger — touching
`snapshot-cards/shared.tsx`, `SnapshotHeaderBand.tsx`, `ProfileTimeline.tsx`,
`PlayerProfileClient.tsx`, and `PositionPlayerPill.tsx`: raw
`amber-*`/`warm-*`/`red-*` Tailwind swatches on the player-profile snapshot
cards and the position-planner pill are being converted to the ink system
(`--notice-error-ink` via `color-mix()`, `pursuit` clay-ink ramp), with
`PlayerNotesSection.tsx` and `PlayerPerformanceTab.tsx` explicitly
name-flagged in-code as deferred siblings still carrying raw color. This is
the same class of fix as round 6's residue sweep and overlaps the
ink-conversion follow-up wave below — it has not been gated or committed.

## Phase E — closeout checklist

- [x] **Advisors re-run** — Supabase advisors re-checked against live prod
  post-Phase-D fixes.
- [ ] **Merge to `main`** — pending Nick. Branch `integration/mission-verify`
  is 15 commits ahead of `origin/main` (`a3946332`); not yet opened/merged
  as a PR.
- [ ] **Production deploy** — pending, and gated on the merge above. Standing
  constraint: ONE intentional production deploy for the whole mission, no
  incremental previews.
- [x] **Trigger apply sequenced** — `supabase/migrations/20260709010200_baseball_players_recruiting_guard.sql`
  (the `BEFORE UPDATE` guard on `recruiting_activated`) carries a header
  banner marking it **DEPLOY-SEQUENCED**: it must land together with, or
  immediately after, the production deploy that ships W0a's
  `activateRecruitingExposure`/`deactivateRecruitingExposure` rewrite in
  `src/app/baseball/actions/player-access.ts` (now writing via
  `createAdminClient()`/service_role). Applying the trigger before that
  deploy lands would `42501` every legitimate activation/withdrawal on live
  prod. Its two W0b siblings — `20260709010000` (public-view visibility
  filters) and `20260709010100` (gate `get_admin_event_summary`) — have
  **already been applied to prod**, independently, with no such dependency.
- [ ] **Final report** — not yet written; blocked on the merge/deploy above.

## Two follow-up waves (queued after Phase D/E close — both already have a down payment in flight)

- **Agent-legibility sweep** (repo map doc, stale-doc truth pass, dead-code
  deletion) — tracked as not-yet-started, but the current uncommitted diff
  already contains one instance of the stale-doc truth pass: `docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md`'s
  Stats/Box-Score row cited a nonexistent migration filename
  (`20260709042343`); corrected in-flight to the real applied migration
  (`20260708150000_baseball_box_score_upsert_and_error_detail.sql`).
- **Tree-wide red/amber → ink conversion remainder** — tracked at 182 hits /
  57 baseball files [verify — this session's own broader grep for
  `(bg|text|border)-...-(red|amber)-[0-9]+` under `src/app/baseball` +
  `src/components/baseball` at HEAD returns a substantially higher count
  (~470 hits / ~75 files); the tracked figure likely predates several
  since-landed conversions (round 6, mega-wave taste-polish) or excludes
  the deliberately-preserved graduated readiness/status-color legends —
  reconcile scope before treating either number as authoritative]. In
  flight uncommitted right now on the player-profile snapshot-card cluster
  and `PositionPlayerPill` (see Phase D status above); `PlayerNotesSection.tsx`
  and `PlayerPerformanceTab.tsx` are explicitly flagged in-code as the next
  deferred targets.

---

## Addendum — 2026-07-15 repo-truth status sync

> Docs-truth pass, no code changes. Everything below was independently
> verified against `origin/batch/bbh-finish-0714` @ `0056bc0e` and the live
> GitHub API on 2026-07-15 (not carried over from any prior status claim);
> it supplements the mission record above without altering it. This mission
> doc's own Phase D/E sections above describe a *different*, since-superseded
> integration lane (`integration/mission-verify`); the batch below is the
> current one.

### Phase E items that have actually shipped since this doc was last touched
- **#792–#807** — BaseballHelm coherence (one shell/nav/Lift Lab), DB security
  hardening, statsync verification, the W0–W9 production-readiness mission
  itself, the agent-legibility + doc-truth + dead-code sweep, the M0+M1
  mobile overhaul, three post-deploy error sweeps, and the app-tab/feature-flow
  sweeps — all **MERGED to `main`** (confirmed via `gh pr list --state merged
  --base main`, not assumed).
- **Discover-privacy P0** — the CONFIRMED P0 in this doc's own Ground Truth
  section (`getDiscoverPlayers`/`getStateCounts` never checking
  `baseball_player_settings.profile_visibility`) — is **fixed in code**.
  `src/app/baseball/actions/discover.ts` now excludes
  `profile_visibility='private'` players at 4 call sites (search the file for
  the `P0 PRIVACY` comment tag), with a dedicated regression test:
  `src/app/baseball/actions/__tests__/discover-privacy.test.ts`.
- **Baseball Living-Annual UI migration — player/today and the other 28
  tracked surfaces are done.** `docs/baseball/ui-migration-map.md` and
  `ui-migration-execution-plan.md` both got a code-verified status header
  today: zero `isRedesignEnabled()` conditional forks remain anywhere under
  `src/app/baseball/**`/`src/components/baseball/**` (grep finds only
  doc-comment mentions), `useRedesign()` has no baseball call sites, and
  Batch H owner-cleanup (PR #820) deleted `PlayerPassportCard.tsx` + the dead
  `layout/header.tsx` + `mobile-menu-button.tsx` after confirming zero real
  importers. `player/today` specifically — the highest-traffic player screen
  this doc's Ground Truth section called out as one of 4 coexisting design
  languages — is on the kit; PR #814 also collapsed it to one primary mobile
  CTA (closes issue #484 in code; the GitHub issue itself is still open,
  pending Nick's close).

### Tonight's batch (`batch/bbh-finish-0714`) — merge state as of 2026-07-15
- **#809, #811** — merged to `main` (2026-07-15T02:09Z / 02:42Z).
- **#808** (import-cycle ratchet + mobile viewport regression suite) —
  merged to `main` (2026-07-15T06:56Z). *Correction to the standing overnight
  status: this is no longer "green-pending" — it merged.*
- **#810** (devibe wave 1 — delete dead root dirs/screenshots/one-off
  scripts) — still **OPEN** against `main`. 402 changed files, every CI
  check green; CodeRabbit auto-skipped because the diff exceeds its 150-file
  review cap (a real cap, not a billing block); `reviewDecision:
  REVIEW_REQUIRED` — awaiting Nick's manual review, not a gate failure.
- **#812–#841** (30 PRs) — all merged onto `batch/bbh-finish-0714` between
  2026-07-15T03:43Z and 06:28Z: the #379 stat-reconciliation seed/adapter
  work (#812, #813, #827, #828), six dedicated test-coverage PRs (#822–#826),
  the Journey-vs-Pipeline vocabulary dedup (#821), and the full mobile
  UI/UX wave (#829–#841 — 13 PRs across messages, roster/team-ops,
  recruiting, Lift Lab, import-center/stats-upload, onboarding-auth, and
  settings/coach-command).
- **#851** (CoachHelm engine loaders/registry — #379 Phase 4a) also merged
  onto the batch branch tonight (08:26Z), on top of the 30.
- **#842–#850** — 9 PRs still **OPEN** against `batch/bbh-finish-0714`
  (in-flight: #379 Phases 2/3 across roster/Command-Center/player-today,
  the authenticated E2E route crawler for #373, promoting the smoke suite
  to a required gate for #372, a mobile minors-sweep, and a Select-dropdown
  tap-target fix). Not part of tonight's "30 merged"; not yet reflected in
  the readiness matrix.
- **CI reality check** — the batch branch's own latest merge commit
  (`0056bc0e`, PR #851) shows **3 failing checks** on GitHub right now:
  `Business contracts` (the pre-existing `stat-layer-contract.test.ts` #379
  offenders, disclosed in #851's own PR body — reproduced locally on this
  worktree: 2 new-unlisted-offender files + 1 stale manifest entry),
  `Unit tests` (a `ResizeObserver`-mock `TypeError` thrown from
  `src/lib/fairway/use-scroll-fade.ts` in the CI environment — a mock/env
  issue, not new product code), and `Import-cycle ratchet` (madge flags
  `@supabase/supabase-js`/`dotenv/config` as "never seen before" — an
  external-package false positive, not a real new cycle). None look like
  regressions introduced by tonight's own diffs, but the honest statement is:
  **30 individually-gated PRs merged does not mean the branch HEAD is green
  end-to-end right now.**
