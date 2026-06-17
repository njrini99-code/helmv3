export const meta = {
  name: 'round-flow-rewire-analyze',
  description: 'Analyze round-submission snapshot safety for the new-round course-selection rewire + author Phase 6 E2E for the Cloud Course Library (read/inspect + author tests only; no submission-path edits)',
  phases: [
    { title: 'Analyze', detail: 'trace the round-submission payload + define what is safe to change in course-selection UI' },
    { title: 'E2E', detail: 'inspect the e2e harness + author a Playwright spec for the course library that fits it' },
  ],
}

const SAFETY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['submission_inputs', 'snapshot_path', 'safe_to_change', 'must_not_touch', 'notes'],
  properties: {
    submission_inputs: {
      type: 'array',
      description: 'each course-selection field that reaches the round payload + where it is read',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'flows_to', 'snapshot_relevant'],
        properties: {
          field: { type: 'string' },
          flows_to: { type: 'string' },
          snapshot_relevant: { type: 'boolean' },
        },
      },
    },
    snapshot_path: { type: 'string', description: 'how par/yards get frozen into golf_holes at submit; cite file:line' },
    safe_to_change: { type: 'array', items: { type: 'string' }, description: 'course-selection UI/handlers safe to restructure without affecting submission/snapshot' },
    must_not_touch: { type: 'array', items: { type: 'string' }, description: 'exact functions/refs/payload keys that MUST keep their current contract' },
    notes: { type: 'string' },
  },
}

const E2E_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['harness', 'auth_fixtures_exist', 'spec_path', 'spec_written', 'runnable_in_ci', 'notes'],
  properties: {
    harness: { type: 'string', description: 'how e2e is configured (playwright config path, projects, base URL)' },
    auth_fixtures_exist: { type: 'boolean', description: 'whether a seeded authenticated fixture/storageState exists for golf coach/player' },
    spec_path: { type: 'string' },
    spec_written: { type: 'boolean' },
    runnable_in_ci: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

phase('Analyze')
const safety = await agent(
  `Repo: /Users/ricknini/Downloads/helmv3 (GolfHelm, Next.js). READ ONLY — do NOT edit any file.\n\nGoal: we are about to restructure the COURSE-SELECTION UI in the new-round flow (make the Cloud Course Library picker primary, demote/consolidate the legacy golf_player_courses quick-pick + saved-select) WITHOUT changing how a round is submitted or how par/yards are snapshotted.\n\nTrace precisely (cite file:line):\n- src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx — every course-selection state/ref (setupData.courseName/courseCity/.../teesPlayed, resolvedCourseIdRef, selectedTeeIdRef, preloadedHoleConfigs, holesPerRound) and where each ends up in the submitted round payload (buildPartialRoundData ~L951, the submit handler, and any GolfRoundInputComprehensive).\n- src/app/golf/actions/golf.ts — submitRound / the comprehensive submit + save_partial_round_atomic call: which payload keys become golf_rounds columns vs the golf_holes snapshot. Confirm par/yards are frozen from the client holeConfigs/holes, independent of courseId/teeId.\nThen state: which course-selection UI + handlers are SAFE to restructure (the visual picker layer) and which exact contracts MUST NOT change (payload keys, ref semantics, snapshot source). Return structured.`,
  { label: 'analyze:submission-safety', phase: 'Analyze', schema: SAFETY_SCHEMA, agentType: 'Explore' },
)

phase('E2E')
const e2e = await agent(
  `Repo: /Users/ricknini/Downloads/helmv3 (GolfHelm). Author a Playwright E2E spec for the Cloud Course Library (Phase 6).\n\nFirst INSPECT the existing harness: playwright.config.* , the e2e/ directory (e.g. e2e/accessibility.spec.ts), how baseURL is set, whether any seeded AUTHENTICATED fixture / storageState for a golf coach or player exists (search for 'storageState', 'login', fixtures). Match the existing patterns EXACTLY.\n\nThen WRITE ONE new spec file under e2e/ (e.g. e2e/course-library.spec.ts) that is RUNNABLE in the existing CI harness. Scope it to what the harness actually supports:\n- If there are NO seeded auth fixtures: test the UNAUTHENTICATED contract — '/golf/dashboard/courses' redirects to login (not 500/404), and any public reachability. Do NOT invent credentials or hit prod.\n- If seeded auth EXISTS: also drive the authenticated flow — open /golf/dashboard/courses, the library renders, search works, the new-round 'Browse course library' button opens the tee picker.\nKeep it deterministic, no hard-coded waits, follow the repo's lint rules. Use @axe-core/playwright only if the existing specs do.\n\nReport: the harness summary, whether auth fixtures exist, the spec path you wrote, whether it's CI-runnable, and any setup the user must do for the authenticated path. Return structured.`,
  { label: 'e2e:course-library-spec', phase: 'E2E', schema: E2E_SCHEMA },
)

return { safety, e2e }
