import 'server-only';
import Stripe from 'stripe';

/**
 * Server-only Stripe client singleton.
 *
 * - Uses STRIPE_SECRET_KEY. Prefer a RESTRICTED API key (`rk_...`) scoped to
 *   Customers + Invoices + Tax over a full secret key (`sk_...`).
 * - apiVersion is pinned to the version the installed SDK (stripe@22.x) is
 *   generated against, so request/response types always match at compile time.
 *   Bump this only alongside an SDK upgrade (see the `upgrade-stripe` skill).
 * - Lazy-initialised: importing this module never throws. The key is only
 *   required the first time `getStripe()` runs, which keeps `next build` and
 *   any import of this file working in environments without Stripe configured.
 */

const STRIPE_API_VERSION = '2026-06-24.dahlia' satisfies Stripe.LatestApiVersion;

let client: Stripe | null = null;

/**
 * #1255 — is Stripe configured in THIS environment?
 *
 * `getStripe()` is deliberately lazy so importing this module never throws,
 * which keeps `next build` working without Stripe. The cost of that is that a
 * missing key is only discovered when a request actually reaches the API — and
 * on /admin/billing that is after the admin has filled in the entire invoice
 * (name, billing email, full address, line items). Production currently has no
 * Stripe variables at all, so every submission of that form was guaranteed to
 * fail at the last step.
 *
 * Surfaces call this to disclose the state UP FRONT instead. It only reports
 * whether a key is present — never the key, and never any part of it.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe {
  if (client) return client;

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is missing. Set a restricted API key (rk_...) in your environment.',
    );
  }

  client = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: 'Helm Sports Labs', url: 'https://helmsportslabs.com' },
    typescript: true,
  });
  return client;
}
