/**
 * Daily coach morning digest cron.
 *
 * Every day at 06:30 UTC, pulls the top 3 actionable insights + 1 celebration
 * + 1 watch per coach, renders a transactional email, and sends via Resend.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron standard).
 * Schedule: `30 6 * * *` — see vercel.json.
 *
 * Why an admin client: `getInsightsForCoach()` runs behind `supabase.auth
 * .getUser()` and is wired to be called from a server action with a
 * cookie-bound session. A cron has no session, so this route queries
 * `golf_coach_insights` directly with the service role — RLS is bypassed but
 * the CRON_SECRET bearer is the authorization boundary.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import {
  renderCoachDigest,
  type CoachDigestCelebration,
  type CoachDigestInsight,
  type CoachDigestWatch,
} from '@/lib/email/coach-digest-template';
import { sendCoachDigest } from '@/lib/email/resend-client';
import { requireCronAuth } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const COACH_BATCH_SIZE = 5;

interface EligibleCoach {
  coach_id: string;
  coach_full_name: string | null;
  coach_email: string | null;
  team_id: string;
  team_name: string | null;
}

interface InsightQueryRow {
  id: string;
  player_id: string;
  title: string | null;
  content: string | null;
  evidence: unknown;
  lifecycle_state: string | null;
  player: { first_name: string | null; last_name: string | null } | null;
}

interface DigestSummary {
  coaches_eligible: number;
  sent: number;
  skipped: number;
  failed: number;
  reasons: Record<string, number>;
}

export async function GET(req: NextRequest): Promise<NextResponse | Response> {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const summary: DigestSummary = {
    coaches_eligible: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    reasons: {},
  };

  // ─── 1. Eligible coaches (opted-in + on at least one team) ──────────────
  //
  // We read `golf_team_coach_staff` with embedded coach + team + philosophy
  // rows so a single query builds the eligible set. Philosophies default to
  // `email_digest_enabled = true` for coaches who have never touched
  // settings — the flag only excludes explicit opt-outs.
  const { data: staffRows, error: staffError } = await supabase
    .from('golf_team_coach_staff')
    .select(`
      coach:golf_coaches (
        id,
        full_name,
        email,
        philosophy:golf_coach_philosophy (email_digest_enabled)
      ),
      team:golf_teams ( id, name )
    `);

  if (staffError) {
    await logServerError(
      `cron.coachDigest.fetchStaff failed: ${staffError.message}`,
      {
        action: 'cron.coachDigest.fetchStaff',
        featureArea: 'coach-digest',
        extra: { code: staffError.code },
      },
      'error',
    );
    return NextResponse.json(
      { success: false, error: staffError.message },
      { status: 500 },
    );
  }

  type StaffJoin = {
    coach:
      | {
          id: string;
          full_name: string | null;
          email: string | null;
          philosophy:
            | { email_digest_enabled: boolean | null }
            | Array<{ email_digest_enabled: boolean | null }>
            | null;
        }
      | null;
    team: { id: string; name: string | null } | null;
  };

  const eligible = new Map<string, EligibleCoach>();
  for (const raw of (staffRows ?? []) as unknown as StaffJoin[]) {
    const coach = raw.coach;
    const team = raw.team;
    if (!coach || !team) continue;

    const philosophy = Array.isArray(coach.philosophy)
      ? coach.philosophy[0]
      : coach.philosophy;
    // Missing philosophy row → treat as opted-in (default = true).
    const optedIn =
      philosophy == null || philosophy.email_digest_enabled !== false;
    if (!optedIn) continue;
    if (!coach.email) continue;

    // Pick the first team we see for each coach. The digest is coach-wide
    // (across every team they staff), so the team label is cosmetic — any
    // valid team name is fine for the greeting line.
    if (!eligible.has(coach.id)) {
      eligible.set(coach.id, {
        coach_id: coach.id,
        coach_full_name: coach.full_name,
        coach_email: coach.email,
        team_id: team.id,
        team_name: team.name,
      });
    }
  }

  summary.coaches_eligible = eligible.size;
  if (eligible.size === 0) {
    return NextResponse.json({ success: true, ...summary });
  }

  // ─── 2. Process coaches in parallel batches of 5 ────────────────────────

  const coaches = Array.from(eligible.values());
  for (let i = 0; i < coaches.length; i += COACH_BATCH_SIZE) {
    const batch = coaches.slice(i, i + COACH_BATCH_SIZE);
    await Promise.all(
      batch.map(async (coach) => {
        try {
          const result = await processCoach(supabase, coach);
          if (result.sent) summary.sent += 1;
          else if (result.skipped) {
            summary.skipped += 1;
            if (result.reason) {
              summary.reasons[result.reason] =
                (summary.reasons[result.reason] ?? 0) + 1;
            }
          } else {
            // Failed case ALSO carries a `reason` from the per-coach pipeline
            // ('teams-query' / 'members-query'). Previously it was dropped on
            // the floor, losing the failure-mode signal in the digest summary.
            summary.failed += 1;
            if (result.reason) {
              summary.reasons[result.reason] =
                (summary.reasons[result.reason] ?? 0) + 1;
            }
          }
        } catch (err) {
          summary.failed += 1;
          await logServerError(
            `cron.coachDigest.coach failed: ${err instanceof Error ? err.message : String(err)}`,
            {
              action: 'cron.coachDigest.coach',
              featureArea: 'coach-digest',
              extra: {
                coachId: coach.coach_id,
                stack: err instanceof Error ? err.stack : undefined,
              },
            },
            'error',
          );
        }
      }),
    );
  }

  return NextResponse.json({ success: true, ...summary });
}

// ─── Per-coach pipeline ─────────────────────────────────────────────────────

interface CoachResult {
  sent: boolean;
  skipped: boolean;
  reason?: string;
}

async function processCoach(
  supabase: ReturnType<typeof createAdminClient>,
  coach: EligibleCoach,
): Promise<CoachResult> {
  // Collect every player id on any team this coach staffs, so the digest
  // cron isn't bound to a single team (coaches commonly staff JV + varsity).
  const { data: staffTeams, error: teamsErr } = await supabase
    .from('golf_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coach.coach_id);
  if (teamsErr) {
    await logServerError(
      `cron.coachDigest.teams failed: ${teamsErr.message}`,
      {
        action: 'cron.coachDigest.teams',
        featureArea: 'coach-digest',
        extra: { coachId: coach.coach_id, code: teamsErr.code },
      },
      'error',
    );
    return { sent: false, skipped: false, reason: 'teams-query' };
  }

  const teamIds = Array.from(
    new Set((staffTeams ?? []).map((row) => row.team_id).filter(Boolean)),
  );
  if (teamIds.length === 0) {
    return { sent: false, skipped: true, reason: 'no-teams' };
  }

  const { data: memberRows, error: membersErr } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .in('team_id', teamIds)
    .eq('status', 'active');
  if (membersErr) {
    await logServerError(
      `cron.coachDigest.members failed: ${membersErr.message}`,
      {
        action: 'cron.coachDigest.members',
        featureArea: 'coach-digest',
        extra: { coachId: coach.coach_id, code: membersErr.code },
      },
      'error',
    );
    return { sent: false, skipped: false, reason: 'members-query' };
  }

  const playerIds = Array.from(
    new Set((memberRows ?? []).map((row) => row.player_id).filter(Boolean)),
  );
  if (playerIds.length === 0) {
    return { sent: false, skipped: true, reason: 'no-players' };
  }

  const [topRows, celebRows, watchRows] = await Promise.all([
    fetchInsights(supabase, playerIds, ['matured', 'addressed'], 3),
    fetchInsights(supabase, playerIds, ['resolved'], 1),
    fetchInsights(supabase, playerIds, ['detected'], 1),
  ]);

  const topInsights: CoachDigestInsight[] = topRows
    .map(toDigestInsight)
    .filter((x): x is CoachDigestInsight => !!x);

  // Core brief rule: no top insights → don't spam the coach.
  if (topInsights.length === 0) {
    return { sent: false, skipped: true, reason: 'no-insights' };
  }

  const celebration: CoachDigestCelebration | null = celebRows[0]
    ? toDigestCelebrationOrWatch(celebRows[0])
    : null;

  const watch: CoachDigestWatch | null = watchRows[0]
    ? toDigestCelebrationOrWatch(watchRows[0])
    : null;

  const rendered = renderCoachDigest({
    coachName: coachFirstName(coach.coach_full_name),
    teamName: coach.team_name ?? 'your team',
    date: formatDigestDate(new Date()),
    topInsights,
    celebration,
    watch,
  });

  const result = await sendCoachDigest({
    to: coach.coach_email ?? '',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    coachId: coach.coach_id,
  });

  return result;
}

async function fetchInsights(
  supabase: ReturnType<typeof createAdminClient>,
  playerIds: string[],
  lifecycles: string[],
  limit: number,
): Promise<InsightQueryRow[]> {
  const { data, error } = await supabase
    .from('golf_coach_insights')
    .select(`
      id,
      player_id,
      title,
      content,
      evidence,
      lifecycle_state,
      player:golf_players ( first_name, last_name )
    `)
    .in('player_id', playerIds)
    .in('lifecycle_state', lifecycles)
    .neq('status', 'dismissed')
    .not('evidence', 'is', null)
    .order('created_at', { ascending: false })
    .limit(Math.max(limit * 5, 10)); // over-fetch, then rank client-side

  if (error) {
    await logServerError(
      `cron.coachDigest.insights failed: ${error.message}`,
      {
        action: 'cron.coachDigest.insights',
        featureArea: 'coach-digest',
        extra: { lifecycles, code: error.code },
      },
      'error',
    );
    return [];
  }

  const rows = ((data ?? []) as unknown as InsightQueryRow[]).filter((r) => {
    if (!r.title || !r.evidence) return false;
    const ev = r.evidence as Record<string, unknown>;
    return (
      typeof ev.strokes_impact === 'number' && typeof ev.confidence === 'number'
    );
  });

  rows.sort((a, b) => rankScore(b) - rankScore(a));
  return rows.slice(0, limit);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rankScore(row: InsightQueryRow): number {
  const ev = (row.evidence ?? {}) as Record<string, unknown>;
  const impact = Math.abs(Number(ev.strokes_impact ?? 0));
  const confidence = Number(ev.confidence ?? 0);
  return impact * confidence;
}

function playerName(row: InsightQueryRow): string {
  const player = row.player;
  if (!player) return 'Your player';
  const first = player.first_name?.trim() ?? '';
  const last = player.last_name?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  return full || 'Your player';
}

function deepLinkFor(row: InsightQueryRow): string {
  return `/golf/dashboard/players/${row.player_id}#insight-${row.id}`;
}

function toDigestInsight(row: InsightQueryRow): CoachDigestInsight | null {
  if (!row.title) return null;
  const ev = (row.evidence ?? {}) as Record<string, unknown>;
  const strokes = Number(ev.strokes_impact ?? 0);
  return {
    title: row.title,
    content: row.content ?? '',
    player_name: playerName(row),
    strokes_impact: Number.isFinite(strokes) ? strokes : 0,
    deep_link: deepLinkFor(row),
  };
}

function toDigestCelebrationOrWatch(row: InsightQueryRow): {
  title: string;
  player_name: string;
  deep_link: string;
} {
  return {
    title: row.title ?? '',
    player_name: playerName(row),
    deep_link: deepLinkFor(row),
  };
}

function coachFirstName(fullName: string | null): string {
  if (!fullName) return 'Coach';
  const first = fullName.trim().split(/\s+/)[0];
  return first ? `Coach ${first}` : 'Coach';
}

function formatDigestDate(d: Date): string {
  // `Tuesday, April 22` — coach-facing, no year (the digest is today).
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
