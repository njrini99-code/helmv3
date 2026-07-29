// GolfHelm — batch invoice builder (2026-07 billing run).
//
// Creates ONE draft invoice per school in Stripe. Mirrors the create → attach
// items flow in src/app/admin/actions/billing.ts (createSchoolInvoice), but
// standalone: that server action's `requireSuperAdmin` gate and `server-only`
// import make it unusable from a plain script.
//
// SAFETY MODEL — read before running:
//   • Dry run is the DEFAULT. Nothing touches Stripe without `--commit`.
//   • A live key additionally requires `--live`, so you can never hit the live
//     account by leaving the wrong key in .env.local.
//   • Invoices are left as DRAFTS. Drafts are editable and deletable, email
//     nobody, and lock nothing. `--finalize` and `--send` exist but are opt-in.
//   • Every write carries an idempotency key derived from BATCH_ID + school,
//     so a re-run repairs a partial batch instead of duplicating it.
//
// Usage:
//   node --env-file=.env.local scripts/stripe-golfhelm-invoices.mjs
//   node --env-file=.env.local scripts/stripe-golfhelm-invoices.mjs --commit --live
//
// Stripe Tax is OFF for this batch: the account has no tax registrations, so
// `automatic_tax` would collect $0 silently anyway, and these are educational
// institutions that are commonly exempt. Turn it on only after registrations
// exist AND you've confirmed the obligation with a tax advisor.

import Stripe from 'stripe';

// ── Batch identity ─────────────────────────────────────────────────────────
// Bump this for a NEW billing run. Keeping it stable is what makes re-running
// this script idempotent rather than duplicative.
const BATCH_ID = '2026-07-golfhelm-annual';

// ── Price book ─────────────────────────────────────────────────────────────
// Cents. One place to change a rate; every line below derives from these.
const PRICE = {
  TEAM_YEAR: 100_000,        // one team, full year
  BOTH_TEAMS_YEAR: 150_000,  // men's + women's, full year
  TEAM_MGMT_ADDON: 20_000,   // additional team, team-management-only suite
  EARLY_ADOPTER: -25_000,    // early-adopter credit
};

// ── The batch ──────────────────────────────────────────────────────────────
// `email` is the CONTACT OF RECORD from the CRM (crm_coaches). The customer is
// the INSTITUTION — swap in the athletics business-office / AP address here
// before finalizing if that's who should receive the invoice.
// Addresses are the published campus addresses; they're cosmetic while tax is
// off, but they render on the PDF.
const SCHOOLS = [
  {
    key: 'guilford',
    name: 'Guilford College',
    email: 'bpotter@guilford.edu',
    address: { line1: '5800 W Friendly Ave', city: 'Greensboro', state: 'NC', postal_code: '27410', country: 'US' },
    lines: [
      { description: 'GolfHelm — annual team subscription (1 team, 2026–27)', amount: PRICE.TEAM_YEAR },
      { description: 'Early adopter discount', amount: PRICE.EARLY_ADOPTER },
    ],
    expected: 75_000,
  },
  {
    key: 'piedmont',
    name: 'Piedmont University',
    email: 'dmeadows@piedmont.edu',
    address: { line1: '1021 Central Ave', city: 'Demorest', state: 'GA', postal_code: '30535', country: 'US' },
    lines: [
      { description: "GolfHelm — annual team subscription (men's team, 2026–27)", amount: PRICE.TEAM_YEAR },
    ],
    expected: 100_000,
  },
  {
    key: 'hampden-sydney',
    name: 'Hampden-Sydney College',
    email: 'dwheeler@hsc.edu',
    // H-SC publishes no street number for the college itself (it holds its own
    // ZIP); PO Box 667 is the stated mailing address.
    address: { line1: 'PO Box 667', city: 'Hampden-Sydney', state: 'VA', postal_code: '23943', country: 'US' },
    lines: [
      { description: 'GolfHelm — annual team subscription (1 team, 2026–27)', amount: PRICE.TEAM_YEAR },
    ],
    expected: 100_000,
  },
  {
    key: 'uncw',
    name: 'University of North Carolina Wilmington',
    email: 'taylorbs@uncw.edu',
    address: { line1: '601 S College Rd', city: 'Wilmington', state: 'NC', postal_code: '28403', country: 'US' },
    lines: [
      { description: "GolfHelm — annual team subscription (men's team, 2026–27)", amount: PRICE.TEAM_YEAR },
    ],
    expected: 100_000,
  },
  {
    key: 'shenandoah',
    name: 'Shenandoah University',
    email: 'ssinghas@su.edu',
    address: { line1: '1460 University Dr', city: 'Winchester', state: 'VA', postal_code: '22601', country: 'US' },
    lines: [
      { description: 'GolfHelm — annual team subscription (1 team, 2026–27)', amount: PRICE.TEAM_YEAR },
      { description: 'Team management suite — additional team (2026–27)', amount: PRICE.TEAM_MGMT_ADDON },
    ],
    expected: 120_000,
  },
  {
    key: 'lynchburg',
    name: 'University of Lynchburg',
    email: 'smith_a@lynchburg.edu',
    address: { line1: '1501 Lakeside Dr', city: 'Lynchburg', state: 'VA', postal_code: '24501', country: 'US' },
    lines: [
      { description: "GolfHelm — annual subscription, men's + women's (2026–27)", amount: PRICE.BOTH_TEAMS_YEAR },
    ],
    expected: 150_000,
  },
];

const EXPECTED_BATCH_TOTAL = 645_000; // $6,450.00

// ── Flags ──────────────────────────────────────────────────────────────────
const argv = new Set(process.argv.slice(2));
const COMMIT = argv.has('--commit');
const ALLOW_LIVE = argv.has('--live');
const FINALIZE = argv.has('--finalize');
const SEND = argv.has('--send');
const DAYS_UNTIL_DUE = 30; // Net 30

const usd = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

// ── Preflight: the arithmetic must reconcile BEFORE we talk to Stripe ───────
function verifyTotals() {
  let batch = 0;
  const problems = [];
  for (const s of SCHOOLS) {
    const sum = s.lines.reduce((t, l) => t + l.amount, 0);
    if (sum !== s.expected) {
      problems.push(`${s.name}: lines sum to ${usd(sum)} but expected ${usd(s.expected)}`);
    }
    batch += sum;
  }
  if (batch !== EXPECTED_BATCH_TOTAL) {
    problems.push(`batch sums to ${usd(batch)} but expected ${usd(EXPECTED_BATCH_TOTAL)}`);
  }
  if (problems.length) {
    console.error('✗ Refusing to run — the price book does not reconcile:');
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  return batch;
}

function printPlan(batchTotal) {
  console.log(`\nGolfHelm billing run · batch ${BATCH_ID}`);
  console.log(`Terms: Net ${DAYS_UNTIL_DUE} · Stripe Tax: OFF · leaving invoices as ${FINALIZE ? 'FINALIZED' : 'DRAFTS'}${SEND ? ' and SENDING' : ''}\n`);
  for (const s of SCHOOLS) {
    console.log(`  ${s.name}`);
    for (const l of s.lines) {
      console.log(`      ${l.amount < 0 ? '−' : ' '} ${usd(Math.abs(l.amount)).padStart(10)}  ${l.description}`);
    }
    console.log(`      ${'='.repeat(10)}  ${usd(s.expected)}  →  ${s.email}\n`);
  }
  console.log(`  BATCH TOTAL: ${usd(batchTotal)} across ${SCHOOLS.length} invoices\n`);
}

async function upsertCustomer(stripe, school) {
  const found = await stripe.customers.search({
    query: `metadata['helm_school_key']:'${school.key}'`,
    limit: 1,
  });
  if (found.data[0]) {
    return stripe.customers.update(found.data[0].id, {
      name: school.name,
      email: school.email,
      address: school.address,
    });
  }
  return stripe.customers.create(
    {
      name: school.name,
      email: school.email,
      address: school.address,
      metadata: { helm_school_key: school.key, helm_product: 'golfhelm' },
    },
    { idempotencyKey: `${BATCH_ID}:customer:${school.key}` },
  );
}

/** Returns an existing invoice for this batch+school, or null. */
async function findExistingInvoice(stripe, customerId) {
  const invoices = await stripe.invoices.list({ customer: customerId, limit: 20 });
  return invoices.data.find((inv) => inv.metadata?.helm_batch_id === BATCH_ID) ?? null;
}

async function main() {
  const batchTotal = verifyTotals();
  printPlan(batchTotal);

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error('✗ STRIPE_SECRET_KEY is empty. Add a restricted key (rk_…) to .env.local,');
    console.error('  or use the Stripe MCP instead. Nothing was created.');
    process.exit(1);
  }
  const isLive = key.startsWith('sk_live') || key.startsWith('rk_live');
  if (isLive && !ALLOW_LIVE) {
    console.error('✗ That is a LIVE key. Re-run with --live to confirm you mean it.');
    process.exit(1);
  }
  if (!COMMIT) {
    console.log(`(dry run — ${isLive ? 'LIVE' : 'test'} key detected, nothing written)`);
    console.log('Re-run with --commit' + (isLive ? ' --live' : '') + ' to create these invoices.\n');
    return;
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  console.log(`▸ Committing against the ${isLive ? 'LIVE' : 'TEST'} account…\n`);

  const results = [];
  for (const school of SCHOOLS) {
    process.stdout.write(`  ${school.name}… `);

    const customer = await upsertCustomer(stripe, school);

    const existing = await findExistingInvoice(stripe, customer.id);
    if (existing) {
      console.log(`already exists (${existing.id}, ${existing.status}) — skipped`);
      results.push({ school: school.name, invoiceId: existing.id, status: existing.status, total: existing.total, skipped: true });
      continue;
    }

    const draft = await stripe.invoices.create(
      {
        customer: customer.id,
        collection_method: 'send_invoice',
        days_until_due: DAYS_UNTIL_DUE,
        auto_advance: false,
        automatic_tax: { enabled: false },
        currency: 'usd',
        description: 'GolfHelm — 2026–27 annual subscription',
        metadata: {
          helm_batch_id: BATCH_ID,
          helm_school_key: school.key,
          helm_product: 'golfhelm',
          source: 'scripts/stripe-golfhelm-invoices.mjs',
        },
      },
      { idempotencyKey: `${BATCH_ID}:invoice:${school.key}` },
    );

    for (const [i, line] of school.lines.entries()) {
      await stripe.invoiceItems.create(
        {
          customer: customer.id,
          invoice: draft.id,
          currency: 'usd',
          amount: line.amount,
          description: line.description,
        },
        { idempotencyKey: `${BATCH_ID}:item:${school.key}:${i}` },
      );
    }

    let invoice = await stripe.invoices.retrieve(draft.id);
    if (FINALIZE || SEND) {
      invoice = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false });
      if (SEND) invoice = await stripe.invoices.sendInvoice(invoice.id);
    }

    if (invoice.total !== school.expected) {
      console.log('MISMATCH');
      console.error(`\n✗ ${school.name}: Stripe totalled ${usd(invoice.total)}, expected ${usd(school.expected)}.`);
      console.error(`  Draft ${invoice.id} was created — review or delete it before re-running.`);
      process.exit(1);
    }

    console.log(`${invoice.status} · ${usd(invoice.total)} · ${invoice.id}`);
    results.push({ school: school.name, invoiceId: invoice.id, status: invoice.status, total: invoice.total });
  }

  const created = results.filter((r) => !r.skipped);
  const sum = results.reduce((t, r) => t + r.total, 0);
  console.log(`\n✓ ${created.length} created, ${results.length - created.length} already existed · ${usd(sum)} total`);
  if (!FINALIZE && !SEND) {
    console.log('  All left as DRAFTS — editable, deletable, nobody emailed.');
    console.log('  Review at https://dashboard.stripe.com/invoices then send from the Dashboard.');
  }
}

main().catch((err) => {
  console.error('\n✗ Failed:', err?.message ?? err);
  process.exit(1);
});
