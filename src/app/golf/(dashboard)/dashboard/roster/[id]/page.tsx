import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ShineEffect } from '@/components/ui/shine-effect';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { PlayerStatusBadge } from '@/components/golf/roster/PlayerStatusBadge';
import { YearBadge } from '@/components/golf/roster/YearBadge';
import { PlayerStatsSection } from '@/components/golf/profile/PlayerStatsSection';
import {
  IconArrowLeft,
  IconMessage,
  IconMapPin,
  IconFlag,
  IconMail,
  IconPhone,
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

// Helper function to format score to par
function formatScoreToPar(score: number | null): string {
  if (score === null) return '—';
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return String(score);
}

// Stats Loading Skeleton
function StatsSectionSkeleton() {
  return (
    <div className="space-y-6">
      {/* Section header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 bg-warm-200 rounded w-40 animate-pulse" />
          <div className="h-4 bg-warm-200 rounded w-60 mt-2 animate-pulse" />
        </div>
        <div className="h-10 bg-warm-200 rounded w-32 animate-pulse" />
      </div>

      {/* Metrics grid skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass-standard rounded-2xl p-4 animate-pulse">
            <div className="h-7 bg-warm-200 rounded w-16 mx-auto mb-2" />
            <div className="h-4 bg-warm-200 rounded w-12 mx-auto" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="glass-standard rounded-2xl p-6 animate-pulse">
        <div className="h-48 bg-warm-100 rounded-xl" />
      </div>
    </div>
  );
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
      hometown,
      state,
      graduation_year,
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

  // Get recent rounds for display (lightweight query, no shots)
  const { data: recentRounds } = await supabase
    .from('golf_rounds')
    .select(`
      id,
      course_name,
      round_date,
      total_score,
      score_to_par,
      round_type
    `)
    .eq('player_id', id)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .order('round_date', { ascending: false })
    .limit(5);

  const totalRounds = recentRounds?.length || 0;

  return (
    <AnimatedPage className="min-h-full">
      {/* Header with Back Button */}
      <AnimatedItem>
      <div className="border-b border-warm-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <Link
            href="/golf/dashboard/roster"
            className="inline-flex items-center gap-2 text-warm-500 hover:text-warm-700 transition-colors"
          >
            <IconArrowLeft size={16} />
            <span className="text-sm font-medium">Back to Roster</span>
          </Link>
        </div>
      </div>
      </AnimatedItem>

      <AnimatedItem>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Profile Header Card - Compact */}
        <div className="relative glass-standard rounded-2xl overflow-hidden mb-8">
          <ShineEffect />
          <div className="relative p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {player.avatar_url ? (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden ring-2 ring-white shadow-lg">
                    <Image
                      src={player.avatar_url}
                      alt={`${player.first_name} ${player.last_name}`}
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <Avatar
                    name={`${player.first_name} ${player.last_name}`}
                    size="xl"
                    className="w-20 h-20 sm:w-24 sm:h-24 text-2xl"
                  />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-semibold text-warm-900">
                      {player.first_name} {player.last_name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <YearBadge year={player.graduation_year} />
                      <PlayerStatusBadge playerId={player.id} currentStatus={membership.status} />
                    </div>
                    {(player.hometown || player.state) && (
                      <div className="flex items-center gap-1.5 mt-2 text-warm-500">
                        <IconMapPin size={14} />
                        <span className="text-sm">
                          {[player.hometown, player.state].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Contact + Actions */}
                  <div className="flex flex-wrap items-center gap-3">
                    {player.email && (
                      <a
                        href={`mailto:${player.email}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-warm-600 hover:text-warm-900 hover:bg-warm-100 rounded-lg transition-colors"
                        title={player.email}
                      >
                        <IconMail size={14} />
                        <span className="hidden md:inline">Email</span>
                      </a>
                    )}
                    {player.phone && (
                      <a
                        href={`tel:${player.phone}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-warm-600 hover:text-warm-900 hover:bg-warm-100 rounded-lg transition-colors"
                        title={player.phone}
                      >
                        <IconPhone size={14} />
                        <span className="hidden md:inline">Call</span>
                      </a>
                    )}
                    <Link href={`/golf/dashboard/messages?player=${player.id}`}>
                      <Button variant="secondary" size="sm" className="gap-1.5">
                        <IconMessage size={16} />
                        Message
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Member since */}
                <div className="mt-3 text-xs text-warm-400">
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

        {/* Stats Section - Full Width */}
        <Suspense fallback={<StatsSectionSkeleton />}>
          <PlayerStatsSection
            playerId={player.id}
            handicap={player.handicap}
          />
        </Suspense>

        {/* Recent Rounds - Full Width */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-warm-900">Recent Rounds</h2>
            {totalRounds > 0 && (
              <Link
                href={`/golf/dashboard/rounds?player=${player.id}`}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                View All Rounds
              </Link>
            )}
          </div>

          {totalRounds === 0 ? (
            <div className="relative glass-standard rounded-2xl overflow-hidden p-8 md:p-12 text-center">
              <ShineEffect />
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
                  <IconFlag size={20} className="text-warm-400" />
                </div>
                <p className="text-warm-500">No rounds recorded yet</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentRounds?.map((round, index) => (
                <Link
                  key={round.id}
                  href={`/golf/dashboard/rounds/${round.id}`}
                  className="group relative glass-standard rounded-2xl block hover:shadow-md transition-all hover:-translate-y-0.5"
                  style={{
                    animation: 'fadeInUp 0.4s ease-out forwards',
                    animationDelay: `${index * 60}ms`,
                    opacity: 0,
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                    <ShineEffect />
                  </div>
                  <div className="relative p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-warm-900 truncate">
                          {round.course_name || 'Unknown Course'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-warm-500">
                            {round.round_date
                              ? new Date(round.round_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : 'Date unknown'}
                          </span>
                          {round.round_type && (
                            <span className="text-xs px-1.5 py-0.5 bg-warm-100 rounded text-warm-600 capitalize">
                              {round.round_type.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xl font-semibold text-warm-900 tabular-nums">
                          {round.total_score || '—'}
                        </p>
                        <p className={cn(
                          'text-sm font-medium tabular-nums',
                          (round.score_to_par || 0) <= 0 ? 'text-primary-600' : 'text-red-600'
                        )}>
                          {formatScoreToPar(round.score_to_par)}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}
