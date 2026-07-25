// =============================================================================
// src/app/api/webhooks/resend/__tests__/route.test.ts
//
// Regression coverage for the two CRM inbound-signal defects this route caused:
//
//   #5 ORPHANED ENGAGEMENT EVENTS — when `data.email_id` did not resolve a
//      crm_contact_log row, coachId was null and the ENTIRE automations block
//      was skipped. 170 opens/clicks produced no CRM effect whatsoever. The
//      route now falls back to resolving the coach by recipient address
//      (case-insensitively) and persists it to email_events.coach_id.
//
//   #6 STALE CRM MIRROR — crm_coaches.last_email_event_* froze on 2026-06-25.
//      Root cause is NOT a missing write here: the DB trigger
//      sync_coach_last_email_event() short-circuits on
//      `NEW.contact_log_id IS NULL`, and since 2026-06-26 every single event
//      has had a NULL contact_log_id. The route now writes the mirror for
//      exactly the rows the trigger declines, and deliberately does NOT write
//      it for the rows the trigger already owns.
//
// Plus the scanner-prefetch gate: 93% of recorded clicks fired under two
// minutes after delivery, from machines spoofing real browser user-agents. A
// prefetch must never promote a coach to 'engaged'.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resp = { data?: unknown; error?: unknown };
type RecordedCall = { table: string; op: string; args: unknown[][] };

// --- fixtures the mocked client reads from ----------------------------------
let calls: RecordedCall[] = [];
let contactLogRow: { id: string; coach_id: string | null } | null = null;
let coachRows: Array<{ id: string; email: string; created_at: string }> = [];
let emailSnapshot: { delivered_at: string | null; sent_at: string | null } | null = null;
let existingMirrorAt: string | null = null;
let automationRules: Array<{ created_by: string }> = [];
let emailEventInserted = true;

/** Column list passed to .select(), used to tell the crm_coaches queries apart. */
function selectCols(argsLog: unknown[][]): string {
  return (argsLog.find(([name]) => name === 'select')?.[1] as string | undefined) ?? '';
}
function argValue(argsLog: unknown[][], method: string): unknown {
  return argsLog.find(([name]) => name === method)?.[2];
}

function resolveFor(table: string, op: string, argsLog: unknown[][]): Resp {
  const cols = selectCols(argsLog);

  if (table === 'crm_contact_log' && op === 'select') {
    return { data: contactLogRow, error: null };
  }

  if (table === 'crm_coaches' && op === 'select') {
    // Fallback resolution by recipient address.
    if (cols.includes('email, created_at')) {
      const pattern = String(argValue(argsLog, 'ilike') ?? '');
      // The real ILIKE would also match `_` as a wildcard; the route re-checks
      // exact lowercase equality in TS, so an over-eager mock is fine here.
      return { data: coachRows.filter((c) => c.email.toLowerCase() === pattern), error: null };
    }
    // Mirror read (monotonic guard).
    if (cols.includes('last_email_event_at')) {
      return { data: { last_email_event_at: existingMirrorAt }, error: null };
    }
    // Automations coach snapshot.
    return { data: { id: 'coach-cj', status: 'contacted', tags: [] }, error: null };
  }

  if (table === 'emails' && op === 'select') {
    return { data: emailSnapshot, error: null };
  }

  if (table === 'crm_automations' && op === 'select') {
    return { data: automationRules, error: null };
  }

  if (table === 'email_events' && op === 'upsert') {
    return { data: emailEventInserted ? { id: 'event-1' } : null, error: null };
  }

  if (table === 'crm_email_suppressions' && op === 'select') {
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
      if (name === 'update' || name === 'insert' || name === 'delete' || name === 'upsert') {
        op = name;
      }
      argsLog.push([name, ...args]);
      return chain;
    });
  for (const m of [
    'select', 'eq', 'in', 'not', 'ilike', 'gte', 'lte', 'order', 'limit',
    'update', 'insert', 'upsert', 'delete',
  ]) {
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

const logServerError = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerError(...args),
}));

// The seeded open/click rule promotes a coach to 'engaged'. Returning it
// unconditionally means any assertion about "did a promotion happen?" is purely
// a question of whether the route let the automations block run at all.
vi.mock('@/lib/crm/automations-engine', () => ({
  evaluateAutomationsForEvent: vi.fn(() => ({
    actions: [{ kind: 'set_coach_status', params: { value: 'engaged' } }],
  })),
}));

const svix = vi.hoisted(() => ({
  verify: vi.fn<(body: string, headers: Record<string, string>) => unknown>(),
}));
vi.mock('svix', () => ({
  Webhook: class {
    verify(body: string, headers: Record<string, string>) {
      return svix.verify(body, headers);
    }
  },
}));

import { POST } from '../route';

// --- helpers ----------------------------------------------------------------

const EVENT_AT = '2026-07-24T12:05:43.544Z';

/**
 * `latencyMs` is the gap between delivery and the event — the classifier's
 * primary (and only trustworthy) discriminator.
 */
function openEvent(latencyMs: number | null, recipient = 'christopher.jones@lr.edu') {
  const eventAt = new Date(EVENT_AT);
  if (latencyMs !== null) {
    const deliveredAt = new Date(eventAt.getTime() - latencyMs).toISOString();
    emailSnapshot = { delivered_at: deliveredAt, sent_at: deliveredAt };
  } else {
    emailSnapshot = null;
  }
  return {
    type: 'email.opened',
    created_at: EVENT_AT,
    data: {
      to: [recipient],
      email_id: 'msg-1',
      subject: 'Helm for LR golf',
      // Scanners spoof real browser UAs, and Resend proxies opens through its
      // own edge anyway — this string must not be what decides the verdict.
      open: { ipAddress: '66.249.88.162', userAgent: 'Amazon CloudFront', timestamp: EVENT_AT },
    },
  };
}

function webhookRequest() {
  return new Request('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'svix-id': 'msg_test',
      'svix-timestamp': '1750000000',
      'svix-signature': 'v1,sig',
    },
    body: '{}',
  });
}

/** The email_events row the route wrote, if any. */
function upsertedEvent(): Record<string, unknown> | undefined {
  const call = calls.find((c) => c.table === 'email_events' && c.op === 'upsert');
  return call?.args.find(([name]) => name === 'upsert')?.[1] as Record<string, unknown> | undefined;
}

/** crm_coaches .update() payloads, in call order. */
function coachUpdates(): Array<Record<string, unknown>> {
  return calls
    .filter((c) => c.table === 'crm_coaches' && c.op === 'update')
    .map((c) => c.args.find(([name]) => name === 'update')?.[1] as Record<string, unknown>);
}

const HUMAN_LATENCY_MS = 45 * 60 * 1000;
const SCANNER_LATENCY_MS = 30 * 1000;

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';

    contactLogRow = null;
    // Stored with different casing than the mailbox reports it — 10 of the 96
    // recoverable orphaned events hinge on exactly this.
    coachRows = [{ id: 'coach-cj', email: 'Christopher.Jones@LR.edu', created_at: '2026-01-01T00:00:00Z' }];
    emailSnapshot = null;
    existingMirrorAt = null;
    automationRules = [{ created_by: 'admin-1' }];
    emailEventInserted = true;
  });

  describe('#5 orphaned engagement events', () => {
    it('resolves the coach by recipient address when the contact log misses, and stamps coach_id on the event row', async () => {
      svix.verify.mockReturnValue(openEvent(HUMAN_LATENCY_MS));

      const res = await POST(webhookRequest());
      expect(res.status).toBe(200);

      // The attribution now rides on the stored row, so "which coach did this
      // open belong to?" is answerable in SQL rather than only in-request.
      const row = upsertedEvent();
      expect(row?.coach_id).toBe('coach-cj');
      expect(row?.contact_log_id).toBeNull();
      expect(row?.recipient_email).toBe('christopher.jones@lr.edu');

      // ...and a coach resolved by that path now drives automations, which is
      // the entire CRM effect that 170 events previously produced none of.
      expect(calls.some((c) => c.table === 'crm_automations')).toBe(true);
      expect(coachUpdates()).toContainEqual(expect.objectContaining({ status: 'engaged' }));
    });

    it('leaves coach_id null and runs no automations when the address matches no coach', async () => {
      coachRows = [];
      svix.verify.mockReturnValue(openEvent(HUMAN_LATENCY_MS, 'stranger@example.edu'));

      await POST(webhookRequest());

      // The raw event is still recorded — we drop CRM effects, never evidence.
      expect(upsertedEvent()?.coach_id).toBeNull();
      expect(calls.some((c) => c.table === 'crm_automations')).toBe(false);
    });
  });

  describe('scanner prefetch must not manufacture a buying signal', () => {
    it('records a sub-2-minute open but refuses to promote the coach', async () => {
      svix.verify.mockReturnValue(openEvent(SCANNER_LATENCY_MS));

      await POST(webhookRequest());

      // Evidence is kept, complete with attribution.
      expect(upsertedEvent()?.coach_id).toBe('coach-cj');
      // But no automation ran, so nothing could set status='engaged'.
      expect(calls.some((c) => c.table === 'crm_automations')).toBe(false);
      expect(coachUpdates()).toHaveLength(0);
    });

    it('does not let a spoofed browser user-agent rescue a prefetch', async () => {
      const event = openEvent(SCANNER_LATENCY_MS);
      // The measured fleet: 79 sessions, one Chrome UA, 49 distinct IPs. A UA
      // blocklist cannot see this; latency can.
      event.data.open.userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7 Safari/537.36';
      svix.verify.mockReturnValue(event);

      await POST(webhookRequest());

      expect(calls.some((c) => c.table === 'crm_automations')).toBe(false);
    });
  });

  describe('webhook retry idempotency', () => {
    it('does not replay CRM automations or the activity mirror for a duplicate event', async () => {
      emailEventInserted = false;
      svix.verify.mockReturnValue(openEvent(HUMAN_LATENCY_MS));

      await POST(webhookRequest());

      expect(upsertedEvent()?.coach_id).toBe('coach-cj');
      expect(calls.some((c) => c.table === 'crm_automations')).toBe(false);
      expect(coachUpdates()).toHaveLength(0);
    });
  });

  describe('#6 stale crm_coaches mirror', () => {
    it('advances last_email_event_* for a coach the DB trigger cannot reach', async () => {
      svix.verify.mockReturnValue(openEvent(HUMAN_LATENCY_MS));

      await POST(webhookRequest());

      // Trigger parity: the bare verb, not the prefixed event type.
      expect(coachUpdates()).toContainEqual(
        expect.objectContaining({
          last_email_event_type: 'opened',
          last_email_event_at: EVENT_AT,
        }),
      );
    });

    it('does NOT write the mirror when the contact log resolved the coach — that row belongs to the trigger', async () => {
      contactLogRow = { id: 'log-1', coach_id: 'coach-cj' };
      svix.verify.mockReturnValue(openEvent(HUMAN_LATENCY_MS));

      await POST(webhookRequest());

      expect(upsertedEvent()?.contact_log_id).toBe('log-1');
      // No app-side mirror write: sync_coach_last_email_event() already fired
      // off this INSERT. Automations still run normally.
      expect(coachUpdates().some((u) => 'last_email_event_type' in u)).toBe(false);
      expect(calls.some((c) => c.table === 'crm_automations')).toBe(true);
    });

    it('respects the monotonic guard and skips an out-of-order event', async () => {
      existingMirrorAt = '2026-07-25T00:00:00.000Z'; // newer than EVENT_AT
      svix.verify.mockReturnValue(openEvent(HUMAN_LATENCY_MS));

      await POST(webhookRequest());

      expect(coachUpdates().some((u) => 'last_email_event_type' in u)).toBe(false);
    });

    it('still advances the mirror for an unmeasurable event, but grants it no automations', async () => {
      // No `emails` snapshot and no in-payload send time => verdict 'unknown'.
      // This split is deliberate: the mirror is a factual "last activity" field
      // and gating it on countsAsHumanEngagement() would re-freeze it for
      // exactly the events that froze it originally. A status promotion, by
      // contrast, requires positive evidence of a human.
      svix.verify.mockReturnValue(openEvent(null));

      await POST(webhookRequest());

      expect(coachUpdates()).toContainEqual(
        expect.objectContaining({ last_email_event_type: 'opened' }),
      );
      expect(calls.some((c) => c.table === 'crm_automations')).toBe(false);
    });
  });

  describe('preserved behaviour', () => {
    it('rejects an invalid signature with 401 and touches no table', async () => {
      svix.verify.mockImplementation(() => {
        throw new Error('No matching signature found');
      });

      const res = await POST(webhookRequest());

      expect(res.status).toBe(401);
      expect(calls).toHaveLength(0);
    });

    it('still suppresses and flags a bounce, now including recipient-resolved coaches', async () => {
      // Keep the automations out of this one so the assertions below are purely
      // about the hardwired deliverability path.
      automationRules = [];
      svix.verify.mockReturnValue({
        type: 'email.bounced',
        created_at: EVENT_AT,
        data: { to: ['christopher.jones@lr.edu'], email_id: 'msg-2' },
      });

      await POST(webhookRequest());

      const suppression = calls.find(
        (c) => c.table === 'crm_email_suppressions' && c.op === 'insert',
      );
      expect(suppression).toBeDefined();
      expect(suppression?.args.find(([n]) => n === 'insert')?.[1]).toEqual(
        expect.objectContaining({ email: 'christopher.jones@lr.edu', reason: 'hard_bounce' }),
      );
      // Bounces are not engagement events, so the classifier never gates them.
      expect(coachUpdates()).toContainEqual(
        expect.objectContaining({ email_status: 'bounced' }),
      );
    });
  });
});
