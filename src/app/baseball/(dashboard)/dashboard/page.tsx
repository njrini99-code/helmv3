'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import {
  IconUsers,
  IconChart,
  IconMessage,
  IconVideo,
  IconChevronRight,
  IconEdit,
  IconTarget,
  IconStar,
  IconArrowRight,
  IconEye,
  IconActivity,
  IconSearch,
  IconMapPin,
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useBaseballCoachDashboard, useBaseballPlayerDashboard } from '@/hooks/use-baseball-dashboard';
import { useSavedSearches, usePlayersByState } from '@/hooks/use-dashboard';
import { EngagementChart } from '@/components/dashboard/EngagementChart';
import { USAMap } from '@/components/coach/discover/USAMap';
import { ShineEffect } from '@/components/ui/shine-effect';
import { HotLeadsSection, PositionNeedsMatrix } from '@/components/baseball/dashboard';
import { getFullName, formatHeight, getPipelineStageLabel, pluralize, formatRelativeTime } from '@/lib/utils';
import type { WatchlistWithPlayer } from '@/lib/types';

// Skeleton for stat cards during loading
function BentoStatSkeleton({ size = 'default' }: { size?: 'default' | 'large' }) {
  return (
    <div className={`glass-standard rounded-2xl overflow-hidden animate-pulse ${size === 'large' ? 'p-6' : 'p-5'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-3.5 bg-slate-200 rounded w-20 mb-3" />
          <div className={`${size === 'large' ? 'h-9' : 'h-7'} bg-slate-200 rounded w-16 mb-2`} />
          <div className="h-3 bg-slate-100 rounded w-28" />
        </div>
        <div className="w-11 h-11 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}

// Animated number component
function AnimatedStat({ value, suffix = '' }: { value: number; suffix?: string }) {
  return (
    <span className="tabular-nums">{value.toLocaleString()}{suffix}</span>
  );
}

// Bento stat card component
function BentoStatCard({
  label,
  value,
  change,
  icon: Icon,
  iconBg = 'bg-slate-100',
  iconColor = 'text-slate-600',
  size = 'default',
  href,
}: {
  label: string;
  value: number | string;
  change?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconBg?: string;
  iconColor?: string;
  size?: 'default' | 'large';
  href?: string;
}) {
  const content = (
    <div className={`relative group glass-standard rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${size === 'large' ? 'p-6' : 'p-5'}`}>
      <ShineEffect />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm leading-relaxed text-slate-500 font-medium">{label}</p>
          <p className={`font-semibold text-slate-900 mt-1 ${size === 'large' ? 'text-3xl' : 'text-2xl'}`}>
            {typeof value === 'number' ? <AnimatedStat value={value} /> : value}
          </p>
          {change && (
            <p className="text-xs text-slate-400 mt-1.5">{change}</p>
          )}
        </div>
        <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} group-hover:scale-110 transition-transform duration-300`}>
          <Icon size={22} />
        </div>
      </div>
      {href && (
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconChevronRight size={16} className="text-slate-400" />
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}


export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, coach, player, loading: authLoading, coachMode } = useAuth();

  // OPTIMIZED: Single consolidated hook replaces 6+ individual hooks
  // Reduces from ~15 sequential queries to 5-6 parallel batches
  const {
    watchlist,
    stats: coachStats,
    activities,
    chartData,
    pipelineCounts,
    loading: coachDashboardLoading,
  } = useBaseballCoachDashboard();

  const { stats: playerStats } = useBaseballPlayerDashboard();

  // These hooks remain separate (localStorage-based / special queries)
  const { searches: savedSearches } = useSavedSearches();
  const { stateCounts, loading: stateCountsLoading } = usePlayersByState(coach?.id, coach?.coach_type);

  // Combined loading state
  const activitiesLoading = coachDashboardLoading;
  const chartLoading = coachDashboardLoading;
  const playersLoading = coachDashboardLoading;

  // Redirect based on coach type and mode
  useEffect(() => {
    if (authLoading) return;

    if (user?.role === 'coach' && coach) {
      switch (coach.coach_type) {
        case 'high_school':
          // HS coaches always go to team dashboard
          router.replace('/baseball/dashboard/team/high-school');
          return;
        case 'showcase':
          // Showcase coaches go to team/org dashboard
          router.replace('/baseball/dashboard/organization');
          return;
        case 'juco':
          // JUCO respects mode toggle
          if (coachMode === 'team') {
            router.replace('/baseball/dashboard/team');
            return;
          }
          // If recruiting mode, continue to show this page
          break;
        case 'college':
          // College coaches see this page (recruiting dashboard)
          break;
        default:
          // Unknown coach type, redirect to team
          router.replace('/baseball/dashboard/team');
          return;
      }
    }
  }, [authLoading, user, coach, coachMode, router, pathname]);

  if (authLoading) return <PageLoading />;

  // Show loading while redirecting
  if (user?.role === 'coach' && coach) {
    if (coach.coach_type === 'high_school' ||
        coach.coach_type === 'showcase' ||
        (coach.coach_type === 'juco' && coachMode === 'team')) {
      return <PageLoading />;
    }
  }

  // Coach Dashboard
  if (user?.role === 'coach') {
    // pipelineCounts now comes from the consolidated hook (already calculated)
    return (
      <>
        <Header title="Dashboard" subtitle={`Welcome back, ${coach?.full_name?.split(' ')[0] || 'Coach'}`} />
        <div className="p-6 lg:p-8 space-y-6">
          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-min">
            {coachDashboardLoading ? (
              <>
                {/* Loading skeleton for the pipeline hero card */}
                <div className="md:col-span-2 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/50 p-6 overflow-hidden animate-pulse">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-white/10" />
                    <div>
                      <div className="h-3.5 bg-white/10 rounded w-24 mb-2" />
                      <div className="h-9 bg-white/10 rounded w-16" />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-6">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="text-center p-3 rounded-xl bg-white/5">
                        <div className="h-5 bg-white/10 rounded w-8 mx-auto mb-1" />
                        <div className="h-3 bg-white/5 rounded w-12 mx-auto" />
                      </div>
                    ))}
                  </div>
                </div>
                <BentoStatSkeleton />
                <BentoStatSkeleton />
              </>
            ) : (
              <>
            {/* Main Stat - Spans 2 cols */}
            <div className="md:col-span-2 relative group rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/50 p-6 overflow-hidden hover:shadow-2xl transition-shadow duration-300">
              {/* Glow effect */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl group-hover:bg-green-500/15 transition-colors duration-500" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <IconTarget size={24} className="text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm leading-relaxed text-slate-400">Total Pipeline</p>
                    <p className="text-4xl font-bold text-white tabular-nums">
                      {coachStats?.watchlistCount || watchlist.length}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6">
                  {(['watchlist', 'high_priority', 'offer_extended', 'committed'] as const).map((stage) => (
                    <div key={stage} className="text-center p-3 rounded-xl bg-white/5 backdrop-blur-sm hover:bg-white/10 active:bg-white/15 transition-colors duration-200">
                      <p className="text-lg font-semibold tracking-tight text-white tabular-nums">{pipelineCounts[stage]}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{getPipelineStageLabel(stage).split(' ')[0]}</p>
                    </div>
                  ))}
                </div>
                <Link
                  href="/baseball/dashboard/pipeline"
                  className="inline-flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300 mt-4 transition-colors"
                >
                  Manage Pipeline <IconArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Profile Views */}
            <BentoStatCard
              label="Profile Views"
              value={coachStats?.profileViews || 0}
              change={coachStats?.profileViewsChange ? `${coachStats.profileViewsChange > 0 ? '+' : ''}${coachStats.profileViewsChange}% vs last week` : 'This week'}
              icon={IconEye}
              iconBg="bg-blue-50"
              iconColor="text-blue-500"
              href="/baseball/dashboard/analytics"
            />

            {/* Messages */}
            <BentoStatCard
              label="Messages"
              value={coachStats?.unreadMessages || 0}
              change={pluralize(coachStats?.unreadMessages || 0, 'unread')}
              icon={IconMessage}
              iconBg="bg-purple-50"
              iconColor="text-purple-500"
              href="/baseball/dashboard/messages"
            />
              </>
            )}
          </div>

          {/* Second Row - Hot Leads + Position Needs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Hot Leads - Replaces Recent Players with actionable intelligence */}
            <HotLeadsSection watchlist={watchlist as WatchlistWithPlayer[]} loading={playersLoading} />

            {/* Position Needs Matrix - Shows recruiting progress by position */}
            <PositionNeedsMatrix watchlist={watchlist as WatchlistWithPlayer[]} loading={playersLoading} />
          </div>

          {/* Third Row - Engagement Chart + Activity Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Engagement Chart */}
            <div className="lg:col-span-2 relative glass-standard rounded-2xl overflow-hidden">
              <ShineEffect />
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                    <IconChart size={18} className="text-green-600" />
                  </div>
                  <h2 className="font-semibold text-slate-900 tracking-tight">Engagement (7 Days)</h2>
                </div>
                <Link href="/baseball/dashboard/analytics" className="text-sm leading-relaxed text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors group">
                  Details <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
              <div className="p-6">
                <EngagementChart data={chartData} loading={chartLoading} />
              </div>
            </div>

            {/* Activity Feed */}
            <div className="relative glass-standard rounded-2xl overflow-hidden">
              <ShineEffect />
              <div className="px-5 py-4 border-b border-slate-100/50">
                <div className="flex items-center gap-2">
                  <IconActivity size={16} className="text-green-500" />
                  <h3 className="font-semibold text-slate-900 tracking-tight">Recent Activity</h3>
                </div>
              </div>
              <div className="divide-y divide-slate-100/50 max-h-[280px] overflow-y-auto">
                {activitiesLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-8 h-8 rounded-full bg-slate-200" />
                        <div className="flex-1 space-y-1">
                          <div className="h-3 bg-slate-200 rounded w-3/4" />
                          <div className="h-2 bg-slate-100 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                      <IconActivity size={20} className="text-slate-400" />
                    </div>
                    <h4 className="text-sm font-medium text-slate-900 mb-1">No activity yet</h4>
                    <p className="text-xs text-slate-500 text-center max-w-[180px]">
                      Activity from your recruiting efforts will appear here
                    </p>
                  </div>
                ) : (
                  activities.map((activity) => (
                    <div key={activity.id} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={getFullName(activity.player?.first_name, activity.player?.last_name)}
                          size="sm"
                          src={activity.player?.avatar_url}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-relaxed text-slate-900">
                            <span className="font-medium">
                              {activity.player?.first_name} {activity.player?.last_name}
                            </span>
                            <span className="text-slate-500">
                              {activity.engagement_type === 'profile_view' && ' viewed'}
                              {activity.engagement_type === 'watchlist_add' && ' added to watchlist'}
                              {activity.engagement_type === 'video_view' && ' video watched'}
                              {activity.engagement_type === 'message_sent' && ' messaged'}
                            </span>
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatRelativeTime(activity.engagement_date)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Fourth Row - Player Distribution Map */}
          <div className="relative glass-standard rounded-2xl overflow-hidden">
            <ShineEffect />
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                  <IconMapPin size={18} className="text-green-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900 tracking-tight">Player Distribution</h2>
                  <p className="text-xs text-slate-500">Recruiting-activated players by state</p>
                </div>
              </div>
              <Link href="/baseball/dashboard/discover" className="text-sm leading-relaxed text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors group">
                Discover <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
            <div className="p-6">
              {stateCountsLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-pulse text-slate-400 text-sm">Loading map...</div>
                </div>
              ) : (
                <USAMap
                  stateData={Object.entries(stateCounts).reduce((acc, [stateCode, count]) => {
                    // State name mapping (full names)
                    const stateNames: Record<string, string> = {
                      'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
                      'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
                      'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
                      'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
                      'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
                      'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
                      'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
                      'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
                      'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
                      'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
                    };
                    acc[stateCode] = { name: stateNames[stateCode] || stateCode, count };
                    return acc;
                  }, {} as Record<string, { name: string; count: number }>)}
                  onStateClick={(state) => {
                    // Navigate to discover with state filter
                    window.location.href = `/baseball/dashboard/discover?state=${state}`;
                  }}
                  className="border-0 p-0 bg-transparent"
                />
              )}
            </div>
          </div>

          {/* Fifth Row - Saved Searches */}
          <div className="relative glass-standard rounded-2xl p-5 overflow-hidden">
            <ShineEffect />
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <IconSearch size={16} className="text-slate-500" />
                <h3 className="font-semibold text-slate-900 tracking-tight">Saved Searches</h3>
              </div>
              <Link href="/baseball/dashboard/discover" className="text-xs text-slate-500 hover:text-slate-900 transition-colors">
                View all
              </Link>
            </div>
            {savedSearches.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {savedSearches.map((search) => (
                  <Link
                    key={search.id}
                    href={`/baseball/dashboard/discover?${new URLSearchParams(search.filters as Record<string, string>).toString()}`}
                  >
                    <Badge
                      variant="secondary"
                      className="bg-slate-100 hover:bg-slate-200 active:bg-slate-300 cursor-pointer transition-colors"
                    >
                      {search.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-4 py-3 px-4 bg-slate-50/80 rounded-xl border border-slate-100/50">
                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                  <IconSearch size={16} className="text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed text-slate-600">No saved searches yet</p>
                  <p className="text-xs text-slate-400">Save filters in Discover to quickly find players</p>
                </div>
                <Link href="/baseball/dashboard/discover">
                  <Button variant="secondary" size="sm" className="text-xs flex-shrink-0">
                    Discover
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // Player Dashboard
  return (
    <>
      <Header title="Dashboard" subtitle={`Welcome back, ${player?.first_name || 'Player'}`} />
      <div className="p-6 lg:p-8 space-y-6">
        {/* Recruiting Activation Banner */}
        {player?.player_type !== 'college' && !player?.recruiting_activated && (
          <div className="relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 p-6 overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-slate-700/20 rounded-full blur-3xl" />
            <div className="relative z-10 flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl glass-subtle flex items-center justify-center flex-shrink-0">
                <IconTarget size={28} className="text-white" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold tracking-tight text-white mb-1 tracking-tight">
                  Ready to get recruited?
                </h3>
                <p className="text-slate-300">
                  Activate recruiting to make your profile visible to college coaches and unlock powerful features.
                </p>
              </div>
              <Link href="/baseball/dashboard/activate">
                <Button size="lg" className="bg-white text-slate-900 hover:bg-slate-100 transition-colors active:bg-slate-200 shadow-xl px-6">
                  Activate Now <IconArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Profile Card */}
        <div className="relative glass-standard rounded-2xl p-6 overflow-hidden">
          <ShineEffect />
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <Avatar name={getFullName(player?.first_name, player?.last_name)} size="2xl" src={player?.avatar_url} />
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{player?.first_name} {player?.last_name}</h2>
                  <p className="text-slate-500">{player?.primary_position} • Class of {player?.grad_year}</p>
                  <p className="text-sm leading-relaxed text-slate-400 mt-1">{player?.high_school_name} • {player?.city}, {player?.state}</p>
                </div>
                <Link href="/baseball/dashboard/profile">
                  <Button variant="secondary" size="sm" className="gap-2">
                    <IconEdit size={14} /> Edit Profile
                  </Button>
                </Link>
              </div>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Badge variant={player?.recruiting_activated ? 'success' : 'secondary'}>
                  {player?.recruiting_activated ? 'Recruiting Active' : 'Recruiting Inactive'}
                </Badge>
                <Badge variant="secondary">
                  {player?.profile_completion_percent}% Complete
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {!playerStats ? (
            <>
              <BentoStatSkeleton />
              <BentoStatSkeleton />
              <BentoStatSkeleton />
              <BentoStatSkeleton />
            </>
          ) : (
            <>
              <BentoStatCard
                label="Profile Views"
                value={playerStats.profileViews || 0}
                change={playerStats.profileViewsChange ? `${playerStats.profileViewsChange > 0 ? '+' : ''}${playerStats.profileViewsChange}% vs last week` : 'This week'}
                icon={IconEye}
                iconBg="bg-blue-50"
                iconColor="text-blue-500"
                href="/baseball/dashboard/analytics"
              />
              <BentoStatCard
                label="On Watchlists"
                value={playerStats.watchlistCount || 0}
                change="Coaches interested"
                icon={IconStar}
                iconBg="bg-amber-50"
                iconColor="text-amber-500"
              />
              <BentoStatCard
                label="Messages"
                value={playerStats.unreadMessages || 0}
                change={pluralize(playerStats.unreadMessages || 0, 'unread')}
                icon={IconMessage}
                iconBg="bg-purple-50"
                iconColor="text-purple-500"
                href="/baseball/dashboard/messages"
              />
              <BentoStatCard
                label="Video Views"
                value={playerStats.videoViews || 0}
                change="Total views"
                icon={IconVideo}
                iconBg="bg-green-50"
                iconColor="text-green-500"
                href="/baseball/dashboard/videos"
              />
            </>
          )}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Your Stats */}
          <div className="relative glass-standard rounded-2xl overflow-hidden">
            <ShineEffect />
            <div className="px-6 py-4 border-b border-slate-100/50">
              <h2 className="font-semibold text-slate-900 tracking-tight">Your Stats</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Height', value: formatHeight(player?.height_feet, player?.height_inches) },
                  { label: 'Weight', value: player?.weight_lbs ? `${player.weight_lbs} lbs` : '—' },
                  { label: player?.pitch_velo ? 'Pitch Velo' : 'Exit Velo', value: `${player?.pitch_velo || player?.exit_velo || '—'}${(player?.pitch_velo || player?.exit_velo) ? ' mph' : ''}` },
                  { label: 'GPA', value: player?.gpa?.toFixed(2) || '—' },
                ].map((stat) => (
                  <div key={stat.label} className="p-4 bg-slate-50/80 rounded-xl border border-slate-100/50 hover:bg-slate-100/80 hover:scale-[1.02] hover:shadow-sm transition-all duration-200">
                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{stat.label}</p>
                    <p className="text-xl font-semibold tracking-tight text-slate-900 mt-1 tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="relative glass-standard rounded-2xl overflow-hidden">
            <ShineEffect />
            <div className="px-6 py-4 border-b border-slate-100/50">
              <h2 className="font-semibold text-slate-900 tracking-tight">Quick Actions</h2>
            </div>
            <div className="p-6 space-y-3">
              {[
                { href: '/baseball/dashboard/profile', icon: IconEdit, label: 'Complete your profile', description: 'Add stats, videos, and more' },
                { href: '/baseball/dashboard/colleges', icon: IconUsers, label: 'Browse colleges', description: 'Discover programs that fit you' },
                { href: '/baseball/dashboard/messages', icon: IconMessage, label: 'Check messages', description: 'Stay connected with coaches' },
              ].map((action) => (
                <Link key={action.href} href={action.href}>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50/80 border border-slate-100/50 hover:bg-slate-100/80 hover:border-slate-200/50 transition-all duration-200 group cursor-pointer">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                      <action.icon size={18} className="text-slate-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900 group-hover:text-green-600 transition-colors">{action.label}</p>
                      <p className="text-xs text-slate-500">{action.description}</p>
                    </div>
                    <IconChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
