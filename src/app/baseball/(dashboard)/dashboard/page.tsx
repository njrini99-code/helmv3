'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
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
  IconCalendar,
  IconArrowRight,
  IconEye,
  IconActivity,
  IconSearch,
  IconClock,
  IconMapPin,
  IconBuilding,
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useWatchlist } from '@/hooks/use-watchlist';
import { usePlayers } from '@/hooks/use-players';
import { useCoachStats, usePlayerStats } from '@/hooks/use-stats';
import { useActivityFeed, useUpcomingEvents, useEngagementChart, useSavedSearches, usePlayersByState } from '@/hooks/use-dashboard';
import { EngagementChart } from '@/components/dashboard/EngagementChart';
import { USMap } from '@/components/features/us-map';
import { getFullName, formatHeight, getPipelineStageLabel, pluralize, formatRelativeTime } from '@/lib/utils';

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
    <div className={`relative group rounded-2xl bg-white/70 backdrop-blur-xl saturate-150 border border-white/20 shadow-card overflow-hidden transition-all duration-300 hover:shadow-card-hover hover:border-slate-200/50 ${size === 'large' ? 'p-6' : 'p-5'}`}>
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
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
  const { user, coach, player, loading: authLoading } = useAuth();
  const { watchlist } = useWatchlist();
  const { players, loading: playersLoading } = usePlayers({ limit: 5 });
  const { stats: coachStats } = useCoachStats();
  const { stats: playerStats } = usePlayerStats();

  // New dashboard hooks
  const { activities, loading: activitiesLoading } = useActivityFeed(8);
  const { events: upcomingEvents, camps: upcomingCamps, loading: upcomingLoading } = useUpcomingEvents(5);
  const { chartData, loading: chartLoading } = useEngagementChart(7);
  const { searches: savedSearches } = useSavedSearches();
  const { stateCounts, loading: stateCountsLoading } = usePlayersByState();

  // Redirect HS and Showcase coaches to team dashboard
  // They should NOT see the recruiting dashboard
  useEffect(() => {
    if (!authLoading && user?.role === 'coach') {
      if (coach?.coach_type === 'high_school' || coach?.coach_type === 'showcase') {
        router.replace('/baseball/dashboard/team');
      }
    }
  }, [authLoading, user?.role, coach?.coach_type, router]);

  if (authLoading) return <PageLoading />;

  // Show loading while redirecting HS/Showcase coaches
  if (user?.role === 'coach' && (coach?.coach_type === 'high_school' || coach?.coach_type === 'showcase')) {
    return <PageLoading />;
  }

  // Coach Dashboard
  if (user?.role === 'coach') {
    const pipelineCounts = {
      watchlist: watchlist.filter(w => w.pipeline_stage === 'watchlist').length,
      high_priority: watchlist.filter(w => w.pipeline_stage === 'high_priority').length,
      offer_extended: watchlist.filter(w => w.pipeline_stage === 'offer_extended').length,
      committed: watchlist.filter(w => w.pipeline_stage === 'committed').length,
    };

    return (
      <>
        <Header title="Dashboard" subtitle={`Welcome back, ${coach?.full_name?.split(' ')[0] || 'Coach'}`} />
        <div className="p-6 lg:p-8 space-y-6">
          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-min">
            {/* Main Stat - Spans 2 cols */}
            <div className="md:col-span-2 relative group rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/50 p-6 overflow-hidden">
              {/* Glow effect */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <IconTarget size={24} className="text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Total Pipeline</p>
                    <p className="text-4xl font-bold text-white tabular-nums">
                      {coachStats?.watchlistCount || watchlist.length}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-6">
                  {(['watchlist', 'high_priority', 'offer_extended', 'committed'] as const).map((stage) => (
                    <div key={stage} className="text-center p-3 rounded-xl bg-white/5 backdrop-blur-sm">
                      <p className="text-lg font-semibold text-white tabular-nums">{pipelineCounts[stage]}</p>
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
          </div>

          {/* Second Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Recent Players - Large Card */}
            <div className="lg:col-span-2 relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card overflow-hidden">
              {/* Shine effect */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    <IconUsers size={18} className="text-slate-600" />
                  </div>
                  <h2 className="font-semibold text-slate-900 tracking-tight">Recent Players</h2>
                </div>
                <Link href="/baseball/dashboard/discover" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors group">
                  View all <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
              <div className="divide-y divide-slate-100/50">
                {playersLoading ? (
                  <div className="p-6">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-4 py-4 animate-pulse">
                        <div className="w-12 h-12 rounded-full bg-slate-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-1/3 bg-slate-200 rounded" />
                          <div className="h-3 w-1/2 bg-slate-100 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : players.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <IconUsers size={24} className="text-slate-400" />
                    </div>
                    <h3 className="text-base font-medium text-slate-900 mb-1">No players yet</h3>
                    <p className="text-sm text-slate-500 text-center mb-4 max-w-xs">
                      Start discovering players to build your recruiting pipeline
                    </p>
                    <Link href="/baseball/dashboard/discover">
                      <Button size="sm" className="gap-2">
                        <IconSearch size={14} /> Discover Players
                      </Button>
                    </Link>
                  </div>
                ) : (
                  players.slice(0, 5).map((p, index) => (
                    <Link
                      key={p.id}
                      href={`/dashboard/players/${p.id}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-all duration-200 group animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <Avatar name={getFullName(p.first_name, p.last_name)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 group-hover:text-green-600 transition-colors">
                          {p.first_name} {p.last_name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{p.high_school_name} • {p.city}, {p.state}</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <Badge variant="secondary" className="bg-slate-100">{p.primary_position}</Badge>
                          <p className="text-xs text-slate-400 mt-1">{p.grad_year}</p>
                        </div>
                        <IconChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Quick Actions + Upcoming Events */}
            <div className="space-y-4">
              {/* Quick Actions */}
              <div className="relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card p-5 overflow-hidden">
                <div
                  className="absolute inset-x-0 top-0 h-px pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                  }}
                />
                <h3 className="font-semibold text-slate-900 tracking-tight mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <Link href="/baseball/dashboard/discover">
                    <Button variant="secondary" className="w-full justify-start gap-3 bg-slate-50 hover:bg-slate-100 border-0">
                      <IconUsers size={16} /> Discover Players
                    </Button>
                  </Link>
                  <Link href="/baseball/dashboard/messages">
                    <Button variant="secondary" className="w-full justify-start gap-3 bg-slate-50 hover:bg-slate-100 border-0">
                      <IconMessage size={16} /> Send Message
                    </Button>
                  </Link>
                  <Link href="/baseball/dashboard/calendar">
                    <Button variant="secondary" className="w-full justify-start gap-3 bg-slate-50 hover:bg-slate-100 border-0">
                      <IconCalendar size={16} /> Schedule Event
                    </Button>
                  </Link>
                  <Link href="/baseball/dashboard/program">
                    <Button variant="secondary" className="w-full justify-start gap-3 bg-slate-50 hover:bg-slate-100 border-0">
                      <IconBuilding size={16} /> Edit Program Profile
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Upcoming Events Widget */}
              <div className="relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card p-5 overflow-hidden">
                <div
                  className="absolute inset-x-0 top-0 h-px pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                  }}
                />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <IconCalendar size={16} className="text-green-500" />
                    <h3 className="font-semibold text-slate-900 tracking-tight">Upcoming</h3>
                  </div>
                  <Link href="/baseball/dashboard/calendar" className="text-xs text-slate-500 hover:text-slate-900 transition-colors">
                    View all
                  </Link>
                </div>
                <div className="space-y-3">
                  {upcomingLoading ? (
                    <div className="animate-pulse space-y-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-12 bg-slate-100 rounded-lg" />
                      ))}
                    </div>
                  ) : upcomingEvents.length === 0 && upcomingCamps.length === 0 ? (
                    <div className="flex flex-col items-center py-6">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                        <IconCalendar size={18} className="text-slate-400" />
                      </div>
                      <p className="text-sm text-slate-500 mb-3">No upcoming events</p>
                      <Link href="/baseball/dashboard/calendar">
                        <Button variant="secondary" size="sm" className="text-xs">
                          Add Event
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <>
                      {upcomingEvents.slice(0, 3).map(event => (
                        <Link
                          key={event.id}
                          href="/baseball/dashboard/calendar"
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors group"
                        >
                          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <IconClock size={16} className="text-blue-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate group-hover:text-green-600 transition-colors">
                              {event.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {format(new Date(event.start_time), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </Link>
                      ))}
                      {upcomingCamps.slice(0, 2).map(camp => (
                        <Link
                          key={camp.id}
                          href="/baseball/dashboard/camps"
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors group"
                        >
                          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                            <IconTarget size={16} className="text-purple-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate group-hover:text-green-600 transition-colors">
                              {camp.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {format(new Date(camp.start_date), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Third Row - Analytics Chart + Activity Feed + Saved Searches */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Engagement Chart */}
            <div className="lg:col-span-2 relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card overflow-hidden">
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                    <IconChart size={18} className="text-green-600" />
                  </div>
                  <h2 className="font-semibold text-slate-900 tracking-tight">Engagement (7 Days)</h2>
                </div>
                <Link href="/baseball/dashboard/analytics" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors group">
                  Details <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
              <div className="p-6">
                <EngagementChart data={chartData} loading={chartLoading} />
              </div>
            </div>

            {/* Activity Feed */}
            <div className="relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card overflow-hidden">
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
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
                          <p className="text-sm text-slate-900">
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
          <div className="relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
              }}
            />
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
              <Link href="/baseball/dashboard/discover" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors group">
                Discover <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
            <div className="p-6">
              {stateCountsLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-pulse text-slate-400 text-sm">Loading map...</div>
                </div>
              ) : (
                <USMap
                  selectedStates={[]}
                  onStateClick={(state) => {
                    // Navigate to discover with state filter
                    window.location.href = `/baseball/dashboard/discover?state=${state}`;
                  }}
                  stateCounts={stateCounts}
                  className="border-0 p-0 bg-transparent"
                />
              )}
            </div>
          </div>

          {/* Fifth Row - Saved Searches */}
          <div className="relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card p-5 overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-px pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
              }}
            />
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
                    href={`/dashboard/discover?${new URLSearchParams(search.filters as Record<string, string>).toString()}`}
                  >
                    <Badge
                      variant="secondary"
                      className="bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors"
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
                  <p className="text-sm text-slate-600">No saved searches yet</p>
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
            <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
            <div className="relative z-10 flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0 shadow-glow-green">
                <IconTarget size={28} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">
                  Ready to get recruited?
                </h3>
                <p className="text-slate-300">
                  Activate recruiting to make your profile visible to college coaches and unlock powerful features.
                </p>
              </div>
              <Link href="/baseball/dashboard/activate">
                <Button size="lg" className="bg-white text-slate-900 hover:bg-slate-100 shadow-xl px-6">
                  Activate Now <IconArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Profile Card */}
        <div className="relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card p-6 overflow-hidden">
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            }}
          />
          <div className="flex items-center gap-6">
            <Avatar name={getFullName(player?.first_name, player?.last_name)} size="2xl" src={player?.avatar_url} />
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">{player?.first_name} {player?.last_name}</h2>
                  <p className="text-slate-500">{player?.primary_position} • Class of {player?.grad_year}</p>
                  <p className="text-sm text-slate-400 mt-1">{player?.high_school_name} • {player?.city}, {player?.state}</p>
                </div>
                <Link href="/baseball/dashboard/profile">
                  <Button variant="secondary" size="sm" className="gap-2">
                    <IconEdit size={14} /> Edit Profile
                  </Button>
                </Link>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Badge variant={player?.recruiting_activated ? 'success' : 'secondary'}>
                  {player?.recruiting_activated ? 'Recruiting Active' : 'Recruiting Inactive'}
                </Badge>
                <Badge variant="secondary">
                  {player?.profile_completion_percent}% Complete
                </Badge>
                {player?.committed_to && <Badge variant="success">Committed</Badge>}
              </div>
            </div>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BentoStatCard
            label="Profile Views"
            value={playerStats?.profileViews || 0}
            change={playerStats?.profileViewsChange ? `${playerStats.profileViewsChange > 0 ? '+' : ''}${playerStats.profileViewsChange}% vs last week` : 'This week'}
            icon={IconEye}
            iconBg="bg-blue-50"
            iconColor="text-blue-500"
            href="/baseball/dashboard/analytics"
          />
          <BentoStatCard
            label="On Watchlists"
            value={playerStats?.watchlistCount || 0}
            change="Coaches interested"
            icon={IconStar}
            iconBg="bg-amber-50"
            iconColor="text-amber-500"
          />
          <BentoStatCard
            label="Messages"
            value={playerStats?.unreadMessages || 0}
            change={pluralize(playerStats?.unreadMessages || 0, 'unread')}
            icon={IconMessage}
            iconBg="bg-purple-50"
            iconColor="text-purple-500"
            href="/baseball/dashboard/messages"
          />
          <BentoStatCard
            label="Video Views"
            value={playerStats?.videoViews || 0}
            change="Total views"
            icon={IconVideo}
            iconBg="bg-green-50"
            iconColor="text-green-500"
            href="/baseball/dashboard/videos"
          />
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Your Stats */}
          <div className="relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-px pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
              }}
            />
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
                  <div key={stat.label} className="p-4 bg-slate-50/80 rounded-xl border border-slate-100/50 hover:bg-slate-100/80 transition-colors">
                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{stat.label}</p>
                    <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="relative bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-card overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-px pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
              }}
            />
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
