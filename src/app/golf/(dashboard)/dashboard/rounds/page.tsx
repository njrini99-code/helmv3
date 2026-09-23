import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import type { GolfRound } from '@/lib/types/golf';
import type { Metadata } from 'next';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerException } from '@/lib/server-error-logger';
import { withCanonicalRoundTotal } from '@/lib/golf/round-total';
import {
  FairwayRoundsLibrary,
  type RoundLibraryRound as FairwayRoundLibraryRound,
} from '@/components/fairway/pages/rounds/FairwayRoundsLibrary';

export const metadata: Metadata = {
  title: 'Rounds | Helm Golf',
  description: 'View and manage all golf rounds for your team. Track scores, stats, and player performance over time.',
};

// Rounds are player-specific and should reflect new saves/completions immediately.
export const dynamic = 'force-dynamic';

interface RoundWithPlayer extends GolfRound {
  player: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

export default async function RoundsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { role: userRole, coach, player } = session;
  if (!userRole) redirect('/golf/login');

  const supabase = await createClient();

  // Fetch rounds based on role
  let rounds: RoundWithPlayer[] = [];
  let inProgressRounds: RoundWithPlayer[] = [];

  // Get team_id from organization if coach (deterministic: handles orgs with
  // >1 team)
  let teamId: string | null = null;
  if (coach?.organization_id) {
    try {
      teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
    } catch (error) {
      void logServerException(error, { action: 'rounds-teamid-load', route: '/golf/dashboard/rounds', source: 'server_component', sport: 'golf' }, 'warning');
      // Network failure — proceed with null teamId
    }
  }

  const playerSelectFields = `
    id,
    course_name,
    course_city,
    course_state,
    round_date,
    round_type,
    total_score,
    score_to_par,
    front_nine,
    back_nine,
    total_putts,
    total_fairways,
    total_fairways_hit,
    total_gir,
    total_gir_possible,
    status,
    holes_played,
    player:golf_players(first_name, last_name, avatar_url)
  `;

  const inProgressSelectFields = `
    id,
    course_name,
    course_city,
    course_state,
    round_date,
    round_type,
    total_score,
    score_to_par,
    current_hole,
    holes_played,
    updated_at,
    created_at,
    player:golf_players(first_name, last_name, avatar_url)
  `;

  if (userRole === 'coach' && teamId) {
    let teamMembers: { player_id: string }[] | null = null;
    try {
      const result = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId)
        .eq('status', 'active');

      // The `error` is READ. The try/catch only ever caught a THROWN failure,
      // but supabase-js RESOLVES one as { data: null, error } — so the catch
      // never ran, teamMembers came back null, teamPlayerIds was [], and the
      // `if (teamPlayerIds.length > 0)` guard below skipped the protected fetch
      // entirely. The coach got an empty rounds list for their whole team, which
      // is precisely what the P425 comment below says must never happen; the
      // throw-on-error it added never got the chance to fire.
      if (result.error) {
        throw new Error(`Failed to load team roster: ${result.error.message}`);
      }

      teamMembers = result.data;
    } catch (error) {
      void logServerException(error, { action: 'rounds-teammembers-load', route: '/golf/dashboard/rounds', source: 'server_component', sport: 'golf' }, 'warning');
      // Surfaced, not swallowed: an empty roster read must not masquerade as a
      // team with no rounds. A team that genuinely has no active members still
      // resolves to [] with no error and renders the honest empty list.
      throw error;
    }

    const teamPlayerIds = teamMembers?.map(tm => tm.player_id) || [];

    if (teamPlayerIds.length > 0) {
      // P425: surface a real fetch failure (route error.tsx offers retry) instead
      // of silently leaving the list empty — an empty rounds list must mean "no
      // rounds", never "the query failed".
      const { data: completedData, error } = await fetchAllRowsResult((from, to) =>
        supabase
          .from('golf_rounds')
          .select(playerSelectFields)
          .in('player_id', teamPlayerIds)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );
      if (error) throw new Error(`Failed to load team rounds: ${error.message}`);

      // Finding #1/#4/#5 (AUDIT-0724): correct total_score/score_to_par ONCE
      // here — front_nine+back_nine over the sometimes-stale total_score column
      // (see src/lib/golf/round-total.ts) — so the rounds library list AND the
      // roundStats aggregate below (avg/best/avgToPar) both read the same
      // canonical value, matching the round detail page and the Stats page.
      rounds = (completedData ?? []).map(r => ({
        ...withCanonicalRoundTotal(r),
        player: r.player && !('error' in r.player) ? r.player : null
      })) as RoundWithPlayer[];
    }
  } else if (userRole === 'player' && player) {
    let inProgressData: typeof inProgressRounds = [];
    // P425: surface real failures (route error.tsx offers retry) — never mask a
    // fetch error as an empty rounds list.
    const [completedResult, inProgressResult] = await Promise.all([
      fetchAllRowsResult((from, to) =>
        supabase
          .from('golf_rounds')
          .select(playerSelectFields)
          .eq('player_id', player.id)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      ),
      supabase
        .from('golf_rounds')
        .select(inProgressSelectFields)
        .eq('player_id', player.id)
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false }),
    ]);
    if (completedResult.error) throw new Error(`Failed to load rounds: ${completedResult.error.message}`);
    if (inProgressResult.error) throw new Error(`Failed to load in-progress rounds: ${inProgressResult.error.message}`);

    // Finding #1/#4/#5 (AUDIT-0724): same correction as the coach branch above.
    rounds = (completedResult.data ?? []).map(r => ({
      ...withCanonicalRoundTotal(r),
      player: r.player && !('error' in r.player) ? r.player : null
    })) as RoundWithPlayer[];

    inProgressData = (inProgressResult.data ?? []) as typeof inProgressRounds;

    // R8: "ready to submit" — every hole already carries a durable score, so
    // the round is stuck holding a completed scorecard, not mid-tracking
    // (most commonly a final submit that was attempted and never confirmed
    // committed — but this reads durable per-hole state, not a marker of
    // that specific cause; see below). Deliberately reads `golf_holes`
    // directly (the SAME source `continue-round-client.tsx`'s own mount
    // effect checks via `hasAllHolesScored`) rather than
    // `draft_data.submissionBackup`: every `savePartialRound` write REPLACES
    // `draft_data` wholesale (it does not merge), so a backup marker written
    // by a failed submit is wiped by the very next autosave tick if the
    // player stays on the page. Durable per-hole scores have no such
    // fragility. Paginated per `.claude/rules/database.md` (anything over
    // rounds/shots/holes must not trust PostgREST's 1,000-row cap).
    const inProgressIds = inProgressData.map((r) => r.id).filter((id): id is string => Boolean(id));
    const readyToSubmitIds = new Set<string>();
    if (inProgressIds.length > 0) {
      const { data: holeRows, error: holeRowsError } = await fetchAllRowsResult((from, to) =>
        supabase
          .from('golf_holes')
          .select('round_id, score')
          .in('round_id', inProgressIds)
          .order('id', { ascending: true })
          .range(from, to)
      );
      if (holeRowsError) {
        // Display-only enhancement, not the round data itself — fail open
        // (no round marked "ready to submit") rather than breaking the whole
        // rounds page over it.
        await logServerException(
          new Error(`Failed to load hole completeness for in-progress rounds: ${holeRowsError.message}`),
          { action: 'rounds-ready-to-submit-load', route: '/golf/dashboard/rounds', source: 'server_component', sport: 'golf' },
          'warning',
        );
      } else {
        // A completed round already occupies this exact course/date — never
        // nudge the player to submit a SECOND finished round onto the same
        // day. What happens to an existing stranded duplicate like that is
        // an owner decision (R8 plan), not something this label should push
        // toward on its own. Matched the same way the production duplicates
        // were found: course name (or id, once selected) + round date.
        const completedCourseDateKeys = new Set(
          rounds.map((r) => `${r.course_name ?? ''}|${r.round_date}`)
        );
        const scoredCountByRound = new Map<string, number>();
        for (const h of holeRows ?? []) {
          if (h.score != null && h.round_id) {
            scoredCountByRound.set(h.round_id, (scoredCountByRound.get(h.round_id) ?? 0) + 1);
          }
        }
        for (const r of inProgressData) {
          const target = r.holes_played ?? 18;
          const hasCompletedSibling = completedCourseDateKeys.has(`${r.course_name ?? ''}|${r.round_date}`);
          if (target > 0 && !hasCompletedSibling && (scoredCountByRound.get(r.id) ?? 0) >= target) {
            readyToSubmitIds.add(r.id);
          }
        }
      }
    }

    // Show ALL in-progress rounds (including setup-only drafts without shots)
    inProgressRounds = (inProgressData ?? []).map(r => ({
      ...r,
      player: r.player && !('error' in r.player) ? r.player : null,
      hasPendingSubmission: readyToSubmitIds.has(r.id),
    })) as RoundWithPlayer[];
  }

  // Calculate round statistics summary — normalize 9-hole rounds to 18-hole equivalents
  const roundStats = (() => {
    if (rounds.length === 0) return null;
    type RoundWithHoles = typeof rounds[number] & { holes_played?: number | null };
    const scoredRounds = (rounds as RoundWithHoles[]).filter(r => r.total_score !== null && r.total_score > 0);
    const toParScores = rounds.map(r => r.score_to_par).filter((s): s is number => s !== null);
    if (scoredRounds.length === 0) return null;

    // Normalize scoring to 18-hole equivalent
    let totalStrokes = 0;
    let totalHoles = 0;
    const normalizedScores: number[] = [];
    for (const r of scoredRounds) {
      const hp = r.holes_played ?? 18;
      if (hp <= 0) continue;
      totalStrokes += r.total_score!;
      totalHoles += hp;
      normalizedScores.push(Math.round(r.total_score! * (18 / hp)));
    }
    const avg = totalHoles > 0 ? (totalStrokes / totalHoles) * 18 : 0;
    const best = Math.min(...normalizedScores);
    const avgToPar = toParScores.length > 0 ? toParScores.reduce((a, b) => a + b, 0) / toParScores.length : null;
    const underParCount = toParScores.filter(s => s < 0).length;
    const underParPct = toParScores.length > 0 ? Math.round((underParCount / toParScores.length) * 100) : 0;

    // Trend: compare last 5 vs previous 5 using normalized scores
    let trend: 'improving' | 'declining' | 'stable' | null = null;
    if (normalizedScores.length >= 6) {
      const recent5 = normalizedScores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const prev5 = normalizedScores.slice(5, 10).reduce((a, b) => a + b, 0) / Math.min(5, normalizedScores.length - 5);
      if (recent5 < prev5 - 0.5) trend = 'improving';
      else if (recent5 > prev5 + 0.5) trend = 'declining';
      else trend = 'stable';
    }

    return { avg, best, avgToPar, underParPct, totalRounds: scoredRounds.length, trend };
  })();

  // Reuses the SAME server queries + roundStats computed above verbatim —
  // this is a re-skin only. Renders in its own `.fairway-ds` scope on
  // bg-canvas.
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayRoundsLibrary
        rounds={rounds as unknown as FairwayRoundLibraryRound[]}
        inProgressRounds={inProgressRounds as unknown as FairwayRoundLibraryRound[]}
        userRole={userRole as 'coach' | 'player'}
        playerId={player?.id}
        stats={roundStats}
      />
    </div>
  );
}
