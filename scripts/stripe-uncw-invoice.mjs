// UNCW — finish and send the 2026–27 Men's Golf invoice.
//
// The 2026-07 batch (scripts/stripe-golfhelm-invoices.mjs) left UNCW as a
// DRAFT addressed to the coach contact of record. It was never finalized, so
// nobody has been emailed and the draft is still freely editable. That script
// cannot finish the job: its `findExistingInvoice` SKIPS anything that already
// exists, so --finalize/--send only ever apply to newly created invoices.
//
// This does the remaining three things, to the EXISTING draft rather than a
// replacement, so the invoice keeps its audit trail:
//   1. point the customer at Accounts Payable (owner instruction, 2026-08-04)
//   2. name the program — Men's Golf — on the line item, the description and a
//      custom field, so AP can route it without asking
//   3. finalize and send
//
// SAFETY MODEL — same shape as the batch script:
//   • Dry run is the DEFAULT. Nothing is written without --commit.
//   • A live key additionally requires --live.
//   • --send is opt-in on top of --commit. Without it the invoice is finalized
//     but not emailed, which is still recoverable (void + reissue).
//   • Scoped to ONE invoice id. It cannot touch another school.
//
// Usage:
//   node --env-file=.env.local scripts/stripe-uncw-invoice.mjs
//   node --env-file=.env.local scripts/stripe-uncw-invoice.mjs --commit --live --send

import Stripe from 'stripe';

const INVOICE_ID = 'in_1TyNkLPvzDMlWDMK5AdUwhZV';
const CUSTOMER_ID = 'cus_UyKPLYZlinTPWt';
const AP_EMAIL = 'accountspayable@uncw.edu';
const COACH_EMAIL = 'taylorbs@uncw.edu';
const PRIOR_CONTACT = 'brinsons@uncw.edu';
const EXPECTED_TOTAL = 100_000; // $1,000.00 — matches Piedmont/Hampden-Sydney

const LINE_DESCRIPTION = "GolfHelm — Men's Golf, annual team subscription (2026–27)";
const INVOICE_DESCRIPTION = "GolfHelm — 2026–27 annual subscription — UNCW Men's Golf";

const argv = new Set(process.argv.slice(2));
const COMMIT = argv.has('--commit');
const ALLOW_LIVE = argv.has('--live');
const SEND = argv.has('--send');

const usd = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error('✗ STRIPE_SECRET_KEY is empty. Nothing was done.');
    process.exit(1);
  }
  const isLive = key.startsWith('sk_live') || key.startsWith('rk_live');
  if (isLive && !ALLOW_LIVE) {
    console.error('✗ That is a LIVE key. Re-run with --live to confirm you mean it.');
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const before = await stripe.invoices.retrieve(INVOICE_ID, { expand: ['lines'] });
  if (before.status !== 'draft') {
    console.error(`✗ ${INVOICE_ID} is "${before.status}", not a draft. Refusing to touch a`);
    console.error('  finalized invoice — void and reissue from the Dashboard instead.');
    process.exit(1);
  }
  if (before.total !== EXPECTED_TOTAL) {
    console.error(`✗ Draft totals ${usd(before.total)}, expected ${usd(EXPECTED_TOTAL)}. Refusing.`);
    process.exit(1);
  }

  const item = before.lines.data[0];
  console.log('BEFORE');
  console.log(`  invoice     ${before.id}  (${before.status})`);
  console.log(`  customer    ${before.customer_name}`);
  console.log(`  email       ${before.customer_email}`);
  console.log(`  description ${before.description}`);
  console.log(`  line        ${item.description}  ${usd(item.amount)}`);
  console.log(`  total       ${usd(before.total)}`);

  console.log('\nAFTER (planned)');
  console.log(`  email       ${AP_EMAIL}`);
  console.log(`  description ${INVOICE_DESCRIPTION}`);
  console.log(`  line        ${LINE_DESCRIPTION}  ${usd(EXPECTED_TOTAL)}`);
  console.log('  custom      Program: Men\'s Golf · Season: 2026–27');
  console.log(`  terms       Net 30`);
  console.log(`  then        finalize${SEND ? ' + SEND (emails ' + AP_EMAIL + ')' : ' only (no email)'}`);

  if (!COMMIT) {
    console.log(`\n(dry run — ${isLive ? 'LIVE' : 'test'} key, nothing written)`);
    console.log(`Re-run with --commit${isLive ? ' --live' : ''}${SEND ? ' --send' : ''} to apply.\n`);
    return;
  }

  console.log(`\n▸ Committing against the ${isLive ? 'LIVE' : 'TEST'} account…`);

  // 1. Accounts Payable becomes the billing contact. The coach and the prior
  //    contact are preserved in metadata rather than discarded.
  await stripe.customers.update(CUSTOMER_ID, {
    email: AP_EMAIL,
    metadata: {
      helm_product: 'golfhelm',
      helm_school_key: 'uncw',
      helm_program: 'mens_golf',
      helm_coach_contact: COACH_EMAIL,
      helm_prior_billing_contact: PRIOR_CONTACT,
    },
  });
  console.log(`  ✓ billing contact → ${AP_EMAIL}`);

  // 2. Name the program everywhere AP will look.
  await stripe.invoiceItems.update(item.parent.invoice_item_details.invoice_item, {
    description: LINE_DESCRIPTION,
  });
  await stripe.invoices.update(INVOICE_ID, {
    description: INVOICE_DESCRIPTION,
    days_until_due: 30,
    custom_fields: [
      { name: 'Program', value: "Men's Golf" },
      { name: 'Season', value: '2026–27' },
    ],
    rendering: { pdf: { page_size: 'letter' } },
  });
  console.log('  ✓ line item, description and custom fields name Men\'s Golf');

  // 3. Finalize, then send.
  let invoice = await stripe.invoices.finalizeInvoice(INVOICE_ID, { auto_advance: false });
  console.log(`  ✓ finalized · ${invoice.number} · ${usd(invoice.total)}`);

  if (invoice.total !== EXPECTED_TOTAL) {
    console.error(`\n✗ Finalized at ${usd(invoice.total)}, expected ${usd(EXPECTED_TOTAL)}.`);
    console.error('  VOID this invoice in the Dashboard before doing anything else.');
    process.exit(1);
  }

  if (SEND) {
    invoice = await stripe.invoices.sendInvoice(invoice.id);
    console.log(`  ✓ SENT to ${invoice.customer_email}`);
  } else {
    console.log('  · not sent (--send not passed)');
  }

  console.log('\nRESULT');
  console.log(`  number   ${invoice.number}`);
  console.log(`  status   ${invoice.status}`);
  console.log(`  total    ${usd(invoice.total)}`);
  console.log(`  due      ${new Date(invoice.due_date * 1000).toISOString().slice(0, 10)}`);
  console.log(`  to       ${invoice.customer_email}`);
  console.log(`  view     ${invoice.hosted_invoice_url}`);
  console.log(`  pdf      ${invoice.invoice_pdf}`);
}

main().catch((e) => {
  console.error('\n✗ FAILED:', e?.message ?? e);
  console.error('  Check https://dashboard.stripe.com/invoices before re-running.');
  process.exit(1);
});
