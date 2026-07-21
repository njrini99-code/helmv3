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
