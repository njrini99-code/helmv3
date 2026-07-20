// =============================================================================
// src/app/api/cron/process-sequences/__tests__/route.test.ts
//
// Regression coverage for the HIGH finding: processEnrollment ignored the
// parent sequence's is_active flag. Enrollments are fetched purely by their
// OWN status='active' + next_send_at <= now() — pausing the whole sequence
// via updateSequence({is_active:false}) had zero effect on the cron: every
// individual enrollment kept firing on schedule regardless of the sequence
// being paused. This locks in:
//   1. An enrollment under a PAUSED (is_active=false) sequence is skipped —
//      counted in the `skipped` bucket — and, critically, processing stops
//      BEFORE the coach lookup (no crm_coaches query happens for it at all).
//   2. An enrollment under an ACTIVE (is_active=true) sequence is untouched
//      by the guard and proceeds through the normal per-enrollment flow.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resp = { data?: unknown; error?: unknown; count?: number };
type RecordedCall = { table: string; op: string; args: unknown[][] };

let calls: RecordedCall[] = [];
let dueEnrollments: Array<{
  id: string;
  sequence_id: string;
  coach_id: string;
  status: string;
  current_step: number;
  next_send_at: string | null;
}> = [];
let sequencesById: Record<string, { is_active: boolean }> = {};

function resolveFor(table: string, op: string, argsLog: unknown[][]): Resp {
  if (table === 'crm_contact_log' && op === 'select') {
    // Daily-cap count query — keep it at 0 so the cap never gates the test.
    return { data: null, error: null, count: 0 };
  }
  if (table === 'crm_sequence_enrollments' && op === 'select') {
    return { data: dueEnrollments, error: null };
  }
  if (table === 'crm_sequences' && op === 'select') {
    const eqCall = argsLog.find(([name]) => name === 'eq') as
      | [string, string, string]
      | undefined;
    const id = eqCall?.[2];
    const seq = id ? sequencesById[id] : undefined;
    return { data: seq ?? null, error: null };
  }
  if (table === 'crm_coaches' && op === 'select') {
    // Every enrollment under test reaches this point with a coach id that
    // deliberately does not resolve, so processEnrollment takes the cheap
    // "stop manually, no more calls" branch instead of needing a full
    // Resend-send mock.
    return { data: null, error: { message: 'not found' } };
  }
  if (table === 'crm_sequence_enrollments' && op === 'update') {
    return { data: null, error: null };
  }
  return { data: null, error: null };
}

function makeChain(table: string) {
  let op = 'select';
  const argsLog: unknown[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  const record = (name: string) =>
    vi.fn((...args: unknown[]) => {
      if (name === 'update' || name === 'insert' || name === 'delete') op = name;
      argsLog.push([name, ...args]);
      return chain;
    });
  for (const m of ['select', 'eq', 'in', 'not', 'gte', 'lte', 'order', 'limit', 'update', 'insert', 'delete']) {
    chain[m] = record(m);
  }
  const finish = () => {
    const resp = resolveFor(table, op, argsLog);
    calls.push({ table, op, args: argsLog });
    return resp;
  };
  chain.single = vi.fn(async () => finish());
  chain.maybeSingle = vi.fn(async () => finish());
  chain.then = (resolve: (v: Resp) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(finish()).then(resolve, reject);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => makeChain(table)),
  })),
}));

const logServerError = vi.fn(async () => undefined);
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerError(...args),
}));

import { GET } from '../route';

function cronRequest() {
  return new Request('http://localhost/api/cron/process-sequences', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

describe('GET /api/cron/process-sequences — parent sequence is_active guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    process.env.CRON_SECRET = 'test-cron-secret';
    delete process.env.SEQUENCE_DAILY_CAP;
    delete process.env.SEQUENCE_PER_TICK_CAP;

    sequencesById = {
      'seq-paused': { is_active: false },
      'seq-active': { is_active: true },
    };
    dueEnrollments = [
      {
        id: 'enr-under-paused-seq',
        sequence_id: 'seq-paused',
        coach_id: 'coach-under-paused-seq',
        status: 'active',
        current_step: 0,
        next_send_at: new Date().toISOString(),
      },
      {
        id: 'enr-under-active-seq',
        sequence_id: 'seq-active',
        coach_id: 'coach-under-active-seq',
        status: 'active',
        current_step: 0,
        next_send_at: new Date().toISOString(),
      },
    ];
  });

  it('skips an enrollment whose parent sequence is paused, and never even looks up its coach', async () => {
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.skipped).toBe(1);
    // The other (active-sequence) enrollment still gets processed — it just
    // happens to hit the "coach not found" branch and stop, which is the
    // outcome asserted in the next test's shared fixture.
    expect(body.stopped).toBe(1);
    expect(body.candidates).toBe(2);

    // No crm_coaches lookup ever fired for the paused sequence's enrollment —
    // the guard short-circuits BEFORE any coach data is touched.
    const coachLookups = calls.filter((c) => c.table === 'crm_coaches');
    expect(coachLookups).toHaveLength(1);
    const lookedUpCoachId = coachLookups[0]!.args.find(([name]) => name === 'eq')?.[2];
    expect(lookedUpCoachId).toBe('coach-under-active-seq');

    // And the paused-sequence enrollment row itself was never written to —
    // "skip", not "stop": it should resume untouched once the sequence is
    // reactivated.
    const enrollmentUpdates = calls.filter(
      (c) => c.table === 'crm_sequence_enrollments' && c.op === 'update',
    );
    expect(enrollmentUpdates).toHaveLength(1);
    const updatedId = enrollmentUpdates[0]!.args.find(([name]) => name === 'eq')?.[2];
    expect(updatedId).toBe('enr-under-active-seq');
  });

  it('does not skip an enrollment whose parent sequence is active', async () => {
    // Isolate to just the active-sequence enrollment for a focused assertion.
    dueEnrollments = dueEnrollments.filter((e) => e.sequence_id === 'seq-active');

    const res = await GET(cronRequest());
    const body = await res.json();

    expect(body.skipped).toBe(0);
    expect(body.candidates).toBe(1);
    // Proceeds into the normal flow (reaches the coach lookup) rather than
    // being short-circuited by the guard.
    expect(calls.some((c) => c.table === 'crm_coaches')).toBe(true);
  });
});
