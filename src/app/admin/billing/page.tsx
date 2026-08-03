import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { isStripeConfigured } from '@/lib/stripe/server';
import { CreateInvoiceForm } from '@/components/admin/billing/CreateInvoiceForm';

export const dynamic = 'force-dynamic';

/**
 * Admin billing — create + send one-off B2B invoices to schools/programs.
 * Super-admin only (layout gates the tree; this re-asserts per convention).
 *
 * #1255 — this page used to render the full invoice form unconditionally, with
 * copy that actively asserted capability ("Stripe Tax is applied automatically
 * …"). Production has no Stripe environment variables at all, and `getStripe()`
 * is lazily initialised, so the missing key was only discovered on submit —
 * after the admin had typed a name, billing email, full postal address and
 * every line item. Disclose it before the work instead of after.
 */
export default async function AdminBillingPage() {
  await requireSuperAdmin();

  const stripeReady = isStripeConfigured();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <p className="text-eyebrow text-warm-500">Billing</p>
        <h1 className="text-h1 text-warm-900">Create invoice</h1>
        <p className="mt-2 text-body-sm text-warm-500">
          Bills a school or program via Stripe Invoicing. The customer pays on
          Stripe&rsquo;s hosted invoice page.
        </p>
      </header>

      {stripeReady ? (
        <CreateInvoiceForm />
      ) : (
        <div
          role="status"
          className="rounded-2xl border border-amber-300/70 bg-amber-50 p-6"
        >
          <h2 className="text-h3 text-warm-900">Invoicing is not available yet</h2>
          <p className="mt-2 text-body-sm text-warm-700">
            This environment has no Stripe API key configured, so an invoice
            cannot be created here. The form is hidden rather than shown and
            then failing on submit.
          </p>
          <p className="mt-3 text-body-sm text-warm-700">
            To enable it, set <code className="font-mono">STRIPE_SECRET_KEY</code>{' '}
            (a restricted <code className="font-mono">rk_…</code> key scoped to
            Customers, Invoices and Tax) and{' '}
            <code className="font-mono">STRIPE_WEBHOOK_SECRET</code> for this
            environment, then reload.
          </p>
          <p className="mt-3 text-caption text-warm-500">
            Note for when it is enabled: Stripe Tax only calculates tax where you
            hold an active tax registration. With none added it collects $0, so
            the invoice total is just the line-item total.
          </p>
        </div>
      )}
    </div>
  );
}
