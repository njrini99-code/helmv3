'use server';

import { z } from 'zod';
import type Stripe from 'stripe';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { getStripe } from '@/lib/stripe/server';
import { logSecurityEvent } from '@/lib/admin-logger';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * One-off B2B invoicing (Stripe Invoicing + Stripe Tax).
 *
 * Flow: a super-admin bills a school / athletic program. We upsert a Stripe
 * Customer (matched by email), attach line items to a draft invoice with
 * `automatic_tax` enabled, finalize it, and (optionally) let Stripe email the
 * hosted invoice. The customer pays via Stripe's Hosted Invoice Page — no
 * card form ships in our app.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️  STRIPE TAX PREREQUISITE — read before trusting `autoTax: true`
 * `automatic_tax` collects $0 (with NO error) in any jurisdiction where you
 * do NOT have an ACTIVE registration. Before relying on it:
 *   1. Set your account head-office address in the Dashboard.
 *   2. Add a registration for every state/country you must collect in
 *      (Dashboard → Tax, or the Tax Registrations API). Consult a tax advisor
 *      on WHERE you're obligated — that's not a call to make in code.
 *   3. Set a preset product tax code + default tax behavior in Tax settings
 *      (used as the fallback for line items without their own code), or pass a
 *      canonical `taxCode` (txcd_...) per call — never invent one.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Persistence NOTE: this scaffold does NOT yet store the school ↔
 * stripe_customer_id mapping or invoice rows in Supabase. That needs a
 * migration (new column or a `billing_invoices` table + RLS) reviewed via the
 * db-migration-reviewer against the shared production DB before it's applied.
 * The Stripe webhook route is where paid/failed status should be persisted.
 */

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postal_code: z.string().min(1),
  country: z.string().length(2), // ISO 3166-1 alpha-2, e.g. "US"
});

const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  /** Price per unit in the smallest currency unit (cents). */
  unitAmountCents: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
});

const createInvoiceSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    email: z.email(),
    address: addressSchema, // required so Stripe Tax can resolve jurisdiction
  }),
  lineItems: z.array(lineItemSchema).min(1),
  currency: z.string().length(3).default('usd'),
  daysUntilDue: z.number().int().min(0).max(365).default(30),
  /** Enable Stripe Tax. Read the prerequisite warning above first. */
  autoTax: z.boolean().default(true),
  /** Canonical Stripe product tax code (txcd_...). Optional — falls back to the
   *  account preset. Never fabricate one; source it from the Tax Codes API. */
  taxCode: z.string().startsWith('txcd_').optional(),
  taxBehavior: z.enum(['exclusive', 'inclusive', 'unspecified']).default('exclusive'),
  /** false → leave the invoice finalized but unsent (grab the URL yourself). */
  send: z.boolean().default(true),
  /** Free-form label surfaced on the invoice + in webhooks for reconciliation. */
  memo: z.string().max(500).optional(),
});

export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;

export interface CreateInvoiceResult {
  invoiceId: string;
  status: Stripe.Invoice['status'];
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  total: number;
  tax: number | null;
  customerId: string;
}

/** Find an existing customer by email, or create one with a tax-resolvable address. */
async function upsertCustomer(
  stripe: Stripe,
  input: z.infer<typeof createInvoiceSchema>['customer'],
): Promise<string> {
  const existing = await stripe.customers.list({ email: input.email, limit: 1 });
  if (existing.data[0]) {
    const customer = await stripe.customers.update(existing.data[0].id, {
      name: input.name,
      address: input.address,
    });
    return customer.id;
  }
  const created = await stripe.customers.create({
    name: input.name,
    email: input.email,
    address: input.address,
  });
  return created.id;
}

/**
 * Create, finalize, and (optionally) send a one-off invoice to a school.
 * Super-admin only — gated on the first line.
 */
export async function createSchoolInvoice(
  raw: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  const admin = await requireSuperAdmin();
  const input = createInvoiceSchema.parse(raw);

  const stripe = getStripe();
  const customerId = await upsertCustomer(stripe, input.customer);

  // 1. Draft invoice first, so line items attach ONLY to this invoice
  //    (avoids sweeping up unrelated pending invoice items for the customer).
  const draft = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: input.daysUntilDue,
    auto_advance: false,
    automatic_tax: { enabled: input.autoTax },
    currency: input.currency,
    ...(input.memo ? { description: input.memo } : {}),
    metadata: { created_by_admin: admin.userId, source: 'admin.createSchoolInvoice' },
  });

  // 2. Attach line items to the draft. tax_behavior + tax_code on each item let
  //    Stripe Tax rate the line; without a code it falls back to the account
  //    preset tax code. `amount` is the line total (unit × quantity).
  for (const item of input.lineItems) {
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: draft.id,
      currency: input.currency,
      amount: item.unitAmountCents * item.quantity,
      quantity: item.quantity,
      description: item.description,
      tax_behavior: input.taxBehavior,
      ...(input.taxCode ? { tax_code: input.taxCode } : {}),
    });
  }

  // 3. Finalize (computes tax + totals, generates the PDF + hosted page).
  const finalized = await stripe.invoices.finalizeInvoice(draft.id, {
    auto_advance: false,
  });

  // 4. Optionally have Stripe email the hosted invoice to the customer.
  const invoice = input.send
    ? await stripe.invoices.sendInvoice(finalized.id)
    : finalized;

  await logSecurityEvent(
    `Admin created invoice ${invoice.id} for ${input.customer.email}`,
    'info',
    { total: invoice.total, sent: input.send, customerId },
    admin.userId,
  );

  return {
    invoiceId: invoice.id,
    status: invoice.status,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
    total: invoice.total,
    tax: invoice.total_taxes?.reduce((sum, t) => sum + t.amount, 0) ?? null,
    customerId,
  };
}

/** Void a finalized-but-unpaid invoice. Super-admin only. */
export async function voidInvoice(invoiceId: string): Promise<{ status: Stripe.Invoice['status'] }> {
  const admin = await requireSuperAdmin();
  const supabase = createAdminClient();

  // Validate that the invoiceId exists in our local billing_invoices table.
  // This prevents IDOR: an attacker cannot void arbitrary Stripe invoices they
  // don't own. We record all invoices we create via the webhook; if it's not in
  // the table, we did not create it.
  const { data: existing, error } = await supabase
    .from('billing_invoices')
    .select('id, stripe_invoice_id')
    .eq('stripe_invoice_id', invoiceId)
    .maybeSingle();

  if (error || !existing) {
    throw new Error(`Invoice ${invoiceId} not found in billing records`);
  }

  const stripe = getStripe();
  const invoice = await stripe.invoices.voidInvoice(invoiceId);
  await logSecurityEvent(
    `Admin voided invoice ${invoiceId}`,
    'warning',
    { organization_id: existing.id },
    admin.userId,
  );
  return { status: invoice.status };
}
