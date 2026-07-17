/**
 * v3 weekly coach email cron — GET/POST /api/cron/v3/weekly-coach-email
 *
 * Designed to fire Sundays. Picks every active team's primary coach,
 * builds a WeeklyRecap for the past 7 days, and sends via Resend.
 *
 * Idempotency: a retry/manual re-trigger within the same ISO week must not
 * re-email every coach. Each send carries an
 * `idempotencyKey: weekly-coach-email:${coach_id}:${isoWeekStart}` (Resend's
 * `Idempotency-Key` header) so a duplicate tick for the same coach/week
 * returns Resend's cached response instead of dispatching a second email.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 *
 * Schedule: configured in vercel.json (operational follow-up). The
 * cron itself doesn't enforce a day-of-week — that's the schedule's
 * job — so it can be triggered manually for testing.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { buildWeeklyRecap } from '@/lib/coachhelm/v3/recap/builder';
import { buildWeeklyRecapHtml } from '@/lib/coachhelm/v3/recap/template';
import { sendEmail } from '@/lib/coachhelm/v3/foundation/email';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

/**
 * ISO week start (Monday), UTC, as `YYYY-MM-DD` — the dedupe period key.
 * Mirrors the sibling helper in src/app/lifting/actions/performance-profile.ts.
 */
function isoWeekStartKey(d: Date): string {
  const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() - offset);
  return monday.toISOString().slice(0, 10);
}

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface SendSummary {
  teams_considered: number;
  sent: number;
  skipped_no_email: number;
  skipped_provider_unset: number;
  /** Coach has explicitly opted out of the CoachHelm email digest. */
  skipped_opted_out: number;
  errors: number;
  duration_ms: number;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-weekly-coach-email', () => handle());
}
export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-weekly-coach-email', () => handle());
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  const sb = createAdminClient();
  const summary: SendSummary = {
    teams_considered: 0,
    sent: 0,
    skipped_no_email: 0,
    skipped_provider_unset: 0,
    skipped_opted_out: 0,
    errors: 0,
    duration_ms: 0,
  };
  const now = new Date();
  const weekEndIso = now.toISOString();
  const weekKey = isoWeekStartKey(now);

  // All teams that have at least one active member. Paginated — platform-wide
  // fetch with no filter can exceed the PostgREST 1000-row cap once the team
  // count grows (mirrors event-reminders' use of fetchAllRowsResult).
  const { data: teams, error: teamsErr } = await fetchAllRowsResult<{ id: string }>(
    (from, to) => sb.from('golf_teams').select('id').order('id', { ascending: true }).range(from, to),
    undefined,
    { table: 'golf_teams', action: 'cron.v3.weekly-coach-email', sport: 'golf' },
  );
  if (teamsErr) {
    // Not logged here: this route is wrapped in recordJobRun (job-log.ts),
    // which already writes a "Cron failed" Bridge event for any >=400
    // response — logging again here would double-write error_logs/
    // admin_events/Sentry for the same failure.
    return NextResponse.json({ success: false, error: teamsErr.message }, { status: 500 });
  }
  const teamIds = (teams ?? []).map((t) => t.id);
  summary.teams_considered = teamIds.length;

  for (const team_id of teamIds) {
    try {
      const { data: staff } = await sb
        .from('golf_team_coach_staff')
        .select('coach_id')
        .eq('team_id', team_id)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle();
      if (!staff?.coach_id) continue;

      // Opt-out gate: there is no dedicated `email_weekly_recap` preference
      // column, so this recap (a CoachHelm digest email, same as the daily
      // coach-morning-digest cron) is gated on the CLOSEST existing coach
      // preference — `golf_coach_philosophy.email_digest_enabled` — the same
      // column /api/cron/coach-morning-digest already honors. Missing row →
      // opted-in by default (mirrors that cron's convention: the flag only
      // records explicit opt-outs).
      const { data: philosophyRow } = await sb
        .from('golf_coach_philosophy')
        .select('email_digest_enabled')
        .eq('coach_id', staff.coach_id)
        .maybeSingle();
      if (philosophyRow && philosophyRow.email_digest_enabled === false) {
        summary.skipped_opted_out += 1;
        continue;
      }

      const recap = await buildWeeklyRecap(sb, {
        coach_id: staff.coach_id,
        team_id,
        week_end_iso: weekEndIso,
      });
      if (!recap) continue;

      // Coach email — pull from golf_coaches → users join.
      const { data: coachRow } = await sb
        .from('golf_coaches')
        .select('user_id')
        .eq('id', staff.coach_id)
        .maybeSingle();
      if (!coachRow?.user_id) {
        summary.skipped_no_email += 1;
        continue;
      }
      const { data: userRow } = await sb
        .from('users')
        .select('email')
        .eq('id', coachRow.user_id)
        .maybeSingle();
      if (!userRow?.email) {
        summary.skipped_no_email += 1;
        continue;
      }

      const { subject, html, text } = buildWeeklyRecapHtml(recap);
      const result = await sendEmail({
        to: userRow.email,
        subject,
        html,
        text,
        tags: [
          { name: 'task', value: 'weekly_coach_recap' },
          { name: 'team_id', value: team_id },
        ],
        idempotencyKey: `weekly-coach-email:${staff.coach_id}:${weekKey}`,
      });
      if (!result.delivered) {
        // The wrapper returns a friendly error string when the API key
        // is unset (dev / preview) so we don't count those as errors.
        if (result.error?.includes('RESEND_API_KEY')) summary.skipped_provider_unset += 1;
        else summary.errors += 1;
        continue;
      }
      summary.sent += 1;
    } catch (err) {
      summary.errors += 1;
      await logServerError(
        `weekly-coach-email failure ${team_id}: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'cron.v3.weekly-coach-email', source: 'cron' },
      );
    }
  }

  summary.duration_ms = Date.now() - startedAt;
  return NextResponse.json(summary);
}
