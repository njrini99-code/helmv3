// =============================================================================
// src/app/api/webhooks/resend/__tests__/signature-verification.test.ts
//
// Contract test against the REAL svix SDK (no network, fake secret only) for
// both Resend webhook routes: /api/webhooks/resend and
// /api/webhooks/resend-inbound.
//
// svix 2 changed the JS Webhook#verify contract: it now only verifies and
// returns undefined instead of the parsed JSON payload (svix 2.2.0 changelog).
// A route that kept `event = wh.verify(...)` would still compile (the result
// was cast) but would see `event === undefined`, so every real event would be
// silently dropped or crash after the signature check. This file signs a
// payload with svix's own Webhook#sign and drives each route end to end:
// valid -> accepted and parsed; wrong secret, tampered body, stale timestamp,
// missing headers -> 401 with nothing written.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Webhook } from 'svix';

let upserts: Array<Record<string, unknown>> = [];
const adminClientCreated = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    adminClientCreated();
    return {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
        upsert: async (payload: Record<string, unknown>) => {
          upserts.push(payload);
          return { error: null };
        },
      }),
    };
  },
}));

const logServerError = vi.fn();
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerError(...args),
}));

// Fake signing secrets in svix's whsec_<base64> format. Nothing here is real.
const SIGNING_SECRET = `whsec_${Buffer.from('helm-contract-test-secret-0001').toString('base64')}`;
const OTHER_SECRET = `whsec_${Buffer.from('someone-else-entirely-secret-02').toString('base64')}`;

const { POST: outboundPOST } = await import('../route');
const { POST: inboundPOST } = await import('../../resend-inbound/route');

type Route = (req: Request) => Promise<Response>;

interface SignOpts {
  secret?: string;
  timestamp?: Date;
  /** Body actually sent; defaults to the signed body. */
  sentBody?: string;
  omitHeaders?: boolean;
}

function signedRequest(url: string, body: string, opts: SignOpts = {}): Request {
  const msgId = 'msg_contract_1';
  const timestamp = opts.timestamp ?? new Date();
  const signature = new Webhook(opts.secret ?? SIGNING_SECRET).sign(msgId, timestamp, body);
  const headers: Record<string, string> = opts.omitHeaders
    ? {}
    : {
        'svix-id': msgId,
        'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
        'svix-signature': signature,
      };
  return new Request(url, { method: 'POST', headers, body: opts.sentBody ?? body });
}

const OUTBOUND_URL = 'https://app.example.com/api/webhooks/resend';
const INBOUND_URL = 'https://app.example.com/api/webhooks/resend-inbound';

// An event type the outbound route deliberately skips, so the accept path is
// observable (200 + skipped) without driving the CRM pipeline, which
// route.test.ts covers with real signatures.
const outboundBody = JSON.stringify({
  type: 'domain.updated',
  created_at: '2026-10-01T12:00:00.000Z',
  data: { id: 'dom_1' },
});

const inboundBody = JSON.stringify({
  type: 'email.received',
  created_at: '2026-10-01T12:00:00.000Z',
  data: {
    from: 'coach@example.edu',
    to: ['admin@example.com'],
    subject: 'Re: Quick intro',
    text: 'Sounds good.',
    messageId: '<inbound-1@example.edu>',
    inReplyTo: '<outbound-1@example.com>',
  },
});

const cases: Array<{ name: string; route: Route; url: string; body: string }> = [
  { name: 'outbound /api/webhooks/resend', route: outboundPOST, url: OUTBOUND_URL, body: outboundBody },
  { name: 'inbound /api/webhooks/resend-inbound', route: inboundPOST, url: INBOUND_URL, body: inboundBody },
];

describe('Resend webhook signature contract (real svix SDK)', () => {
  beforeEach(() => {
    upserts = [];
    adminClientCreated.mockClear();
    logServerError.mockClear();
    vi.stubEnv('RESEND_WEBHOOK_SECRET', SIGNING_SECRET);
  });

  it('outbound: accepts a correctly signed payload and reads its type from the verified body', async () => {
    const res = await outboundPOST(signedRequest(OUTBOUND_URL, outboundBody));

    expect(res.status).toBe(200);
    // `skipped` is only reachable after the payload was parsed and its type
    // compared against TRACKED_EVENTS.
    expect(await res.json()).toEqual({ received: true, skipped: true });
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('inbound: accepts a correctly signed reply and stores it', async () => {
    const res = await inboundPOST(signedRequest(INBOUND_URL, inboundBody));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      message_id: '<inbound-1@example.edu>',
      from_address: 'coach@example.edu',
      in_reply_to: '<outbound-1@example.com>',
      received_at: '2026-10-01T12:00:00.000Z',
    });
  });

  describe.each(cases)('$name', ({ route, url, body }) => {
    async function expectRejected(req: Request) {
      const res = await route(req);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Invalid signature' });
      expect(adminClientCreated).not.toHaveBeenCalled();
      expect(upserts).toHaveLength(0);
    }

    it('rejects a payload signed with a different secret', async () => {
      await expectRejected(signedRequest(url, body, { secret: OTHER_SECRET }));
    });

    it('rejects a body altered after signing', async () => {
      const tampered = body.replace('2026-10-01', '2026-10-02');
      expect(tampered).not.toBe(body);
      await expectRejected(signedRequest(url, body, { sentBody: tampered }));
    });

    it('rejects a replay outside the 5-minute timestamp tolerance', async () => {
      const stale = new Date(Date.now() - 60 * 60 * 1000);
      await expectRejected(signedRequest(url, body, { timestamp: stale }));
    });

    it('rejects a timestamp too far in the future', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      await expectRejected(signedRequest(url, body, { timestamp: future }));
    });

    it('rejects a request with no svix headers', async () => {
      await expectRejected(signedRequest(url, body, { omitHeaders: true }));
    });

    it('returns 400 (not 2xx) for a correctly signed body that is not a JSON object', async () => {
      const res = await route(signedRequest(url, 'not json'));
      expect(res.status).toBe(400);
      expect(adminClientCreated).not.toHaveBeenCalled();
      expect(upserts).toHaveLength(0);

      const resNull = await route(signedRequest(url, 'null'));
      expect(resNull.status).toBe(400);
    });
  });
});
