import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import type { PlayerQualifierInfo } from '@/app/golf/actions/golf';
import { MyQualifiersClient } from './my-qualifiers-client';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayMyQualifiers } from '@/components/fairway/pages/my-qualifiers';

/**
 * Derive a qualifier's holes-per-round from the player's actual posted rounds
 * (golf_rounds.holes_played) — the most common value wins. Falls back to 18 only
 * when the player has no posted rounds for this qualifier, since the qualifier
 * row no longer stores a holes_per_round column.
 */
function deriveHolesPerRound(
  rounds: Array<{ holes_played: number | null }>,
): number {
  const counts = new Map<number, number>();
  for (const r of rounds) {
    if (typeof r.holes_played === 'number' && r.holes_played > 0) {
      counts.set(r.holes_played, (counts.get(r.holes_played) ?? 0) + 1);
    }
  }
  let best = 18;
  let bestCount = 0;
  for (const [holes, count] of counts) {
    if (count > bestCount) {
      best = holes;
      bestCount = count;
    }
  }
  return best;
}

export default async function MyQualifiersPage() {
  const session = await getGolfSessionProfile();
  if (!session) return redirect('/golf/login');

  const { player } = session;
  if (!player) {
    const { coach } = session;
    if (coach) {
      const coachError = 'This feature is for players only. Coaches can view qualifier results from the qualifiers page.';
      if (isRedesignEnabled())
        return (
          <div className={fairwayScope('min-h-full bg-canvas')}>
            <FairwayMyQualifiers qualifiers={[]} error={coachError} />
          </div>
        );
      return <MyQualifiersClient qualifiers={[]} error={coachError} />;
    }
    return redirect('/golf/player');
  }

  const supabase = await createClient();

  // Get all qualifier entries for this player
  const { data: entries, error: entriesError } = await supabase
    .from('golf_qualifier_entries')
    .select(`
      rounds_completed,
      total_score,
      total_to_par,
      qualifier_id,
      qualifier:golf_qualifiers(
        id,
        name,
        description,
        course_name,
        start_date,
        end_date,
        status
      )
    `)
    .eq('player_id', player.id);

  // If query error or no entries, return empty array
  if (entriesError || !entries || entries.length === 0) {
    if (isRedesignEnabled())
      return (
        <div className={fairwayScope('min-h-full bg-canvas')}>
          <FairwayMyQualifiers qualifiers={[]} />
        </div>
      );
    return <MyQualifiersClient qualifiers={[]} />;
  }

  // Get all qualifier rounds for this player
  const qualifierIds = entries.map(e => e.qualifier_id);
  const { data: roundsData, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('qualifier_id, qualifier_round_number, total_score, score_to_par, holes_played')
    .eq('player_id', player.id)
    .in('qualifier_id', qualifierIds)
    .eq('status', 'completed');

  // On a rounds-fetch error, fall back to the per-entry aggregate columns
  // rather than rendering partial/garbled per-round progress.
  const rounds = roundsError
    ? null
    : ((roundsData as unknown) as Array<{
        qualifier_id: string | null;
        qualifier_round_number: number | null;
        total_score: number | null;
        score_to_par: number | null;
        holes_played: number | null;
      }> | null);

  // Build result with progress info
  type QualifierEntry = {
    qualifier_id: string;
    rounds_completed: number | null;
    total_score: number | null;
    total_to_par: number | null;
    qualifier: {
      id: string;
      name: string;
      description: string | null;
      course_name: string | null;
      start_date: string;
      end_date: string | null;
      status: string;
    } | null;
  };

  const qualifiers: PlayerQualifierInfo[] = (entries as unknown as QualifierEntry[])
    .filter((e) => e.qualifier && typeof e.qualifier === 'object' && !('error' in e.qualifier))
    .map((entry) => {
      const q = entry.qualifier as {
        id: string;
        name: string;
        description: string | null;
        course_name: string | null;
        start_date: string;
        end_date: string | null;
        status: string;
      };

      const qualifierRounds = (rounds || []).filter((r) => r.qualifier_id === q.id);
      const completedRoundNumbers = qualifierRounds
        .filter((r) => r.qualifier_round_number !== null)
        .map((r) => r.qualifier_round_number as number)
        .sort((a, b) => a - b);

      const totalScore = qualifierRounds.reduce((sum, r) => sum + (r.total_score ?? 0), 0);
      const totalToPar = qualifierRounds.reduce((sum, r) => sum + (r.score_to_par ?? 0), 0);
      const roundsCompleted = qualifierRounds.length > 0
        ? qualifierRounds.length
        : (entry.rounds_completed ?? 0);
      // golf_qualifiers no longer carries a num_rounds column (removed 2026-05-27),
      // so the target is INFERRED. For a non-completed qualifier we cannot know the
      // real total, so numRounds === roundsCompleted (i.e. "no remaining target
      // asserted") — NOT roundsCompleted + 1, which made the "Complete" badge
      // unreachable (roundsCompleted >= numRounds was structurally false). For a
      // completed qualifier the posted rounds ARE the full set.
      const numRounds = Math.max(roundsCompleted, q.status === 'completed' ? 1 : 0);
      // holesPerRound is derived from the player's actual posted rounds rather than
      // a removed schema column or a hardcoded 18: use the most common holes_played
      // across this qualifier's rounds, defaulting to 18 only when none are posted.
      const holesPerRound = deriveHolesPerRound(qualifierRounds);

      return {
        id: q.id,
        name: q.name,
        description: q.description,
        courseName: q.course_name,
        location: null,
        numRounds,
        holesPerRound,
        startDate: q.start_date,
        endDate: q.end_date,
        status: (q.status || 'upcoming') as 'upcoming' | 'in_progress' | 'completed',
        showLiveLeaderboard: true,
        roundsCompleted,
        completedRoundNumbers,
        totalScore: qualifierRounds.length > 0 ? totalScore : (entry.total_score ?? null),
        totalToPar: qualifierRounds.length > 0 ? totalToPar : (entry.total_to_par ?? null),
      };
    });

  if (isRedesignEnabled())
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayMyQualifiers qualifiers={qualifiers} />
      </div>
    );

  return <MyQualifiersClient qualifiers={qualifiers} />;
}
