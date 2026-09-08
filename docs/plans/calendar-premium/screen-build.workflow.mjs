// Workflow script for docs/plans/calendar-premium/SCREEN-BUILD-PLAN.md.
// Run with the Workflow tool: { scriptPath: <this file>, args: { worktree, waves?, push? } }.
// Plain JavaScript, no Node APIs. Nothing here applies a migration, pushes, or opens a PR
// unless args.push is true; workers never run git — the coordinator commits per owned path set.

export const meta = {
  name: 'calendar-screen-build',
  description: 'Build the GolfHelm calendar screens (S1–S10) in parallel waves with exclusive file ownership',
  whenToUse: 'Executing SCREEN-BUILD-PLAN.md in the calendar-premium worktree',
  phases: [
    { title: 'Baseline', detail: 'verify worktree, HEAD, dirty files, plan present' },
    { title: 'Coordinator A0', detail: 'land polish pass, freeze contract (gate A1)' },
    { title: 'Wave A', detail: 'editor / people+class / services, each verified and repaired' },
    { title: 'Integrate A', detail: 'commit per owner, typecheck, focused suites, wire entry points' },
    { title: 'Wave B', detail: 'detail+attendance+files / availability+subscriptions / conflicts UI' },
    { title: 'Integrate B', detail: 'commit, remove legacy imports, gates B1–B3' },
    { title: 'Wave C', detail: 'exclusive motion pass, gated schema authoring (no apply), reviews' },
    { title: 'Close', detail: 'completeness critic, feature doc, preflight subset, report' },
  ],
}

const WORKTREE = (args && args.worktree) || '/Users/ricknini/worktrees/helmv3/calendar-premium'
const WAVES = (args && args.waves) || ['A', 'B', 'C']
const PUSH = Boolean(args && args.push)
const PLAN = `${WORKTREE}/docs/plans/calendar-premium/SCREEN-BUILD-PLAN.md`
const DESIGN = `${WORKTREE}/docs/plans/calendar-premium/DESIGN-PLAN.md`
const CAL = 'src/components/fairway/pages/calendar'

// ---------------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------------
const BASELINE = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    head: { type: 'string' },
    branch: { type: 'string' },
    dirty: { type: 'array', items: { type: 'string' } },
    untracked: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'head', 'branch', 'dirty', 'untracked', 'problems'],
}

const WORK = {
  type: 'object',
  properties: {
    changedPaths: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    tests: {
      type: 'array',
      items: {
        type: 'object',
        properties: { command: { type: 'string' }, exitCode: { type: 'number' }, note: { type: 'string' } },
        required: ['command', 'exitCode'],
      },
    },
    unsupported: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    handoffRequests: { type: 'array', items: { type: 'string' } },
  },
  required: ['changedPaths', 'summary', 'tests', 'unsupported', 'risks', 'handoffRequests'],
}

const VERDICT = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    mustFix: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'mustFix', 'notes'],
}

// ---------------------------------------------------------------------------------------------
// Shared prompt fragments
// ---------------------------------------------------------------------------------------------
const GROUND_RULES = `
Work ONLY inside ${WORKTREE} (branch codex/calendar-premium). Never touch /Users/ricknini/Downloads/helmv3.
Do not run any git command that changes state (no add/commit/checkout/stash/reset); the coordinator commits.
Edit only your exclusive paths below. If you need a change elsewhere, describe it in handoffRequests instead.
Read ${PLAN} (your screen sections and §2 shared rules) and the cited sections of ${DESIGN} before editing.
Design authority: src/styles/design-tokens.css → src/components/fairway/** → .claude/rules/design-system.md.
Reuse ModalShell / Sheet / PopoverPanel / Button / Input / Segmented / EmptyState / FeatureUnavailable / InlineNotice.
Material comes from ${CAL}/CalendarSurfaces.module.css (coordinator-owned): use its classes, add none.
Honesty rules are non-negotiable: missing data never renders as free; no verified-green from partial or failed;
no fabricated names, avatars, or availability; class titles render only when the server returned them.
One primary action per screen. 44px targets. 320–430px mobile with safe areas, 1024/1440 desktop, dark mode,
reduced motion, reduced transparency. Tests are vitest (.test.tsx runs in the unit-dom project); include a 320px case.
Run only your focused suites: npx vitest run --project unit-dom <your test files> and npx tsc --noEmit -p tsconfig.json.
Return the structured result with real exit codes. List anything you could not finish under unsupported.`

const UI_SKILLS = `
Before writing or reshaping any component, invoke the Skill tool with "impeccable" and then
"frontend-design:frontend-design" and follow their guidance for hierarchy, typography, states, and motion.
If an overlay, z-index, safe-area, or layout-shift problem appears, invoke "ui-stability-debugger-v2" before patching.
Do not skip these because the change looks small.`

const owned = (paths) => `\nExclusive paths you own:\n${paths.map((p) => `  - ${p}`).join('\n')}\n`

// ---------------------------------------------------------------------------------------------
// Worker definitions (SCREEN-BUILD-PLAN §4). Paths are exclusive within a wave.
// ---------------------------------------------------------------------------------------------
const WAVE_A = [
  {
    label: 'W-Editor (S1, S2)',
    ui: true,
    paths: [
      `${CAL}/FairwayEventEditor.tsx`, `${CAL}/EventWhenFields.tsx`, `${CAL}/editor/** (NEW)`,
      `${CAL}/__tests__/FairwayEventEditor*.test.tsx`,
    ],
    task: `Implement plan §2.1 (new event) and §2.2 (edit, reschedule, series): staged mobile flow with a task dock,
two-column desktop layout at ≥1024px (useMediaQuery from src/hooks/use-media-query.ts), extraction of the
verification panel and recurrence block into editor/ modules, the review receipt with changed-field diff, and the
Move event label when only time changed. Preserve every existing test in __tests__/FairwayEventEditor*.test.tsx.
The invite grid stays inline until W-People delivers the picker; leave a clearly named summary-button seam
(prop onOpenPeoplePicker, optional) so the coordinator can wire it.`,
  },
  {
    label: 'W-People (S3, S4 UI)',
    ui: true,
    paths: [
      `${CAL}/people/** (NEW)`, `${CAL}/class/** (NEW)`, `${CAL}/CalendarPersonDialog.tsx`,
      `${CAL}/FairwayCalendarMemberRail.tsx`, `${CAL}/__tests__/CalendarPersonDialog.test.tsx`,
      `${CAL}/__tests__/FairwayCalendarMemberRail.test.tsx`,
    ],
    task: `Implement plan §2.3 (people picker) and the UI half of §2.4 (class detail for a player) against the fixture
file src/test/fixtures/calendar-screens.ts that W-Services is producing in parallel; if it is not present yet,
define the fixture shapes locally under class/__tests__ from the contract in plan §2.4 and note it in risks.
Class detail must render all seven states (loading, detail, free_busy, not found, excluded, unsynced, failed) and
must NEVER render a title, instructor, or location unless access === 'detail'. Wire onOpenClass in
CalendarPersonDialog. Compare in the member rail opens the picker instead of toggling avatars in place.`,
  },
  {
    label: 'W-Services (class-detail, conflict-inbox, N1)',
    ui: false,
    paths: [
      'src/app/golf/actions/class-detail.ts (NEW)', 'src/app/golf/actions/conflict-inbox.ts (NEW)',
      'src/app/golf/actions/attendance.ts', 'src/app/golf/actions/__tests__/class-detail.test.ts (NEW)',
      'src/app/golf/actions/__tests__/conflict-inbox.test.ts (NEW)', 'src/app/golf/actions/__tests__/attendance*.test.ts',
      'src/test/fixtures/calendar-screens.ts (NEW)',
    ],
    task: `Implement the server side of plan §2.4 (getClassOccurrenceDetail: authorize against golf_player_classes RLS,
never against the golf_events class row; return access detail|free_busy|none; resolve class id via
classIdFromDescription in src/lib/calendar/class-events.ts), §2.8 (getConflictInbox: coach-only team scope,
player own-events scope, 14-day/50-event bound, one attendee query, reuse checkEventConflicts with excludeEventId,
per-person verification, class titles only for detail-access viewers), and N1 (updateAttendanceNote — first confirm
the golf_event_attendance update policy's WITH CHECK in supabase/migrations covers coaches; if it does not, stop and
report instead of adding the action). Model tests on src/app/golf/actions/__tests__/scheduling.test.ts.
Also produce src/test/fixtures/calendar-screens.ts: deterministic synthetic fixtures for class detail (all states),
conflict inbox, attendance report, and event documents. Never imported by runtime code. No schema changes.`,
  },
]

const WAVE_B = [
  {
    label: 'W-Detail (S10, S5, S6)',
    ui: true,
    paths: [
      `${CAL}/FairwayEventDetailDrawer.tsx`, `${CAL}/detail/** (NEW)`, `${CAL}/attendance/** (NEW)`,
      `${CAL}/files/** (NEW)`, `${CAL}/__tests__/FairwayEventDetailDrawer.test.tsx`,
    ],
    task: `Implement plan §2.10 (event detail depth: §18 section order, Sheet side="right" inspector at ≥1024px,
PopoverPanel More menu for destructive actions), §2.5 (attendance screen with pending map, stable row order,
per-row save reconciliation via bulkCheckIn + markAttendance, notes only if updateAttendanceNote exists), and
§2.6 (files: attach-from-library via event-documents.ts, no upload). Remove the legacy AttendancePanel import from
the drawer once the attendance screen passes its tests. Preserve every existing drawer test.`,
  },
  {
    label: 'W-Availability (S7, S9)',
    ui: true,
    paths: [`${CAL}/availability/** (NEW)`, `${CAL}/settings/** (NEW)`],
    task: `Implement plan §2.7 (my availability: coach blocked time via getCoachBlockedTime/addCoachBlockedTime/
updateCoachBlockedTime/deleteCoachBlockedTime in src/app/golf/actions/golf.ts; player side renders
FeatureUnavailable — never send a player write to the coach table; Sources tab shows only snapshot.checkedAt-based
wording) and §2.9 (subscriptions sheet replacing the legacy CalendarFeedManager: one-way copy, masked tokens,
copy/regenerate/remove via calendar-feeds.ts). Export a FairwayCalendarSubscriptionsSheet with the same props as
the current FairwaySubscribeSheet in FairwayCalendar.tsx (open, onOpenChange, canManageTeamFeed) so the
coordinator can swap it in.`,
  },
  {
    label: 'W-Conflicts (S8 UI)',
    ui: true,
    paths: [
      `${CAL}/conflicts/** (NEW)`, `${CAL}/scheduling/SchedulingWorkspace.tsx`,
      `${CAL}/scheduling/__tests__/**`, 'src/hooks/golf/use-conflict-inbox.ts (NEW)',
      'src/hooks/golf/__tests__/use-conflict-inbox.test.tsx (NEW)',
    ],
    task: `Implement plan §2.8 UI: ConflictCenter (grouped by date, filters Needs attention | Unverified only — no
Reviewed filter until gate G2), ConflictRow, ConflictDetail embedding SchedulingWorkspace with a new
referenceInterval prop (static dashed "Current" band) and an affectedOnly filter with "Show everyone" that restores
order and scroll, alternatives from scheduling/evaluate.ts, and use-conflict-inbox.ts modelled on
use-schedule-window.ts (keyed, keeps last result visible while refreshing, never presents cache as a fresh
all-clear). AcknowledgeForm is NOT built (gate G2). Consume getConflictInbox from src/app/golf/actions/conflict-inbox.ts.`,
  },
]

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function workerPrompt(w) {
  return `You are ${w.label}, one of three parallel workers on the GolfHelm calendar makeover.
${GROUND_RULES}${w.ui ? UI_SKILLS : ''}${owned(w.paths)}
Task:\n${w.task}`
}

function verifyPrompt(w, result) {
  return `Independently verify the claim below from ${w.label}. Do not trust the summary: read the diff of the
changed paths in ${WORKTREE} (git diff -- <paths>, git status --short), re-run the listed test commands and
npx tsc --noEmit -p tsconfig.json, and check plan ${PLAN} sections for that worker.
Fail (pass=false) if: any owned-path boundary was crossed; any test exit code is non-zero; a state from the plan's
state list is missing; a class title, instructor, or location can render without access === 'detail'; a green or
"verified" state can appear from partial/failed data; a fabricated name/avatar/availability exists; a 320px case is
absent; a git state-changing command was run. Be specific in mustFix (file:line).
Claim:\n${JSON.stringify(result, null, 2)}`
}

async function runWorker(w, phase) {
  let result = await agent(workerPrompt(w), { label: w.label, phase, schema: WORK, agentType: 'helm-worker' })
  if (!result) return { worker: w.label, result: null, verdict: null }
  let verdict = await agent(verifyPrompt(w, result), {
    label: `verify ${w.label}`, phase, schema: VERDICT, effort: 'high', agentType: 'verifier',
  })
  for (let round = 1; round <= 2 && verdict && !verdict.pass; round += 1) {
    log(`${w.label}: verifier found ${verdict.mustFix.length} must-fix items, repair round ${round}`)
    const repaired = await agent(
      `${workerPrompt(w)}\n\nYour previous attempt was rejected by an independent verifier. Fix exactly these
items, re-run your focused tests, and return the updated structured result:\n${verdict.mustFix.map((m) => `- ${m}`).join('\n')}`,
      { label: `repair ${w.label} #${round}`, phase, schema: WORK, agentType: 'helm-worker' },
    )
    if (!repaired) break
    result = repaired
    verdict = await agent(verifyPrompt(w, result), {
      label: `re-verify ${w.label} #${round}`, phase, schema: VERDICT, effort: 'high', agentType: 'verifier',
    })
  }
  return { worker: w.label, result, verdict }
}

function integratePrompt(wave, outcomes, extra) {
  return `You are the coordinator (P0) integrating wave ${wave} in ${WORKTREE}.
Worker outcomes (result + verifier verdict):\n${JSON.stringify(outcomes, null, 2)}
Steps: 1) For each worker, git add ONLY its owned paths and commit separately with a conventional message
(feat(calendar): ...) ending with the Co-Authored-By and Claude-Session attribution lines from your instructions.
Skip and report any worker whose verdict.pass is false or whose result is null; do not commit partial work.
2) Apply the workers' handoffRequests that touch coordinator-owned files only (${CAL}/FairwayCalendar.tsx,
${CAL}/CalendarSurfaces.module.css, src/lib/calendar/scheduling-contracts.ts, src/app/golf/actions/scheduling.ts).
${extra}
3) Run npx tsc --noEmit -p tsconfig.json and npx vitest run --project unit-dom ${CAL} src/hooks/golf, then commit
the integration. 4) Do not push. Return the structured result with the commit SHAs in summary.`
}

// ---------------------------------------------------------------------------------------------
// Phase: Baseline
// ---------------------------------------------------------------------------------------------
phase('Baseline')
const base = await agent(
  `Read-only. In ${WORKTREE}: report git rev-parse HEAD, current branch, git status --short (dirty and untracked),
and whether ${PLAN} exists. ok=false with problems if the branch is not codex/calendar-premium, the plan is
missing, or any dirty file is outside ${CAL}/, memory/ledgers/, or docs/plans/calendar-premium/.`,
  { label: 'baseline', schema: BASELINE, effort: 'low', agentType: 'helm-reader' },
)
if (!base || !base.ok) {
  log(`Baseline failed: ${base ? base.problems.join('; ') : 'no result'}`)
  return { stopped: 'baseline', base }
}
log(`Base ${base.head.slice(0, 9)} on ${base.branch}; ${base.dirty.length} dirty, ${base.untracked.length} untracked`)

// ---------------------------------------------------------------------------------------------
// Phase: Coordinator A0 — land the polish pass, freeze the contract (gate A1). Sequential: shared files.
// ---------------------------------------------------------------------------------------------
phase('Coordinator A0')
const a0 = await agent(
  `You are the coordinator (P0). ${GROUND_RULES.replace('Do not run any git command that changes state (no add/commit/checkout/stash/reset); the coordinator commits.', 'You may commit.')}
Do plan §1.2: perform the two checks (SchedulingWorkspace nextIndex vs validStarts mapping — confirm with the
existing drag test that the last valid start is reachable, fix if not; CalendarPersonDialog snapshot! assertion
stays behind the person guard), then commit the four modified files plus the untracked CalendarSurfaces.module.css
as "feat(calendar): shared calendar material vocabulary". Then do gate A1 from plan §4/§6: in
src/lib/calendar/scheduling-contracts.ts add optional classId and access ('detail' | 'free_busy') to
ScheduleInterval and make title optional when access is not 'detail'; in src/app/golf/actions/scheduling.ts stop
defaulting title to "Busy" for redacted intervals and set access; update every consumer under ${CAL} and the
tests that break, keeping behaviour identical for detail-access viewers. Then add the §3 classes (.press, .dock,
.inspector, .reference, .hatch, .pending, .settle) to CalendarSurfaces.module.css, token-based, inside the existing
reduced-motion/transparency handling. Run tsc and the calendar + hooks suites; commit as a second commit.
Do not push.`,
  { label: 'coordinator A0', schema: WORK, agentType: 'helm-worker' },
)
const a0Verdict = a0 && await agent(verifyPrompt({ label: 'coordinator A0' }, a0), {
  label: 'verify A0', schema: VERDICT, effort: 'high', agentType: 'verifier',
})
if (!a0 || !a0Verdict || !a0Verdict.pass) {
  log('Gate A1 not met; stopping before parallel work')
  return { stopped: 'gate A1', a0, a0Verdict }
}

const report = { base, a0, waves: {} }

// ---------------------------------------------------------------------------------------------
// Wave A — three workers, each implement → verify → repair (pipeline, no barrier between workers)
// ---------------------------------------------------------------------------------------------
if (WAVES.includes('A')) {
  phase('Wave A')
  const outcomesA = (await pipeline(WAVE_A, (w) => runWorker(w, 'Wave A'))).filter(Boolean)
  report.waves.A = outcomesA
  const failedA = outcomesA.filter((o) => !o.verdict || !o.verdict.pass).map((o) => o.worker)
  if (failedA.length) log(`Wave A workers not passing verification: ${failedA.join(', ')} (their work will not be committed)`)

  phase('Integrate A')
  report.integrateA = await agent(
    integratePrompt('A', outcomesA, `Also wire S3/S4 entry points in FairwayCalendar.tsx: the editor's
onOpenPeoplePicker seam → CalendarPeoplePicker; agenda/day class rows and CalendarPersonDialog.onOpenClass →
CalendarClassDetail, which loads through getClassOccurrenceDetail. Only if both W-People and W-Services passed.`),
    { label: 'integrate A', phase: 'Integrate A', schema: WORK, agentType: 'helm-worker' },
  )
}

// ---------------------------------------------------------------------------------------------
// Wave B — depends on Integrate A (shared entry points), so the barrier is genuine
// ---------------------------------------------------------------------------------------------
if (WAVES.includes('B')) {
  phase('Wave B')
  const outcomesB = (await pipeline(WAVE_B, (w) => runWorker(w, 'Wave B'))).filter(Boolean)
  report.waves.B = outcomesB

  phase('Integrate B')
  report.integrateB = await agent(
    integratePrompt('B', outcomesB, `Also: swap FairwaySubscribeSheet (FairwayCalendar.tsx ~:1289-1449) for
FairwayCalendarSubscriptionsSheet and delete the legacy dynamic import of CalendarFeedManager; wire entry points
for attendance, files, my availability (header overflow), and the conflict center (attention row → center →
detail → editor via the existing onChoose path). Gate B1: grep ${CAL} for "components/golf/calendar" and report
zero matches, or list what remains and why. Gate B2: confirm each new screen has loading/empty/failed/no-access
tests. Gate B3: tsc + focused suites once.`),
    { label: 'integrate B', phase: 'Integrate B', schema: WORK, agentType: 'helm-worker' },
  )
}

// ---------------------------------------------------------------------------------------------
// Wave C — exclusive motion pass first (it touches the whole tree), then schema authoring + reviews in parallel
// ---------------------------------------------------------------------------------------------
if (WAVES.includes('C')) {
  phase('Wave C')
  const motion = await runWorker({
    label: 'W-Motion (§3 vocabulary, haptics, dark/reduced modes)',
    ui: true,
    paths: [`${CAL}/** (exclusive for this pass only)`],
    task: `Apply plan §3 across S1–S10 in one pass: .press on rows/buttons, .dock in focused workflows, .inspector
on desktop panels, .reference / .hatch / .pending / .settle where the plan names them; haptics via fwHaptic
(src/lib/fairway/haptics.ts) only for selection settled, verified result, and successful save — never during a pan;
motion timings from plan §10/§20 using src/lib/coachhelm/v3/motion.ts and useReducedMotionGuard; verify dark mode,
reduced motion, and reduced transparency render without one-off literals. Add no new shadows or blur in component
files. Keep every existing test green.`,
  }, 'Wave C')
  report.waves.C = { motion }

  const [schema, uiReview, securityReview] = await parallel([
    () => agent(
      `You are W-Schema (P6). ${GROUND_RULES}${owned([
        'supabase/migrations/<new files for G1 and G2 only>', 'supabase/tests/rls/<matching pgTAP files>',
        'src/lib/calendar/availability.ts (G1 consumption only)',
      ])}
Plan §5 gates G1 (golf_player_availability_blocks) and G2 (golf_event_conflict_acknowledgements). First inspect the
LIVE schema and policies read-only through the Supabase MCP tools (list_tables, execute_sql SELECT only): confirm
neither table exists and record golf_event_attendance's columns for G3. Then AUTHOR additive migration SQL and
pgTAP RLS tests (owner, coach of active member, teammate, other team) following supabase/migrations/HELD.md
conventions. DO NOT apply any migration, DO NOT regenerate types, DO NOT enable any gated UI. Load the
"supabase:supabase-postgres-best-practices" skill before writing SQL. Report G3 findings in summary.`,
      { label: 'W-Schema (author only)', phase: 'Wave C', schema: WORK, agentType: 'helm-worker' },
    ),
    () => agent(
      `Review the calendar makeover diff in ${WORKTREE} (git log --oneline origin/main..HEAD, git diff origin/main -- ${CAL}).
Invoke the Skill tool with "impeccable" (audit/critique mode) and "frontend-design:frontend-design" first.
Judge against plan ${PLAN} §2 shared rules, §3 material, §8 definition of done, and ${DESIGN} §18/§20: one primary
action per screen, no duplicate bottom surfaces, 320px readability, states designed not shimmering, motion grammar,
dark/reduced modes, focus paths. Return pass=false with file:line mustFix items for anything release-blocking.`,
      { label: 'UI polish review', phase: 'Wave C', schema: VERDICT, effort: 'high', agentType: 'ui-polish-reviewer' },
    ),
    () => agent(
      `Security review of ${WORKTREE} changes vs origin/main: src/app/golf/actions/class-detail.ts, conflict-inbox.ts,
attendance.ts, scheduling.ts, scheduling-contracts.ts, and every new client surface under ${CAL}. Verify: class
titles never reach a free/busy-only viewer through any path (person dialog, conflict detail, scheduling snapshot,
class detail); every read authorizes server-side under RLS and resolves coach/player IDs explicitly; no player write
reaches golf_coach_blocked_time; feed tokens never appear in logs/telemetry; no arbitrary user IDs accepted from the
browser. Return pass=false with file:line mustFix for any leak.`,
      { label: 'security review', phase: 'Wave C', schema: VERDICT, effort: 'high', agentType: 'security-reviewer' },
    ),
  ])
  report.waves.C.schema = schema
  report.waves.C.uiReview = uiReview
  report.waves.C.securityReview = securityReview

  const mustFix = [...(uiReview ? uiReview.mustFix : []), ...(securityReview ? securityReview.mustFix : [])]
  if (mustFix.length) {
    log(`Reviews returned ${mustFix.length} must-fix items; running one bounded fix pass`)
    report.waves.C.fixes = await runWorker({
      label: 'W-Fix (review findings)',
      ui: true,
      paths: [`${CAL}/**`, 'src/app/golf/actions/class-detail.ts', 'src/app/golf/actions/conflict-inbox.ts', 'src/hooks/golf/**'],
      task: `Fix exactly these review findings, nothing else, and keep all suites green:\n${mustFix.map((m) => `- ${m}`).join('\n')}`,
    }, 'Wave C')
  }
  if (schema && schema.changedPaths.length) {
    report.waves.C.migrationReview = await agent(
      `Review the authored (NOT applied) migrations and pgTAP tests at: ${schema.changedPaths.join(', ')} in
${WORKTREE}. This is the shared Golf/Baseball/Lift Lab production database: additive only, RLS owner-write and
coach free/busy read via active membership, no destructive statements, HELD.md conventions. Return pass/mustFix.`,
      { label: 'migration review', phase: 'Wave C', schema: VERDICT, effort: 'high', agentType: 'db-migration-reviewer' },
    )
  }
}

// ---------------------------------------------------------------------------------------------
// Close — completeness critic, feature doc, preflight subset, final report
// ---------------------------------------------------------------------------------------------
phase('Close')
const critic = await agent(
  `Completeness critic. Compare what actually landed in ${WORKTREE} (git log origin/main..HEAD, tree under ${CAL})
against ${PLAN} §2 (S1–S10 with their state lists), §4 gates A1–C2, §5 gated items, and §8 definition of done.
List every screen, state, gate, or test that is missing or only claimed; note what remains legitimately gated
(G1–G6, N1, F1) versus silently skipped. Read-only.`,
  { label: 'completeness critic', schema: VERDICT, effort: 'high', agentType: 'helm-reader' },
)
report.critic = critic

report.close = await agent(
  `Coordinator close-out in ${WORKTREE}. 1) Commit any uncommitted Wave C work per owner (motion pass, review fixes,
authored migrations) with attribution lines. 2) Update memory/features/calendar-events.md with SHIPPED behaviour
only (new screens, new actions, gated items still gated) — never describe planned work as shipped. 3) Run the
static subset: npm run typecheck, npm run lint, npm run markdown:ratchet, npm run docs:schema-drift,
npm run docs:path-drift; then npx vitest run --project unit-dom ${CAL} src/hooks/golf and
npx vitest run --project unit src/app/golf/actions src/lib/calendar. Report every exit code honestly.
4) ${PUSH ? 'git push origin codex/calendar-premium (PR #1911 already exists; do not open a new one).' : 'Do NOT push.'}
Critic findings to mention in the report:\n${JSON.stringify(critic, null, 2)}`,
  { label: 'close-out', schema: WORK, agentType: 'helm-worker' },
)

return report
