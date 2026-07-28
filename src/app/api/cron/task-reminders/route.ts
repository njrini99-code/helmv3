/**
 * Task-reminder cron.
 *
 * Dispatches due task reminders (in-app row + email + push) for reminders whose
 * `scheduled_for` has passed and that haven't been sent. Designed for an HOURLY
 * schedule (`0 * * * *` in vercel.json) — matching the task reminder offsets
 * (1h / 2h / 1d / 2d / 1w before due).
 *
 * Why a service-role client: golf_task_reminders is readable only by the owning
 * coach or service_role (RLS). A cron has no user session, so it MUST use the
 * admin client — processReminders() is given that client and threads it through
 * the fetch / send / mark-sent path. (Calling processReminders() with no client
 * falls back to the cookie-scoped client, which under cron would read nothing.)
 *
 * Idempotency: getDueReminders filters `sent=false`, and each processed reminder
 * is marked sent (or sent-with-error) before the next tick, so re-runs don't
 * re-send. Recipients are resolved via the correct path inside the senders
 * (golf_task_assignments → golf_players.user_id, assigned_by → golf_coaches.user_id).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCronAuth } from '@/lib/cron/auth';
import { processReminders } from '@/app/golf/actions/task-reminders';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('task-reminders', async () => {
    try {
      const supabase = createAdminClient();
      const result = await processReminders(supabase);

      if (result.sent + result.failed > 0) {
        await logServerEvent(
          `task_reminders cron sent=${result.sent} failed=${result.failed}`,
          {
            action: 'cron.taskReminders.summary',
            featureArea: 'tasks',
            extra: { sent: result.sent, failed: result.failed, errors: result.errors.slice(0, 10) },
          },
          result.failed > 0 ? 'warning' : 'info',
        );
      }

      return NextResponse.json({
        success: true,
        sent: result.sent,
        failed: result.failed,
      });
    } catch (err) {
      await logServerError(
        `cron.taskReminders failed: ${describeError(err)}`,
        { action: 'cron.taskReminders', featureArea: 'tasks' },
        'error',
      );
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  });
}
