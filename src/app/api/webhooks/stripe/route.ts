import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { logServerError } from '@/lib/server-error-logger';

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
 * TODO(persistence): once the billing_invoices table + RLS land (via
 * db-migration-reviewer), write invoice status transitions here with the
 * service-role admin client (createAdminClient from '@/lib/supabase/admin').
 * Handlers are intentionally idempotent-friendly: key on `event.id`.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const invoice = event.data.object as Stripe.Invoice;
    switch (event.type) {
      case 'invoice.paid':
        // TODO(persistence): mark invoice paid in Supabase.
        break;
      case 'invoice.payment_failed':
        // TODO(persistence): flag failure; surface to admin / dunning.
        break;
      case 'invoice.finalized':
      case 'invoice.sent':
      case 'invoice.marked_uncollectible':
      case 'invoice.voided':
        // TODO(persistence): sync status transition.
        break;
      default:
        break;
    }
    // Referenced so the scaffold typechecks under noUnusedLocals; remove once
    // the handlers above use it.
    void invoice.id;
  } catch (err) {
    await logServerError(
      `[Stripe Webhook] Handler error on ${event.type}: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'route.POST', route: '/api/webhooks/stripe' },
    );
    // 500 → Stripe retries with backoff. Only fail on genuinely retryable errors.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
