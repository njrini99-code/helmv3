import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types/database';

/**
 * Per-request HTTP abort budget.
 *
 * 10s is the right ceiling for PostgREST and auth: the DB statement_timeout is
 * 8s, so the database's own error surfaces first and the abort is only a
 * backstop for a request that never reaches Postgres at all.
 *
 * It is the WRONG ceiling for Storage. An upload's duration is set by the
 * user's UPLINK, not by a query planner. A phone photo just under the 2MB
 * cap is ~16 Mbit, and a typical LTE uplink carries that in anywhere from
 * 4 to 20+ seconds — so the 10s budget aborts perfectly healthy uploads on
 * exactly the connection our users are most likely to be on. WebKit then
 * rejects with a bare `AbortError: Fetch is aborted`, which reads like a
 * crash rather than "your connection is slow".
 *
 * Observed 2026-08-06: two Shenandoah players lost avatar uploads mid
 * player-onboarding on iPhone/LTE. The first was misread as an auth failure
 * and fixed in AvatarUpload (#1294) — which could not help, because the
 * abort originates here, one layer below the component.
 */
const REQUEST_TIMEOUT_MS = 10_000;
const STORAGE_TIMEOUT_MS = 120_000;

/** Supabase routes every Storage call through `/storage/v1/`. Exported so the
 *  budget split is asserted directly — it is the whole fix. */
export function timeoutForRequest(target: RequestInfo | URL): number {
  const href =
    typeof target === 'string'
      ? target
      : target instanceof URL
        ? target.href
        : target.url;
  return href.includes('/storage/v1/') ? STORAGE_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

/**
 * Create a Supabase client for use in Client Components
 * This client runs in the browser and has access to cookies
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder. Check Vercel env.');
  }
  if (!anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Check Vercel env.');
  }
  return createBrowserClient<Database>(
    url,
    anonKey,
    {
      global: {
        fetch: (fetchUrl: RequestInfo | URL, options: RequestInit = {}) => {
          // See timeoutForRequest: DB/auth keep the 10s backstop, Storage does
          // not — an upload is bounded by the uplink, not by statement_timeout.
          const signal = options.signal ?? AbortSignal.timeout(timeoutForRequest(fetchUrl));
          return fetch(fetchUrl, { ...options, signal });
        },
      },
    }
  );
}
