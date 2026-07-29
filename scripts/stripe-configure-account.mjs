// Helm Sports Labs / GolfHelm — Stripe account configuration.
//
// Brings the live account up from "functional but bare" to fully configured:
// support contact, brand identity on the customer-facing surfaces, a real
// product catalogue, the early-adopter coupon, the webhook endpoint the app
// already has a route for, and a customer billing portal.
//
// SAFETY MODEL (same as stripe-golfhelm-invoices.mjs):
//   • Dry run is the DEFAULT. Nothing is written without `--commit`.
//   • A live key additionally requires `--live`.
//   • Every step is IDEMPOTENT — re-running reconciles instead of duplicating.
//   • Steps are independent: a permission denial on one is reported and skipped,
//     it does not abort the rest.
//
// Usage:
//   node --env-file=.env.local scripts/stripe-configure-account.mjs
//   node --env-file=.env.local scripts/stripe-configure-account.mjs --commit --live
//
// NOT done here, deliberately:
//   • Tax registrations — where you're obliged to collect is a tax-advisor
//     call, not a code call. `automatic_tax` stays off until those exist.
//   • Payment methods (ACH/card toggles) — Dashboard-only, and which methods
//     you accept is a pricing decision (card fees on a $1,500 invoice ≈ $45).

import fs from 'node:fs';
import path from 'node:path';
import Stripe from 'stripe';

const ACCOUNT_ID = 'acct_1TtdevPvzDMlWDMK';
const SITE = 'https://helmsportslabs.com';
const SUPPORT_EMAIL = 'admin@helmsportslabs.com';

// Helm green, straight off the design tokens (--c-primary-600 = 22 163 74).
// Stripe paints `primary_color` on the Pay button + links of the hosted
// invoice page; `secondary_color` on accents.
const BRAND_PRIMARY = '#16A34A';
const BRAND_SECONDARY = '#248342';
const LOGO_PATH = 'public/Helm-Logo-New-Main.png';
const ICON_PATH = 'public/icons/icon-192.png';

// The catalogue. `lookup_key` on the price is what makes this idempotent and
// what invoice code should reference instead of hardcoding cents.
const CATALOG = [
  {
    lookup_key: 'golfhelm_team_annual',
    product: 'GolfHelm — Team (annual)',
    description: 'Full GolfHelm platform for one golf program, billed annually.',
    unit_amount: 100_000,
  },
  {
    lookup_key: 'golfhelm_both_teams_annual',
    product: "GolfHelm — Men's + Women's (annual)",
    description: "Full GolfHelm platform for both the men's and women's programs, billed annually.",
    unit_amount: 150_000,
  },
  {
    lookup_key: 'golfhelm_team_mgmt_addon_annual',
    product: 'GolfHelm — Team Management Suite (additional team, annual)',
    description: 'Team-management-only access for an additional team: roster, calendar, travel, tasks, messaging.',
    unit_amount: 20_000,
  },
];

const COUPON_ID = 'golfhelm-early-adopter-250';
const WEBHOOK_URL = `${SITE}/api/webhooks/stripe`;
// Exactly the events src/app/api/webhooks/stripe/route.ts switches on.
const WEBHOOK_EVENTS = [
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.finalized',
  'invoice.sent',
  'invoice.marked_uncollectible',
  'invoice.voided',
];

const argv = new Set(process.argv.slice(2));
const COMMIT = argv.has('--commit');
const ALLOW_LIVE = argv.has('--live');

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) { console.error('✗ STRIPE_SECRET_KEY is empty.'); process.exit(1); }
const isLive = key.includes('_live_');
if (isLive && !ALLOW_LIVE) { console.error('✗ LIVE key — re-run with --live to confirm.'); process.exit(1); }

const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
const usd = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const results = [];
async function step(label, fn) {
  if (!COMMIT) { console.log(`  ○ ${label}`); return; }
  try {
    const note = await fn();
    console.log(`  ✓ ${label}${note ? `  — ${note}` : ''}`);
    results.push({ label, ok: true });
  } catch (e) {
    const msg = (e.message || '').split('\n')[0];
    const denied = /permission|not have access|Invalid API Key/i.test(msg);
    console.log(`  ${denied ? '⊘ DASHBOARD-ONLY' : '✗ failed'}  ${label}\n      ${msg}`);
    results.push({ label, ok: false, denied, msg });
  }
}

console.log(`\nHelm Sports Labs — Stripe account configuration`);
console.log(`account ${ACCOUNT_ID} · ${isLive ? 'LIVE' : 'TEST'} · ${COMMIT ? 'COMMITTING' : 'DRY RUN (nothing written)'}\n`);

// ── 1. Support contact ─────────────────────────────────────────────────────
console.log('Business profile');
await step(`support email → ${SUPPORT_EMAIL}`, async () => {
  await stripe.accounts.update(ACCOUNT_ID, { business_profile: { support_email: SUPPORT_EMAIL, support_url: `${SITE}/support` } });
  return 'set';
});

// ── 2. Branding ────────────────────────────────────────────────────────────
console.log('\nBranding (hosted invoice page, PDFs, Stripe emails)');
await step(`logo + icon upload, colors ${BRAND_PRIMARY} / ${BRAND_SECONDARY}`, async () => {
  const branding = { primary_color: BRAND_PRIMARY, secondary_color: BRAND_SECONDARY };
  // Stripe validates purpose per branding field: `logo` accepts only a file
  // uploaded as `business_logo`, `icon` only one uploaded as `business_icon`.
  // Reusing one purpose for both fails the account update outright — colors
  // included — so each file is uploaded under its own purpose, and a failure
  // on one is contained so the colors still land.
  for (const [field, p, purpose] of [['logo', LOGO_PATH, 'business_logo'], ['icon', ICON_PATH, 'business_icon']]) {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) { console.log(`      (skipped ${field}: ${p} not found)`); continue; }
    try {
      const f = await stripe.files.create({
        purpose,
        file: { data: fs.readFileSync(abs), name: path.basename(abs), type: 'image/png' },
      });
      branding[field] = f.id;
    } catch (e) {
      console.log(`      (skipped ${field}: ${(e.message || '').split('\n')[0]})`);
    }
  }
  await stripe.accounts.update(ACCOUNT_ID, { settings: { branding } });
  return Object.keys(branding).join(', ');
});

// ── 3. Product catalogue ───────────────────────────────────────────────────
console.log('\nProduct catalogue');
for (const item of CATALOG) {
  await step(`${item.product} — ${usd(item.unit_amount)}/yr  [${item.lookup_key}]`, async () => {
    const existing = await stripe.prices.list({ lookup_keys: [item.lookup_key], limit: 1 });
    if (existing.data[0]) return `already exists (${existing.data[0].id})`;
    const product = await stripe.products.create({
      name: item.product,
      description: item.description,
      metadata: { helm_product: 'golfhelm', helm_lookup_key: item.lookup_key },
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: item.unit_amount,
      lookup_key: item.lookup_key,
      recurring: { interval: 'year' },
      metadata: { helm_product: 'golfhelm' },
    });
    return `${product.id} / ${price.id}`;
  });
}

// ── 4. Early-adopter coupon ────────────────────────────────────────────────
console.log('\nDiscounts');
await step(`coupon "Early adopter" −${usd(25_000)}  [${COUPON_ID}]`, async () => {
  try {
    const c = await stripe.coupons.retrieve(COUPON_ID);
    return `already exists (${c.id})`;
  } catch { /* not found — create below */ }
  const c = await stripe.coupons.create({
    id: COUPON_ID,
    name: 'Early adopter',
    amount_off: 25_000,
    currency: 'usd',
    duration: 'once',
    metadata: { helm_product: 'golfhelm' },
  });
  return c.id;
});

// ── 5. Webhook endpoint ────────────────────────────────────────────────────
console.log('\nWebhooks');
await step(`endpoint → ${WEBHOOK_URL}`, async () => {
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const found = list.data.find((w) => w.url === WEBHOOK_URL);
  if (found) {
    await stripe.webhookEndpoints.update(found.id, { enabled_events: WEBHOOK_EVENTS });
    return `already exists (${found.id}) — events synced, secret unchanged`;
  }
  const w = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: WEBHOOK_EVENTS,
    description: 'Helm invoice lifecycle → /api/webhooks/stripe',
  });
  // The signing secret is returned ONLY at creation. Persist it now.
  if (w.secret) {
    const p = '.env.local';
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    const i = lines.findIndex((l) => l.startsWith('STRIPE_WEBHOOK_SECRET='));
    if (i >= 0) lines[i] = `STRIPE_WEBHOOK_SECRET=${w.secret}`;
    else lines.push(`STRIPE_WEBHOOK_SECRET=${w.secret}`);
    fs.writeFileSync(p, lines.join('\n'));
    return `${w.id} · signing secret written to .env.local (${w.secret.slice(0, 12)}…)`;
  }
  return w.id;
});

// ── 6. Customer billing portal ─────────────────────────────────────────────
console.log('\nCustomer portal');
await step('billing portal configuration (invoice history)', async () => {
  const list = await stripe.billingPortal.configurations.list({ limit: 100 });
  const found = list.data.find((c) => c.metadata?.helm_product === 'golfhelm');
  const payload = {
    business_profile: {
      headline: 'Helm Sports Labs — billing',
      privacy_policy_url: `${SITE}/privacy`,
      terms_of_service_url: `${SITE}/terms`,
    },
    features: {
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'phone', 'name'] },
      payment_method_update: { enabled: true },
    },
    metadata: { helm_product: 'golfhelm' },
  };
  if (found) { await stripe.billingPortal.configurations.update(found.id, payload); return `updated ${found.id}`; }
  const c = await stripe.billingPortal.configurations.create(payload);
  return c.id;
});

// ── Summary ────────────────────────────────────────────────────────────────
if (!COMMIT) {
  console.log('\n(dry run — nothing written. Re-run with --commit' + (isLive ? ' --live' : '') + '.)\n');
} else {
  const failed = results.filter((r) => !r.ok);
  const denied = failed.filter((r) => r.denied);
  console.log(`\n${results.length - failed.length}/${results.length} steps applied.`);
  if (denied.length) {
    console.log(`\n${denied.length} need the Dashboard (restricted key can't reach them):`);
    for (const d of denied) console.log(`  · ${d.label}`);
  }
  const other = failed.filter((r) => !r.denied);
  if (other.length) {
    console.log(`\n${other.length} genuinely failed:`);
    for (const d of other) console.log(`  · ${d.label} — ${d.msg}`);
  }
}
