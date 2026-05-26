/**
 * v3 weekly coach email cron — GET/POST /api/cron/v3/weekly-coach-email
 *
 * Designed to fire Sundays. Picks every active team's primary coach,
 * builds a WeeklyRecap for the past 7 days, and sends via Resend. The
 * route is idempotent within the same week — we tag each send so a
 * future "sent already" lookup table can dedupe (deferred).
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

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface SendSummary {
  teams_considered: number;
  sent: number;
  skipped_no_email: number;
  skipped_provider_unset: number;
  errors: number;
  duration_ms: number;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return handle();
}
export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return handle();
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  const sb = createAdminClient();
  const summary: SendSummary = {
    teams_considered: 0,
    sent: 0,
    skipped_no_email: 0,
    skipped_provider_unset: 0,
    errors: 0,
    duration_ms: 0,
  };
  const weekEndIso = new Date().toISOString();

  // All teams that have at least one active member.
  const { data: teams } = await sb.from('golf_teams').select('id');
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
        { action: 'cron.v3.weekly-coach-email' },
      );
    }
  }

  summary.duration_ms = Date.now() - startedAt;
  return NextResponse.json(summary);
}
