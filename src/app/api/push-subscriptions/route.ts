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
