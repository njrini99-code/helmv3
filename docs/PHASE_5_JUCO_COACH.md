# PHASE_5_JUCO_COACH.md

## JUCO Coach Features - Complete Implementation Guide

> **Duration:** 2-3 days
> **Prerequisites:** Phase 1 (College Coach) + Phase 2 (HS Coach) complete
> **Goal:** Fully functional JUCO Coach dual-mode experience

---

## Table of Contents

1. [Overview](#1-overview)
2. [Mode Toggle System](#2-mode-toggle-system)
3. [Dashboard (Dual Mode)](#3-dashboard-dual-mode)
4. [Academics & Eligibility](#4-academics--eligibility)
5. [Reused Components](#5-reused-components)

---

## 1. Overview

### 1.1 What Makes JUCO Unique

JUCO Coaches have a **dual role**:
1. **Recruiting Mode** - Similar to College Coaches (discover players, manage pipeline)
2. **Team Mode** - Similar to HS Coaches (manage roster, dev plans, track academics)

### 1.2 Component Reuse

| Feature | Source | Notes |
|---------|--------|-------|
| Discover | College Coach | Identical |
| Watchlist | College Coach | Identical |
| Pipeline | College Coach | Identical |
| Compare | College Coach | Identical |
| Roster | HS Coach | Add academics columns |
| Dev Plans | HS Coach | Identical |
| Videos | HS Coach | Identical |
| **Mode Toggle** | New | JUCO-specific |
| **Academics** | New | JUCO-specific |

---

## 2. Mode Toggle System

```tsx
// components/coach/juco/JUCOModeToggle.tsx
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Users, GraduationCap } from 'lucide-react';

export function JUCOModeToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'recruiting';

  const handleModeChange = (newMode: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('mode', newMode);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
      <button
        onClick={() => handleModeChange('recruiting')}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
          ${mode === 'recruiting' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}
      >
        <GraduationCap className="w-4 h-4" />
        Recruiting
      </button>
      <button
        onClick={() => handleModeChange('team')}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
          ${mode === 'team' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}
      >
        <Users className="w-4 h-4" />
        My Team
      </button>
    </div>
  );
}
```

---

## 3. Dashboard (Dual Mode)

```tsx
// app/(dashboard)/coach/juco/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { JUCOModeToggle } from '@/components/coach/juco/JUCOModeToggle';
// Reuse components from College Coach and HS Coach
import { CoachDashboardStats } from '@/components/coach/dashboard/CoachDashboardStats';
import { ActivityFeed } from '@/components/coach/dashboard/ActivityFeed';
import { PipelineOverview } from '@/components/coach/dashboard/PipelineOverview';
import { HSCoachStats } from '@/components/coach/hs-dashboard/HSCoachStats';
import { RosterOverview } from '@/components/coach/hs-dashboard/RosterOverview';
import { CollegeInterestFeed } from '@/components/coach/hs-dashboard/CollegeInterestFeed';

interface SearchParams {
  mode?: 'recruiting' | 'team';
}

export default async function JUCODashboard({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coach } = await supabase
    .from('coaches')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!coach || coach.coach_type !== 'juco') redirect('/coach/college');

  const mode = searchParams.mode || 'recruiting';

  // Fetch data based on mode (similar to College/HS coach dashboards)
  // ... data fetching logic

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header with Mode Toggle */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {/* Coach info */}
          </div>
          <JUCOModeToggle />
        </div>

        {/* Mode-specific content */}
        {mode === 'recruiting' ? (
          // Recruiting dashboard (reuse College Coach components)
          <div>
            <CoachDashboardStats profileViews={0} newFollowers={0} top5Mentions={0} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
              <div className="lg:col-span-2">
                <ActivityFeed activities={[]} />
              </div>
              <div>
                <PipelineOverview pipeline={{ watchlist: 0, high_priority: 0, offer_extended: 0, committed: 0 }} />
              </div>
            </div>
          </div>
        ) : (
          // Team dashboard (reuse HS Coach components)
          <div>
            <HSCoachStats stats={{ rosterSize: 0, activeRecruits: 0, collegeViews: 0, watchlistAdds: 0 }} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
              <div className="lg:col-span-2">
                <RosterOverview roster={[]} teamId={undefined} />
              </div>
              <div>
                <CollegeInterestFeed interests={[]} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 4. Academics & Eligibility

```tsx
// components/coach/juco/AcademicsTracker.tsx
'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  gpa: number | null;
  sat_score: number | null;
  act_score: number | null;
}

export function AcademicsTracker({ roster }: { roster: { player: Player }[] }) {
  const [filter, setFilter] = useState<'all' | 'eligible' | 'at_risk' | 'ineligible'>('all');

  const getStatus = (gpa: number | null) => {
    if (!gpa) return 'unknown';
    if (gpa >= 2.5) return 'eligible';
    if (gpa >= 2.0) return 'at_risk';
    return 'ineligible';
  };

  const filtered = filter === 'all' 
    ? roster 
    : roster.filter(r => getStatus(r.player.gpa) === filter);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      {/* Filter tabs */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex gap-2">
          {['all', 'eligible', 'at_risk', 'ineligible'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg
                ${filter === f ? 'bg-green-50 text-green-700' : 'text-slate-500'}`}
            >
              {f === 'at_risk' ? 'At Risk' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500">Player</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500">GPA</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filtered.map(({ player }) => {
            const status = getStatus(player.gpa);
            return (
              <tr key={player.id}>
                <td className="px-6 py-4 text-sm text-slate-900">
                  {player.first_name} {player.last_name}
                </td>
                <td className="px-6 py-4 text-sm font-semibold">
                  {player.gpa?.toFixed(2) || 'N/A'}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full
                    ${status === 'eligible' ? 'bg-green-100 text-green-700' :
                      status === 'at_risk' ? 'bg-amber-100 text-amber-700' :
                      status === 'ineligible' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-600'}`}
                  >
                    {status === 'at_risk' ? 'At Risk' : status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 5. Reused Components

JUCO Coach reuses these pages directly from other coaches:

### From College Coach (Phase 1):
- `/coach/juco/discover` → Copy from `/coach/college/discover`
- `/coach/juco/watchlist` → Copy from `/coach/college/watchlist`
- `/coach/juco/pipeline` → Copy from `/coach/college/pipeline`
- `/coach/juco/compare` → Copy from `/coach/college/compare`

### From HS Coach (Phase 2):
- `/coach/juco/roster` → Copy from `/coach/high-school/roster` (add GPA column)
- `/coach/juco/dev-plans` → Copy from `/coach/high-school/dev-plans`
- `/coach/juco/videos` → Copy from `/coach/high-school/videos`
- `/coach/juco/team` → Copy from `/coach/high-school/team-settings`

### Navigation Config

```tsx
// lib/navigation/juco-nav.ts
export const getJUCONavItems = (mode: 'recruiting' | 'team') => {
  const base = '/coach/juco';
  
  if (mode === 'recruiting') {
    return [
      { label: 'Dashboard', href: `${base}?mode=recruiting`, icon: 'LayoutDashboard' },
      { label: 'Discover', href: `${base}/discover`, icon: 'Search' },
      { label: 'Watchlist', href: `${base}/watchlist`, icon: 'Heart' },
      { label: 'Pipeline', href: `${base}/pipeline`, icon: 'GitBranch' },
      { label: 'Compare', href: `${base}/compare`, icon: 'Users' },
    ];
  }
  
  return [
    { label: 'Dashboard', href: `${base}?mode=team`, icon: 'LayoutDashboard' },
    { label: 'Roster', href: `${base}/roster`, icon: 'Users' },
    { label: 'Videos', href: `${base}/videos`, icon: 'Video' },
    { label: 'Dev Plans', href: `${base}/dev-plans`, icon: 'ClipboardList' },
    { label: 'Academics', href: `${base}/academics`, icon: 'BookOpen' },
    { label: 'Interest', href: `${base}/interest`, icon: 'TrendingUp' },
  ];
};
```

---

**Document End**

*JUCO Coach is primarily a composition of College Coach and HS Coach features with the Mode Toggle as the key new component.*
