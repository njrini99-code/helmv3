// Calendar screen build, second run. Replaces screen-build.workflow.mjs.
//
// What changed and why. The first run spent 14 agents to land 3 commits: every
// worker was followed by a high-effort verifier agent that re-read the diff and
// re-ran the suites, and every rejection bought a full rebuild plus another
// verifier. Roughly 70% of a 2h20m run was that loop. Three workers also ran in
// parallel against a server action that had not landed.
//
// This run:
//   - runs ONE worker at a time, so the whole diff after a step belongs to that
//     step and can be committed without a path-ownership audit;
//   - gates each step with a low-effort reader that runs a FIXED command list
//     and returns exit codes and grep counts - numbers, not opinions. The
//     script decides pass/fail;
//   - rejects placeholder reports (`echo test`, no exit code) in the script,
//     before any agent is spent on them;
//   - allows one repair round, and only for a deterministic gate failure;
//   - runs the two reviews read-only, once, and returns their findings to the
//     session lead instead of spending a fix pass on them;
//   - commits after every passing step so a stopped run strands nothing.
//
// Run with the Workflow tool: { scriptPath: <this file>, args: { worktree } }.
// Nothing pushes, applies a migration, or opens a PR.

export const meta = {
  name: 'calendar-screen-build-v2',
  description: 'Wire the ten calendar screens, apply the motion pass, review once — sequential, deterministic gates',
  phases: [
    { title: 'Wire', detail: 'reach every landed screen from FairwayCalendar, swap the legacy feed manager' },
    { title: 'Motion', detail: 'plan §3 material and microinteractions across S1–S10' },
    { title: 'Review', detail: 'UI polish and security, read-only, findings returned' },
    { title: 'Close', detail: 'static subset with real exit codes' },
  ],
}

const WORKTREE = (args && args.worktree) || '/Users/ricknini/worktrees/helmv3/calendar-premium'
const CAL = 'src/components/fairway/pages/calendar'
const PLAN = `${WORKTREE}/docs/plans/calendar-premium/SCREEN-BUILD-PLAN.md`
const DESIGN = `${WORKTREE}/docs/plans/calendar-premium/DESIGN-PLAN.md`

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const WORK = {
  type: 'object',
  properties: {
    changedPaths: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    tests: {
      type: 'array',
      items: {
        type: 'object',
        properties: { command: { type: 'string' }, exitCode: { type: 'number' } },
        required: ['command', 'exitCode'],
      },
    },
    unsupported: { type: 'array', items: { type: 'string' } },
  },
  required: ['changedPaths', 'summary', 'tests', 'unsupported'],
}

const GATE = {
  type: 'object',
  properties: {
    tsc: { type: 'number' },
    vitestDom: { type: 'number' },
    vitestUnit: { type: 'number' },
    legacyRuntimeImports: { type: 'number' },
    dirtyOutsideScope: { type: 'array', items: { type: 'string' } },
    failures: { type: 'array', items: { type: 'string' } },
  },
  required: ['tsc', 'vitestDom', 'vitestUnit', 'legacyRuntimeImports', 'dirtyOutsideScope', 'failures'],
}

const COMMIT = {
  type: 'object',
  properties: { sha: { type: 'string' }, files: { type: 'number' } },
  required: ['sha', 'files'],
}

const REVIEW = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    mustFix: { type: 'array', items: { type: 'string' } },
    shouldFix: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'mustFix', 'shouldFix'],
}

// ---------------------------------------------------------------------------
// Script-level validation: a report that cannot be checked is rejected here,
// for free, not by a verifier agent.
// ---------------------------------------------------------------------------
function reportProblem(r) {
  if (!r) return 'no result'
  if (!Array.isArray(r.changedPaths) || r.changedPaths.length === 0) return 'changedPaths is empty'
  if (!Array.isArray(r.tests) || r.tests.length === 0) return 'tests is empty'
  for (const t of r.tests) {
    if (typeof t.exitCode !== 'number') return `no exit code for: ${t.command}`
    if (!/^(NODE_OPTIONS=\S+ )?npx (tsc|vitest)\b/.test(t.command)) return `not a real gate command: ${t.command}`
    if (t.exitCode !== 0) return `worker's own gate failed: ${t.command} -> ${t.exitCode}`
  }
  return null
}

const RULES = `
Work ONLY inside ${WORKTREE} (branch codex/calendar-premium). Never touch /Users/ricknini/Downloads/helmv3.
Do not run any git command that changes state; the run commits after you.
Design authority: src/styles/design-tokens.css -> src/components/fairway/** -> .claude/rules/design-system.md.
Material comes from ${CAL}/CalendarSurfaces.module.css. Reuse ModalShell / Sheet / PopoverPanel / Button / Segmented / EmptyState / FeatureUnavailable / InlineNotice.
Honesty rules: missing data never renders as free; no verified-green from partial or failed; no fabricated names, avatars, or availability; class titles render only when the server returned them (access === 'detail').
Before finishing, run unpiped and record the REAL exit code of each:
  NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
  npx vitest run --project unit-dom ${CAL} src/hooks/golf
Fix what they surface before reporting. A report with a placeholder test entry is rejected by the script and costs a repair round.
List anything you could not finish under unsupported, precisely.`

const UI_SKILLS = `
Before writing or reshaping any component, invoke the Skill tool with "impeccable" and then "frontend-design:frontend-design" and follow them.
If an overlay, z-index, safe-area, or layout-shift problem appears, invoke "ui-stability-debugger-v2" before patching.`

// ---------------------------------------------------------------------------
// Gate: fixed commands, numbers back. Low effort, read-only agent.
// ---------------------------------------------------------------------------
async function gate(label, phaseName) {
  return agent(
    `Run EXACTLY these from ${WORKTREE}, each unpiped, and report the exit code of each. Do not fix anything, do not run git state-changing commands.
1. NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json  -> tsc
2. npx vitest run --project unit-dom ${CAL} src/hooks/golf  -> vitestDom
3. npx vitest run --project unit src/app/golf/actions/__tests__/conflict-inbox.test.ts src/app/golf/actions/__tests__/class-detail.test.ts src/app/golf/actions/__tests__/scheduling.test.ts src/test/lib/calendar  -> vitestUnit
4. grep -rn "components/golf/calendar" ${CAL} | grep -v "import type" | grep -v __tests__ | wc -l  -> legacyRuntimeImports (a number; 0 if grep finds nothing)
5. git status --short  -> dirtyOutsideScope: every dirty or untracked path NOT under ${CAL}/, src/hooks/golf/, src/app/golf/actions/, src/lib/calendar/, src/test/, or memory/ledgers/
failures: for any non-zero exit code, the first 15 lines of that command's failing output, verbatim.`,
    { label, phase: phaseName, schema: GATE, effort: 'low', agentType: 'helm-reader' },
  )
}

function gateProblem(g, { requireLegacyZero }) {
  if (!g) return 'gate agent returned nothing'
  if (g.tsc !== 0) return `tsc exit ${g.tsc}`
  if (g.vitestDom !== 0) return `unit-dom vitest exit ${g.vitestDom}`
  if (g.vitestUnit !== 0) return `unit vitest exit ${g.vitestUnit}`
  if (requireLegacyZero && g.legacyRuntimeImports !== 0) return `${g.legacyRuntimeImports} runtime import(s) of components/golf/calendar remain under ${CAL}`
  if (g.dirtyOutsideScope.length) return `dirty outside scope: ${g.dirtyOutsideScope.join(', ')}`
  return null
}

async function commit(label, phaseName, message) {
  return agent(
    `In ${WORKTREE}: git add -A -- ${CAL} src/hooks/golf src/app/golf/actions src/lib/calendar src/test  (never memory/ledgers, never anything else), then commit with this message body exactly, ending with the attribution lines from your instructions:\n${message}\nDo not push. Return the new commit SHA and the number of files in it (git show --stat --format= HEAD | tail -1).`,
    { label, phase: phaseName, schema: COMMIT, effort: 'low', agentType: 'helm-worker' },
  )
}

// One worker, one gate, at most one repair. Returns { result, gate, sha, problem }.
async function step({ label, phaseName, prompt, agentType, commitMessage, requireLegacyZero }) {
  let result = await agent(prompt, { label, phase: phaseName, schema: WORK, agentType })
  let problem = reportProblem(result)
  let g = null
  if (!problem) {
    g = await gate(`gate ${label}`, phaseName)
    problem = gateProblem(g, { requireLegacyZero })
  }
  if (problem) {
    log(`${label}: ${problem} — one repair round`)
    result = await agent(
      `${prompt}\n\nYour previous attempt was rejected for a measurable reason, not a matter of taste:\n${problem}\n${g && g.failures.length ? `Failing output:\n${g.failures.join('\n')}` : ''}\nFix exactly that, re-run the gate commands, and report again.`,
      { label: `repair ${label}`, phase: phaseName, schema: WORK, agentType },
    )
    problem = reportProblem(result)
    if (!problem) {
      g = await gate(`re-gate ${label}`, phaseName)
      problem = gateProblem(g, { requireLegacyZero })
    }
  }
  if (problem) {
    log(`${label}: still failing after repair — ${problem}. Leaving the diff on disk uncommitted for the lead.`)
    return { result, gate: g, sha: null, problem }
  }
  const c = await commit(`commit ${label}`, phaseName, commitMessage)
  return { result, gate: g, sha: c ? c.sha : null, problem: null }
}

// ---------------------------------------------------------------------------
// Phase 1 — Wire. Every screen is committed; none is reachable. One file owns
// the entry points, so this is one worker, not three.
// ---------------------------------------------------------------------------
phase('Wire')
const wire = await step({
  label: 'wire screens',
  phaseName: 'Wire',
  agentType: 'helm-worker',
  requireLegacyZero: true,
  commitMessage: `feat(calendar): reach every new screen from the calendar

Wires the people picker, class detail, conflict centre, my availability,
subscriptions sheet, and the drawer's destructive-action handlers into
FairwayCalendar, and retires the legacy CalendarFeedManager mount.`,
  prompt: `You are wiring the calendar's new screens into ${CAL}/FairwayCalendar.tsx (1451 lines). Every screen below is already committed and tested; none is reachable yet. Read ${PLAN} §2 for each screen's entry point and ${DESIGN} §3 for the flows.
${RULES}${UI_SKILLS}
Files you may edit: ${CAL}/FairwayCalendar.tsx, ${CAL}/FairwayCalendarMemberRail.tsx, ${CAL}/CalendarPersonDialog.tsx, ${CAL}/__tests__/FairwayCalendar*.test.tsx, and — only to remove a runtime import of components/golf/calendar — ${CAL}/FairwayEventEditor.tsx and ${CAL}/editor/*.

Do all of these:
1. Editor -> people picker. FairwayEventEditor exposes onOpenPeoplePicker (FairwayEventEditor.tsx:93). Mount CalendarPeoplePicker (${CAL}/people/CalendarPeoplePicker.tsx, props: open, onOpenChange, people, selectedIds, mode, requiredIds, onApply, loading, emptyMessage) and pass the seam so the editor's summary button opens it; onApply feeds the editor's attendee selection. Keep the inline grid as the fallback when the picker is closed.
2. Class detail. CalendarPersonDialog's ScheduleLane already exposes onOpenClass(interval) (CalendarPersonDialog.tsx:59). Wire it, and agenda/day class rows, to CalendarClassDetail (${CAL}/class/CalendarClassDetail.tsx, props: open, onOpenChange, result, viewer, timeZone, onRetry, onEditClass, onCompareSchedules). Load through getClassOccurrenceDetail from src/app/golf/actions/class-detail.ts. Never pass a title the action did not return.
3. Conflict centre. Add the entry (attention row in the calendar header area for coaches; players see own-events scope) -> ConflictCenter (${CAL}/conflicts/ConflictCenter.tsx, props: snapshot, loading, refreshing, error, onRefresh, timeZone, isOffline, onReviewNewTime) fed by useConflictInbox from src/hooks/golf/use-conflict-inbox.ts; onReviewNewTime opens ConflictDetail and its onChoose goes into the existing editor path.
4. My availability. Header overflow item -> MyAvailabilityScreen (${CAL}/availability/MyAvailabilityScreen.tsx, props: open, onOpenChange, role, teamId).
5. Subscriptions. Replace FairwaySubscribeSheet (FairwayCalendar.tsx:1279 and its definition at ~1289-1449) with FairwayCalendarSubscriptionsSheet from ${CAL}/settings/CalendarSubscriptionsSheet.tsx (same props: open, onOpenChange, canManageTeamFeed). Delete the dynamic import of CalendarFeedManager at FairwayCalendar.tsx:93-96 and the now-unused type imports from components/golf/calendar (lines 75-76).
6. Drawer actions. Pass onCancelEvent / onRestoreEvent / onDeletePermanently to FairwayEventDetailDrawer (FairwayCalendar.tsx:1206) from the existing handleDeleteEvent (:653) / handleRestoreEvent (:629) closures, so the More menu becomes visible for coaches.
7. Legacy imports. The gate requires ZERO non-type imports of components/golf/calendar under ${CAL}. PLAYER_COLORS (FairwayCalendar.tsx:74) is a value import: move the constant into ${CAL} (or src/lib/calendar) and import it from there in every Fairway file that uses it. \`import type\` lines may stay.
Add or extend tests in ${CAL}/__tests__ for: the picker opening from the editor, class detail opening from a lane and never rendering a title when access !== 'detail', and the subscriptions sheet replacing the legacy one. One primary action per screen; 44px targets; 320px must not overflow.`,
})
const report = { wire }

// ---------------------------------------------------------------------------
// Phase 2 — Motion. Exclusive over the whole calendar tree, so sequential.
// ---------------------------------------------------------------------------
phase('Motion')
const motion = wire.sha
  ? await step({
      label: 'motion pass',
      phaseName: 'Motion',
      agentType: 'helm-worker',
      requireLegacyZero: true,
      commitMessage: `feat(calendar): apply the shared motion and material vocabulary

Plan §3 across S1–S10: .press, .dock, .inspector, .reference, .hatch,
.pending and .settle from CalendarSurfaces.module.css; haptics only on
a settled selection, a verified result, or a successful save; dark,
reduced-motion and reduced-transparency modes without one-off literals.`,
      prompt: `You are applying plan §3 (${PLAN}, "Shared material and microinteraction vocabulary") across every calendar screen in one exclusive pass. Read §3 and the motion targets it cites in ${DESIGN} §10 and §20 first.
${RULES}${UI_SKILLS}
Files you may edit: anything under ${CAL}/ and ${CAL}/CalendarSurfaces.module.css (add classes only if §3 names them and they are missing; every value token-based, inside the existing reduced-motion and reduced-transparency blocks).

The §3 table, verbatim — apply each where the plan names it:
  .press      button and row compression — transform 0.98, 90ms, EASE_TAP
  .dock       task dock in focused workflows — chrome material, one per screen, never with global nav
  .inspector  desktop right panel — slide/fade 200ms, no reflow of the grid
  .reference  dashed "Current" band — static, token border, no shadow
  .hatch      unverified rows and intervals — gray hatch plus visible "Not verified" text
  .pending    unsaved attendance or draft rows — quiet left rule, no colour flood
  .settle     band and label settle after release — 200ms, minimal overshoot
Rules from §3: no new one-off shadows or blur in component files; glass only on chrome, dock, floating label, and menus; never animate backdrop-filter, box-shadow, or hundreds of cells; .enter stagger capped at eight rows.
Haptics: fwHaptic from src/lib/fairway/haptics.ts only for selection settled, verified result, successful save — never during a pan. Timings from src/lib/coachhelm/v3/motion.ts with useReducedMotionGuard.
Screens: S1/S2 editor (${CAL}/FairwayEventEditor.tsx, editor/*), S3 people picker (people/*), S4 class detail (class/*), S5 attendance (attendance/*), S6 files (files/*), S7 availability (availability/*), S8 conflicts (conflicts/*, scheduling/*), S9 subscriptions (settings/*), S10 detail drawer (FairwayEventDetailDrawer.tsx, detail/*), plus CalendarPersonDialog and FairwayCalendar chrome.
Verify dark mode, prefers-reduced-motion, and prefers-reduced-transparency render from tokens. Keep every existing test green; add a reduced-motion assertion where a new animation is introduced.`,
    })
  : { result: null, gate: null, sha: null, problem: 'skipped: wire did not land' }
report.motion = motion

// ---------------------------------------------------------------------------
// Phase 3 — Review. Read-only, once, in parallel. Findings go back to the lead.
// ---------------------------------------------------------------------------
phase('Review')
const [uiReview, securityReview] = await parallel([
  () => agent(
    `Read-only review of the calendar makeover in ${WORKTREE}: git log --oneline e996f005d..HEAD, git diff e996f005d -- ${CAL}.
Invoke the Skill tool with "impeccable" (audit mode) and "frontend-design:frontend-design" first.
Judge against ${PLAN} §2 shared rules, §3 material, §8 definition of done, and ${DESIGN} §18/§20: one primary action per screen, no duplicate bottom surfaces, 320px readability, designed states (not shimmering), motion grammar, dark and reduced modes, focus paths.
mustFix = release-blocking, with file:line. shouldFix = everything else worth doing, with file:line. Do not edit anything.`,
    { label: 'UI polish review', phase: 'Review', schema: REVIEW, effort: 'high', agentType: 'ui-polish-reviewer' },
  ),
  () => agent(
    `Read-only security review of ${WORKTREE} vs e996f005d: src/app/golf/actions/class-detail.ts, conflict-inbox.ts, attendance.ts, scheduling.ts, golf.ts (respondToEventImpl), src/lib/calendar/availability.ts, scheduling-contracts.ts, and every new client surface under ${CAL}.
Verify: a class title never reaches a viewer without access === 'detail' through ANY path (person dialog, conflict detail, scheduling snapshot, class detail, the availability RSVP arm); every read authorizes server-side under RLS and resolves coach/player ids explicitly; no player write reaches golf_coach_blocked_time; feed tokens never appear in logs or telemetry; no arbitrary user id is accepted from the browser. The RLS policy golf_event_attendance_insert_self still does not check event_type — report whether the app-level guard in respondToEventImpl is sufficient or a migration is needed.
mustFix = a confirmed leak or authorization gap, with file:line and the reachability path. shouldFix = hardening. Do not edit anything.`,
    { label: 'security review', phase: 'Review', schema: REVIEW, effort: 'high', agentType: 'security-reviewer' },
  ),
])
report.uiReview = uiReview
report.securityReview = securityReview

// ---------------------------------------------------------------------------
// Phase 4 — Close. The static subset, real exit codes, nothing else.
// ---------------------------------------------------------------------------
phase('Close')
report.close = await agent(
  `From ${WORKTREE}, run each unpiped and report its exit code; do not fix anything; no git state changes.
npm run typecheck -> tsc ; npm run lint -> vitestDom (reuse the field) ; npm run markdown:ratchet -> vitestUnit (reuse the field) ; grep -rn "components/golf/calendar" ${CAL} | grep -v "import type" | grep -v __tests__ | wc -l -> legacyRuntimeImports ; git status --short -> dirtyOutsideScope (every dirty path). failures: first 15 lines of any failing output.`,
  { label: 'static subset', phase: 'Close', schema: GATE, effort: 'low', agentType: 'helm-reader' },
)

return report
