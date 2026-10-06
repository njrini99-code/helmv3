// =============================================================================
// src/app/api/webhooks/stripe/__tests__/signature-verification.test.ts
//
// Contract test against the REAL stripe SDK (no network, test-mode key only).
// route.test.ts mocks `constructEventAsync`, so it cannot see an SDK major that
// changes how signatures or timestamp tolerance are verified. stripe@23 did
// exactly that (verifyHeader/verifyHeaderAsync now default to DEFAULT_TOLERANCE;
// tolerance 0 now skips the check), so this file signs a payload with the SDK's
// own test-header helper and drives the route end to end.
//
// It also pins that the client sends the API version the installed SDK is
// generated against — the `satisfies Stripe.LatestApiVersion` in
// src/lib/stripe/server.ts is a compile-time guard; this is the runtime one.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

let upserts: Array<Record<string, unknown>> = [];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      upsert: async (payload: Record<string, unknown>) => {
        upserts.push(payload);
        return { error: null };
      },
    }),
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));

// A syntactically valid TEST-mode key. Nothing in this file makes a request.
const TEST_KEY = 'sk_test_contract_not_a_real_key';
const SIGNING_SECRET = 'whsec_contract_test_secret';

const { POST } = await import('../route');
const { getStripe } = await import('@/lib/stripe/server');

const sdk = new Stripe(TEST_KEY);

function eventBody(): string {
  return JSON.stringify({
    id: 'evt_contract_1',
    object: 'event',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_contract_1',
        object: 'invoice',
        customer: 'cus_contract_1',
        status: 'paid',
        currency: 'usd',
        total: 1000,
        amount_paid: 1000,
        status_transitions: { finalized_at: 1_700_000_000, paid_at: 1_700_000_100 },
      },
    },
  });
}

async function send(body: string, header: string) {
  return POST(
    new Request('https://app.example.com/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': header },
      body,
    }),
  );
}

describe('Stripe webhook signature contract (real SDK)', () => {
  beforeEach(() => {
    upserts = [];
    vi.stubEnv('STRIPE_SECRET_KEY', TEST_KEY);
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', SIGNING_SECRET);
  });

  it('client pins the API version the installed SDK is generated against', () => {
    expect(getStripe().getApiField('version')).toBe(Stripe.API_VERSION);
  });

  it('accepts a correctly signed payload and mirrors the invoice', async () => {
    const body = eventBody();
    const header = await sdk.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: SIGNING_SECRET,
    });

    const res = await send(body, header);

    expect(res.status).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ stripe_invoice_id: 'in_contract_1', status: 'paid' });
  });

  it('rejects a payload signed with a different secret', async () => {
    const body = eventBody();
    const header = await sdk.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: 'whsec_someone_else',
    });

    const res = await send(body, header);

    expect(res.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it('rejects a body altered after signing', async () => {
    const body = eventBody();
    const header = await sdk.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: SIGNING_SECRET,
    });

    const res = await send(body.replace('"total":1000', '"total":1'), header);

    expect(res.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it('rejects a replay outside the default 300s tolerance', async () => {
    const body = eventBody();
    const header = await sdk.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: SIGNING_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });

    const res = await send(body, header);

    expect(res.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });
});
