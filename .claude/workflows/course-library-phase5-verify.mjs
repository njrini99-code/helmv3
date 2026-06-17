export const meta = {
  name: 'course-library-phase5-verify',
  description: 'Adversarially verify the Phase-5 UNIQUE+trigger migration SQL and design the player→team data-migration variants (read-only; no migration is applied)',
  phases: [
    { title: 'Verify', detail: '4 independent adversarial lenses try to refute the Part-1 migration safety' },
    { title: 'Design', detail: 'design + sketch SQL for the 3 Part-2 data-migration variants' },
  ],
}

// ── The exact Part-1 migration SQL under review ──────────────────────────────
const PART1_SQL = `
-- Phase 5a: normalized_name UNIQUE guard + auto-normalize trigger on golf_courses

CREATE OR REPLACE FUNCTION golf_courses_set_normalized_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  NEW.normalized_name := golf_normalize_name(NEW.name);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_golf_courses_set_normalized_name ON golf_courses;
CREATE TRIGGER trg_golf_courses_set_normalized_name
  BEFORE INSERT OR UPDATE OF name ON golf_courses
  FOR EACH ROW
  EXECUTE FUNCTION golf_courses_set_normalized_name();

-- Re-backfill (idempotent) so every existing row equals the trigger output
UPDATE golf_courses
SET normalized_name = golf_normalize_name(name)
WHERE normalized_name IS DISTINCT FROM golf_normalize_name(name);

-- Pre-flight: abort if any active duplicate normalized_name group exists
DO $blk$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT 1 FROM golf_courses
    WHERE deleted_at IS NULL AND normalized_name IS NOT NULL
    GROUP BY normalized_name HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot add unique index: % active normalized_name duplicate group(s)', dup_count;
  END IF;
END $blk$;

-- Swap the non-unique partial index for a UNIQUE partial index
DROP INDEX IF EXISTS golf_courses_normalized_name_idx;
CREATE UNIQUE INDEX IF NOT EXISTS golf_courses_normalized_name_key
  ON golf_courses (normalized_name)
  WHERE deleted_at IS NULL AND normalized_name IS NOT NULL;
`

// ── Verified prod facts (already gathered; agents must NOT re-query prod) ─────
const FACTS = `
PROD DATA FACTS (already verified read-only; do NOT run apply_migration; you may
read repo files to verify code-path claims):
- golf_courses: 15 active rows, 0 with NULL normalized_name, 0 duplicate active
  normalized_name groups (so a partial UNIQUE index is addable directly).
- Existing index golf_courses_normalized_name_idx is NON-unique, partial
  WHERE deleted_at IS NULL. PK is on id. Other indexes: idx_golf_courses_name(name),
  idx_golf_courses_state(state).
- golf_rounds: 191 rows, ALL reference courses by course_name STRING; ZERO by
  course_id. Analytics (stats-data.ts) GROUP BY golf_rounds.course_name string.
- golf_normalize_name(text) exists; TS mirror normalizeName in
  src/lib/golf/course-library.ts. Word-anchored; returns '' for stopword-only input.
- golf_courses WRITE paths in code:
  * src/app/golf/actions/golf.ts resolveCourseId(): READ-ONLY (select id ilike name).
    Round submission (golf.ts:1281, 4079) + savePlayerCourse(5373) only READ to
    resolve an id; they NEVER insert a course.
  * src/app/golf/actions/courses.ts createCourse(): INSERTs without normalized_name;
    ALREADY handles error.code==='23505' (returns a friendly error).
  * src/app/golf/actions/courses.ts updateCourse(): UPDATEs name; does NOT check the
    update error (silently ignored).
  * src/app/golf/actions/courses.ts deleteCourse(): HARD delete.
  * src/app/golf/actions/course-library.ts (the new DAL): createCourse sets
    normalized_name client-side + handles 23505 with a dedup re-fetch; updateCourse
    soft-deletes / restores (deleted_at toggle).
`

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'verdict', 'findings', 'summary'],
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['safe', 'concern', 'refuted'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'issue', 'evidence', 'suggested_fix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
          issue: { type: 'string' },
          evidence: { type: 'string' },
          suggested_fix: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['variants', 'recommendation', 'rationale'],
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'approach', 'sql_sketch', 'pros', 'cons', 'reversibility', 'shared_catalog_pollution_risk'],
        properties: {
          name: { type: 'string' },
          approach: { type: 'string' },
          sql_sketch: { type: 'string' },
          pros: { type: 'array', items: { type: 'string' } },
          cons: { type: 'array', items: { type: 'string' } },
          reversibility: { type: 'string' },
          shared_catalog_pollution_risk: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
        },
      },
    },
    recommendation: { type: 'string' },
    rationale: { type: 'string' },
  },
}

const LENSES = [
  {
    key: 'idempotency-replay',
    prompt: `LENS: idempotency & CI replay. Assume this exact SQL is committed as a Supabase migration and replayed on a FRESH database (all prior migrations first), AND that it might be re-run on prod. Find any way it is NOT safely re-runnable / does NOT converge to identical state. Check: DROP ... IF EXISTS / CREATE OR REPLACE / IF NOT EXISTS coverage; whether the trigger recurses (it fires BEFORE UPDATE OF name; the backfill UPDATE sets normalized_name only); whether DROP INDEX of the old name + CREATE UNIQUE of a new name leaves a stale duplicate index on replay; ordering. Default to verdict='refuted' if you find a real replay/idempotency defect.`,
  },
  {
    key: 'break-a-write-path',
    prompt: `LENS: does the UNIQUE index + BEFORE trigger BREAK or silently corrupt any golf_courses write path? Use the FACTS' enumerated write paths and READ the actual files (src/app/golf/actions/golf.ts, courses.ts, course-library.ts) to confirm. Specifically: (a) can round submission ever throw or fail because of the new constraint? (b) legacy createCourse 23505 handling — still correct? (c) legacy updateCourse rename now silently fails on collision — acceptable or a data-integrity trap? (d) the new DAL restore path (un-soft-delete) could collide with an active same-name course → 23505 — is it handled? (e) does the trigger overwriting NEW.normalized_name conflict with the DAL's client-side set? List each path with a verdict. Default to 'refuted' only for a genuine break of a live path (esp. round submission).`,
  },
  {
    key: 'data-truth-snapshot',
    prompt: `LENS: round/stat truth & snapshot safety. Confirm the SQL touches ONLY golf_courses (no golf_rounds/golf_holes/golf_shots). Critically assess the re-backfill UPDATE: could golf_normalize_name(name) change any EXISTING normalized_name value in a way that (i) merges two distinct facilities, or (ii) since rounds group by course_name STRING not normalized_name, does any normalized_name change affect analytics at all? Also: the partial unique predicate WHERE deleted_at IS NULL AND normalized_name IS NOT NULL — could an empty-string ('') normalized_name (stopword-only course name) cause a surprising collision, and is the pre-flight DO block catching that? Default to 'refuted' if data truth is at risk.`,
  },
  {
    key: 'rls-grants-security',
    prompt: `LENS: RLS / grants / function security. The trigger function is SECURITY INVOKER with SET search_path=public. Assess: is INVOKER correct here (vs DEFINER), given golf_normalize_name must be callable by whatever role inserts a course (authenticated)? Does authenticated have EXECUTE on golf_normalize_name (Phase 1 REVOKED it from anon; check it's granted to authenticated/the right role, else the trigger ERRORS on every authenticated insert — a hard break)? Any search_path injection risk? Does adding the trigger require re-running get_advisors? Default to 'refuted' if the trigger would fail for the role that actually inserts courses.`,
  },
]

phase('Verify')
const verdicts = await parallel(
  LENSES.map((l) => () =>
    agent(
      `You are adversarially reviewing a PostgreSQL migration before it is applied to a PRODUCTION database for a golf SaaS (GolfHelm).\n\n${l.prompt}\n\n=== MIGRATION SQL UNDER REVIEW ===\n${PART1_SQL}\n\n=== ${FACTS}\n\nReturn a structured verdict. Be concrete: cite file:line or the exact SQL line for every finding. You may use Grep/Read on the repo. You must NOT run apply_migration or mutate anything.`,
      { label: `verify:${l.key}`, phase: 'Verify', schema: VERDICT_SCHEMA, agentType: 'Explore' },
    ).then((v) => (v ? { ...v, lens: l.key } : null)),
  ),
)

phase('Design')
const design = await agent(
  `Design the Phase-5 PART-2 data migration for GolfHelm's Cloud Course Library.\n\nGOAL (user's stated scope): migrate legacy golf_player_courses → the new golf_team_saved_courses model.\n\n=== ${FACTS}\n\nLEGACY TABLE DETAIL (golf_player_courses):\n- 35 rows, 15 distinct players, ALL 35 have course_id IS NULL (name-only).\n- 33 distinct course_name values; normalized → 30 distinct keys; ZERO overlap with the 15-row catalog.\n- Per-player config stored as JSON in the notes column: {city,state,rating,slope,tees,holesPerRound,holeConfigs:[{holeNumber,par,yardage}]}. So each legacy row can reconstruct a full tee + per-hole pars/yards.\n- Powers (golf.ts): getPlayerSavedCourses, savePlayerCourse, touchSavedCourse, getRecentCoursesForPlayer (the new-round quick-pick). This feature is LIVE and currently coexists additively with the new Phase-4 TeePickerDrawer.\n- The catalog's 15 rows are seed data (source=null, no creator), including a junk/test row named "bob".\n\nTARGET MODEL:\n- golf_courses (facility) — has normalized_name, soft-delete, created_by_user_id/team_id.\n- golf_course_tees (tee set) + golf_course_tee_holes (per-hole par/yards).\n- golf_team_saved_courses (team_id NOT NULL, course_id NOT NULL, default_tee_id, pinned, times_played).\n- player→team is via golf_team_members(player_id) — golf_players has NO team_id.\n\nDesign EXACTLY THREE variants and give each a runnable SQL sketch (idempotent, snapshot-safe, never touching golf_rounds/holes/shots, dedup-aware against the new UNIQUE normalized_name index, attribution-stamped, RLS-aware):\n1. "faithful" — legacy row → golf_courses + golf_course_tees + golf_course_tee_holes (from JSON notes) + golf_team_saved_courses (player→team, collapse dups per team). Richest, most complex; pushes free-text personal entries (incl. "bob") into the SHARED global catalog.\n2. "catalog-seed-only" — create dedup-aware golf_courses rows for distinct legacy names only (optionally with one tee from JSON); do NOT write golf_team_saved_courses. Lighter; still adds rows to the shared catalog.\n3. "defer" — ship ONLY the Part-1 UNIQUE+trigger now; leave golf_player_courses + its live feature untouched; fold the data migration into the later full round-flow rewire (when the legacy quick-pick is actually retired). Zero shared-catalog pollution now.\n\nFor each: how to exclude junk like "bob"; how to handle a player on >1 team or 0 teams; how times_played/last_played_at map; reversibility. Then give a single recommendation. Be opinionated about whether dumping free-text personal saved-courses into a SHARED multi-team catalog is wise given the data quality.`,
  { label: 'design:part2-variants', phase: 'Design', schema: DESIGN_SCHEMA, agentType: 'Explore' },
)

return {
  part1_sql: PART1_SQL,
  verify: verdicts.filter(Boolean),
  blockers: verdicts.filter(Boolean).flatMap((v) =>
    (v.findings || []).filter((f) => f.severity === 'blocker' || f.severity === 'high').map((f) => ({ lens: v.lens, ...f })),
  ),
  any_refuted: verdicts.filter(Boolean).some((v) => v.verdict === 'refuted'),
  design,
}
