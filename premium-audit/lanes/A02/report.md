# Lane A02 — App state, navigation, recovery, caching, and continuity

Baseline: `3c90f9f174ac103af5fafc600aebecd98243decc`. Read-only audit; no source edits made. Evidence labels used: SOURCE, RISK, PROPOSAL, NOT_RUN/BLOCKED only (no OBSERVED/REPRODUCED — no device, no runtime this phase).

## Top 5 actionable findings

1. **A02-001** (P0, SOURCE) — Four uncoordinated global reload/recovery mechanisms (`StaleDeploymentRecoveryScript.tsx`, `ChunkLoadErrorHandler.tsx`, `RouteErrorBoundary.tsx`, `error-logging.ts`'s `setupGlobalErrorHandlers`) all live in the root layout. The bare generic error string `"load failed"` (iOS WebKit's default fetch-failure message) triggers a full `window.location.replace` with **zero unsaved-work guard**, and the reload budget is **cleared on every successful hydration** (`ChunkLoadErrorHandler.tsx:16-24`), so a repeating failure regains full budget every time it recovers — `src/components/providers/StaleDeploymentRecoveryScript.tsx:30-46,115-177`, `src/components/providers/ChunkLoadErrorHandler.tsx:12-28`.
2. **A02-003** (P1, SOURCE) — `StageRouter.tsx` always uses `history.replaceState` for every stage swap (never pushes), so native platform Back from an open drill/detail stage does not return to the stage's home — it leaves the page. Every swap also unconditionally permits scroll-into-view via `focus({preventScroll: false})` — `src/components/fairway/modules/StageRouter.tsx:47-76,106-186`.
3. **A02-005** (P1, SOURCE) — Home/Stats/Rounds pages are `force-dynamic` with no `experimental.staleTimes` override in `next.config`, so Next's default 0s dynamic Router-Cache means every return-navigation re-fetches from zero and re-shows the route's full `loading.tsx` skeleton, even for same-scope, still-valid data — `src/app/golf/(dashboard)/dashboard/page.tsx:28`, `stats/page.tsx:15`, `rounds/page.tsx:22`.
4. **A02-004** (P2, SOURCE) — `dashboard/template.tsx` is a Next.js `template.tsx`, which by framework contract fully remounts the entire page component tree on **every** dashboard navigation, including lateral tab switches the app's own Doctrine Rule 9 calls "instant" — destroying any un-lifted local page state every time — `src/app/golf/(dashboard)/dashboard/template.tsx:1-62`.
5. **A02-002** (P2, SOURCE) — `NavPendingDot` is a real in-flow flex child (not an overlay) inside the bottom-nav tab's `flex-col items-center justify-center` column, so its appearance during a pending navigation measurably re-centers the icon/label vertically — matches seed G05 — `src/components/fairway/app-shell/NavPending.tsx:50-79`, `src/components/fairway/app-shell/FairwayBottomNav.tsx:193-232`.

## All findings

See `findings.jsonl` for the machine-readable records (A02-001 through A02-007, one JSON object per line). Full prose per finding:

```yaml
id: A02-001
severity: P0
evidence_label: SOURCE
related_prior_ids: [G01, G02, T01, T02]
summary: >
  Four independent, uncoordinated global reload mechanisms mounted unconditionally
  in the root layout (src/app/layout.tsx:138,148,149). A bare "load failed" or
  "failed to fetch" reaches StaleDeploymentRecoveryScript's isStaleDeploymentError
  classifier and triggers a full document location.replace with NO check for a
  dirty form, an in-progress round, or any unsaved state. The MAX_RELOADS=3 budget
  (URL param __deployment_refresh) and its cooldown (sessionStorage
  chunk-error-reload) are BOTH unconditionally cleared by ChunkLoadErrorHandler.tsx
  on every successful hydration, so the budget does not survive across a
  successful mount the way §9 requires -- it resets every time recovery succeeds.
  A fourth path (error-logging.ts's setupGlobalErrorHandlers, mounted via
  GlobalErrorHandlerSetup) independently detects stale-server-action errors and
  can race the first mechanism for the SAME error message (both classifiers match
  "was not found on the server").
file_line_citations:
  - src/components/providers/StaleDeploymentRecoveryScript.tsx:30-46 (isStaleDeploymentError; bare "load failed" match)
  - src/components/providers/StaleDeploymentRecoveryScript.tsx:115-177 (reloadFresh + listeners, no unsaved-work guard)
  - src/components/providers/ChunkLoadErrorHandler.tsx:12-28 (clears BOTH budget markers on every successful mount)
  - src/components/errors/RouteErrorBoundary.tsx:145-263 (a THIRD, differently-gated reload/retry path reusing the same sessionStorage key)
  - src/lib/error-logging.ts:499-576,630-679 (a FOURTH independent listener pair + reload path)
  - src/app/layout.tsx:138,148,149 (all four mounted together, every route, app-wide)
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A02-002
severity: P2
evidence_label: SOURCE
related_prior_ids: [G05]
summary: >
  NavPendingDot renders a real in-flow <span> as the third child of the bottom-nav
  tab's flex-col/justify-center column when a Link navigation is pending. This
  changes the column's total content height, so justify-center re-centers the
  icon+label stack -- a real vertical displacement, not the "additive, costs no
  layout" behavior claimed in the component's own header comment.
file_line_citations:
  - src/components/fairway/app-shell/NavPending.tsx:50-79
  - src/components/fairway/app-shell/FairwayBottomNav.tsx:193-232 (flex-col items-center justify-center column; dot inserted at line 231)
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A02-003
severity: P1
evidence_label: SOURCE
related_prior_ids: [G18, T02]
summary: >
  StageRouter.open() always calls replaceStageUrl(), which unconditionally does
  history.replaceState for every stage-key change -- there is no push branch for
  a "deeper destination" (opening a drill) vs a "same-level mode" (switching
  siblings), despite plan Section 9.3 requiring that distinction. Native Back from
  an open drill therefore does not return to the stage's home. Separately, every
  non-initial stage swap unconditionally calls focus({preventScroll: false}),
  which permits the browser to scroll the page to bring the new stage view into
  view even when it is already visible -- no viewport-intersection check exists.
file_line_citations:
  - src/components/fairway/modules/StageRouter.tsx:47-76 (replaceStageUrl -- always history.replaceState)
  - src/components/fairway/modules/StageRouter.tsx:106-186 (StageRouter body: open(), the focus effect at 135-141, the remount-via-key at 169)
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A02-004
severity: P2
evidence_label: SOURCE
related_prior_ids: []
summary: >
  dashboard/template.tsx is a Next.js template.tsx -- by the framework's own
  contract this creates a NEW instance of its children on every navigation to a
  route nested under it (unlike layout.tsx). This file wraps the ENTIRE golf
  dashboard content tree. FairwayDashboardShell and its persistent providers live
  one level up (in (dashboard)/layout.tsx, which does not remount) so shell chrome
  is stable, but every PAGE's own component tree below this template is destroyed
  and rebuilt on every navigation -- including lateral tab switches the app's own
  Doctrine Rule 9 (cited in this file) calls "instant." Any page-local state not
  lifted to the URL or a persistent provider above this boundary is silently
  discarded every time.
file_line_citations:
  - src/app/golf/(dashboard)/dashboard/template.tsx:1-62
  - src/app/golf/(dashboard)/layout.tsx:290-300 (FairwayDashboardShell mounts in the persisting layout, one level above this template)
caveat: >
  Confidence on the MECHANISM is high (this is Next.js's documented template.tsx
  contract, directly applied to this file). Confidence on USER-VISIBLE SEVERITY
  is medium -- whether any given dashboard page actually holds meaningful local
  state that this destroys is each feature lane's (A04-A09) territory and is
  NOT_RUN here.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A02-005
severity: P1
evidence_label: SOURCE
related_prior_ids: []
summary: >
  dashboard/page.tsx, stats/page.tsx, and rounds/page.tsx all declare `export
  const dynamic = 'force-dynamic'`. Next's App Router client Router Cache
  defaults DYNAMIC segments to a 0-second stale time (only static segments get
  ~5 minutes) unless experimental.staleTimes overrides it; next.config's
  experimental block carries no such override. Combined with every dashboard
  route shipping its own loading.tsx (40+ files under
  src/app/golf/(dashboard)/dashboard/) and A02-004's forced remount, a
  return-navigation to Home/Stats/Rounds re-fetches from zero and re-shows the
  FULL route skeleton every time, even for same-scope data that has not gone
  stale by any definition the user would recognize.
file_line_citations:
  - src/app/golf/(dashboard)/dashboard/page.tsx:28
  - src/app/golf/(dashboard)/dashboard/stats/page.tsx:15
  - src/app/golf/(dashboard)/dashboard/rounds/page.tsx:22
  - next.config.mjs:165-197 (experimental block, no staleTimes key)
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A02-006
severity: P3
evidence_label: RISK
related_prior_ids: [G18]
summary: >
  StageRouter's cross-instance sync dispatches an UNSCOPED window CustomEvent
  filtered only by param name equality -- no per-instance id exists. Today's two
  live mounts (PlayerCoachHelmHome "view", StatsSpineStage "area") use different
  params so there is no active collision, but nothing prevents a future
  StageRouter reusing an existing param from silently cross-navigating another
  instance.
file_line_citations:
  - src/components/fairway/modules/StageRouter.tsx:35,70-76,117-125
  - src/components/golf/coachhelm/home/PlayerCoachHelmHome.tsx:421
  - src/components/golf/stats/spine-stage/StatsSpineStage.tsx:599
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A02-007
severity: P3
evidence_label: RISK
related_prior_ids: []
summary: >
  setupGlobalErrorHandlers() (error-logging.ts) installs window
  'error'/'unhandledrejection' listeners with no re-entrancy guard, unlike its
  sibling mechanism (StaleDeploymentRecoveryScript's own
  window.__helmv3StaleDeploymentRecoveryInstalled check). Safe today because
  GlobalErrorHandlerSetup mounts exactly once (layout.tsx:149), but nothing
  enforces that invariant against a future remount or React StrictMode
  double-invoke.
file_line_citations:
  - src/lib/error-logging.ts:630-679
  - src/components/providers/GlobalErrorHandlerSetup.tsx:10-16
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

## State-owner graph

```
RootLayout (src/app/layout.tsx) -- mounted once, every route in the whole app
 ├─ StaleDeploymentRecoveryScript  -- beforeInteractive script; global reload path #1
 ├─ ChunkLoadErrorHandler          -- clears reload-budget markers on every mount
 ├─ GlobalErrorHandlerSetup        -- global reload path #2 (stale-server-action)
 └─ CapacitorProvider (A01)

(golf)/(dashboard)/layout.tsx -- SERVER component, resolves auth/role/team via SSR
 └─ FairwayDashboardShell (client) -- PERSISTS across every dashboard navigation
     ├─ SidebarProvider / MobileNavProvider   -- nav-sheet open state
     ├─ SessionActivityProvider
     ├─ GolfUserProvider                       -- userData (name/team/role), server-seeded
     ├─ NotificationBadgeProvider              -- polled badge counts (45s, per AppShell.tsx comment)
     ├─ NotificationPanelProvider              -- shared bell-panel open state
     ├─ OfflineProvider                        -- sync engine (A05 territory)
     ├─ AppShell                                -- rail/topbar/bottomnav/MoreSheet frame
     │   ├─ FairwaySidebar (desktop, matchMedia-gated mount)
     │   ├─ FairwayTopBar (memoized props -- fixed perf issue, see Coverage)
     │   ├─ FairwayBottomNav (mobile, memoized) -- owns NavPendingDot geometry (A02-002)
     │   └─ MoreNavSheet
     └─ {children}
         └─ dashboard/template.tsx -- REMOUNTS entire subtree on every navigation (A02-004)
             └─ page.tsx (force-dynamic, own loading.tsx) -- (A02-005)
                 └─ StageRouter (per-feature mount: "view" or "area" param) -- (A02-003, A02-006)
```

Owners, in one line each: shell chrome + nav state -> A02 (FairwayDashboardShell/AppShell/BottomNav); auth/role/team resolution -> server layout, SSR, no client waterfall (verified PASS, see Coverage); recovery/reload -> currently four uncoordinated owners (A02-001, needs consolidation to one); stage/drill navigation -> StageRouter, A02; per-page data fetch/cache -> each feature lane's page.tsx (A04/A05/A06/A07), with the C02 pattern absent as shared infra today.

## Recovery decision table (as-built, not as-specified)

| Trigger source | Classifier | Reload mechanism | Budget key(s) | Budget survives a successful mount? | Unsaved-work guard? |
| --- | --- | --- | --- | --- | --- |
| `window.error`/`unhandledrejection` (beforeInteractive script) | `isStaleDeploymentError` (bare "load failed", chunk errors, server-action-not-found, "unexpected response") | `location.replace` w/ cache+SW clear | URL param `__deployment_refresh` (count, max 3) + sessionStorage `chunk-error-reload` (cooldown timestamp) | **No** -- `ChunkLoadErrorHandler` clears both on every successful hydration | **No** |
| `window.error`/`unhandledrejection` (`setupGlobalErrorHandlers`) | `isStaleServerActionError` ("was not found on the server") | `location.reload()` after toast | sessionStorage `stale-action-auto-reload` + module flag `reloadAttempted` | Module flag: no (resets per page load); sessionStorage key: yes, but only for this one path | No |
| `error.tsx` boundary (`RouteErrorBoundary`) | `isChunkLoadError` (webpack/ESM chunk phrases) | `location.reload()` | sessionStorage `chunk-error-reload` (boolean presence, DIFFERENT semantics than the script above) | **No** -- same key, same clearing | No |
| `error.tsx` boundary auto-retry | `isTransientError` / `isGenericLoadFailure` (incl. bare "load failed") | `reset()` (in-place retry, NOT a document reload) | sessionStorage `route-auto-retry:${route}` (budget 2) | Yes -- distinct key, not touched by ChunkLoadErrorHandler | N/A (does not reload the document) |

Everything above is SOURCE-verified from the four files cited in A02-001. The coordinator's C09 contract should collapse this to one row.

## Navigation/return matrix

| Transition | Mechanism today | History entry? | State preserved? |
| --- | --- | --- | --- |
| Bottom-nav / rail tab switch (Home <-> Stats <-> Roster, "lateral") | Next `<Link>` push via App Router | Push (normal Next.js navigation) | **No** -- `dashboard/template.tsx` remounts the destination page's whole tree (A02-004); force-dynamic pages also re-fetch from zero (A02-005) |
| Detail push (e.g. `roster/[id]`, `rounds/[id]/review`) | Next `<Link>` push, classified "reveal" by `isGolfLateralDestination` | Push | Same remount/refetch caveats as above; reveal animation plays (intended) |
| Stage swap within a page (StageRouter `open()`/`home()`) | Raw `history.replaceState` (bypasses App Router) | **Always replace, never push** (A02-003) | Stage view itself fully remounts via `key={activeView.key}` (intentional, for entrance replay) |
| Native platform Back from an open stage drill | Browser/native history Back | N/A -- no entry was pushed for the drill | Leaves the page entirely instead of returning to the stage home (A02-003) |
| Sign out | `router.push('/golf/login')` after `clearActiveTeam()` + `supabase.auth.signOut()` | Push, crosses out of the `(dashboard)` route group | **PASS** -- `/golf/login` lives in a sibling route group (`(auth)`), so the whole `(dashboard)/layout.tsx` provider tree (including FairwayDashboardShell) unmounts via ordinary React unmount; verified no stale provider survives a role logout at the routing level. Deeper realtime-channel teardown ordering NOT_RUN (see NOT_RUN ledger). |
| Scroll position across ordinary navigation | `FairwayDashboardContent`'s popstate-aware scroll-reset effect (`FairwayDashboardShell.tsx:341-374`) | N/A | **PASS** -- resets to top on a real navigation, explicitly preserves browser back/forward scroll restoration and `#hash` anchors; unit-tested per its own comment (`shouldResetScrollOnNavigate`). Not reviewed further; low risk, well-reasoned. |

## Cache/invalidation map

- **Client Router Cache (Next.js built-in):** dynamic segments (`dashboard`, `stats`, `rounds`, and by extension every other `force-dynamic` dashboard route) get the framework default of 0s stale time; no `experimental.staleTimes` override exists in `next.config.mjs`. Effectively **no** navigation-level caching for any dashboard page today (A02-005).
- **Global reload/recovery markers:** three inconsistent sessionStorage keys plus one URL param, mapped in the Recovery decision table above (A02-001).
- **StageRouter:** in-memory `useState` only, reset via `key`-based remount on every swap; the URL search param is the only durable trace, and it is a raw `history.replaceState` write that bypasses `useSearchParams()`'s normal App-Router-driven reactivity (the visible UI stays correct because `open()` calls `setActiveKey` directly, not because `searchParams` reactively updates from a manual `history.replaceState`).
- **NotificationBadgeProvider:** polling-based (no realtime channel found in this file); not deep-audited this pass (see NOT_RUN ledger; A09 owns the notification pipeline itself).
- **OfflineProvider:** mounted around the entire dashboard tree with `showSyncStatus={false} showWarningBanner={false}` (`FairwayDashboardShell.tsx:726`) -- its actual sync engine/local persistence is A05's lease; A02 did not re-audit it here beyond confirming it persists across dashboard navigation (it lives above `dashboard/template.tsx`, so it is NOT torn down by A02-004's remount).

## Draft contract specifications for feature lanes (C02, C04, C09)

These are **proposed field/behavior lists**, adapted to what already exists in this codebase (React state + URL search params + sessionStorage), not a new query framework or state-management library. Coordinator (A00) owns freezing the final shape.

### C02 -- Scoped read (draft)

No shared implementation of this exists today (checked `src/hooks/**`, `src/lib/golf/**` for a generic scoped-read/query hook -- only feature-specific ones like `use-calendar-range-events.ts` partially implement pieces of this). Feature lanes are each rolling their own. Proposed minimum shape, expressed as a hook contract any A04-A09 domain adapter could wrap around its existing `fetch`/server-action call:

```
useScopedRead<T>(params: {
  scopeKey: string;          // derived from team id + filters + date/window + baseline id -- whatever THIS screen's identity is
  fetcher: (signal: AbortSignal) => Promise<T>;
}): {
  data: T | null;            // last COMMITTED result for the CURRENT scopeKey only
  status: 'idle' | 'loading' | 'ready' | 'error';
  freshness: 'fresh' | 'stale-while-revalidating' | 'unknown';
  error: TypedError | null;  // partial-failure-aware, not a bare boolean
  generation: number;        // increments per scopeKey change; late results/errors from a stale generation are dropped, not published
}
```

Required behaviors (from plan §5/§9.1, adapted): (1) an in-flight request for scope A must never publish into scope B once the scopeKey has changed -- compare against the generation captured at request start; (2) when `scopeKey` changes but the previous scope's `data` is still the best available information, callers decide whether to show it (labeled) or a placeholder -- `useScopedRead` itself never silently relabels old data as the new scope's; (3) `AbortController` used where the underlying fetcher supports it (most golf feature reads are Supabase-client calls issued from client components -- verify per-domain abort support, NOT_RUN here); (4) this is a thin hook, not a cache -- pairing it with A02-005's Router-Cache fix (or a small per-route memo) is a SEPARATE decision.

### C04 -- View/return state (draft)

Proposed shape, to sit ABOVE `dashboard/template.tsx` (i.e., in the persisting `FairwayDashboardShell` or a sibling context) so it survives A02-004's per-navigation remount:

```
ViewReturnState = {
  destination: string;          // route key, e.g. "rounds-library"
  entityId?: string;            // selected round/event/player id
  filters?: Record<string, unknown>;
  scrollAnchor?: { kind: 'entity' | 'offset'; value: string | number };
  focusReturnTarget?: string;   // element/selector or id to refocus on return
}
```

Partitioned per `(userId, teamId)` (evict on team switch / logout -- see the sign-out row in the Navigation/return matrix, which already tears the whole provider tree down safely). Bounded: keep the last N destinations' state, not every route ever visited, per plan §3 "bounded view-state caches rather than all heavy routes mounted forever." This does not exist today; StageRouter's URL-param approach is the closest existing analog and should be the pattern reused (URL-encodable state stays in the URL; anything else goes in this small map).

### C09 -- Recovery (draft)

Directly informed by A02-001's decision table above. Proposed consolidation:

```
RecoveryDecision = {
  errorClass: 'chunk-load' | 'stale-server-action' | 'transient-network' | 'generic-load-failure' | 'unknown',
  operationUncertain: boolean,      // was a mutation possibly in flight when this fired?
  attemptLedger: { count: number; windowStart: number },  // ONE ledger, ONE key, survives a successful mount (does NOT reset on hydration)
  unsavedWorkGuard: () => boolean,  // feature lanes (A05 especially) register a check; recovery consults it before ANY document-level reload
  action: 'retry-in-place' | 'narrow-reload' | 'controlled-reload' | 'no-op-log-only',
}
```

The single required behavioral change from today: **one** classifier, **one** ledger that is durable across successful mounts (the opposite of `ChunkLoadErrorHandler`'s current clear-on-hydration behavior), and a mandatory `unsavedWorkGuard()` check before `action` can be `controlled-reload`.

## Contracts requested

- **C02** (scoped read): needed as shared infra before A04/A05/A06/A07 can each stop hand-rolling stale-result/abort handling independently. A02 has drafted the shape above; no existing shared implementation to build on -- greenfield within this lease's boundary (a thin hook, not a new framework).
- **C04** (view/return state): needed to make "Home -> Stats -> drill -> Back restores context" (the plan's own proof requirement) actually true across A02-004's remount boundary. Feature lanes need to know where to read/write this once A00 approves the shape.
- **C09** (recovery): the single highest-leverage ask from this lane -- A02-001 is P0 and touches every route in the app, not just golf. A00 should schedule this as a Wave 1 fix independent of the visual transformation work.

## Shared changes requested

| File | Owning lane (per plan's chokepoint table) | What A02 needs |
| --- | --- | --- |
| `src/components/providers/StaleDeploymentRecoveryScript.tsx`, `ChunkLoadErrorHandler.tsx`, `GlobalErrorHandlerSetup.tsx`, `src/lib/error-logging.ts`, `src/components/errors/RouteErrorBoundary.tsx` | Not explicitly assigned in the plan's chokepoint table (these sit in `src/components/providers`/`src/lib`, not named there) -- A02 claims this as its C09 lease since it owns "recovery handlers" per its own work order's Start-with list, but A00 should confirm since `RouteErrorBoundary` and `error-logging.ts` are consumed app-wide (baseball/admin too), not golf-only. | Consolidate to one classifier + one durable ledger + one unsaved-work-guard hook, per the C09 draft above. |
| `next.config.mjs` (`experimental.staleTimes`) | A00 (package manifests/config, per chokepoint table) | A02-005's fix candidate touches every dynamic route in the app; needs A00 sign-off, not a golf-scoped decision. |
| `src/app/golf/(dashboard)/dashboard/template.tsx` | A02 (route template, per chokepoint table) -- A02 owns this file already. | No cross-lane ask; flagged for the coordinator's Wave 2 scheduling since fixing it changes remount semantics for every feature lane's pages (A04-A09 should confirm no page relies on the current remount-on-navigation for correctness before any change lands). |

## Open questions for the owner

1. Is the current "every dashboard navigation fully remounts the destination page" behavior (A02-004) intentional insurance against stale local UI state, or purely an accidental byproduct of choosing `template.tsx` for the reveal-animation classification? This is a product/architecture call, not something A02 can decide unilaterally.
2. For A02-003 (StageRouter replace-only history): should EVERY StageRouter consumer's drill views become push-based, or only some (e.g., CoachHelm Player Home bento drills feel like "reversible same-level modes," while a Stats spine drill might feel like a genuine "deeper destination")? This needs an explicit per-consumer decision, per G18's original framing.
3. Is `RouteErrorBoundary`/`error-logging.ts`'s reload machinery in scope for this program at all, given it is shared with Baseball/Admin (not golf-only)? If out of scope, A02-001 needs to be handed to A00/a cross-product owner rather than scheduled as a golf-only repair.

## Messaging referrals

- `src/app/golf/(dashboard)/dashboard/messages/loading.tsx` exists and is subject to the SAME shared-shell mechanisms this report documents (A02-004's `template.tsx` remount and, if `messages/page.tsx` is also `force-dynamic`, A02-005's zero-cache-retention pattern -- not individually verified, since messages/page.tsx's own data-fetch boundary is out of this lease). Flagging for the messaging program: any "why does my inbox reload every time I leave and come back" complaint likely traces to this shared shell layer, not to messaging's own code.
- No message-specific defect was found or evaluated in this pass -- A02 did not open the messages feature's own action/query files, per the scope boundary.

## NOT_RUN ledger

| Check | Missing dependency | Next owner |
| --- | --- | --- |
| Actual reload frequency/user-visible repetition for A02-001 in the wild | Real device on a flaky mobile network, or a controlled fault-injection test harness | A12 (adversarial fault matrix, T01/T02) |
| Exact pixel delta for A02-002's icon/label displacement | Mounted browser + `getBoundingClientRect` measurement | A03/A12 (component lab + specimen tests) |
| Whether any dashboard page holds meaningful local-only state destroyed by A02-004 | Per-page source review (each feature lane's own files) | A04 (Home/Rounds), A05 (round setup), A06 (Stats/CoachHelm), A07 (Calendar) |
| Actual navigation-timing cost of A02-004's full remount + A02-005's zero-cache refetch | A11's release-build profiling | A11 |
| VoiceOver/AT experience during any of the four A02-001 reload paths | Device + screen reader | A12 |
| NotificationBadgeProvider / realtime-channel teardown ordering on logout/team-switch | Deeper read of `notification-badge-context.tsx` polling internals and any Supabase realtime channel usage elsewhere in the notification pipeline | A09 (owns notification pipelines) |
| OfflineProvider's own sync-engine reset behavior across the sign-out transition | A05's file lease (sync engine internals) | A05 |
| Whether `use-appearance-preferences` or `usePresence` introduce a client-side auth-adjacent fetch waterfall | Not opened this pass (time-boxed; `(dashboard)/layout.tsx`'s own auth resolution was confirmed server-side/PASS, but these two hooks' own internals were not read) | A02 (follow-up) or A11 |
| Confirm whether `messages/page.tsx` is `force-dynamic` (extends A02-005 to Messages) | Not opened -- messaging scope boundary | Messaging program (referral only, see above) |
| Haptic/keyboard-specific navigation interactions (T15/T16 overlap with A01/A03) | Native device evidence | A01 |

## Coverage ledger

| Route / component / data boundary | Status |
| --- | --- |
| `src/app/layout.tsx` (root layout, all 4 global providers) | FINDING:A02-001 |
| `src/components/providers/StaleDeploymentRecoveryScript.tsx` | FINDING:A02-001 |
| `src/components/providers/ChunkLoadErrorHandler.tsx` | FINDING:A02-001 |
| `src/components/errors/RouteErrorBoundary.tsx` | FINDING:A02-001 |
| `src/lib/error-logging.ts` (`setupGlobalErrorHandlers`, `softReloadForStaleServerAction`) | FINDING:A02-001 |
| `src/components/providers/GlobalErrorHandlerSetup.tsx` | FINDING:A02-007 |
| `src/app/golf/(dashboard)/layout.tsx` (server auth/role/team resolution) | PASS -- SSR-resolved, no client-side auth waterfall; explicitly fixed per its own header comment, verified by reading. |
| `src/app/golf/(dashboard)/FairwayDashboardShell.tsx` | PASS on scroll-reset/Home-End handling (`shouldResetScrollOnNavigate`, unit-tested per comment); PASS on sign-out teardown-via-unmount (confirmed `/golf/login` lives in a sibling route group); memoization hygiene (stable element identities) confirmed well-reasoned throughout. |
| `src/components/fairway/app-shell/AppShell.tsx` | PASS -- `isDesktop`/`isCompactWidth`/`isShortViewport` matchMedia mount-gating and `topBarProps`/`sidebarProps` memoization are documented fixes for prior perf defects (shell-render-hygiene packet), read and confirmed present at this baseline. Full file not re-verified line-by-line beyond lines 1-80 and 275-495. |
| `src/components/fairway/app-shell/FairwayBottomNav.tsx` | FINDING:A02-002 |
| `src/components/fairway/app-shell/NavPending.tsx` | FINDING:A02-002 |
| `src/components/fairway/modules/StageRouter.tsx` | FINDING:A02-003, FINDING:A02-006 |
| `src/app/golf/(dashboard)/dashboard/template.tsx` | FINDING:A02-004 |
| `src/app/golf/(dashboard)/dashboard/page.tsx`, `stats/page.tsx`, `rounds/page.tsx` (`dynamic='force-dynamic'`) | FINDING:A02-005 |
| `next.config.mjs` (`experimental.staleTimes` absence) | FINDING:A02-005 |
| Per-route `loading.tsx` inventory under `dashboard/` (40+ files) | FINDING:A02-005 (representative sample read: `dashboard/loading.tsx`, `stats/loading.tsx`, `rounds/loading.tsx`, `(dashboard)/loading.tsx`; remainder enumerated by `find` but not individually opened -- same mechanism applies by construction, since none override `dynamic`/caching behavior at the layout level). |
| `src/contexts/golf-user-context.tsx` | NOT_RUN:time-boxed, not opened beyond its type import in FairwayDashboardShell |
| `src/contexts/notification-badge-context.tsx` | NOT_RUN:time-boxed -- confirmed no `channel`/`realtime`/`subscribe` keyword hits (polling-based), full logic not read; owned by A09 |
| `src/components/golf/OfflineProvider.tsx` | OUT_OF_SCOPE:A05 -- confirmed it persists across dashboard navigation (mounted above `dashboard/template.tsx`); internals are A05's lease |
| `src/hooks/golf/use-appearance-preferences.ts` | NOT_RUN:time-boxed |
| `src/hooks/use-presence.ts` | NOT_RUN:time-boxed |
| `src/lib/golf/nav-registry.ts` (breadcrumb/rail/bottom-nav derivation) | NOT_RUN:time-boxed -- read only its exported shape via FairwayDashboardShell's usage, not its own file |
| `src/lib/golf/scroll-behavior.ts` (`shouldResetScrollOnNavigate`, `isPageScrollHomeEndTarget`) | PASS -- referenced and described as unit-tested in FairwayDashboardShell's own comments; not independently re-opened this pass |
| `src/lib/motion/route-motion.ts` (`useRouteRevealMotion`) | NOT_RUN:time-boxed -- referenced by `dashboard/template.tsx` but not opened directly; the remount finding (A02-004) does not depend on this file's internals |
| `src/components/fairway/app-shell/MoreNavSheet.tsx`, `FairwayHubSubNav.tsx`, `more-nav.ts` | NOT_RUN:time-boxed |
| Messages route (`dashboard/messages/*`) | OUT_OF_SCOPE:Messaging program -- see Messaging referrals |
| Native shell/keyboard/haptic behavior (T15, T16 overlap) | OUT_OF_SCOPE:A01 |
| Design-token/material application to nav components | OUT_OF_SCOPE:A03 |
| Device-level reproduction of any finding above | NOT_RUN:no device/runtime available this phase (see NOT_RUN ledger) |

### Dead/non-mounted paths

None identified as dead in the files this lane opened -- every component/mechanism read above is imported and mounted by a real, reachable parent (traced via `grep` for each import site, not assumed from a comment).
