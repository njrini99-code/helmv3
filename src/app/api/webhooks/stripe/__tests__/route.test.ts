// =============================================================================
// src/app/api/webhooks/stripe/__tests__/route.test.ts
//
// This route had FOUR TODO(persistence) markers and no table to write to, so a
// live invoice could be paid in Stripe and nothing in Supabase would ever know.
// The table now exists (migration 20260715120000, applied 2026-07-29) and these
// tests cover the two things that are easy to get wrong in a webhook receiver:
//
//   1. ORDERING. Stripe does not guarantee delivery order, and every event
//      carries the invoice as it looked when the event was CREATED. A retried
//      `invoice.sent` landing after `invoice.paid` must not flip a settled
//      invoice back to `open` — that silently re-opens paid money in reporting
//      and dunning.
//
//   2. IDEMPOTENCY / RETRY SEMANTICS. Stripe re-delivers anything we don't 2xx,
//      so the write keys on the UNIQUE stripe_invoice_id, and a genuinely failed
//      write must return 500 (retry) rather than swallow the transition.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mock state the fake client reads/records -------------------------------
let existingRow: { status: string } | null = null;
let upsertError: { message: string } | null = null;
let upserts: Array<Record<string, unknown>> = [];
let constructEventResult: { ok: true; event: unknown } | { ok: false; message: string };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }),
      }),
      upsert: async (payload: Record<string, unknown>) => {
        upserts.push(payload);
        return { error: upsertError };
      },
    }),
  }),
}));

vi.mock('@/lib/stripe/server', () => ({
  getStripe: () => ({
    webhooks: {
      constructEventAsync: async () => {
        if (!constructEventResult.ok) throw new Error(constructEventResult.message);
        return constructEventResult.event;
      },
    },
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));

import { POST } from '../route';

/** Minimal Stripe invoice shaped like the fields syncInvoice actually reads. */
function invoice(over: Record<string, unknown> = {}) {
  return {
    id: 'in_test_123',
    customer: 'cus_test_123',
    customer_email: 'billing@example.edu',
    status: 'paid',
    currency: 'usd',
    total: 150000,
    amount_paid: 150000,
    total_taxes: [{ amount: 900 }, { amount: 100 }],
    hosted_invoice_url: 'https://invoice.stripe.com/x',
    invoice_pdf: 'https://invoice.stripe.com/x.pdf',
    description: 'GolfHelm annual',
    status_transitions: { finalized_at: 1_700_000_000, paid_at: 1_700_003_600 },
    ...over,
  };
}

function post(type: string, obj: Record<string, unknown>) {
  constructEventResult = { ok: true, event: { id: 'evt_1', type, data: { object: obj } } };
  return POST(
    new Request('https://app.example.com/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=sig' },
      body: '{}',
    }),
  );
}

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    existingRow = null;
    upsertError = null;
    upserts = [];
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
  });

  it('mirrors a paid invoice, mapping money and timestamps', async () => {
    const res = await post('invoice.paid', invoice());

    expect(res.status).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      stripe_invoice_id: 'in_test_123',
      stripe_customer_id: 'cus_test_123',
      status: 'paid',
      total: 150000,
      amount_paid: 150000,
      tax: 1000, // summed across total_taxes, not the first entry
    });
    // Unix seconds -> ISO, because the columns are timestamptz.
    expect(upserts[0]!.paid_at).toBe(new Date(1_700_003_600 * 1000).toISOString());
    expect(upserts[0]!.finalized_at).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  describe('out-of-order delivery', () => {
    it('does NOT regress a paid invoice when a late non-terminal event arrives', async () => {
      existingRow = { status: 'paid' };

      const res = await post('invoice.sent', invoice({ status: 'open', amount_paid: 0 }));

      // Acknowledged so Stripe stops retrying...
      expect(res.status).toBe(200);
      // ...but the settled row is untouched.
      expect(upserts).toHaveLength(0);
    });

    it('still allows a terminal-to-terminal correction (paid -> void)', async () => {
      existingRow = { status: 'paid' };

      await post('invoice.voided', invoice({ status: 'void' }));

      expect(upserts).toHaveLength(1);
      expect(upserts[0]!.status).toBe('void');
    });

    it('allows normal forward progress (open -> paid)', async () => {
      existingRow = { status: 'open' };

      await post('invoice.paid', invoice({ status: 'paid' }));

      expect(upserts[0]!.status).toBe('paid');
    });

    it('treats uncollectible as terminal too', async () => {
      existingRow = { status: 'uncollectible' };

      await post('invoice.finalized', invoice({ status: 'open' }));

      expect(upserts).toHaveLength(0);
    });
  });

  it('returns 500 on a failed write so Stripe retries', async () => {
    upsertError = { message: 'connection reset' };

    const res = await post('invoice.paid', invoice());

    expect(res.status).toBe(500);
  });

  it('rejects a bad signature with 400 and writes nothing', async () => {
    constructEventResult = { ok: false, message: 'no signatures found' };

    const res = await POST(
      new Request('https://app.example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'bogus' },
        body: '{}',
      }),
    );

    expect(res.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it('ignores unhandled event types without writing', async () => {
    const res = await post('customer.created', { id: 'cus_x' });

    expect(res.status).toBe(200);
    expect(upserts).toHaveLength(0);
  });

  it('400s when the signature header is missing entirely', async () => {
    const res = await POST(
      new Request('https://app.example.com/api/webhooks/stripe', { method: 'POST', body: '{}' }),
    );

    expect(res.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });
});
