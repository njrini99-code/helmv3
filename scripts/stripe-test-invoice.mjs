// Local test-mode driver for the Stripe Invoicing + Tax scaffold.
//
// Runs the same create -> finalize -> send flow as
// src/app/admin/actions/billing.ts (createSchoolInvoice), but standalone so
// you can exercise Stripe end-to-end without the app or an admin session. It
// news up the Stripe SDK directly (the server action's requireSuperAdmin gate
// and the `server-only` import make it unusable from a plain script).
//
// Usage:
//   node --env-file=.env.local scripts/stripe-test-invoice.mjs
//   npm run stripe:test-invoice
//
// Requires STRIPE_SECRET_KEY (rk_test_/sk_test_) in .env.local. In another
// terminal run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
// and start `npm run dev` to watch the webhook fire.

import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error('✗ STRIPE_SECRET_KEY is missing. Add it to .env.local first.');
  process.exit(1);
}
if (key.startsWith('sk_live') || key.startsWith('rk_live')) {
  console.error('✗ Refusing to run against a LIVE key. Use a test key (…_test_…).');
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

// Toggle tax on the invoice. Note: even enabled, Stripe Tax collects $0 until
// you have an active registration in the customer's jurisdiction.
const AUTO_TAX = !process.argv.includes('--no-tax');

async function main() {
  console.log('→ Creating test customer…');
  const customer = await stripe.customers.create({
    name: 'Test University Athletics',
    email: 'billing@test-university.example.com',
    address: {
      line1: '1 Stadium Way',
      city: 'Austin',
      state: 'TX',
      postal_code: '78712',
      country: 'US',
    },
  });

  console.log('→ Creating draft invoice…');
  const draft = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 30,
    auto_advance: false,
    automatic_tax: { enabled: AUTO_TAX },
    currency: 'usd',
    description: 'BaseballHelm — team platform access (test invoice)',
    metadata: { source: 'scripts/stripe-test-invoice.mjs' },
  });

  console.log('→ Adding line items…');
  await stripe.invoiceItems.create({
    customer: customer.id,
    invoice: draft.id,
    currency: 'usd',
    amount: 120000, // $1,200.00
    quantity: 1,
    description: 'Annual team subscription — 2026 season',
    tax_behavior: 'exclusive',
  });

  console.log('→ Finalizing…');
  const finalized = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false });

  console.log('→ Sending (marks it open)…');
  const invoice = await stripe.invoices.sendInvoice(finalized.id);

  const tax = (invoice.total_taxes ?? []).reduce((s, t) => s + t.amount, 0);
  console.log('\n✓ Invoice created');
  console.log(`  id:        ${invoice.id}`);
  console.log(`  status:    ${invoice.status}`);
  console.log(`  total:     $${(invoice.total / 100).toFixed(2)}  (tax $${(tax / 100).toFixed(2)})`);
  console.log(`  auto_tax:  ${AUTO_TAX}${AUTO_TAX && tax === 0 ? '  ⚠️  $0 tax — no active registration for this jurisdiction yet' : ''}`);
  console.log(`  hosted:    ${invoice.hosted_invoice_url ?? '(none)'}`);
  console.log(`  pdf:       ${invoice.invoice_pdf ?? '(none)'}`);
  console.log('\nOpen the hosted URL to pay with test card 4242 4242 4242 4242 (any future exp / any CVC).');
}

main().catch((err) => {
  console.error('\n✗ Failed:', err?.message ?? err);
  process.exit(1);
});
