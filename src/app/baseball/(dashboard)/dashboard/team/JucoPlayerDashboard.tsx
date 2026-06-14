'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ShineEffect } from '@/components/ui/shine-effect';
import { StatCard } from '@/components/features/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IconEye,
  IconStar,
  IconMessage,
  IconVideo,
  IconChart,
  IconTarget,
  IconCalendar,
  IconBell,
  IconChevronRight,
  IconBuilding,
  IconArrowRight,
  IconTrendingUp,
  IconTrendingDown,
  IconUsers,
  IconNote,
} from '@/components/icons';
import { getJucoPlayerDashboardData } from '@/app/baseball/actions/player-dashboard';
import type { JucoPlayerDashboardData, SchoolInterest } from '@/app/baseball/actions/player-dashboard';
import { formatRelativeTime } from '@/lib/utils';

interface JucoPlayerDashboardProps {
  playerName: string;
  playerId: string;
}

function SchoolInterestCard({ school }: { school: SchoolInterest }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-warm-100 bg-white hover:border-warm-200 hover:shadow-sm transition-all">
      <div className="w-10 h-10 rounded-lg bg-warm-100 flex items-center justify-center shrink-0">
        <IconBuilding size={16} className="text-warm-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-warm-900 truncate">{school.schoolName}</p>
          {school.isOnWatchlist && (
            <Badge variant="success" className="text-eyebrow px-1.5 py-0">
              <IconStar size={8} className="mr-0.5" />
              Watchlist
            </Badge>
          )}
        </div>
        <p className="text-xs text-warm-500">
          {school.division} • {school.state} • {school.engagementCount} {school.engagementCount === 1 ? 'view' : 'views'}
        </p>
      </div>
    </div>
  );
}

function RecruitingSnapshotCard({
  profileViews,
  profileViewsChange,
  watchlistCount,
  schoolsInterested,
  loading,
}: {
  profileViews: number;
  profileViewsChange: number;
  watchlistCount: number;
  schoolsInterested: SchoolInterest[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="px-6 py-4 border-b border-warm-100/50">
          <Skeleton variant="text" width={180} height={20} />
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="text-center">
                <Skeleton variant="text" width={40} height={28} className="mx-auto mb-1" />
                <Skeleton variant="text" width={60} height={12} className="mx-auto" />
              </div>
            ))}
          </div>
          <Skeleton variant="text" width={120} height={14} className="mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} variant="rectangular" className="w-full h-14 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
            <IconEye size={18} className="text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-warm-900 tracking-tight">Recruiting Activity</h2>
            <p className="text-xs text-warm-500">Who's looking at you</p>
          </div>
        </div>
        <Link 
          href="/baseball/dashboard/analytics" 
          className="text-xs text-warm-500 hover:text-warm-900 flex items-center gap-1 transition-colors group"
        >
          View All <IconChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="p-6">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 pb-6 border-b border-warm-100">
          <div className="text-center">
            <p className="text-2xl font-bold text-warm-900 tabular-nums">{profileViews}</p>
            <p className="text-xs text-warm-500">Profile Views</p>
            {profileViewsChange !== 0 && (
              <div className={`flex items-center justify-center gap-0.5 mt-1 text-xs ${
                profileViewsChange > 0 ? 'text-primary-600' : 'text-red-600'
              }`}>
                {profileViewsChange > 0 ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
                <span>{profileViewsChange > 0 ? '+' : ''}{profileViewsChange}%</span>
              </div>
            )}
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-warm-900 tabular-nums">{watchlistCount}</p>
            <p className="text-xs text-warm-500">On Watchlists</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-warm-900 tabular-nums">{schoolsInterested.length}</p>
            <p className="text-xs text-warm-500">Schools</p>
          </div>
        </div>

        {/* Schools List */}
        {schoolsInterested.length > 0 ? (
          <div className="pt-4">
            <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-3">
              Schools Looking at You
            </h4>
            <div className="space-y-2">
              {schoolsInterested.slice(0, 3).map((school) => (
                <SchoolInterestCard key={school.schoolId} school={school} />
              ))}
            </div>
            <Link href="/baseball/dashboard/journey">
              <Button variant="ghost" size="sm" className="w-full mt-4 text-primary-600">
                View Your Journey <IconArrowRight size={14} className="ml-1" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="pt-4 text-center py-6">
            <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mx-auto mb-3">
              <IconEye size={20} className="text-warm-400" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">No activity yet</h4>
            <p className="text-xs text-warm-500 max-w-[200px] mx-auto">
              When coaches view your profile, you'll see them here
            </p>
            <Link href="/baseball/dashboard/colleges">
              <Button variant="secondary" size="sm" className="mt-4">
                Browse Colleges
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function JucoPlayerDashboard({ playerName, playerId }: JucoPlayerDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<JucoPlayerDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const result = await getJucoPlayerDashboardData();
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }

    fetchData();
  }, [playerId]);

  const firstName = playerName.split(' ')[0];

  return (
    <>
      <Header
        title="Team Dashboard"
        subtitle={`Welcome back, ${firstName}`}
      />
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Row 1: Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {loading ? (
            <>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="glass-standard rounded-xl p-5 animate-pulse">
                  <Skeleton variant="text" width={60} height={12} className="mb-2" />
                  <Skeleton variant="text" width={40} height={24} className="mb-1" />
                  <Skeleton variant="text" width={80} height={10} />
                </div>
              ))}
            </>
          ) : (
            <>
              <StatCard
                label="AVG"
                value={data?.stats.avg 
                  ? `.${Math.round(data.stats.avg * 1000).toString().padStart(3, '0')}`
                  : '---'}
                change={data?.stats.recentTrend === 'up' ? '↑ Trending up' : data?.stats.recentTrend === 'down' ? '↓ Trending down' : 'Batting avg'}
                icon={IconChart}
              />
              <StatCard
                label="OPS"
                value={data?.stats.ops 
                  ? `.${Math.round(data.stats.ops * 1000).toString().padStart(3, '0')}`
                  : '---'}
                change="OBP + SLG"
                icon={IconTrendingUp}
              />
              <StatCard
                label="Dev Plan"
                value={data?.team.devPlanProgress ? `${data.team.devPlanProgress}%` : '---'}
                change={data?.team.nextGoalTitle ? `Next: ${data.team.nextGoalTitle.substring(0, 20)}...` : 'No active plan'}
                icon={IconTarget}
              />
              <StatCard
                label="Messages"
                value={data?.recruitingSnapshot.unreadMessages || 0}
                change="Unread"
                icon={IconMessage}
              />
            </>
          )}
        </div>

        {/* Row 2: Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Team Features */}
          <div className="lg:col-span-2 space-y-6">
            {/* Announcements */}
            <Card variant="glass">
              <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="font-semibold text-warm-900">Team Announcements</h2>
                <Link href="/baseball/dashboard/announcements" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                  View all <IconChevronRight size={14} />
                </Link>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} variant="rectangular" className="w-full h-16 rounded-lg" />
                    ))}
                  </div>
                ) : data?.recentAnnouncements.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                      <IconBell size={24} className="text-warm-400" />
                    </div>
                    <h3 className="text-lg font-medium text-warm-900 mb-2">No announcements</h3>
                    <p className="text-sm text-warm-500 max-w-sm mx-auto">
                      Team announcements from your coach will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data?.recentAnnouncements.map((announcement) => (
                      <Link
                        key={announcement.id}
                        href="/baseball/dashboard/announcements"
                        className="block p-4 border border-warm-200 rounded-lg hover:border-warm-300 hover:bg-warm-50/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-1 h-full min-h-[40px] rounded-full ${
                            announcement.urgency === 'high' ? 'bg-red-500' :
                            announcement.urgency === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-warm-900">{announcement.title}</p>
                            <p className="text-xs text-warm-400 mt-1">
                              {announcement.publishedAt ? formatRelativeTime(announcement.publishedAt) : ''}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            <Card variant="glass">
              <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="font-semibold text-warm-900">Upcoming Events</h2>
                <Link href="/baseball/dashboard/calendar" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                  Calendar <IconChevronRight size={14} />
                </Link>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} variant="rectangular" className="w-full h-14 rounded-lg" />
                    ))}
                  </div>
                ) : data?.upcomingEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                      <IconCalendar size={24} className="text-warm-400" />
                    </div>
                    <h3 className="text-lg font-medium text-warm-900 mb-2">No upcoming events</h3>
                    <p className="text-sm text-warm-500">
                      Team practices and games will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data?.upcomingEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 p-3 border border-warm-200 rounded-lg"
                      >
                        <div className={`w-3 h-3 rounded-full shrink-0 ${
                          event.eventType === 'game' ? 'bg-blue-500' :
                          event.eventType === 'practice' ? 'bg-primary-500' : 'bg-warm-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-warm-900 truncate">{event.title}</p>
                          <p className="text-sm text-warm-500">
                            {new Date(event.startTime).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-xs capitalize">
                          {event.eventType}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link href="/baseball/dashboard/my-stats" className="block">
                <div className="glass-standard rounded-xl p-4 text-center hover:shadow-md transition-shadow">
                  <IconChart size={24} className="text-blue-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-warm-900">My Stats</p>
                </div>
              </Link>
              <Link href="/baseball/dashboard/dev-plan" className="block">
                <div className="glass-standard rounded-xl p-4 text-center hover:shadow-md transition-shadow">
                  <IconNote size={24} className="text-amber-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-warm-900">Dev Plan</p>
                </div>
              </Link>
              <Link href="/baseball/dashboard/videos" className="block">
                <div className="glass-standard rounded-xl p-4 text-center hover:shadow-md transition-shadow">
                  <IconVideo size={24} className="text-purple-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-warm-900">Videos</p>
                </div>
              </Link>
              <Link href="/baseball/dashboard/profile" className="block">
                <div className="glass-standard rounded-xl p-4 text-center hover:shadow-md transition-shadow">
                  <IconUsers size={24} className="text-primary-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-warm-900">Profile</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Right Column - Recruiting Snapshot */}
          <div className="space-y-6">
            <RecruitingSnapshotCard
              profileViews={data?.recruitingSnapshot.profileViews || 0}
              profileViewsChange={data?.recruitingSnapshot.profileViewsChange || 0}
              watchlistCount={data?.recruitingSnapshot.watchlistCount || 0}
              schoolsInterested={data?.recruitingSnapshot.schoolsInterested || []}
              loading={loading}
            />

            {/* Team Info */}
            {data?.team.teamId && (
              <Card variant="glass">
                <CardHeader>
                  <h2 className="font-semibold text-warm-900">Your Team</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-warm-500">Team</span>
                      <span className="text-sm font-medium text-warm-900">{data.team.teamName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-warm-500">Coach</span>
                      <span className="text-sm font-medium text-warm-900">{data.team.coachName || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-warm-500">Roster</span>
                      <span className="text-sm font-medium text-warm-900">{data.team.rosterCount} players</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Switch to Recruiting */}
            <div className="relative glass-standard rounded-2xl p-5 overflow-clip bg-gradient-to-br from-primary-50 to-blue-50 border-primary-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                  <IconTarget size={24} className="text-primary-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-warm-900">Explore Colleges</h3>
                  <p className="text-sm text-warm-600">Find programs that fit you</p>
                </div>
              </div>
              <Link href="/baseball/dashboard/colleges">
                <Button className="w-full mt-4">
                  Browse Colleges <IconArrowRight size={14} className="ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
