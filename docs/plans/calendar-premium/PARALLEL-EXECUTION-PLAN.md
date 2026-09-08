# GolfHelm calendar: parallel execution plan

Execution companion to [DESIGN-PLAN.md](DESIGN-PLAN.md). Product scope and visual acceptance remain in that document. This file defines ownership, dependencies, verified code references, shared contracts, integration, and delivery. It is an implementation plan; no implementation or live schema validation has occurred in this planning pass.

## 1. Baseline and mandatory first step

Source rechecked 8 September 2026 at commit `bd0aa8f8e02bbc5b1b56dd3f024b30f294861b27`, canonical checkout `/Users/ricknini/Downloads/helmv3`, branch `agent/bridge-incident-wiring`. Its unrelated dirty file was `memory/ledgers/gates.jsonl`; preserve it. This branch is not assumed to be the production or implementation base.

The coordinator first fetches remote refs, identifies the intended current main commit, and compares the calendar files below against this audited commit. Record the actual implementation base SHA. Reconcile differences before assigning changes; line numbers below are navigation aids tied to this snapshot, while symbol names are the durable references. Do not switch another session’s branch or blindly merge its incident work.

Use isolated task worktrees with explicit branches. Follow the repository worktree/dependency tooling and shared ignored environment links; never copy secrets into source. Every worker is told: **you are not alone in the codebase; edit only your owned paths, preserve others’ changes, and request a handoff for shared files.**

Graph discovery was unavailable in this session; references were verified with source reads and `rg`. Reuse the graph if available when implementation begins. The registry entry `calendar_events` at `memory/registry.yml:763` points to `memory/features/calendar-events.md`; run `knowledge:map` for actual changed files before behavioral edits.

## 2. Verified current code and plumbing

All paths in this section are relative to `/Users/ricknini/Downloads/helmv3`.

| Source / symbol | Verified purpose | Integration requirement |
|---|---|---|
| `src/app/golf/(dashboard)/dashboard/calendar/page.tsx` | Server entry for live Fairway calendar | Keep auth, server seed and initial route context |
| `src/components/fairway/pages/calendar/FairwayCalendar.tsx` | Live orchestration; range hook, overlays, editor, detail and subscription sheet | Coordinator alone edits this file |
| `src/hooks/golf/use-calendar-range-events.ts` / `useCalendarRangeEvents` | Range fetch and stable realtime path used by live component | Reuse; no second calendar subscription or independent event cache |
| `src/hooks/useCalendarEvents.ts` | Source of imported `CalendarEvent` type | Do not assume the live UI uses this hook for fetching just because it imports its type |
| `src/hooks/useRSVP.ts` | RSVP types/lock helpers imported by Fairway | Preserve authoritative result semantics |
| `FairwayCalendarMemberRail.tsx` | Coach availability selection, not person drill-in | Explicitly change semantics through coordinator integration |
| `FairwayAvailabilityList.tsx`, `FairwayMonthGrid.tsx` | Existing availability presentation | Keep working while new comparison is behind its flag |
| `FairwayEventEditor.tsx:582–627` | Debounced check; all-day and empty IDs skip; catch suppresses warning | Replace skipped/error ambiguity with typed evaluation states |
| `src/app/golf/actions/golf.ts:5542` / `checkScheduleConflicts` | Parameters: startDate, startTime, endDate, endTime, attendeeIds, optional excludeEventId, optional timezoneOffset | Existing adapter uses wall-clock date/time plus numeric offset; new IANA-zone contract needs explicit compatibility adaptation |
| `golf.ts:5468` / `checkScheduleConflictsImpl` | Calls engine then maps `suggestedTimes` to `suggestions` | Keep the working key mapping; remove double assertions and normalize all interval timestamps |
| `golf.ts:5700` / `getPlayerAvailability` | Parameters: memberId, startDate, endDate, optional timezoneOffset | Despite the name, implementation resolves player then coach domain IDs; do not pass arbitrary auth-user IDs |
| `golf.ts:5761` / `getCurrentUserBusyPeriods` | Current-user availability action exists | Reuse underlying logic for organizer availability; do not duplicate a third identity resolver |
| `src/lib/calendar/availability.ts` | `getUserBusyPeriodsWithStatus`, `findCommonAvailability`, `periodsOverlap`, `resolveTeamTimeZone` | Normalize and batch around existing domain logic; preserve partial results |
| `src/lib/calendar/conflicts.ts:70` / `checkEventConflicts` | Attendee input is player IDs, not generic participant IDs | New coach/player union requires a deliberate resolver, not a type cast |
| `src/lib/calendar/timezone.ts`, `class-events.ts` | Calendar day spans, zoned dates, class ownership | Preserve all-day/date semantics and private class scoping |
| `golf.ts:3432,3716,4041` | `createGolfEvent`, `updateGolfEvent`, `deleteGolfEvent` | Existing lifecycle mutations; coordinator owns edits in this shared module |
| `src/app/golf/actions/recurring-events.ts` | Recurrence, scopes and academic exclusion actions | Mutation worker owns; coordinator owns the Fairway caller change |
| `src/lib/calendar/write-integrity.ts` | `requireWriteSuccess` checks returned errors/affected rows | Reuse; this is not a transaction or concurrency lock |
| `src/lib/calendar/rsvp.ts` | RSVP persistence/lock behavior | Align UI capabilities with this server domain |
| `src/app/golf/actions/attendance.ts`, `event-documents.ts`, `calendar-feeds.ts` | Existing connected subscreen services | Reuse verified exports; do not invent endpoint names |
| `src/styles/design-tokens.css` | Shared warm glass and system font tokens, including dark mode | One owner; no per-worker global material overrides |

### Contract corrections discovered in this pass

1. **Two different `ConflictResult` definitions exist.** The engine result has optional `partial`, `suggestedTimes`, and Date-valued intervals. The action-local type has `suggestions`, string interval declarations and a required conflicting-event `id`.
2. **The engine does not supply that event ID in its conflict object.** The current loop returns title/start/end/type and stops after the first overlap per person. An actionable source link must be nullable until a real authorized source ID is supplied. Never fabricate it from a title or array index.
3. **The action spreads the engine result.** Therefore `partial` can survive at runtime even though the declared action type omits it. The editor’s `normalizeConflictData` definitely discards it. Correct all contracts; do not inaccurately describe the action as always stripping the field.
4. **`findCommonAvailability` currently uses `getUserBusyPeriods` without status.** Repair suggestion completeness too; fixing only the warning UI leaves false-confidence suggestions possible.
5. **Legacy numeric timezone offsets remain in the action API.** The proposed IANA timezone service is a migration, not already implemented plumbing. Test DST transitions and old callers explicitly.
6. **Existing helpers do not prove atomicity.** Recurring updates and notification paths need a transaction/delivery audit; `requireWriteSuccess` only detects a failed individual write.
7. **Legacy components still export types used by Fairway.** Do not delete `PremiumCalendarClient`, `CalendarAvatarSidebar`, or `EventDetailModal` wholesale while active imports remain. Move genuinely shared types deliberately in a later coordinator-owned change.

## 3. Freeze the shared interface before parallel feature work

Package P0 owns the initial type definitions and fixture contract. Proposed new files are explicitly marked **NEW**:

- **NEW** `src/lib/calendar/scheduling-contracts.ts`: serializable participant, interval, snapshot, proposal, evaluation, suggestion, preview, capability and commit-result types.
- **NEW** `src/test/fixtures/calendar-scheduling.ts`: deterministic synthetic coach/player fixtures, complete/partial/failed data, overlap cases and recurring scenarios. Never imported by production runtime code.
- **NEW** `src/lib/calendar/scheduling-contracts.test.ts`: transport validation and shape compatibility.

Freeze these decisions in code:

- Participant reference uses domain kind + domain ID; server resolves auth identity and team authorization.
- Timestamps are ISO instants; recurrence/display timezone is an IANA name; all-day dates have an explicit date-based shape at the boundary.
- Interval source ID/detail link is optional and capability-aware. Include source revision only when meaningful; do not manufacture revision guarantees from a hash of incomplete reads.
- Evaluation includes verified free/busy/tentative/unknown counts, all overlaps and per-participant verification. Unknown is not represented by an empty interval list alone.
- Suggestion includes interval, required/optional counts, completeness and an explicit explanation key.
- Preview includes event revision, recurrence scope, changed fields, unresolved issues and known delivery effects. Commit returns success, validation failure, authorization failure, stale revision, or retryable failure as discriminated outcomes.
- Client gesture state never becomes proof of server verification.

The design document’s TypeScript block is a conceptual sketch, not a ready-to-import final contract. P0 resolves runtime validation and omitted fields above before consumers start. After freeze, changes go through the coordinator with explicit downstream acknowledgement. Do not allow workers to create local `as unknown as` substitutes.

## 4. Parallel ownership matrix

Use at most four active agents including the coordinator in this environment. Packages are logical responsibilities, not a request to start nine simultaneous agents. Reuse workers across waves.

| Package | Owner role | Exclusive owned paths | Must not edit |
|---|---|---|---|
| P0 Coordination/contracts | Coordinator | New contracts/fixtures; `FairwayCalendar.tsx`; calendar route; `golf.ts`; feature flag wiring; shared type extraction; registry/feature docs | Other workers’ implementation modules until handoff |
| P1 Scheduling engine | Domain worker | `availability.ts`, `conflicts.ts`, timezone/class helpers as needed; **NEW** scheduling read/evaluation/suggestion modules under `src/lib/calendar/scheduling/`; corresponding domain tests | `golf.ts`, orchestration, UI, shared contracts without approval from P0 |
| P2 Comparison visuals | UI worker | **NEW** `src/components/fairway/pages/calendar/scheduling/**`; its local styles/tests | Global tokens, editor, calendar orchestration, server actions |
| P3 Workflow state | State worker | **NEW** `src/hooks/golf/use-scheduling-workflow.ts`; `use-schedule-window.ts`; range hook and its tests | Page/orchestrator, visual components, server adapters |
| P4 Calendar/person surfaces | UI worker, after P2 handoff | Hero, day strip, agenda, month grid, member rail, availability list; **NEW** person/people components and their tests | Scheduling components while P2 still writes; orchestration |
| P5 Editor/detail/subscreens | UI worker | `FairwayEventEditor.tsx`, `EventWhenFields.tsx`, `FairwayEventDetailDrawer.tsx`; **NEW** review/conflict/availability/settings presentation and tests | `golf.ts`, recurrence actions, global tokens |
| P6 Mutation integrity/schema | Domain worker | `recurring-events.ts`, `rsvp.ts`, `write-integrity.ts`; **NEW** transaction/preview/commit service modules; specifically assigned migrations/RLS tests | `golf.ts`; generated DB types until coordinator allocates regeneration |
| P7 Connected services | Service worker | `attendance.ts`, `event-documents.ts`, `calendar-feeds.ts`; assigned supporting notification modules after inventory; tests | Global notification changes without scoped ownership; P6 modules |
| P8 Acceptance/integration | Coordinator + independent reviewer | Assigned E2E files, visual artifacts, release notes; coordinator handles final cross-module integration | Reviewer does not silently patch feature code owned by active workers |

Shared-file policy: a worker needing `golf.ts` or `FairwayCalendar.tsx` submits a small typed adapter/callsite patch description and tests to P0. Only P0 applies it. Migration filenames are allocated once; generated database types are regenerated once per integrated schema batch. Lockfiles, package scripts and shared primitives remain P0-owned unless explicitly handed off.

## 5. Dependency graph and practical waves

```text
P0 baseline + contracts + fixtures
             |
     +-------+-------+
     |       |       |
    P1      P2      P3       Wave 1: engine / visual lens / workflow state
     +-------+-------+
             |
     P0 first vertical slice (read-only compare)
             |
     +-------+-------+
     |       |       |
    P4      P5      P6       Wave 2: home/person / editor-detail / safe writes
     +-------+-------+
             |
     P0 integrated preview + commit
             |
     +-------+-------+
     |       |       |
    P7   visual QA  domain QA Wave 3: connected services and independent review
     +-------+-------+
             |
     P8 release acceptance + gated rollout
```

### Wave 0 — coordinator preparation

Reconcile main against audited source, read applicable policy/feature docs, inspect current schema and policies through authenticated tools, and inventory existing notification/idempotency/feature-flag infrastructure. Freeze contracts and fixtures. Build a small skeleton adapter and explicit feature flag with old route behavior preserved. Do not claim database readiness without a schema snapshot.

### Wave 1 — three independent workers

**P1:** repair completeness and identity boundaries; implement normalized read/evaluation/suggestions. Provide real data service results plus tests. **P2:** implement mobile/desktop lens, aggregate duration-aware strip, reference/proposed band, suggestions and accessible controls against fixtures and callbacks. **P3:** implement draft/navigation/gesture lifecycle, request cancellation, stale-response guards and cache invalidation against a typed injected adapter.

P2/P3 can start after contract freeze using fixtures. They cannot mark live availability complete until P1 is integrated. P0 wires a single read-only vertical slice: real coach + selected players → snapshot → timeline → verified proposal. No schedule mutation yet. Exit requires parity between strip, suggestion and selected-window evaluation, and no second realtime channel.

### Wave 2 — three packages after the first slice

**P4:** home/person/people navigation and responsive density. **P5:** editor, review, conflict and detail presentation using frozen mutation interfaces. **P6:** live schema/RLS work, recurrence integrity, capabilities, preview and commit behavior. P0 bridges existing `golf.ts` actions and lifecycle callers.

P5 can render all outcomes with fixtures while P6 builds, but cannot publish using fake success or bypass old authority. Personal blocks remain hidden until persistence and RLS are verified. P6 must coordinate availability invalidation/exception changes with P1’s now-handed-off domain modules; any P1 path edit requires an explicit ownership transfer.

### Wave 3 — connected services and two independent reviews

P7 completes verified file/attendance/feed/notification integration. One reviewer checks mobile/desktop workflows, focus, gesture contention and design states. Another checks privacy, incomplete reads, recurrence, stale revisions, repeat submissions and all-day/DST behavior. Reviewers return findings with reproduction and owned-path references; fix owners address them in bounded batches.

P0 then performs integrated checks, updates the feature doc, prepares task-only commits/PRs, and reports exact deployment state. Production deployment requires the user-authorized target and repository deployment workflow; writing this plan is not a deployment request.

## 6. Ready-to-assign work packet format

Every worker receives: implementation base SHA, design sections, exclusive paths, frozen contract revision, prerequisite package commits, permitted fixtures, explicit out-of-scope files, required checks, and integration recipient.

Required handoff:

1. Commit SHA and explicit changed-path inventory.
2. Implemented behavior and unsupported states, with no speculative completeness claims.
3. Exported interfaces and any compatibility adapters required from P0.
4. Test commands, exit codes, focused results and unavailable verification.
5. Screenshots/recordings for visual work, including 320px and desktop states.
6. Migration target/schema evidence for database work; no secrets.
7. Known risks and next dependency that can now start.

Workers do not merge each other’s branches, install competing UI systems, deploy, rewrite shared rules, or refactor unrelated modules. This does not restrict routine work inside their assigned package; it prevents concurrent ownership collisions.

## 7. Verification and integration gates

| Gate | Proof required before dependent work is considered complete |
|---|---|
| Contract | Transport types validated; engine/action naming and timestamp differences handled; no fabricated source IDs |
| Engine | Existing and new interval/completeness/privacy fixtures pass; organizer + player identity verified |
| Visual lens | Mouse/touch/keyboard alternatives; duration-aware aggregate; unknown data never green; real snapshot integration |
| Workflow | Back restores context; interruption cancels drag; stale requests ignored; one range/realtime owner |
| Writes | Authoritative permissions; recurrence scope/atomicity; current revision check; idempotent retry behavior |
| Schema | Actual target inspected; migration reviewed; RLS/constraints tested; generated types reconciled |
| Product | All design-document screen/state inventory implemented or explicitly feature-gated; no dead actions |
| Release | Relevant build and focused suites pass; physical app behavior reviewed; actual deploy/native artifact status reported |

Existing useful tests to preserve/extend include `src/test/lib/calendar/conflict-partial.test.ts`, `availability.test.ts`, `timezone.test.ts`, `rsvp.test.ts`, `write-integrity.test.ts`; `src/test/golf/calendar/conflict-suggestions-wire-shape.test.ts`; `src/app/golf/actions/__tests__/conflict-scope-id-kind.test.ts`; the Fairway calendar component tests; and `src/hooks/golf/__tests__/use-calendar-range-events.test.tsx`. Reconfirm paths and configured test projects at implementation base before composing commands.

Run focused tests once per relevant change set. The coordinator runs the required build after server-action integration; do not run three simultaneous full builds against shared generated state. Keep isolated runtime outputs. A green unit suite does not substitute for RLS or physical mobile verification.

## 8. Explicit unresolved plumbing gates

- Live schema/RLS, version columns and available transactional RPCs have not been queried in this planning pass. P0/P6 must verify them before defining migrations.
- Current notification source includes in-app upsert and email/push fan-out in recurrence actions. That does not prove a reusable transactional outbox exists elsewhere. Inventory first; reuse or propose explicitly.
- Cross-source locking and recurrence transaction design need database-level validation; the design’s concurrency approach is a requirement, not an existing guarantee.
- Mobile safe-area and motion primitives must be checked at implementation base; do not copy mockup padding values into the native shell.
- A production/base-branch comparison is required because this audit ran in another task’s active checkout.

These gates are scoped engineering tasks, not reasons to stop parallel UI work against frozen fixtures. They do block claiming the connected product is ready.
