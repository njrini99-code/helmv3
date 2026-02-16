import { createClient } from '@/lib/supabase/server';
import { ShineEffect } from '@/components/ui/shine-effect';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { IconChevronLeft } from '@/components/icons';
import type { GolfQualifier, GolfQualifierEntry } from '@/lib/types/golf';
import type { Metadata } from 'next';
import { QualifierLeaderboardRealtime } from '@/components/golf/qualifiers/QualifierLeaderboardRealtime';

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
    .single();

  return {
    title: qualifier?.name ? `${qualifier.name} | Helm Sports` : 'Qualifier Details | Helm Sports',
    description: qualifier?.description || 'View live leaderboard and qualifier details for college golf recruiting',
  };
}

export default async function QualifierDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Get qualifier with entries
  const { data: qualifier, error } = await supabase
    .from('golf_qualifiers')
    .select(`
      *,
      entries:golf_qualifier_entries(
        *,
        player:golf_players(id, first_name, last_name)
      )
    `)
    .eq('id', id)
    .single();

  if (error || !qualifier) {
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

  // Get all rounds for this qualifier
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select('player_id, total_score, score_to_par')
    .eq('qualifier_id', id);

  // Calculate leaderboard
  const leaderboard = qualifierData.entries && qualifierData.entries.length > 0
    ? qualifierData.entries.map(entry => {
        const playerRounds = (rounds || []).filter(r => r.player_id === entry.player_id);

        const totalScore = playerRounds.reduce((sum, r) => sum + (r.total_score || 0), 0);
        const totalToPar = playerRounds.reduce((sum, r) => sum + (r.score_to_par || 0), 0);
        const roundsCompleted = playerRounds.length;
        const averageScore = roundsCompleted > 0 ? totalScore / roundsCompleted : 0;

        return {
          playerId: entry.player_id,
          playerName: `${entry.player.first_name} ${entry.player.last_name}`,
          roundsCompleted,
          totalScore,
          totalToPar,
          averageScore,
          isTied: false,
        };
      }).sort((a, b) => {
        // Sort by total score (lower is better)
        if (a.totalScore !== b.totalScore) {
          return a.totalScore - b.totalScore;
        }
        // If tied, sort by rounds completed (more is better for tie-breaking)
        return b.roundsCompleted - a.roundsCompleted;
      })
    : [];

  // Mark ties
  for (let i = 0; i < leaderboard.length; i++) {
    if (i > 0 && leaderboard[i]!.totalScore === leaderboard[i - 1]!.totalScore) {
      leaderboard[i]!.isTied = true;
      leaderboard[i - 1]!.isTied = true;
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'upcoming':
        return 'bg-warm-100 text-warm-700';
      case 'in_progress':
        return 'bg-primary-100 text-primary-700';
      case 'completed':
        return 'bg-warm-100 text-warm-600';
      default:
        return 'bg-warm-100 text-warm-600';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Back Button */}
        <AnimatedItem>
        <Link
          href="/golf/dashboard/qualifiers"
          className="inline-flex items-center gap-2 text-sm text-warm-600 hover:text-warm-900 mb-6"
        >
          <IconChevronLeft size={16} />
          Back to Qualifiers
        </Link>
        </AnimatedItem>

        {/* Qualifier Header */}
        <AnimatedItem>
        <div className="relative glass-standard rounded-2xl overflow-hidden p-6 mb-6">
          <ShineEffect />
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-warm-900 mb-2">
                {qualifierData.name}
              </h1>
              {qualifierData.description && (
                <p className="text-warm-600">{qualifierData.description}</p>
              )}
            </div>
            <span
              className={`px-3 py-1.5 text-sm font-medium rounded-full ${getStatusBadge(
                qualifierData.status || 'upcoming'
              )}`}
            >
              {qualifierData.status || 'upcoming'}
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

            {qualifierData.spots_available && (
              <div>
                <p className="text-sm text-warm-500 mb-1">Spots Available</p>
                <p className="font-medium text-warm-900">{qualifierData.spots_available}</p>
              </div>
            )}

            <div>
              <p className="text-sm text-warm-500 mb-1">Players</p>
              <p className="font-medium text-warm-900">{qualifierData.entries.length}</p>
            </div>

            {qualifierData.entry_deadline && (
              <div>
                <p className="text-sm text-warm-500 mb-1">Entry Deadline</p>
                <p className="font-medium text-warm-900">{formatDate(qualifierData.entry_deadline)}</p>
              </div>
            )}
          </div>

          {qualifierData.course_name && (
            <div className="mt-4 pt-4 border-t border-warm-200">
              <p className="text-sm text-warm-500">Course</p>
              <p className="font-medium text-warm-900">{qualifierData.course_name}</p>
            </div>
          )}
        </div>
        </AnimatedItem>

        {/* Real-time Leaderboard with Bracket/Table Toggle */}
        <AnimatedItem>
        <div className="relative glass-standard rounded-2xl overflow-hidden p-6">
          <ShineEffect />
          <h2 className="text-lg font-semibold text-warm-900 mb-4">Leaderboard</h2>
          <QualifierLeaderboardRealtime
            qualifierId={id}
            numRounds={1}
          />
        </div>
        </AnimatedItem>
      </div>
    </AnimatedPage>
  );
}
