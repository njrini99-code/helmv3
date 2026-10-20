/**
 * Push-to-self test (owner decision D1-6; Settings › Notifications › "Send a test", P008-C3).
 *
 * POST only. Sends one fixed test notification to the signed-in user's OWN
 * Web Push subscriptions and nothing else: the user id comes from the
 * session, never from the request, and the request body is ignored. The
 * text is fixed, so this can't be used to send arbitrary content.
 *
 * Rate limited per user (3 a minute). Dead subscriptions (404/410) are
 * removed, as the reminder sender does. Native iOS (APNs) tokens live in a
 * different table and are not covered here.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { isWebPushAvailable, sendWebPush, type StoredPushSubscription } from '@/lib/coachhelm/v3/foundation/push';

const TEST_RATE_LIMIT = { maxAttempts: 3, windowMs: 60 * 1000 };
/** A user has a handful of devices; anything past this is not a test. */
const MAX_SUBSCRIPTIONS = 10;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await checkRateLimit(`push-test:user:${user.id}`, TEST_RATE_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many tests. Try again in a minute.' }, { status: 429 });
    }

    if (!isWebPushAvailable()) {
      return NextResponse.json({ error: 'Push isn’t set up on this server.' }, { status: 503 });
    }

    const admin = createAdminClient();
    const { data, error } = (await fromUntyped(admin, 'push_subscriptions')
      .select('id, user_id, endpoint, keys, expiration_time')
      .eq('user_id', user.id)
      .limit(MAX_SUBSCRIPTIONS)) as { data: StoredPushSubscription[] | null; error: { message: string } | null };
    if (error) {
      await logServerError(`push-subscriptions/test read: ${error.message}`, { action: 'push_subscriptions.test' });
      return NextResponse.json({ error: 'Couldn’t read your devices' }, { status: 500 });
    }

    const subs = (data ?? []).filter((s) => s.user_id === user.id);
    if (!subs.length) {
      return NextResponse.json({ sent: 0, failed: 0, error: 'No device has push on yet.' }, { status: 404 });
    }

    const results = await Promise.all(
      subs.map((s) =>
        sendWebPush(s, {
          title: 'Test from Clubhouse',
          body: 'Push works on this device.',
          url: '/golf/dashboard/settings?section=notifications',
          data: { kind: 'push-test' },
        }),
      ),
    );
    const dead = subs.filter((_, i) => results[i]!.shouldDeleteSubscription).map((s) => s.id);
    if (dead.length) {
      await fromUntyped(admin, 'push_subscriptions').delete().eq('user_id', user.id).in('id', dead);
    }
    const sent = results.filter((r) => r.delivered).length;
    return NextResponse.json({ sent, failed: results.length - sent }, { status: sent ? 200 : 502 });
  } catch (err) {
    await logServerError(`push-subscriptions/test exception: ${describeError(err)}`, { action: 'push_subscriptions.test' });
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
