/**
 * Class-hold release job (P-10), every minute.
 *
 * A push held while a player was in class goes out when the class ends: this job beats the heartbeat that tells the gate it is alive,
 * moves releases earlier when a class ends sooner, sends one "While you were in class" summary per player (or the single push as
 * itself), and sends anything that failed three times as itself. The logic is in src/lib/notifications/class-hold.ts.
 *
 * The flag gates only NEW holds (the gate in src/lib/notifications/push.ts asks class_awareness_v1 before it holds anything). This job
 * runs whatever the flag says, so turning class awareness off never strands a push already held: what is held still goes out when its
 * class ends, as the player was told. With the flag off nothing new is held, so the queue simply drains. The drain writes no heartbeat
 * (`beat: false`), so the database never reads holding as live while the app holds nothing. The answer says `flag: 'off'` then, for the
 * job log.
 *
 * Quiet by design: with the migrations not applied (the functions answer PGRST202), a tick does nothing and returns 200, so a preview
 * deployment or an early deploy never reads as a failing cron. The heartbeat is written first, before any claim, because the gate holds a
 * push only while that heartbeat is fresh (Must 1): a stopped or missing cron means nothing is held.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { CLASS_AWARENESS_FLAG } from '@/lib/notifications/class-hold-core';
import { runClassHoldRelease } from '@/lib/notifications/class-hold';
import { sendPushNotificationDirect, shouldSendPush } from '@/lib/notifications/push';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const JOB = 'class-holds-release';

async function handle() {
  // Never an early return on the flag: held pushes drain either way (above).
  const flagOff = !isFlagEnabled(CLASS_AWARENESS_FLAG);
  try {
    const run = await runClassHoldRelease(createAdminClient(), { sendPushNotificationDirect, shouldSendPush }, new Date(), { beat: !flagOff });
    if (run.unavailable) return NextResponse.json({ success: true, skipped: 'not_applied' });
    return NextResponse.json({ success: true, ...run, ...(flagOff ? { flag: 'off' } : {}) });
  } catch (error) {
    await logServerError(`cron.classHoldsRelease failed: ${describeError(error)}`, { action: 'cron.classHoldsRelease', featureArea: 'notifications' }, 'error');
    return NextResponse.json({ success: false, error: describeError(error) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun(JOB, handle);
}
