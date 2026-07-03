<!-- Generated 2026-06-14 by the golfhelm-vibecoded-audit workflow (35 agents, grounded in the user's craft-research PDFs). Secret VALUES redacted from this committed copy. -->

# GolfHelm Vibe-Coded Craft Audit

## 1. Executive Summary

**Overall read:** GolfHelm is a strong product with a genuinely well-governed foundation — but the foundation has not been swept onto the leaf components, and several "built but unwired" subsystems are quietly leaking value (and one, data). The pattern is consistent across dimensions: an excellent canonical layer exists (documented tokens, a token-conflict regression test, a clean 9-step type scale, canonical Card/Surface/EmptyState/Button primitives, a real sync engine, a real offline UI), and then dozens-to-hundreds of call sites bypass it, parallel duplicate systems coexist, and the "good version" of a feature ships dead beside a hand-rolled one that actually renders. This is the textbook signature of a vibe-coded codebase that grew faster than its own conventions could be enforced.

The product **passes** on the dimensions that protect the user in the moment: Accessibility, Loading states, Microinteractions, Performance, Onboarding, and Layout hierarchy (on the live Fairway surfaces). It **fails** on the system-coherence dimensions: Tokens, Cards, Typography, Color, Motion, Empty states (strict bar), Error states, Content tone, Platform fidelity, State-completeness (offline/sync), and Repo hygiene.

Two findings are genuinely urgent and override everything else: **(1) a live Supabase `service_role` JWT (full RLS bypass, valid to 2036) is hardcoded in 11 committed scripts** alongside a real player password and the anon key — rotate immediately; and **(2) two divergent offline IndexedDB databases mean a round that fails to submit on a flaky connection is stranded and the UI reports "nothing pending"** — silent data loss in the core workflow.

### Top 8 highest-leverage fixes

1. **Rotate the leaked Supabase `service_role` + anon keys and the leaked player password, purge from git history, add a blocking gitleaks rule.** (repo, CRITICAL) — security incident, do this first.
2. **Consolidate the two offline IndexedDB databases (or make the global sync engine + pending-count read the DB the submit-fallback writes to).** (craftsmanship, CRITICAL) — stops silent data loss of submitted rounds.
3. **Run the Wave-1 color/palette codemod:** `emerald-*`/`green-*` → `primary-*`, raw `red-*`/`rose-*`/`#FF3B30` → the destructive token, and revive/replace the dead `helm-amber-*`/`sage-*` classes that currently render with no color. (color + tokens, HIGH) — fixes invisible "High priority" states and the three-different-reds problem in one sweep.
4. **Collapse the type scale to the canonical 9 steps via codemod** (`text-sm`/`text-xs`/`text-[Npx]` → tokens) and add a lint guard banning arbitrary `text-[Npx]`. (typography, HIGH) — the canonical ramp is currently outnumbered ~6:1 by the legacy one it claims to replace.
5. **Pick one card/surface system and one elevation rule; collapse the 6 KPI-tile implementations to 2 and stop hand-copying `surface-matte rounded-3xl` + glow into ~56 files.** (cards, HIGH) — biggest consistency win in the component layer.
6. **Wire (or delete) the dead offline UI:** render a real `OfflineIndicator` in new-round, surface `failedCount`/dead-letter state, and either build or delete the unreachable conflict-resolution engine. (craftsmanship, HIGH) — closes the "looks complete, isn't wired" gaps.
7. **Point `tailwind.config.ts` shadow + duration vocabularies at the CSS tokens** (`var(--shadow-*)`, `var(--duration-*)`) so `shadow-md`/`duration-200` resolve to the canonical warm shadow / token timing instead of a parallel cool/off-scale scale. (tokens + motion, HIGH) — removes two of the largest "second system" sources.
8. **Standardize CTA casing + one error-prefix verb, drop "successfully", and replace native `alert()`/`confirm()` with the app's toast/ConfirmDialog.** (tone + errors, MEDIUM) — mechanical, high-visibility polish that makes the product feel authored rather than assembled.

---

## 2. Scorecard

| # | Dimension | Verdict | Verified Critical/High |
|---|-----------|---------|:----------------------:|
| 1 | Accessibility & correctness | **PASS** | 0 |
| 1 | Color & semantic roles | **FAIL** | 5 high |
| 2 | Loading states | **PASS** | 0 |
| 2 | Empty states | **FAIL** | 0 (1 verified low) |
| 2 | State completeness (offline/sync edges) | **FAIL** | 1 critical, 4 high |
| 2 | Error states | **FAIL** | 0 (3 verified, ≤medium) |
| 3 | Performance & responsiveness | **PASS** | 0 |
| 4 | Visual system / design tokens | **FAIL** | 3 high |
| 4 | Card styles & containment | **FAIL** | 2 high |
| 5 | Typography | **FAIL** | 2 high |
| 5 | Layout & visual hierarchy | **PASS** | 0 |
| 6 | Content tone & microcopy | **FAIL** | 0 (2 verified medium) |
| 7 | Microinteractions & interactive states | **PASS** | 0 |
| 7 | Motion | **FAIL** | 0 (3 verified medium) |
| 7 | Platform fidelity (web/iOS) | **FAIL** | 0 (3 verified medium) |
| 8 | Repo hygiene & AI artifacts | **FAIL** | 2 critical |

**Totals:** 6 PASS / 10 FAIL. Verified critical findings: 2 (both repo/craftsmanship). Verified high findings: 12 (color 5, tokens 3, cards 2, typography 2, craftsmanship 4 — counted per dimension).

---

## 3. Findings (ordered by remediation priority)

### Priority 1 — Accessibility & correctness

**Accessibility: PASS.** GolfHelm has a systematized a11y posture — focus-visible styling (309 hits / 149 files), pervasive live regions, accessible Sonner toasts, a global reduced-motion kill-switch plus 565 `useReducedMotion` sites, 44px default touch targets, an exemplary data-table (`aria-sort` + labeled checkboxes), and `@axe-core/playwright` WCAG AA gating on public routes. Most heuristic "icon-only" flags were false positives. Only one verified finding, plus narrow color/contrast gaps that also surface under Color.

**[MEDIUM] Icon-only buttons missing aria-label in shared/feature components** — `search-bar.tsx` clear button renders only `<IconX size={14}/>` with zero `aria-label` (announces as bare "button"); same in `search-autocomplete.tsx` clear and `PlayerQuickView` close. SearchBar is mounted in three real message modals, so blast radius is real. WCAG 4.1.2 violation; secondary dismissal controls with adjacent labeled affordances, hence medium. Note: the recommended `helm/no-raw-button` lint rule does **not** exist in the repo (no `.eslintrc`); the `IconButton` primitive it points to is real (`button.tsx:143`, labels/title at 174, 44px at 165-166) but unguarded. — `src/components/ui/search-bar.tsx:110`, `src/components/ui/search-autocomplete.tsx:208`, `src/components/baseball/position-planner/PlayerQuickView.tsx:71` — **Fix:** add `aria-label="Clear search"` to the two clear buttons and `aria-label="Close"` to PlayerQuickView; optionally route through `IconButton`. Do not rely on a `helm/no-raw-button` rule for regression coverage — author one if wanted.

*Minor:* sticky-header `scroll-margin` clearance is scoped only to `body.capacitor` so web focus can land under the blurred sticky header (WCAG 2.2 SC 2.4.11) — `src/app/globals.css:248-253`, `src/components/ui/page-header.tsx:438-443`; destructive `#FF3B30` text ~3.7:1 on white fails AA for normal text — `src/components/ui/confirm-dialog.tsx:49,93`, `src/components/ui/row-actions-menu.tsx:93,102`; effectively no RTL support (1 occurrence repo-wide) — `src/components/ui/search-bar.tsx:85-120`.

---

### Priority 2 — State coverage (loading / empty / error / edge)

#### Loading states: PASS
Dense route coverage (109 `loading.tsx`), genuine content-shaped skeletons on Fairway surfaces, empty/error gated strictly after the loading branch, lazy+Suspense on the admin dashboard. Verified gaps are localized polish.

**[MEDIUM] `/courses` route has no `loading.tsx`; `force-dynamic` fetch falls back to mismatched coach-shaped `DashboardSkeleton`** — `courses/page.tsx:18` declares `force-dynamic`, lines 26-30 block on `listCourses` + `Promise.all`; the directory has only `page.tsx`, so the nearest ancestor (`dashboard/loading.tsx`, not the route-group loading the auditor cited) renders the coach-dashboard-shaped `DashboardSkeleton` while `CourseLibraryClient` is a card grid — a skeleton→content layout swap. No PPR in `next.config.mjs`, so the fallback genuinely blocks. Cosmetic/CLS, not functional. — `src/app/golf/(dashboard)/dashboard/courses/page.tsx:18,26-30`, `src/components/ui/skeleton.tsx:1081`, `src/app/golf/(dashboard)/dashboard/loading.tsx:1-5` — **Fix:** add a course-grid-shaped `courses/loading.tsx`.

**[MEDIUM] `/team-hub` async RSC has no `loading.tsx`; six parallel awaited queries fall back to the wrong-shaped `DashboardSkeleton`** — `team-hub/page.tsx` awaits a team lookup then `Promise.all` of six queries (76-110) plus a follow-up tasks await (170-176); only `page.tsx` exists. `FairwayTeamHub` is a tab strip + stacked Surface rows, nothing like the stats-grid skeleton. Manifests only with redesign ON (current prod). Cosmetic/CLS. — `src/app/golf/(dashboard)/dashboard/team-hub/page.tsx:76-110,170-176`, `src/app/golf/(dashboard)/dashboard/loading.tsx:1-5`, `src/components/ui/skeleton.tsx:1081` — **Fix:** add a team-hub-shaped `loading.tsx` and `error.tsx`.

*Minor:* ≥3s AI "Generate Review" uses an indeterminate spinner not determinate progress — `src/components/golf/coachhelm/RoundReviewViewer.tsx:206-210,153,296`; multi-second stats-upload shows a bare spinner — `src/components/baseball/stats/StatsUploadClient.tsx:1172-1180`; `InsightsFeed` skeleton geometry doesn't match the card list — `src/components/golf/coachhelm/insights/InsightsFeed.tsx:125-135`; `ChatWindow` full-height centered spinner — `src/components/messages/ChatWindow.tsx:115-118`; plus document-preview 60vh spinners and a generic `Loading()` helper.

#### Empty states: FAIL (strict 100% bar)
Player/coach surfaces are genuinely strong (canonical `EmptyState`, status + what-belongs + single CTA, full-empty vs filtered-empty branching). The strict bar fails on shared-table defaults, admin BI one-liners, and CRM panels missing the primary action.

**[LOW] Shared `DataTable` default empty state has no action and no "what-belongs" context** — `data-table.tsx:486-491` renders the literal `title="Nothing here yet" description="There's no data to show in this view."` with no icon/action, though `DataTableStateProps` exposes both. Two of three production usages don't override it — but it is effectively **unreachable**: `FairwayCoachDashboard.tsx:495` length-guards the table so it only mounts with rows, and `fairway-preview/page.tsx` is a demo route with hardcoded non-empty data. Design/maintainability gap, not a reachable UX defect. — `src/components/fairway/data-table/data-table.tsx:486-491`, `src/components/fairway/data-table/types.ts:72-82`, `src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx:509` — **Fix:** require a domain `emptyState` prop (or lint) for any `DataTable` that can render zero rows; replace the generic default copy with dev-facing guidance.

*Minor:* ~7 bare "No X data available" one-liners in admin BI — `src/app/golf/admin/components/BusinessIntelligenceTab.tsx:157,638,775,821,963,1299,1559`; user-facing dashboard `TrendChart` bare "No data available" — `src/app/golf/(dashboard)/dashboard/components/TrendChart.tsx:103-108`; `AdminChart` bare "No data" — `AdminChart.tsx:616,171,359`; four CRM panels describe the next step in prose but ship no button — `TasksPanel.tsx:130-139`, `NotesPanel.tsx:106-116`, `CoachTimeline.tsx:73-84`, `AutomationsList.tsx:154-163`; recruiting filtered-empty drops the clear-filter action — `RecruitingPageClient.tsx:248-279`; two parallel EmptyState systems (legacy `ui/empty-state.tsx` uses off-token `text-[17px]` + `emerald-50` gradient).

#### Error states: FAIL
Strong boundary foundation (`app/error.tsx`, `global-error.tsx`, `RouteErrorBoundary` with retry, digests, chunk/stale-deploy detection). Fails at the transactional/toast/form layer where most user errors occur.

**[MEDIUM] All error toasts auto-dismiss in 5s — write/save/delete failures can vanish before the user notices** — the single global `<SonnerToaster>` hardcodes `duration={5000}` (`sonner.tsx:61`) with no per-type override; the `toast.error` branch never injects a longer duration. Cited write-failure call sites all inherit it. Mitigated (close button enabled, error haptics, console-logged) so it is a UX-reliability gap for destructive ops, not data corruption. — `src/components/ui/sonner.tsx:61`, `src/components/player/settings/PrivacySettingsForm.tsx:246`, `src/components/features/player-comparison.tsx:228`, `src/app/golf/(dashboard)/dashboard/development/development-client.tsx:435` — **Fix:** in the toast wrapper default error toasts to `{ duration: 10000 }` (or `Infinity` for destructive failures) unless overridden.

**[MEDIUM] Native browser `alert()` used for delete/save errors in baseball surfaces** — `GamesList.tsx:68` and `ExpenseList.tsx:48` surface delete failures via `alert()` (off-brand, unstyled, untraced); `BoxScoreUpload.tsx:112` uses `alert()` for a validation guard. Blocking dialogs, so no silent-loss risk; consistency/brand defect. — `src/components/baseball/games/GamesList.tsx:68`, `src/components/baseball/travel/ExpenseList.tsx:48`, `src/components/baseball/box-score/BoxScoreUpload.tsx:112` — **Fix:** replace the two delete `alert()` calls with `toast.error` routed through the error logger; replace the BoxScore guard with the inline `setUploadError` pattern already in that file.

**[LOW] Generic "Something went wrong" copy that neither identifies the item nor describes the fault** — `Hero.tsx:30`, `MobileNav.tsx:82,85`, `FairwayGoalCard.tsx:181`, `GoalsSection.tsx:125`, `demo-request.ts:63`. Refined: the landing/demo paths prefer `result.error` and only fall back to the generic string; the goal cards hit it only in the catch. Copy-polish on unexpected-error fallbacks, not discarded errors. — **Fix:** give the catch-block fallbacks item-specific copy (e.g. "Couldn't update your goal — your edits are kept, try again.").

*Minor:* central `sanitizeDbError` used in only ~5 of 77 golf action files — `src/lib/db-error.ts:23`, `roster.ts:97`, `announcements.ts:129`, `courses.ts:295`, `intelligence-dashboard.ts:513`; error toasts firing with no description/recovery — `development-client.tsx:435`, `TeamPeekPanel.tsx:112`, `PlayerPeekPanel.tsx:64`, `player-comparison.tsx:228`, `saved-comparisons-list.tsx:59`; 8 native `confirm()` destructive dialogs instead of `ConfirmDialog` — `GamesList.tsx:62`, baseball `documents-client.tsx:51`, `EventDetailModal.tsx:135`, `TaskCard.tsx:121`, baseball `events/page.tsx:183`; `app/error.tsx` only `console.error`s (no `logError`, so root-boundary failures miss Sentry) — `src/app/error.tsx:16,38`; form errors collapsed into a generic banner not anchored to the field — `player/page.tsx:295`, `activate/page.tsx:80`, `JoinTeamSection.tsx:99,152`.

#### State completeness / craftsmanship (offline/sync edges): FAIL
The core round-tracking journey is well-crafted on its recoverable edges (debounced autosave, IndexedDB fallback, pre-submit snapshots, staleness checks, manual recover). The OFFLINE/SYNC subsystem is the textbook vibe-coded signature: polished engine + complete-looking UI, **not wired**.

**[CRITICAL] Two divergent offline IndexedDB databases — auto-sync never picks up failed-submit rounds (silent data loss)** — `shot-storage.ts:116` uses `golfhelm_offline_v2`; `indexed-db.ts:56` uses `golfhelm_offline` (v1). The new-round failed-submit path writes to **v1** (`new-round-client.tsx:32,508` → `saveOfflineRound`), but the global sync engine reads only **v2** (`sync-engine.ts:18-39,285`), and `OfflineProvider`'s auto-sync-on-reconnect (`OfflineProvider.tsx:172-186`) gates on a `pendingCount` derived from v2 (`offline-sync-store.ts:392-394`). So a failed-submit round is never counted and never auto-drained, while the badge reports zero pending. (continue-round's `useOfflineSync` does read v1, so navigating there would drain it — but the global reconnect path and the badge are blind.) — `src/lib/offline/shot-storage.ts:116`, `src/lib/offline/indexed-db.ts:56`, `src/lib/offline/sync-engine.ts:18-39,285`, `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx:32,508`, `src/stores/offline-sync-store.ts:392-394`, `src/components/golf/OfflineProvider.tsx:172-186` — **Fix:** consolidate onto one offline DB, or make the global sync engine + `updatePendingCount` drain/count the DB that `saveOfflineRound` writes to.

**[HIGH] `OfflineWarningBanner` is a no-op; new-round flow shows NO offline indication despite mounting it twice** — `OfflineWarningBanner.tsx:21-23` is `return null;` (header comment calls it "hard-disabled"), yet `new-round-client.tsx` mounts it at 1785-1791 and 2509-2517 behind live `showOfflineWarning` state; it imports no real `OfflineIndicator`. A player starting/tracking a round offline gets zero feedback. — `src/components/golf/OfflineWarningBanner.tsx:21-23`, `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx:1785-1791,2509-2517,122-123` — **Fix:** render the real `OfflineIndicator` (as continue-round does) or remove the dead mounts + state machine.

**[HIGH] Inconsistent offline coverage between sibling round flows (continue-round live, new-round dead)** — `continue-round-client.tsx:899-913` renders a real `OfflineIndicator` wired to sync state/actions via `useOfflineSync` (which reads the same v1 DB `saveOfflineRound` writes), while new-round shows nothing. Same root as the finding above, framed as parity. — `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx:899-913,25-27`, `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx:33`, `src/hooks/golf/use-offline-sync.ts:33` — **Fix:** standardize both flows on the same indicator + hook + DB.

**[HIGH] Global `OfflineSyncStatus` UI built but never rendered** — the only two `OfflineProvider` mounts both pass `showSyncStatus={false}` (`GolfDashboardShell.tsx:285`, `FairwayDashboardShell.tsx:483`); the component is gated mount (`OfflineProvider.tsx:241-247`, prop defaults true at :91) so it never renders in the shipped app. `new-round-client.tsx:2519` confirms intent ("Floating Sync Status removed — was popping up during normal online use"). No global affordance to see/retry pending or failed syncs. — `src/components/golf/OfflineSyncStatus.tsx:1`, plus the shells above — **Fix:** enable it conditionally (only when `pendingCount.total>0` or `syncError`) or delete it.

**[HIGH] Manual conflict-resolution subsystem fully built but unreachable engine code** — `sync-engine.ts` defines `SyncConflict`, `onConflictDetected` (57), `enableManualConflictResolution` (115), `detectConflict()` (823), `resolveConflict()` (894), `getPendingConflicts()` (977) — and **zero** consumers exist outside the file. Stronger than reported: `detectConflict` is never invoked even internally, `enableManualConflictResolution` is never read, and nothing ever pushes into `pendingConflicts`, so the engine always falls through to `server_wins`. The shipped flow uses an ad-hoc reload-prompt (`new-round-client.tsx:287`). — `src/lib/offline/sync-engine.ts:57,64-89,115,823,894,977` — **Fix:** build the field-by-field UI and wire `detectConflict` into `syncAll`, or delete the dead subsystem and document the reload-prompt as the intentional strategy.

*Minor:* dead-letter items (max retries) never surfaced (`failedCount` read only by unmounted UI) — `src/lib/offline/shot-storage.ts:788`, `src/lib/offline/sync-engine.ts:457,570`; RSVP "pending sync" affordance is dead in golf (`isPending` never passed) — `MobileRSVPButtons.tsx:204`, `MobileEventSheet.tsx:641`, `MobileEventCard.tsx:214`; sync engine reports success while orphaning holes/shots whose parent round never syncs — `sync-engine.ts:526,674,411`; `courses`/`team-hub` missing `loading.tsx`/`error.tsx`.

---

### Priority 3 — Performance

**Performance: PASS.** Documented, enforced discipline: heavy bundles deliberately code-split via `next/dynamic` (recharts BI tab, calendar, TrendChart, ChatWindow); the PostgREST 1000-row cap systematically defeated via `fetchAllRowsResult` + `.range()`; image optimization configured (AVIF/WebP, deviceSizes); global reduced-motion kill-switch; `lighthouserc` with CLS+a11y as hard CI errors. Remaining issues are second-order polish/consistency.

**[MEDIUM] Raw `<img>` avatar/thumbnail tags bypass `next/image`** — 10 raw `<img>` render user-uploaded Supabase avatars/thumbnails with no optimization/AVIF/WebP/responsive sizing; the tell is inconsistency — `roster/page.tsx:429` renders the SAME `avatar_url` through optimized `<Image width={80} height={80}>` while `FairwayPlayerCard.tsx:58` renders it raw. CLS is not at risk (fixed-dimension parents); bandwidth/LCP on avatar-dense screens is. — `src/components/fairway/pages/roster/FairwayPlayerCard.tsx:58`, `FairwayCalendarMemberRail.tsx:117`, `FairwayPlayerProfile.tsx:115`, `FairwayPlayerInsight.tsx:584`, `CommandPalette.tsx:279`, `AnnouncementsCoachView.tsx:200,405`, baseball `MyStatsClient.tsx:131`, `videos/page.tsx:610` — **Fix:** migrate to `next/image`; add a shared `<Avatar>` primitive so the split stops recurring.

**[MEDIUM] Analytics + patterns routes statically import recharts (~100KB gz) — not code-split like the admin BI tab** — `CoachHelmAnalyticsDashboard.tsx:27-29` statically imports three recharts panels and `PatternDashboard.tsx:20` imports `PatternTimeline`; `admin/page.tsx:40` already documents the fix ("Recharts is ~100KB gz … Use next/dynamic"). — **Fix:** wrap the panels in `next/dynamic({ ssr: false })` with a skeleton, matching the established pattern.

*Minor (LOW):* 40+ framer-motion `height:'auto'`/`width:'%'` layout-reflowing animations (mitigated by reduced-motion kill-switch) — `RoundReviewDisplay.tsx:160,691`, `TaskCard.tsx:152`, `NotificationCenter.tsx:344`, `PatternByPlayerView.tsx:142`; heaviest client component (`new-round-client.tsx` 2893 lines + `ShotTrackingComprehensive` 2006) loaded statically — `new-round-client.tsx:5`, `continue-round-client.tsx:5`; 337 `backdrop-blur` instances, concentrated (skeleton.tsx renders 14 during loading) — `skeleton.tsx:1`, `PlayerProfileClient.tsx:1`, `RoundReviewViewer.tsx:1`.

---

### Priority 4 — Tokens / visual-system & component consolidation

#### Visual system / design tokens: FAIL
Excellent governance (documented `tokens.css` single source of truth, 4-tier radius/shadow, 9-step type, a token-conflict regression test) — but the consumer-side sweep was never finished, and a second token-unbacked vocabulary ships in `tailwind.config.ts`.

**[HIGH] ~189 off-scale `text-[Npx]` font sizes bypass the 9-step type scale the config was built to enforce** — `grep` confirms exactly 189 in `src/components`; `text-[17px]×40`, `[13px]×38`, `[11px]×22`, `[15px]×17` map exactly onto `body-lg/body-sm/eyebrow/body` tokens. No ESLint guard exists. — `tailwind.config.ts:250` (config's own anti-pattern comment), `src/components/ui/confirm-dialog.tsx:86,87,93`, `src/components/ui/tabs.tsx:95`, `src/components/ui/page-header.tsx:120`, `src/components/ui/empty-state.tsx:294` — **Fix:** codemod px-exact escapes onto tokens; leave genuine hero sizes; add a lint rule banning `text-[Npx]`.

**[HIGH] Parallel, token-unbacked shadow vocabulary in `tailwind.config.ts` coexists with the canonical 4-tier `--shadow-*` scale** — the strongest structural finding: `boxShadow` (363-410+) defines ~20 utilities entirely in cool `rgba(0,0,0)` (`sm/md/lg`, `glass*`, `card*`, `elevation-*`) with **zero** `var(--shadow…)` references, while `tokens.css:216` defines warm three-layer `hsl(42°)` shadows. So `shadow-md` in JSX is a cool single-layer shadow that does NOT match `--shadow-md`. Two divergent elevation grammars. — `tailwind.config.ts:363,367,369,377,385,402`, `src/styles/tokens.css:216` — **Fix:** point `boxShadow.{sm,md,lg}` at `var(--shadow-sm/md/lg)`; collapse `glass*/card*/elevation-*` to the 4 canonical tiers.

**[HIGH] 204 `emerald-*` + 23 `green-[0-9]` legacy-palette references that should be on the canonical `primary-*` scale** — confirmed across 45 files; `tokens.css:26` documents the intended-but-unfinished Wave-1 sweep. `emerald-500 (#10b981)` is visibly different from `primary-600 (#16A34A)`, so two greens render adjacently. No lint guard. — `src/components/ui/empty-state.tsx:270`, `src/components/ui/avatar.tsx:30`, `src/components/ui/badge.tsx:170`, `src/components/golf/coachhelm/v3/GoalCard/index.tsx:44`, `src/components/golf/dashboard/performance-radar.tsx:73`, `src/styles/tokens.css:26` — **Fix:** codemod `emerald-{50..900}`→`primary-{50..900}` and `green-N`→`primary-N`; spot-check ~12 chart/data-viz files where a distinct accent green may be deliberate; add a lint ban.

**[MEDIUM] Semantic status colors hardcoded as raw hex in shared primitives instead of `--color-destructive`/`--color-warning`** — `confirm-dialog.tsx:49/51/55/56/93` (`#FF3B30`/`#FF9500` pairs) and `row-actions-menu.tsx:93/102`. `tailwind.config.ts` already defines `destructive`/`warning`/`danger` utilities (138/136/137) so `text-destructive` etc. exist today — but those aliases are themselves hardcoded hex, not bound to `var(--color-destructive)`. Confined to 2 shared files. — `src/components/ui/confirm-dialog.tsx:49,51,55,56,93`, `src/components/ui/row-actions-menu.tsx:93,102`, `src/styles/tokens.css:77` — **Fix:** swap to the existing utilities; add `--color-destructive-hover`/`--color-warning-hover` for the `#E0352B`/`#E08600` shades; bind the tailwind color entries to the CSS vars.

**[MEDIUM] ~90 inline `shadow-[...]` recipes across components, several re-typing canonical token values** — `grep` confirms 90; `tabs.tsx:97` is a hand-rolled near-clone of `--shadow-sm` (same warm 42° hue, different alpha/blur) and `CommandPalette.tsx:205` duplicates a cool overlay shadow. The bulk (status-pill's 10 per-tone glows) are intentional brand glows no single token expresses. — `src/components/ui/status-pill.tsx:81,82,89`, `src/components/ui/tabs.tsx:97`, `src/components/CommandPalette.tsx:205` — **Fix:** replace `tabs.tsx:97`→`shadow-sm` and `CommandPalette.tsx:205`→`shadow-lg` (once tokens wired); add one parameterized `--shadow-glow` token or accept the brand glows; lint `shadow-[...]` with an allowlist.

*Minor:* status-pill amber/rose/blue/violet/teal raw palettes diverge from semantic tokens — `status-pill.tsx:69,76,82,89`; 15 arbitrary `rounded-[Npx]` tiers, 29 of them `rounded-[10px]` (= `--radius-md`), even the canonical Button uses it — `button.tsx:53,148`; `HelmSplashAnimation` hardcodes a whole off-token color scene — `HelmSplashAnimation.tsx:76,110,131,174`; 19 `bg-[#…]` hardcodes / 68 files with raw hex; inline-glass anti-pattern hand-rolled in 19 files; **two design systems coexist** (legacy `tokens.css --color-*` vs Fairway `design-tokens.css --fw-*` oklch), both loaded at `layout.tsx:11`; glow keyframes hardcode rgba (`tailwind.config.ts:554,619`); `CLAUDE.md` Design System guidance is stale and encodes off-token values as canonical.

#### Card styles & containment: FAIL
A good canonical `Card` (4 variants + StatCard) and a newer `Surface` family both exist — but elevation/role logic is ad hoc per call site.

**[HIGH] Single-KPI tile role implemented 6 different ways** — `StatCard` (ui/card.tsx:253), `features/stat-card.tsx:16` (wraps `<Card padding=none>` then re-adds `p-6` + `AnimatedNumber`; 6 importers), `shared-primitives.tsx:242` (`useAnimatedNumber` + sparkline), `PremiumStatCard` (`premium-components.tsx:98`, inline `surface-matte rounded-3xl`), `MetricCard` (`NumberFlow` + DeltaChip), `StatTile` (Inset-based, owns the insufficient-data honesty swap). Each ships its own padding, icon-wrapper size, trend coloring, and animation lib. — locations above — **Fix:** collapse to two documented tiles — `MetricCard` (everyday KPI) and `StatTile` (dense + insufficient-data honesty); codemod the rest away.

**[HIGH] Raised-card recipe hand-copied into ~56 files instead of `<Card variant="raised">`** — `card.tsx:152` defines the canonical raised surface (`surface-matte rounded-3xl` + glow at :165); 56 files paste `surface-matte rounded-3xl` directly and only 1 imports `ui/card`. `team-pulse-card.tsx:31` re-pastes the recipe AND duplicates the exact `radial-gradient(closest-side, rgba(22,163,74,0.10)…)` glow div (35-39). Correction: `PremiumStatCard` copies the recipe but uses an accent left-border, not the glow div; the verbatim glow literal is duplicated in `card.tsx`, `team-pulse-card.tsx`, `CoachDashboard.tsx`, `PlayerDashboard.tsx`. — `src/components/ui/card.tsx:152,165`, `src/components/golf/dashboard/team-pulse-card.tsx:31,35-39`, `premium-components.tsx:121`, `CategoryCard.tsx:69,84`, `TaskCard.tsx:74` — **Fix:** use `<Card variant="raised" glow>` (or Surface `elevation="shadow"`); codemod the glow duplication into the component; ast-grep-ban the literal outside `card.tsx`.

**[MEDIUM] Three card/surface systems coexist; cards have no single named-role taxonomy** — `ui/card.tsx` (87 importers) + `surface.tsx` Surface/Inset/Elevated + the inline-glass anti-pattern verbatim at `page-header.tsx:701`, `StandingBar/Card.tsx:66`, `GoalCard/index.tsx:104`, `Hero.tsx:52`. Correction: the Surface family is imported by only ~22 files (its own header says "imported by nothing existing"), not 95 — the 95 figure is the broad inline-glass count, so it's really one shipped system + a barely-adopted additive family + lingering inline glass. `DESIGN-SYSTEM.md:160-170` labels three radii all generically as "cards". — locations above — **Fix:** pick ONE canonical family; author a card-roles doc (summary/content/setting/selection/alert); lint-ban new inline glass; burn down the 12 exact-literal sites first.

*Minor:* StandingBar card rendered at three radii (`rounded-xl/2xl/3xl`) for one concept — `Inline.tsx:58`, `Card.tsx:66`, `Hero.tsx:52`, `GoalCard/index.tsx:84`; `GlassSurface` defined twice (`surfaces/glass-surface.tsx:1` vs `command/glass-surface.tsx:1`, the latter duplicated to avoid a merge collision); `InsightCard` implemented four times; Card vs Surface enforce contradictory elevation rules (border-AND-shadow vs border-XOR-shadow) — `card.tsx:124,185`, `surface.tsx:92`; PlinthHeader hand-rolls glass inside a core primitive — `page-header.tsx:701`; CardHeader/Content/Footer hardcode `px-8/p-8` decoupled from Card's `padding` prop — `card.tsx:302,310,318`.

---

### Priority 5 — Typography / color / cards / hierarchy

#### Typography: FAIL
A clean canonical 9-step scale is documented — and then bypassed by four overlapping ramps, sub-11px chrome, and 262 arbitrary overrides.

**[HIGH] Four overlapping type ramps → ~30+ named size roles in active use** — `tailwind.config.ts` ships the canonical 9-step, a full iOS Apple-HIG ramp (~11 names), the legacy `xs–7xl` ramp, and `micro/label/2xs/display-sm/md/lg/xl`; the "CANONICAL 9-STEP" comment claims it "Replaces ~24 ad-hoc fontSize tokens" while leaving all three other ramps in place. 30 distinct named text-size utilities are actually consumed. — `tailwind.config.ts:246-305`, `src/styles/tokens.css:109-164` — **Fix:** delete/alias the iOS + legacy ramps onto canonical steps; add a regression guard mirroring `token-files-no-conflict.test.mjs`.

**[HIGH] Canonical scale bypassed — the two most-used size classes are legacy** — recounted: `text-sm` = 3,364 and `text-xs` = 2,819 (the #1/#2 most-used), vs canonical `text-body-sm` = 477, `text-caption` ≈ 390, `text-body` = 164, `text-body-lg` = 187. Legacy big sizes also dominate canonical headings (`text-lg`=396, `text-2xl`=234 vs `text-h3`=128, `text-h2`=61). The ramp the config claims to replace is used ~6:1 more. — `tailwind.config.ts:285-298` — **Fix:** codemod `text-xs`→`text-caption`/`body-sm`, `text-sm`→`body-sm`, `text-base`→`body`, `text-lg`→`h3`, `text-2xl`→`h2`, `text-3xl/4xl`→`h1/display` by context; remove the legacy ramp; then lock a lint guard.

**[MEDIUM] Sub-11px text on real UI chrome (nav, labels, badges) — below the ~11px mobile floor** — confirmed real chrome, not just chart axes: `GolfSidebar.tsx:300` nav section header `text-[10.5px]`, `PlayerHub.tsx:310` trip labels `text-[10.5px]`, `dropdown-menu.tsx:102` `text-[10.5px]`, `GenomeDimensionGrid.tsx:43`/`GenomeComparePicker.tsx:100` `text-[10px]`, `FairwayCalendarMemberRail.tsx:124` badge `text-[9px]`, `MissPatternChart.tsx:265` `text-[9px]`. Downgraded to medium: worst offenders (`9px`) are non-interactive decorative; the `10.5px` labels are uppercase eyebrow secondary text, a half-pixel miss. — **Fix:** raise interactive/label text to ≥11px (`text-eyebrow`/`text-caption`); reserve `text-micro` (10px) for chart annotations.

**[MEDIUM] 262 arbitrary `text-[Npx]` overrides across 66 files bypass the scale; most exactly re-spell a token** — `text-[17px]×40`(=body-lg), `[13px]×38`(=body-sm), `[11px]×23`(=eyebrow), `[15px]×17`(=body), plus off-grid half-pixels (`12.5px×12`, `10.5px×10`, `13.5px×6`, `11.5px×6`) that match no token, and rem/em oddities. The config comment claims these were "replaced"; they remain. Maintainability/scale-drift, no breakage. — `tailwind.config.ts:250-251`, `src/components/fairway/pages/rounds-tracking/FairwayShotEntry.tsx:255`, `src/components/golf/stats/sections/DispersionStats.tsx:132` — **Fix:** codemod the 1:1 duplicates; snap half-pixel/em sizes to the nearest step; correct the misleading comment; add a lint ban.

*Minor:* `font-light` (105 uses) applied at h2/h3 heading sizes, inverting weight contrast — `player-insight-client.tsx:540`, `FairwayPlayerInsight.tsx:811`, `PipelineStats.tsx:167`; thin weight stacked with low-opacity color at small size — `GolfSidebar.tsx:300`, `PlayerHub.tsx:310`, `GenomeComparePicker.tsx:100`; off-grid half-pixel sizes — `dropdown-menu.tsx:102`, `FairwayShotEntry.tsx:255`; no `-webkit-text-size-adjust` guard + `!important` px root font-size blocks OS text-zoom — `globals.css:124,2602`, `tokens.css:114-160`.

#### Color & semantic roles: FAIL
Well-governed token layer; the "one semantic = one color" contract is broken in practice because consumers were never swept onto it. This is the systemic root the per-finding inconsistencies flow from.

**[HIGH] The "destructive/error" semantic resolves to multiple different reds across components** — token is `#FF3B30`, but `badge.tsx:147,174-175` maps `destructive`→Tailwind `red`, `status-dot.tsx:16` error=`red-500`, `status-pill.tsx:76,89` `danger`→`rose-*`, `confirm-dialog.tsx:51`/`row-actions-menu.tsx:93` hardcode `#FF3B30`, `badge.tsx:403` inline `#FF3B30` — at least four distinct hues, several inside `ui/`. Cosmetic divergence, hence high not critical. — locations above. **Fix:** map every destructive surface to the destructive token; collapse badge's `rose`/`red` split.

**[HIGH] Deleted `helm-amber-*`/`helm-green-*` scales still referenced by live class strings → render with no color** — `grep` proves no `helm-amber` color is defined anywhere (only the W0 deletion comment at `tailwind.config.ts:80`); Tailwind emits nothing for an undefined utility, so the "High" announcement urgency tier, tournament event chips, and Round Review caution icons inherit color instead of rendering amber. The deleted `sage-*` scale has the same problem (`EventChip:28`, `page-header:99`). — `NewAnnouncementsModal.tsx:47-50`, `EventChip.tsx:29`, `page-header.tsx:100`, `AreasToReviewSection.tsx:29-33,53` — **Fix:** map dead `helm-amber-*`/`sage-*` onto the warning/primary tokens.

**[HIGH] Severity colors for the same scale change hue by screen (red vs rose vs orange vs dead-amber)** — no shared severity→color map: `AreasToReviewSection:59-61` high=`red`, `PatternCard:50-78` high=ORANGE/critical=red, `NewAnnouncementsModal:31-60` high=invisible `helm-amber`, `status-dot:14-18` warning=amber. — locations above — **Fix:** extract one shared severity→token map.

**[HIGH] Hardcoded hex semantic colors in canonical `ui/` primitives bypass tokens (and diverge the warning hue)** — `confirm-dialog.tsx` hardcodes destructive AND warning; its warning variant uses `#FF9500` (iOS orange) while `tokens.css:78 --color-warning = #F59E0B` (amber) — a visibly different warning color. — `confirm-dialog.tsx:49,51,55-56,93`, `row-actions-menu.tsx:93,102` — **Fix:** swap to the destructive/warning tokens; add hover-shade tokens.

**[HIGH] Raw Tailwind `red-*`/`orange-*`/`yellow-*` used for semantic states across the tree (off-token)** — the token layer defines no `red`/`orange` semantic, so any raw use is off-token by definition; ~1997 occurrences across 211 files (auditor's 683/25 was a significant undercount, strengthening the finding). — `PatternCard.tsx:98,65-68,71-75`, `AreasToReviewSection.tsx:26-28`, `status-dot.tsx:16` — **Fix:** route semantic states through the destructive/warning/success/info tokens.

*Minor:* `emerald-*` (204) + raw `green-*` (23) instead of brand primary; `dark:` configured (`darkMode:"class"`) but unimplemented (2 files, no `.dark{}` token set); 235 gradients used as hierarchy with no `--gradient-*` tokens; saturated non-brand hues (purple/cyan/pink/indigo) in CoachHelm chrome — `PatternCard.tsx:107,113`; status-pill 10 inline colored-glow shadows; `HelmSplashAnimation` scene hex; low-alpha white text over photographic surfaces — `RoundSubmitOverlay.tsx:200`, `ShotTrackingComprehensive.tsx:1374-1376`.

#### Layout & visual hierarchy: PASS
The live (flag-on Fairway) surfaces are an unusually strong example of disciplined hierarchy: exactly one masthead (single `h1` via `ViewHeader`), one glass hero carrying the top signal, one primary action, explicit FOCAL/SECONDARY/DEMOTED comments, and honest insufficient-data over fake-zero card soup. All verified findings are confined to the **legacy** dashboards the redesign replaced (still compiled, render only when `NEXT_PUBLIC_REDESIGN` is unset), hence all medium/low.

*Verified (all legacy/medium-low):* legacy `CoachDashboard` double-h1 / competing mastheads — `CoachDashboard.tsx:290-291,340-358`; no single primary action (quick actions buried at page bottom) — `:524-547`; legacy `PlayerDashboard` flat "card soup" of 8+ equal-weight regions — `PlayerDashboard.tsx:322-471`; duplicate full-width primary CTA — `:474-487`; empty-state hero stacks 4 headline tiers — `:173-174,244-252`; the one live surface that flirts with density overload, `FairwayStatsCockpit` (2309 lines, 7 inner tabs) — still passes because detail is gated behind tabs — `FairwayStatsCockpit.tsx:531-703,1239-1295`.

---

### Priority 6 — Content tone & microcopy

**Content tone: FAIL.** Long-form microcopy is genuinely on-voice (warm second-person "X appears here once you…" across 30+ surfaces). The failure is at the atomic-string layer with no enforced label/casing/voice convention.

**[MEDIUM] CTA capitalization inconsistent across parallel surfaces (Title Case vs sentence case)** — `FairwayTasks` "Create task" (176,211) vs structurally identical `FairwayQualifiers` "Create Qualifier" (116,172); strongest: `FairwayPlayerDashboard:254` "New Round" and `FairwayRoundsLibrary:281` "New round" are the SAME button to the SAME destination with opposite casing; "Add Player" vs "Add itinerary"/"Add a course". No shared CTA-label constant. Cosmetic, pervasive. — locations above — **Fix:** adopt sentence case; extract the duplicate-destination round CTA into one shared constant.

**[MEDIUM] Error-message prefix vocabulary fractured four+ ways** — scoped grep: 192 "Failed to", 51 "Could not", 34 "Couldn't", 9 "Something went wrong", 6 "Unable to". `FairwayWhatsNew:154-155` even has "Unable to load activity" directly above a "Failed to load activity" fallback in the same component. — `FairwayMessages.tsx:182`, `FairwayCreateTaskModal.tsx:156`, `FairwayWhatsNew.tsx:154,155`, `FairwayCalendar.tsx:927`, `FairwayIntentControl.tsx:288` — **Fix:** pick one user-facing failure verb ("Couldn't <verb> <object>"); reserve "Failed to" for logs; centralize common strings.

*Minor:* same contraction with both straight and curly apostrophes (`FairwayRecoverRound.tsx:459` vs `FairwayCreateTaskModal.tsx:156`); toasts mix redundant "successfully!" filler with terse confirmations — `player-comparison.tsx:224,304`, `PrivacySettingsForm.tsx:242`, `saved-comparisons-list.tsx:55`; `EmptyState` title misused as a gating-error label "Players only" — `FairwayMyQualifiers.tsx:116`; over-explained/inconsistent troubleshooting prose; single-word ambiguous CTAs ("Setup", "Export", "Delete?") — `FairwayTravel.tsx:301`, `FairwayQualifiers.tsx:116`.

---

### Priority 7 — Motion / microinteractions / platform

#### Microinteractions & interactive states: PASS
The interactive-state system is strong and systematic: Button ships hover/active-scale/focus-visible/disabled/loading + ripple + haptics; Input/Textarea/Tabs/Toast cover full state matrices; double-submit is well-guarded across the app (loading/saving/busy gating, per-row disable, a queued-save state machine); data-table row click adds `role="button"`+`tabIndex`+`onKeyDown`. Verified findings are narrow keyboard-affordance gaps.

*Verified (medium-low):* canonical interactive `Card` declares a focus-visible ring but renders a bare `<div>` with no `tabIndex`/`role`/`onKeyDown`, so its "operable without a mouse" comment is false unless every consumer wires it (they don't) — `card.tsx:117,128`, `college-card.tsx:60`, baseball `settings/page.tsx:121`; recruiting `PlayerCard` bare clickable `<div>`s — `PlayerCard.tsx:212,313`; documents privacy toggle is a faux-checkbox div with no ARIA/keyboard — `documents-client.tsx:1121,1127`; admin tracer expander row clickable div without `aria-expanded` — `DataQualityIssueRow.tsx:43`; `ButtonGroupOption` selected state visual-only (no `aria-pressed`) — `button.tsx:204,211`; glass Input variant has no hover state — `input.tsx:123`.

#### Motion: FAIL
Reduced-motion is genuinely strong (global kill-switch, scoped scene kills, guards, reduced variants) so it would NOT fail on accessibility. It fails the "small reusable motion-token set, ~80%+ adoption" criterion: six coexisting duration scales and ~10 easing curves.

**[MEDIUM] ~370 hand-typed framer-motion durations across 24 distinct values bypass the motion-token set** — recounted 372 literals across 24 values; only 75 transitions reference a CSS motion var; the canonical `DURATION` set (`motion.ts:49-54`) exists but consumers invent ad-hoc values. A large share is the legitimate reduced-motion `{ duration: 0 }` idiom (part of why this is medium not high). — `HelmSplashAnimation.tsx`, `V2ReviewSummary.tsx`, `RoundReviewViewer.tsx`, `ShotTypeBreakdown.tsx`, `src/lib/coachhelm/v3/motion.ts:49-54` — **Fix:** adopt `DURATION`/`EASE` as the only allowed source; lint-ban numeric `duration:` literals (except `0`).

**[MEDIUM] Six parallel, non-reconciled duration scales coexist** — `tokens.css:252-256` (100/150/250/400/600), `design-tokens.css:146-149` (180/280/380/520), `tailwind.config.ts:642-655` (200/300/…), `motion.ts:49-54` (120/280/440/680), `motion.ts:345-352` legacy (150/220/320/500), `ios-animations.ts:31-47` (150/250/350/500). "short" is 150 vs 280 vs 180 across scales. Documented/intentional coexistence ("Both can coexist" at `motion.ts:13`), so medium. — **Fix:** pick one canonical scale (`tokens.css`) and re-derive the rest; add a duration token-conflict test.

**[MEDIUM] Tailwind `transitionDuration` config is not token-backed; ~738 raw `duration-NNN` classes resolve off-scale** — `tailwind.config.ts:642-655` hardcodes durations with zero `var(--duration-*)`/`theme()` references; the most-used `duration-200` (371×) aligns with no CSS token (scale is 100/150/250/400/600). — `tailwind.config.ts:642-655`, `tokens.css:252-256` — **Fix:** resolve `transitionDuration` to the CSS tokens, then sweep the classes onto the canonical tiers.

*Minor:* `transition-all` on 566 elements (CLAUDE.md documents it as the standard); ~10 easing curves, six byte-identical aliases of `cubic-bezier(0.16,1,0.3,1)`; 78 spring configs with 10 stiffness values; inline `@keyframes` scattered across 8 components; 40+ global `@keyframes` with redundant fade/slide variants; dead `ios-animations.ts` (0 import sites) referenced as a spec source; `AnimatedNumber` mount-roll not gated on reduced motion; even `motion.ts` mixes its tokens with raw literals.

#### Platform fidelity (web/iOS via Capacitor): FAIL
The same single-breakpoint hamburger-drawer nav serves desktop web, mobile web, AND native iOS — no native tab bar, no iPad treatment, no nav that branches on `isNativePlatform()`. Credit: safe-area-inset, `contentInset:'never'`, and haptics are wired thoughtfully, so chrome respects the notch even though the nav paradigm is generic stretched-mobile-web. (Findings #1–#3 below are the same root cause from three angles and should be deduped on remediation.)

**[MEDIUM] iOS native app has no tab bar and no native navigation — primary nav is a hamburger drawer, identical to web** — one `md:hidden` IconMenu opens a slide-in drawer; `GolfDashboardShell.tsx:237-241` documents "Mobile Bottom Navigation removed May 2026 — replaced by the hamburger". `GolfTabBar` is an in-page segmented control, not nav chrome. Functional and a11y-complete; a HIG-conformance gap, not a defect. — `capacitor.config.ts:3-25`, `FairwayTopBar.tsx:147-160`, `AppShell.tsx:280-320`, `GolfDashboardShell.tsx:160-199,237-241` — **Fix:** render a true bottom tab bar of 4-5 destinations gated on `isNativeApp()`/`Capacitor.getPlatform()==='ios'`; reserve the hamburger for overflow.

**[MEDIUM] `isNativeApp()` never used to differentiate navigation** — consumed in ~14 files (haptics, push, status bar, redirects) but ZERO in the nav/shell render trees; no `getPlatform()==='ios'` fork exists anywhere; both shells choose nav purely via CSS `md:` breakpoints. — `src/lib/utils/capacitor.ts:17-20`, `settings/page.tsx:227`, `FairwayDashboardShell.tsx:424-454`, `AppShell.tsx:262-372` — **Fix:** introduce a platform context at the shell boundary and fork nav chrome on it.

**[MEDIUM] 14 top-level destinations (coach) funnelled through one hamburger drawer on mobile/iOS** — coach = 7 primary + 7 secondary = 14; player = 7 + 3 = 10 (not 14). On mobile every destination is reachable only via the drawer, with no persistent primary touch affordance. The IA tier comment at `GolfSidebar.tsx:47-54` already names a daily-vs-operational split. — `GolfSidebar.tsx:47-103`, `FairwayDashboardShell.tsx:96-162` — **Fix:** collapse to 4-5 tab-bar destinations + a "More" tier.

*Minor:* two complete nav shells duplicate the same single-breakpoint hamburger model (`layout.tsx`, `GolfDashboardShell`, `FairwayDashboardShell`, `AppShell`); single `md` (768px) breakpoint with no iPad treatment + forced `preferredContentMode:'mobile'`; orphaned `MobileBottomNav` (golf removed it, baseball still uses it) + stale `--golf-mobile-bottom-nav-offset` var; `GolfTabBar` renders tabs as `<Button variant="primary" role="tab">` (wrong primitive) — `GolfTabBar.tsx:89-114`; ⌘K command palette shipped to touch with a synthetic-event workaround + visible kbd hint — `FairwayDashboardShell.tsx:369-374`, `FairwayTopBar.tsx:170-197`.

---

### Priority 8 — Repo hygiene & AI artifacts

**Repo hygiene: FAIL.** Headline is a hard secret leak; also classic vibe-coded artifacts (tracked swap file, FUSE droppings, duplicated skills tree, ~110 agent-scratch `.claude/` files) and add-copy-tweak component duplication. Credit: `AGENTS.md`/`CLAUDE.md` are well-scoped, TODO/FIXME density is near-zero, naming is consistent.

**[CRITICAL] Live Supabase `service_role` JWT hardcoded in 11 committed scripts (bypasses all RLS)** — identical plaintext JWT in all 11 files; decoded payload `{"role":"service_role","ref":"qmnssrrolpinvwjjnufo","exp":2083902840}` (valid to 2036), `ref` matches the real project URL embedded alongside it; `.env.example:16` correctly uses a placeholder, so these are the live key, not a template. `check-rls.ts:67`/`diagnose-rls.ts:4` also embed the anon key plus a real player email/password. `.gitleaks.toml` has no rule matching the JWT pattern. — `scripts/check-rls.ts:5`, `db-health-check.ts:3`, `diagnose-rls.ts:3`, `check-policies.ts:5`, `list-orphan-players.ts:3`, `run-sql.mjs:4`, `fix-auth.mjs:10`, `import-via-api.mjs:4`, `debug-player-insert.mjs:9`, `seed-baseball-roster.mjs:4`, `seed-baseball-stats.mjs:4` — **Fix:** ROTATE the `service_role` + anon keys and the leaked player password immediately (assume compromised); replace literals with `process.env` reads; purge from history (git filter-repo/BFG); add the Supabase JWT regex as a BLOCKING gitleaks rule.

**[CRITICAL] Same `service_role` JWT is in runnable seed/import/raw-SQL-exec tooling** — `run-sql.mjs:23-31` POSTs arbitrary SQL to `/rest/v1/rpc/sql` with `Bearer <serviceRoleKey>`; `import-via-api.mjs:102-110` batch-inserts to prod; the seed scripts build service-role clients. (This is the same leak as the finding above, viewed as the auth path the scripts execute against prod — merge on remediation; the audit doc at `AUTHENTICATION_SYSTEM_AUDIT.md:1753-1754` only prints truncated placeholders, not full tokens.) — locations above — **Fix:** same rotation; gate `run-sql.mjs`/`fix-auth.mjs` behind required env with no embedded fallback + an explicit confirm flag, or move one-off DB-exec scripts out of the committed tree.

**[MEDIUM] Add-copy-tweak duplication: ~30 hand-rolled StatCard/MetricCard/StatTile tiles; analytics `StatCardLarge` byte-identical ×3** — `card.tsx:253` exports a canonical `StatCard`; 30 files redeclare local StatCard/MetricCard/StatTile; the three `StatCardLarge` bodies (`PatternImpactPanel:306`, `InsightEffectivenessPanel:288`, `PredictionAccuracyPanel:475`) are brace-for-brace identical. Maintainability, no runtime impact. — locations above — **Fix:** extract one StatCard + one StatCardLarge with a `tone` prop; delete the copies.

**[MEDIUM] `GlassSurface` defined twice with the same export name** — `surfaces/glass-surface.tsx:103` (CSS-module) and `command/glass-surface.tsx:110` (inline `<style>`) both export `GlassSurface` + `GlassSurfaceProps`; an import-the-wrong-one footgun. — **Fix:** consolidate to `surfaces/`, migrate command-palette usage, delete the command copy (or rename it `CommandGlassPanel`).

**[LOW] Vim swap file `.CLAUDE.md.swp` committed** — `file` confirms it's a Vim swap file (leaks username + hostname); `.gitignore` has no `*.swp` pattern. — `.CLAUDE.md.swp` — **Fix:** `git rm --cached` + add `*.swp`/`*.swo`/`.*.sw?` to `.gitignore`.

*Minor:* FUSE artifacts (`.fuse_hidden*` ×4) and `.DS_Store` committed; duplicated/mis-nested `.skills/skills/` mirror of `.claude/skills/`; ~110 agent-scratch reports under `.claude/` (`AGENT_TASKS_REMAINING.md`, `*_REPORT.md`, `*_SCAN.md`, `run_audit.py`); `InsightCard` forked four ways (v2/v3/fairway/legacy); 29 `console.log` despite the CLAUDE.md ban — `use-service-worker.ts:118…`, `error-logging.ts:231`; `tools/.gitignore` + vendored `package-lock.json` inside the skills tree.

---

## 4. Quick wins (low-effort / high-impact)

1. **`git rm --cached .CLAUDE.md.swp` + the four `.fuse_hidden*` + `.DS_Store`; add `*.swp`/`.fuse_hidden*`/`.DS_Store` to `.gitignore`.** Minutes; removes committed junk.
2. **Add a blocking gitleaks rule for the Supabase JWT regex.** Prevents re-introduction once rotation is done.
3. **Swap `confirm-dialog.tsx`/`row-actions-menu.tsx` `#FF3B30`/`#FF9500` literals for the existing `text-destructive`/`text-warning` utilities.** Fixes the AA contrast finding and the token-bypass finding in two files.
4. **Map dead `helm-amber-*`/`sage-*` classes to the warning/primary tokens** in the 6 golf call sites — instantly restores the invisible "High priority" / tournament / caution colors.
5. **Drop "successfully" from the four confirmation toasts and normalize them to the terse Fairway pattern.** Pure string edits.
6. **Render the real `OfflineIndicator` in new-round (or delete the two no-op `OfflineWarningBanner` mounts + `showOfflineWarning` state).** Removes a dead component behind live state.
7. **Replace the two delete-flow `alert()` calls with `toast.error`.** Two-line change, on-brand error path.
8. **Default error toasts to `{ duration: 10000 }` in the Sonner wrapper.** One change in `sonner.tsx`, fixes the 5s-dismiss reliability gap app-wide.
9. **Add `aria-label` to the two search clear buttons + PlayerQuickView close.** Three attributes, fixes the verified WCAG 4.1.2 finding.
10. **`courses`/`team-hub` `loading.tsx` + `error.tsx`.** Stops the wrong-shaped-skeleton swap and completes the page/loading/error triad.

---

## 5. Remediation roadmap (90-day-style)

### Phase 0 — Stop the bleeding (Week 1, security incident)
- **Rotate** the Supabase `service_role` + anon keys and the leaked player password; assume compromised.
- Replace every key literal with `process.env` reads (fail-fast if unset); gate `run-sql.mjs`/`fix-auth.mjs` behind explicit env + confirm flag.
- Purge keys from git history (BFG/filter-repo); add the blocking gitleaks rule.
- **Consolidate the offline IndexedDB databases** so the global sync engine + pending-count observe the DB that `saveOfflineRound` writes to — closes the silent data-loss path.

### Phase 1 — Correctness, state coverage & quick wins (Weeks 2-4)
- Wire (or delete) the dead offline UI: real indicator in new-round, surface `failedCount`/dead-letter state, decide on the conflict-resolution engine (build-and-wire or delete).
- Fix orphaned-child sync success-reporting; add `courses`/`team-hub` loading/error triads.
- Land all "Quick wins" above (icon-button labels, toast duration, `alert()`→toast, dead-color revive, contrast literals).
- Add determinate progress to ≥3s AI/upload waits.

### Phase 2 — System sweeps via codemod + lint locks (Weeks 5-9)
The unifying theme: finish the documented-but-incomplete sweeps and lock them so they can't regress. Best run as a few large, mechanical codemods landed with their lint guards in the same PR.
- **Color:** `emerald-*`/`green-*`→`primary-*`; raw `red-*`/`rose-*`→destructive token; extract one shared severity→token map; collapse badge/status-pill semantic hues. Lint-ban `emerald-*`/`green-*`/raw `red-*` for semantic use.
- **Typography:** codemod `text-sm`/`text-xs`/`text-base`/`text-lg`/`text-2xl`/`text-[Npx]` onto the canonical 9-step; delete the iOS + legacy ramps; add a size-utility regression guard.
- **Tokens:** point `tailwind.config.ts` `boxShadow.{sm,md,lg}` + `transitionDuration` at the CSS vars; collapse `glass*/card*/elevation-*` shadows and the off-scale `rounded-[Npx]` tiers; ban arbitrary `shadow-[...]`/`rounded-[...]`/`bg-[#…]`.
- **Motion:** pick `tokens.css` as the one duration scale; alias/delete `ios-animations.ts` + Fairway + v3 legacy scales; de-dupe the six identical easing aliases to one; lint-ban numeric framer `duration:` literals.

### Phase 3 — Component & system consolidation (Weeks 10-12)
- **Cards:** pick ONE canonical surface family; author the card-roles taxonomy doc; collapse the 6 KPI tiles to 2 (`MetricCard` + `StatTile`); codemod the ~56 hand-copied `surface-matte rounded-3xl`+glow sites into `<Card variant="raised">`; pick one elevation rule (border XOR shadow); de-duplicate `GlassSurface` and the 4 `InsightCard` forks.
- **Design systems:** make Fairway `--fw-*` tokens pure aliases of the base tokens (or migrate Fairway components to read base tokens); reconcile the double-defined radius/green.
- **Repo:** delete the duplicate `.skills/` tree, move agent-scratch `.claude/` reports to an ignored dir, run `knip` to confirm-and-remove dead component copies, route stray `console.log` through a guarded logger.
- **Docs:** update the `CLAUDE.md` Design System block to reference token utilities (it currently teaches the exact drift this audit found).

### Phase 4 — Platform fidelity & deferred polish (post-90, scoped)
- Add a native iOS bottom tab bar gated on `Capacitor.getPlatform()`; introduce a platform context at the shell boundary; add an iPad/tablet breakpoint; reinstate or delete `MobileBottomNav` for golf.
- Decide RTL and dark-mode posture explicitly (implement or document as non-goals — don't leave half-configured).
- Content-tone constant extraction (CTA labels, error verbs, apostrophe glyph) + a lint rule.

**Sequencing note:** Phase 0 is non-negotiable and ordered first. Phases 2-3 are where the dimension verdicts actually flip — most FAIL dimensions fail on coverage/consistency that only a codemod-plus-lint-lock will durably fix; doing the codemod without the lock guarantees regression, since this codebase has already accumulated multiple "documented but unfinished" sweeps (Wave-1 color, the 9-step type claim, the offline DB consolidation).