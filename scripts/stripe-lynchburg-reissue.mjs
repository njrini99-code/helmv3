// Lynchburg — void the men's+women's invoice and reissue for Women's Golf only.
//
// The 2026-07 batch billed Lynchburg $1,500 for "men's + women's". The men's
// team has since been removed (it was empty), so the correct 2026–27 invoice is
// the WOMEN'S team at the early-adopter rate — the same shape as Guilford's:
//
//     GolfHelm — annual team subscription      $1,000.00
//     Early adopter discount                    -$250.00
//                                       total   $750.00
//
// Stripe cannot edit a finalized invoice, so this VOIDS the open $1,500 one and
// issues a replacement. Voiding leaves an auditable record (the invoice stays
// visible, marked void) rather than deleting anything.
//
// This deliberately does NOT call sendInvoice. Every other school got a personal
// email from admin@helmsportslabs.com with the payment link; the matching draft
// is created separately. Finalizing here is what mints the number and the
// payable URL that email needs.
//
// SAFETY MODEL — same as the other stripe-* scripts here:
//   • Dry run is the DEFAULT. Nothing is written without --commit.
//   • A live key additionally requires --live.
//   • Refuses to run unless the old invoice is exactly the open $1,500 one.
//   • Scoped to ONE customer. It cannot touch another school.
//
// Usage:
//   node --env-file=.env.local scripts/stripe-lynchburg-reissue.mjs --live
//   node --env-file=.env.local scripts/stripe-lynchburg-reissue.mjs --commit --live

import Stripe from 'stripe';

const OLD_INVOICE_ID = 'in_1TyNkPPvzDMlWDMKthO6SwTg';
const CUSTOMER_ID = 'cus_UyKPZyKO2YSoRC';
const OLD_EXPECTED_TOTAL = 150_000; // $1,500.00 — men's + women's
const NEW_EXPECTED_TOTAL = 75_000;  // $750.00 — women's, early adopter

const LINES = [
  { description: "GolfHelm — Women's Golf, annual team subscription (2026–27)", amount: 100_000 },
  { description: 'Early adopter discount', amount: -25_000 },
];

const argv = new Set(process.argv.slice(2));
const COMMIT = argv.has('--commit');
const ALLOW_LIVE = argv.has('--live');
const usd = (c) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) { console.error('✗ STRIPE_SECRET_KEY is empty.'); process.exit(1); }
  const isLive = key.startsWith('sk_live') || key.startsWith('rk_live');
  if (isLive && !ALLOW_LIVE) {
    console.error('✗ That is a LIVE key. Re-run with --live to confirm you mean it.');
    process.exit(1);
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const old = await stripe.invoices.retrieve(OLD_INVOICE_ID);
  if (old.status !== 'open') {
    console.error(`✗ ${OLD_INVOICE_ID} is "${old.status}", expected "open". Refusing.`);
    process.exit(1);
  }
  if (old.total !== OLD_EXPECTED_TOTAL) {
    console.error(`✗ Old invoice totals ${usd(old.total)}, expected ${usd(OLD_EXPECTED_TOTAL)}. Refusing.`);
    process.exit(1);
  }
  if (old.amount_paid !== 0) {
    console.error(`✗ ${usd(old.amount_paid)} already paid on that invoice. Refusing to void — refund first.`);
    process.exit(1);
  }

  console.log('VOID');
  console.log(`  ${old.number}  ${usd(old.total)}  ${old.status}  → ${old.customer_email}`);
  console.log(`  ${old.description}`);
  console.log('\nREISSUE');
  for (const l of LINES) console.log(`  ${l.description.padEnd(58)} ${usd(l.amount).padStart(10)}`);
  console.log(`  ${''.padEnd(58)} ${usd(NEW_EXPECTED_TOTAL).padStart(10)}`);
  console.log(`  Net 30 · to ${old.customer_email} · NOT auto-sent (personal email follows)`);

  if (!COMMIT) {
    console.log(`\n(dry run — ${isLive ? 'LIVE' : 'test'} key, nothing written)`);
    console.log(`Re-run with --commit${isLive ? ' --live' : ''} to apply.\n`);
    return;
  }

  console.log(`\n▸ Committing against the ${isLive ? 'LIVE' : 'TEST'} account…`);

  const voided = await stripe.invoices.voidInvoice(OLD_INVOICE_ID);
  console.log(`  ✓ voided ${voided.number} (${usd(voided.total)}) — still visible in the Dashboard, marked void`);

  const draft = await stripe.invoices.create({
    customer: CUSTOMER_ID,
    collection_method: 'send_invoice',
    days_until_due: 30,
    auto_advance: false,
    automatic_tax: { enabled: false },
    currency: 'usd',
    description: "GolfHelm — 2026–27 annual subscription — Lynchburg Women's Golf",
    custom_fields: [
      { name: 'Program', value: "Women's Golf" },
      { name: 'Season', value: '2026–27' },
    ],
    rendering: { pdf: { page_size: 'letter' } },
    metadata: {
      helm_batch_id: '2026-07-golfhelm-annual',
      helm_school_key: 'lynchburg',
      helm_product: 'golfhelm',
      helm_program: 'womens_golf',
      helm_replaces_invoice: voided.number ?? OLD_INVOICE_ID,
      source: 'scripts/stripe-lynchburg-reissue.mjs',
    },
  });

  for (const line of LINES) {
    await stripe.invoiceItems.create({
      customer: CUSTOMER_ID,
      invoice: draft.id,
      currency: 'usd',
      amount: line.amount,
      description: line.description,
    });
  }

  const invoice = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false });
  if (invoice.total !== NEW_EXPECTED_TOTAL) {
    console.error(`\n✗ Finalized at ${usd(invoice.total)}, expected ${usd(NEW_EXPECTED_TOTAL)}.`);
    console.error(`  VOID ${invoice.id} in the Dashboard before doing anything else.`);
    process.exit(1);
  }
  console.log(`  ✓ finalized ${invoice.number} · ${usd(invoice.total)} · not emailed by Stripe`);

  console.log('\nRESULT');
  console.log(`  number   ${invoice.number}`);
  console.log(`  status   ${invoice.status}`);
  console.log(`  total    ${usd(invoice.total)}`);
  console.log(`  due      ${new Date(invoice.due_date * 1000).toISOString().slice(0, 10)}`);
  console.log(`  to       ${invoice.customer_email}`);
  console.log(`  view     ${invoice.hosted_invoice_url}`);
}

main().catch((e) => {
  console.error('\n✗ FAILED:', e?.message ?? e);
  console.error('  Check https://dashboard.stripe.com/invoices before re-running.');
  process.exit(1);
});
