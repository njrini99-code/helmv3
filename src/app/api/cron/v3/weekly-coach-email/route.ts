/**
 * v3 weekly coach email cron — GET/POST /api/cron/v3/weekly-coach-email
 *
 * Designed to fire Sundays. Picks every active team's primary coach,
 * builds a WeeklyRecap for the past 7 days, and sends via Resend.
 *
 * Idempotency: a retry/manual re-trigger within the same ISO week must not
 * re-email every coach. Each send carries an
 * `idempotencyKey: weekly-coach-email:${coach_id}:${team_id}:${isoWeekStart}`
 * (Resend's `Idempotency-Key` header) so a duplicate tick for the same
 * coach/team/week returns Resend's cached response instead of dispatching a
 * second email. `team_id` is included because one coach can be primary on
 * more than one team.
 *
 * KEY-SHAPE TRANSITION. That key used to be `...:${coach_id}:${isoWeekStart}`
 * with no `team_id`. Resend can only be consulted at send time — there is no
 * "does this key exist" API — so a re-trigger in the SAME ISO week as the
 * deploy that changed the shape would miss every pre-deploy key and re-email
 * every coach already sent that week. `WEEKLY_COACH_EMAIL_LEGACY_WEEK` is the
 * transition window: set it to the affected `YYYY-MM-DD` ISO-week-start and
 * the FIRST send per coach in that week reuses the legacy shape, so it lands
 * on the pre-deploy key. Unset (the default, and correct for every later
 * week) nothing changes. It is self-limiting — it only ever matches one week.
 * See the send site below for why reusing that key cannot double-send.
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
import { describeError } from '@/lib/utils/describe-error';

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
  /** Team is in offseason (season_active=false). */
  skipped_offseason: number;
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
    skipped_offseason: 0,
    errors: 0,
    duration_ms: 0,
  };
  const now = new Date();
  const weekEndIso = now.toISOString();
  const weekKey = isoWeekStartKey(now);

  // Key-shape transition (see the module header). Only the single ISO week
  // named by the env var is affected; every other week uses the current shape.
  const legacyKeyWeek = process.env.WEEKLY_COACH_EMAIL_LEGACY_WEEK?.trim() || null;
  const legacyKeyWeekActive = legacyKeyWeek !== null && legacyKeyWeek === weekKey;
  // Coaches whose legacy (coach+week) key has already been claimed by an
  // earlier team in THIS run — the legacy shape is only unique per coach, so
  // exactly one team may use it. Mirrors which team consumed it pre-deploy:
  // teams are walked in the same `golf_teams.id ASC` order, and the first one
  // that actually reached sendEmail is the one that got the email.
  const legacyKeyClaimed = new Set<string>();

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

      // Offseason gate: when a team is in offseason, suppress scheduled digests
      // to prevent noise. Event-driven emails (reminders, cancellations) are not
      // affected.
      const { data: teamRow } = await sb
        .from('golf_teams')
        .select('season_active')
        .eq('id', team_id)
        .maybeSingle();
      if (teamRow && teamRow.season_active === false) {
        summary.skipped_offseason += 1;
        continue;
      }

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

      // Reusing a Resend idempotency key can never dispatch a second email:
      // an identical payload replays the cached response, and a CHANGED
      // payload is rejected outright with `invalid_idempotent_request`
      // (node_modules/resend RESEND_ERROR_CODE_KEY). Both are handled below.
      const useLegacyKey = legacyKeyWeekActive && !legacyKeyClaimed.has(staff.coach_id);
      if (useLegacyKey) legacyKeyClaimed.add(staff.coach_id);
      const idempotencyKey = useLegacyKey
        ? `weekly-coach-email:${staff.coach_id}:${weekKey}`
        : `weekly-coach-email:${staff.coach_id}:${team_id}:${weekKey}`;

      const result = await sendEmail({
        to: userRow.email,
        subject,
        html,
        text,
        tags: [
          { name: 'task', value: 'weekly_coach_recap' },
          { name: 'team_id', value: team_id },
        ],
        // team_id is in the current shape because one coach can be
        // `is_primary` on more than one team (golf_team_coach_staff is UNIQUE
        // only on (team_id, coach_id), not on coach_id alone), and each team
        // gets its own recap payload. Without team_id, the second team's send
        // collided with the first's key and Resend rejected it as a duplicate.
        idempotencyKey,
      });
      if (!result.delivered) {
        // The wrapper returns a friendly error string when the API key
        // is unset (dev / preview) so we don't count those as errors.
        if (result.error?.includes('RESEND_API_KEY')) {
          summary.skipped_provider_unset += 1;
        } else if (result.error && /idempoten/i.test(result.error)) {
          // Resend refused a key it has already seen with a different body —
          // i.e. this coach/team/week was ALREADY emailed and the recap has
          // since been rebuilt with fresher data. That is idempotency working,
          // not a failure: nothing was double-sent, so it must not be counted
          // as an error and paged on. Counting it as `sent` would be a lie
          // about THIS run, so it is simply not counted (the loop already has
          // uncounted `continue`s for no-primary-coach and no-recap).
        } else {
          summary.errors += 1;
        }
        continue;
      }
      summary.sent += 1;
    } catch (err) {
      summary.errors += 1;
      await logServerError(
        `weekly-coach-email failure ${team_id}: ${describeError(err)}`,
        { action: 'cron.v3.weekly-coach-email', source: 'cron' },
      );
    }
  }

  summary.duration_ms = Date.now() - startedAt;
  return NextResponse.json(summary);
}
