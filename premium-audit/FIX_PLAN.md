# GolfHelm: Non-Product Engineering Fix Plan

**Source baseline:** `3c90f9f174ac103af5fafc600aebecd98243decc`
**Audit branch supplied by owner:** `agent/mobile-ui-audit`
**Prepared:** September 7, 2026
**Scope:** Repair existing behavior without making new product, privacy, scoring, membership,
notification-policy, or visual-direction decisions. Messaging remains separate.
**Deliverable status:** Implementation instructions, not implemented fixes. No repository writes,
database changes, deployments, app test runs, or device verification were performed to create this
document.

## Contents

Scope and rules | Important corrections | Parallel schedule | 25 core repairs | 7 gated repairs |
All 95 dispositions | Held decisions | Tests and commands | Acceptance | Coordinator prompt

## Start here

Implement the repair packets in Sections 4 and 5, subject to file leases and their stated gates. Do
not run another unrestricted audit or blindly implement all 95 proposed fixes. Each packet
identifies what to change, what not to change, and the test that establishes completion.

This plan contains 25 core repair packets and 7 integration-gated engineering packets. These are
grouped units of work, not a claim that 32 independent production bugs have been reproduced. Section
6 gives all 95 original finding IDs a disposition so nothing disappears silently.

First assignments: R01 (safe recovery), R02–R03 (round-start validation and editing), and R06–R07
(Stats request correctness), provided three writer slots are actually available. Native URL repair
G01 is also urgent; prepare its tests in parallel, but it cannot be signed off without a real Swift
build and native navigation checks.

## What this plan deliberately does not do

It does not change the product decisions listed as taken during the audit. Those decisions stay in a
separate implementation track even when already approved. It also does not adopt unresolved
recommendations by treating a proposed implementation as an authorization.

In particular, do not clamp existing par-6 data, replace the join-approval workflow, redirect every
round to Review, change foreground notification policy, choose a new badge model, add analysis-job
infrastructure, or change analytics privacy settings under this plan.

The earlier premium visual and messaging plans remain separate. This is the engineering repair layer
that makes those plans safer to execute, not another redesign.

## Evidence basis

The owner's pasted findings register is the primary input. Its exact source anchors and labels are
retained as investigation provenance; they are not promoted to device observations. Targeted
connector reads independently checked the pinned AGENTS.md, round-start paths, Stats loader,
notification badge provider, calendar time helper, native bridge controller, and package.json.
References are at the end.

The supplied statement that A12 confirmed five source claims is source-level corroboration, not five
passing runtime tests. A03-003's compile refutation supersedes its original allegation. The reported
six worktrees and native CI limitation are scheduling inputs to refresh, not freshly measured facts.

---

## 1. Execution rules and scope boundary

### 1.1 Meaning of non-product

A fix is in scope when it restores an existing invariant: correct data identity, valid input, honest
saved state, one intended side effect, deterministic formatting, a stable control, an existing
permission boundary, or an already-adopted accessibility/design-system contract.

A change is out of scope when it chooses a new policy: who joins a team, what a badge means, what
route a tap should open, what historical scores to rewrite, which analytics to collect, whether to
retain private drafts after sign-out, or how an AI confidence percentage should be marketed.

Engineering choices such as request-generation checks, explicit error result types, test placement,
and cleanup ownership do not require a new product decision. They do require code review and
evidence. Do not ask the owner to choose between routine safe implementation mechanisms.

### 1.2 No destructive shortcuts

- Preserve original inputs, completed-hole calculations, unsynced work, and submitted operation
  identity. A failed save must not delete the user's work merely to make the counter accurate.
- Do not loosen RLS, use a client service-role key, edit applied migrations, or modify production
  data. Any required SQL/grant/schema change becomes an A10 handoff and blocks only that dependent
  subtask.
- Do not add a second state library, offline queue, toast system, haptic system, or reload handler.
  Consolidate existing ownership.
- Do not hide a bug with a skeleton, delay, animation, swallowed error, coerced zero, or fabricated
  success.
- Shared behavior changes must preserve Baseball, admin, and the separately owned Messages routes.
  No incidental product-wide migration.

### 1.3 Workspace and shared-file protocol

Read the current AGENTS.md, `memory/registry.yml`, mapped `memory/features/*` documents, and
generated feature map before editing. The pinned AGENTS file says the generated feature map
supersedes the older hand-maintained repo map. Use current repository rules if they changed after
this baseline. [S01]

Use `scripts/new-worktree.sh` and the existing lifecycle tooling. Honor the actual mutation-workspace
budget, default three in the inspected rules. Do not create more worktrees while the budget is
exceeded, increase the cap, or manually remove someone else's worktree. An existing approved slot can
be reused through the sanctioned workflow; read-only analysis does not authorize writes in a shared
checkout.

One coordinator owns the repair manifest and exact file leases. Messaging shares the same global
writer budget. Root layout, global CSS, Button, ToastStack, haptic helpers, Capacitor configuration,
notification context, and generated files are exclusive-write chokepoints.

Each packet starts with a short baseline check: does the mechanism still exist in the checked-out
repair base? If not, record `FIXED_UPSTREAM` or `REFUTED` with evidence, and run the regression test
rather than reintroducing an obsolete repair. Do not assume the audit SHA is the production build.

---

## 2. Corrections to the proposed fixes that must survive implementation

| Audit suggestion or inference | Implementation constraint |
|---|---|
| Replace `.some` with `.every` for hole validity. | Necessary but insufficient. An empty array passes `.every`; also validate expected count, uniqueness, selected subset, complete values, and the final payload immediately before persistence/tracking. |
| The two setup gates are the whole defect. | The rechecked quick-pick branch directly changes to tracking without calling `persistRoundStart` in that handler. Route it through the existing validation/durable-start contract; do not fix just one boolean. [S02] [S03] |
| Roll back `completedHoleStats` after a save error. | Do not erase entered or computed score data. Track the acknowledgment of the submitted hole revision separately; count only the state the label actually claims. |
| Parsing a numeric draft preserves the cursor automatically. | A string buffer removes forced numeric coercion; actual cursor/selection, paste, IME, and re-render behavior still require tests. Do not silently clamp or discard valid-looking substrings from invalid text. |
| Native classifier should stay on every same-host path. | Use an explicit origin and segment-boundary route policy. An unrecognized route is not automatically trusted, and a rejected external link must not destroy the current task by forcing login. |
| All dynamic routes necessarily skeleton on Back. | Not established. Next documents distinct Link navigation and back/forward reuse. Do not ship a global `staleTimes` change or template rewrite from this inference. Test the installed version and the actual navigation path. [P01] [P02] |
| Moving the same keyed wrapper into layout preserves pages. | A keyed changing subtree can still remount. State must live in a persistent, authorized owner or be explicitly restored. Removing a filename alone is not a state-preservation proof. [P02] |
| Calendar lookup miss means deleted. | The event may have moved outside a loaded range, a read may have failed, or access may have changed. Use authoritative scoped lookup before declaring removal; use a privacy-safe unavailable state on confirmed denial/miss. |
| Refresh an open event editor from the newest event object. | Refresh read-only facts and lock status, but never overwrite dirty form fields. Preserve the edit's base revision; concurrent recurring-event changes need authoritative conflict handling, not a silently moved series boundary. |
| Make a toast the universal haptic owner. | First remove proven duplicate outcome calls at paired call sites. A passive or background toast must not become a new buzz. A press acknowledgment and one later result are distinct events. |
| Raise dropdowns to 1000 and delete the old z-index scale. | Numeric z-index alone cannot escape an ancestor stacking context, clipping, or an inert modal background. Fix the portal/focus ownership and migrate proven consumers; retain legacy aliases until safe. [P05] |
| Mark a notification read before/alongside push navigation. | Do not implement in this queue. Read semantics need the target successfully resolved and visibly handled under the agreed policy, not merely a tap or `router.push`. |
| Remove the duplicate native keyboard resize. | A01-009 specifically refutes that diagnosis at this baseline. Remove inert keys only after version verification; do not remove the sole functioning JS compensation. [P04] |
| Revoke a blob URL immediately after clicking it. | Use the repository's proven delayed/consumer-complete cleanup policy. Revoking before the download consumes it can break downloads; test the actual platform. [P06] |
| A missing named ARIA attribute or any moving spinner proves WCAG failure. | Repair the specific usability/accessibility omission and verify behavior. Do not certify conformance or a violation from an attribute grep; equivalent techniques and essential-motion exceptions exist. [P07] |
| Legacy Calendar proves duplicate polling and blur cost on the live route. | A07-009 says that same legacy component is not mounted. Resolve reachability before treating A11-003/A11-008 as live repairs. |

---

## 3. Dispatch, ownership, and order

### 3.1 Roles

**Coordinator:** leases files, reconciles product exclusions, manages the shared budget, publishes
contract decisions, and approves integration evidence. The coordinator does not silently promote
`NOT_RUN` to `PASS`.

**Core repair owners:** Recovery/auth; round entry/durability; Stats/data; Calendar/Home; shared
controls/feedback; native integration. These are responsibilities, not instructions to spawn six
simultaneous writers.

**Verifier:** runs tests against the integrated changes, checks scope and claimed outcomes, and
records missing infrastructure. Read-only review can run concurrently; test processes that generate
files or use shared build outputs need isolated ownership too.

### 3.2 Suggested three-slot schedule

| Wave | Slot 1 | Slot 2 | Slot 3 | Exit condition |
|---|---|---|---|---|
| 0 | Coordinator refreshes baseline/leases | Read-only native policy and build-path preparation | Read-only test/fixture planning | Budget compliant; affected feature docs read; exact baseline and exclusions recorded. |
| 1 | R01 recovery and its real event tests | R02–R05 round integrity, editing, save truth | R06–R08 Stats and auth read truth | Core invariants pass controlled tests; unsupported integration tests remain blocked explicitly. |
| 2 | R10–R14 Calendar; R12 via leased Home helper | R09/R19 shared read and polling ownership | R15–R18, R20–R22, R24 controls/feedback in serial file leases | No same-file writers; ready/pending/error regressions checked. |
| 3 | R16 Home structure and R25 library return state | G01–G04 native changes, only with build/device path | R23 plus G05–G07 approved integration changes | Shared seams and all affected roles tested. |
| 4 | Integration fixes only | Independent route/fault verification | Device/accessibility/native verification | Final evidence manifest, unresolved blockers, separate release recommendation. |

This is a scheduling example, not a requirement to wait for an entire wave when a dependency is
already satisfied. Urgent native G01 may take a slot earlier. R01's dirty-work API and R02–R05's
registrations must agree before either is merged.

### 3.3 File collision rules

`new-round-client.tsx`: R02 and R19, plus any qualifier probe, serialize. `FairwayHoleConfig.tsx`:
R03, R17 and R22 serialize. `StatsSpineStage.tsx`: R06 and R07 serialize. `FairwayCalendar.tsx`: R10,
R11, R13 and R14 serialize. `FairwayBottomNav.tsx`: R15 and R17 serialize. `button.tsx`: R17/R20/R21
serialize. `CapacitorProvider.tsx`, native controller and config: G01–G04/G07 serialize. `ToastStack`
and root `layout.tsx`: G05 requires coordinator and messaging-owner coordination.

A packet may read another owner's files freely but submits a named change request before editing
them. Do not resolve overlapping branches by taking a whole file from either side.

---

## 4. Core repair packets

These packets need no new product choice within the stated boundaries. Readiness still depends on
current-source confirmation, file ownership, and the required test environment. Each test list is a
specification, not a claim of a passing result.

### R01 — One bounded, dirty-work-aware recovery coordinator

**Priority:** P0
**Finding IDs:** A02-001; A11-002; A12-005; incidental hardening from A02-007
**Owner:** Recovery owner + coordinator

**Source entry points:** `src/components/providers/StaleDeploymentRecoveryScript.tsx:30-46,115-177`;
`ChunkLoadErrorHandler.tsx:12-28`; `src/components/errors/RouteErrorBoundary.tsx:145-263`;
`src/lib/error-logging.ts:499-576,630-679`; `GlobalErrorHandlerSetup.tsx`; root layout only if
composition actually needs changing.

**Implement**

Give all existing reload-capable callers one decision owner, shared attempt schema and in-flight
latch. Remove generic transport strings from automatic asset-recovery eligibility. A failed request
is not proof of a stale deployment.

Use a single session/release ledger that hydration does not clear; retain a bounded overall loop
guard when release detection fails or fluctuates. Claim an attempt before beginning asynchronous
recovery so concurrent handlers cannot both win. Handle denied/malformed storage without an
uncontrolled fallback reload.

Expose a small active-work registration contract for dirty inputs, writes of unknown outcome, and
unacknowledged local persistence. Before hydration or before those owners register, treat work status
as unknown, not safe. A safe asset retry can remain local; a document reload requires an eligible
error, available budget, and confirmed safe work state. Do not clear cookies, IndexedDB, all origin
caches, or service workers as a generic first action.

Make the early inline script and hydrated code consume the same boot-safe implementation or generated
source of truth. Re-registering a listener must be idempotent or correctly cleaned up; it must not add
another classifier.

**Required regression proof**

Dispatch one qualifying error through every mounted global listener and assert at most one recovery.
Generic `Load failed`, fetch abort and a dirty form: no document navigation. Repeat after hydration:
budget remains spent. Test denied `sessionStorage`, malformed ledger, in-flight asset probe, unknown
commit, observer re-install, and user retry. Execute the actual generated inline script, not only a
regex over its source.

**Boundary / stop condition:** Do not redefine sign-out retention or schema recovery. If active
round/message work cannot yet register, automatic destructive recovery stays suppressed for unknown
work state. Messaging owns its adapter.

### R02 — Validate every selected hole and use one round-start boundary

**Priority:** P0
**Finding IDs:** A05-008; A05-015; hole-validation portion of A12-003
**Owner:** Round-entry owner

**Source entry points:**
`src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx:980-1081,1208-1380`; existing
hole-schema helpers; tracking components that consume yardage. [S02] [S03]

**Implement**

Build the selected 9/18-hole snapshot first, including the already-supported front/back selection, and
validate that snapshot rather than an unsliced source array. Require exactly the chosen count, unique
expected round indices, finite integer values, and every field required by the existing shot-tracking
contract. Preserve current accepted par semantics; do not apply the separate par-6 conversion
decision.

Replace both permissive start checks with one shared result that returns valid data or precise
invalid-hole reasons. Put the guard immediately before persistence and transition as well as in the
editor; `.every` alone is not sufficient for empty or short arrays.

The rechecked quick-pick handler sets tracking directly. Route it through the existing durable-parent
start contract used by `persistRoundStart`; preserve the current online-start requirement rather than
inventing offline start. Construct an immutable course/tee/hole-count snapshot so asynchronous React
state setters cannot cause persistence of the previous selection.

Carry imported-versus-placeholder provenance into the review model. An incomplete tee routes to the
existing editor with affected fields unresolved/flagged; replacing zero with a generic positive
yardage is not validation. Stop treating missing yardage as one yard in meaningful progress
calculations. Existing malformed saved rounds get an unavailable metric/correction path, not automatic
history rewriting.

**Required regression proof**

Cloud tee with one missing hole; saved course with one valid and eight invalid holes; empty list;
short list; duplicate index; `NaN`/`Infinity`; invalid string; zero/negative yardage; valid complete
9/18; valid selected subset with invalid unselected holes. Assert no new round/tracking transition on
invalid input. Quick-pick must use the selected metadata, pass normal setup prerequisites, await
parent acknowledgment, and resist repeated taps.

**Boundary / stop condition:** Client/action protection is not a claim of database enforcement. Any
direct-write invariant requiring SQL, data backfill or historical repair is handed to A10. Do not
modify shared catalog records to repair one player's round.

### R03 — Numeric edit buffers and field-specific validation

**Priority:** P1
**Finding IDs:** A05-001; A05-004; field-error portion of A12-003
**Owner:** Round-entry owner

**Source entry points:**
`src/components/fairway/pages/rounds-new/FairwayHoleConfig.tsx:144-167,267-331`; its existing
Start-round caller.

**Implement**

Separate each editable yardage string from validated numeric data. Allow temporary empty/partial input
and normal selection/cursor behavior. Parse the whole input at an explicit commit boundary; reject
invalid trailing characters and non-integers rather than accepting a `parseInt` prefix. Do not
silently clamp.

Keep totals based on verified values while marking incomplete editing honestly; do not publish a
cleared field as zero. Start round validates the current drafts, not a stale committed array.

Return errors keyed by hole and field. Reveal the nine containing the first invalid field, then
focus/reveal it after it mounts. Use visible hole-specific text, `aria-invalid`, and an associated
description. Keep unrelated edits and errors. Do not clear all errors on any par click. Preserve the
existing course/baseline policy; replacement decisions are outside this packet.

**Required regression proof**

Clear/retype; select-all; paste valid/invalid input; decimal; leading zeros; IME composition; blur then
Start; Start while the active field is incomplete; invalid hole on the hidden nine; multiple field
errors; correct one error without erasing the others. Verify cursor behavior and the actual error
field's accessibility tree.

**Boundary / stop condition:** Do not expand or narrow the allowed par range. A generic post-grid
banner alone is not completion.

### R04 — Count confirmed hole saves without deleting entered data

**Priority:** P1
**Finding IDs:** A05-009
**Owner:** Round durability owner

**Source entry points:**
`src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx:812-834,880-905,1519-1548`.

**Implement**

Keep entered/calculated hole stats intact. Add or reuse a per-hole acknowledgment state tied to the
immutable submitted revision, distinct from the working edit. Derive the existing saved count from
acknowledged checkpoints, not merely populated optimistic stats.

On definitive failure, mark that submitted revision unsaved and retain its content for retry. On a
lost response, keep it unconfirmed until the existing reconcile path resolves it. A late success for
revision 1 must not mark a newer unsaved revision 2 as saved. Do not relabel server-saved as
device-saved or alter conflict policy to make the count easier to compute.

**Required regression proof**

Successful checkpoint; validation rejection; exhausted retry; response lost after commit; edit after
submit; out-of-order successes/failures; navigate and return. The count, error and preserved work
agree, and no retry adds a duplicate checkpoint.

**Boundary / stop condition:** If current acknowledgments cannot identify a submitted revision, define
the minimal client-side snapshot association first. A database version change needs A10.

### R05 — Make persistence and submission copy depend on known facts

**Priority:** P1
**Finding IDs:** A05-011; bounded copy-only portion of A05-010
**Owner:** Round durability owner

**Source entry points:** `FairwayRoundSubmitOverlay.tsx` props and error/submitting/success branches;
new/continue round callers and existing emergency-save result.

**Implement**

Pass explicit evidence of retention for the relevant submitted snapshot: in memory, device write
confirmed, server commit confirmed, unknown, or failed as supported by the existing system. Do not
infer local success merely because `emergencySave` was called. Tie retention status to the round and
revision.

Replace unconditional "won't be lost" wording with the fact actually established. Keep the original
failure and a usable retry/return path. A server-committed round stays committed even if later
presentation fails.

A bounded copy fix may stop calling the fixed navigation timer analysis progress: describe opening the
review, not calculating statistics. Preserve existing navigation behavior in this packet. Do not add a
speculative `analysisState` field, query a nonexistent job, or choose an auto-navigation redesign.

**Required regression proof**

Device write true/false/throw; memory-only data; server commit with failed local write; timeout with
unknown commit; review unavailable after successful save. No state promises durability it has not
established; no cosmetic counter claims analysis readiness.

**Boundary / stop condition:** Queryable analysis-job status and the preferred success-screen
navigation remain out of scope.

### R06 — Guard every Stats publication against obsolete scope

**Priority:** P1
**Finding IDs:** A06-003
**Owner:** Stats data owner

**Source entry points:** `src/components/golf/stats/spine-stage/StatsSpineStage.tsx:122-218`;
`src/app/golf/actions/stats-dashboard.ts` read contract. [S05]

**Implement**

Assign a generation to every load and capture the complete authorized result identity. Only the
current generation may publish data, errors or completion. Invalidate on owner unmount and player/scope
replacement. Include local retries, not just the initial effect.

Keep requested scope distinct from displayed-result scope. Switching players must not render the
previous player's values under the new name. An old `finally` must not clear a newer request's pending
state. Use transport cancellation only where the real API supports it; do not pretend a browser
`AbortSignal` serializes through a server action or replaces a publication guard. [P03]

**Required regression proof**

Resolve A after B; reject A after B; old `finally` while B is pending; retry overlaps a refresh; switch
player while old round ID exists; unmount before resolve. Assert data, labels, errors and pending state
all belong to the same current identity. Use deferred promises without needing live credentials.

**Boundary / stop condition:** The picker is disabled during some loads; do not claim rapid picker taps
were reproduced. Test overlap through valid prop/retry paths and the loader directly.

### R07 — Localize Stats refresh, errors and recovery controls

**Priority:** P1
**Finding IDs:** A06-004; A06-005
**Owner:** Stats data/UI owner

**Source entry points:** `StatsSpineStage.tsx:122-178,310-370,406,462-535`; authorized Stats
action/bundle adapters.

**Implement**

Separate initial availability from refresh and per-resource errors. Retrying leak maps reloads only the
authorized leak-map resource and patches that slot. Do not re-fetch all eight resources or unmount the
active drill for one enrichment failure.

Round selection reloads only genuinely round-scoped reads; cross-round measures retain their existing
scope and are not mislabeled as round-specific. Keep the single-round report separation already
implemented. Preserve successful same-scope results during refresh and expose a local retry if refresh
fails.

Keep the round selector and safe escape reachable in error branches and in cold-start cases that still
have selectable rounds. Render it once in stable structure where possible, not as unrelated copies in
each return branch. Apply R06's ownership rules to each independently retried resource.

**Required regression proof**

Leak-only retry preserves other component identities/scroll and does not call unrelated readers. Hard
error with loaded round options still allows a different scope. Scorecard-only cold start retains
applicable options. First load, same-scope refresh, new uncached round and partial failure render
distinct truthful states.

**Boundary / stop condition:** Do not change scoring definitions, comparison baseline, cold-start
thresholds or role-specific sub-navigation.

### R08 — Distinguish profile lookup failure from profile absence

**Priority:** P1
**Finding IDs:** A08-002; A08-004
**Owner:** Auth/read-state owner

**Source entry points:** `src/app/auth/callback/route.ts:196-234`; `src/lib/auth/session.ts:141-167`;
`src/app/golf/(dashboard)/layout.tsx:37-133,276-286`.

**Implement**

Inspect both `data` and `error` from every relevant profile read. Return an explicit
found/absent/failed distinction through the session boundary and its existing retry. Treat true
zero-row results according to current onboarding behavior; transport, permission and unexpected
cardinality errors are not new-user evidence.

When identity is unresolved, preserve the authenticated session and show/reuse a safe retry boundary
rather than sending the person to signup. Do not bypass authorization by choosing a dashboard role from
cached guesses. Keep retries bounded and avoid cache-poisoning a transient failure as durable absence.

The callback also handles Baseball. Preserve its valid redirects and equivalent error distinction
without altering membership or signup eligibility.

**Required regression proof**

Existing coach/player and completed onboarding; genuinely missing profile; first read fail then retry
success; both reads fail; authorization error; malformed/multiple-row result; expired session; repeated
callback without corrupting auth exchange. Assert no misleading new-user redirect on a failed read.

**Boundary / stop condition:** A missing error-bearing field in the session DTO may be added; new auth
routes, join policy, logout retention and RLS changes are not part of this fix.

### R09 — Retain known badge data safely and show refresh failures

**Priority:** P1
**Finding IDs:** A09-003; A09-009
**Owner:** Notification read-state owner

**Source entry points:** `src/contexts/notification-badge-context.tsx:70-244`;
`NotificationBell.tsx:50-64,120-132`; existing feed-panel status region. [S04]

**Implement**

For CoachHelm and unified unread reads, update a count only after a successful valid result. An
explicit successful zero clears it; a failed read does not. Track whether a count is known instead of
treating initialization as confirmed zero.

Preserve previous counts only within the same authorized user/team/role partition. Reset or hide
old-partition values immediately on scope change, and reject late old results. Keep the existing
expired-session circuit breaker.

When an existing bell feed fails to refresh, leave items readable and expose a small non-blocking
stale/retry state using the existing status primitive. Do not change count definitions, caps, clearing
policy, message unread semantics or delivery channels.

**Required regression proof**

7 → failed read remains known 7; 7 → success 0 clears; unknown → failure never claims confirmed zero;
account/team swap hides old count; old request cannot restore it; populated feed retains rows and
usable retry; no new haptic for passive refresh failure.

**Boundary / stop condition:** This shared provider also supplies Messages. Obtain its owner review and
run the seam regression without changing message read semantics.

### R10 — Separate unqueried Calendar ranges from confirmed empty ranges

**Priority:** P1
**Finding IDs:** A07-003
**Owner:** Calendar owner

**Source entry points:** `FairwayCalendar.tsx:1038-1170`; `FairwayAgendaView.tsx:236-285`;
`use-calendar-range-events.ts:336-479`; relevant Month/Week view props.

**Implement**

Propagate exact visible-range availability, pending and error state to body components. Suppress
confirmed-empty copy until that same scope has completed successfully. Retain valid same-range content
during refresh; a different unqueried range gets a matching unresolved region, not the previous range's
events under a new heading.

Keep the existing streaming and banner behavior where useful, but prevent simultaneous "No upcoming
events" and "Loading events" for the same unqueried scope. A failed request remains failure, never a
successful empty array.

**Required regression proof**

Uncached range delayed; confirmed empty success; failed first read; populated same-range refresh; rapid
date changes with reversed responses; changing view without changing scope. At most one truthful
availability interpretation per visible scope.

**Boundary / stop condition:** Do not redefine Agenda's selected-day versus upcoming-range product
meaning.

### R11 — Use canonical event spans for day dots and in-view counts

**Priority:** P2
**Finding IDs:** A07-004; A07-005
**Owner:** Calendar owner

**Source entry points:** `FairwayDayStrip.tsx:108-166`; `FairwayCalendar.tsx:717-751`;
`src/lib/calendar/timezone.ts:190-307`.

**Implement**

Replace start-day-only day-strip membership with the existing `eventRunsOnDay`/`eventDaySpan`
convention used by the visible Calendar bodies. Use the same span-overlap convention for the header's
in-view set. Count distinct event/occurrence identities, not one additional event for every occupied
day.

Preserve canonical all-day/end-boundary semantics; do not recreate them with raw millisecond arithmetic
or assume every calendar day is 24 hours. Ensure the accessible day summary uses the same membership as
the dot.

**Required regression proof**

Single-day; multi-day starting before the visible week; midnight end; all-day exclusive end according
to the current helper; DST transition; different team timezone; one event spanning seven days. Dot,
body, accessible day label and header set agree.

**Boundary / stop condition:** Do not alter recurrence creation or date-window product definitions. A
disagreement in the canonical helper itself is a separate bounded test-backed repair.

### R12 — Use one deterministic event-time formatter on Home

**Priority:** P2
**Finding IDs:** A07-006; duplicate A04-007
**Owner:** Home owner with Calendar review

**Source entry points:**
`src/components/fairway/pages/dashboard/player-dashboard-parts.tsx:104-114,159-165`;
`FairwayPlayerDashboard.tsx:707-711`; `src/lib/calendar/timezone.ts:64-90`. [S06]

**Implement**

Remove the local event-time fork and use `formatEventTime` from `@/lib/calendar/timezone`, which
already validates the zone and has the established fallback. Adapt the current call signature without
changing visible hour format or the fallback policy.

Use this finding's canonical helper, not A04-007's competing suggestion to import a utility with
different invalid/missing-zone semantics. Handle invalid timestamps consistently with the canonical
contract rather than suppressing hydration warnings.

**Required regression proof**

Render identical event props with process zones UTC and America/Los_Angeles; undefined/null/invalid
team timezone; valid non-default zone; DST edge; invalid date. Server and client strings agree for the
same chosen display scope.

**Boundary / stop condition:** Do not make a new product decision to prefer the device zone over the
existing fallback.

### R13 — Keep open event facts current without overwriting edits

**Priority:** P2
**Finding IDs:** A07-002
**Owner:** Calendar owner

**Source entry points:** `FairwayCalendar.tsx:704-705,830-887`;
`FairwayEventDetailDrawer.tsx:191-223`; existing edit submit/conflict boundary.

**Implement**

Keep the open event ID and independently maintain current read-only entity facts. Reconcile
cancellation, permission and deadline changes into the detail drawer; recompute time-based locks at an
appropriate boundary, not only when a new prop arrives.

For a dirty editor, retain its original base snapshot/revision and local edits. New server facts update
restrictions and expose conflict through the existing mechanism; they must not silently reset fields or
substitute a new recurring-series anchor at submit time. If existing server conflict enforcement cannot
protect the operation, block that subtask for A10 rather than fabricate client safety.

A live range lookup miss is not deletion. Use a targeted authorized read, confirmed tombstone/event
signal, or a truthful unresolved state before declaring unavailability.

**Required regression proof**

Cancel while detail open; deadline passes without realtime traffic; event moves outside range; read
fails; permission revoked; delete confirmed; remote edit while local title/time is dirty. No invalid
action remains falsely available and no draft is silently rebased or lost.

**Boundary / stop condition:** This packet does not select a merge strategy or alter recurring-edit
scope semantics.

### R14 — Resolve event deep links outside the loaded range

**Priority:** P2
**Finding IDs:** A07-007
**Owner:** Calendar owner

**Source entry points:** `FairwayCalendar.tsx:872-887`; existing authorized event-by-ID action and
Calendar range adapter.

**Implement**

When an event link is absent after the initial scoped load, make one deduplicated authorized lookup for
that ID. On success, load/reveal its valid date context and open its detail. Guard against obsolete
link/user/team results.

Separate retryable lookup failure from confirmed unavailable/missing/forbidden. Use the same
privacy-safe unavailability wording for cases where existence must not be revealed. Prevent the query
effect from repeatedly reopening the drawer after the user closes it. Preserve a usable return route.

**Required regression proof**

In-range; out-of-range; deleted; other-team denial; transient error then retry; two rapid event IDs;
close drawer; warm and cold link entry. Assert no unauthorized object flash, no duplicate fetch/open
loop, and no silent generic-calendar fallback.

**Boundary / stop condition:** Do not mark notifications read here or change their schema; that is a
separate policy-dependent track.

### R15 — Reserve bottom-navigation pending geometry

**Priority:** P2
**Finding IDs:** A02-002
**Owner:** Shell/controls owner

**Source entry points:** `src/components/fairway/app-shell/NavPending.tsx:50-79`;
`FairwayBottomNav.tsx:193-232`.

**Implement**

Keep a stable pending-indicator slot or absolutely position its visual without changing flex content
height. Preserve current icon/label alignment in idle, pressed, pending and settled states. The
accessible loading status appears only while genuinely pending; hiding a visual must not leave an idle
loading announcement.

Keep active-route identity separate from pending navigation. Do not change destinations, badge caps,
same-tab scroll policy or haptic grammar under this packet.

**Required regression proof**

Measure icon, label and tab bounds before/during/after delayed navigation, at multiple widths and large
text. No unintended displacement beyond rounding tolerance. Cached navigation must not flash a fake
spinner; failed/interrupted navigation clears pending state.

**Boundary / stop condition:** A source assertion that the dot is absolute is not the geometry test.

### R16 — Match Home fallback order and resolve initial schedule state together

**Priority:** P1
**Finding IDs:** A04-001; A04-002
**Owner:** Home owner

**Source entry points:** `FairwayDashboardSkeleton.tsx:77-147`; player/coach dashboard structure;
`DayScheduleSwipe.tsx:79-83,134-141`.

**Implement**

Put the schedule/Today region before KPI placeholders to match both resolved compositions. Reuse the
existing screen frame. When role/account state is unavailable, prefer neutral unresolved slots rather
than fabricating several actions or promising KPI cards a cold-start player cannot receive. Do not add
extra ready-screen content to justify the skeleton.

Resolve timezone, today key and the existing initial landing-day rule into a single publishable state.
Keep the skeleton/unresolved state until that state is ready. Preserve the existing next-populated-day
rule in this packet; whether the module should instead stay on Today is a product decision.

After the user browses a day, a feed/badge update must not repeat auto-landing.

**Required regression proof**

Player with zero rounds; populated player; coach; no events today with later events; timezone arrives
late; refresh after manual date browse. First useful frame has one coherent selected day, ready/skeleton
region order agrees, and no extra screen-reader empty announcement precedes actual content.

**Boundary / stop condition:** Do not redesign the Home hierarchy, rename its purpose, or change
date-selection policy.

### R17 — Remove duplicate outcome haptics and same-value ticks

**Priority:** P1
**Finding IDs:** A01-002; A01-006; A05-003
**Owner:** Feedback owner

**Source entry points:** Paired explicit outcome-haptic + `fairwayToast` handlers in settings/team
settings; `FairwayBottomNav.tsx:148-166`; `FairwayHoleConfig.tsx:267-293`; existing feedback helpers.

**Implement**

Inventory actual emitted events for each affected handler. Where the same result emits both an explicit
success/error haptic and a matching toast-owned outcome, remove the redundant call and keep one
established owner. Retain a preceding accepted press acknowledgment where it already intentionally
exists; it is not the same event as a later save result.

Guard active-tab selection feedback and selected par chips against no-op activation. Do not clear
validation state when the par did not change. Keep More's open action distinct from reselecting a
route.

Do not automatically give `PressTarget` or every link a haptic, or make background toasts vibrate.
Those are separate behavior choices.

**Required regression proof**

Spy on semantic dispatch: accepted press plus at most one terminal result; failure/success toast pairs;
disabled action; canceled touch; same par/tab; changed par/tab; More; preferences off. Verify no
accidental outcome loss from a nearby acknowledgment throttle. Physical feel remains `NOT_RUN` until
device-tested.

**Boundary / stop condition:** No new haptic patterns, amplitudes or preference defaults.

### R18 — Unify haptic rate ownership and cancel scheduled sequences

**Priority:** P2
**Finding IDs:** A01-004; A01-008
**Owner:** Feedback owner with native review

**Source entry points:** `src/lib/fairway/haptics.ts:110-187`; `src/lib/utils/capacitor.ts:54-87`;
live sequence call sites including sign-in.

**Implement**

Move or route existing repeat-event throttling through one shared dispatch boundary; remove the old
duplicate check when moving it. Preserve semantic distinctions: deduplicating repeated detent/tap
traffic must not accidentally swallow the one genuine success/error outcome or a deliberate existing
signature beat.

Return a cancellation handle or accept a cancellation signal for JS-timed sequences. Cancel remaining
beats when their owning interaction is abandoned, unmounts, backgrounds, or the preference becomes
disabled. Own and remove any lifecycle listener. A native bridge promise must not delay visible input
acknowledgment.

**Required regression proof**

Direct and wrapped paths share rate control; no double-throttle suppression; rapid same-kind repeats;
accepted tap then outcome; active signature spacing; cancel between beats; preference changes;
background/unmount; web no-plugin fallback. Count intended dispatches without claiming motor latency.

**Boundary / stop condition:** Do not reschedule or retune the approved sequence merely to make a
generic throttle test pass.

### R19 — One shared connectivity monitor for active consumers

**Priority:** P1
**Finding IDs:** A11-001
**Owner:** State/performance owner

**Source entry points:** `src/hooks/golf/use-connection-status.ts`; `OfflineProvider.tsx`; direct
new-round consumer; `useVisibilityAwareInterval.ts`; existing connection context/store.

**Implement**

Expose the provider's existing monitor through a stable accessor and migrate nested consumers rather
than starting another per-call interval. Inventory out-of-provider use before changing the hook
contract. Keep one interval and at most one shared in-flight probe for the active app scope.

Pause scheduled checks while inactive; perform one deduplicated check on resume/reconnect. Clean up
listener and timeout ownership, including rejected/aborted fetch paths. Consumers unmounting must not
stop a monitor still used by another consumer.

Preserve the distinction between device online, server reachable and optional backend health. A
received HTTP error is not proof that the phone is offline. Do not alter the working sync engine or add
another queue.

**Required regression proof**

Mount provider plus round setup: one timer/request per cadence. Two consumers; unmount one; final
cleanup; Strict Mode setup/cleanup; foreground and online events together; hung/aborted fetch; non-2xx
health response. Assert request counts and listener cleanup with fake time.

**Boundary / stop condition:** Measured energy savings are not claimed from this refactor alone.

### R20 — Make unsupported Button-asChild state combinations explicit

**Priority:** P2
**Finding IDs:** A03-004, API-safety portion only
**Owner:** Shared controls owner

**Source entry points:** `src/components/fairway/controls/button.tsx:165-198`; actual `asChild`
consumers and type tests.

**Implement**

At the current baseline, no live `disabled`+`asChild` consumer is reported. Encode the existing
supported API with a discriminated type: native buttons can accept `busy`/`disabled`; unsupported
link/Slot combinations cannot silently accept those props. Check real consumers, including prop
spreads.

Preserve Link semantics, ref/event composition, prefetch, modifier-click and focus. Do not replace
navigation with a button or implement a new disabled-link pattern without a separate contract. Add an
explanatory development warning only where JavaScript/untyped usage can still bypass the type contract.

Leave new haptic defaults and the proposed faster press timing for the design/feedback track; this
packet prevents silently ignored props.

**Required regression proof**

Type fixtures reject unsupported combinations and accept current ones. Existing route-link behavior and
native button `busy`/`disabled` behavior remain intact. No unsafe `as any` additions or prop deletion
simply to silence a failing consumer.

**Boundary / stop condition:** If a newly discovered consumer needs real `busy`/`disabled` link
support, stop and hand off that explicit behavior requirement instead of inventing it.

### R21 — Apply existing UI contracts without broad restyling

**Priority:** P2
**Finding IDs:** A03-002; A03-006; A03-009; A03-010; residual A03-003; A04-006; A06-001
**Owner:** Shared controls owner plus leased page owners

**Source entry points:** Reported raw-radius sites in Fairway; `StandingStrip.tsx:443`; `surface.tsx`
and `segmented.tsx` comments; seven reported legacy-import sites; Stats wrapper; Home section action
label.

**Implement**

Handle these as small explicit hunks, not a global search/replace. Map raw radius classes to the
already-documented semantic role and compare computed appearance; retain sanctioned sport/brand
exceptions. Correct `StandingStrip`'s error ink to the existing theme-aware token. Remove the refuted
alpha-opacity warning and stale unconsumed-`Surface` claim, preserving why the compile evidence
matters.

For live legacy `Button`/`Input` imports, verify props, refs, form semantics, error names, busy
behavior and haptic side effects before substituting the established Fairway primitive. Do not replace
a toast facade until G05/feedback coordination makes its rendering and side effects clear. Demo-only
sites do not take priority over real routes.

Fix Stats' double gutter at the narrowest route-level owner instead of stripping padding from every
`CoachHelmShell` consumer. Do not change the role-based sub-nav decision. Rename an ambiguous existing
"View all" control with its actual existing object; do not change where it navigates.

**Required regression proof**

Light/dark computed tokens; small and large text; unchanged event/ref/form behavior after import swaps;
no newly duplicated haptics; exact CSS emission for touched classes; one Stats gutter with all existing
other-shell consumers unchanged. Preserve the A03-003 passing compile result.

**Boundary / stop condition:** Do not delete legacy token scales, migrate every icon, remove unproven
dead exports, select new material values, or claim the current screenshot palette has been measured.

### R22 — Honor existing motion and touch-target requirements

**Priority:** P1
**Finding IDs:** A12-002; A12-004
**Owner:** Controls/accessibility owner with CI gate owner

**Source entry points:** `FairwayRoundSubmitOverlay.tsx:419-437,474-478`;
`FairwayHoleConfig.tsx:265-307`; existing reduced-motion tests and CI entry point.

**Implement**

Disable the unguarded ring motion under the supported reduced-motion preference while retaining clear
textual pending feedback. Reuse the existing hook/variant rather than a new global animation-kill rule.

Bring par-selector hit areas to the already-adopted coarse-pointer target, using a responsive row
arrangement if necessary. The 104px fixed column is the yardage column; available par width is the
remaining flexible track after padding and gaps. Do not assume three larger chips fit because of that
number. Do not overlap neighboring hitboxes or change accepted par values.

Add real rendered reduced-motion and target-bounds tests. Separately register the regression coverage
in the established test/CI system after checking its actual discovery rules. A file-level presence of
`useReducedMotion` is not per-animation coverage; avoid a simplistic global grep that also rejects
correctly scoped CSS.

**Required regression proof**

Reduced-motion computed animation is disabled and pending text remains; normal preference unchanged;
touch boxes measured at 320/390/430 CSS px with larger text; yardage stays usable; error links and
focus visible. Demonstrate the intended CI job actually ran the failing-then-fixed case.

**Boundary / stop condition:** CI ownership/discovery changes require the gate owner's approval, not a
new product decision. A 36px declaration alone neither proves physical hit size nor certifies all WCAG
requirements.

### R23 — Release travel-export blob resources safely

**Priority:** P3
**Finding IDs:** A11-004
**Owner:** Document/export owner; coordinator assigns the previously unowned file

**Source entry points:** `src/components/fairway/pages/travel/FairwayTravel.tsx:296-310`; established
download cleanup helper/pattern.

**Implement**

Capture each created object URL and release it through the repository's proven
delayed/consumer-complete cleanup pattern. Remove temporary anchors on success and exception. Repeated
exports must not overwrite the cleanup reference for an earlier export.

Do not revoke synchronously before the browser consumes the click. If a reusable export helper already
owns cleanup, use it rather than adding another independent timer policy. Keep CSV values, download
names and authorization unchanged. [P06]

**Required regression proof**

Repeated exports create and eventually revoke matching URLs; thrown click/setup still cleans resources
safely; actual downloaded file is nonempty and named correctly; component unmount does not prematurely
invalidate a download that just began.

**Boundary / stop condition:** No change to expense/export features or CSV content semantics.

### R24 — Narrow StageRouter announcements without changing Back policy

**Priority:** P2
**Finding IDs:** A12-001; limited shared-file seam with A02-003
**Owner:** Stage/shell owner

**Source entry points:** `src/components/fairway/modules/StageRouter.tsx:130-181`;
Stats/CoachHelm/other live consumers.

**Implement**

Remove the broad live-region role from the rich stage subtree. Retain deliberate focus management on an
actual stage change; use a small status string only if focus alone fails the verified task. Routine
metric text refresh must not re-announce the entire stage.

Do not combine this with push/replace history changes, blanket scroll suppression, new stage caching or
remount architecture. Coordinate the same-file lease with the separate approved Back-policy work.

**Required regression proof**

Stage change gives one useful orientation cue; metric refresh does not re-read the panel; initial mount
does not steal focus; focused interactive elements remain usable. Validate with an accessibility tree
and VoiceOver, not by promising exactly what every AT will announce from source alone.

**Boundary / stop condition:** The accepted drill/sibling Back decision is implemented elsewhere.

### R25 — Restore library controls through the existing view-state contract

**Priority:** P2
**Finding IDs:** A04-004, narrow route-local repair
**Owner:** Rounds-library owner with state-contract review

**Source entry points:** `FairwayRoundsLibrary.tsx:234-241`; existing C04/view-state owner above the
remount boundary; current library/detail navigation.

**Implement**

Preserve grouping, round-type filter, player selection, search and semantic row anchor when leaving and
returning to the same authorized library scope. Reuse the main program's existing C04 owner. If it does
not yet exist, this packet is contract-blocked rather than permission to create another cache
framework.

Do not change the round tap destination or global history policy. Avoid putting private free-text
search into URLs or telemetry merely to persist it; use the approved partitioned view-state mechanism
and keep intentionally shareable filters consistent with existing URL rules. Bound retention and clear
private partitions on account/team access changes.

Restore a valid entity anchor after data/row height settles, not repeatedly on each re-render. Handle a
deleted anchor gracefully. This narrow restoration can be fixed without claiming all pages remain
mounted.

**Required regression proof**

Set filters/search/grouping, open existing detail route, return via actual Back and app navigation.
Restore values and visible row. Test remount, deleted row, new data insertion, account/team switch,
expired restoration entry and missing storage. No cross-user data appears.

**Boundary / stop condition:** Global `staleTimes`, template conversion and navigation redesign remain
excluded pending architecture verification.

---

## 5. Integration-gated engineering packets

These are not product-choice tickets, but they are not safe blind one-file edits. They need native
compilation, consumer verification, infrastructure, or shared-owner coordination before landing.
Prepare tests and bounded code changes where permitted; do not claim completion until their gate
clears.

### G01 — Native route/origin classification parity

**Priority:** P0
**Finding IDs:** A01-001; duplicate A08-001
**Owner:** Native owner + auth/Baseball/admin reviewers

**Source entry points:** `ios/App/App/GolfBridgeViewController.swift:82-96`; `SceneDelegate.swift:16-37`;
`safe-redirect.ts`; native configuration/associated links. [S07]

**Implement within the gate**

Replace substring classification with parsed scheme, exact permitted host/port and segment-boundary
paths. Derive or verify the allowed destinations against the already-existing web redirect and
universal-link contracts; routing permission is never user authorization. Include currently legitimate
admin and Baseball invite paths without exposing them to unauthorized accounts.

An unrelated host with `/golf/` in its path/query is not internal. Bare `/golf`, legal paths, percent
encoding, trailing slashes, redirects and bootstrap URLs need explicit cases. Do not broaden
`allowNavigation` or accept every same-host path as a shortcut.

Unmatched external navigation should follow the existing safe external-link policy without hard-reloading
the active task to login. If existing policies disagree, block that route case for a scoped
security/architecture decision. KVO is an observer, not proof that untrusted navigation was prevented
before content loaded; evaluate integration with Capacitor's supported navigation handling, without
replacing its delegate blindly.

**Required regression proof**

Swift compile of the actual patch; unit cases for allowed and adversarial URLs; cold/warm auth and
universal-link checks; actual same-document navigation observed in WKWebView; negative unauthorized
admin/Baseball cases. Do not use a real super-admin credential as the fixture.

**Gate:** No usable iOS build path = `NOT_RUN`/`BLOCKED`, not an exception to compilation. Do not bypass
workspace/branch rules just to match an `ios/*` CI filter; arrange an approved native CI path or
build-host evidence.

### G02 — Synchronize native backgrounds with the existing theme

**Priority:** P1
**Finding IDs:** A01-003
**Owner:** Native owner + shared theme owner

**Source entry points:** Native bridge backgrounds; theme/status-bar bridge; LaunchScreen storyboard;
SplashScreen configuration.

**Implement within the gate**

Use the same existing theme preference and palette roles across native view, WebView and scroll
background, with a compatible capability-gated update path for old binaries. Read native-persisted theme
state before the first controllable WebView paint; JS `localStorage` is not automatically
native-readable.

Synchronize explicit light/dark choice and system-following behavior without exposing an arbitrary
native setter to off-origin pages. Align the launch-to-first-content handoff as closely as the platform
supports. The OS launch storyboard is not a place to execute arbitrary preference-reading code; use
supported appearance assets and a controlled first native surface where an app override differs from
system appearance.

**Required regression proof**

Compile plus device screenshots/recordings for system dark with app light, system light with app dark,
follow-system, cold launch, elastic overscroll, theme change, and old-binary fallback. No double
safe-area padding.

**Gate:** Use existing color roles. This is not permission to introduce a new palette, splash sequence or
broader glass redesign.

### G03 — Remove indiscriminate cold-start HTTP cache invalidation safely

**Priority:** P2
**Finding IDs:** A01-005
**Owner:** Native owner + release/recovery owner

**Source entry points:** `GolfBridgeViewController.swift:22-28`; current asset `Cache-Control` and
release identity/recovery handling. [S07]

**Implement within the gate**

Measure the cold-start request sequence and establish how versioned assets, HTML validation and service
workers currently interact. Prototype removal of the unconditional HTTP memory/disk wipe, preserving
normal HTTP validation and the controlled recovery path.

Do not replace it with an unconditional wipe on every deployment SHA: immutable versioned assets can be
reused across releases, and a release change alone is not corruption. If a targeted reset is actually
necessary, sequence it before the affected navigation and scope it to the relevant resources. Keep
cookies, local databases, auth and drafts untouched.

**Required regression proof**

Same-release cold launches, changed web release, rollback-compatible assets, actual missing chunk,
slow/offline network, retained auth and draft. Capture requests/timing before and after; the source's
asynchronous wipe does not prove every asset always refetched.

**Gate:** No measured release/asset compatibility = do not release the cache change. Native launch speed
improvements remain unclaimed until measured.

### G04 — Remove inert keyboard configuration without breaking the real owner

**Priority:** P3
**Finding IDs:** A01-009
**Owner:** Native/config owner

**Source entry points:** `capacitor.config.ts:62-68`; locked installed keyboard plugin types/native
implementation; `CapacitorProvider.tsx:125-192`; existing keyboard-aware consumers.

**Implement within the gate**

Verify the actual locked plugin and supported config keys. Remove or accurately document ignored
`scrollAssist`/`scrollPadding` entries; preserve Android-only behavior that actually matters to Android.

Keep the current effective resize/JS compensation behavior for this cleanup. Do not casually switch
`ionic` to `body` or `native`, remove JS height publication, or call the old no-op configuration a proven
duplicate-resize bug. If choosing `none` to make current intent explicit, treat that as a separate native
equivalence test, not a text-only cleanup. [P04]

**Required regression proof**

Config contract check against installed types; native rebuild when generated config changes; round entry,
forms and messaging keyboard seam remain unchanged; no new gap or double subtraction.

**Gate:** Do not change haptic, push or splash config in the same cleanup.

### G05 — Mount the intended toast renderer exactly once

**Priority:** P1
**Finding IDs:** A03-001
**Owner:** Root composition owner + feedback + messaging sign-off

**Source entry points:** Root `src/app/layout.tsx:13,144`; `ui/sonner.tsx`;
`fairway/feedback/ToastStack.tsx`; page-local/demo toaster mounts.

**Implement within the gate**

Inventory actual mounted `Toaster` instances and the installed Sonner behavior. Point the intended
GolfHelm production queue at its canonical Fairway renderer without creating duplicate subscribers,
losing queued notifications, or unintentionally restyling Baseball/admin/marketing.

If root serves multiple products, preserve their presentation through supported scoped renderer
configuration rather than blindly swapping a global import. Retire redundant production mounts only after
verifying toast routing. Keep durations, actions, accessibility and R17's haptic ownership stable. Use
existing keyboard/nav clearance roles rather than a new fixed offset.

**Required regression proof**

One toast produces one visible panel; all existing facade calls arrive; action/cancel works; dark/large
text; keyboard; native foreground path; non-Golf routes; no double haptics or panel stranded behind a
sheet.

**Gate:** Root-layout and messaging agreement are merge gates. The claim that every consumer must use an
identical root style is not a new product decision hidden in this repair.

### G06 — Repair overlay stacking with compatibility, not a numeric arms race

**Priority:** P2
**Finding IDs:** A03-005
**Owner:** Overlay owner + all touched surface owners

**Source entry points:** Existing `--z-*` and `--fw-z-*` definitions; `ModalShell`/`Sheet`; date picker
and Select portal targets/styles.

**Implement within the gate**

Document the effective portal, stacking context, clipping and focus/inert ownership of the failing
modal-to-popover chain. Select the existing canonical Fairway roles for touched consumers and keep
compatibility aliases for proven legacy consumers.

Make modal-owned dropdowns reachable and visible inside the active modal interaction scope. A root portal
can be visually above a modal yet inert or outside its focus trap; test both. Do not delete the legacy
ladder or canonize z-index 1000 globally to fix one chain. [P05]

**Required regression proof**

Date picker inside modal; Select inside sheet; nested confirmation; toast alongside modal;
dismissal/focus return; keyboard navigation; screen reader; legacy/admin consumer. Demonstrate real
rendered order and usable hit targets.

**Gate:** No new overlay library or global stacking-scale redesign. Unmounted legacy issues stay
maintenance records.

### G07 — Make existing document downloads reliable across supported platforms

**Priority:** P2
**Finding IDs:** A01-007
**Owner:** Document owner + native owner

**Source entry points:** `documents.ts:1099-1107`; `DocumentPreview`/`ImagePreview`/`PDFViewer`;
`FairwayRecruitDocuments`; existing proven download helpers.

**Implement within the gate**

Reproduce each mounted Download path in the installed app. Reuse an existing validated download strategy
for that platform instead of duplicating synthetic cross-origin anchors. A signed attachment header may
help browser behavior; it does not by itself prove a WKWebView save workflow. Likewise a blob URL that
works on desktop is not automatic native acceptance.

Keep authorization, MIME/filename handling, bounded resource usage, cancellation and signed-URL secrecy.
Route preview versus download according to existing semantics. Use the same delayed resource cleanup as
R23. New native plugins or a new share-versus-save product flow require a separate approved contract.

**Required regression proof**

Small/large PDF and image; expired URL; denied access; canceled system interaction; return to same app
context; downloaded bytes/name correct; no premature blob revocation; no signed URL logged.

**Gate:** If no supported existing strategy works on the installed native build, report the required
native capability as blocked rather than label an untested blob conversion fixed.

---

## 6. Complete disposition of the 95 original findings

`CORE` means a bounded packet in Section 4. `GATED` means Section 5's prerequisite must clear.
`PRODUCT` means excluded even when the decision was already recorded. `VERIFY` means a claim/risk needs
a reachable-path or runtime check before any repair is authorized. `SCHEMA` means A10/governed
data-contract work. `NO_FIX` means pass, fixed, refuted or currently non-live; retain evidence instead of
inflating repair counts. `PARTIAL` separates a safe subset from a deferred policy/architecture change.

Duplicate findings map to the same repair, not separate competing PRs. The original severity and evidence
labels remain in the canonical register; this disposition is not a rewrite of that historical record.

### A01

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A01-001 | GATED | G01 | Native origin/path correctness; one packet with A08-001. Native build required. |
| A01-002 | CORE | R17 | Remove paired duplicate outcomes; do not invent new haptic policy. |
| A01-003 | GATED | G02 | Existing-theme parity across native surfaces; capability/device checks. |
| A01-004 | CORE | R18 | One rate owner; preserve distinct outcomes and approved sequences. |
| A01-005 | GATED | G03 | Measure/prototype HTTP cache change; no automatic per-release wipe. |
| A01-006 | CORE | R17 | No-op active-tab haptic suppression only. |
| A01-007 | GATED | G07 | Actual native download proof required; blob/header alone is not proof. |
| A01-008 | CORE | R18 | Cancel owned pending sequence beats; low-priority hardening. |
| A01-009 | GATED | G04 | Remove inert config; retain real JS keyboard ownership. |

### A02

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A02-001 | CORE | R01 | Single recovery owner plus preservation and budget tests. |
| A02-002 | CORE | R15 | Stable pending-dot geometry. |
| A02-003 | PRODUCT | Separate decision track | Push drills/replace siblings is recorded; do not mix it into repair-only work. |
| A02-004 | VERIFY | Architecture probe | Measure segment/key remounts; no blind template-to-layout conversion. |
| A02-005 | VERIFY | Navigation/cache probe | No guaranteed Back-skeleton inference; test actual Next version and route path. |
| A02-006 | NO_FIX | Latent lead | No current stage-param collision; do not ship speculative scoping changes. |
| A02-007 | PARTIAL | R01 | Idempotent listener lifecycle while consolidating; not a separate live-incident repair. |

### A03

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A03-001 | GATED | G05 | Single intended renderer and root/messaging sign-off. |
| A03-002 | CORE | R21 | Semantic-radius migration at verified sites only. |
| A03-003 | NO_FIX | R21 comment cleanup | CSS allegation refuted. Keep passing emission evidence; fix misleading comment only. |
| A03-004 | PARTIAL | R20 | Unsupported `asChild` API combinations only; timing/haptic design held. |
| A03-005 | GATED | G06 | Portal/focus/layer correctness, preserve legacy aliases. |
| A03-006 | CORE | R21 | Remove stale unconsumed-`Surface` statement. |
| A03-007 | NO_FIX | Maintenance inventory | Do not delete exports from static-import counts alone. |
| A03-008 | PRODUCT | Design-system track | Icon-family preference/optical redesign not decided here. |
| A03-009 | CORE | R21 | Verified live primitive substitutions with API/behavior parity. |
| A03-010 | CORE | R21 | Existing theme-aware error ink. |
| A03-011 | PRODUCT | D / feedback policy | Whether `PressTarget` should buzz remains a product choice. |

### A04

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A04-001 | CORE | R16 | Fallback region order and known account-state handling. |
| A04-002 | CORE | R16 | One coherent initial schedule landing state; preserve current rule. |
| A04-003 | PRODUCT | C07/provenance track | Disclose normalized metrics with approved vocabulary; do not change Best/Avg meaning here. |
| A04-004 | PARTIAL | R25 | Route-local restoration through existing C04; no global caching rewrite. |
| A04-005 | PRODUCT | Recorded route decision | Completed-round destination change is outside repair-only scope. |
| A04-006 | CORE | R21 | Disambiguate existing "View all" labels without changing destinations. |
| A04-007 | CORE | R12 | Duplicate of A07-006; use Calendar canonical formatter, not competing helper. |
| A04-008 | NO_FIX | PASS retained | Existing unfinished-round rows have scoped Continue links. |
| A04-009 | NO_FIX | PASS retained | Coach Home is already a distinct composition. |

### A05

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A05-001 | CORE | R03 | Editable string buffers, strict boundary validation. |
| A05-002 | PRODUCT | Recorded par decision held | No par-6 clamping or historical scoring changes in this plan. |
| A05-003 | CORE | R17 | Same selected par: no feedback or error clearing. |
| A05-004 | CORE | R03 | Field/nine-specific visible and programmatic errors. |
| A05-005 | NO_FIX | FIXED retained | Content-keyed reseed already fixed at reported baseline. |
| A05-006 | PRODUCT | D8 / edit-preservation policy | Replacement warning versus prevention/preservation requires explicit contract. |
| A05-007 | SCHEMA | D7 / A06+A10 | Physical-hole identity needs full consumer/data investigation. |
| A05-008 | CORE | R02 | Cloud-tee completeness and final start boundary. |
| A05-009 | CORE | R04 | Separate saved checkpoint state from entered stats. |
| A05-010 | PARTIAL | R05 | Truthful copy now; real analysis-job status/navigation redesign held. |
| A05-011 | CORE | R05 | Evidence-based persistence wording. |
| A05-012 | NO_FIX | Dead API maintenance | No live conflict path; do not wire or rewrite it. |
| A05-013 | NO_FIX | Dead API maintenance | Unused `cancelSync` is not a current user bug. |
| A05-014 | VERIFY | Qualifier race probe | Exercise real lookup/start overlap before changing the flow. |
| A05-015 | CORE | R02 | Second start path plus final completeness guard; not fixed by A05-008 alone. |

### A06

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A06-001 | CORE | R21 | Narrow Stats single-gutter repair, preserving other shell consumers. |
| A06-002 | PRODUCT | D9 / role strip decision | Recorded role-based sub-nav change remains separate. |
| A06-003 | CORE | R06 | Generation and identity-safe publication. |
| A06-004 | CORE | R07 | Resource-local retry/refresh. |
| A06-005 | CORE | R07 | Keep applicable scope selector in error/cold-start. |
| A06-006 | PRODUCT | Prediction presentation | Range/track-record semantics need verified model provenance; no invented hit-rate claim. |
| A06-007 | PRODUCT | C07/provenance track | Per-metric denominator display/API contract separate; no hidden calculator rewrite. |
| A06-008 | SCHEMA | A10 source freshness | Determine live versus snapshot-backed reads before adding timestamp contract. |

### A07

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A07-001 | PRODUCT | Event-bound action design | Named Respond target/gesture semantics need the agreed UI contract. |
| A07-002 | PARTIAL | R13 | Read-only current facts now; dirty/recurrence conflict changes need existing authoritative contract. |
| A07-003 | CORE | R10 | No confirmed-empty message for unqueried range. |
| A07-004 | CORE | R11 | Canonical multi-day membership for day strip. |
| A07-005 | CORE | R11 | Same visible event set for count; dedupe occurrences. |
| A07-006 | CORE | R12 | Canonical explicit timezone fallback on Home. |
| A07-007 | CORE | R14 | Authorized out-of-range event lookup and honest failure. |
| A07-008 | PRODUCT | Calendar composition | Control/header/member-rail redesign stays in premium UI track. |
| A07-009 | NO_FIX | Unmounted legacy evidence | Resolve conflict with A11-003/A11-008; no live patch assumed. |

### A08

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A08-001 | GATED | G01 | Same native classification chain as A01-001; one owner. |
| A08-002 | CORE | R08 | OAuth profile failure is not profile absence. |
| A08-003 | PRODUCT | Sign-out retention/confirmation | Do not block security-driven sign-out or choose local-data retention here. |
| A08-004 | CORE | R08 | Central session/retry preserves failed-versus-absent identity. |
| A08-005 | PRODUCT | D3 / recorded join policy | Auto-join/approval change is excluded; no queue deletion. |

### A09

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A09-001 | PRODUCT | D5 / recorded badge policy | Split-category badges are not a mechanical repair. |
| A09-002 | PRODUCT | Coach Operations signal | Real signal versus removing wiring requires definition. |
| A09-003 | CORE | R09 | Known counts survive same-scope failure; old scope never leaks. |
| A09-004 | SCHEMA | Announcement seen/read contract | Visibility frontier and persistence must be verified; not mount = read. |
| A09-005 | PRODUCT | D4 / recorded foreground policy | Native banner/sound and toast suppression changes remain separate. |
| A09-006 | PRODUCT | D1 / notification delivery | New in-app records/channel fallback require event/dedupe policy. |
| A09-007 | PRODUCT | Notification read timing | Do not mark read merely on tap/navigation; target-visible semantics required. |
| A09-008 | PRODUCT | Badge display cap | More aggregates and item counts may intentionally differ; no blind cap unification. |
| A09-009 | CORE | R09 | Non-blocking existing-feed stale/retry state. |

### A11

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A11-001 | CORE | R19 | One active connectivity monitor across nested consumers. |
| A11-002 | CORE | R01 | Duplicate recovery chain merged with A02-001. |
| A11-003 | VERIFY | Reachability gate | A07-009 says legacy Calendar is unmounted; check before consolidating distinct feeds. |
| A11-004 | CORE | R23 | Lease unowned Travel file and clean export URLs safely. |
| A11-005 | PRODUCT | D2 / privacy authority | Do not change collection/masking/recording policy under technical cleanup. |
| A11-006 | NO_FIX | PASS retained | Working sync singleton is a reuse reference, not a repair. |
| A11-007 | NO_FIX | Legacy maintenance | No primary mobile blast radius demonstrated. |
| A11-008 | VERIFY | Reachability + profiler gate | Do not remove live styling based on an unmounted legacy blur example. |

### A12

| Original ID | Disposition | Packet / destination | Action boundary |
|---|---|---|---|
| A12-001 | CORE | R24 | Narrow stage announcements; no Back policy changes. |
| A12-002 | PARTIAL | R22 | Repair actual ring; CI discovery wiring needs gate-owner verification. |
| A12-003 | CORE | R02 + R03 | Whole-flow validation plus field-level associations; no false conformance certification. |
| A12-004 | CORE | R22 | Adopt existing target goal with responsive measurement, not blind class replacement. |
| A12-005 | CORE | R01 | Actual multi-handler, budget-survival and active-work regression tests. |

---

## 7. Product and governance handoff: do not implement accidentally

### 7.1 Decisions already recorded, but outside this repair queue

| Topic | Recorded direction in the supplied register | Boundary here |
|---|---|---|
| Stats strip | Role-based: no player strip on Stats; coaches retain real tabs. | Do not reinterpret the ambiguous word "Leave." Keep this in its own product change with role fixtures. |
| Stage Back | Push drills/details; replace siblings. | R24 may fix announcements; it may not change history behavior. |
| Team badge | Separate announcements/tasks/travel counts. | R09 corrects failure handling only, not category definitions or clearing actions. |
| Round destination | Everything opens Round Review. | R25 restores library state without redirecting any row. Preserve unfinished-round Continue semantics in the product implementation. |
| Join code | Both entry points auto-join. | No dropping approval data/UI or changing membership authorization here. |
| Par 6 | Validator limited to 3–5 with visible clamping. | Do not execute as cleanup. Changing historical par changes scoring meaning; require a separately reviewed data-preservation/migration strategy, not a presentation clamp. |
| Foreground push | In-app toast, suppression/defer during active entry. | R17 removes duplicates at proven handlers; it does not change notification channels/config. |

### 7.2 Open choices or missing truth

Privacy collection/masking; whether an analysis job exists; model confidence presentation; coach
attention signal; qualifier/development notifications; physical-hole identity; dirty-baseline replacement
policy; `PressTarget` defaults; globally retained page architecture; badge caps; and
notification/announcement read-frontier semantics stay outside the mechanical queue.

These are not all questions for the owner to answer from memory. Some are repository/provider/database
facts the appropriate owner must verify. For example, whether a real analysis job exists is an
engineering discovery task; creating one if it does not exist is new scope. Whether a percent is a
calibrated interval-hit probability requires model/cohort evidence, not merely a formatter change.

### 7.3 Known contradictory or overstated claims to correct in the handoff

**Legacy Calendar:** A11-003/A11-008 must share A07-009's current mount-graph result. Even if a
notifications count and a notifications feed both run, different projections are not automatically
duplicate reads; prove overlapping purpose before removing one.

**Navigation:** measure Link-to-root, browser/native Back, query-only stage changes, refresh, and
document reload separately. A zero dynamic stale time and a `template` filename do not establish
identical behavior for all of them. Current Next template documentation also distinguishes segment-level
changes from deeper navigation and search changes. [P01] [P02]

**Accessibility:** do not claim that `aria-live="polite"` always reads the whole panel, that a specific
ARIA attribute is the only conforming technique, or that any progress animation necessarily violates
WCAG. The proposed repairs are worthwhile; formal conclusions require the actual behavior and applicable
criteria. [P05] [P07]

**Native cache:** asynchronous cache removal after initial load begins does not prove every requested
asset misses the cache. Measure before claiming a speedup.

**Saved data:** a late confirmed save may cover an older revision only. A single boolean `isSaved` or
`isLocallyPersisted` must not make newer edits look durable.

**Counts:** do not repeat "roughly 83 real repairs" as an implementation count. Findings overlap, contain
open choices, and include unverified or refuted cases. Use packet completion and evidence, not a larger
defect number, to report progress.

---

## 8. Verification harness and commands

### 8.1 Build tests before broad edits

Create controlled tests for the reported mechanism, run them against the baseline where feasible, and
then apply the fix. A test that never fails on the old mechanism needs scrutiny. Avoid
source-string-only tests for behavior, though compile assertions are appropriate for the specific
CSS-emission allegation.

Use deferred promises for stale-response tests; fake time for polling/haptic scheduling; a real
DOM/rendered route for geometry; scoped local/staging fixtures for authorized reads/writes; and the
installed iPhone build for keyboard, native routing, downloads and physical feedback.

Keep test state local and synthetic. Do not generate real team invitations, send customer notifications,
mutate production, or run adversarial writes against the production project. Do not dump auth cookies,
signed URLs, private texts or student data into traces.

### 8.2 Required shared test cases

| ID | Invariant | Main packets |
|---|---|---|
| FIX-T01 | A generic network failure never triggers document replacement. | R01 |
| FIX-T02 | One eligible error, several listeners, one bounded recovery decision; hydration does not reset budget. | R01 |
| FIX-T03 | Dirty/unknown/durability-unconfirmed work blocks automatic destructive recovery. | R01, R04, R05 |
| FIX-T04 | Every start path validates the complete selected hole set and establishes the existing durable parent. | R02 |
| FIX-T05 | Empty numeric editing stays editable and the correct invalid field is identified. | R03 |
| FIX-T06 | Save count and preservation wording describe the actual acknowledged revision. | R04, R05 |
| FIX-T07 | Obsolete success, error and `finally` cannot publish into a newer scope. | R06, R09, R10, R14 |
| FIX-T08 | Optional retry keeps valid screen content and recovery controls available. | R07, R09, R10 |
| FIX-T09 | Profile lookup failure never masquerades as new-user onboarding. | R08 |
| FIX-T10 | Day dots, visible-event count, event body and timezone formatting agree. | R11, R12 |
| FIX-T11 | Open event facts refresh without wiping local edits; range absence is not removal. | R13, R14 |
| FIX-T12 | Nav/control geometry does not shift during pending state. | R15, R20–R22 |
| FIX-T13 | Initial Home fallback resolves into the same region order and one valid day selection. | R16 |
| FIX-T14 | One intended feedback event; no same-value/cancelled/late sequence pulse. | R17, R18 |
| FIX-T15 | One connectivity monitor, no overlapping duplicate probes, clean lifecycle. | R19 |
| FIX-T16 | Unsupported component API combinations are rejected; existing form/link behavior preserved. | R20, R21 |
| FIX-T17 | Motion preference, touch bounds, accessible errors and focused interactions work in the mounted UI. | R03, R22, R24 |
| FIX-T18 | Every created export URL is safely released after use; bytes actually download. | R23, G07 |
| FIX-T19 | Library controls/anchor restore within the authorized scope. | R25 |
| FIX-T20 | Native allowed/adversarial URLs, theme and cache paths compile and pass actual bridge checks. | G01–G04 |
| FIX-T21 | One toast renderer and usable modal-owned dropdowns across products. | G05, G06 |
| FIX-T22 | Shared changes do not regress Messages, Baseball, admin, or other live consumers. | All shared packets |

Tests may overlap packets intentionally. Keep existing audit IDs as aliases in their descriptions so
history remains traceable; do not silently renumber the original register.

### 8.3 Repository commands: use verified scripts, not invented aliases

At the inspected baseline, package scripts include `typecheck`, `lint`, `test:run`, `test:integration`,
`test:rls`, `test:e2e`, `build`, `docs:check`, `knowledge:map`, `knowledge:context`, and `worktrees`.
`test` is the interactive Vitest command; use `test:run` for a finite unit run. The repository serializes
heavy commands. [S08]

After verifying current scripts and within the assigned workspace:

```bash
# Read-only preflight; do not assume main or a safe upstream.
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
npm run worktrees

# Map actual touched files; replace placeholders with leased explicit paths.
# npm run knowledge:map -- --files <leased-path-1> <leased-path-2>
# npm run knowledge:context -- --files <leased-path-1> --task "Rxx repair"

# Finite core gates. Run in an isolated, dependency-ready workspace.
set -eu
npm run typecheck
npm run lint
npm run test:run
```

Run targeted test files during development and the required integrated suite afterward.
Integration/RLS jobs require the sanctioned isolated backend and fixtures; `NOT_RUN` is the correct
result if unavailable. A browser fixture with mocked actions is not a database test.

`npm run build` invokes repository prebuild/postbuild hooks, including service-worker stamping in the
inspected package. It is not a purely read-only command; keep generated outputs inside the workspace
lease and record them. Supply approved test environment variables rather than copying production
secrets. Inspect current docs-check dependencies before executing it against any remote service.

Capture each command's true exit status before running `echo`, `tail` or another command. Do not pipe a
failing suite into a successful last process and call it green. A minimal safe logging pattern is:

```bash
mkdir -p repair-evidence
if npm run test:run > repair-evidence/unit.log 2>&1; then
  printf 'unit_status=PASS\n' > repair-evidence/unit.status
else
  code=$?
  printf 'unit_status=FAIL\nexit_code=%s\n' "$code" > repair-evidence/unit.status
  exit "$code"
fi
```

Native compilation uses the repository's supported Xcode/CircleCI setup and exact resolved dependencies,
not an unverified generic build command. An iOS branch-filter gap is a blocker to resolve, not permission
to merge uncompiled Swift.

### 8.4 Closure states

Use `READY`, `IN_PROGRESS`, `BLOCKED_OWNER`, `BLOCKED_CONTRACT`, `BLOCKED_INFRA`,
`IMPLEMENTED_UNVERIFIED`, `VERIFIED_UNIT`, `VERIFIED_INTEGRATED`, `VERIFIED_DEVICE`, `FIXED_UPSTREAM`,
`REFUTED`, and `DEFERRED_PRODUCT` as explicit status values. A packet is complete only at its required
level, not whenever one unit test passes.

For each executed gate, record `PASS`, `FAIL` or `NOT_RUN`, with the actual command/device, timestamp and
evidence path. Do not interpret a skipped suite or an absent authenticated fixture as `PASS`.

---

## 9. Repair manifest and final acceptance

Keep a sidecar repair manifest in the audit/repair output area rather than overwriting per-lane history.
The supplied canonical `premium-audit/findings.jsonl` contains the coordinator override and A05-015; do
not regenerate it solely from incomplete lane files. Update original records through the authorized
coordinator workflow only.

A proposed per-packet record:

```json
{
  "packet": "R02",
  "finding_ids": ["A05-008", "A05-015", "A12-003"],
  "audit_base": "3c90f9f174ac103af5fafc600aebecd98243decc",
  "repair_base": "<actual-commit>",
  "owner": "<assigned-owner>",
  "leased_files": ["<exact-path>"],
  "product_changes": [],
  "dependencies": [],
  "status": "READY",
  "unit": "NOT_RUN",
  "integrated": "NOT_RUN",
  "device": "NOT_RUN",
  "native_build": null,
  "evidence": [],
  "remaining_blockers": []
}
```

Do not put real input payloads in this manifest. Record the operation/fixture identity needed for
reproducibility without exposing private content.

### Merge acceptance

A repair must demonstrate its specific invariant, preserve existing behavior outside its boundary, and
have tests that run in the required pipeline. Shared-file changes include their full consumer checks, not
only the one screen that reported the problem. Exclude unrelated generated churn and never resolve a
conflict by replacing a shared file wholesale.

### Release acceptance

Deployment is a separate authorized action. Before recommending release, record the web SHA, native
version/build, schema environment, device/OS, preferences and network conditions. Run the actual main
journeys: start and resume a valid round; reject incomplete setup; edit/recover a field; handle a failed
checkpoint; inspect/retry Stats; follow an event link; return to a filtered library; exercise key shared
Messages controls without changing messaging code.

A successful core web repair can be merged separately from a blocked native package when the repository's
requirements permit it. Do not call the entire native experience fixed until G01–G04/G07 and their
physical/native evidence are complete. Conversely, do not hold a safe yardage-validation repair hostage to
an unrelated visual redesign decision.

---

## 10. Coordinator prompt

> Execute the GolfHelm Non-Product Engineering Fix Plan against a refreshed repair base. Use the 95-ID
> disposition table as the scope boundary, not the audit's rough repair count. Begin with exact file
> leases and the actual global writer budget. The audit reports more worktrees than the default cap; do
> not create or remove workspaces outside the sanctioned lifecycle.
>
> Start R01, R02–R03 and R06–R07 as capacity allows. Establish tests for the mechanism, implement bounded
> fixes, and preserve the original finding IDs in the evidence. Continue through the remaining CORE
> packets; honor contract and infrastructure blockers. G01–G07 may be prepared but cannot be called
> complete without their specific native/shared-owner/integration gates.
>
> Do not choose or implement product decisions: par conversion, join approval, round destinations, stage
> history, badge meaning/caps, notification delivery/read policy, analysis-job creation, confidence
> language, telemetry privacy or the premium visual redesign. Do not touch messaging-owned implementation
> or database/RLS/migrations. Ask the correct owner only for a genuinely unresolved boundary; do not
> repeatedly ask for approval of ordinary generation guards, error checks or safe cleanup.
>
> Correct unsafe proposed shortcuts: `.every` needs nonempty exact coverage; saved counts must not delete
> entered stats; late acknowledgments cannot certify newer revisions; a missing range row is not deletion;
> dirty editors must not be overwritten by realtime; generic transport faults must not reload; native trust
> needs origin plus path; no immediate blob revocation; no global cache/template rewrite from an unmeasured
> inference.
>
> Deliver small reviewed commits/PRs through existing repository controls, a packet manifest, actual
> command statuses, before/after regression evidence, and a precise blocker list. Preserve the A03-003
> refutation and already-passing cases. Never declare a skipped or unrun gate passed, never claim a
> physical haptic test from a mock, and never deploy or mutate production under this plan.

## 11. Worker prompt

> You own packet `<Rxx/Gxx>` only. Read the current repository rules and feature map, confirm the mechanism
> still exists, and obtain leases for the exact files. Use the packet's Implement, Regression proof and
> Boundary sections as the task contract. If a shared file is leased elsewhere, submit a minimal change
> request rather than editing it.
>
> Run a failing regression where feasible, apply the smallest complete repair, then run the scoped and
> shared-consumer checks. Preserve existing product behavior and private data. Record all original finding
> IDs, exact source/test paths, commands/exit codes, and what remains `NOT_RUN`. If the suggested fix needs
> schema truth, a new product policy or unavailable native infrastructure, mark only that subtask blocked
> and state exactly what is missing.

## 12. Reviewer prompt

> Review the actual diff and evidence against the packet, not just the author's summary. Verify that the
> repair addresses every cited path, does not merely change a label, does not introduce a product decision,
> and does not mutate unrelated data. Look specifically for stale `finally`, revision mismatches,
> empty-array `.every`, reference-only reseeding, swallowed auth errors, cross-scope stale caches,
> portal/inert conflicts, double haptics, premature blob revocation and global settings changes.
>
> Independently run the critical regression and check its discovery in CI. Reject unsupported claims of
> device behavior, performance improvement or accessibility conformance. Keep duplicate findings attached
> to one repair. Report remaining verification blockers rather than replacing them with a green build count.

---

## 13. Source register and research limits

### 13.1 Owner-supplied audit

The full findings register pasted with this request is the source for all original `Axx-xxx` IDs, stated
line anchors, prior decisions and blockers. Only the targeted source reads listed below were independently
revisited for this document. File line numbers in packets inherited from the register are starting anchors
at the audit SHA, not promises about current `main`.

### 13.2 Independently inspected pinned repository sources

| Reference | Source | Use in this plan |
|---|---|---|
| [S01](https://github.com/njrini99-code/helmv3/blob/3c90f9f174ac103af5fafc600aebecd98243decc/AGENTS.md) | `AGENTS.md` | Current-at-baseline feature routing, sanctioned workspace tooling, writer cap and no-production constraints. |
| [S02](https://github.com/njrini99-code/helmv3/blob/3c90f9f174ac103af5fafc600aebecd98243decc/src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx#L980-L1100) | `new-round-client.tsx`, lines 980–1100 | Quick-pick `.some`, direct tracking transition, cloud padding. |
| [S03](https://github.com/njrini99-code/helmv3/blob/3c90f9f174ac103af5fafc600aebecd98243decc/src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx#L1198-L1388) | `new-round-client.tsx`, lines 1198–1388 | Normal validation, durable start, selected subset and permissive skip check. |
| [S04](https://github.com/njrini99-code/helmv3/blob/3c90f9f174ac103af5fafc600aebecd98243decc/src/contexts/notification-badge-context.tsx#L70-L244) | `notification-badge-context.tsx`, lines 70–244 | Same-provider failure-to-zero and identity/lifecycle context. |
| [S05](https://github.com/njrini99-code/helmv3/blob/3c90f9f174ac103af5fafc600aebecd98243decc/src/components/golf/stats/spine-stage/StatsSpineStage.tsx#L92-L218) | `StatsSpineStage.tsx`, lines 92–218 | Unguarded loader and existing round-options cancellation pattern. |
| [S06](https://github.com/njrini99-code/helmv3/blob/3c90f9f174ac103af5fafc600aebecd98243decc/src/lib/calendar/timezone.ts#L1-L102) | `calendar/timezone.ts`, lines 1–102 | Canonical event-time formatter and existing fallback. |
| [S07](https://github.com/njrini99-code/helmv3/blob/3c90f9f174ac103af5fafc600aebecd98243decc/ios/App/App/GolfBridgeViewController.swift#L1-L110) | `GolfBridgeViewController.swift`, lines 1–110 | Cache wipe, native backgrounds and substring URL observer. |
| [S08](https://github.com/njrini99-code/helmv3/blob/3c90f9f174ac103af5fafc600aebecd98243decc/package.json) | `package.json` | Verified script names and declared dependency ranges; lockfile still establishes installed versions. |

### 13.3 Primary technical references consulted

| Reference | Why it matters |
|---|---|
| [P01](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes) | Next `staleTimes` and back/forward behavior are distinct; the option remains experimental in the consulted documentation. |
| [P02](https://nextjs.org/docs/app/api-reference/file-conventions/template) | Template remounts are tied to segment/key behavior, not a blanket statement about every nested navigation. |
| [P03](https://react.dev/reference/react/useEffect) | React documents cleanup/ignore guards for out-of-order effect fetches. |
| [P04](https://capacitorjs.com/docs/apis/keyboard) | Capacitor v8 lists supported keyboard configuration and distinguishes `body`/`native`/`ionic`/`none`. |
| [P05](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Modal interaction includes focus containment and inert background, not just visible stacking. |
| [P06](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static) | Object URLs must be released when no longer in use. |
| [P07](https://www.w3.org/TR/WCAG22/) | Accessibility criteria include context and exceptions; source-string presence/absence does not certify a whole interaction. |

Platform documentation was consulted September 7, 2026. Apply the actually locked dependency and supported
runtime contracts; do not upgrade packages simply to match an example in documentation. The timing,
partitioning and test choices specified here are engineering recommendations, not quoted platform mandates.

**Completion standard:** The existing product does the same intended job, but no longer lies about state,
loses work through recovery, accepts malformed setup, publishes obsolete data, duplicates feedback, or
changes control geometry unexpectedly. Product redesign and policy changes remain separately reviewable.
