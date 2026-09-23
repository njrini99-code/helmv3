/**
 * Package 9 GATE (repair plan §14.11): "One assignment can be followed
 * end-to-end through real persisted state. Merely rendering a button or
 * inserting a suggestion is insufficient." This test walks ONE focus area
 * through coach-assignment -> player-view -> completion -> re-eligibility,
 * calling the REAL server actions/loaders against a shared, stateful
 * mocked-Supabase table (`src/test/fixtures/fake-supabase.ts`) — nothing
 * here reimplements the actions' own logic.
 *
 * Stack: main <- #2012 (agent/coachhelm-a8-practice-log) <- #2017
 * (agent/coachhelm-a8-read-side) <- #2031 (agent/coachhelm-a8-practice-
 * log-write-ui) <- this branch (agent/coachhelm-a9-flow-integration).
 * #2012/#2017/#2031 are all still open — this test exercises their
 * combined, not-yet-merged state.
 *
 * ## Link-by-link map (see the PR body for the full report)
 *
 * 1. Coach creates from an insight, evidence_revision captured (#2004) —
 *    `createFocusAreaFromInsightV2` (development.ts:1409), the same action
 *    the real wired UI calls (InsightCard.tsx's `PromoteFocusAreaAction`).
 * 2. Duplicate-active guard (#1995) — `findActiveFocusAreaForMetric`,
 *    called from inside the same action (development.ts:1465).
 * 3. Player reads it — `getPlayerFocusAreas` (insights.ts:1805), which
 *    filters `status = 'active'` — a real assertion that a 'proposed'
 *    (not yet accepted) area is invisible until `acceptFocusArea` runs.
 * 4. Player logs practice/completion — `logFocusAreaPracticeSession` /
 *    `setFocusAreaCriterionMet` (focus-area-practice-log.ts, #2012/#2031),
 *    read back through `loadFocusAreaPracticeLogData` (practice-log-
 *    loader.ts, #2017).
 * 5. Due-for-review queue (#1998) — `computeDueFocusAreas` (due-for-
 *    review.ts). FIXED: `CreateFocusAreaFromInsightArgsV2` now extends
 *    `FocusAreaTimeframeFields` (development.ts:1385), the insert payload
 *    runs the same `normalizeTimeframe()` helper `updateFocusAreaImpl`
 *    already used, and the real wired caller (InsightCard.tsx's
 *    `PromoteFocusAreaAction.handleSubmit`) now passes the modal's
 *    target_kind/target_date/target_rounds through. A focus area created
 *    from an insight WITH a timeframe reaches the due-for-review queue
 *    with no separate `updateFocusArea` call — asserted below.
 * 6. Duplicate-guard re-opens after completion — `findActiveFocusAreaForMetric`
 *    blocks a second focus area on the same metric while the first is active
 *    (step 2), and stops blocking once `completeFocusArea` moves `status`
 *    out of `ACTIVE_FOCUS_AREA_STATUSES_FOR_DEDUP`. Answers "is a second
 *    area permitted at all", not "should the coach create one now" — that's
 *    step 7.
 * 7. Follow-up eligibility (#1998, owner decision 2026-09-23) — FIXED:
 *    `follow-up-eligibility.ts`'s `computeFollowUpEligibility` (pure) +
 *    `loadFollowUpRoundCounts` (loader over `golf_rounds`). Eligible when
 *    (status === 'completed' OR today is past `target_date`) AND >= 3
 *    completed rounds since the area's real start (`started_at`, from
 *    `acceptFocusArea` — never `created_at`). Under-threshold areas surface
 *    with a "waiting for rounds (n/3)" label rather than being omitted.
 *    Does not feed Package 10 outcome measurement — eligibility only, not
 *    whether the metric improved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ notifyDevPlanAssigned: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({
  recordInsightAction: vi.fn().mockResolvedValue(undefined),
}));

const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

const createAdminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClientMock() }));

// Only the two flags this flow touches are ever on — everything else stays
// off, matching production default-off until each migration is applied.
const ENABLED_FLAGS = new Set([
  'coachhelm_focus_area_evidence_revision',
  'coachhelm_focus_area_practice_log',
]);
vi.mock('@/lib/flags', () => ({
  isFlagEnabled: (name: string) => ENABLED_FLAGS.has(name),
}));

import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import {
  createFocusAreaFromInsightV2,
  acceptFocusArea,
  completeFocusArea,
} from '@/app/golf/actions/development';
import { getPlayerFocusAreas } from '@/app/golf/actions/insights';
import {
  logFocusAreaPracticeSession,
  addFocusAreaCriterion,
  setFocusAreaCriterionMet,
} from '@/app/golf/actions/focus-area-practice-log';
import { loadFocusAreaPracticeLogData } from '@/lib/coachhelm/focus-areas/practice-log-loader';
import { computeDueFocusAreas } from '@/lib/coachhelm/focus-areas/due-for-review';
import { computeFollowUpEligibility } from '@/lib/coachhelm/focus-areas/follow-up-eligibility';
import { loadFollowUpRoundCounts } from '@/lib/coachhelm/focus-areas/follow-up-eligibility-loader';
import { computeInsightEvidenceRevision } from '@/lib/coachhelm/focus-areas/evidence-revision-source';

const PLAYER_ID = 'player-1';
const PLAYER_USER_ID = 'user-player-1';
const COACH_USER_ID = 'user-coach-1';
const TEAM_ID = 'team-1';
const COACH_ID = 'coach-1';
const INSIGHT_ID = 'insight-1';
const TARGET_METRIC = 'sg_approach_a9_flow';

const SOURCE_INSIGHT_ROW = {
  id: INSIGHT_ID,
  player_id: PLAYER_ID,
  lifecycle_state: 'detected',
  evidence: {
    confidence: 0.68,
    your_value: 2.4,
    comparison_value: 1.9,
    secondary_value: 1.5,
    sample_n: 24,
    window_days: 30,
    window_start: '2026-08-24T00:00:00.000Z',
    window_end: '2026-09-23T00:00:00.000Z',
  },
  engine_version: 'v3.4.1',
};

/**
 * One shared, mutable table store for the whole flow — a write in one
 * action call must be visible to the next action's read, exactly as it
 * would be against a real database within one test's timeline.
 */
function makeTables() {
  return {
    golf_team_members: [{ player_id: PLAYER_ID, team_id: TEAM_ID, status: 'active' }],
    golf_team_coach_staff: [{ team_id: TEAM_ID, coach_id: COACH_ID }],
    golf_coach_insights: [SOURCE_INSIGHT_ROW],
    golf_player_focus_areas: [] as Record<string, unknown>[],
    golf_focus_area_criteria: [] as Record<string, unknown>[],
    golf_focus_area_practice_sessions: [] as Record<string, unknown>[],
    golf_rounds: [] as Record<string, unknown>[],
  };
}

/** Real UUIDs — `logFocusAreaPracticeSession`/`addFocusAreaCriterion`/
 *  `setFocusAreaCriterionMet` all reject a non-UUID id via `isUuid()`, and
 *  `fake-supabase`'s default `fake-<random>` id shape would fail that
 *  check. This is a harness requirement, not a product behavior. */
function asCoach(tables: ReturnType<typeof makeTables>) {
  return createFakeSupabase({
    tables,
    user: { id: COACH_USER_ID },
    idFactory: () => crypto.randomUUID(),
  });
}
function asPlayer(tables: ReturnType<typeof makeTables>) {
  return createFakeSupabase({
    tables,
    user: { id: PLAYER_USER_ID },
    idFactory: () => crypto.randomUUID(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Package 9 gate — one focus area, coach assignment through re-eligibility', () => {
  it('walks the real actions end to end: coach assignment, player view, completion, due-for-review, and follow-up eligibility', async () => {
    const tables = makeTables();

    // ---- Step 1: coach creates the focus area from an insight ----------
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
    createClientMock.mockResolvedValue(asCoach(tables));
    // createFocusAreaFromInsightV2's coach branch writes through the
    // SCOPED client (writeClient = supabase when isCoachPromoting), never
    // the admin client — but resolveEvidenceRevisionForInsight also reads
    // through that same writeClient, so the admin client is unused on this
    // branch. Still wired to the same `tables` so nothing silently forks.
    createAdminClientMock.mockReturnValue(asCoach(tables));

    const created = await createFocusAreaFromInsightV2({
      playerId: PLAYER_ID,
      insightId: INSIGHT_ID,
      title: 'Tighten approach dispersion',
      description: 'Focus on approach strokes gained from 125-175ft.',
      areaType: 'iron_play',
      targetMetric: TARGET_METRIC,
      // What FocusAreaModal collects and InsightCard's handleSubmit now
      // passes through — the fixed link in the chain (Step 5 below).
      target_kind: 'date',
      target_date: '2026-09-25',
    });
    expect(created.success).toBe(true);
    const focusAreaId = created.focusAreaId!;

    const row = tables.golf_player_focus_areas.find((r) => r.id === focusAreaId)!;
    expect(row.status).toBe('proposed'); // coach-created = prescription, not yet accepted
    expect(row.evidence_revision).toBe(computeInsightEvidenceRevision(SOURCE_INSIGHT_ROW));

    // ---- Step 2: duplicate-active guard blocks a second assignment -----
    const duplicateAttempt = await createFocusAreaFromInsightV2({
      playerId: PLAYER_ID,
      insightId: INSIGHT_ID,
      title: 'A second, redundant focus area',
      description: 'Should be blocked.',
      areaType: 'iron_play',
      targetMetric: TARGET_METRIC,
    });
    expect(duplicateAttempt.success).toBe(false);
    expect(duplicateAttempt.duplicateFocusAreaId).toBe(focusAreaId);
    expect(tables.golf_player_focus_areas).toHaveLength(1); // no second row written

    // ---- Step 3: player reads it — invisible while proposed -----------
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
    createClientMock.mockResolvedValue(asPlayer(tables));

    const beforeAccept = await getPlayerFocusAreas(PLAYER_ID);
    expect(beforeAccept.success).toBe(true);
    expect(beforeAccept.focus_areas.map((a: { id: string }) => a.id)).not.toContain(focusAreaId);

    const accepted = await acceptFocusArea(focusAreaId);
    expect(accepted.success).toBe(true);
    expect(tables.golf_player_focus_areas.find((r) => r.id === focusAreaId)!.status).toBe('active');

    const afterAccept = await getPlayerFocusAreas(PLAYER_ID);
    expect(afterAccept.focus_areas.map((a: { id: string }) => a.id)).toContain(focusAreaId);

    // ---- Step 4: player logs practice; coach authors + resolves a criterion
    const practiceResult = await logFocusAreaPracticeSession({
      focusAreaId,
      clientRequestId: crypto.randomUUID(),
      drillId: 'approach-125-175',
      reps: 20,
      note: 'Felt solid, mostly pin-high.',
    });
    expect(practiceResult.success).toBe(true);
    expect(tables.golf_focus_area_practice_sessions).toHaveLength(1);

    createClientMock.mockResolvedValue(asCoach(tables));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
    const criterionAdd = await addFocusAreaCriterion({
      focusAreaId,
      label: 'Log 3 approach practice sessions this week',
    });
    expect(criterionAdd.success).toBe(true);
    const criterionId = tables.golf_focus_area_criteria[0]!.id as string;

    const criterionMet = await setFocusAreaCriterionMet({ focusAreaId, criterionId, met: true });
    expect(criterionMet.success).toBe(true);

    // Read the persisted practice/criteria state back through the REAL
    // read-side loader (#2017), not by inspecting `tables` directly.
    const loaded = await loadFocusAreaPracticeLogData(asPlayer(tables) as never, [focusAreaId]);
    expect(loaded.practiceSummaryByFocusArea?.get(focusAreaId)).toEqual({
      count: 1,
      lastPracticedAt: tables.golf_focus_area_practice_sessions[0]!.practiced_at,
    });
    expect(loaded.criteriaByFocusArea?.get(focusAreaId)?.[0]).toMatchObject({
      id: criterionId,
      met: true,
    });

    // ---- Step 5: due-for-review queue — FIXED, proven end to end --------
    // The timeframe passed into Step 1 was persisted by the real create-
    // from-insight action (normalizeTimeframe() inside insertPayload), so
    // the real due-for-review derivation now surfaces this row — proven
    // against the actual persisted row, not a hand-built fixture.
    expect(row.target_kind).toBe('date');
    expect(row.target_date).toBe('2026-09-25');

    const dueAfterTimeframe = computeDueFocusAreas(
      [
        {
          id: row.id as string,
          player_id: PLAYER_ID,
          status: row.status as string,
          target_kind: (row.target_kind as string | null) ?? null,
          target_date: (row.target_date as string | null) ?? null,
        },
      ],
      { todayIso: '2026-09-23' },
    );
    expect(dueAfterTimeframe).toHaveLength(1);
    expect(dueAfterTimeframe[0]!.area.id).toBe(focusAreaId);
    expect(dueAfterTimeframe[0]!.reason).toBe('due_soon');

    // ---- Step 6: duplicate-guard re-opens after completion --------------
    // Completing the area moves it out of ACTIVE_FOCUS_AREA_STATUSES_FOR_
    // DEDUP — proven by re-running the SAME duplicate-guard path (step 2)
    // and observing it now succeeds. This is re-assignment being ALLOWED
    // again, distinct from follow-up ELIGIBILITY (step 7 below) — the guard
    // only answers "is a second area on this metric permitted at all".
    createClientMock.mockResolvedValue(asPlayer(tables));
    const completed = await completeFocusArea(focusAreaId);
    expect(completed.success).toBe(true);
    expect(tables.golf_player_focus_areas.find((r) => r.id === focusAreaId)!.status).toBe('completed');

    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
    createClientMock.mockResolvedValue(asCoach(tables));
    createAdminClientMock.mockReturnValue(asCoach(tables));
    const followUp = await createFocusAreaFromInsightV2({
      playerId: PLAYER_ID,
      insightId: INSIGHT_ID,
      title: 'Second pass on approach dispersion',
      description: 'The completed area earned a real follow-up.',
      areaType: 'iron_play',
      targetMetric: TARGET_METRIC,
    });
    expect(followUp.success).toBe(true);
    expect(followUp.focusAreaId).not.toBe(focusAreaId);
    expect(tables.golf_player_focus_areas).toHaveLength(2);

    // ---- Step 7: follow-up eligibility — FIXED, owner decision 2026-09-23
    // Eligible = (status === 'completed' OR today is past target_date) AND
    // >= 3 completed rounds since the area's real start (started_at, from
    // acceptFocusArea in step 3 — never created_at). `row` is `completed`
    // (step 6), so it qualifies on the status leg; round count starts at 0.
    const startedRow = tables.golf_player_focus_areas.find((r) => r.id === focusAreaId)!;
    expect(startedRow.started_at).toBeTruthy();
    const startDate = (startedRow.started_at as string).slice(0, 10);

    const coachReadClient = asCoach(tables);
    const countsBeforeRounds = await loadFollowUpRoundCounts(coachReadClient as never, [
      { id: focusAreaId, player_id: PLAYER_ID, started_at: startedRow.started_at as string },
    ]);
    expect(countsBeforeRounds).not.toBeNull(); // null would mean the read failed, not "0 rounds"

    const eligibilityBeforeRounds = computeFollowUpEligibility(
      [
        {
          id: focusAreaId,
          player_id: PLAYER_ID,
          status: startedRow.status as string,
          target_kind: (startedRow.target_kind as string | null) ?? null,
          target_date: (startedRow.target_date as string | null) ?? null,
        },
      ],
      countsBeforeRounds!,
      { todayIso: '2026-09-23' },
    );
    expect(eligibilityBeforeRounds).toHaveLength(1);
    expect(eligibilityBeforeRounds[0]).toMatchObject({
      reason: 'completed',
      roundsSinceStart: 0,
      eligible: false,
      waitingLabel: 'waiting for rounds (0/3)',
    });

    // Play 3 completed rounds on/after the area's start date — real
    // persisted golf_rounds rows, read back through the real loader. Also
    // seed three rounds that each fail exactly one of the loader's filters,
    // to prove they're excluded rather than merely never having been present:
    // a round before the start date, an in-progress round, and a round for
    // a different player.
    tables.golf_rounds.push(
      { id: crypto.randomUUID(), player_id: PLAYER_ID, round_date: startDate, status: 'completed' },
      { id: crypto.randomUUID(), player_id: PLAYER_ID, round_date: startDate, status: 'completed' },
      { id: crypto.randomUUID(), player_id: PLAYER_ID, round_date: startDate, status: 'completed' },
      // before the start date — must not count
      { id: crypto.randomUUID(), player_id: PLAYER_ID, round_date: '2000-01-01', status: 'completed' },
      // not completed — must not count
      { id: crypto.randomUUID(), player_id: PLAYER_ID, round_date: startDate, status: 'in_progress' },
      // a different player — must not count
      { id: crypto.randomUUID(), player_id: 'player-2', round_date: startDate, status: 'completed' },
    );

    const countsAfterRounds = await loadFollowUpRoundCounts(coachReadClient as never, [
      { id: focusAreaId, player_id: PLAYER_ID, started_at: startedRow.started_at as string },
    ]);
    expect(countsAfterRounds).not.toBeNull();
    // Exactly 3, not 6 — proves the before-start, non-completed, and
    // other-player rounds were all filtered out, not just absent.
    expect(countsAfterRounds!.get(focusAreaId)).toBe(3);

    const eligibilityAfterRounds = computeFollowUpEligibility(
      [
        {
          id: focusAreaId,
          player_id: PLAYER_ID,
          status: startedRow.status as string,
          target_kind: (startedRow.target_kind as string | null) ?? null,
          target_date: (startedRow.target_date as string | null) ?? null,
        },
      ],
      countsAfterRounds!,
      { todayIso: '2026-09-23' },
    );
    expect(eligibilityAfterRounds).toHaveLength(1);
    expect(eligibilityAfterRounds[0]).toMatchObject({
      reason: 'completed',
      roundsSinceStart: 3,
      eligible: true,
      waitingLabel: null,
    });
  });
});
