// =============================================================================
// src/app/lifting/actions/__tests__/soreness.test.ts
//
// GUARD (fix-backlog regression tests):
//
// 1. submitSorenessMap hardcoded `side: 'center'` for every
//    helm_lifting_soreness_maps row regardless of the actual region, even
//    though SORENESS_REGIONS already carries real left/right/center
//    laterality per region id. Every left- or right-sided soreness report
//    was silently persisted with a wrong 'center' side.
//
// 2. computeSorenessReadiness's score-based fallback defaulted every
//    trunk/hips/whole_body-only soreness report (e.g. lower_back, groin —
//    both baseballRiskGroup:'spine_hip') to 'orange_lower' purely because it
//    wasn't 'orange_upper', mislabeling a back/spine report as a
//    leg-specific one on the coach-facing readiness board. Fixed to route
//    trunk/hip-only reports to 'orange_upper' ("At risk") instead of
//    silently defaulting to 'orange_lower' ("Limited").
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FinalResult {
  data: unknown;
  error: unknown;
}

function makeQueryBuilder(finalResult: FinalResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  const passthrough = ['select', 'eq', 'order', 'limit', 'in', 'gte', 'lte', 'lt', 'or', 'is'];
  for (const m of passthrough) {
    builder[m] = vi.fn(() => builder);
  }
  builder.upsertArgs = null as [unknown, unknown] | null;
  builder.upsert = vi.fn((payload: unknown, opts: unknown) => {
    builder.upsertArgs = [payload, opts];
    return builder;
  });
  builder.insertArgs = null as unknown;
  builder.insert = vi.fn((payload: unknown) => {
    builder.insertArgs = payload;
    return builder;
  });
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.single = vi.fn(async () => finalResult);
  builder.maybeSingle = vi.fn(async () => finalResult);
  builder.then = (resolve: (v: FinalResult) => void) => resolve(finalResult);
  return builder;
}

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';

let tableBuilders: Record<string, ReturnType<typeof makeQueryBuilder>>;

function resetTables() {
  tableBuilders = {
    helm_lifting_athletes: makeQueryBuilder({
      data: { id: ATHLETE_ID, organization_id: ORG_ID, sport: 'baseball' },
      error: null,
    }),
    helm_lifting_readiness_checkins: makeQueryBuilder({ data: { id: 'checkin-1' }, error: null }),
    // No prior soreness_maps rows — select resolves to an empty array so the
    // stage-and-swap path never issues a delete.
    helm_lifting_soreness_maps: makeQueryBuilder({ data: [], error: null }),
    helm_lifting_soreness_check_requests: makeQueryBuilder({ data: null, error: null }),
  };
}
resetTables();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_client: unknown, table: string) => tableBuilders[table]),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/lifting/with-lifting-action', () => ({
  withLiftingAction:
    (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const ctx = {
        user: { id: 'user-1' },
        orgId: ORG_ID,
        access: { isCoach: false, canEdit: false, canView: true, coachRow: null },
      };
      return fn(ctx, ...args);
    },
  LiftingActionError: class LiftingActionError extends Error {},
}));

import { submitSorenessMap } from '@/app/lifting/actions/soreness';

describe('submitSorenessMap region side', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('persists the real left/right/center side from SORENESS_REGIONS, not a hardcoded "center"', async () => {
    const res = await submitSorenessMap({
      orgId: ORG_ID,
      athleteId: ATHLETE_ID,
      checkinDate: '2026-07-04',
      requestId: null,
      regions: [
        { regionId: 'left_shoulder', severity: 4 },
        { regionId: 'right_hip', severity: 3 },
        { regionId: 'lower_back', severity: 2 },
      ],
    });

    expect(res.success).toBe(true);
    const inserted = tableBuilders.helm_lifting_soreness_maps.insertArgs as Array<{
      body_region: string;
      side: string;
    }>;
    expect(inserted).toHaveLength(3);
    const sideByRegion = new Map(inserted.map((r) => [r.body_region, r.side]));
    expect(sideByRegion.get('left_shoulder')).toBe('left');
    expect(sideByRegion.get('right_hip')).toBe('right');
    expect(sideByRegion.get('lower_back')).toBe('center');
  });

  it('rejects unknown region ids before ever writing (still exercises the real SORENESS_REGIONS validation)', async () => {
    await expect(
      submitSorenessMap({
        orgId: ORG_ID,
        athleteId: ATHLETE_ID,
        checkinDate: '2026-07-04',
        requestId: null,
        regions: [{ regionId: 'not_a_real_region', severity: 4 }],
      }),
    ).rejects.toThrow(/Unknown soreness region/);
    expect(tableBuilders.helm_lifting_soreness_maps.insert).not.toHaveBeenCalled();
  });
});

describe('computeSorenessReadiness trunk/hip band fallback (via submitSorenessMap)', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('routes a trunk/hip-only report (lower_back, severity 6) to orange_upper, not the leg-specific orange_lower', async () => {
    await submitSorenessMap({
      orgId: ORG_ID,
      athleteId: ATHLETE_ID,
      checkinDate: '2026-07-04',
      requestId: null,
      regions: [{ regionId: 'lower_back', severity: 6 }],
    });

    const [checkinPayload] = tableBuilders.helm_lifting_readiness_checkins.upsertArgs as [
      { readiness_band: string },
      unknown,
    ];
    expect(checkinPayload.readiness_band).toBe('orange_upper');
  });

  it('still routes a genuine lower-body-only report (right_knee) to orange_lower', async () => {
    await submitSorenessMap({
      orgId: ORG_ID,
      athleteId: ATHLETE_ID,
      checkinDate: '2026-07-04',
      requestId: null,
      regions: [{ regionId: 'right_knee', severity: 6 }],
    });

    const [checkinPayload] = tableBuilders.helm_lifting_readiness_checkins.upsertArgs as [
      { readiness_band: string },
      unknown,
    ];
    expect(checkinPayload.readiness_band).toBe('orange_lower');
  });

  it('only ever writes a DB-allowed readiness_band value (green/yellow/orange_lower/orange_upper/red/blue)', async () => {
    const allowed = new Set(['green', 'yellow', 'orange_lower', 'orange_upper', 'red', 'blue']);
    await submitSorenessMap({
      orgId: ORG_ID,
      athleteId: ATHLETE_ID,
      checkinDate: '2026-07-04',
      requestId: null,
      regions: [{ regionId: 'groin', severity: 7 }],
    });
    const [checkinPayload] = tableBuilders.helm_lifting_readiness_checkins.upsertArgs as [
      { readiness_band: string },
      unknown,
    ];
    expect(allowed.has(checkinPayload.readiness_band)).toBe(true);
  });
});
