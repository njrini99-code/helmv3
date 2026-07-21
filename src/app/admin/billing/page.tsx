import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { CreateInvoiceForm } from '@/components/admin/billing/CreateInvoiceForm';

export const dynamic = 'force-dynamic';

/**
 * Admin billing — create + send one-off B2B invoices to schools/programs.
 * Super-admin only (layout gates the tree; this re-asserts per convention).
 */
export default async function AdminBillingPage() {
  await requireSuperAdmin();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <p className="text-eyebrow text-warm-500">Billing</p>
        <h1 className="text-h1 text-warm-900">Create invoice</h1>
        <p className="mt-2 text-body-sm text-warm-500">
          Bills a school or program via Stripe Invoicing. The customer pays on
          Stripe&rsquo;s hosted invoice page. Stripe Tax is applied automatically
          where you hold an active registration.
        </p>
      </header>
      <CreateInvoiceForm />
    </div>
  );
}
