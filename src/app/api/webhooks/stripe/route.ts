import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Stripe webhook receiver.
 *
 * Security: every request is verified with the endpoint's signing secret
 * (STRIPE_WEBHOOK_SECRET) via `constructEventAsync`. Unverified payloads are
 * rejected with 400 — never trust the body otherwise.
 *
 * Runtime: MUST be Node.js with the RAW request body. Signature verification
 * fails if the body is parsed/re-serialized, so we read `await req.text()` and
 * never `req.json()`.
 *
 * Local testing:
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 *   (copy the printed whsec_... into STRIPE_WEBHOOK_SECRET)
 *
 * Persistence: every handled event is mirrored into `public.billing_invoices`
 * by `syncInvoice` below (migration 20260715120000, applied 2026-07-29). Stripe
 * remains the source of truth; the table is a queryable local mirror for admin
 * reporting and dunning. Before this, the six live invoices could be paid in
 * Stripe and nothing in Supabase would ever know.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Statuses from which an invoice never moves backwards.
 *
 * Stripe does NOT guarantee webhook ordering — a retried `invoice.sent` can land
 * after `invoice.paid`, and each event carries the invoice as it looked when the
 * event was CREATED, not as it looks now. A naive "upsert whatever arrived" would
 * therefore let a delayed earlier event flip a paid invoice back to `open`, which
 * is exactly the kind of thing that quietly re-opens settled money in reporting
 * and dunning.
 *
 * Terminal statuses are the ones a real transition can only ever arrive AT, so
 * refusing to overwrite them makes the sync order-independent without needing a
 * per-event sequence number.
 */
const TERMINAL_STATUSES = new Set(['paid', 'void', 'uncollectible']);

/** Stripe sends unix seconds; the columns are timestamptz. */
function toIso(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === 'number' ? new Date(unixSeconds * 1000).toISOString() : null;
}

/**
 * Mirror a Stripe invoice into `public.billing_invoices`.
 *
 * Idempotent on `stripe_invoice_id` (UNIQUE), because Stripe retries any event we
 * don't 2xx and will re-deliver the same invoice many times over its life.
 *
 * Reads `invoice.status` rather than deriving state from `event.type`: the object
 * carries its own status, so one code path serves finalized/sent/paid/failed/
 * void/uncollectible and there is no mapping table to drift.
 *
 * Uses the service-role client deliberately. Both billing tables are RLS
 * deny-by-default with FORCE ROW LEVEL SECURITY and no policies — there is no
 * tenant role that can read or write them, by design. service_role has BYPASSRLS
 * (verified before the migration was applied), and the only two callers are this
 * route, gated by Stripe signature verification, and the admin billing actions
 * behind requireSuperAdmin().
 */
async function syncInvoice(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.id) return;

  const supabase = createAdminClient();

  // Cheap pre-read to enforce the no-regression rule. A race with a concurrent
  // delivery is acceptable here: both writers converge on the same terminal row,
  // and the loser is the one carrying the staler status.
  const { data: existing } = await supabase
    .from('billing_invoices')
    .select('status')
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle();

  const incomingStatus = invoice.status ?? 'draft';
  if (
    existing?.status &&
    TERMINAL_STATUSES.has(existing.status) &&
    !TERMINAL_STATUSES.has(incomingStatus)
  ) {
    // Late-arriving earlier event. Acknowledged upstream (200) so Stripe stops
    // retrying, but it must not touch the row.
    return;
  }

  const transitions = invoice.status_transitions;
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id ?? null);

  const { error } = await supabase.from('billing_invoices').upsert(
    {
      stripe_invoice_id: invoice.id,
      // NOT NULL in the schema. A Stripe invoice always has a customer by the
      // time it reaches any status we handle, but fall back rather than throw:
      // a 500 here would put Stripe into a retry loop over a data shape we
      // cannot fix by retrying.
      stripe_customer_id: customerId ?? 'unknown',
      customer_email: invoice.customer_email ?? null,
      status: incomingStatus,
      currency: invoice.currency ?? 'usd',
      total: invoice.total ?? 0,
      amount_paid: invoice.amount_paid ?? 0,
      tax: invoice.total_taxes?.reduce((sum, t) => sum + (t.amount ?? 0), 0) ?? null,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      invoice_pdf: invoice.invoice_pdf ?? null,
      memo: invoice.description ?? null,
      finalized_at: toIso(transitions?.finalized_at),
      paid_at: toIso(transitions?.paid_at),
    },
    { onConflict: 'stripe_invoice_id' },
  );

  // Surfaced as a 500 by the caller so Stripe retries — a failed write here is
  // usually transient (connection, timeout), and silently swallowing it would
  // lose the transition with no trace.
  if (error) throw new Error(`billing_invoices upsert failed: ${error.message}`);
}

// Events this endpoint acts on. Configure the SAME set on the Stripe endpoint
// so we don't receive noise. Everything else is acknowledged (200) and ignored.
const HANDLED_EVENTS = new Set<Stripe.Event['type']>([
  'invoice.finalized',
  'invoice.sent',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.marked_uncollectible',
  'invoice.voided',
]);

export async function POST(req: Request): Promise<NextResponse> {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signingSecret) {
    await logServerError('[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured', {
      action: 'route.POST',
      route: '/api/webhooks/stripe',
    });
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(rawBody, signature, signingSecret);
  } catch (err) {
    // Bad signature or malformed payload — do NOT process.
    return NextResponse.json(
      { error: `Signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  try {
    await syncInvoice(event.data.object as Stripe.Invoice);
  } catch (err) {
    await logServerError(
      `[Stripe Webhook] Handler error on ${event.type}: ${describeError(err)}`,
      { action: 'route.POST', route: '/api/webhooks/stripe' },
    );
    // 500 → Stripe retries with backoff. Only fail on genuinely retryable errors.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
