/**
 * Web Push subscription persistence — POST + DELETE.
 *
 * The missing link that Task B (W9-pt3) uncovered: until this route
 * landed, the browser PushManager produced a subscription but there was
 * no server endpoint to PERSIST it. `task-reminders.ts` reads from
 * `public.push_subscriptions` to dispatch pushes, but no row was ever
 * written — so Web Push silently never delivered.
 *
 * Browser flow this route supports:
 *   1. Client subscribes via `pushManager.subscribe({ applicationServerKey })`
 *      using NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 *   2. Client POSTs the resulting PushSubscription JSON to this route.
 *   3. Route authenticates via Supabase session, then upserts into
 *      `public.push_subscriptions` keyed by (user_id, endpoint).
 *   4. On unsubscribe, client DELETEs by endpoint.
 *
 * RLS: writes use the admin client. Reading back is gated by RLS on
 * `push_subscriptions` (existing policies; not modified by W9-pt3).
 *
 * NOTE: native iOS push tokens (APNs via Capacitor) go through the
 * separate `registerDeviceToken` server action — different transport,
 * different table.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

// Standard browser PushSubscription.toJSON() shape.
interface PushSubscriptionPayload {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function isBlockedIpv6(literal: string): boolean {
  // `literal` is a bracket-stripped, lowercased IPv6 address. The WHATWG URL
  // parser has already validated and canonicalised it (`[0:0:0:0:0:0:0:1]` →
  // `[::1]`, `[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`), so a textual test on
  // the first hextet is sound.
  const groups = literal.split(':');
  // An empty first group means the address begins with `::` — that covers the
  // unspecified address, `::1` loopback, and every IPv4-mapped/compatible form
  // (`::ffff:7f00:1`). No real push service is reachable at one, so deny all.
  if (groups[0] === '') return true;
  // Hextets may omit leading zeros, so compare against the 4-digit form:
  // `fc0::1` is 0fc0:: and NOT unique-local, while `fc00::1` is.
  const first = (groups[0] ?? '').padStart(4, '0');
  if (first.startsWith('fc') || first.startsWith('fd')) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(first)) return true;                          // fe80::/10 link-local
  if (first.startsWith('ff')) return true;                           // ff00::/8 multicast
  return false;
}

/**
 * Reject push endpoints that point at anything but a real, public HTTPS push
 * service.
 *
 * The stored `endpoint` is a request-forgery sink: a later job
 * (`sendWebPush` in src/lib/coachhelm/v3/foundation/push.ts, driven by
 * task-reminders) hands it straight to `webpush.sendNotification`, so an
 * authenticated user could otherwise make the server open a connection to a
 * host:port of their choosing. Scheme + private-range denial, deliberately NOT
 * a vendor allowlist — an allowlist of fcm.googleapis.com /
 * *.push.services.mozilla.com / *.notify.windows.com / *.push.apple.com breaks
 * the day a vendor adds a hostname. (Possible follow-up, not this change.)
 *
 * Keep in sync with the sink-side guard in
 * src/lib/coachhelm/v3/foundation/push.ts (exported there as
 * `isSafePushEndpoint`; not exported here because a Next route module may only
 * export route handlers).
 */
function isSafePushEndpoint(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const rawHost = u.hostname.toLowerCase();
  // `URL.hostname` keeps the brackets around an IPv6 literal. Track that BEFORE
  // stripping them: the fc/fd prefix tests below are hex-byte tests and must
  // never run against a DNS name — `'fcm.googleapis.com'.startsWith('fc')` is
  // true, which would reject every Chrome/Android push subscription.
  const isIpv6Literal = rawHost.startsWith('[') && rawHost.endsWith(']');
  const h = isIpv6Literal ? rawHost.slice(1, -1) : rawHost;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return false;
  if (isIpv6Literal || h.includes(':')) {
    return !isBlockedIpv6(h);
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    // `?? -1` only satisfies noUncheckedIndexedAccess — the regex above has
    // already guaranteed four octets, so the fallback is unreachable.
    const octets = h.split('.').map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
  }
  return true;
}

function isValidPayload(body: unknown): body is PushSubscriptionPayload {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if (typeof b.endpoint !== 'string' || b.endpoint.length === 0) return false;
  if (typeof b.keys !== 'object' || b.keys === null) return false;
  const k = b.keys as Record<string, unknown>;
  if (typeof k.p256dh !== 'string' || k.p256dh.length === 0) return false;
  if (typeof k.auth !== 'string' || k.auth.length === 0) return false;
  return true;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!isValidPayload(body)) {
      return NextResponse.json(
        { error: 'Missing required fields: endpoint, keys.p256dh, keys.auth' },
        { status: 400 },
      );
    }

    if (!isSafePushEndpoint(body.endpoint)) {
      return NextResponse.json(
        { error: 'Invalid push endpoint' },
        { status: 400 },
      );
    }

    const userAgent = request.headers.get('user-agent') ?? null;
    const expirationTime =
      typeof body.expirationTime === 'number' && Number.isFinite(body.expirationTime)
        ? new Date(body.expirationTime).toISOString()
        : null;

    const admin = createAdminClient();
    const { data, error } = await fromUntyped(admin, 'push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: body.endpoint,
          keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
          expiration_time: expirationTime,
          user_agent: userAgent,
          failed_count: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' },
      )
      .select('id')
      .single() as {
      data: { id: string } | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      await logServerError(
        `push-subscriptions POST: ${error?.message ?? 'no row returned'}`,
        { action: 'push_subscriptions.POST' },
      );
      return NextResponse.json(
        { error: 'Failed to store subscription' },
        { status: 500 },
      );
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    await logServerError(
      `push-subscriptions POST exception: ${describeError(err)}`,
      { action: 'push_subscriptions.POST' },
    );
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const endpoint = new URL(request.url).searchParams.get('endpoint');
    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing required query param: endpoint' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { error } = await fromUntyped(admin, 'push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint) as { error: { message: string } | null };

    if (error) {
      await logServerError(`push-subscriptions DELETE: ${error.message}`, {
        action: 'push_subscriptions.DELETE',
      });
      return NextResponse.json(
        { error: 'Failed to remove subscription' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    await logServerError(
      `push-subscriptions DELETE exception: ${describeError(err)}`,
      { action: 'push_subscriptions.DELETE' },
    );
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
