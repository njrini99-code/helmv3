export const meta = {
  name: 'merged-features-integration-test',
  description: "Per-feature integration test for the 4 branches merged 2026-06-13 (course library, org dedup, team toggle, messages active-team scope): prod DB objects live + feature test files green + optional live-route smoke",
  phases: [
    { title: 'Feature', detail: 'one agent per merged feature: verify prod schema objects + run its test files' },
    { title: 'Smoke', detail: 'live HTTP reachability of key routes (if a prod URL is passed via args)' },
  ],
}

// Pass the prod URL to enable the live smoke: Workflow({ scriptPath, args: { prodUrl: "https://…" } })
const PROD_URL = (args && args.prodUrl) || null

const FEATURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['feature', 'db_checks', 'tests', 'status', 'notes'],
  properties: {
    feature: { type: 'string' },
    db_checks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['object', 'present'],
        properties: { object: { type: 'string' }, present: { type: 'boolean' } },
      },
    },
    tests: {
      type: 'object',
      additionalProperties: false,
      required: ['command', 'passed', 'failed', 'exit_code'],
      properties: {
        command: { type: 'string' },
        passed: { type: 'number' },
        failed: { type: 'number' },
        exit_code: { type: 'number' },
      },
    },
    status: { type: 'string', enum: ['pass', 'fail'] },
    notes: { type: 'string' },
  },
}

const SMOKE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['routes', 'all_ok', 'notes'],
  properties: {
    routes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'http_status', 'ok'],
        properties: { path: { type: 'string' }, http_status: { type: 'number' }, ok: { type: 'boolean' } },
      },
    },
    all_ok: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

const FEATURES = [
  {
    key: 'course-library',
    prompt: `Feature: Cloud Course Library (PR #285) on GolfHelm (Supabase project qmnssrrolpinvwjjnufo).
DB objects to confirm exist in PROD via mcp__supabase__execute_sql (read-only — load it via ToolSearch "select:mcp__supabase__execute_sql"):
  - trigger 'trg_golf_courses_set_normalized_name' on golf_courses (pg_trigger, NOT tgisinternal)
  - UNIQUE index 'golf_courses_normalized_name_key' (pg_indexes)
  - tables golf_course_tees, golf_course_tee_holes, golf_team_saved_courses exist
Then run its test files from the repo root /Users/ricknini/Downloads/helmv3 via Bash:
  npx vitest run --project unit src/lib/golf/__tests__/course-library.test.ts src/app/golf/actions/__tests__/course-library.test.ts
Report the passed/failed counts + exit code, and each DB object present true/false. status='pass' only if exit_code===0 AND every db object present.`,
  },
  {
    key: 'org-dedup',
    prompt: `Feature: Organization dedup (PR #283) on GolfHelm (Supabase qmnssrrolpinvwjjnufo).
DB object to confirm in PROD via mcp__supabase__execute_sql: UNIQUE index 'organizations_normalized_name_uidx' on public.organizations (pg_indexes).
Then run its test file from /Users/ricknini/Downloads/helmv3 via Bash:
  npx vitest run --project unit src/app/golf/actions/__tests__/program-onboarding.test.ts
Report passed/failed + exit code. status='pass' only if exit_code===0 AND the index is present.`,
  },
  {
    key: 'team-toggle',
    prompt: `Feature: men's/women's team toggle UI (PR #284) on GolfHelm. No new DB object (relies on prior golf_teams_org_gender_uidx).
Run its test files from /Users/ricknini/Downloads/helmv3 via Bash:
  npx vitest run --project unit src/components/golf/__tests__/TeamSwitcher.test.tsx src/lib/golf/__tests__/team-theme.test.ts
Report passed/failed + exit code. db_checks may be an empty array. status='pass' if exit_code===0.`,
  },
  {
    key: 'messages-scope',
    prompt: `Feature: messages rail scoped to the coach's active team (PR #282) on GolfHelm. No new DB object.
Run its test file from /Users/ricknini/Downloads/helmv3 via Bash:
  npx vitest run --project unit src/app/golf/actions/__tests__/golf-active-team-conversations.test.ts
Report passed/failed + exit code. db_checks may be an empty array. status='pass' if exit_code===0.`,
  },
]

phase('Feature')
const features = await parallel(
  FEATURES.map((f) => () =>
    agent(
      `You are integration-testing ONE merged feature. Do exactly what is asked, then return the structured result. Do not modify any files; do not run apply_migration.\n\n${f.prompt}`,
      { label: `test:${f.key}`, phase: 'Feature', schema: FEATURE_SCHEMA },
    ),
  ),
)

let smoke = null
if (PROD_URL) {
  phase('Smoke')
  smoke = await agent(
    `Live reachability smoke against the deployed GolfHelm production site at ${PROD_URL}.\nFor each path below, curl it and record the HTTP status (follow redirects with -L but report the FINAL status; a login redirect 200/3xx is OK, a 5xx is NOT). Use Bash: curl -s -o /dev/null -w "%{http_code}" -L "${PROD_URL}<path>".\nPaths: "/", "/golf/login", "/golf/dashboard/courses", "/golf/dashboard". A 200 or a 3xx/auth-redirect counts as ok; 5xx is a failure. all_ok=true only if no route returned 5xx.`,
    { label: 'smoke:prod-routes', phase: 'Smoke', schema: SMOKE_SCHEMA },
  )
}

return {
  features,
  failing_features: (features.filter(Boolean) || []).filter((f) => f.status !== 'pass').map((f) => f.feature),
  all_features_pass: (features.filter(Boolean) || []).every((f) => f.status === 'pass') && features.every(Boolean),
  smoke,
}
