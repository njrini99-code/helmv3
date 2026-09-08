import { createServerClient } from '@supabase/ssr';
import { getPublishableKey } from '@/lib/supabase/keys.mjs';

/**
 * Who was signed in, read from a raw request header set — for ATTRIBUTION ONLY.
 *
 * WHY THIS EXISTS. Next's `onRequestError` hook (src/instrumentation.ts) is the
 * capture path for every server-render and route-handler failure, and it passed
 * no identity at all: `logServerException` takes `userId`/`userEmail` from its
 * caller and nothing else, so every `source='server_component'` row landed with
 * `user_id NULL`. Measured against production 2026-09-08: 79 of the ~151 error
 * rows visible in a 72h window came through this path, including the top three
 * incidents by volume, and not one could name a single affected person.
 *
 * The obvious fixes do not work here, which is why this file is odd:
 *  - `cookies()` from `next/headers` needs the request store, and
 *    `onRequestError` runs after the render has already unwound.
 *  - The ambient `RequestContext` AsyncLocalStorage
 *    (`@/lib/admin/request-context.ts`) is opened only by `observed-action.ts`,
 *    so a page render never has one and this would read null.
 * What `onRequestError` DOES get is `request.headers` — including `cookie`.
 *
 * NOT AUTHORIZATION. NEVER. This reads the session the browser presented; it
 * does not re-verify it against the auth server, and nothing here may ever gate
 * access. Two independent reasons that is the right trade:
 *  1. The value is written to `admin_events.user_id` for an operator to read.
 *     The worst case is a mislabelled row on a super-admin dashboard.
 *  2. This request already passed `updateSession`
 *     (`@/lib/supabase/middleware.ts`), which called `getUserResilient` and
 *     redirected an unauthenticated visitor — so by the time a render can throw,
 *     the session in this cookie has been verified once already.
 * A real permission decision goes through `requireSuperAdmin()`, the RLS
 * policies, or `getUserResilient` — never this.
 *
 * PARSING IS DELEGATED ON PURPOSE. The Supabase auth cookie is chunked across
 * `sb-<ref>-auth-token.0`/`.1` past a size threshold and carries a `base64-`
 * envelope, and the project ref is part of its name. Hand-rolling that decoder
 * would mean a subtle bug ATTRIBUTES A FAULT TO THE WRONG PERSON, which is
 * strictly worse than the null it replaces. `createServerClient` already owns
 * that format, so it does the reading.
 *
 * NEVER THROWS, NEVER BLOCKS THE CAPTURE. Every failure returns
 * `{ userId: null, userEmail: null }` — exactly the value the call site passed
 * before this existed, so the Bridge write degrades to its old behaviour rather
 * than losing the error entirely.
 */

export interface ObservedUser {
  userId: string | null;
  userEmail: string | null;
}

const NOBODY: ObservedUser = { userId: null, userEmail: null };

/** Supabase's own cookie naming — see `collectAuthCookie` in middleware.ts. */
function isAuthCookieName(name: string): boolean {
  return name.startsWith('sb-') && name.includes('-auth-token');
}

/**
 * `cookie: "a=1; b=2"` → the pairs `createServerClient` expects.
 *
 * Deliberately minimal: it splits on `; `, takes the first `=` as the
 * separator (cookie VALUES legitimately contain `=` — base64 padding — so
 * splitting on every one truncates the session), and leaves values encoded
 * exactly as sent, which is what the auth client decodes.
 */
export function parseCookieHeader(header: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    out.push({ name: trimmed.slice(0, eq), value: trimmed.slice(eq + 1) });
  }
  return out;
}

/** Pull `cookie` out of the loosely-typed header bag `onRequestError` hands over. */
function readCookieHeader(headers: Record<string, string | string[] | undefined>): string | null {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'cookie') continue;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join('; ');
  }
  return null;
}

export async function observedUserFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): Promise<ObservedUser> {
  try {
    const cookieHeader = readCookieHeader(headers);
    if (!cookieHeader) return NOBODY;

    const cookies = parseCookieHeader(cookieHeader);
    // The overwhelmingly common case on a public route: no session at all.
    // Bailing here keeps an anonymous 500 from constructing a client and
    // touching the auth machinery for a question whose answer is "nobody".
    if (!cookies.some((c) => isAuthCookieName(c.name))) return NOBODY;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!url || /placeholder\.supabase\.co/i.test(url)) return NOBODY;

    const supabase = createServerClient(url, getPublishableKey(), {
      cookies: {
        getAll: () => cookies,
        // Read-only by construction. A refreshed token has nowhere to go from
        // here — the response was written long before `onRequestError` ran —
        // and silently dropping it is correct: this is a diagnostic read, not
        // part of the session lifecycle.
        setAll: () => {},
      },
    });

    // `getSession`, not `getUser`: the latter round-trips to the auth server on
    // every call, and this runs on an error path that is already paying for a
    // database write. The session's signature is unverified — see the "NOT
    // AUTHORIZATION" note above for why that is acceptable here and nowhere
    // else.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) return NOBODY;

    return {
      userId: data.session.user.id ?? null,
      userEmail: data.session.user.email ?? null,
    };
  } catch {
    // An identity is an enrichment. Losing it must never cost us the error.
    return NOBODY;
  }
}
