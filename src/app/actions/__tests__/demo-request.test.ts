// =============================================================================
// src/app/actions/__tests__/demo-request.test.ts
//
// Inbound-signal capture for the landing demo form. Covers the data loss this
// action shipped with for ~6 weeks:
//   1. name / school / phone / message / request context were collected and
//      then thrown away — only a free-text `notes` string survived.
//   2. The crm_coaches convenience row was SKIPPED whenever the email already
//      existed, so a repeat request from a known coach left no coach-level
//      trace at all.
//   3. The ops alert was gated on VERCEL_ENV === 'production', so preview and
//      local submissions vanished with no signal anywhere.
// Plus the invariant holding all of it together: a CRM or alerting failure must
// never fail the visitor's submission.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ExistingCoach {
  id: string;
  name: string | null;
  school: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
}

/** The shape the action writes to demo_requests, for assertion readability. */
interface DemoRequestPayload {
  email: string;
  name: string | null;
  organization: string | null;
  phone: string | null;
  message: string | null;
  source: string;
  referer: string | null;
  ip: string | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  crm_coach_id: string | null;
  notes: string;
  interest_type: string;
  status: string;
}

interface CoachPatch {
  status?: string;
  name?: string;
  school?: string;
  phone?: string;
  notes?: string;
  next_follow_up_at?: string;
  updated_at?: string;
}

interface OpsAlertPayload {
  subject: string;
  text: string;
}

// Args are captured into `state` rather than read back off `mock.calls`, so the
// assertions stay typed without leaning on vi.fn()'s inferred call tuples.
const mocks = vi.hoisted(() => {
  const state = {
    existingCoach: null as ExistingCoach | null,
    lookupError: null as { code: string } | null,
    coachCreateError: null as { code: string } | null,
    demoInsertError: null as { code: string; hint: string; details: string } | null,
    adminClientThrows: false,
    rateAllowed: true,
    lastDemoRow: null as unknown,
    lastCoachInsert: null as unknown,
    lastCoachPatch: null as unknown,
    lastCoachUpdateId: null as unknown,
    lastAlert: null as unknown,
  };
  return {
    state,
    demoInsert: vi.fn(async (row: unknown) => {
      state.lastDemoRow = row;
      return { error: state.demoInsertError };
    }),
    coachSelectMaybeSingle: vi.fn(async () => ({
      data: state.existingCoach,
      error: state.lookupError,
    })),
    coachInsert: vi.fn(),
    coachInsertMaybeSingle: vi.fn(async () => ({
      data: state.coachCreateError ? null : { id: 'coach-created' },
      error: state.coachCreateError,
    })),
    coachUpdate: vi.fn(),
    coachUpdateEq: vi.fn(),
    sendOpsAlert: vi.fn(async (alert: unknown) => {
      state.lastAlert = alert;
      return { sent: true, skipped: false };
    }),
    logServerError: vi.fn(async () => {}),
    revalidatePath: vi.fn(),
  };
});

vi.mock('@/lib/auth/rate-limit', () => ({
  RATE_LIMITS: { DEMO_REQUEST: { maxAttempts: 10, windowMs: 600_000 } },
  checkRateLimit: vi.fn(async () => ({
    allowed: mocks.state.rateAllowed,
    remaining: mocks.state.rateAllowed ? 9 : 0,
    resetAt: Date.now() + 600_000,
  })),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([
    // Comma-joined XFF proves the action keeps only the client hop.
    ['x-forwarded-for', '203.0.113.9, 70.41.3.18'],
    ['user-agent', 'TestAgent/1.0 (TestOS)'],
    ['referer', 'https://helmsportslabs.com/pricing'],
    ['x-vercel-ip-country', 'US'],
    ['x-vercel-ip-city', 'Charlotte'],
  ])),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: vi.fn(() => ({ insert: mocks.demoInsert })) })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    if (mocks.state.adminClientThrows) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing for admin client.');
    }
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mocks.coachSelectMaybeSingle })),
          ilike: vi.fn(() => ({
            limit: vi.fn(async () => ({
              data: mocks.state.existingCoach ? [mocks.state.existingCoach] : [],
              error: mocks.state.lookupError,
            })),
          })),
        })),
        insert: mocks.coachInsert,
        update: mocks.coachUpdate,
      })),
    };
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));
vi.mock('@/lib/admin/digest/transport', () => ({ sendOpsAlert: mocks.sendOpsAlert }));

import { submitDemoRequest } from '@/app/actions/demo-request';

const EMAIL = 'coach@example.edu';

const FULL_DETAILS = {
  name: 'Coach Rivera',
  school: 'Example University Golf',
  phone: '704-555-0100',
  message: 'Looking at a spring rollout for 9 players.',
  source: 'pricing' as const,
};

const BASE_COACH = {
  id: 'coach-77',
  name: 'Coach Rivera',
  school: 'Example University Golf',
  phone: '704-555-0100',
  notes: null,
};

const demoPayload = () => mocks.state.lastDemoRow as DemoRequestPayload;
const coachPatch = () => mocks.state.lastCoachPatch as CoachPatch;
const coachInsertValues = () => mocks.state.lastCoachInsert as Record<string, unknown>;
const opsAlert = () => mocks.state.lastAlert as OpsAlertPayload;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.state, {
    existingCoach: null,
    lookupError: null,
    coachCreateError: null,
    demoInsertError: null,
    adminClientThrows: false,
    rateAllowed: true,
    lastDemoRow: null,
    lastCoachInsert: null,
    lastCoachPatch: null,
    lastCoachUpdateId: null,
    lastAlert: null,
  });
  mocks.coachInsert.mockImplementation((values: unknown) => {
    mocks.state.lastCoachInsert = values;
    return { select: vi.fn(() => ({ maybeSingle: mocks.coachInsertMaybeSingle })) };
  });
  mocks.coachUpdate.mockImplementation((patch: unknown) => {
    mocks.state.lastCoachPatch = patch;
    return { eq: mocks.coachUpdateEq };
  });
  mocks.coachUpdateEq.mockImplementation(async (_column: string, value: unknown) => {
    mocks.state.lastCoachUpdateId = value;
    return { error: null };
  });
  vi.stubEnv('VERCEL_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('submitDemoRequest — structured capture', () => {
  it('persists every field into its real column instead of only a notes string', async () => {
    const result = await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(result.success).toBe(true);
    expect(demoPayload()).toEqual(
      expect.objectContaining({
        email: EMAIL,
        name: 'Coach Rivera',
        organization: 'Example University Golf',
        phone: '704-555-0100',
        message: 'Looking at a spring rollout for 9 players.',
        source: 'pricing',
        interest_type: 'other',
        status: 'pending',
      }),
    );
  });

  it('persists the request context captureRequestContext() used to discard', async () => {
    await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(demoPayload()).toEqual(
      expect.objectContaining({
        ip: '203.0.113.9',
        user_agent: 'TestAgent/1.0 (TestOS)',
        referer: 'https://helmsportslabs.com/pricing',
        country: 'US',
        city: 'Charlotte',
      }),
    );
  });

  it('still writes the legacy human-readable notes string for backwards compatibility', async () => {
    await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(demoPayload().notes).toBe(
      'Submitted from pricing page · Name: Coach Rivera · Program: Example University Golf',
    );
  });

  it("defaults source to 'landing' and leaves unsupplied columns null", async () => {
    await submitDemoRequest(EMAIL, { name: 'Coach Rivera' });

    expect(demoPayload().source).toBe('landing');
    expect(demoPayload().organization).toBeNull();
    expect(demoPayload().phone).toBeNull();
    expect(demoPayload().message).toBeNull();
  });

  it('rejects an invalid email before touching the database', async () => {
    const result = await submitDemoRequest('not-an-email');

    expect(result.success).toBe(false);
    expect(mocks.demoInsert).not.toHaveBeenCalled();
    expect(mocks.coachInsert).not.toHaveBeenCalled();
  });

  it('rate-limits the anonymous service-role write path before creating a CRM row', async () => {
    mocks.state.rateAllowed = false;

    const result = await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(result).toEqual({
      success: false,
      error: 'Too many requests. Please wait a few minutes and try again.',
    });
    expect(mocks.demoInsert).not.toHaveBeenCalled();
    expect(mocks.coachInsert).not.toHaveBeenCalled();
  });
});

describe('submitDemoRequest — crm_coaches linkage', () => {
  it('links demo_requests.crm_coach_id to the coach row it just created', async () => {
    await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(coachInsertValues()).toEqual(
      expect.objectContaining({ email: EMAIL, name: 'Coach Rivera', status: 'new_lead' }),
    );
    expect(demoPayload().crm_coach_id).toBe('coach-created');
  });

  it('links crm_coach_id on the already-exists path too, instead of silently skipping', async () => {
    mocks.state.existingCoach = { ...BASE_COACH, status: 'contacted' };

    await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(mocks.coachInsert).not.toHaveBeenCalled();
    expect(mocks.coachUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.state.lastCoachUpdateId).toBe('coach-77');
    expect(demoPayload().crm_coach_id).toBe('coach-77');
  });

  it('appends a dated note and pulls the follow-up forward on a repeat request', async () => {
    mocks.state.existingCoach = {
      ...BASE_COACH,
      notes: 'Imported from the NCAA list',
      status: 'contacted',
    };

    await submitDemoRequest(EMAIL, FULL_DETAILS);

    const patch = coachPatch();
    expect(patch.notes).toContain('Imported from the NCAA list');
    expect(patch.notes).toContain('demo request from the pricing surface');
    expect(patch.next_follow_up_at).toBeTruthy();
    expect(patch.updated_at).toBeTruthy();
  });

  it('backfills the Unknown placeholders once the visitor gives a real value', async () => {
    mocks.state.existingCoach = {
      id: 'coach-77',
      name: 'Unknown',
      school: 'Unknown',
      phone: null,
      notes: null,
      status: 'contacted',
    };

    await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(coachPatch()).toEqual(
      expect.objectContaining({
        name: 'Coach Rivera',
        school: 'Example University Golf',
        phone: '704-555-0100',
      }),
    );
  });

  it('never overwrites a real name, school or phone already on the coach', async () => {
    mocks.state.existingCoach = {
      id: 'coach-77',
      name: 'Coach R. Rivera',
      school: 'Example University Mens Golf',
      phone: '704-555-9999',
      notes: null,
      status: 'contacted',
    };

    await submitDemoRequest(EMAIL, FULL_DETAILS);

    const patch = coachPatch();
    expect(patch.name).toBeUndefined();
    expect(patch.school).toBeUndefined();
    expect(patch.phone).toBeUndefined();
  });
});

describe('submitDemoRequest — status ladder on a repeat request', () => {
  it.each(['lost', 'nurture'])('re-opens a resting %s coach back to new_lead', async (status) => {
    mocks.state.existingCoach = { ...BASE_COACH, status };

    await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(coachPatch().status).toBe('new_lead');
  });

  it.each(['contacted', 'engaged', 'proposal'])(
    'preserves the higher %s status rather than dragging it back to new_lead',
    async (status) => {
      mocks.state.existingCoach = { ...BASE_COACH, status };

      await submitDemoRequest(EMAIL, FULL_DETAILS);

      expect(coachPatch().status).toBeUndefined();
    },
  );

  it('never downgrades a won coach', async () => {
    mocks.state.existingCoach = { ...BASE_COACH, status: 'won' };

    await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(coachPatch().status).toBeUndefined();
  });
});

describe('submitDemoRequest — fail-soft', () => {
  it('still saves the lead when the CRM client cannot even be constructed', async () => {
    mocks.state.adminClientThrows = true;

    const result = await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(result.success).toBe(true);
    expect(mocks.demoInsert).toHaveBeenCalledTimes(1);
    expect(demoPayload().crm_coach_id).toBeNull();
    expect(mocks.logServerError).toHaveBeenCalled();
  });

  it('still saves the lead when the coach lookup errors', async () => {
    mocks.state.lookupError = { code: '42501' };

    const result = await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(result.success).toBe(true);
    expect(demoPayload().crm_coach_id).toBeNull();
  });

  it('still succeeds when the ops alert throws', async () => {
    mocks.sendOpsAlert.mockRejectedValueOnce(new Error('resend down'));

    const result = await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(result.success).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/golf/admin');
  });

  it('reports failure to the visitor only when demo_requests itself rejects the row', async () => {
    mocks.state.demoInsertError = { code: '23514', hint: 'check constraint', details: 'interest_type' };

    const result = await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(result.success).toBe(false);
    expect(mocks.sendOpsAlert).not.toHaveBeenCalled();
  });
});

describe('submitDemoRequest — ops alert environment gating', () => {
  it('fires an unprefixed alert in production', async () => {
    await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(mocks.sendOpsAlert).toHaveBeenCalledTimes(1);
    expect(opsAlert().subject).toBe(
      'New demo request — Example University Golf (coach@example.edu)',
    );
  });

  it('still fires outside production, tagged with the environment so it stays filterable', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    await submitDemoRequest(EMAIL, FULL_DETAILS);

    expect(mocks.sendOpsAlert).toHaveBeenCalledTimes(1);
    expect(opsAlert().subject).toBe(
      '[preview] New demo request — Example University Golf (coach@example.edu)',
    );
    expect(opsAlert().text).toContain('Phone: 704-555-0100');
    expect(opsAlert().text).toContain('Looking at a spring rollout for 9 players.');
  });
});
