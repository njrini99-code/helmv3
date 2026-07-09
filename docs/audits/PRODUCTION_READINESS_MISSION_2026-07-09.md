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
