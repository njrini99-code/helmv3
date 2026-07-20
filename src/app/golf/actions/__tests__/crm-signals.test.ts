// =============================================================================
// src/app/golf/actions/__tests__/crm-signals.test.ts
//
// Regression coverage for two fixes to the Signals engagement queues:
//   1. getOverdueSignals / getNoNextStepSignals used `.eq('is_archived',
//      false)`, which is NULL-unsafe — a row where is_archived was never
//      set (NULL) got silently dropped. Fixed to the NULL-safe
//      `.or('is_archived.is.null,is_archived.eq.false')` pattern used
//      elsewhere in the CRM (crm-dedup.ts, crm-gmail-send.ts, ...).
//   2. BAD_EMAIL_STATUSES exclusion previously applied only to the hot
//      list — overdue and noNextStep could surface a dead-email coach
//      with live quick-set buttons. Both lists now filter it out too.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'admin-1' } } })),
  usersSingle: vi.fn(async () => ({ data: { role: 'admin' } })),
  adminFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mocks.usersSingle,
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mocks.adminFrom,
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => {}),
}));

import { getEngagementSignals } from '../crm-signals';

// A minimal stand-in for supabase-js's PostgrestFilterBuilder: every filter
// method is a spy that returns the same builder (so calls chain), and the
// builder itself is thenable (matching supabase-js — `await` on a query
// resolves it) to the canned { data, error, count } passed in.
function chainable(result: { data: unknown; error: unknown; count?: number | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const method of ['select', 'eq', 'lt', 'is', 'in', 'or', 'not', 'order', 'limit']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (v: typeof result) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  mocks.usersSingle.mockResolvedValue({ data: { role: 'admin' } });
});

describe('getEngagementSignals', () => {
  it('is NULL-safe on is_archived and excludes BAD_EMAIL_STATUSES rows for overdue and noNextStep', async () => {
    // hot: no engagement rows — getHotSignals short-circuits without a
    // second crm_coaches call, so exactly 3 admin.from() calls happen in
    // total, in a fixed order (see Promise.all([hot, overdue, noNextStep])).
    const engagementBuilder = chainable({ data: [], error: null });

    const overdueRows = [
      {
        id: 'ov-null-archived', name: 'Overdue NullArchived', school: 'S1', status: 'contacted',
        next_follow_up_at: '2020-01-01T00:00:00.000Z', last_contacted_at: null,
        is_archived: null, email_status: 'valid',
      },
      {
        id: 'ov-bad-email', name: 'Overdue BadEmail', school: 'S2', status: 'contacted',
        next_follow_up_at: '2020-01-02T00:00:00.000Z', last_contacted_at: null,
        is_archived: false, email_status: 'bounced',
      },
      {
        id: 'ov-normal', name: 'Overdue Normal', school: 'S3', status: 'contacted',
        next_follow_up_at: '2020-01-03T00:00:00.000Z', last_contacted_at: null,
        is_archived: false, email_status: 'valid',
      },
    ];
    const overdueBuilder = chainable({ data: overdueRows, error: null });

    const noNextStepRows = [
      {
        id: 'nns-null-archived', name: 'NNS NullArchived', school: 'S4', status: 'engaged',
        next_follow_up_at: null, last_contacted_at: null,
        is_archived: null, email_status: null,
      },
      {
        id: 'nns-bad-email', name: 'NNS BadEmail', school: 'S5', status: 'engaged',
        next_follow_up_at: null, last_contacted_at: null,
        is_archived: false, email_status: 'unsubscribed',
      },
      {
        id: 'nns-normal', name: 'NNS Normal', school: 'S6', status: 'engaged',
        next_follow_up_at: null, last_contacted_at: null,
        is_archived: false, email_status: 'valid',
      },
    ];
    const noNextStepBuilder = chainable({ data: noNextStepRows, error: null, count: 5 });

    mocks.adminFrom
      .mockReturnValueOnce(engagementBuilder) // crm_coach_engagement (hot)
      .mockReturnValueOnce(overdueBuilder) // crm_coaches (overdue)
      .mockReturnValueOnce(noNextStepBuilder); // crm_coaches (noNextStep)

    const result = await getEngagementSignals();

    // NULL is_archived rows are kept, not silently dropped.
    expect(result.overdue.map((c) => c.id)).toEqual(['ov-null-archived', 'ov-normal']);
    expect(result.noNextStep.map((c) => c.id)).toEqual(['nns-null-archived', 'nns-normal']);

    // A dead email address never earns a quick-set row, in either list.
    expect(result.overdue.some((c) => c.id === 'ov-bad-email')).toBe(false);
    expect(result.noNextStep.some((c) => c.id === 'nns-bad-email')).toBe(false);

    // The "N in pipeline with no follow-up" headline is the DB-computed
    // count against is_archived/status/next_follow_up_at only — independent
    // of the in-JS BAD_EMAIL_STATUSES filter and of .limit().
    expect(result.noNextStepTotal).toBe(5);

    // Both queries use the NULL-safe .or(...) pattern, never a plain
    // .eq('is_archived', false) that would drop NULL rows.
    expect(overdueBuilder.eq).not.toHaveBeenCalled();
    expect(overdueBuilder.or).toHaveBeenCalledWith('is_archived.is.null,is_archived.eq.false');
    expect(noNextStepBuilder.eq).not.toHaveBeenCalled();
    expect(noNextStepBuilder.or).toHaveBeenCalledWith('is_archived.is.null,is_archived.eq.false');
  });

  it('still enforces the admin check before reading any signal list', async () => {
    mocks.usersSingle.mockResolvedValue({ data: { role: 'coach' } });

    await expect(getEngagementSignals()).rejects.toThrow('Forbidden');
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });
});
