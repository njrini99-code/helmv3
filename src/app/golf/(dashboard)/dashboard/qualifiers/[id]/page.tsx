import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ShineEffect } from '@/components/ui/shine-effect';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { IconTrophy } from '@/components/icons';
import type { GolfQualifier, GolfQualifierEntry } from '@/lib/types/golf';
import type { Metadata } from 'next';
import { QualifierLeaderboardRealtime } from '@/components/golf/qualifiers/QualifierLeaderboardRealtime';
import { QualifierRoundBreakdown } from './QualifierRoundBreakdown';

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'upcoming':
        return { className: 'bg-warm-100 text-warm-700', label: 'Upcoming' };
      case 'in_progress':
        return { className: 'bg-primary-100 text-primary-700', label: 'In Progress' };
      case 'completed':
        return { className: 'bg-warm-100 text-warm-600', label: 'Completed' };
      default:
        return { className: 'bg-warm-100 text-warm-600', label: status.replace('_', ' ') };
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const statusBadge = getStatusBadge(qualifierData.status || 'upcoming');
  const totalRoundsSubmitted = (rounds || []).length;

  // Check if current player is entered and can play
  const playerEntry = isPlayer && player
    ? qualifierData.entries.find(e => e.player_id === player.id)
    : null;
  const qualifierIsActive = qualifierData.status === 'in_progress' || qualifierData.status === 'upcoming';
  const canPlayRound = !!playerEntry && qualifierIsActive;

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <AnimatedItem>
        <MobileNavHeader
          title={qualifierData.name || 'Qualifier'}
          backHref={isCoach ? '/golf/dashboard/qualifiers' : '/golf/dashboard/my-qualifiers'}
          backLabel="Qualifiers"
        />
      </AnimatedItem>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Qualifier Header */}
        <AnimatedItem>
        <div className="relative glass-standard rounded-2xl overflow-clip p-6 mb-6">
          <ShineEffect />
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-warm-900 mb-2 truncate">
                {qualifierData.name}
              </h1>
              {qualifierData.description && (
                <p className="text-warm-600">{qualifierData.description}</p>
              )}
            </div>
            <span
              className={`shrink-0 px-3 py-1.5 text-sm font-medium rounded-full ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-warm-200">
            <div>
              <p className="text-sm text-warm-500 mb-1">Dates</p>
              <p className="font-medium text-warm-900">
                {formatDate(qualifierData.start_date)}
                {qualifierData.end_date && qualifierData.end_date !== qualifierData.start_date && (
                  <> - {formatDate(qualifierData.end_date)}</>
                )}
              </p>
            </div>

            <div>
              <p className="text-sm text-warm-500 mb-1">Players</p>
              <p className="font-medium text-warm-900">{qualifierData.entries.length}</p>
            </div>

            <div>
              <p className="text-sm text-warm-500 mb-1">Rounds Submitted</p>
              <p className="font-medium text-warm-900">{totalRoundsSubmitted}</p>
            </div>

            {qualifierData.spots_available && (
              <div>
                <p className="text-sm text-warm-500 mb-1">Spots</p>
                <p className="font-medium text-warm-900">{qualifierData.spots_available}</p>
              </div>
            )}
          </div>

          {qualifierData.course_name && (
            <div className="mt-4 pt-4 border-t border-warm-200">
              <p className="text-sm text-warm-500">Course</p>
              <p className="font-medium text-warm-900">{qualifierData.course_name}</p>
            </div>
          )}

          {/* Player: Play Round CTA */}
          {canPlayRound && (
            <div className="mt-4 pt-4 border-t border-warm-200">
              <Link
                href={`/golf/dashboard/rounds/new?qualifier=${id}`}
                className="inline-flex items-center gap-2 px-5 py-3 bg-primary-600 text-white font-medium text-sm rounded-xl hover:bg-primary-700 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <IconTrophy size={16} />
                Play Qualifier Round
              </Link>
            </div>
          )}
        </div>
        </AnimatedItem>

        {/* Real-time Leaderboard */}
        <AnimatedItem>
        <div className="relative glass-standard rounded-2xl overflow-clip p-6 mb-6">
          <ShineEffect />
          <div className="flex items-center gap-2 mb-4">
            <IconTrophy size={20} className="text-amber-500" />
            <h2 className="text-lg font-semibold text-warm-900">Leaderboard</h2>
          </div>
          <QualifierLeaderboardRealtime
            qualifierId={id}
            numRounds={1}
          />
        </div>
        </AnimatedItem>

        {/* Per-Round Score Breakdown (Coach view) */}
        {isCoach && sortedBreakdown.length > 0 && (
          <AnimatedItem>
            <QualifierRoundBreakdown
              breakdown={sortedBreakdown}
              maxRoundNumber={maxRoundNumber}
            />
          </AnimatedItem>
        )}
      </div>
    </AnimatedPage>
  );
}
