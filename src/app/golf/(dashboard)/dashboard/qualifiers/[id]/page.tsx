import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import type { GolfQualifier, GolfQualifierEntry } from '@/lib/types/golf';
import type { Metadata } from 'next';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayQualifierDetail } from '@/components/fairway/pages/qualifiers/FairwayQualifierDetail';
import { getQualifierRoundCourses } from '@/app/golf/actions/golf';

interface QualifierEntryWithPlayer extends GolfQualifierEntry {
  player: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface QualifierWithEntries extends GolfQualifier {
  entries: QualifierEntryWithPlayer[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: qualifier } = await supabase
    .from('golf_qualifiers')
    .select('name, description')
    .eq('id', id)
    .maybeSingle();

  return {
    title: qualifier?.name ? `${qualifier.name} | Helm Sports` : 'Qualifier Details | Helm Sports',
    description: qualifier?.description || 'View live leaderboard and qualifier details for college golf recruiting',
  };
}

export default async function QualifierDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  const isCoach = !!coach;
  const isPlayer = !!player;

  const supabase = await createClient();

  // Get qualifier with entries
  const { data: qualifier } = await supabase
    .from('golf_qualifiers')
    .select(`
      *,
      entries:golf_qualifier_entries(
        *,
        player:golf_players(id, first_name, last_name)
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (!qualifier) {
    notFound();
  }

  // Validate and type the data properly
  const validEntries = Array.isArray(qualifier.entries)
    ? qualifier.entries.filter((entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        'player' in entry &&
        entry.player !== null &&
        typeof entry.player === 'object' &&
        !('error' in entry.player) &&
        'id' in entry.player &&
        'first_name' in entry.player &&
        'last_name' in entry.player
      )
    : [];

  const qualifierData: QualifierWithEntries = {
    ...qualifier,
    entries: validEntries as unknown as QualifierEntryWithPlayer[]
  };

  // Get all rounds for this qualifier with per-round details
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select('id, player_id, total_score, score_to_par, qualifier_round_number, round_date, course_name, status')
    .eq('qualifier_id', id)
    .eq('status', 'completed')
    .order('qualifier_round_number', { ascending: true });

  // Build per-player round breakdown for the coach view
  const roundBreakdownByPlayer: Record<string, {
    playerName: string;
    rounds: { roundNumber: number; score: number | null; toPar: number | null; date: string; courseName: string }[];
    totalScore: number;
    totalToPar: number;
  }> = {};

  for (const entry of qualifierData.entries) {
    const playerRounds = (rounds || []).filter(r => r.player_id === entry.player_id);
    roundBreakdownByPlayer[entry.player_id] = {
      playerName: `${entry.player.first_name} ${entry.player.last_name}`,
      rounds: playerRounds.map(r => ({
        roundNumber: r.qualifier_round_number || 1,
        score: r.total_score ?? null,
        toPar: r.score_to_par ?? null,
        date: r.round_date,
        courseName: r.course_name || '',
      })),
      totalScore: playerRounds.reduce((sum, r) => sum + (r.total_score || 0), 0),
      totalToPar: playerRounds.reduce((sum, r) => sum + (r.score_to_par || 0), 0),
    };
  }

  // Sort breakdown by totalToPar (ascending)
  const sortedBreakdown = Object.entries(roundBreakdownByPlayer)
    .sort(([, a], [, b]) => {
      if (a.rounds.length === 0 && b.rounds.length > 0) return 1;
      if (a.rounds.length > 0 && b.rounds.length === 0) return -1;
      if (a.rounds.length === 0 && b.rounds.length === 0) return 0;
      if (a.totalToPar !== b.totalToPar) return a.totalToPar - b.totalToPar;
      return a.totalScore - b.totalScore;
    });

  // Find max round number submitted
  const maxRoundNumber = (rounds || []).reduce((max, r) => Math.max(max, r.qualifier_round_number || 1), 0);

  const totalRoundsSubmitted = (rounds || []).length;

  // Check if current player is entered and can play
  const playerEntry = isPlayer && player
    ? qualifierData.entries.find(e => e.player_id === player.id)
    : null;
  const qualifierIsActive = qualifierData.status === 'in_progress' || qualifierData.status === 'upcoming';
  const canPlayRound = !!playerEntry && qualifierIsActive;

  // Honest W29 datum the legacy hides: how many selections are actually made.
  const { count: selectionsCount } = await supabase
    .from('golf_qualifier_selections')
    .select('*', { count: 'exact', head: true })
    .eq('qualifier_id', id);

  // Feature G — the course the coach assigned to each round (if any).
  const roundCourses = await getQualifierRoundCourses(id);

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayQualifierDetail
        qualifierId={id}
        isCoach={isCoach}
        isPlayer={isPlayer}
        name={qualifierData.name || 'Qualifier'}
        status={qualifierData.status || 'upcoming'}
        startDate={qualifierData.start_date}
        endDate={qualifierData.end_date ?? null}
        entryDeadline={qualifierData.entry_deadline ?? null}
        courseName={qualifierData.course_name ?? null}
        spotsAvailable={qualifierData.spots_available ?? null}
        rules={qualifierData.rules ?? null}
        entrantCount={qualifierData.entries.length}
        roundsSubmitted={totalRoundsSubmitted}
        canPlayRound={canPlayRound}
        breakdown={sortedBreakdown}
        maxRoundNumber={maxRoundNumber}
        numRounds={
          // num_rounds is a Feature-G column not yet in the generated types
          // (migration unapplied) — read it defensively.
          typeof (qualifier as { num_rounds?: number }).num_rounds === 'number'
            ? (qualifier as { num_rounds?: number }).num_rounds ?? 1
            : 1
        }
        roundCourses={roundCourses}
        selectionState={qualifierData.selection_state ?? 'open'}
        selectionSlotsTotal={qualifierData.selection_slots_total ?? 0}
        selectionSlotsCoachPick={qualifierData.selection_slots_coach_pick ?? 0}
        selectionsCount={selectionsCount ?? 0}
      />
    </div>
  );
}
