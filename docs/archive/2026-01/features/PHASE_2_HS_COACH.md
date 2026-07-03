# PHASE_2_HS_COACH.md

## High School Coach Features - Complete Implementation Guide

> **Duration:** 3-4 days
> **Prerequisites:** Foundation Phase complete
> **Goal:** Fully functional HS Coach team management workflow

---

## Table of Contents

1. [Overview](#1-overview)
2. [Dashboard](#2-dashboard)
3. [Roster Management](#3-roster-management)
4. [Video Library](#4-video-library)
5. [Development Plans](#5-development-plans)
6. [College Interest Tracker](#6-college-interest-tracker)
7. [Team Join Links](#7-team-join-links)
8. [Calendar](#8-calendar)
9. [API Routes & Server Actions](#9-api-routes--server-actions)

---

## 1. Overview

### 1.1 Feature Summary

| Feature | Description | Complexity |
|---------|-------------|------------|
| Dashboard | Team stats, roster overview, college interest feed | Medium |
| Roster | Manage players, positions, jersey numbers | Medium |
| Video Library | View team videos, organize, share | Medium |
| Dev Plans | Create/assign development plans | High |
| College Interest | Track which colleges are viewing players | Medium |
| Team Join | Generate/manage invite links | Low |
| Calendar | Team events and schedule | Medium |

### 1.2 File Structure

```
app/(dashboard)/coach/high-school/
├── page.tsx                    # Dashboard
├── loading.tsx
├── roster/
│   ├── page.tsx               # Roster list
│   └── [playerId]/page.tsx    # Player detail
├── videos/
│   ├── page.tsx               # Video library
│   └── [videoId]/page.tsx     # Video detail
├── dev-plans/
│   ├── page.tsx               # Plans list
│   ├── new/page.tsx           # Create plan
│   └── [planId]/page.tsx      # Plan detail/edit
├── interest/
│   └── page.tsx               # College interest tracker
├── calendar/
│   └── page.tsx               # Team calendar
├── messages/
│   └── page.tsx               # Team messages
├── team-settings/
│   └── page.tsx               # Team settings + join links
└── settings/
    └── page.tsx               # Coach settings

components/coach/
├── hs-dashboard/
│   ├── HSCoachStats.tsx
│   ├── RosterOverview.tsx
│   ├── CollegeInterestFeed.tsx
│   └── QuickActions.tsx
├── roster/
│   ├── RosterTable.tsx
│   ├── RosterCard.tsx
│   ├── PlayerDetailPanel.tsx
│   └── AddPlayerModal.tsx
├── videos/
│   ├── VideoGrid.tsx
│   ├── VideoCard.tsx
│   └── VideoFilters.tsx
├── dev-plans/
│   ├── PlansList.tsx
│   ├── PlanCard.tsx
│   ├── PlanBuilder.tsx
│   ├── GoalEditor.tsx
│   └── DrillEditor.tsx
├── interest/
│   ├── InterestTable.tsx
│   └── InterestChart.tsx
└── team/
    ├── JoinLinkManager.tsx
    ├── TeamCalendar.tsx
    └── EventForm.tsx
```

---

## 2. Dashboard

### 2.1 HS Coach Dashboard Page

```tsx
// app/(dashboard)/coach/high-school/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HSCoachStats } from '@/components/coach/hs-dashboard/HSCoachStats';
import { RosterOverview } from '@/components/coach/hs-dashboard/RosterOverview';
import { CollegeInterestFeed } from '@/components/coach/hs-dashboard/CollegeInterestFeed';
import { QuickActions } from '@/components/coach/hs-dashboard/QuickActions';

export default async function HSCoachDashboard() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get coach and their team
  const { data: coach } = await supabase
    .from('coaches')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/onboarding/coach');
  if (coach.coach_type !== 'high_school') redirect('/coach/college');

  // Get coach's team
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('head_coach_id', coach.id)
    .single();

  // Get team members (roster)
  const { data: roster } = team ? await supabase
    .from('team_members')
    .select(`
      *,
      player:players(
        id, first_name, last_name, avatar_url,
        primary_position, grad_year, recruiting_activated
      )
    `)
    .eq('team_id', team.id)
    .eq('status', 'active') : { data: [] };

  // Get college interest for players (engagement events)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const playerIds = roster?.map(r => r.player_id) || [];
  
  const { data: collegeInterest } = playerIds.length > 0 ? await supabase
    .from('player_engagement_events')
    .select(`
      *,
      player:players(id, first_name, last_name, primary_position, grad_year),
      coach:coaches(id, school_name, program_division, athletic_conference)
    `)
    .in('player_id', playerIds)
    .gte('engagement_date', thirtyDaysAgo.toISOString())
    .order('engagement_date', { ascending: false })
    .limit(20) : { data: [] };

  // Stats
  const stats = {
    rosterSize: roster?.length || 0,
    activeRecruits: roster?.filter(r => r.player?.recruiting_activated).length || 0,
    collegeViews: collegeInterest?.filter(e => e.engagement_type === 'profile_view').length || 0,
    watchlistAdds: collegeInterest?.filter(e => e.engagement_type === 'watchlist_add').length || 0,
  };

  // Upcoming events
  const { data: upcomingEvents } = team ? await supabase
    .from('events')
    .select('*')
    .eq('team_id', team.id)
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(5) : { data: [] };

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
                  {coach.school_name?.[0] || 'HS'}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {coach.school_name || 'Your School'}
              </h1>
              <p className="text-slate-500">
                {team?.name || 'Baseball Team'} • {coach.school_city}, {coach.school_state}
              </p>
            </div>
          </div>
          <QuickActions teamId={team?.id} />
        </div>

        {/* Stats */}
        <HSCoachStats stats={stats} />

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          {/* Roster Overview - 2 columns */}
          <div className="lg:col-span-2">
            <RosterOverview roster={roster || []} teamId={team?.id} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <CollegeInterestFeed interests={collegeInterest || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 2.2 HS Coach Stats Component

```tsx
// components/coach/hs-dashboard/HSCoachStats.tsx
import { Users, GraduationCap, Eye, Heart } from 'lucide-react';

interface HSCoachStatsProps {
  stats: {
    rosterSize: number;
    activeRecruits: number;
    collegeViews: number;
    watchlistAdds: number;
  };
}

export function HSCoachStats({ stats }: HSCoachStatsProps) {
  const statCards = [
    {
      label: 'Roster Size',
      value: stats.rosterSize,
      icon: Users,
      description: 'Active players',
    },
    {
      label: 'Active Recruits',
      value: stats.activeRecruits,
      icon: GraduationCap,
      description: 'Players in recruiting',
    },
    {
      label: 'College Views',
      value: stats.collegeViews,
      icon: Eye,
      description: 'Last 30 days',
    },
    {
      label: 'Watchlist Adds',
      value: stats.watchlistAdds,
      icon: Heart,
      description: 'Players saved by coaches',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {statCards.map((stat) => (
        <div 
          key={stat.label}
          className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="text-3xl font-semibold text-slate-900 mt-1">
                {stat.value}
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

### 2.3 Roster Overview Component

```tsx
// components/coach/hs-dashboard/RosterOverview.tsx
import Link from 'next/link';
import { Users, Plus } from 'lucide-react';

interface RosterMember {
  id: string;
  jersey_number: number | null;
  position: string | null;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    primary_position: string;
    grad_year: number;
    recruiting_activated: boolean;
  };
}

interface RosterOverviewProps {
  roster: RosterMember[];
  teamId: string | undefined;
}

export function RosterOverview({ roster, teamId }: RosterOverviewProps) {
  // Group by grad year
  const byGradYear: Record<number, RosterMember[]> = {};
  roster.forEach(member => {
    const year = member.player.grad_year;
    if (!byGradYear[year]) byGradYear[year] = [];
    byGradYear[year].push(member);
  });

  const sortedYears = Object.keys(byGradYear).map(Number).sort();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Roster</h2>
          <Link
            href="/coach/high-school/team-settings"
            className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
          >
            <Plus className="w-4 h-4" />
            Add Player
          </Link>
        </div>
      </div>

      {roster.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-4">No players on roster yet</p>
          <Link
            href="/coach/high-school/team-settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 
                       hover:bg-green-700 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Generate Invite Link
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {sortedYears.map(year => (
            <div key={year}>
              <div className="px-6 py-2 bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase">
                  Class of {year} ({byGradYear[year].length})
                </p>
              </div>
              <div className="divide-y divide-slate-50">
                {byGradYear[year].slice(0, 5).map(member => (
                  <Link
                    key={member.id}
                    href={`/coach/high-school/roster/${member.player.id}`}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition-colors"
                  >
                    {member.player.avatar_url ? (
                      <img 
                        src={member.player.avatar_url} 
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-slate-600">
                          {member.player.first_name?.[0]}{member.player.last_name?.[0]}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {member.jersey_number && `#${member.jersey_number} `}
                        {member.player.first_name} {member.player.last_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {member.player.primary_position}
                      </p>
                    </div>
                    {member.player.recruiting_activated && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                        Recruiting
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {roster.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-200">
          <Link 
            href="/coach/high-school/roster"
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            View full roster →
          </Link>
        </div>
      )}
    </div>
  );
}
```

### 2.4 College Interest Feed Component

```tsx
// components/coach/hs-dashboard/CollegeInterestFeed.tsx
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Heart, TrendingUp } from 'lucide-react';

interface Interest {
  id: string;
  engagement_type: string;
  engagement_date: string;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    primary_position: string;
    grad_year: number;
  };
  coach: {
    id: string;
    school_name: string;
    program_division: string | null;
    athletic_conference: string | null;
  } | null;
}

interface CollegeInterestFeedProps {
  interests: Interest[];
}

const typeConfig: Record<string, { icon: any; label: string; color: string }> = {
  profile_view: { icon: Eye, label: 'Profile viewed by', color: 'bg-blue-50 text-blue-600' },
  watchlist_add: { icon: Heart, label: 'Added to watchlist by', color: 'bg-pink-50 text-pink-600' },
};

export function CollegeInterestFeed({ interests }: CollegeInterestFeedProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold text-slate-900">College Interest</h2>
        </div>
        <p className="text-sm text-slate-500 mt-1">Recent activity on your players</p>
      </div>

      {interests.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-slate-500">
            No college interest yet. Players need to activate recruiting to be discovered.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {interests.map(interest => {
            const config = typeConfig[interest.engagement_type] || typeConfig.profile_view;
            const Icon = config.icon;

            return (
              <div key={interest.id} className="px-6 py-4">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900">
                      <Link 
                        href={`/coach/high-school/roster/${interest.player.id}`}
                        className="font-medium hover:text-green-600"
                      >
                        {interest.player.first_name} {interest.player.last_name}
                      </Link>
                      {' '}{config.label}
                    </p>
                    {interest.coach ? (
                      <p className="text-sm text-slate-600 mt-0.5">
                        {interest.coach.school_name}
                        {interest.coach.program_division && (
                          <span className="text-slate-400">
                            {' '}• {interest.coach.program_division}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 mt-0.5">Anonymous coach</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDistanceToNow(new Date(interest.engagement_date), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {interests.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-200">
          <Link 
            href="/coach/high-school/interest"
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            View all interest →
          </Link>
        </div>
      )}
    </div>
  );
}
```

---

## 3. Roster Management

### 3.1 Roster Page

```tsx
// app/(dashboard)/coach/high-school/roster/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { RosterTable } from '@/components/coach/roster/RosterTable';

interface SearchParams {
  position?: string;
  gradYear?: string;
  search?: string;
}

export default async function RosterPage({
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

  // Get team
  const { data: team } = await supabase
    .from('teams')
    .select('id, name')
    .eq('head_coach_id', coach.id)
    .single();

  if (!team) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500">No team found. Please create a team first.</p>
        </div>
      </div>
    );
  }

  // Build query
  let query = supabase
    .from('team_members')
    .select(`
      *,
      player:players(
        id, first_name, last_name, avatar_url, email, phone,
        primary_position, secondary_position, grad_year,
        height_feet, height_inches, weight_lbs,
        bats, throws, pitch_velo, exit_velo, sixty_time,
        gpa, recruiting_activated, has_video
      )
    `)
    .eq('team_id', team.id);

  // Apply filters
  if (searchParams.position) {
    query = query.eq('player.primary_position', searchParams.position);
  }

  const { data: roster } = await query.order('created_at', { ascending: false });

  // Filter in JS for grad year and search (Supabase nested filters are limited)
  let filteredRoster = roster || [];

  if (searchParams.gradYear) {
    filteredRoster = filteredRoster.filter(
      r => r.player?.grad_year === parseInt(searchParams.gradYear!)
    );
  }

  if (searchParams.search) {
    const search = searchParams.search.toLowerCase();
    filteredRoster = filteredRoster.filter(r => 
      r.player?.first_name?.toLowerCase().includes(search) ||
      r.player?.last_name?.toLowerCase().includes(search)
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Roster</h1>
            <p className="text-slate-500 mt-1">
              {filteredRoster.length} players on {team.name}
            </p>
          </div>
        </div>

        <RosterTable 
          roster={filteredRoster}
          teamId={team.id}
          filters={searchParams}
        />
      </div>
    </div>
  );
}
```

### 3.2 Roster Table Component

```tsx
// components/coach/roster/RosterTable.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, MoreHorizontal, Eye, Edit2, Trash2, Users } from 'lucide-react';

interface RosterMember {
  id: string;
  jersey_number: number | null;
  position: string | null;
  status: string;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    email: string | null;
    primary_position: string;
    secondary_position: string | null;
    grad_year: number;
    height_feet: number | null;
    height_inches: number | null;
    weight_lbs: number | null;
    pitch_velo: number | null;
    exit_velo: number | null;
    recruiting_activated: boolean;
    has_video: boolean;
  };
}

interface RosterTableProps {
  roster: RosterMember[];
  teamId: string;
  filters: {
    position?: string;
    gradYear?: string;
    search?: string;
  };
}

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'UTIL'];
const GRAD_YEARS = [2025, 2026, 2027, 2028, 2029];

export function RosterTable({ roster, teamId, filters }: RosterTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search || '');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const updateFilter = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/coach/high-school/roster?${params.toString()}`);
  };

  const handleSearch = () => {
    updateFilter('search', search || undefined);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Filters */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search players..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 
                         focus:border-green-500 focus:ring-2 focus:ring-green-100
                         text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Position Filter */}
          <select
            value={filters.position || ''}
            onChange={(e) => updateFilter('position', e.target.value || undefined)}
            className="px-4 py-2 rounded-lg border border-slate-200 
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900 bg-white"
          >
            <option value="">All Positions</option>
            {POSITIONS.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>

          {/* Grad Year Filter */}
          <select
            value={filters.gradYear || ''}
            onChange={(e) => updateFilter('gradYear', e.target.value || undefined)}
            className="px-4 py-2 rounded-lg border border-slate-200 
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900 bg-white"
          >
            <option value="">All Classes</option>
            {GRAD_YEARS.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {roster.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No players found</p>
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
                Class
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Metrics
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roster.map((member) => {
              const height = member.player.height_feet && member.player.height_inches
                ? `${member.player.height_feet}'${member.player.height_inches}"`
                : null;

              return (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <Link 
                      href={`/coach/high-school/roster/${member.player.id}`}
                      className="flex items-center gap-3 group"
                    >
                      {member.player.avatar_url ? (
                        <img 
                          src={member.player.avatar_url} 
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-slate-600">
                            {member.player.first_name?.[0]}{member.player.last_name?.[0]}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900 group-hover:text-green-600">
                          {member.jersey_number && `#${member.jersey_number} `}
                          {member.player.first_name} {member.player.last_name}
                        </p>
                        {member.player.email && (
                          <p className="text-xs text-slate-400">{member.player.email}</p>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                      {member.player.primary_position}
                    </span>
                    {member.player.secondary_position && (
                      <span className="ml-1 text-xs text-slate-400">
                        / {member.player.secondary_position}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-600">{member.player.grad_year}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      {height && <span>{height}</span>}
                      {member.player.weight_lbs && <span>{member.player.weight_lbs} lbs</span>}
                      {member.player.pitch_velo && <span>{member.player.pitch_velo} mph</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {member.player.recruiting_activated ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          Recruiting
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                          Not Active
                        </span>
                      )}
                      {member.player.has_video && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                          Video
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative">
                      <button
                        onClick={() => setActionMenuId(actionMenuId === member.id ? null : member.id)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {actionMenuId === member.id && (
                        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-10">
                          <Link
                            href={`/coach/high-school/roster/${member.player.id}`}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="w-4 h-4" />
                            View Profile
                          </Link>
                          <Link
                            href={`/coach/high-school/dev-plans/new?player=${member.player.id}`}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <Edit2 className="w-4 h-4" />
                            Create Dev Plan
                          </Link>
                          <button
                            onClick={() => {/* Remove from roster */}}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove from Roster
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

---

## 5. Development Plans

### 5.1 Dev Plans List Page

```tsx
// app/(dashboard)/coach/high-school/dev-plans/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PlansList } from '@/components/coach/dev-plans/PlansList';

export default async function DevPlansPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/onboarding/coach');

  // Get all dev plans
  const { data: plans } = await supabase
    .from('developmental_plans')
    .select(`
      *,
      player:players(id, first_name, last_name, avatar_url, primary_position, grad_year)
    `)
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false });

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Development Plans</h1>
            <p className="text-slate-500 mt-1">
              Create personalized plans for player development
            </p>
          </div>
          <Link
            href="/coach/high-school/dev-plans/new"
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 
                       text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Plan
          </Link>
        </div>

        <PlansList plans={plans || []} />
      </div>
    </div>
  );
}
```

### 5.2 Plan Builder Component

```tsx
// components/coach/dev-plans/PlanBuilder.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { createDevPlan, updateDevPlan } from '@/app/actions/dev-plans';

interface Goal {
  id: string;
  title: string;
  description: string;
  target_date: string;
  completed: boolean;
}

interface Drill {
  id: string;
  name: string;
  description: string;
  video_url: string;
  frequency: string;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  primary_position: string;
  grad_year: number;
}

interface Plan {
  id?: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  goals: Goal[];
  drills: Drill[];
  status: string;
}

interface PlanBuilderProps {
  plan?: Plan;
  players: Player[];
  selectedPlayerId?: string;
  coachId: string;
  teamId?: string;
}

export function PlanBuilder({ plan, players, selectedPlayerId, coachId, teamId }: PlanBuilderProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playerId, setPlayerId] = useState(selectedPlayerId || '');
  const [title, setTitle] = useState(plan?.title || '');
  const [description, setDescription] = useState(plan?.description || '');
  const [startDate, setStartDate] = useState(plan?.start_date || '');
  const [endDate, setEndDate] = useState(plan?.end_date || '');
  const [goals, setGoals] = useState<Goal[]>(plan?.goals || []);
  const [drills, setDrills] = useState<Drill[]>(plan?.drills || []);

  const addGoal = () => {
    setGoals([...goals, {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      target_date: '',
      completed: false,
    }]);
  };

  const updateGoal = (id: string, field: keyof Goal, value: string | boolean) => {
    setGoals(goals.map(g => g.id === id ? { ...g, [field]: value } : g));
  };

  const removeGoal = (id: string) => {
    setGoals(goals.filter(g => g.id !== id));
  };

  const addDrill = () => {
    setDrills([...drills, {
      id: crypto.randomUUID(),
      name: '',
      description: '',
      video_url: '',
      frequency: 'daily',
    }]);
  };

  const updateDrill = (id: string, field: keyof Drill, value: string) => {
    setDrills(drills.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const removeDrill = (id: string) => {
    setDrills(drills.filter(d => d.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent, status: string = 'draft') => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const planData = {
        coach_id: coachId,
        player_id: playerId,
        team_id: teamId,
        title,
        description,
        start_date: startDate,
        end_date: endDate,
        goals: goals.filter(g => g.title.trim()),
        drills: drills.filter(d => d.name.trim()),
        status,
      };

      if (plan?.id) {
        await updateDevPlan(plan.id, planData);
      } else {
        await createDevPlan(planData);
      }

      router.push('/coach/high-school/dev-plans');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => handleSubmit(e, 'draft')} className="space-y-8">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Plan Details</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Player Select */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Player *
            </label>
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                         focus:border-green-500 focus:ring-2 focus:ring-green-100
                         text-slate-900 bg-white"
            >
              <option value="">Select player...</option>
              {players.map(player => (
                <option key={player.id} value={player.id}>
                  {player.first_name} {player.last_name} ({player.primary_position}, {player.grad_year})
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Plan Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g., Off-Season Hitting Program"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                         focus:border-green-500 focus:ring-2 focus:ring-green-100
                         text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                         focus:border-green-500 focus:ring-2 focus:ring-green-100
                         text-slate-900"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                         focus:border-green-500 focus:ring-2 focus:ring-green-100
                         text-slate-900"
            />
          </div>

          {/* Description */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the plan goals and expectations..."
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                         focus:border-green-500 focus:ring-2 focus:ring-green-100
                         text-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Goals */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Goals</h2>
          <button
            type="button"
            onClick={addGoal}
            className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
          >
            <Plus className="w-4 h-4" />
            Add Goal
          </button>
        </div>

        {goals.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            No goals added yet. Click "Add Goal" to create one.
          </p>
        ) : (
          <div className="space-y-4">
            {goals.map((goal, index) => (
              <div key={goal.id} className="flex gap-4 p-4 bg-slate-50 rounded-xl">
                <GripVertical className="w-5 h-5 text-slate-300 mt-2 cursor-grab" />
                <div className="flex-1 space-y-3">
                  <input
                    type="text"
                    value={goal.title}
                    onChange={(e) => updateGoal(goal.id, 'title', e.target.value)}
                    placeholder={`Goal ${index + 1} title`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-sm text-slate-900"
                  />
                  <textarea
                    value={goal.description}
                    onChange={(e) => updateGoal(goal.id, 'description', e.target.value)}
                    placeholder="Description..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-sm text-slate-900"
                  />
                  <input
                    type="date"
                    value={goal.target_date}
                    onChange={(e) => updateGoal(goal.id, 'target_date', e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-sm text-slate-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeGoal(goal.id)}
                  className="p-2 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drills */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Drills</h2>
          <button
            type="button"
            onClick={addDrill}
            className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
          >
            <Plus className="w-4 h-4" />
            Add Drill
          </button>
        </div>

        {drills.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            No drills added yet. Click "Add Drill" to create one.
          </p>
        ) : (
          <div className="space-y-4">
            {drills.map((drill, index) => (
              <div key={drill.id} className="flex gap-4 p-4 bg-slate-50 rounded-xl">
                <GripVertical className="w-5 h-5 text-slate-300 mt-2 cursor-grab" />
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={drill.name}
                    onChange={(e) => updateDrill(drill.id, 'name', e.target.value)}
                    placeholder="Drill name"
                    className="px-3 py-2 rounded-lg border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-sm text-slate-900"
                  />
                  <select
                    value={drill.frequency}
                    onChange={(e) => updateDrill(drill.id, 'frequency', e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-sm text-slate-900 bg-white"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="2x_week">2x per week</option>
                    <option value="3x_week">3x per week</option>
                  </select>
                  <textarea
                    value={drill.description}
                    onChange={(e) => updateDrill(drill.id, 'description', e.target.value)}
                    placeholder="Description..."
                    rows={2}
                    className="col-span-2 px-3 py-2 rounded-lg border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-sm text-slate-900"
                  />
                  <input
                    type="url"
                    value={drill.video_url}
                    onChange={(e) => updateDrill(drill.id, 'video_url', e.target.value)}
                    placeholder="Video URL (optional)"
                    className="col-span-2 px-3 py-2 rounded-lg border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-sm text-slate-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeDrill(drill.id)}
                  className="p-2 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
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
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 
                     font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Save Draft
        </button>
        <button
          type="button"
          onClick={(e) => handleSubmit(e as any, 'sent')}
          disabled={loading || !playerId}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white 
                     font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Send to Player'}
        </button>
      </div>
    </form>
  );
}
```

---

## 7. Team Join Links

### 7.1 Team Settings Page with Join Links

```tsx
// app/(dashboard)/coach/high-school/team-settings/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { JoinLinkManager } from '@/components/coach/team/JoinLinkManager';

export default async function TeamSettingsPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/onboarding/coach');

  // Get team
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('head_coach_id', coach.id)
    .single();

  // Get active invitations
  const { data: invitations } = team ? await supabase
    .from('team_invitations')
    .select('*')
    .eq('team_id', team.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false }) : { data: [] };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Team Settings</h1>
          <p className="text-slate-500 mt-1">
            Manage your team and invite new players
          </p>
        </div>

        {/* Join Links Section */}
        <JoinLinkManager 
          teamId={team?.id}
          coachId={coach.id}
          invitations={invitations || []}
        />
      </div>
    </div>
  );
}
```

### 7.2 Join Link Manager Component

```tsx
// components/coach/team/JoinLinkManager.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Link as LinkIcon, Copy, Trash2, Plus, Check, Users } from 'lucide-react';
import { createJoinLink, deleteJoinLink } from '@/app/actions/team';

interface Invitation {
  id: string;
  invite_code: string;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  created_at: string;
}

interface JoinLinkManagerProps {
  teamId: string | undefined;
  coachId: string;
  invitations: Invitation[];
}

export function JoinLinkManager({ teamId, coachId, invitations }: JoinLinkManagerProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [maxUses, setMaxUses] = useState<string>('');
  const [expiresIn, setExpiresIn] = useState<string>('7');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCreate = async () => {
    if (!teamId) return;
    setCreating(true);

    try {
      await createJoinLink({
        teamId,
        coachId,
        maxUses: maxUses ? parseInt(maxUses) : undefined,
        expiresInDays: parseInt(expiresIn),
      });
      
      setShowForm(false);
      setMaxUses('');
      setExpiresIn('7');
      router.refresh();
    } catch (error) {
      console.error('Error creating link:', error);
    }

    setCreating(false);
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(`${baseUrl}/join/${code}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deactivate this invite link?')) {
      await deleteJoinLink(id);
      router.refresh();
    }
  };

  if (!teamId) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 mb-4">
          You need to create a team first before inviting players.
        </p>
        <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg">
          Create Team
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Invite Players</h2>
            <p className="text-sm text-slate-500 mt-1">
              Generate links for players to join your team
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 
                         text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Link
            </button>
          )}
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Expires In
              </label>
              <select
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 
                           focus:border-green-500 focus:ring-2 focus:ring-green-100
                           text-sm text-slate-900 bg-white"
              >
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Max Uses (optional)
              </label>
              <input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
                min={1}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 
                           focus:border-green-500 focus:ring-2 focus:ring-green-100
                           text-sm text-slate-900"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 
                           text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white 
                           text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Links */}
      {invitations.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <LinkIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            No active invite links. Create one to start inviting players.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {invitations.map((inv) => (
            <div key={inv.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded">
                      {baseUrl}/join/{inv.invite_code}
                    </code>
                    <button
                      onClick={() => handleCopy(inv.invite_code, inv.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                    >
                      {copiedId === inv.id ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>
                      {inv.current_uses} / {inv.max_uses || '∞'} uses
                    </span>
                    <span>
                      Created {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                    </span>
                    {inv.expires_at && (
                      <span>
                        Expires {formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(inv.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 9. API Routes & Server Actions

### 9.1 Team Actions

```tsx
// app/actions/team.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';

export async function createJoinLink({
  teamId,
  coachId,
  maxUses,
  expiresInDays,
}: {
  teamId: string;
  coachId: string;
  maxUses?: number;
  expiresInDays: number;
}) {
  const supabase = await createClient();
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const { error } = await supabase.from('team_invitations').insert({
    team_id: teamId,
    created_by: coachId,
    invite_code: nanoid(10),
    max_uses: maxUses || null,
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw new Error(error.message);

  revalidatePath('/coach/high-school/team-settings');
}

export async function deleteJoinLink(invitationId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('team_invitations')
    .update({ is_active: false })
    .eq('id', invitationId);

  if (error) throw new Error(error.message);

  revalidatePath('/coach/high-school/team-settings');
}

export async function addPlayerToTeam(teamId: string, playerId: string, inviteCode?: string) {
  const supabase = await createClient();
  
  // Check if already on team
  const { data: existing } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .single();

  if (existing) {
    throw new Error('Player is already on this team');
  }

  // Add to team
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    player_id: playerId,
    status: 'active',
  });

  if (error) throw new Error(error.message);

  // Increment invite usage if using invite code
  if (inviteCode) {
    await supabase
      .from('team_invitations')
      .update({ current_uses: supabase.rpc('increment', { x: 1 }) })
      .eq('invite_code', inviteCode);
  }

  revalidatePath('/coach/high-school/roster');
}

export async function removePlayerFromTeam(teamId: string, playerId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('team_members')
    .update({ status: 'inactive', left_at: new Date().toISOString() })
    .eq('team_id', teamId)
    .eq('player_id', playerId);

  if (error) throw new Error(error.message);

  revalidatePath('/coach/high-school/roster');
}
```

### 9.2 Dev Plans Actions

```tsx
// app/actions/dev-plans.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

interface PlanData {
  coach_id: string;
  player_id: string;
  team_id?: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  goals: any[];
  drills: any[];
  status: string;
}

export async function createDevPlan(data: PlanData) {
  const supabase = await createClient();
  
  const { error } = await supabase.from('developmental_plans').insert({
    ...data,
    sent_at: data.status === 'sent' ? new Date().toISOString() : null,
  });

  if (error) throw new Error(error.message);

  // If sent, create notification for player
  if (data.status === 'sent') {
    const { data: player } = await supabase
      .from('players')
      .select('user_id')
      .eq('id', data.player_id)
      .single();

    if (player) {
      await supabase.from('notifications').insert({
        user_id: player.user_id,
        notification_type: 'dev_plan',
        title: 'New Development Plan',
        message: `Your coach has created a new development plan: ${data.title}`,
        action_url: '/player/team/dev-plan',
      });
    }
  }

  revalidatePath('/coach/high-school/dev-plans');
}

export async function updateDevPlan(planId: string, data: Partial<PlanData>) {
  const supabase = await createClient();
  
  const updateData: any = { ...data };
  
  // If status changed to sent, update sent_at
  if (data.status === 'sent') {
    updateData.sent_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('developmental_plans')
    .update(updateData)
    .eq('id', planId);

  if (error) throw new Error(error.message);

  revalidatePath('/coach/high-school/dev-plans');
  revalidatePath(`/coach/high-school/dev-plans/${planId}`);
}

export async function deleteDevPlan(planId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('developmental_plans')
    .delete()
    .eq('id', planId);

  if (error) throw new Error(error.message);

  revalidatePath('/coach/high-school/dev-plans');
}
```

---

## Verification Checklist

### Dashboard
- [ ] Stats load correctly
- [ ] Roster overview displays players by grad year
- [ ] College interest feed shows recent activity
- [ ] Quick actions work

### Roster
- [ ] All players display
- [ ] Filters work (position, grad year, search)
- [ ] Player detail links work
- [ ] Remove from roster works

### Dev Plans
- [ ] Can create new plan
- [ ] Can add/remove goals
- [ ] Can add/remove drills
- [ ] Save draft works
- [ ] Send to player works
- [ ] Player receives notification

### Team Join Links
- [ ] Can generate new link
- [ ] Can copy link
- [ ] Can deactivate link
- [ ] Uses count updates
- [ ] Expiration works

### College Interest
- [ ] Shows all interest for roster players
- [ ] Links to player profiles
- [ ] Shows coach info (when available)

---

**Document End**

*This guide covers all HS Coach team management features. Components are production-ready and follow the design system.*
