import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ShineEffect } from '@/components/ui/shine-effect';
import { PlayerStatusBadge } from '@/components/golf/roster/PlayerStatusBadge';
import { YearBadge } from '@/components/golf/roster/YearBadge';
import {
  IconArrowLeft,
  IconMessage,
  IconChartBar,
  IconMapPin,
  IconCalendar,
  IconTrophy,
  IconFlag,
  IconTarget,
} from '@/components/icons';
import { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('golf_players')
    .select('first_name, last_name')
    .eq('id', id)
    .single();

  if (!player) {
    return { title: 'Player Not Found | Helm Golf' };
  }

  return {
    title: `${player.first_name} ${player.last_name} | Helm Golf`,
    description: `View ${player.first_name} ${player.last_name}'s golf profile and stats`,
  };
}

// Helper function to format handicap display
function formatHandicap(handicap: number | null): string {
  if (handicap === null) return '—';
  if (handicap > 0) return `+${handicap.toFixed(1)}`;
  return handicap.toFixed(1);
}

// Helper function to format score to par
function formatScoreToPar(score: number | null): string {
  if (score === null) return '—';
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return String(score);
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Verify coach access
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    redirect('/golf/login');
  }

  // Get the player with team membership verification
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select(`
      id,
      first_name,
      last_name,
      avatar_url,
      city,
      state,
      grad_year,
      handicap,
      phone,
      email,
      created_at
    `)
    .eq('id', id)
    .single();

  if (playerError || !player) {
    notFound();
  }

  // Verify player is on coach's team
  let teamId: string | null = null;
  if (coach.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = orgTeam?.id || null;
  }

  if (!teamId) {
    notFound();
  }

  // Check team membership
  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('status')
    .eq('team_id', teamId)
    .eq('player_id', id)
    .single();

  if (!membership) {
    notFound();
  }

  // Get player's rounds with stats
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select(`
      id,
      course_name,
      round_date,
      total_score,
      score_to_par,
      round_type,
      created_at
    `)
    .eq('player_id', id)
    .order('round_date', { ascending: false })
    .limit(10);

  // Calculate stats
  const totalRounds = rounds?.length || 0;
  const avgScore = totalRounds > 0
    ? rounds!.reduce((sum, r) => sum + (r.total_score || 0), 0) / totalRounds
    : 0;
  const avgScoreToPar = totalRounds > 0
    ? rounds!.reduce((sum, r) => sum + (r.score_to_par || 0), 0) / totalRounds
    : 0;
  const bestRound = totalRounds > 0
    ? Math.min(...rounds!.filter(r => r.total_score).map(r => r.total_score!))
    : null;

  return (
    <div className="min-h-screen">
      {/* Header with Back Button */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Link
            href="/golf/dashboard/roster"
            className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors mb-4"
          >
            <IconArrowLeft size={16} />
            <span className="text-sm font-medium">Back to Roster</span>
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Profile Header Card */}
        <div className="relative glass-standard rounded-2xl overflow-hidden mb-8">
          <ShineEffect />
          <div className="relative p-6 md:p-8">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {player.avatar_url ? (
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl overflow-hidden ring-2 ring-white shadow-lg">
                    <Image
                      src={player.avatar_url}
                      alt={`${player.first_name} ${player.last_name}`}
                      width={128}
                      height={128}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <Avatar
                    name={`${player.first_name} ${player.last_name}`}
                    size="xl"
                    className="w-24 h-24 md:w-32 md:h-32 text-3xl"
                  />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
                      {player.first_name} {player.last_name}
                    </h1>
                    <div className="flex items-center gap-2 mt-2">
                      <YearBadge year={player.grad_year} />
                      <PlayerStatusBadge playerId={player.id} currentStatus={membership.status} />
                    </div>
                    {(player.city || player.state) && (
                      <div className="flex items-center gap-1.5 mt-3 text-slate-500">
                        <IconMapPin size={14} />
                        <span className="text-sm">
                          {[player.city, player.state].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Link href={`/golf/dashboard/messages?player=${player.id}`}>
                      <Button variant="secondary" size="sm" className="gap-1.5">
                        <IconMessage size={16} />
                        Message
                      </Button>
                    </Link>
                    <Link href={`/golf/dashboard/stats?player=${player.id}`}>
                      <Button size="sm" className="gap-1.5">
                        <IconChartBar size={16} />
                        View Stats
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Quick Stats Row */}
                <div className="flex items-center gap-6 mt-6 pt-6 border-t border-slate-100">
                  <div>
                    <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {formatHandicap(player.handicap)}
                    </p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide mt-0.5">Handicap</p>
                  </div>
                  <div className="w-px h-10 bg-slate-200" />
                  <div>
                    <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {totalRounds}
                    </p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide mt-0.5">Rounds</p>
                  </div>
                  <div className="w-px h-10 bg-slate-200" />
                  <div>
                    <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {avgScore > 0 ? avgScore.toFixed(1) : '—'}
                    </p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide mt-0.5">Avg Score</p>
                  </div>
                  <div className="w-px h-10 bg-slate-200" />
                  <div>
                    <p className={cn(
                      'text-2xl font-semibold tabular-nums',
                      avgScoreToPar <= 0 ? 'text-emerald-600' : 'text-slate-900'
                    )}>
                      {avgScoreToPar !== 0 ? formatScoreToPar(Math.round(avgScoreToPar * 10) / 10) : '—'}
                    </p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide mt-0.5">vs Par</p>
                  </div>
                  {bestRound && (
                    <>
                      <div className="w-px h-10 bg-slate-200" />
                      <div>
                        <p className="text-2xl font-semibold text-emerald-600 tabular-nums">
                          {bestRound}
                        </p>
                        <p className="text-xs text-slate-400 uppercase tracking-wide mt-0.5">Best Round</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Rounds */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Recent Rounds</h2>
              {totalRounds > 0 && (
                <Link
                  href={`/golf/dashboard/rounds?player=${player.id}`}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  View All
                </Link>
              )}
            </div>

            {totalRounds === 0 ? (
              <div className="relative glass-standard rounded-2xl overflow-hidden p-12 text-center">
                <ShineEffect />
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <IconFlag size={20} className="text-slate-400" />
                  </div>
                  <p className="text-slate-500">No rounds recorded yet</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {rounds?.map((round) => (
                  <Link
                    key={round.id}
                    href={`/golf/dashboard/rounds/${round.id}`}
                    className="group relative glass-standard rounded-xl block hover:shadow-md transition-all"
                  >
                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                      <ShineEffect />
                    </div>
                    <div className="relative flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                          <IconFlag size={18} className="text-slate-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{round.course_name || 'Unknown Course'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm text-slate-500">
                              {round.round_date
                                ? new Date(round.round_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })
                                : 'Date unknown'}
                            </span>
                            {round.round_type && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 capitalize">
                                  {round.round_type.replace('_', ' ')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-semibold text-slate-900 tabular-nums">
                          {round.total_score || '—'}
                        </p>
                        <p className={cn(
                          'text-sm font-medium tabular-nums',
                          (round.score_to_par || 0) <= 0 ? 'text-emerald-600' : 'text-rose-600'
                        )}>
                          {formatScoreToPar(round.score_to_par)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact Info */}
            <div className="relative glass-standard rounded-2xl overflow-hidden">
              <ShineEffect />
              <div className="relative p-5">
                <h3 className="font-semibold text-slate-900 mb-4">Contact Info</h3>
                <div className="space-y-3">
                  {player.email && (
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Email</p>
                      <a
                        href={`mailto:${player.email}`}
                        className="text-sm text-slate-700 hover:text-emerald-600 transition-colors"
                      >
                        {player.email}
                      </a>
                    </div>
                  )}
                  {player.phone && (
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Phone</p>
                      <a
                        href={`tel:${player.phone}`}
                        className="text-sm text-slate-700 hover:text-emerald-600 transition-colors"
                      >
                        {player.phone}
                      </a>
                    </div>
                  )}
                  {!player.email && !player.phone && (
                    <p className="text-sm text-slate-500">No contact info provided</p>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="relative glass-standard rounded-2xl overflow-hidden">
              <ShineEffect />
              <div className="relative p-5">
                <h3 className="font-semibold text-slate-900 mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <Link
                    href={`/golf/dashboard/stats?player=${player.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <IconChartBar size={16} className="text-emerald-600" />
                    </div>
                    <span className="text-sm font-medium text-slate-700">View Full Stats</span>
                  </Link>
                  <Link
                    href={`/golf/dashboard/messages?player=${player.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <IconMessage size={16} className="text-blue-600" />
                    </div>
                    <span className="text-sm font-medium text-slate-700">Send Message</span>
                  </Link>
                  <Link
                    href={`/golf/dashboard/rounds?player=${player.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                      <IconCalendar size={16} className="text-amber-600" />
                    </div>
                    <span className="text-sm font-medium text-slate-700">All Rounds</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Member Since */}
            <div className="text-center text-sm text-slate-400">
              Member since{' '}
              {player.created_at
                ? new Date(player.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })
                : 'Unknown'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
