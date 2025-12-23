import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { IconChevronLeft } from '@/components/icons';
import type { GolfQualifier, GolfQualifierEntry, GolfRound } from '@/lib/types/golf';

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

export default async function QualifierDetailPage({ params }: { params: { id: string } }) {
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
    .eq('id', params.id)
    .single();

  if (error || !qualifier) {
    notFound();
  }

  const qualifierData = qualifier as any as QualifierWithEntries;

  // Get all rounds for this qualifier
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select('player_id, total_score, total_to_par')
    .eq('qualifier_id', params.id);

  // Calculate leaderboard
  const leaderboard = qualifierData.entries.map(entry => {
    const playerRounds = (rounds || []).filter(r => r.player_id === entry.player_id);

    const totalScore = playerRounds.reduce((sum, r) => sum + (r.total_score || 0), 0);
    const totalToPar = playerRounds.reduce((sum, r) => sum + (r.total_to_par || 0), 0);
    const roundsCompleted = playerRounds.length;
    const averageScore = roundsCompleted > 0 ? totalScore / roundsCompleted : 0;

    return {
      playerId: entry.player_id,
      playerName: `${entry.player.first_name} ${entry.player.last_name}`,
      roundsCompleted,
      totalScore,
      totalToPar,
      averageScore,
      isTied: entry.is_tied || false,
    };
  }).sort((a, b) => {
    // Sort by total score (lower is better)
    if (a.totalScore !== b.totalScore) {
      return a.totalScore - b.totalScore;
    }
    // If tied, sort by rounds completed (more is better for tie-breaking)
    return b.roundsCompleted - a.roundsCompleted;
  });

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
        return 'bg-blue-100 text-blue-700';
      case 'in_progress':
        return 'bg-green-100 text-green-700';
      case 'completed':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-600';
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
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Back Button */}
        <Link
          href="/golf/dashboard/qualifiers"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <IconChevronLeft size={16} />
          Back to Qualifiers
        </Link>

        {/* Qualifier Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 mb-2">
                {qualifierData.name}
              </h1>
              {qualifierData.description && (
                <p className="text-slate-600">{qualifierData.description}</p>
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-200">
            <div>
              <p className="text-sm text-slate-500 mb-1">Dates</p>
              <p className="font-medium text-slate-900">
                {formatDate(qualifierData.start_date)}
                {qualifierData.end_date && qualifierData.end_date !== qualifierData.start_date && (
                  <> - {formatDate(qualifierData.end_date)}</>
                )}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500 mb-1">Rounds</p>
              <p className="font-medium text-slate-900">{qualifierData.num_rounds}</p>
            </div>

            <div>
              <p className="text-sm text-slate-500 mb-1">Holes/Round</p>
              <p className="font-medium text-slate-900">{qualifierData.holes_per_round}</p>
            </div>

            <div>
              <p className="text-sm text-slate-500 mb-1">Players</p>
              <p className="font-medium text-slate-900">{qualifierData.entries.length}</p>
            </div>
          </div>

          {qualifierData.course_name && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-500">Course</p>
              <p className="font-medium text-slate-900">{qualifierData.course_name}</p>
              {qualifierData.location && (
                <p className="text-sm text-slate-600">{qualifierData.location}</p>
              )}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Leaderboard</h2>
            {qualifierData.show_live_leaderboard && (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-green-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live
              </span>
            )}
          </div>

          {leaderboard.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No entries yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-3 pr-4 text-left text-xs font-semibold text-slate-500 uppercase">Pos</th>
                    <th className="pb-3 pr-4 text-left text-xs font-semibold text-slate-500 uppercase">Player</th>
                    <th className="pb-3 pr-4 text-right text-xs font-semibold text-slate-500 uppercase">Rounds</th>
                    <th className="pb-3 pr-4 text-right text-xs font-semibold text-slate-500 uppercase">Total</th>
                    <th className="pb-3 pr-4 text-right text-xs font-semibold text-slate-500 uppercase">To Par</th>
                    <th className="pb-3 pr-4 text-right text-xs font-semibold text-slate-500 uppercase">Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaderboard.map((entry, index) => {
                    const position = index + 1;
                    const isLeader = position === 1;
                    const showPosition = !entry.isTied || index === 0 || leaderboard[index - 1]!.totalScore !== entry.totalScore;

                    return (
                      <tr
                        key={entry.playerId}
                        className={`hover:bg-slate-50 transition-colors ${
                          isLeader ? 'bg-green-50' : ''
                        }`}
                      >
                        <td className="py-3 pr-4 text-sm">
                          {showPosition ? (
                            <span className={isLeader ? 'font-bold text-green-600' : 'text-slate-600'}>
                              {position}
                              {entry.isTied && 'T'}
                            </span>
                          ) : (
                            <span className="text-slate-600">T</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-sm font-medium text-slate-900">
                          {entry.playerName}
                        </td>
                        <td className="py-3 pr-4 text-sm text-slate-600 text-right">
                          {entry.roundsCompleted} / {qualifierData.num_rounds}
                        </td>
                        <td className="py-3 pr-4 text-sm font-semibold text-slate-900 text-right">
                          {entry.totalScore > 0 ? entry.totalScore : '-'}
                        </td>
                        <td className="py-3 pr-4 text-sm text-slate-600 text-right">
                          {entry.totalToPar !== 0 ? (
                            entry.totalToPar > 0 ? `+${entry.totalToPar}` :
                            entry.totalToPar === 0 ? 'E' :
                            entry.totalToPar
                          ) : '-'}
                        </td>
                        <td className="py-3 pr-4 text-sm text-slate-600 text-right">
                          {entry.averageScore > 0 ? entry.averageScore.toFixed(1) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
