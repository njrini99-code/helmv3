import '@supabase/supabase-js/tracing';
import { createServerClient } from '@supabase/ssr';
import * as Sentry from '@sentry/nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database';
import { getPublishableKey } from '@/lib/supabase/keys.mjs';
import { setRequestUserId } from '@/lib/admin/request-context';

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
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder. Check Vercel env.');
  }
  // New-format publishable key first, legacy anon-key JWT as fallback — see
  // src/lib/supabase/keys.mjs.
  const anonKey = getPublishableKey();
  const cookieStore = await cookies();

  const client = createServerClient<Database>(
    url,
    anonKey,
    {
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
      tracePropagation: {
        enabled: true,
        respectSamplingDecision: false,
      },
    }
  );
  Sentry.instrumentSupabaseClient(client, { sendOperationData: false });
  attributeAuthToRequestScope(client, cookieStore);
  return client;
}

/**
 * Unverified subject from the auth cookie — NO network call, NO cookie write.
 *
 * Deliberately not `auth.getSession()`. That refreshes on demand when the
 * access token has expired (`autoRefreshToken: false` only disables the
 * background timer), which rotates the refresh token — an auth side effect
 * caused by logging, which is not acceptable at any latency. This only reads
 * and decodes what is already in the request.
 *
 * Storage format is @supabase/ssr's: one or more `sb-<ref>-auth-token[.N]`
 * cookies holding the session JSON, optionally `base64-` prefixed and split
 * into ordered chunks. Every step is guarded — an unrecognised shape yields
 * null and the error is simply logged unattributed, exactly as before.
 */
function unverifiedSubjectFromCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): string | null {
  try {
    const chunks = cookieStore
      .getAll()
      .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (chunks.length === 0) return null;

    let raw = chunks.map((c) => c.value).join('');
    if (raw.startsWith('base64-')) {
      raw = Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf8');
    }

    const accessToken = (JSON.parse(raw) as { access_token?: unknown }).access_token;
    if (typeof accessToken !== 'string') return null;

    // Decode only — signature is NOT checked, hence "unverified". Callers must
    // treat the result as a label, never as proof of identity.
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { sub?: unknown };

    return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}

/**
 * Teach `auth.getUser()` to record WHO the request belongs to, for the Bridge.
 *
 * Wrapped here rather than at the call sites because there are 583 of those in
 * `src/`; the same arithmetic that produced the ambient `requestId` applies
 * unchanged. See `setRequestUserId` for the measured gap this closes.
 *
 * Two cases, both worth attributing:
 *
 *   - getUser() RESOLVED a user. Verified; record it plainly.
 *   - getUser() returned no user. GoTrue rejected the session or never ruled
 *     on it, so the only subject available is the UNVERIFIED one decoded from
 *     the cookie — and this is the shape of "session expired mid-round", the
 *     error most in need of a name attached.
 *
 * Wrapping is transparent: the original result object is returned untouched, so
 * every caller — including `getUserResilient`, which distinguishes a rejection
 * from a transit failure — behaves exactly as before. Any throw from the
 * attribution itself is swallowed; observability must not be able to fail a
 * request. This never influences authorization: callers still branch on the
 * real `getUser()` result, which is unchanged.
 */
function attributeAuthToRequestScope(
  client: ReturnType<typeof createServerClient<Database>>,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): void {
  try {
    const auth = client.auth;
    const originalGetUser = auth.getUser.bind(auth);
    auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
      const result = await originalGetUser(...args);
      try {
        const verifiedId = result?.data?.user?.id;
        if (verifiedId) {
          setRequestUserId(verifiedId);
        } else {
          setRequestUserId(unverifiedSubjectFromCookies(cookieStore), { unverified: true });
        }
      } catch {
        // Attribution is an enrichment; never let it change the auth answer.
      }
      return result;
    }) as typeof auth.getUser;
  } catch {
    // An exotic client shape must not stop the app from getting a client.
  }
}
