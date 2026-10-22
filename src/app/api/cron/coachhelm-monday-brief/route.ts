/**
 * Coach Monday brief delivery — GET/POST /api/cron/coachhelm-monday-brief
 * (CoachHelm task chs-28; vercel.json "0 5 * * 1", Mondays 05:00 UTC).
 *
 * OFF behind `coachhelm_monday_brief_v1` (production false): with the flag off
 * the handler returns before it reads a row or sends anything. With it on,
 * each team's primary coach gets the team's brief by email through the v3
 * Resend wrapper (`foundation/email.sendEmail`), which also honours the
 * customer-email kill switch (`HELM_CUSTOMER_EMAIL_ENABLED`, off in
 * production since 2026-09-06): both must be on for a coach to get mail.
 *
 * Skips: no primary coach; team in offseason; coach not opted in; a brief
 * that did not read (counted as an error, never sent half-read); an empty
 * brief (no item and every count zero: nothing worth a Monday email).
 *
 * Opt-in, not opt-out: `golf_coach_philosophy.email_digest_enabled` defaults
 * to true, which the weekly recap's header calls out as unsafe for a new
 * schedule. This route sends only when the coach's row says `true`
 * explicitly, so a missing row sends nothing (fail closed).
 *
 * Idempotency: `coachhelm-monday-brief:${coach_id}:${team_id}:${week}` is the
 * Resend `Idempotency-Key`, so a retried tick in the same week sends once.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { describeError } from '@/lib/utils/describe-error';
import { sendEmail } from '@/lib/coachhelm/v3/foundation/email';
import { isMondayBriefEnabled } from '@/lib/coachhelm/v3/monday-brief/flag';
import { loadMondayBrief } from '@/lib/coachhelm/v3/monday-brief/loader';
import { isEmptyBrief } from '@/lib/coachhelm/v3/monday-brief/brief';
import { buildMondayBriefEmail } from '@/lib/coachhelm/v3/monday-brief/email';
import { MONDAY_BRIEF_PATH } from '@/lib/coachhelm/v3/monday-brief/words';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface MondayBriefRunSummary {
  skipped?: 'flag_off';
  teams_considered: number;
  sent: number;
  skipped_empty: number;
  skipped_not_opted_in: number;
  skipped_offseason: number;
  skipped_no_email: number;
  skipped_not_sent: number;
  errors: number;
  duration_ms: number;
}

const JOB = 'coachhelm-monday-brief';

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun(JOB, () => handle());
}

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun(JOB, () => handle());
}

/** Monday of the ISO week, UTC, `YYYY-MM-DD`: the idempotency period. */
function isoWeekStartKey(d: Date): string {
  const offset = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() - offset);
  return monday.toISOString().slice(0, 10);
}

function emptySummary(): MondayBriefRunSummary {
  return { teams_considered: 0, sent: 0, skipped_empty: 0, skipped_not_opted_in: 0, skipped_offseason: 0, skipped_no_email: 0, skipped_not_sent: 0, errors: 0, duration_ms: 0 };
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  const summary = emptySummary();
  // Off: nothing is read and nothing is sent.
  if (!isMondayBriefEnabled()) return NextResponse.json({ ...summary, skipped: 'flag_off' });

  const sb = createAdminClient();
  const now = new Date();
  const week = isoWeekStartKey(now);
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com').replace(/\/$/, '');

  const { data: teams, error: teamsErr } = await fetchAllRowsResult<{ id: string; name: string; season_active: boolean }>(
    (from, to) => sb.from('golf_teams').select('id, name, season_active').order('id', { ascending: true }).range(from, to),
    undefined,
    { table: 'golf_teams', action: 'cron.coachhelm-monday-brief', sport: 'golf' },
  );
  // recordJobRun writes the failure event for a >=400 answer; not logged twice here.
  if (teamsErr) return NextResponse.json({ success: false, error: teamsErr.message }, { status: 500 });

  for (const team of teams ?? []) {
    summary.teams_considered += 1;
    try {
      if (team.season_active === false) {
        summary.skipped_offseason += 1;
        continue;
      }
      // A lookup that failed is an error for this team, never "no coach" or "not opted in".
      const { data: staff, error: staffErr } = await sb.from('golf_team_coach_staff').select('coach_id').eq('team_id', team.id).eq('is_primary', true).limit(1).maybeSingle();
      if (staffErr) throw new Error(`primary coach: ${staffErr.message}`);
      if (!staff?.coach_id) continue;

      const { data: pref, error: prefErr } = await sb.from('golf_coach_philosophy').select('email_digest_enabled').eq('coach_id', staff.coach_id).maybeSingle();
      if (prefErr) throw new Error(`email preference: ${prefErr.message}`);
      if (pref?.email_digest_enabled !== true) {
        summary.skipped_not_opted_in += 1;
        continue;
      }

      const brief = await loadMondayBrief(sb, team.id, now);
      if (!brief) {
        summary.errors += 1;
        continue;
      }
      if (isEmptyBrief(brief)) {
        summary.skipped_empty += 1;
        continue;
      }

      const { data: coach, error: coachErr } = await sb.from('golf_coaches').select('user_id, full_name').eq('id', staff.coach_id).maybeSingle();
      if (coachErr) throw new Error(`coach: ${coachErr.message}`);
      const { data: user, error: userErr } = coach?.user_id ? await sb.from('users').select('email').eq('id', coach.user_id).maybeSingle() : { data: null, error: null };
      if (userErr) throw new Error(`coach email: ${userErr.message}`);
      if (!user?.email) {
        summary.skipped_no_email += 1;
        continue;
      }

      const first = coach?.full_name?.trim().split(/\s+/)[0] || 'Coach';
      const mail = buildMondayBriefEmail({ brief, teamName: team.name, coachFirstName: first, href: `${base}${MONDAY_BRIEF_PATH}` });
      const result = await sendEmail({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tags: [
          { name: 'task', value: 'coachhelm_monday_brief' },
          { name: 'team_id', value: team.id },
        ],
        idempotencyKey: `${JOB}:${staff.coach_id}:${team.id}:${week}`,
      });
      if (result.delivered) summary.sent += 1;
      // The kill switch, a missing key or an idempotent replay is not a failure of this run; a provider rejection or outage is.
      else if (result.suppressed) summary.skipped_not_sent += 1;
      else throw new Error(`send: ${result.error ?? 'not delivered'}`);
    } catch (err) {
      summary.errors += 1;
      await logServerError(`coachhelm-monday-brief failure ${team.id}: ${describeError(err)}`, { action: 'cron.coachhelm-monday-brief', source: 'cron' });
    }
  }

  summary.duration_ms = Date.now() - startedAt;
  return NextResponse.json(summary);
}
