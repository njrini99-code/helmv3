import { createClient } from '@/lib/supabase/server';
import type { PlayerQualifierInfo } from '@/app/golf/actions/golf';
import { MyQualifiersClient } from './my-qualifiers-client';

export default async function MyQualifiersPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <MyQualifiersClient qualifiers={[]} error="You must be signed in" />;
  }

  // Get player record
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return <MyQualifiersClient qualifiers={[]} error="Player profile not found" />;
  }

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
    return <MyQualifiersClient qualifiers={[]} />;
  }

  // Get all qualifier rounds for this player
  const qualifierIds = entries.map(e => e.qualifier_id);
  const { data: roundsData } = await supabase
    .from('golf_rounds')
    .select('qualifier_id, qualifier_round_number, total_score, score_to_par')
    .eq('player_id', player.id)
    .in('qualifier_id', qualifierIds)
    .eq('status', 'completed');

  const rounds = (roundsData as unknown) as Array<{
    qualifier_id: string | null;
    qualifier_round_number: number | null;
    total_score: number | null;
    score_to_par: number | null;
  }> | null;

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

      const totalScore = qualifierRounds.reduce((sum, r) => sum + (r.total_score || 0), 0);
      const totalToPar = qualifierRounds.reduce((sum, r) => sum + (r.score_to_par || 0), 0);
      const roundsCompleted = qualifierRounds.length > 0
        ? qualifierRounds.length
        : (entry.rounds_completed ?? 0);
      const inferredNumRounds = q.status === 'completed'
        ? Math.max(roundsCompleted, 1)
        : Math.max(roundsCompleted + 1, 1);

      return {
        id: q.id,
        name: q.name,
        description: q.description,
        courseName: q.course_name,
        location: null,
        numRounds: inferredNumRounds,
        holesPerRound: 18,
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

  return <MyQualifiersClient qualifiers={qualifiers} />;
}
