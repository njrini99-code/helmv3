import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database';
import {
  SUPABASE_TRACE_PROPAGATION,
  withSupabaseTracing,
} from '@/lib/observability/supabase-tracing';

/**
 * The HTTP abort is a BACKSTOP, not the request budget. The invariant that
 * matters: it must sit ABOVE whatever `statement_timeout` is in force for the
 * call, so a slow request surfaces as a PostgreSQL error the caller can branch
 * on (57014, a constraint name, a deadlock) rather than an abort whose outcome
 * is unknowable.
 *
 * This was 10s, chosen against the role-level `statement_timeout` of 8s. That
 * reasoning holds for ordinary PostgREST queries and breaks for any function
 * that raises its own budget in `proconfig` — `submit_round_atomic` sets 30s and
 * `save_partial_round_atomic` sets 20s. Those calls were being aborted at 10s
 * while Postgres kept working and COMMITTED, which cost a player an entire round
 * on 2026-08-20. The same 10s cap was also silently truncating CoachHelm insight
 * delivery, where the caller catches and continues, so a coach just saw missing
 * insights and no error at all.
 * See docs/audits/ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md.
 *
 * Raising this does NOT make ordinary queries slower to fail: `authenticated`
 * still carries `statement_timeout=8s`, so a normal query returns a DB error at
 * 8s and never reaches the abort. The abort only ever bites on operations that
 * legitimately hold more DB budget than the old cap allowed.
 */
const REQUEST_TIMEOUT_MS = 35_000;

/** Uploads are bounded by the uplink, not by statement_timeout. */
const STORAGE_TIMEOUT_MS = 120_000;

function timeoutForRequest(fetchUrl: RequestInfo | URL): number {
  const href = typeof fetchUrl === 'string' ? fetchUrl : fetchUrl.toString();
  return href.includes('/storage/v1/') ? STORAGE_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

/**
 * Create a Supabase client for use in Server Components, Server Actions, and Route Handlers
 * This client runs on the server and uses cookies for authentication
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder. Check Vercel env.');
  }
  if (!anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Check Vercel env.');
  }
  const cookieStore = await cookies();

  return withSupabaseTracing(
    createServerClient<Database>(
      url,
      anonKey,
      {
        // W3C `traceparent` onto every Supabase request, so the Supabase API
        // Gateway log for this call carries the SAME trace id as the Sentry
        // trace. Works here because @sentry/node installs a global
        // OpenTelemetry propagator (sdk/initOtel.js) for supabase-js to read.
        // `respectSamplingDecision` is left at its default — see
        // SUPABASE_TRACE_PROPAGATION.
        tracePropagation: SUPABASE_TRACE_PROPAGATION,
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
        global: {
          fetch: (fetchUrl: RequestInfo | URL, options: RequestInit = {}) => {
            const signal = options.signal ?? AbortSignal.timeout(timeoutForRequest(fetchUrl));
            return fetch(fetchUrl, { ...options, signal });
          },
        },
      }
    )
  );
}
