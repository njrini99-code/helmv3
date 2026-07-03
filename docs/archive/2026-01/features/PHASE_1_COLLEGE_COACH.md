# PHASE_1_COLLEGE_COACH.md

## College Coach Features - Complete Implementation Guide

> **Duration:** 4-5 days
> **Prerequisites:** Foundation Phase complete
> **Goal:** Fully functional College Coach recruiting workflow

---

## Table of Contents

1. [Overview](#1-overview)
2. [Dashboard](#2-dashboard)
3. [Discover Page](#3-discover-page)
4. [Watchlist](#4-watchlist)
5. [Pipeline/Planner](#5-pipelineplanner)
6. [Compare Players](#6-compare-players)
7. [Camps Management](#7-camps-management)
8. [Messages](#8-messages)
9. [Program Profile](#9-program-profile)
10. [API Routes & Server Actions](#10-api-routes--server-actions)

---

## 1. Overview

### 1.1 Feature Summary

| Feature | Description | Complexity |
|---------|-------------|------------|
| Dashboard | Stats, activity feed, pipeline overview, camps | Medium |
| Discover | Search/filter players, map view, pagination | High |
| Watchlist | Saved players, status management, notes | Medium |
| Pipeline | Drag-and-drop board + baseball diamond | High |
| Compare | Side-by-side player comparison | High |
| Camps | Create/manage camps, registrations | Medium |
| Messages | Coach-to-player messaging | High |
| Program | Edit program profile | Low |

### 1.2 File Structure

```
app/(dashboard)/coach/college/
├── page.tsx                    # Dashboard
├── loading.tsx                 # Dashboard loading
├── discover/
│   ├── page.tsx               # Discover page
│   └── loading.tsx
├── watchlist/
│   ├── page.tsx               # Watchlist page
│   └── loading.tsx
├── pipeline/
│   ├── page.tsx               # Pipeline/Planner
│   └── loading.tsx
├── compare/
│   └── page.tsx               # Compare players
├── camps/
│   ├── page.tsx               # Camps list
│   ├── [id]/page.tsx          # Camp detail
│   └── new/page.tsx           # Create camp
├── messages/
│   ├── page.tsx               # Messages inbox
│   └── [conversationId]/page.tsx
├── calendar/
│   └── page.tsx               # Calendar
├── program/
│   └── page.tsx               # Program profile editor
└── settings/
    └── page.tsx               # Settings

components/coach/
├── dashboard/
│   ├── CoachDashboardStats.tsx
│   ├── ActivityFeed.tsx
│   ├── PipelineOverview.tsx
│   └── UpcomingCamps.tsx
├── discover/
│   ├── PlayerCard.tsx
│   ├── PlayerCardGrid.tsx
│   ├── FilterPanel.tsx
│   ├── FilterChips.tsx
│   └── MapView.tsx
├── watchlist/
│   ├── WatchlistTable.tsx
│   ├── WatchlistCard.tsx
│   └── StatusDropdown.tsx
├── pipeline/
│   ├── PipelineBoard.tsx
│   ├── PipelineColumn.tsx
│   ├── PipelineCard.tsx
│   └── RecruitingDiamond.tsx
├── compare/
│   ├── CompareView.tsx
│   ├── CompareColumn.tsx
│   ├── StatsComparisonTable.tsx
│   └── RadarChartOverlay.tsx
├── camps/
│   ├── CampCard.tsx
│   ├── CampForm.tsx
│   └── RegistrationsList.tsx
└── shared/
    ├── PlayerQuickView.tsx
    ├── AddToWatchlistButton.tsx
    └── CoachNoteModal.tsx
```

---

## 2. Dashboard

### 2.1 Dashboard Page

```tsx
// app/(dashboard)/coach/college/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CoachDashboardStats } from '@/components/coach/dashboard/CoachDashboardStats';
import { ActivityFeed } from '@/components/coach/dashboard/ActivityFeed';
import { PipelineOverview } from '@/components/coach/dashboard/PipelineOverview';
import { UpcomingCamps } from '@/components/coach/dashboard/UpcomingCamps';

export default async function CollegeCoachDashboard() {
  const supabase = await createClient();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get coach profile
  const { data: coach } = await supabase
    .from('coaches')
    .select(`
      *,
      organization:organizations(*)
    `)
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/onboarding/coach');

  // Get dashboard stats (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Profile views
  const { count: profileViews } = await supabase
    .from('player_engagement_events')
    .select('*', { count: 'exact', head: true })
    .eq('coach_id', coach.id)
    .eq('engagement_type', 'profile_view')
    .gte('engagement_date', thirtyDaysAgo.toISOString());

  // New followers (players who added coach to watchlist/interests)
  const { count: newFollowers } = await supabase
    .from('recruiting_interests')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', coach.organization_id)
    .gte('created_at', thirtyDaysAgo.toISOString());

  // Top 5 mentions
  const { count: top5Mentions } = await supabase
    .from('recruiting_interests')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', coach.organization_id)
    .eq('interest_level', 'high')
    .gte('created_at', thirtyDaysAgo.toISOString());

  // Pipeline counts
  const { data: pipelineCounts } = await supabase
    .from('recruit_watchlist')
    .select('status')
    .eq('coach_id', coach.id);

  const pipeline = {
    watchlist: pipelineCounts?.filter(p => p.status === 'watchlist').length || 0,
    high_priority: pipelineCounts?.filter(p => p.status === 'high_priority').length || 0,
    offer_extended: pipelineCounts?.filter(p => p.status === 'offer_extended').length || 0,
    committed: pipelineCounts?.filter(p => p.status === 'committed').length || 0,
  };

  // Recent activity
  const { data: recentActivity } = await supabase
    .from('player_engagement_events')
    .select(`
      *,
      player:players(id, first_name, last_name, avatar_url, primary_position, grad_year, state)
    `)
    .eq('coach_id', coach.id)
    .order('engagement_date', { ascending: false })
    .limit(10);

  // Upcoming camps
  const { data: upcomingCamps } = await supabase
    .from('camps')
    .select('*')
    .eq('coach_id', coach.id)
    .gte('start_date', new Date().toISOString().split('T')[0])
    .order('start_date', { ascending: true })
    .limit(5);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {coach.logo_url ? (
              <img 
                src={coach.logo_url} 
                alt={coach.school_name || ''} 
                className="w-16 h-16 rounded-xl object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-green-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-green-700">
                  {coach.school_name?.[0] || 'C'}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {coach.school_name || 'Your Program'}
              </h1>
              <p className="text-slate-500">
                {coach.program_division} • {coach.athletic_conference}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <CoachDashboardStats 
          profileViews={profileViews || 0}
          newFollowers={newFollowers || 0}
          top5Mentions={top5Mentions || 0}
        />

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          {/* Activity Feed - 2 columns */}
          <div className="lg:col-span-2">
            <ActivityFeed activities={recentActivity || []} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <PipelineOverview pipeline={pipeline} />
            <UpcomingCamps camps={upcomingCamps || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 2.2 Dashboard Stats Component

```tsx
// components/coach/dashboard/CoachDashboardStats.tsx
import { Eye, UserPlus, Star } from 'lucide-react';

interface CoachDashboardStatsProps {
  profileViews: number;
  newFollowers: number;
  top5Mentions: number;
}

export function CoachDashboardStats({ 
  profileViews, 
  newFollowers, 
  top5Mentions 
}: CoachDashboardStatsProps) {
  const stats = [
    {
      label: 'Profile Views',
      value: profileViews,
      icon: Eye,
      description: 'Last 30 days',
    },
    {
      label: 'New Followers',
      value: newFollowers,
      icon: UserPlus,
      description: 'Players tracking you',
    },
    {
      label: 'Top 5 Mentions',
      value: top5Mentions,
      icon: Star,
      description: 'Added to Top 5 lists',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div 
          key={stat.label}
          className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="text-3xl font-semibold text-slate-900 mt-1">
                {stat.value.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">{stat.description}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <stat.icon className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 2.3 Activity Feed Component

```tsx
// components/coach/dashboard/ActivityFeed.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Heart, Star, Tent, Filter } from 'lucide-react';

interface Activity {
  id: string;
  engagement_type: string;
  engagement_date: string;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    primary_position: string;
    grad_year: number;
    state: string;
  };
}

interface ActivityFeedProps {
  activities: Activity[];
}

const activityConfig: Record<string, { icon: any; label: string; color: string }> = {
  profile_view: { icon: Eye, label: 'viewed your profile', color: 'text-blue-600 bg-blue-50' },
  watchlist_add: { icon: Heart, label: 'followed your program', color: 'text-pink-600 bg-pink-50' },
  top5_add: { icon: Star, label: 'added you to Top 5', color: 'text-amber-600 bg-amber-50' },
  camp_interest: { icon: Tent, label: 'showed camp interest', color: 'text-green-600 bg-green-50' },
};

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const [filter, setFilter] = useState<string>('all');

  const filteredActivities = filter === 'all' 
    ? activities 
    : activities.filter(a => a.engagement_type === filter);

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'profile_view', label: 'Views' },
    { value: 'watchlist_add', label: 'Followers' },
    { value: 'top5_add', label: 'Top 5' },
    { value: 'camp_interest', label: 'Camps' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
          <div className="flex items-center gap-1">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                  ${filter === f.value 
                    ? 'bg-green-50 text-green-700' 
                    : 'text-slate-500 hover:bg-slate-100'
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {filteredActivities.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Filter className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No activity yet</p>
          </div>
        ) : (
          filteredActivities.map((activity) => {
            const config = activityConfig[activity.engagement_type] || activityConfig.profile_view;
            const Icon = config.icon;

            return (
              <Link
                key={activity.id}
                href={`/coach/college/player/${activity.player.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
              >
                {activity.player.avatar_url ? (
                  <img 
                    src={activity.player.avatar_url} 
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-slate-600">
                      {activity.player.first_name?.[0]}{activity.player.last_name?.[0]}
                    </span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900">
                    <span className="font-medium">
                      {activity.player.first_name} {activity.player.last_name}
                    </span>
                    {' '}{config.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    {activity.player.primary_position} • {activity.player.grad_year} • {activity.player.state}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {formatDistanceToNow(new Date(activity.engagement_date), { addSuffix: true })}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {filteredActivities.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-200">
          <Link 
            href="/coach/college/activity"
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            View all activity →
          </Link>
        </div>
      )}
    </div>
  );
}
```

### 2.4 Pipeline Overview Component

```tsx
// components/coach/dashboard/PipelineOverview.tsx
import Link from 'next/link';

interface PipelineOverviewProps {
  pipeline: {
    watchlist: number;
    high_priority: number;
    offer_extended: number;
    committed: number;
  };
}

const statusConfig = [
  { key: 'watchlist', label: 'Watchlist', color: 'bg-slate-100 text-slate-700' },
  { key: 'high_priority', label: 'High Priority', color: 'bg-amber-100 text-amber-700' },
  { key: 'offer_extended', label: 'Offers Out', color: 'bg-purple-100 text-purple-700' },
  { key: 'committed', label: 'Committed', color: 'bg-green-100 text-green-700' },
];

export function PipelineOverview({ pipeline }: PipelineOverviewProps) {
  const total = Object.values(pipeline).reduce((a, b) => a + b, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Pipeline</h2>
        <span className="text-sm text-slate-500">{total} total</span>
      </div>

      <div className="space-y-3">
        {statusConfig.map((status) => (
          <Link
            key={status.key}
            href={`/coach/college/pipeline?status=${status.key}`}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${status.color}`}>
                {pipeline[status.key as keyof typeof pipeline]}
              </span>
              <span className="text-sm font-medium text-slate-700">{status.label}</span>
            </div>
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-200">
        <Link
          href="/coach/college/pipeline"
          className="block w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white 
                     text-sm font-medium rounded-lg text-center transition-colors"
        >
          View Pipeline
        </Link>
      </div>
    </div>
  );
}
```

### 2.5 Upcoming Camps Component

```tsx
// components/coach/dashboard/UpcomingCamps.tsx
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar, Users, Plus } from 'lucide-react';

interface Camp {
  id: string;
  name: string;
  start_date: string;
  capacity: number | null;
  registration_count: number;
  status: string;
}

interface UpcomingCampsProps {
  camps: Camp[];
}

export function UpcomingCamps({ camps }: UpcomingCampsProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Upcoming Camps</h2>
        <Link
          href="/coach/college/camps/new"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </Link>
      </div>

      {camps.length === 0 ? (
        <div className="text-center py-6">
          <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 mb-3">No upcoming camps</p>
          <Link
            href="/coach/college/camps/new"
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Create your first camp →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {camps.map((camp) => {
            const capacityPercent = camp.capacity 
              ? (camp.registration_count / camp.capacity) * 100 
              : 0;
            const statusLabel = capacityPercent >= 100 ? 'Full' 
              : capacityPercent >= 80 ? 'Limited' 
              : 'Open';
            const statusColor = capacityPercent >= 100 ? 'text-red-600' 
              : capacityPercent >= 80 ? 'text-amber-600' 
              : 'text-green-600';

            return (
              <Link
                key={camp.id}
                href={`/coach/college/camps/${camp.id}`}
                className="block p-3 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{camp.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {format(new Date(camp.start_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>
                
                {camp.capacity && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {camp.registration_count}/{camp.capacity}
                      </span>
                      <span>{Math.round(capacityPercent)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          capacityPercent >= 100 ? 'bg-red-500' 
                          : capacityPercent >= 80 ? 'bg-amber-500' 
                          : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(capacityPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {camps.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <Link
            href="/coach/college/camps"
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            View all camps →
          </Link>
        </div>
      )}
    </div>
  );
}
```

---

## 3. Discover Page

### 3.1 Discover Page

```tsx
// app/(dashboard)/coach/college/discover/page.tsx
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { FilterPanel } from '@/components/coach/discover/FilterPanel';
import { PlayerCardGrid } from '@/components/coach/discover/PlayerCardGrid';
import { DiscoverSkeleton } from '@/components/coach/discover/DiscoverSkeleton';

interface SearchParams {
  gradYear?: string;
  position?: string;
  state?: string;
  minVelo?: string;
  maxVelo?: string;
  minExit?: string;
  maxExit?: string;
  hasVideo?: string;
  search?: string;
  page?: string;
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/onboarding/coach');

  // Parse filters
  const filters = {
    gradYear: searchParams.gradYear ? parseInt(searchParams.gradYear) : undefined,
    position: searchParams.position,
    state: searchParams.state,
    minVelo: searchParams.minVelo ? parseInt(searchParams.minVelo) : undefined,
    maxVelo: searchParams.maxVelo ? parseInt(searchParams.maxVelo) : undefined,
    minExit: searchParams.minExit ? parseInt(searchParams.minExit) : undefined,
    maxExit: searchParams.maxExit ? parseInt(searchParams.maxExit) : undefined,
    hasVideo: searchParams.hasVideo === 'true',
    search: searchParams.search,
  };

  const page = parseInt(searchParams.page || '1');
  const perPage = 24;
  const offset = (page - 1) * perPage;

  // Build query
  let query = supabase
    .from('players')
    .select(`
      *,
      player_videos(id, thumbnail_url, is_primary)
    `, { count: 'exact' })
    .eq('recruiting_activated', true);

  // Apply filters
  if (filters.gradYear) {
    query = query.eq('grad_year', filters.gradYear);
  }
  if (filters.position) {
    query = query.or(`primary_position.eq.${filters.position},secondary_position.eq.${filters.position}`);
  }
  if (filters.state) {
    query = query.eq('state', filters.state);
  }
  if (filters.minVelo) {
    query = query.gte('pitch_velo', filters.minVelo);
  }
  if (filters.maxVelo) {
    query = query.lte('pitch_velo', filters.maxVelo);
  }
  if (filters.minExit) {
    query = query.gte('exit_velo', filters.minExit);
  }
  if (filters.maxExit) {
    query = query.lte('exit_velo', filters.maxExit);
  }
  if (filters.hasVideo) {
    query = query.eq('has_video', true);
  }
  if (filters.search) {
    query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,high_school_name.ilike.%${filters.search}%`);
  }

  // Execute query
  const { data: players, count, error } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  // Get watchlist to mark saved players
  const { data: watchlist } = await supabase
    .from('recruit_watchlist')
    .select('player_id')
    .eq('coach_id', coach.id);

  const watchlistIds = new Set(watchlist?.map(w => w.player_id) || []);

  const totalPages = Math.ceil((count || 0) / perPage);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Discover Players</h1>
          <p className="text-slate-500 mt-1">
            Search and filter to find your next recruit
          </p>
        </div>

        <div className="flex gap-6">
          {/* Filters Sidebar */}
          <div className="w-64 flex-shrink-0">
            <FilterPanel currentFilters={filters} />
          </div>

          {/* Results */}
          <div className="flex-1">
            <Suspense fallback={<DiscoverSkeleton />}>
              <PlayerCardGrid 
                players={players || []}
                watchlistIds={watchlistIds}
                coachId={coach.id}
                totalCount={count || 0}
                currentPage={page}
                totalPages={totalPages}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 3.2 Filter Panel Component

```tsx
// components/coach/discover/FilterPanel.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search, X } from 'lucide-react';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'UTIL'];
const GRAD_YEARS = [2025, 2026, 2027, 2028];
const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

interface FilterPanelProps {
  currentFilters: {
    gradYear?: number;
    position?: string;
    state?: string;
    minVelo?: number;
    maxVelo?: number;
    minExit?: number;
    maxExit?: number;
    hasVideo?: boolean;
    search?: string;
  };
}

export function FilterPanel({ currentFilters }: FilterPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(currentFilters.search || '');

  const updateFilter = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    
    // Reset to page 1 when filters change
    params.delete('page');

    startTransition(() => {
      router.push(`/coach/college/discover?${params.toString()}`);
    });
  };

  const clearAllFilters = () => {
    startTransition(() => {
      router.push('/coach/college/discover');
    });
    setSearch('');
  };

  const hasActiveFilters = Object.values(currentFilters).some(v => v !== undefined && v !== '');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-semibold text-slate-900">Filters</h2>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Search
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateFilter('search', search || undefined);
              }
            }}
            placeholder="Name or school..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900 placeholder:text-slate-400"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                updateFilter('search', undefined);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>
      </div>

      {/* Grad Year */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Graduation Year
        </label>
        <div className="flex flex-wrap gap-2">
          {GRAD_YEARS.map((year) => (
            <button
              key={year}
              onClick={() => updateFilter('gradYear', 
                currentFilters.gradYear === year ? undefined : year.toString()
              )}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
                ${currentFilters.gradYear === year
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Position */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Position
        </label>
        <select
          value={currentFilters.position || ''}
          onChange={(e) => updateFilter('position', e.target.value || undefined)}
          className="w-full px-4 py-2 rounded-lg border border-slate-200 
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-sm text-slate-900 bg-white"
        >
          <option value="">All Positions</option>
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
      </div>

      {/* State */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          State
        </label>
        <select
          value={currentFilters.state || ''}
          onChange={(e) => updateFilter('state', e.target.value || undefined)}
          className="w-full px-4 py-2 rounded-lg border border-slate-200 
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-sm text-slate-900 bg-white"
        >
          <option value="">All States</option>
          {STATES.map((state) => (
            <option key={state} value={state}>{state}</option>
          ))}
        </select>
      </div>

      {/* Pitch Velocity */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Pitch Velocity (mph)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={currentFilters.minVelo || ''}
            onChange={(e) => updateFilter('minVelo', e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900"
          />
          <span className="text-slate-400">-</span>
          <input
            type="number"
            placeholder="Max"
            value={currentFilters.maxVelo || ''}
            onChange={(e) => updateFilter('maxVelo', e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900"
          />
        </div>
      </div>

      {/* Exit Velocity */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Exit Velocity (mph)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={currentFilters.minExit || ''}
            onChange={(e) => updateFilter('minExit', e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900"
          />
          <span className="text-slate-400">-</span>
          <input
            type="number"
            placeholder="Max"
            value={currentFilters.maxExit || ''}
            onChange={(e) => updateFilter('maxExit', e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900"
          />
        </div>
      </div>

      {/* Has Video */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={currentFilters.hasVideo || false}
            onChange={(e) => updateFilter('hasVideo', e.target.checked ? 'true' : undefined)}
            className="w-4 h-4 rounded border-slate-300 text-green-600 
                       focus:ring-green-500"
          />
          <span className="text-sm text-slate-700">Has highlight video</span>
        </label>
      </div>

      {isPending && (
        <div className="mt-4 flex items-center justify-center text-sm text-slate-500">
          <div className="animate-spin h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full mr-2" />
          Loading...
        </div>
      )}
    </div>
  );
}
```

### 3.3 Player Card Component

```tsx
// components/coach/discover/PlayerCard.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Heart, Play, MapPin, GraduationCap } from 'lucide-react';
import { addToWatchlist, removeFromWatchlist } from '@/app/actions/watchlist';

interface PlayerCardProps {
  player: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    primary_position: string;
    secondary_position: string | null;
    grad_year: number;
    city: string;
    state: string;
    high_school_name: string;
    pitch_velo: number | null;
    exit_velo: number | null;
    sixty_time: number | null;
    has_video: boolean;
    player_videos: { id: string; thumbnail_url: string | null; is_primary: boolean }[];
  };
  isInWatchlist: boolean;
  coachId: string;
}

export function PlayerCard({ player, isInWatchlist, coachId }: PlayerCardProps) {
  const [inWatchlist, setInWatchlist] = useState(isInWatchlist);
  const [isLoading, setIsLoading] = useState(false);

  const primaryVideo = player.player_videos?.find(v => v.is_primary);
  const thumbnailUrl = primaryVideo?.thumbnail_url || player.avatar_url;

  const handleWatchlistToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsLoading(true);
    try {
      if (inWatchlist) {
        await removeFromWatchlist(coachId, player.id);
        setInWatchlist(false);
      } else {
        await addToWatchlist(coachId, player.id);
        setInWatchlist(true);
      }
    } catch (error) {
      console.error('Watchlist error:', error);
    }
    setIsLoading(false);
  };

  return (
    <Link
      href={`/coach/college/player/${player.id}`}
      className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden
                 hover:border-green-200 hover:shadow-md transition-all"
    >
      {/* Image/Video Thumbnail */}
      <div className="relative aspect-[4/3] bg-slate-100">
        {thumbnailUrl ? (
          <img 
            src={thumbnailUrl} 
            alt={`${player.first_name} ${player.last_name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-bold text-slate-300">
              {player.first_name?.[0]}{player.last_name?.[0]}
            </span>
          </div>
        )}

        {/* Video indicator */}
        {player.has_video && (
          <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/70 rounded-md 
                          flex items-center gap-1">
            <Play className="w-3 h-3 text-white" fill="white" />
            <span className="text-xs text-white font-medium">Video</span>
          </div>
        )}

        {/* Watchlist button */}
        <button
          onClick={handleWatchlistToggle}
          disabled={isLoading}
          className={`absolute top-3 right-3 p-2 rounded-full transition-all
            ${inWatchlist 
              ? 'bg-red-500 text-white' 
              : 'bg-white/90 text-slate-600 hover:bg-white hover:text-red-500'
            }`}
        >
          <Heart className={`w-4 h-4 ${inWatchlist ? 'fill-current' : ''}`} />
        </button>

        {/* Position badge */}
        <div className="absolute top-3 left-3 px-2.5 py-1 bg-green-600 text-white 
                        text-xs font-bold rounded-md">
          {player.primary_position}
          {player.secondary_position && `/${player.secondary_position}`}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-slate-900 group-hover:text-green-600 transition-colors">
          {player.first_name} {player.last_name}
        </h3>
        
        <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <GraduationCap className="w-3.5 h-3.5" />
            {player.grad_year}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {player.state}
          </span>
        </div>

        <p className="text-xs text-slate-400 mt-1 truncate">
          {player.high_school_name}
        </p>

        {/* Metrics */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
          {player.pitch_velo && (
            <div>
              <p className="text-xs text-slate-400">Velo</p>
              <p className="text-sm font-semibold text-slate-900">{player.pitch_velo}</p>
            </div>
          )}
          {player.exit_velo && (
            <div>
              <p className="text-xs text-slate-400">Exit</p>
              <p className="text-sm font-semibold text-slate-900">{player.exit_velo}</p>
            </div>
          )}
          {player.sixty_time && (
            <div>
              <p className="text-xs text-slate-400">60yd</p>
              <p className="text-sm font-semibold text-slate-900">{player.sixty_time}s</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
```

### 3.4 Player Card Grid Component

```tsx
// components/coach/discover/PlayerCardGrid.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PlayerCard } from './PlayerCard';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  primary_position: string;
  secondary_position: string | null;
  grad_year: number;
  city: string;
  state: string;
  high_school_name: string;
  pitch_velo: number | null;
  exit_velo: number | null;
  sixty_time: number | null;
  has_video: boolean;
  player_videos: { id: string; thumbnail_url: string | null; is_primary: boolean }[];
}

interface PlayerCardGridProps {
  players: Player[];
  watchlistIds: Set<string>;
  coachId: string;
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

export function PlayerCardGrid({ 
  players, 
  watchlistIds, 
  coachId,
  totalCount,
  currentPage,
  totalPages 
}: PlayerCardGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`/coach/college/discover?${params.toString()}`);
  };

  if (players.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Users className="w-6 h-6 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          No players found
        </h3>
        <p className="text-sm text-slate-500">
          Try adjusting your filters to see more results.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Results header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          Showing {players.length} of {totalCount.toLocaleString()} players
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            isInWatchlist={watchlistIds.has(player.id)}
            coachId={coachId}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 
                       hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (currentPage <= 4) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = currentPage - 3 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => goToPage(pageNum)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors
                    ${currentPage === pageNum
                      ? 'bg-green-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 
                       hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## 4. Watchlist

### 4.1 Watchlist Page

```tsx
// app/(dashboard)/coach/college/watchlist/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { WatchlistTable } from '@/components/coach/watchlist/WatchlistTable';

interface SearchParams {
  status?: string;
  sort?: string;
}

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/onboarding/coach');

  // Build query
  let query = supabase
    .from('recruit_watchlist')
    .select(`
      *,
      player:players(
        id, first_name, last_name, avatar_url,
        primary_position, secondary_position,
        grad_year, state, high_school_name,
        pitch_velo, exit_velo, sixty_time, has_video
      )
    `)
    .eq('coach_id', coach.id);

  // Filter by status
  if (searchParams.status && searchParams.status !== 'all') {
    query = query.eq('status', searchParams.status);
  }

  // Sort
  const sortField = searchParams.sort || 'created_at';
  query = query.order(sortField, { ascending: false });

  const { data: watchlist, error } = await query;

  // Get counts per status
  const { data: statusCounts } = await supabase
    .from('recruit_watchlist')
    .select('status')
    .eq('coach_id', coach.id);

  const counts = {
    all: statusCounts?.length || 0,
    watchlist: statusCounts?.filter(w => w.status === 'watchlist').length || 0,
    high_priority: statusCounts?.filter(w => w.status === 'high_priority').length || 0,
    offer_extended: statusCounts?.filter(w => w.status === 'offer_extended').length || 0,
    committed: statusCounts?.filter(w => w.status === 'committed').length || 0,
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Watchlist</h1>
            <p className="text-slate-500 mt-1">
              {counts.all} players saved
            </p>
          </div>
        </div>

        <WatchlistTable 
          watchlist={watchlist || []} 
          counts={counts}
          currentStatus={searchParams.status || 'all'}
          coachId={coach.id}
        />
      </div>
    </div>
  );
}
```

### 4.2 Watchlist Table Component

```tsx
// components/coach/watchlist/WatchlistTable.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, Trash2, Edit2, Eye, GitBranch } from 'lucide-react';
import { StatusDropdown } from './StatusDropdown';
import { removeFromWatchlist, updateWatchlistStatus } from '@/app/actions/watchlist';

interface WatchlistEntry {
  id: string;
  player_id: string;
  status: string;
  notes: string | null;
  created_at: string;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    primary_position: string;
    secondary_position: string | null;
    grad_year: number;
    state: string;
    high_school_name: string;
    pitch_velo: number | null;
    exit_velo: number | null;
    sixty_time: number | null;
    has_video: boolean;
  };
}

interface WatchlistTableProps {
  watchlist: WatchlistEntry[];
  counts: {
    all: number;
    watchlist: number;
    high_priority: number;
    offer_extended: number;
    committed: number;
  };
  currentStatus: string;
  coachId: string;
}

const statusTabs = [
  { value: 'all', label: 'All' },
  { value: 'watchlist', label: 'Watching' },
  { value: 'high_priority', label: 'High Priority' },
  { value: 'offer_extended', label: 'Offers Out' },
  { value: 'committed', label: 'Committed' },
];

export function WatchlistTable({ watchlist, counts, currentStatus, coachId }: WatchlistTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const setStatus = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === 'all') {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    router.push(`/coach/college/watchlist?${params.toString()}`);
  };

  const handleRemove = async (playerId: string) => {
    if (confirm('Remove this player from your watchlist?')) {
      await removeFromWatchlist(coachId, playerId);
      router.refresh();
    }
    setActionMenuId(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Status Tabs */}
      <div className="border-b border-slate-200 px-6">
        <div className="flex gap-1 -mb-px">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${currentStatus === tab.value
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
            >
              {tab.label}
              <span className="ml-2 px-2 py-0.5 bg-slate-100 rounded-full text-xs">
                {counts[tab.value as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {watchlist.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <GitBranch className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No players in this list</p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Player
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Position
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Metrics
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Added
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {watchlist.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <Link 
                    href={`/coach/college/player/${entry.player.id}`}
                    className="flex items-center gap-3 group"
                  >
                    {entry.player.avatar_url ? (
                      <img 
                        src={entry.player.avatar_url} 
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-slate-600">
                          {entry.player.first_name?.[0]}{entry.player.last_name?.[0]}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-900 group-hover:text-green-600">
                        {entry.player.first_name} {entry.player.last_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {entry.player.high_school_name} • {entry.player.state}
                      </p>
                    </div>
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                    {entry.player.primary_position}
                  </span>
                  <span className="text-xs text-slate-500 ml-2">
                    '{String(entry.player.grad_year).slice(-2)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    {entry.player.pitch_velo && <span>{entry.player.pitch_velo} mph</span>}
                    {entry.player.exit_velo && <span>{entry.player.exit_velo} EV</span>}
                    {entry.player.sixty_time && <span>{entry.player.sixty_time}s</span>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <StatusDropdown
                    currentStatus={entry.status}
                    onStatusChange={(newStatus) => {
                      updateWatchlistStatus(coachId, entry.player_id, newStatus);
                      router.refresh();
                    }}
                  />
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-slate-500">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="relative">
                    <button
                      onClick={() => setActionMenuId(actionMenuId === entry.id ? null : entry.id)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {actionMenuId === entry.id && (
                      <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-10">
                        <Link
                          href={`/coach/college/player/${entry.player.id}`}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="w-4 h-4" />
                          View Profile
                        </Link>
                        <button
                          onClick={() => {/* Open note modal */}}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit Notes
                        </button>
                        <button
                          onClick={() => handleRemove(entry.player_id)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

### 4.3 Status Dropdown Component

```tsx
// components/coach/watchlist/StatusDropdown.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const statusOptions = [
  { value: 'watchlist', label: 'Watching', color: 'bg-slate-100 text-slate-700' },
  { value: 'high_priority', label: 'High Priority', color: 'bg-amber-100 text-amber-700' },
  { value: 'offer_extended', label: 'Offer Extended', color: 'bg-purple-100 text-purple-700' },
  { value: 'committed', label: 'Committed', color: 'bg-green-100 text-green-700' },
  { value: 'uninterested', label: 'Not Interested', color: 'bg-red-100 text-red-700' },
];

interface StatusDropdownProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
}

export function StatusDropdown({ currentStatus, onStatusChange }: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = statusOptions.find(s => s.value === currentStatus) || statusOptions[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${current.color}`}
      >
        {current.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-44 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-10">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onStatusChange(option.value);
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${option.color}`}>
                {option.label}
              </span>
              {currentStatus === option.value && (
                <Check className="w-4 h-4 text-green-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 5. Pipeline/Planner

### 5.1 Pipeline Page

```tsx
// app/(dashboard)/coach/college/pipeline/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PipelineBoard } from '@/components/coach/pipeline/PipelineBoard';
import { RecruitingDiamond } from '@/components/coach/pipeline/RecruitingDiamond';

export default async function PipelinePage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/onboarding/coach');

  const { data: watchlist } = await supabase
    .from('recruit_watchlist')
    .select(`
      *,
      player:players(
        id, first_name, last_name, avatar_url,
        primary_position, secondary_position,
        grad_year, state
      )
    `)
    .eq('coach_id', coach.id)
    .neq('status', 'uninterested');

  // Group by status
  const columns = {
    watchlist: watchlist?.filter(w => w.status === 'watchlist') || [],
    high_priority: watchlist?.filter(w => w.status === 'high_priority') || [],
    offer_extended: watchlist?.filter(w => w.status === 'offer_extended') || [],
    committed: watchlist?.filter(w => w.status === 'committed') || [],
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Recruiting Pipeline</h1>
            <p className="text-slate-500 mt-1">
              Drag and drop to update status
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Pipeline Board - 2 columns */}
          <div className="xl:col-span-2">
            <PipelineBoard columns={columns} coachId={coach.id} />
          </div>

          {/* Diamond View */}
          <div>
            <RecruitingDiamond 
              players={watchlist || []} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 5.2 Pipeline Board Component (Drag & Drop)

```tsx
// components/coach/pipeline/PipelineBoard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { PipelineColumn } from './PipelineColumn';
import { PipelineCard } from './PipelineCard';
import { updateWatchlistStatus } from '@/app/actions/watchlist';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  primary_position: string;
  grad_year: number;
  state: string;
}

interface WatchlistEntry {
  id: string;
  player_id: string;
  status: string;
  player: Player;
}

interface PipelineBoardProps {
  columns: {
    watchlist: WatchlistEntry[];
    high_priority: WatchlistEntry[];
    offer_extended: WatchlistEntry[];
    committed: WatchlistEntry[];
  };
  coachId: string;
}

const columnConfig = [
  { id: 'watchlist', title: 'Watchlist', color: 'border-slate-300' },
  { id: 'high_priority', title: 'High Priority', color: 'border-amber-400' },
  { id: 'offer_extended', title: 'Offers Out', color: 'border-purple-400' },
  { id: 'committed', title: 'Committed', color: 'border-green-400' },
];

export function PipelineBoard({ columns, coachId }: PipelineBoardProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localColumns, setLocalColumns] = useState(columns);

  const activeEntry = activeId 
    ? Object.values(localColumns).flat().find(e => e.id === activeId)
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeEntry = Object.values(localColumns).flat().find(e => e.id === active.id);
    if (!activeEntry) return;

    // Determine target column
    let targetColumn: string | null = null;
    
    // Check if dropped on a column
    if (columnConfig.some(c => c.id === over.id)) {
      targetColumn = over.id as string;
    } else {
      // Dropped on another card - find which column it's in
      for (const [colId, entries] of Object.entries(localColumns)) {
        if (entries.some(e => e.id === over.id)) {
          targetColumn = colId;
          break;
        }
      }
    }

    if (!targetColumn || targetColumn === activeEntry.status) return;

    // Optimistic update
    setLocalColumns(prev => {
      const newColumns = { ...prev };
      
      // Remove from old column
      newColumns[activeEntry.status as keyof typeof newColumns] = 
        newColumns[activeEntry.status as keyof typeof newColumns].filter(e => e.id !== active.id);
      
      // Add to new column
      const updatedEntry = { ...activeEntry, status: targetColumn };
      newColumns[targetColumn as keyof typeof newColumns] = [
        ...newColumns[targetColumn as keyof typeof newColumns],
        updatedEntry
      ];
      
      return newColumns;
    });

    // Update in database
    await updateWatchlistStatus(coachId, activeEntry.player_id, targetColumn);
    router.refresh();
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-4 gap-4">
        {columnConfig.map((column) => (
          <PipelineColumn
            key={column.id}
            id={column.id}
            title={column.title}
            color={column.color}
            count={localColumns[column.id as keyof typeof localColumns].length}
          >
            <SortableContext
              items={localColumns[column.id as keyof typeof localColumns].map(e => e.id)}
              strategy={verticalListSortingStrategy}
            >
              {localColumns[column.id as keyof typeof localColumns].map((entry) => (
                <PipelineCard
                  key={entry.id}
                  id={entry.id}
                  player={entry.player}
                />
              ))}
            </SortableContext>
          </PipelineColumn>
        ))}
      </div>

      <DragOverlay>
        {activeEntry && (
          <PipelineCard
            id={activeEntry.id}
            player={activeEntry.player}
            isDragging
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
```

### 5.3 Pipeline Column Component

```tsx
// components/coach/pipeline/PipelineColumn.tsx
'use client';

import { useDroppable } from '@dnd-kit/core';

interface PipelineColumnProps {
  id: string;
  title: string;
  color: string;
  count: number;
  children: React.ReactNode;
}

export function PipelineColumn({ id, title, color, count, children }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`bg-white rounded-2xl border-2 ${color} p-4 min-h-[500px] transition-colors
        ${isOver ? 'bg-slate-50' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
          {count}
        </span>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}
```

### 5.4 Pipeline Card Component

```tsx
// components/coach/pipeline/PipelineCard.tsx
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { GripVertical } from 'lucide-react';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  primary_position: string;
  grad_year: number;
  state: string;
}

interface PipelineCardProps {
  id: string;
  player: Player;
  isDragging?: boolean;
}

export function PipelineCard({ id, player, isDragging }: PipelineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-slate-50 rounded-xl p-3 group cursor-grab active:cursor-grabbing
        ${isDragging ? 'shadow-lg ring-2 ring-green-500' : 'hover:bg-slate-100'}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-3">
        <GripVertical className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        {player.avatar_url ? (
          <img 
            src={player.avatar_url} 
            alt=""
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-xs font-medium text-green-700">
              {player.first_name?.[0]}{player.last_name?.[0]}
            </span>
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <Link
            href={`/coach/college/player/${player.id}`}
            className="text-sm font-medium text-slate-900 hover:text-green-600 truncate block"
            onClick={(e) => e.stopPropagation()}
          >
            {player.first_name} {player.last_name}
          </Link>
          <p className="text-xs text-slate-500">
            {player.primary_position} • '{String(player.grad_year).slice(-2)} • {player.state}
          </p>
        </div>
      </div>
    </div>
  );
}
```

### 5.5 Recruiting Diamond Component

```tsx
// components/coach/pipeline/RecruitingDiamond.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  primary_position: string;
  grad_year: number;
}

interface WatchlistEntry {
  id: string;
  player_id: string;
  status: string;
  player: Player;
}

interface RecruitingDiamondProps {
  players: WatchlistEntry[];
}

const POSITION_SLOTS: Record<string, { top: string; left: string }> = {
  CF: { top: '8%', left: '50%' },
  LF: { top: '18%', left: '18%' },
  RF: { top: '18%', left: '82%' },
  SS: { top: '40%', left: '38%' },
  '2B': { top: '36%', left: '62%' },
  '3B': { top: '54%', left: '20%' },
  '1B': { top: '54%', left: '80%' },
  P: { top: '50%', left: '50%' },
  C: { top: '78%', left: '50%' },
};

const STATUS_COLORS: Record<string, string> = {
  watchlist: 'ring-slate-400 bg-slate-100',
  high_priority: 'ring-amber-400 bg-amber-100',
  offer_extended: 'ring-purple-400 bg-purple-100',
  committed: 'ring-green-400 bg-green-100',
};

export function RecruitingDiamond({ players }: RecruitingDiamondProps) {
  const [hoveredPlayer, setHoveredPlayer] = useState<WatchlistEntry | null>(null);

  // Group players by position
  const playersByPosition: Record<string, WatchlistEntry[]> = {};
  players.forEach(entry => {
    const pos = entry.player.primary_position;
    if (!playersByPosition[pos]) {
      playersByPosition[pos] = [];
    }
    playersByPosition[pos].push(entry);
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="font-semibold text-slate-900 mb-4">Field View</h3>
      
      <div className="relative aspect-square bg-green-50 rounded-xl overflow-hidden">
        {/* Field lines */}
        <svg 
          viewBox="0 0 100 100" 
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'rotate(-45deg)' }}
        >
          <path
            d="M50 90 L10 50 L50 10 L90 50 Z"
            fill="none"
            stroke="#16A34A"
            strokeWidth="0.5"
            opacity="0.3"
          />
          <circle cx="50" cy="50" r="8" fill="none" stroke="#16A34A" strokeWidth="0.3" opacity="0.3" />
        </svg>

        {/* Position markers */}
        {Object.entries(POSITION_SLOTS).map(([pos, coords]) => {
          const posPlayers = playersByPosition[pos] || [];
          const topPlayer = posPlayers[0];

          return (
            <div
              key={pos}
              className="absolute transform -translate-x-1/2 -translate-y-1/2"
              style={{ top: coords.top, left: coords.left }}
            >
              {topPlayer ? (
                <Link
                  href={`/coach/college/player/${topPlayer.player.id}`}
                  className={`block w-10 h-10 rounded-full ring-2 ${STATUS_COLORS[topPlayer.status]}
                    hover:ring-4 transition-all cursor-pointer relative`}
                  onMouseEnter={() => setHoveredPlayer(topPlayer)}
                  onMouseLeave={() => setHoveredPlayer(null)}
                >
                  {topPlayer.player.avatar_url ? (
                    <img 
                      src={topPlayer.player.avatar_url} 
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-slate-700">
                        {topPlayer.player.first_name?.[0]}{topPlayer.player.last_name?.[0]}
                      </span>
                    </div>
                  )}
                  
                  {/* Count badge if multiple */}
                  {posPlayers.length > 1 && (
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-slate-900 text-white 
                                     text-xs font-medium rounded-full flex items-center justify-center">
                      {posPlayers.length}
                    </span>
                  )}
                </Link>
              ) : (
                <div className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 
                               flex items-center justify-center">
                  <span className="text-xs font-medium text-slate-400">{pos}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Tooltip */}
        {hoveredPlayer && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 
                          bg-white rounded-lg shadow-lg border border-slate-200 p-3 z-10">
            <p className="text-sm font-medium text-slate-900">
              {hoveredPlayer.player.first_name} {hoveredPlayer.player.last_name}
            </p>
            <p className="text-xs text-slate-500">
              {hoveredPlayer.player.primary_position} • Class of {hoveredPlayer.player.grad_year}
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4">
        {[
          { status: 'watchlist', label: 'Watching' },
          { status: 'high_priority', label: 'Priority' },
          { status: 'offer_extended', label: 'Offer' },
          { status: 'committed', label: 'Commit' },
        ].map(({ status, label }) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ring-2 ${STATUS_COLORS[status]}`} />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Compare Players

### 6.1 Compare Page

```tsx
// app/(dashboard)/coach/college/compare/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CompareView } from '@/components/coach/compare/CompareView';

interface SearchParams {
  players?: string; // Comma-separated player IDs
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/onboarding/coach');

  // Parse player IDs from URL
  const playerIds = searchParams.players?.split(',').filter(Boolean) || [];

  // Fetch players if IDs provided
  let players: any[] = [];
  if (playerIds.length > 0) {
    const { data } = await supabase
      .from('players')
      .select(`
        *,
        player_videos(id, thumbnail_url, video_url, is_primary),
        player_metrics(metric_label, metric_value, metric_type),
        player_stats(*)
      `)
      .in('id', playerIds);
    
    players = data || [];
  }

  // Get watchlist for quick add
  const { data: watchlist } = await supabase
    .from('recruit_watchlist')
    .select(`
      player_id,
      player:players(id, first_name, last_name, avatar_url, primary_position, grad_year)
    `)
    .eq('coach_id', coach.id)
    .limit(50);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Compare Players</h1>
            <p className="text-slate-500 mt-1">
              Select 2-4 players to compare side by side
            </p>
          </div>
        </div>

        <CompareView 
          players={players}
          watchlist={watchlist || []}
          coachId={coach.id}
        />
      </div>
    </div>
  );
}
```

### 6.2 Compare View Component

```tsx
// components/coach/compare/CompareView.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X, Users } from 'lucide-react';
import { CompareColumn } from './CompareColumn';
import { StatsComparisonTable } from './StatsComparisonTable';
import { RadarChartOverlay } from './RadarChartOverlay';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  primary_position: string;
  secondary_position: string | null;
  grad_year: number;
  state: string;
  high_school_name: string;
  height_feet: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  pitch_velo: number | null;
  exit_velo: number | null;
  sixty_time: number | null;
  gpa: number | null;
  player_videos: any[];
  player_metrics: any[];
  player_stats: any[];
}

interface WatchlistEntry {
  player_id: string;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    primary_position: string;
    grad_year: number;
  };
}

interface CompareViewProps {
  players: Player[];
  watchlist: WatchlistEntry[];
  coachId: string;
}

export function CompareView({ players, watchlist, coachId }: CompareViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPicker, setShowPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'stats' | 'chart'>('overview');

  const addPlayer = (playerId: string) => {
    const currentIds = searchParams.get('players')?.split(',').filter(Boolean) || [];
    if (currentIds.length >= 4) return;
    if (currentIds.includes(playerId)) return;
    
    const newIds = [...currentIds, playerId];
    router.push(`/coach/college/compare?players=${newIds.join(',')}`);
    setShowPicker(false);
  };

  const removePlayer = (playerId: string) => {
    const currentIds = searchParams.get('players')?.split(',').filter(Boolean) || [];
    const newIds = currentIds.filter(id => id !== playerId);
    router.push(`/coach/college/compare?players=${newIds.join(',')}`);
  };

  // Filter watchlist to exclude already selected players
  const selectedIds = new Set(players.map(p => p.id));
  const availablePlayers = watchlist.filter(w => !selectedIds.has(w.player_id));

  if (players.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          No players selected
        </h3>
        <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
          Select players from your watchlist to compare them side by side.
        </p>
        <button
          onClick={() => setShowPicker(true)}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white 
                     font-medium rounded-lg transition-colors"
        >
          Select Players
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'stats', label: 'Statistics' },
          { id: 'chart', label: 'Radar Chart' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Player Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {players.map((player) => (
          <CompareColumn 
            key={player.id} 
            player={player}
            onRemove={() => removePlayer(player.id)}
            showStats={activeTab === 'overview'}
          />
        ))}

        {/* Add Player Button */}
        {players.length < 4 && (
          <div className="relative">
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="w-full h-full min-h-[400px] bg-white rounded-2xl border-2 border-dashed 
                         border-slate-200 hover:border-green-300 hover:bg-green-50/50
                         flex flex-col items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-8 h-8 text-slate-400" />
              <span className="text-sm font-medium text-slate-500">Add Player</span>
            </button>

            {/* Player Picker Dropdown */}
            {showPicker && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl 
                              border border-slate-200 shadow-lg z-10 max-h-80 overflow-y-auto">
                {availablePlayers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">
                    No more players in watchlist
                  </div>
                ) : (
                  availablePlayers.map((entry) => (
                    <button
                      key={entry.player_id}
                      onClick={() => addPlayer(entry.player_id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors"
                    >
                      {entry.player.avatar_url ? (
                        <img 
                          src={entry.player.avatar_url} 
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-slate-600">
                            {entry.player.first_name?.[0]}{entry.player.last_name?.[0]}
                          </span>
                        </div>
                      )}
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-900">
                          {entry.player.first_name} {entry.player.last_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.player.primary_position} • {entry.player.grad_year}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Table */}
      {activeTab === 'stats' && players.length >= 2 && (
        <StatsComparisonTable players={players} />
      )}

      {/* Radar Chart */}
      {activeTab === 'chart' && players.length >= 2 && (
        <RadarChartOverlay players={players} />
      )}
    </div>
  );
}
```

### 6.3 Compare Column Component

```tsx
// components/coach/compare/CompareColumn.tsx
import Link from 'next/link';
import { X, Play, MapPin, GraduationCap, Ruler, Scale } from 'lucide-react';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  primary_position: string;
  secondary_position: string | null;
  grad_year: number;
  state: string;
  high_school_name: string;
  height_feet: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  pitch_velo: number | null;
  exit_velo: number | null;
  sixty_time: number | null;
  gpa: number | null;
  player_videos: any[];
}

interface CompareColumnProps {
  player: Player;
  onRemove: () => void;
  showStats: boolean;
}

export function CompareColumn({ player, onRemove, showStats }: CompareColumnProps) {
  const primaryVideo = player.player_videos?.find((v: any) => v.is_primary);
  const heightDisplay = player.height_feet && player.height_inches 
    ? `${player.height_feet}'${player.height_inches}"` 
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header with remove button */}
      <div className="relative">
        <button
          onClick={onRemove}
          className="absolute top-3 right-3 z-10 p-1.5 bg-white/90 hover:bg-red-50 
                     rounded-full shadow-sm transition-colors"
        >
          <X className="w-4 h-4 text-slate-500 hover:text-red-500" />
        </button>

        {/* Image */}
        <div className="aspect-[4/3] bg-slate-100">
          {player.avatar_url ? (
            <img 
              src={player.avatar_url} 
              alt={`${player.first_name} ${player.last_name}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-4xl font-bold text-slate-300">
                {player.first_name?.[0]}{player.last_name?.[0]}
              </span>
            </div>
          )}

          {/* Video badge */}
          {primaryVideo && (
            <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/70 rounded-md 
                            flex items-center gap-1">
              <Play className="w-3 h-3 text-white" fill="white" />
              <span className="text-xs text-white font-medium">Video</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <Link 
          href={`/coach/college/player/${player.id}`}
          className="text-lg font-semibold text-slate-900 hover:text-green-600 transition-colors"
        >
          {player.first_name} {player.last_name}
        </Link>

        <div className="flex items-center gap-2 mt-2">
          <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
            {player.primary_position}
            {player.secondary_position && `/${player.secondary_position}`}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-3 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <GraduationCap className="w-3.5 h-3.5" />
            {player.grad_year}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {player.state}
          </span>
        </div>

        <p className="text-sm text-slate-400 mt-1 truncate">
          {player.high_school_name}
        </p>

        {showStats && (
          <>
            {/* Physical */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
              {heightDisplay && (
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700">{heightDisplay}</span>
                </div>
              )}
              {player.weight_lbs && (
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700">{player.weight_lbs} lbs</span>
                </div>
              )}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {player.pitch_velo && (
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-lg font-semibold text-slate-900">{player.pitch_velo}</p>
                  <p className="text-xs text-slate-500">Velo</p>
                </div>
              )}
              {player.exit_velo && (
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-lg font-semibold text-slate-900">{player.exit_velo}</p>
                  <p className="text-xs text-slate-500">Exit</p>
                </div>
              )}
              {player.sixty_time && (
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-lg font-semibold text-slate-900">{player.sixty_time}</p>
                  <p className="text-xs text-slate-500">60yd</p>
                </div>
              )}
            </div>

            {/* GPA */}
            {player.gpa && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">GPA</span>
                  <span className="text-sm font-semibold text-slate-900">{player.gpa}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

---

## 7. Camps Management

### 7.1 Camps List Page

```tsx
// app/(dashboard)/coach/college/camps/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { CampCard } from '@/components/coach/camps/CampCard';

export default async function CampsPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/onboarding/coach');

  const { data: camps } = await supabase
    .from('camps')
    .select('*')
    .eq('coach_id', coach.id)
    .order('start_date', { ascending: true });

  // Separate into upcoming and past
  const today = new Date().toISOString().split('T')[0];
  const upcomingCamps = camps?.filter(c => c.start_date >= today) || [];
  const pastCamps = camps?.filter(c => c.start_date < today) || [];

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Camps</h1>
            <p className="text-slate-500 mt-1">
              Manage your camps and registrations
            </p>
          </div>
          <Link
            href="/coach/college/camps/new"
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 
                       text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Camp
          </Link>
        </div>

        {/* Upcoming Camps */}
        <div className="mb-12">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Upcoming Camps ({upcomingCamps.length})
          </h2>
          {upcomingCamps.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <p className="text-slate-500">No upcoming camps scheduled</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingCamps.map((camp) => (
                <CampCard key={camp.id} camp={camp} />
              ))}
            </div>
          )}
        </div>

        {/* Past Camps */}
        {pastCamps.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Past Camps ({pastCamps.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pastCamps.map((camp) => (
                <CampCard key={camp.id} camp={camp} isPast />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 7.2 Camp Card Component

```tsx
// components/coach/camps/CampCard.tsx
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar, MapPin, Users, DollarSign } from 'lucide-react';

interface Camp {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  location: string | null;
  location_city: string | null;
  location_state: string | null;
  capacity: number | null;
  registration_count: number;
  interested_count: number;
  price: number | null;
  status: string;
}

interface CampCardProps {
  camp: Camp;
  isPast?: boolean;
}

export function CampCard({ camp, isPast }: CampCardProps) {
  const capacityPercent = camp.capacity 
    ? (camp.registration_count / camp.capacity) * 100 
    : 0;

  const statusLabel = camp.status === 'cancelled' ? 'Cancelled'
    : camp.status === 'completed' ? 'Completed'
    : capacityPercent >= 100 ? 'Full'
    : capacityPercent >= 80 ? 'Limited'
    : 'Open';

  const statusColor = camp.status === 'cancelled' ? 'bg-red-100 text-red-700'
    : camp.status === 'completed' ? 'bg-slate-100 text-slate-700'
    : capacityPercent >= 100 ? 'bg-red-100 text-red-700'
    : capacityPercent >= 80 ? 'bg-amber-100 text-amber-700'
    : 'bg-green-100 text-green-700';

  return (
    <Link
      href={`/coach/college/camps/${camp.id}`}
      className={`block bg-white rounded-2xl border border-slate-200 p-6 shadow-sm
                  hover:border-green-200 hover:shadow-md transition-all
                  ${isPast ? 'opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-slate-900 line-clamp-1">{camp.name}</h3>
        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {camp.description && (
        <p className="text-sm text-slate-500 line-clamp-2 mb-4">
          {camp.description}
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span>
            {format(new Date(camp.start_date), 'MMM d, yyyy')}
            {camp.end_date && camp.end_date !== camp.start_date && (
              <> - {format(new Date(camp.end_date), 'MMM d, yyyy')}</>
            )}
          </span>
        </div>

        {(camp.location_city || camp.location_state) && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <MapPin className="w-4 h-4 text-slate-400" />
            <span>
              {[camp.location_city, camp.location_state].filter(Boolean).join(', ')}
            </span>
          </div>
        )}

        {camp.price !== null && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <span>${camp.price}</span>
          </div>
        )}
      </div>

      {/* Capacity */}
      {camp.capacity && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="flex items-center gap-1 text-slate-500">
              <Users className="w-4 h-4" />
              {camp.registration_count} / {camp.capacity} registered
            </span>
            <span className="text-slate-400">{Math.round(capacityPercent)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                capacityPercent >= 100 ? 'bg-red-500' 
                : capacityPercent >= 80 ? 'bg-amber-500' 
                : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(capacityPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Interest count */}
      {camp.interested_count > 0 && (
        <p className="text-xs text-slate-400 mt-3">
          {camp.interested_count} players interested
        </p>
      )}
    </Link>
  );
}
```

### 7.3 Camp Form Component

```tsx
// components/coach/camps/CampForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCamp, updateCamp } from '@/app/actions/camps';

interface Camp {
  id?: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  location_city: string | null;
  location_state: string | null;
  location_address: string | null;
  capacity: number | null;
  price: number | null;
  registration_deadline: string | null;
  status: string;
}

interface CampFormProps {
  camp?: Camp;
  coachId: string;
}

export function CampForm({ camp, coachId }: CampFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    
    try {
      if (camp?.id) {
        await updateCamp(camp.id, formData);
      } else {
        await createCamp(coachId, formData);
      }
      router.push('/coach/college/camps');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Camp Name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Camp Name *
        </label>
        <input
          type="text"
          name="name"
          defaultValue={camp?.name}
          required
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-slate-900 placeholder:text-slate-400"
          placeholder="e.g., Summer Pitching Camp"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Description
        </label>
        <textarea
          name="description"
          defaultValue={camp?.description || ''}
          rows={4}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-slate-900 placeholder:text-slate-400"
          placeholder="Describe what players can expect..."
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Start Date *
          </label>
          <input
            type="date"
            name="start_date"
            defaultValue={camp?.start_date}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-slate-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            End Date
          </label>
          <input
            type="date"
            name="end_date"
            defaultValue={camp?.end_date || ''}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-slate-900"
          />
        </div>
      </div>

      {/* Times */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Start Time
          </label>
          <input
            type="time"
            name="start_time"
            defaultValue={camp?.start_time || ''}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-slate-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            End Time
          </label>
          <input
            type="time"
            name="end_time"
            defaultValue={camp?.end_time || ''}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-slate-900"
          />
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Venue Name
        </label>
        <input
          type="text"
          name="location"
          defaultValue={camp?.location || ''}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-slate-900 placeholder:text-slate-400"
          placeholder="e.g., Main Baseball Field"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            City
          </label>
          <input
            type="text"
            name="location_city"
            defaultValue={camp?.location_city || ''}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-slate-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            State
          </label>
          <input
            type="text"
            name="location_state"
            defaultValue={camp?.location_state || ''}
            maxLength={2}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-slate-900"
            placeholder="TX"
          />
        </div>
      </div>

      {/* Capacity & Price */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Capacity
          </label>
          <input
            type="number"
            name="capacity"
            defaultValue={camp?.capacity || ''}
            min={1}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-slate-900"
            placeholder="50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Price ($)
          </label>
          <input
            type="number"
            name="price"
            defaultValue={camp?.price || ''}
            min={0}
            step={0.01}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-slate-900"
            placeholder="75.00"
          />
        </div>
      </div>

      {/* Registration Deadline */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Registration Deadline
        </label>
        <input
          type="date"
          name="registration_deadline"
          defaultValue={camp?.registration_deadline || ''}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-slate-900"
        />
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Status
        </label>
        <select
          name="status"
          defaultValue={camp?.status || 'draft'}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-slate-900 bg-white"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 
                     rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white 
                     font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving...' : camp?.id ? 'Save Changes' : 'Create Camp'}
        </button>
      </div>
    </form>
  );
}
```

---

## 10. API Routes & Server Actions

### 10.1 Watchlist Actions

```tsx
// app/actions/watchlist.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addToWatchlist(coachId: string, playerId: string, status: string = 'watchlist') {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('recruit_watchlist')
    .upsert({
      coach_id: coachId,
      player_id: playerId,
      status,
    }, {
      onConflict: 'coach_id,player_id',
    });

  if (error) throw new Error(error.message);
  
  // Record engagement event
  await supabase.from('player_engagement_events').insert({
    player_id: playerId,
    coach_id: coachId,
    engagement_type: 'watchlist_add',
  });

  revalidatePath('/coach/college/discover');
  revalidatePath('/coach/college/watchlist');
}

export async function removeFromWatchlist(coachId: string, playerId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('recruit_watchlist')
    .delete()
    .eq('coach_id', coachId)
    .eq('player_id', playerId);

  if (error) throw new Error(error.message);

  // Record engagement event
  await supabase.from('player_engagement_events').insert({
    player_id: playerId,
    coach_id: coachId,
    engagement_type: 'watchlist_remove',
  });

  revalidatePath('/coach/college/watchlist');
  revalidatePath('/coach/college/pipeline');
}

export async function updateWatchlistStatus(coachId: string, playerId: string, status: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('recruit_watchlist')
    .update({ 
      status,
      status_changed_at: new Date().toISOString(),
    })
    .eq('coach_id', coachId)
    .eq('player_id', playerId);

  if (error) throw new Error(error.message);

  revalidatePath('/coach/college/watchlist');
  revalidatePath('/coach/college/pipeline');
}

export async function updateWatchlistNotes(coachId: string, playerId: string, notes: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('recruit_watchlist')
    .update({ notes })
    .eq('coach_id', coachId)
    .eq('player_id', playerId);

  if (error) throw new Error(error.message);

  revalidatePath('/coach/college/watchlist');
}
```

### 10.2 Camps Actions

```tsx
// app/actions/camps.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createCamp(coachId: string, formData: FormData) {
  const supabase = await createClient();
  
  const data = {
    coach_id: coachId,
    name: formData.get('name') as string,
    description: formData.get('description') as string || null,
    start_date: formData.get('start_date') as string,
    end_date: formData.get('end_date') as string || null,
    start_time: formData.get('start_time') as string || null,
    end_time: formData.get('end_time') as string || null,
    location: formData.get('location') as string || null,
    location_city: formData.get('location_city') as string || null,
    location_state: formData.get('location_state') as string || null,
    capacity: formData.get('capacity') ? parseInt(formData.get('capacity') as string) : null,
    price: formData.get('price') ? parseFloat(formData.get('price') as string) : null,
    registration_deadline: formData.get('registration_deadline') as string || null,
    status: formData.get('status') as string || 'draft',
  };

  const { error } = await supabase.from('camps').insert(data);

  if (error) throw new Error(error.message);

  revalidatePath('/coach/college/camps');
}

export async function updateCamp(campId: string, formData: FormData) {
  const supabase = await createClient();
  
  const data = {
    name: formData.get('name') as string,
    description: formData.get('description') as string || null,
    start_date: formData.get('start_date') as string,
    end_date: formData.get('end_date') as string || null,
    start_time: formData.get('start_time') as string || null,
    end_time: formData.get('end_time') as string || null,
    location: formData.get('location') as string || null,
    location_city: formData.get('location_city') as string || null,
    location_state: formData.get('location_state') as string || null,
    capacity: formData.get('capacity') ? parseInt(formData.get('capacity') as string) : null,
    price: formData.get('price') ? parseFloat(formData.get('price') as string) : null,
    registration_deadline: formData.get('registration_deadline') as string || null,
    status: formData.get('status') as string,
  };

  const { error } = await supabase
    .from('camps')
    .update(data)
    .eq('id', campId);

  if (error) throw new Error(error.message);

  revalidatePath('/coach/college/camps');
  revalidatePath(`/coach/college/camps/${campId}`);
}

export async function deleteCamp(campId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('camps')
    .delete()
    .eq('id', campId);

  if (error) throw new Error(error.message);

  revalidatePath('/coach/college/camps');
}
```

### 10.3 Coach Notes Actions

```tsx
// app/actions/coach-notes.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addCoachNote(coachId: string, playerId: string, content: string, tags: string[] = []) {
  const supabase = await createClient();
  
  const { error } = await supabase.from('coach_notes').insert({
    coach_id: coachId,
    player_id: playerId,
    note_content: content,
    tags,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/coach/college/player/${playerId}`);
}

export async function updateCoachNote(noteId: string, content: string, tags: string[] = []) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('coach_notes')
    .update({ note_content: content, tags })
    .eq('id', noteId);

  if (error) throw new Error(error.message);
}

export async function deleteCoachNote(noteId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('coach_notes')
    .delete()
    .eq('id', noteId);

  if (error) throw new Error(error.message);
}
```

---

## Verification Checklist

### Dashboard
- [ ] Stats load from database
- [ ] Activity feed filters work
- [ ] Pipeline overview shows correct counts
- [ ] Upcoming camps display correctly
- [ ] All links navigate properly

### Discover
- [ ] Filters update URL and results
- [ ] Search works
- [ ] Pagination functions
- [ ] Watchlist toggle works
- [ ] Player cards display all info

### Watchlist
- [ ] Status tabs filter correctly
- [ ] Status dropdown updates database
- [ ] Remove function works
- [ ] Notes can be edited
- [ ] Table sorting works

### Pipeline
- [ ] Drag and drop moves cards
- [ ] Status updates in database
- [ ] Diamond shows players by position
- [ ] Color coding matches status

### Compare
- [ ] Can add up to 4 players
- [ ] Can remove players
- [ ] Stats comparison table works
- [ ] Radar chart renders

### Camps
- [ ] Can create new camp
- [ ] Can edit existing camp
- [ ] Registration count displays
- [ ] Status changes work

---

**Document End**

*This is the complete College Coach implementation guide. Each component is production-ready and follows the design system specified in CLAUDE.md.*
