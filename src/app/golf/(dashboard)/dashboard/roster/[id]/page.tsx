import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Shimmer, ShimmerCard } from '@/components/ui/shimmer';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { PlayerStatusBadge } from '@/components/golf/roster/PlayerStatusBadge';
import { YearBadge } from '@/components/golf/roster/YearBadge';
import { PlayerStatsSection } from '@/components/golf/profile/PlayerStatsSection';
import {
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
    .maybeSingle();

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
        <div className="space-y-2">
          <Shimmer className="h-6 w-40" />
          <Shimmer className="h-4 w-60" />
        </div>
        <Shimmer className="h-10 w-32" />
      </div>

      {/* Metrics grid skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <ShimmerCard key={i} staggerIndex={i} className="p-4">
            <div className="space-y-2">
              <Shimmer className="h-7 w-16 mx-auto" />
              <Shimmer className="h-4 w-12 mx-auto" />
            </div>
          </ShimmerCard>
        ))}
      </div>

      {/* Charts skeleton */}
      <ShimmerCard className="p-6">
        <Shimmer className="h-48 w-full rounded-xl" />
      </ShimmerCard>
    </div>
  );
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) redirect('/golf/login');

  const supabase = await createClient();

  // Get the player with team membership verification
  const { data: player } = await supabase
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
    .maybeSingle();

  if (!player) {
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
    .maybeSingle();

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
        <MobileNavHeader
          title={`${player.first_name} ${player.last_name}`}
          backHref="/golf/dashboard/roster"
          backLabel="Roster"
        />
      </AnimatedItem>

      <AnimatedItem>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Profile Header Card - Compact */}
        <div className="relative surface-matte rounded-3xl overflow-clip mb-8">
          <div className="relative p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {player.avatar_url ? (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden ring-1 ring-cream-50">
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
                  <div className="min-w-0">
                    <h1 className="text-2xl font-medium text-warm-900 break-words">
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
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
                        title={player.email}
                      >
                        <IconMail size={14} />
                        <span className="hidden md:inline">Email</span>
                      </a>
                    )}
                    {player.phone && (
                      <a
                        href={`tel:${player.phone}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
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
            <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Recent Rounds</h2>
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
            <EmptyState
              variant="card"
              glass
              icon={<IconFlag size={28} />}
              title="No rounds recorded yet"
              description="Submitted rounds will appear here as this player logs them."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentRounds?.map((round, index) => (
                <Link
                  key={round.id}
                  href={`/golf/dashboard/rounds/${round.id}`}
                  className="group relative surface-matte rounded-3xl block hover:shadow-md transition-all hover:-translate-y-0.5"
                  style={{
                    animation: 'fadeInUp 0.4s ease-out forwards',
                    animationDelay: `${index * 60}ms`,
                    opacity: 0,
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
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
                        <p className="text-[20px] font-medium text-warm-900 tracking-[-0.015em] tabular-nums">
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
