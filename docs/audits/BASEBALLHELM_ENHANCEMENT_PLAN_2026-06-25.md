# BaseballHelm Enhancement Plan — 2026-06-25

> Status: Branch `feat/baseballhelm-ui-pass` staged green. This plan maps gaps from the V2 master plan multi-area audit to a phased build sequence. All items are additive; nothing here rewrites working code.

---

## What Already Exists (Strengths)

The branch is substantially further along than the master plan's original baseline suggested:

**Navigation & IA** — Hub-grouped sidebar with 5 coach hubs (Dashboard / Team / Stats / Development / Management), HubSubNav animated sub-tab strip, resolveActiveHub longest-prefix resolver, nav-registry with 50+ entries, mobile bottom-nav, and BaseballDashboardShell are all built and integrated. JUCO Academics hub is gated correctly; Recruiting hub is defined but hidden.

**Design System** — Core shared primitives (Card variants, Badge tone×appearance, Skeleton shimmer, EmptyState type-driven, StatusDot, Button) are mature and consumed correctly with cream/green tokens. Baseball motion.ts provides useReducedMotion-safe hover/tap helpers. Snapshot cards infrastructure (SnapshotCardGrid + 8 cards + SnapshotHeaderBand) is fully built and unit-tested.

**Performance / Lift** — PerformanceCommandCenter (KPI strip + readiness queue), LiveWeightRoom (full offline buffer, 7 coach actions, SyncPill), StrengthGroupsClient (three-pane builder, dynamic rule engine), and ProgramEditorClient (macrocycle tree, all prescription modes) are all functional.

**Player Lift** — PlayerLiftSessionClient, PlayerLiftHomeClient, logSetResult (idempotent upsert), completeLiftSession (PR sweep), soreness body-map UI, SorenessCheckCard, readiness check-in flow, and team soreness heatmap are built.

**Event Spine** — baseball_signals, baseball_actions, baseball_player_timeline_events, baseball_meeting_items, baseball_decision_log tables all exist with RLS and types. Signal triage, conversion, operational rule engine, Decision Room, and player timeline are end-to-end.

**Import Center** — Complete 7-step intake flow (detect → parse → match → diff → policy → approve → signals) with source trust, rollback, and import warning signal emission.

**Practice Effectiveness** — Engine, CRUD actions, read model, and PracticeEffectivenessClient UI with honest confidence language are all in place.

**Schema** — 13 helm_lifting_* tables with RLS exist. Soreness region registry (29 regions) and overuse rules engine (6 pure rules) are solid.

---

## Gap Summary by Priority

### P0 — Broken / Silent Failures

| Gap | Location | Impact |
|-----|----------|--------|
| `lowerBodyLiftAthleteIds` permanently `new Set()` — Rule 5 never fires | `soreness.ts:927` | Lower-body soreness conflict suppressed entirely |
| `readiness_score` / `readiness_band` stored `null` on soreness-path submissions | `soreness.ts:453,566` | Coach readiness board shows blank bands for every soreness-only check-in |
| SnapshotCardGrid never called from any page | `players/[id]/page.tsx:152` | Premium profile snapshot system is orphaned |
| ProfileTimeline not wired to coach-facing profile | `players/[id]/page.tsx` | Timeline tab absent from coach profile |
| Coach notes wired to `notes=[]` instead of `getPlayerCoachNotes()` | `players/[id]/page.tsx:122` | Notes section always empty; "table doesn't exist" comment is wrong |
| Offline buffer NOT wired into PlayerLiftSessionClient | `PlayerLiftSessionClient.tsx` | Sets lost on network failure |
| getPlayerLiftHome / getPlayerLiftSession read legacy `baseball_lift_sessions` | `player-lift.ts` | Split-brain: /lift page shows stale data vs Today card |
| Player Inspector drawer absent from Command Center | `PerformanceCommandCenter.tsx` | Command Center is read-only; no per-player actions |

### P1 — Significant Missing Features

| Gap | Location |
|-----|----------|
| No `CommandCard` primitive — every signal surface re-invents tone/evidence/actions | Need `src/components/baseball/ui/CommandCard.tsx` |
| No `PlayerTile` compact primitive for live room / group attendance | Need `src/components/baseball/ui/PlayerTile.tsx` |
| No `GroupAvailabilityGrid` — group studio has no time-slot heatmap | Need `src/components/baseball/ui/GroupAvailabilityGrid.tsx` |
| Exercise stress profile columns absent (throwing_arm_stress, primary_regions[], etc.) | Migration needed on helm_lifting_exercises |
| insights.ts uses dismiss-then-reinsert (hard CLAUDE.md violation) | `insights.ts:104-111` |
| No baseball notification read/mark-read server actions | Need `notifications.ts` action file + NotificationBell |
| Practice Effectiveness verdict buttons missing (Worked / Needs more time / etc.) | `PracticeEffectivenessClient.tsx` |
| Cold-hitter streak rule missing from operational rule engine | `operational-rule-engine.ts` |
| general_fatigue region missing from SORENESS_REGIONS | `soreness-regions.ts` |
| Overuse flags never promoted to baseball_signals | Need `overuse-signals.ts` |
| Smart defaults (previous weight prefill, +5/-5 steppers) absent from player session | `PlayerLiftSessionClient.tsx` |
| Completion screen missing top set / RPE average / PR badge | `PlayerLiftSessionClient.tsx` |
| Passport tab is a separate page, not a tab on coach profile | `PlayerProfileClient.tsx` |
| Performance tab not on coach profile (lives on separate /profile route) | `PlayerProfileClient.tsx` |

### P2 — Polish / Completeness

| Gap | Location |
|-----|----------|
| No baseball design token layer (darkPanel, clay, green900-600) | `tailwind.config.ts` |
| No `StatusRibbon` or `ActionRail` primitives | Need `baseball/ui/` directory |
| No `EvidencePill` standalone component | Need `baseball/ui/EvidencePill.tsx` |
| PWA manifest scoped to /golf/ only | `public/manifest.json` |
| No offline banner on PlayerLiftSessionClient | `PlayerLiftSessionClient.tsx` |
| Recruiting hub showRecruiting hardcoded false | `resolve-active-hub.ts` |
| Substitution reason_tags is free text, not structured enum | Migration + types |
| PlayerInsightsPanel mark-addressed / dismiss have no server actions | `PlayerInsightsPanel.tsx` |
| Profile views / watchlist count in sidebar are hardcoded fakes | `players/[id]/profile/page.tsx` |

### P3 — Deferred / Architecture

- Drag-and-drop session canvas (LiftCanvas with @dnd-kit in builder)
- Add/Edit Exercise 7-step premium wizard
- Shared domain packages for native wrapper
- Cron / Inngest signal expiry sweep
- Team events table (correlated team-level events)

---

## Phase Map (aligned to master plan §14 phases)

### Phase A — Critical Wiring Fixes (P0 bugs, orphaned components)

These are safe additive changes that unlock already-built infrastructure.

**A1. Wire SnapshotCardGrid + ProfileTimeline + CoachNotes to players/[id]/page.tsx**
- Call `getPlayerSnapshotCards(teamId, playerId)` and `getPlayerTimeline(teamId, playerId)` in parallel with existing queries
- Add Timeline and Notes tabs to `PlayerProfileClient.tsx` tab array
- Replace `notes=[]` with `getPlayerCoachNotes(teamId, playerId)` result
- Wire `createNote` server action to "Add note" button
- Files: `players/[id]/page.tsx`, `PlayerProfileClient.tsx`, `PlayerNotesSection.tsx`
- Acceptance: profile page renders SnapshotHeaderBand above tabs; Timeline tab shows events; Notes tab shows real notes

**A2. Fix soreness readiness_band null storage + lowerBodyLiftAthleteIds**
- In `submitSorenessMap` and `submitReadyToGo`, call `computeReadinessScore()` using available fields before upsert
- In `getCoachSorenessDashboard`, query `helm_lifting_sessions` for lower-body day sessions and build the set
- Files: `src/app/lifting/actions/soreness.ts`
- Acceptance: coach readiness board shows band colors for soreness-only check-ins; Rule 5 fires for lower-body soreness >= 6 on lift days

**A3. Fix insights.ts delete-then-reinsert (CLAUDE.md hard violation)**
- Add `insight_type` + `player_id` as composite uniqueness concept; switch `generateTeamInsights` to `.upsert(..., { onConflict: 'team_id,coach_id,player_id,insight_type' })` instead of dismiss-all + insert
- Files: `src/app/baseball/actions/insights.ts`, new migration `supabase/migrations/20260626000010_baseball_coach_insights_dedupe.sql`
- Acceptance: re-running generateTeamInsights does not wipe coach-acknowledged insights

**A4. Wire offline buffer into PlayerLiftSessionClient**
- Import `useLiveSetSync` with a player-specific `STORAGE_KEY = 'baseball.playerLift.pendingSets.v1'`
- Replace direct `logSetResult` calls with `setSync.queueAndFlush()`
- Add offline status pill at top of session view (pending count + isOnline)
- Files: `src/components/baseball/performance/PlayerLiftSessionClient.tsx`
- Acceptance: sets are buffered when offline and synced on reconnect; no duplicate sets on re-run

**A5. Fix player-lift.ts split-brain read path**
- Rewrite `getPlayerLiftHome` and `getPlayerLiftSession` to query `helm_lifting_sessions` / `helm_lifting_session_exercises` via `resolveBaseballLiftingOrg` adapter (same pattern as `player-today-lift.ts`)
- Files: `src/lib/baseball/read-models/player-lift.ts`
- Acceptance: /baseball/dashboard/lift page and Today card both reflect the same session data

---

### Phase B — Premium Design System Components (§5.4)

**B1. CommandCard primitive** (`src/components/baseball/ui/CommandCard.tsx`)
- Props: `tone: 'ready'|'watch'|'urgent'|'info'|'complete'`, `eyebrow`, `title`, `description`, `evidence: EvidencePill[]`, `actions: CardAction[]`, `meta?: ReactNode`
- Absolute left-border accent bar (absolute inset-y-0 left-0 w-1) keyed to tone
- Cap-gated action buttons using `capabilities: BaseballCapabilitySet` prop
- Entrance animation via `hoverLift` from `src/lib/baseball/motion.ts` with `useReducedMotion` guard
- Golf reference: `InsightCard.tsx` severity accent pattern, `SignalCard.tsx` tone map
- Acceptance: renders correctly for all 5 tones; action buttons hidden for player-role callers; framer-motion entrance with reduced-motion bypass

**B2. EvidencePill primitive** (`src/components/baseball/ui/EvidencePill.tsx`)
- Thin wrapper around existing `Badge` (tone='secondary', appearance='soft', size='sm') mapping source-type strings to tone + icon
- Source types: `'official_stats'|'gamechanger'|'trackman'|'manual'|'low_confidence'|'last_5_games'`
- Golf reference: `Badge` component + `SourceTrustBadge` pattern
- Acceptance: all 6 source types render with correct icon and tone; no new base CSS needed

**B3. PlayerTile compact primitive** (`src/components/baseball/ui/PlayerTile.tsx`)
- Compact tile: avatar, name, position, StatusDot, soreness severity indicator, current group, quick actions
- `variant: 'list'|'grid'|'compact'` — list variant is the live room row; grid variant is the group picker
- Golf reference: `FairwayTeamStats.tsx` inline PlayerTile; `PlayerCard.tsx` full profile card
- Acceptance: renders all 3 variants; StatusDot shows correct semantic tone; soreness indicator only visible when `canViewReadiness=true`

**B4. StatusRibbon primitive** (`src/components/baseball/ui/StatusRibbon.tsx`)
- Five horizontal state chips: `Ready | Watch | Limited | Missing | Complete`
- Each chip is a `Badge` with the correct tone; selected chip has filled appearance
- Used by LiveWeightRoom athlete rows and practice attendance surface
- Acceptance: all 5 states render; selected/unselected visual distinction clear; min-h-[44px] for touch

**B5. ActionRail primitive** (`src/components/baseball/ui/ActionRail.tsx`)
- Consistent set of coach actions: Create task, Modify lift, Add note, Add to practice, Message, Add follow-up, Dismiss
- `capabilities: BaseballCapabilitySet` prop gates each button via `can_manage_lifting` / `can_manage_tasks`
- Extracted from `SignalCard.tsx` and `PlayerQuickActions.tsx` so both surfaces use the same component
- Acceptance: buttons render only for permitted capabilities; works inside CommandCard and PeekPanel

**B6. baseball/ui/index.ts barrel export** (integration task owns this)
- Exports all 5 new primitives from a single `src/components/baseball/ui/index.ts`

---

### Phase C — Player Profile 360 (§6.6)

**C1. Add Performance + Passport tabs to PlayerProfileClient**
- Add 2 tabs to existing tab array: `{ id: 'performance', label: 'Performance' }` and `{ id: 'passport', label: 'Passport' }`
- Performance tab panel: inline `PlayerPerformanceTab` (currently on separate /profile route)
- Passport tab panel: inline `PlayerPassportCard` + `ScoutPacketManager` (currently on separate /passport route)
- File: `src/components/baseball/player-profile/PlayerProfileClient.tsx`
- Acceptance: Performance and Passport tabs render with correct data; no route change needed to access them

**C2. Add Tasks tab to PlayerProfileClient**
- New tab: `{ id: 'tasks', label: 'Tasks' }`
- Fetch tasks by player_id from `baseball_tasks` in the page server component
- Inline `TasksList` component filtered to player
- Files: `players/[id]/page.tsx`, `PlayerProfileClient.tsx`
- Acceptance: Tasks tab shows open + completed tasks for player; empty state renders correctly

**C3. Wire PlayerInsightsPanel mark-addressed / dismiss actions**
- Connect existing `dismissInsight` action to "Dismiss" button onClick
- Add `markInsightAddressed` action (update status='resolved') to "Mark Addressed" button
- Files: `src/components/baseball/player-profile/PlayerInsightsPanel.tsx`, `src/app/baseball/actions/insights.ts`
- Acceptance: clicking buttons mutates database and revalidates; buttons show isPending state

**C4. Remove hardcoded fake stats from /profile sidebar**
- Remove hardcoded "Profile Views: 127 / Watchlists: 8 / Last Active: 2h ago"
- Show real `baseball_videos` count and real last-active from player's `updated_at`
- File: `src/app/baseball/(dashboard)/dashboard/players/[id]/profile/page.tsx`
- Acceptance: no fabricated numbers visible

---

### Phase D — Performance Command Center Polish (§6.2)

**D1. Player Inspector panel for Command Center**
- New component `src/components/baseball/performance/PlayerInspectorPanel.tsx`
- Extends `PeekPanelType` in peek-panel-store.ts to include `'performance'`
- Shows: today plan, last completed session, soreness mini-preview (read-only SorenessBodyMap), bodyweight from last entry, coach actions via ActionRail (Modify lift, Mark limited, Add note, Follow-up)
- Triggered by clicking a player row in the readiness queue
- Files: `PlayerInspectorPanel.tsx` (new), `PerformanceCommandCenter.tsx` (add click handler + selected state), `src/stores/peek-panel-store.ts`
- Acceptance: clicking athlete row opens inspector panel; soreness map renders in read-only mode; ActionRail buttons gated on capabilities

**D2. Practice Effectiveness verdict buttons**
- Add 4 CTA buttons to `ReviewCard` in `PracticeEffectivenessClient.tsx`: "Worked", "Needs More Time", "Not Enough Data", "Change Approach"
- Map to `setReviewDisposition` calls: 'Worked' → 'resolved', 'Change Approach' → 'dismissed', 'Needs More Time' / 'Not Enough Data' → 'resolved' with a meta tag
- Styled as a `ButtonGroup` with cream/green tokens; no spinner — use `isPending` opacity fade
- File: `src/components/baseball/practice-effectiveness/PracticeEffectivenessClient.tsx`
- Acceptance: all 4 buttons visible on non-resolved cards; clicking each fires server action and refreshes

---

### Phase E — Soreness / Lifting Schema Fixes (§8–§9)

**E1. Add general_fatigue to soreness regions**
- Add `general_fatigue: { label: 'General Fatigue', side: 'center', group: 'whole_body', view: 'front', baseballRiskGroup: null }` to `SORENESS_REGIONS`
- Update `SorenessRegionId` union type
- Files: `src/lib/lifting/soreness-regions.ts`
- Acceptance: body map can accept general_fatigue submissions; overuse-rules.ts isSorenessRegionId() accepts it

**E2. Exercise stress profile schema migration**
- New migration: `supabase/migrations/20260626000020_helm_lifting_exercise_stress_profile.sql`
- ALTER TABLE helm_lifting_exercises ADD COLUMN throwing_arm_stress text CHECK (... IN ('none','low','medium','high')) DEFAULT 'none', spine_loading text CHECK (...) DEFAULT 'none', lower_body_loading text CHECK (...) DEFAULT 'none', rotational_stress text CHECK (...) DEFAULT 'none', grip_stress text CHECK (...) DEFAULT 'none', is_pitcher_sensitive boolean NOT NULL DEFAULT false, primary_body_regions text[] NOT NULL DEFAULT '{}', secondary_body_regions text[] NOT NULL DEFAULT '{}', stress_regions text[] NOT NULL DEFAULT '{}'
- No data migration required (defaults are safe for all existing rows)
- File: `supabase/migrations/20260626000020_helm_lifting_exercise_stress_profile.sql`
- Acceptance: migration applies idempotently; no existing exercise rows are modified

**E3. Overuse rules unit tests**
- Create `src/lib/lifting/__tests__/overuse-rules.test.ts`
- Cover all 6 rule functions with boundary cases (at threshold, below, above)
- Especially test throwingArmConcern at severity 4 (no flag) vs 5+ (flag)
- Acceptance: `npm test` passes; coverage shows all 6 rule functions reached

**E4. Add cold-hitter streak rule to operational rule engine**
- New `OperationalRuleId`: `'player_cold_streak'`
- Rule: if lastN games >= 5 and recentOPS < seasonOPS - 0.15 → `createSignal` with `signal_type='hitting_concern'`, dedupe_key=`cold_streak:${playerId}:${weekOf}`, `sampleTooSmall=games<5`
- Load stats rows in `OperationalRuleFacts` (already present as `FactGame`)
- Files: `src/lib/baseball/operational-rule-engine.ts`, `src/app/baseball/actions/operational-signals.ts`
- Acceptance: rule fires correctly for simulated cold-streak data; signal has correct dedupe key; re-run does not clone

---

### Phase F — Notifications (§11)

**F1. Baseball notification server actions**
- New file `src/app/baseball/actions/notifications.ts`
- Exports: `getBaseballNotifications(limit?: number)`, `getUnreadNotificationCount()`, `markNotificationRead(id: string)`, `markAllNotificationsRead()`
- Pattern: mirror `src/app/golf/actions/coach-notifications.ts` querying `baseball_notifications` instead
- All functions use `withBaseballAction` auth wrapper
- Acceptance: actions return typed notification arrays; mark-read sets `read_at`

**F2. NotificationBell in BaseballShellLayout**
- Create `src/components/baseball/NotificationBell.tsx` (client component)
- Polls `getUnreadNotificationCount()` every 60s via `useEffect`
- Renders bell icon + badge count in the shell header
- On click: opens a popover with the last 10 notifications using `getBaseballNotifications(10)`
- Files: `NotificationBell.tsx` (new), wired into `src/components/baseball/BaseballShellLayout.tsx` by the integration task
- Acceptance: badge shows correct unread count; clicking mark-all-read clears it

---

### Phase G — PWA + Offline (§10)

**G1. Baseball player PWA manifest**
- New file `public/baseball-manifest.webmanifest`
- `name: "BaseballHelm"`, `short_name: "Baseball"`, `start_url: "/baseball/player/today"`, `scope: "/baseball/"`, icon set reusing existing helm icons
- Wire via `<link rel="manifest">` in `src/app/baseball/(player-dashboard)/layout.tsx` (integration task)
- Acceptance: Chrome install prompt appears on /baseball/player/today; start_url launches correctly

---

### Phase H — Player Session UX (§6.5)

**H1. Smart defaults + +5/-5 steppers in PlayerLiftSessionClient**
- Add `IncrementButton` sub-component with `+5` and `-5` tap targets (min-h-[44px])
- Prefill load from last set of same exercise_id in same session; fall back to prescribed_load
- Add `repeatLastSet()` that copies previous set's weight/reps to current inputs
- File: `src/components/baseball/performance/PlayerLiftSessionClient.tsx`
- Acceptance: +5/-5 buttons visible; default weight pre-populated; repeat-last-set copies values

**H2. Completion screen polish + PR badge**
- On `completeLiftSession`, return top set (max load with exercise name) and RPE average alongside existing PR count
- Show in completion panel: "N sets · Top set: ExerciseName W×R · RPE avg X.X"
- If prCount > 0: render a `motion.div` scale-spring badge animation (0.8→1.0, spring stiffness 400) with "New PR" text — no confetti
- File: `src/components/baseball/performance/PlayerLiftSessionClient.tsx`, `src/app/baseball/actions/lifting-v11.ts`
- Acceptance: completion screen shows top set and RPE; PR badge animates once; useReducedMotion skips animation

---

## Build Wave Sequence

| Wave | Tasks | What ships |
|------|-------|-----------|
| **Wave 1 (now)** | A3 (insights dedupe), A5 (split-brain fix), B1 (CommandCard), B2 (EvidencePill), B3 (PlayerTile), B4 (StatusRibbon), B5 (ActionRail), C1 (Profile Performance+Passport tabs), C3 (Insights actions), D2 (Practice verdict buttons) + Integration task wiring | Premium design system primitives + profile tab coverage + critical data correctness fix |
| Wave 2 | A1 (Snapshot wiring), A2 (readiness band fix), A4 (offline buffer), C2 (Tasks tab), D1 (Player Inspector), E1 (general_fatigue), E3 (overuse tests), F1+F2 (notifications) | Profile 360 completeness, command center action path, notifications |
| Wave 3 | E2 (stress profile schema), E4 (cold-hitter rule), G1 (PWA manifest), H1 (steppers), H2 (completion screen) | Schema for conflict scoring, new signal rule, mobile UX polish |
| Wave 4 | Drag-and-drop LiftCanvas, GroupAvailabilityGrid heatmap, exercise conflict score engine, ExerciseWizard | Advanced lift planning features |

---

## Migration Rules (apply to ALL schema tasks)

1. Filename: `YYYYMMDDHHMMSS_description.sql` — use timestamps after `20260626000000`
2. ADD columns only — never DROP or ALTER existing columns in wave 1-3 tasks
3. All new columns must have safe DEFAULT values so existing rows are unaffected
4. After any new table: `REVOKE ALL ON public.<table> FROM anon` in a DO block
5. SECURITY DEFINER functions: REVOKE FROM PUBLIC, REVOKE FROM anon, GRANT TO authenticated + service_role
6. Verify with: `SELECT relacl FROM pg_class WHERE relname = '<table>'` after apply

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Hub rename (Team → Players) breaks prefix matching | Do NOT rename hubs in wave 1; only add primitives and wire orphaned components |
| STORAGE_KEY collision (coach vs player offline buffer) | Use `'baseball.playerLift.pendingSets.v1'` — distinct from `'baseball.liveWeightRoom.pendingSets.v1'` |
| Snapshot read model N+1 queries | `getPlayerSnapshotCards` already uses parallel Promise.all branches; verify no sequential awaits before wiring |
| getPlayerLiftSession 'select *' missing coaching_cues | Wave 3 add coaching_cue_snapshot column to `baseball_lift_session_exercises`; do not block wave 1 on this |
| insights.ts upsert conflict key requires migration | Migration `20260626000010` must apply before `generateTeamInsights` is called; dedupe key migration is additive (unique index only) |
| anon EXECUTE on new SECURITY DEFINER functions | All new migrations must REVOKE FROM anon on any helper function |
| fromUntyped() debt on helm_lifting_* tables | All new queries on helm_lifting_* must use `fromUntyped(supabase, 'table_name')` until db:types regenerated |
