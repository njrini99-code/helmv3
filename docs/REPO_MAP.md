# Repo Map for Agents

Structural map of helmv3: route atlas, canonical idioms (with file:line
anchors), known traps, and a pre-code checklist. This is a map of *shape and
convention*, not of feature behavior — for feature behavior use
`memory/registry.yml` and `memory/context/*.md` per `CLAUDE.md`'s context
routing table. This doc does not auto-regenerate; if a route count or
file:line anchor looks wrong, trust the source file over this doc and flag
the drift.

Scope: `src/app/**` route trees for BaseballHelm, GolfHelm, Lift Lab, and
Admin/Helm Bridge; the canonical action-wrapper / toast / data-access /
design-token / nav-registry / error-boundary idioms; the 7 traps found by a
2026-07 sweep; a before-you-write-code checklist.

---

## 1. Product & route atlas

Route groups (`(auth)`, `(dashboard)`, etc.) resolve away — they don't add a
URL segment, they only partition intent/layout. Listed below with groups
resolved to the actual path.

### BaseballHelm — `src/app/baseball/**` (106 `page.tsx`, 85 with a sibling `error.tsx`)

- **`(auth)`** — `/baseball/login`, `/signup`, `/forgot-password`,
  `/reset-password`, `/demo`, `/complete-signup`
- **`(onboarding)`** — `/baseball/coach`, `/coach-onboarding`, `/player`
- **`(dashboard)/dashboard/*`** (coach + shared rail, ~80 leaves) —
  `/baseball/dashboard` plus: `academics`, `activate`, `analytics`,
  `announcements`, `calendar`, `camps[+/[id]]`, `college-interest`,
  `colleges`, `command-center`, `compare`, `comparisons`, `decision-room`,
  `dev-plan`, `dev-plans[+/[id]]`, `discover`, `documents`, `events`,
  `import`, `journey`, `lift[+/[sessionId]]`, `messages[+/[id]]`,
  `my-stats`, `operations`, `organization`,
  `performance(+/builder,/groups,/live,/players/[id],/programs[+/[programId]])`,
  `pipeline`, `players/[id](+/passport,/scout-packet[+/preview],/stats)`,
  `postgame`, `practice`, `practice-effectiveness`, `profile`, `program`,
  `readiness`, `roster`, `scout-packets`, `scouting`,
  `settings(+/ai,/appearance,/audit,/data-retention,/demo-mode,/guardian-access,/imports,/integrations,/notifications,/permissions,/philosophy,/player-access,/privacy,/program,/recruiting-preferences,/roles,/season,/showcase-profile,/staff,/teams)`,
  `signals`, `stats(+/games[+/[gameId],/create],/upload)`, `stats-center`,
  `tasks`, `team`, `teams`, `travel`, `videos`, `watchlist`
- **`(player-dashboard)`** (player-only rail) — `/baseball/player/today`,
  `/practice`, `/timeline`, `/passport`
- **`(public)`** (no auth) — `/baseball/packet/[token]`,
  `/baseball/player/[id]`, `/baseball/program/[id]`, `/baseball/team/[id]`
- **Misc top-level** — `/baseball/admin/demo-sessions`,
  `/baseball/join/[code]`, `/baseball/staff/join/[code]`

### GolfHelm — `src/app/golf/**` (64 `page.tsx`, 65 `error.tsx` — near 1:1)

- **`(auth)`** — `/golf/login`, `/signup`, `/forgot-password`,
  `/reset-password`, `/demo`, `/welcome`
- **`(onboarding)`** — `/golf/coach`, `/player`
- **`(dashboard)/dashboard/*`** — `/golf/dashboard` plus: `alerts`,
  `analytics/coachhelm`, `announcements`, `calendar`, `classes`,
  `coachhelm(+/chat,/genome/[playerId],/genome/compare,/qualifying/[id])`,
  `courses`, `development`, `documents`, `hub`, `insights`, `intelligence`,
  `messages`, `my-development`, `my-game-profile`, `my-insights`,
  `my-qualifiers`, `my-standing`, `patterns`, `players/[playerId](+/game[+/print])`,
  `qualifiers[+/[id],/new]`, `recruiting`, `roster[+/[id]]`,
  `rounds[+/[id][+/review],/continue/[id],/new,/recover]`,
  `settings(+/coaching-intelligence,/notifications)`, `stats[+/team]`,
  `tasks`, `team`, `team-hub`, `travel`, `whats-new`
- **Join** — `/golf/join`, `/golf/join/[code]`
- **`/golf/admin/*`** — `/golf/admin`, `/golf/admin/crm[+/coach/[id]]`,
  `/golf/admin/demo-sessions`. This is **GolfHelm's own** CRM/demo-sessions
  console — a separate tree from the cross-product `/admin` Helm Bridge
  below. Don't conflate the two "admin" trees.

### Lift Lab — `src/app/lifting/**` (23 `page.tsx`)

- **`(auth)`** — `/lifting/login`, `/signup`, `/forgot-password`,
  `/reset-password`
- **`(onboarding)`** — `/lifting/coach`
- **`(dashboard)/dashboard/*`** — `/lifting/dashboard` plus:
  `athletes[+/[athleteId]]`, `check-ins`, `command`, `exercises`, `groups`,
  `import`, `lift[+/[sessionId]]`, `programs[+/[programId]]`, `readiness`,
  `sessions[+/live]`, `settings`, `today`
- **Join** — `/lifting/join/[token]`
- **Gap**: only 2 `error.tsx` files exist for the whole product
  (`dashboard/error.tsx`, `dashboard/programs/[programId]/error.tsx`) vs.
  baseball's 85 and golf's 65. Adding a new lifting route should add its own
  `error.tsx` to close this gap, matching baseball/golf convention — see
  checklist item below.

### Admin / Helm Bridge — `src/app/admin/**` (17 `page.tsx`, flat — no route groups)

`/admin` (root/overview), `/activity`, `/auth`, `/baseball`, `/ben-leah`,
`/deploys`, `/errors[+/[fingerprint]]`, `/golf[+/tracer]`, `/health`,
`/jobs`, `/teams/[id]`, `/users[+/[id][+/view-as]]`, `/work`.

Super-admin gated via `checkSuperAdminAccess()` in
`src/app/admin/layout.tsx` (per `src/app/admin/error.tsx` comment);
`SUPER_ADMIN_USER_IDS` is the env gate. This is the cross-product
super-admin console — distinct from `/golf/admin` and
`/baseball/admin/demo-sessions` (per-product panels). An agent searching
for "admin" needs all three named.

### Root / marketing / legal / misc

Top-level `src/app` pages (route groups resolved): `/`, `/about`, `/help`,
`/products`, `/support`, `/splash`, `/vizlab`, `/fairway-preview`,
`/soreness-preview`, plus `(legal)` → `/privacy`, `/terms`.

**`helm-website-ui/`** is a second, wholly separate Next.js app
(`helm-website-ui/app/page.tsx`, `helm-website-ui/app/products/page.tsx`) —
its own build, not part of the `src/app` tree. Don't assume all marketing
routes live under `src/app`.

---

## 2. Canonical idioms

### Action wrappers

| Wrapper | Canonical location | Usage | Notes |
|---|---|---|---|
| `withBaseballAction` | `src/lib/baseball/with-baseball-action.ts:248` | 98 sites | Auth + active-context resolution, server-side capability enforcement, `Sentry.withScope` (`sport=baseball`, `feature`, `feature_area`, `action`) + breadcrumb. `opts`: `featureArea` required; optional `requiredCapability` / `requiredPlayerAccess` / `teamFrom` / `requireActiveContext` / `demoSafe`. |
| `withLiftingAction` | `src/lib/lifting/with-lifting-action.ts:113` | 23 sites | Injects `LiftingActionContext {user, orgId, access}`. `opts`: `featureArea`, `requireEdit`, `orgFrom`. Same `Sentry.withScope(sport='lifting', ...)` shape as baseball. |
| `withAdminObserved` | `src/lib/admin/observed-action.ts:56` (comment 21-25, guard `isNextControlFlowError` at line 28) | 129 sites — most-used of the three | Explicitly generalizes the with-baseball/with-lifting idea for cross-sport use ("Helm Bridge capture class #2 — failed server actions"). Contract: never changes the wrapped function's resolve/reject; logging is fire-and-forget via `resolveObservedUser()` (self-swallowing) then `observeActionSoftFailure()`. `isNextControlFlowError()` guards `NEXT_REDIRECT`/`NEXT_NOT_FOUND` digests from being misreported as failures. |

These three **compose, they don't compete**: a sport-specific wrapper owns
auth + capability + Sentry scoping; `withAdminObserved` is a cross-cutting
observability layer that can wrap *any* action — including one already
wrapped in `withBaseballAction`/`withLiftingAction` — purely to add
`admin_events` soft-failure capture.

### Toast

| Variant | Location | Status |
|---|---|---|
| Canonical `useToast()` / `addToast()` | `src/components/ui/sonner.tsx:212-222` (dispatch via `dispatchByType()` at line 195) | **Use this.** Returns `{showToast(message, type)` [legacy 2-arg], `addToast({type,title,description,action,duration})` [options object], `removeToast(id)}`, all routed through Sonner's `toast.success/error/warning/info`. `Toaster` mounted once in `src/app/layout.tsx`. |
| Direct `toast.error(...)` sonner import | 31 files, e.g. `src/app/golf/admin/crm/page.tsx:839,843,886,985,996` | Accepted legacy pattern, not broken. Don't "fix" these as a drive-by in an unrelated change; steer *new* code to `useToast()` instead. |
| Local `useToast()` / `ToastContext` collision | `src/app/golf/admin/crm/components/Toast.tsx:29` (`ToastContext` at line 27) | **Name collision, not a duplicate.** Own React Context, own `toast(message, type)` API — completely separate from and incompatible with the canonical sonner-backed `useToast()`. Importing the wrong one in a golf/admin/crm file throws (`useToast must be used within a ToastProvider`) or silently no-ops depending on which is in scope. Pick by **import path**, not by name. |

### Data access

| Primitive | Location | Usage | Rule |
|---|---|---|---|
| `fromUntyped(client, table)` | `src/lib/supabase/untyped.ts:69` (`UntypedTable` allowlist union, lines 15-61) | 159 sites | Centralizes the `as any` escape hatch for tables not yet in generated `database.ts` types. Extend the `UntypedTable` union when adding a new hand-typed table module — don't scatter raw `as any` casts. Graduate a table off this list once `db:types` regen picks it up. |
| `createAdminClient()` | `src/lib/supabase/admin.ts:4` | 200 sites — most-used data-access primitive in the repo | Throws if `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing/placeholder; returns a service-role client (`autoRefreshToken:false, persistSession:false`) that **bypasses RLS**. Greptile rule `service-role-scope` (`.greptile/config.json`, severity high) hard-blocks any use outside `src/lib/supabase/admin*` and `src/app/api/**/admin/**` as a security incident — not a style nit. |
| `fetchAllRows` / `fetchAllRowsResult` | `src/lib/supabase/fetch-all-rows.ts` — `fetchAllRows` (line 60, throws on error), `fetchAllRowsResult` (line 103, `{data,error}` shape) | 69 sites | `DEFAULT_PAGE_SIZE=1000` (line 34), loop bounded at 1000 pages as a circuit-breaker (line 74). Caller **must** supply a stable `.order()` on a unique column (lines 10-19) or page boundaries drift. Optional `rlsCtx` threads into `maybeCaptureRlsDenial` (lines 22-29). This is the fix for the PostgREST 1000-row-cap trap below — treat the two as one unit. |
| `todayIsoInTz(tz, now)` / `resolveTeamTimezone(...)` | `src/lib/baseball/daily-contract/contract-day.ts:57` and `:193` | — | Canonical timezone-resolution primitives for any calendar/today/streak feature. Part of the "daily contract" module backing Greptile rule `calendar-timezone-safety` (store UTC, display in team/user timezone, no naive `new Date()` day-boundaries). Don't hand-roll `new Date()` day-boundary math. |
| `getAppBaseUrl()` | `src/lib/app-base-url.ts:32` | — | Canonical way to resolve the app's own base URL (email links, share links) instead of hardcoding a host or reading `NEXT_PUBLIC_SITE_URL` directly at each call site. |

### Design tokens

**BaseballHelm — "Living Annual" (`src/styles/baseball-living-annual.css`)**

`:root` vars (lines 30-66): `--paper #F3EAD6`, `--paper-canvas #EAE1CE`,
`--hairline #D6CBB0`, `--team-ink #16A34A`, `--pursuit-ink #C2703D`,
`--pursuit-deep #7A2E22`, `--notice-error-ink #C2703D` (see rationale
below), `--grade-low/avg/plus` (20-80 scouting scale), `--clay/--chalk/--sodium`
(reserved dark-viz canvas). 43 atom/molecule/viz components under
`src/components/baseball/living-annual/`. `.living-annual` scope (lines
78-87) re-points `--fw-color-*` to warm cream for baseball descendants
only — golf never carries this class. Color law (file header, lines
21-27): green = team/development, clay = recruiting/pursuit, oxblood =
seals/stamps **only**, sodium = single PR/live flash **sparingly**, dark
clay canvas **only** inside `<ClayCanvas>` — never a page/sidebar/card
background.

*`--notice-error-ink` rationale (lines 41-55):* three "sage & cream"
entry-scope stylesheets (`baseball-auth.css .baseball-auth-panel` and two
`onboarding-entry.css` files scoping `.entry-onboarding-scope`) redefine
**both** `--grade-plus` and `--pursuit-ink` to the same `--fl-sage-deep` —
so an error indicator reading `--pursuit-ink` directly on those surfaces
would render identically to a success indicator. `--notice-error-ink` is a
byte-identical-but-independently-named var (same `#C2703D` outside recolor
scopes) that none of the three recolor files override, so it survives
scoping. Consumed by `<InkNotice>`, snapshot-card error variants
(`src/components/baseball/player-profile/snapshot-cards/shared.tsx:117,199`),
and join/onboarding error UI
(`src/app/baseball/join/[code]/page.tsx:170-174`,
`src/app/baseball/staff/join/[code]/page.tsx:73-77`). **Never** swap a
`--notice-error-ink` read back to `--pursuit-ink` "for consistency" — it
would silently break error/success distinguishability on exactly those 3
recolor-scoped auth/onboarding surfaces.

**GolfHelm — Fairway `fw-*` tokens (`src/styles/design-tokens.css`)**

Header comment (line 20): "All design-system properties are prefixed
`--fw-` so they can NEVER collide." Ramps: `--fw-color-accent-50..900`
(helm green, `#16A34A` = accent-500), `--fw-color-team-mens/womens`,
`--fw-color-warm-50..950`, surface tier (`canvas/surface/surface-tint/surface-sunken/elevated`),
text (`text-primary/secondary/tertiary/on-accent/on-dark` — tertiary
darkened per a WCAG P422 fix, line 87, to clear 4.5:1 AA),
border/status/nav tokens, `--fw-radius-*`, `--fw-shadow-*`. Consumed in
`src/components/fairway/{calendar,instrument,overlays,surfaces}/*.css` and
animation vars `--fw-dur-*`/`--fw-ease-*` in `globals.css` (lines
1767-1845) with inline fallbacks (e.g. `var(--fw-dur-base, 280ms)`). This
is a **separate token layer** scoped via a `.fairway-ds` class, coexisting
with — not replacing — the `tailwind.config.ts` tokens described in
`CLAUDE.md`'s color-family list (`primary-*`/`destructive`/`warm-*`/`cream-*`).

### Nav registries

Data-driven for baseball/golf; component-inline for lifting/admin — a real
asymmetry, not an oversight to "fix" by inventing a lifting registry.

| Product | Location | Shape |
|---|---|---|
| Baseball | `src/lib/baseball/nav-registry.ts` (1278 lines) | `BASEBALL_NAV_REGISTRY: readonly BaseballNavEntry[]` (line 330) + role/visibility helpers `isBaseballNavEntryVisible`/`getVisibleBaseballNav`/`getPrimaryBaseballNav`/`getSecondaryBaseballNav`/`getBaseballNavEntry`/`getBaseballDefaultLandingHref`/`getBaseballTerminology` (lines 1109-1276). |
| Golf | `src/lib/golf/nav-registry.ts` (460 lines) | `GOLF_COACH_HUBS`/`GOLF_PLAYER_HUBS` (lines 201, 231) + `buildCoachRailSections`/`buildPlayerRailSections`/`buildCoachBottomNavItems`/`buildPlayerBottomNavItems` (lines 304-460) + `resolveActiveGolfHub` + `COACHHELM_COACH_CLUSTER_PREFIXES`/`COACHHELM_PLAYER_CLUSTER_PREFIXES` (lines 125-152). |
| Lift Lab | `src/components/lifting/shell/LabNav.tsx` | Component-inline. **No `LIFTING_NAV_REGISTRY` module exists** — a new lifting route edits `LabNav.tsx` directly. |
| Admin | `src/app/admin/_components/admin-nav.ts` (+ `admin-nav.test.ts`) | Own small registry + test, separate from baseball/golf's. |

### Error-boundary pattern

**Shared:** `src/components/errors/RouteErrorBoundary.tsx` is the
canonical per-route `error.tsx` implementation — detects stale-deployment
chunk-load errors (`isChunkLoadError`, lines 35-43), stale-server-action
errors (via `isStaleServerActionError`/`softReloadForStaleServerAction`
shared with `src/lib/error-logging` so global `unhandledrejection`
handlers and this boundary share one regex + one reload-once-per-session
guard), and transient/retryable errors (`isTransientError`, 503/502/504)
with optional auto-retry. 157 route-level `error.tsx` files repo-wide, each
a thin `'use client'` wrapper importing `RouteErrorBoundary` and passing
`{route, component, title, message, homePath}`. Root tier: `src/app/error.tsx`,
`src/app/global-error.tsx`. New routes should add a 4-line `error.tsx`
delegating to `RouteErrorBoundary` with route-specific copy — don't
hand-roll new boundary logic.

**Admin has a 3rd, panel-scoped tier + a documented boundary-scope gap:**
`src/app/admin/error.tsx` wraps `RouteErrorBoundary` (reusing golf's
Fairway-tokened boundary per its own comment), but:

1. Every Bridge panel already degrades via a **separate**, finer-grained
   `PanelBoundary` (`src/app/admin/_components/PanelBoundary.tsx`) — one
   upstream hiccup scopes to a single amber card, not the whole console.
2. **Documented, unfixed gap:** `error.tsx` does **not** catch throws in
   `layout.tsx` of the *same* folder (`src/app/admin/layout.tsx`) — only in
   nested layouts/pages below it. A genuine failure in
   `checkSuperAdminAccess()` at the layout level still bubbles to the root
   `src/app/error.tsx` (non-Bridge chrome). Known follow-up, not a bug to
   silently "fix" in an unrelated change.
3. `src/app/golf/admin/components/AdminErrorBoundary.tsx` is an **older
   class-component** boundary (`Component`/`componentDidCatch`, lines
   1-40) that predates and coexists with `RouteErrorBoundary` — a
   genuinely different mechanism (React class boundary vs. Next.js
   `error.tsx` file convention), not just a naming variant.

---

## 3. Traps

Seven traps found with concrete repo evidence (not assumed from memory).

1. **Schema-drift — migration recorded-but-not-applied.**
   `docs/audits/REPO_UNTANGLE_AND_CLEAN_BASE.md:128`: Supabase's
   migration-history table can show a migration as applied without the DDL
   having actually run against the target DB (or vice versa). Never trust
   the history table alone before writing code that assumes a
   column/table exists — run a live `information_schema.columns`/`.tables`
   check first.

2. **Matview/view/function recreate re-grants `anon`.**
   `supabase/migrations/20260617000100_crm_engagement_invert_clicks.sql:79-85`:
   a fresh `CREATE MATERIALIZED VIEW` in the `public` schema re-triggers
   Supabase's `ALTER DEFAULT PRIVILEGES`, auto-granting `ALL` to `anon` +
   `authenticated`. Must be followed by explicit `REVOKE ALL ... FROM anon`
   (and `FROM authenticated` where the original ACL excluded it) in the
   **same migration**. Generalizes beyond matviews to `CREATE OR REPLACE
   VIEW` (`20260709010000_baseball_public_views_honor_visibility.sql:90,158`)
   and `CREATE OR REPLACE FUNCTION`
   (`20260701150000_run_integrity_checks_rpc.sql:56`,
   `20260704130000_integrity_check_admin_readability_tripwire.sql:71`). A
   dedicated backfill wave exists:
   `supabase/migrations/20260625000050_baseball_anon_revoke_wave1.sql`.
   Verify via `pg_class.relacl` / `has_table_privilege` after — not just by
   reading the DDL.

3. **PostgREST 1000-row cap silently truncates unpaginated queries.**
   `src/lib/supabase/fetch-all-rows.ts:1-8`: PostgREST returns at most
   1000 rows per request by default; an unpaginated `.in('round_id',
   roundIds)` on `golf_holes`/`golf_shots` silently truncates once a team
   season exceeds 1000 rows, undercounting putts/GIR%/fairway%. `.limit(N)`
   does **not** lift this cap — only `range()`-based pagination does. Any
   new aggregate/analytics query that can plausibly exceed 1000 rows over a
   season must go through `fetchAllRowsResult` with a stable `.order('id')`.

4. **Glob-shaped token inside a CSS/JS block comment prematurely closes it.**
   `docs/audits/REPO_UNTANGLE_AND_CLEAN_BASE.md:101` (real, shipped
   incident, PR #650): `src/app/globals.css` lines 2-4 contained comment
   text `--pursuit-*/` — the literal `*/` terminated the block comment
   early, causing a postcss syntax error at 3:42 and a broken Next build.
   Any `'*/'` substring closes a CSS/JS block comment regardless of prose
   context. Fixed (verified current) by rewriting to `--pursuit-*,` (comma,
   not slash). When writing doc comments that list namespaced
   custom-property prefixes ending in `*` (`--fw-*`, `--pursuit-*`), never
   let a `/` immediately follow the `*` inside a block comment.

5. **Vercel one-deploy-per-milestone gate (Ignored Build Step).**
   `vercel.json:6-11`: `"ignoreCommand": "bash scripts/vercel-ignore-build.sh"`,
   `"git": {"deploymentEnabled": {"*": false}}` — git-triggered deploys are
   disabled for every branch at the platform level.
   `scripts/vercel-ignore-build.sh` skips every branch except `main` (Vercel
   semantics: exit 0 = skip, exit 1 = proceed), fail-opening to building
   when `VERCEL_ENV=production` even with an empty
   `VERCEL_GIT_COMMIT_REF`. Vercel preview builds being off is **by
   design** (cost control) — a red/skipped Vercel preview check on a PR is
   expected, not a CI failure to chase. `docs/audits/REPO_UNTANGLE_AND_CLEAN_BASE.md:96`
   notes CircleCI's `lighthouse-preview` job is red only because of this,
   an easy misdiagnosis. Flipping the Ignored Build Step back on is a
   manual, owner-gated step (line 127) — easy to forget, don't do it
   unprompted.

6. **Auth/session hooks stranding `loading: true` forever on unexpected throw.**
   `src/hooks/use-auth.ts:12-28`: with multiple independent `useAuth()`
   callers each running their own `fetchUser()`/`onAuthStateChange` against
   a shared flag, mount-guard early-returns could skip `setLoading(false)`,
   stranding `loading=true` forever (page stuck on skeleton). Fixed via one
   deduped module-level fetch + subscription (`inFlight`/`subscriberCount`/
   `authSubscription`, lines 31-33) where loading is **always** resolved in
   a `finally`. Same bug class independently fixed in
   `src/hooks/use-baseball-auth.ts:132-140` (falls back to `{ok:false,
   redirectTo:'/baseball/login'}` instead of hanging). Any new
   session/auth-resolving hook must resolve loading/pending state on
   **every** code path including unexpected throws (try/catch or
   `.finally`) — an unguarded exception mid-hook leaves callers on an
   infinite loading skeleton, not a visible error.

7. **`noUncheckedIndexedAccess` non-null-assertion fallback idiom.**
   `tsconfig.json:21`: `"noUncheckedIndexedAccess": true` — every `arr[i]`
   read types as `T | undefined`, not `T`. Canonical fallback is a
   documented, guard-then-assert `!`, **not** a silent `?? fallback`:
   `src/lib/golf/nav-registry.ts:322,328,335,341,348,389,427,430`
   (`team.tabs[0]!.href`), `src/lib/golf/strokes-gained.ts:122`
   (`distances[0]!`), `src/lib/golf/progress-drivers.ts:145`
   (`goals[0]!.player_id // non-empty (guarded above)`). Convention
   confirmed in `docs/archive/2026-06/superpowers/plans/2026-06-07-coachhelm-to-90.md:927`.
   When `noUncheckedIndexedAccess` forces a `T | undefined` at an index
   you've already proven non-empty (length check, `.filter`, upstream
   invariant), assert with `!` **and** leave a one-line comment naming the
   guard. Do not silently swap in `?? someDefault` — that masks a real
   off-by-one/empty-array bug instead of surfacing it as a thrown error.

---

## 4. Before you write code — checklist

- [ ] **Feature awareness first.** Run `npm run knowledge:map -- --files
      <paths...>` and read the mapped `memory/context/*.md` /
      `memory/features/*.md` docs before touching mapped code (per
      `AGENTS.md`). This map doc is structural, not a substitute for that.
- [ ] **Route placement.** Confirm which product tree the route belongs
      in (§1) and which route group (`(auth)`/`(onboarding)`/`(dashboard)`/
      `(player-dashboard)`/`(public)`) matches its access model. Adding a
      lifting route: add a sibling `error.tsx` — the product-wide gap means
      it won't inherit one.
- [ ] **Mutations.** Use the sport-appropriate wrapper
      (`withBaseballAction`/`withLiftingAction`) for auth+capability+Sentry
      scoping. Layer `withAdminObserved` on top only if the action also
      needs `admin_events` soft-failure capture — don't pick one instead
      of the other where both apply.
- [ ] **Toasts.** Import `useToast` from `@/components/ui/sonner` by path,
      not by name — a same-named, incompatible `useToast` exists at
      `src/app/golf/admin/crm/components/Toast.tsx`.
- [ ] **Data access.** New hand-typed table → extend `UntypedTable` in
      `src/lib/supabase/untyped.ts`, don't scatter `as any`.
      `createAdminClient()` only inside `src/lib/supabase/admin*` or
      `src/app/api/**/admin/**` — anywhere else is a Greptile-blocked
      security finding. Any query that can exceed 1000 rows over a season
      → `fetchAllRowsResult` with a stable `.order()`, never a bare
      `.select()`/`.in()`. Day-boundary logic → `todayIsoInTz`/
      `resolveTeamTimezone`, never naive `new Date()`. Own-origin URLs →
      `getAppBaseUrl()`, never a hardcoded host.
- [ ] **Design tokens.** Baseball surfaces under `.living-annual` scope →
      Living Annual vars per the color law (§2); never read
      `--pursuit-ink` where `--notice-error-ink` is the correct var for an
      error state. Golf/Fairway surfaces → `--fw-*` tokens, not
      `tailwind.config.ts` tokens directly, inside `.fairway-ds` scope.
- [ ] **Nav.** Baseball/golf → update the data-driven registry
      (`nav-registry.ts`). Lifting → edit `LabNav.tsx` directly, there is
      no registry module to update.
- [ ] **Error boundaries.** New route → thin `error.tsx` delegating to
      `RouteErrorBoundary`. New admin panel → also consider `PanelBoundary`
      for panel-scoped degradation. Don't assume `/admin`'s `error.tsx`
      catches a `layout.tsx`-level throw in the same folder — it doesn't.
- [ ] **Migrations.** Any `CREATE MATERIALIZED VIEW` / `CREATE OR REPLACE
      VIEW` / `CREATE OR REPLACE FUNCTION` in `public` → add `REVOKE ALL
      ... FROM anon` (and `authenticated` as needed) in the **same**
      migration; verify with `pg_class.relacl`, not by reading the DDL.
      Verify a migration actually ran via `information_schema`, not the
      migration-history table.
- [ ] **CSS/JS comments.** Never let a namespaced-prefix-plus-`*` token
      (`--fw-*`, `--pursuit-*`) sit immediately before a `/` inside a
      block comment.
- [ ] **`arr[i]!`.** Only assert past `noUncheckedIndexedAccess` when
      you've proven the index is safe, and say why in a comment.
- [ ] **Vercel.** A red/skipped Vercel preview check is expected (deploys
      are intentionally off for non-`main` branches) — don't chase it as a
      CI failure, and don't flip the Ignored Build Step yourself.
- [ ] **Session/auth hooks.** Resolve `loading`/pending state in a
      `finally` (or equivalent) on every code path, including unexpected
      throws.
