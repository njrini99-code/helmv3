// =============================================================================
// src/app/golf/actions/__tests__/crm-demo-sessions.test.ts
//
// Coverage for getCrmDemoSessions — the CRM-side read of golf_demo_sessions
// (self-serve demo-gate walk-ins), kept deliberately separate from
// demo_requests (homepage form). Verifies:
//   1. Admin gate — throws before any query when the caller isn't an admin.
//   2. Happy path — sessions come back newest-first, and rows whose email
//      matches a crm_coaches row carry matched_coach_id + school/status.
//   3. Unmatched visitor emails carry null matched_coach_* fields rather
//      than throwing or being dropped.
//   4. No sessions -> [] without ever querying crm_coaches (no emails to
//      look up).
//   5. Query failure -> [] (logged), not a thrown error, so the CRM section
//      degrades gracefully once the admin check has already passed.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'admin-1' } } })),
  usersSingle: vi.fn(async () => ({ data: { role: 'admin' } })),
  adminFrom: vi.fn(),
  logServerException: vi.fn(async () => {}),
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
  logServerException: mocks.logServerException,
}));

import { getCrmDemoSessions } from '../crm-demo-sessions';

// Minimal stand-in for supabase-js's PostgrestFilterBuilder: every filter
// method is a spy returning the same builder (so calls chain), and the
// builder is thenable, resolving to the canned { data, error } result.
function chainable(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
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

describe('getCrmDemoSessions', () => {
  it('throws Forbidden before querying golf_demo_sessions when the caller is not an admin', async () => {
    mocks.usersSingle.mockResolvedValue({ data: { role: 'coach' } });

    await expect(getCrmDemoSessions()).rejects.toThrow('Forbidden');
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('throws Unauthorized before querying when there is no session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(getCrmDemoSessions()).rejects.toThrow('Unauthorized');
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('returns sessions newest-first, annotating matched crm_coaches by case-insensitive email', async () => {
    const sessionRows = [
      {
        id: 'sess-1', name: 'Pat Walker', email: 'Pat@KnownSchool.edu',
        school: 'Known School', ip: '1.2.3.4', user_agent: 'UA/1',
        referrer: 'https://example.com/invite', entered_at: '2026-07-19T10:00:00.000Z',
      },
      {
        id: 'sess-2', name: 'Sam Rivers', email: 'sam@unknown.edu',
        school: 'Unknown Prep', ip: null, user_agent: null,
        referrer: null, entered_at: '2026-07-18T09:00:00.000Z',
      },
    ];
    const sessionsBuilder = chainable({ data: sessionRows, error: null });

    const coachRows = [
      { id: 'coach-1', email: 'pat@knownschool.edu', school: 'Known School', status: 'contacted' },
    ];
    const coachesBuilder = chainable({ data: coachRows, error: null });

    mocks.adminFrom
      .mockReturnValueOnce(sessionsBuilder) // golf_demo_sessions
      .mockReturnValueOnce(coachesBuilder); // crm_coaches

    const result = await getCrmDemoSessions();

    expect(result.map((r) => r.id)).toEqual(['sess-1', 'sess-2']);

    // Matched despite the differing case between the session and coach emails.
    expect(result[0]).toMatchObject({
      matched_coach_id: 'coach-1',
      matched_coach_school: 'Known School',
      matched_coach_status: 'contacted',
    });

    // Unmatched visitor — nulls, not a thrown error or a dropped row.
    expect(result[1]).toMatchObject({
      matched_coach_id: null,
      matched_coach_school: null,
      matched_coach_status: null,
    });

    // golf_demo_sessions ordered by entered_at desc, capped at 100.
    expect(sessionsBuilder.order).toHaveBeenCalledWith('entered_at', { ascending: false });
    expect(sessionsBuilder.limit).toHaveBeenCalledWith(100);

    // crm_coaches looked up by the deduped, lowercased visitor emails.
    expect(coachesBuilder.in).toHaveBeenCalledWith('email', ['pat@knownschool.edu', 'sam@unknown.edu']);
  });

  it('returns [] without querying crm_coaches when there are no demo sessions', async () => {
    const sessionsBuilder = chainable({ data: [], error: null });
    mocks.adminFrom.mockReturnValueOnce(sessionsBuilder);

    const result = await getCrmDemoSessions();

    expect(result).toEqual([]);
    expect(mocks.adminFrom).toHaveBeenCalledTimes(1);
  });

  it('returns [] and logs rather than throwing when the golf_demo_sessions query fails', async () => {
    const failingBuilder = chainable({ data: null, error: new Error('connection reset') });
    mocks.adminFrom.mockReturnValueOnce(failingBuilder);

    const result = await getCrmDemoSessions();

    expect(result).toEqual([]);
    expect(mocks.logServerException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ action: 'crm_demo_sessions.getCrmDemoSessions' }),
    );
  });
});
