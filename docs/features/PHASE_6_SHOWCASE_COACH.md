# PHASE_6_SHOWCASE_COACH.md

## Showcase Coach - Multi-Team Management

> **Duration:** 2-3 days | **Prerequisites:** Phase 2 (HS Coach) complete

---

## Overview

Showcase Coaches manage **multiple teams** under one organization. Key unique features:

1. **Team Switcher** - Quick context switching between teams
2. **Organization Dashboard** - Overview of all teams
3. **Events Management** - Tournament/showcase scheduling

Most features reuse HS Coach components with team context.

---

## Team Switcher Component

```tsx
// components/coach/showcase/TeamSwitcher.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, Plus, Building } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  player_count?: number;
}

export function TeamSwitcher({ teams, currentTeamId, orgName }: {
  teams: Team[];
  currentTeamId?: string;
  orgName: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = teams.find(t => t.id === currentTeamId);
  const isOrgView = !currentTeamId;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-200 
                   rounded-xl hover:border-slate-300 min-w-[200px]"
      >
        <Building className="w-5 h-5 text-green-600" />
        <span className="text-sm font-medium text-slate-900">
          {current?.name || 'All Teams'}
        </span>
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl border shadow-lg py-2 z-50">
          <button
            onClick={() => { router.push('/coach/showcase'); setIsOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
          >
            <Building className="w-5 h-5 text-green-600" />
            <span>All Teams</span>
            {isOrgView && <Check className="w-4 h-4 text-green-600 ml-auto" />}
          </button>
          
          <div className="border-t my-2" />
          
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => { router.push(`/coach/showcase/team/${team.id}`); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
            >
              <span className="text-sm">{team.name}</span>
              <span className="text-xs text-slate-400 ml-auto">
                {team.player_count || 0} players
              </span>
              {currentTeamId === team.id && <Check className="w-4 h-4 text-green-600" />}
            </button>
          ))}
          
          <div className="border-t my-2" />
          
          <button
            onClick={() => { router.push('/coach/showcase/teams/new'); setIsOpen(false); }}
            className="w-full flex items-center gap-2 px-4 py-2 text-green-600 hover:bg-green-50"
          >
            <Plus className="w-4 h-4" />
            Create New Team
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Route Structure

```
/coach/showcase                    # Org dashboard (all teams overview)
/coach/showcase/teams              # Teams list
/coach/showcase/teams/new          # Create team
/coach/showcase/team/[teamId]      # Team dashboard (reuse HS components)
/coach/showcase/team/[teamId]/roster
/coach/showcase/team/[teamId]/videos
/coach/showcase/team/[teamId]/dev-plans
/coach/showcase/events             # Events list
/coach/showcase/events/new         # Create event
/coach/showcase/events/[eventId]   # Event detail
```

---

## Component Reuse

| Feature | Source | Notes |
|---------|--------|-------|
| Team Dashboard | HS Coach | Add TeamSwitcher to header |
| Roster | HS Coach | Filter by team_id |
| Dev Plans | HS Coach | Filter by team_id |
| Videos | HS Coach | Filter by team_id |
| Join Links | HS Coach | Per-team invitations |
| **Team Switcher** | New | Showcase-specific |
| **Org Dashboard** | New | Showcase-specific |
| **Events** | New | Showcase-specific |

---

## Navigation Config

```tsx
export const getShowcaseNavItems = (teamId?: string) => {
  const base = teamId ? `/coach/showcase/team/${teamId}` : '/coach/showcase';
  
  if (!teamId) {
    // Org-level nav
    return [
      { label: 'Dashboard', href: '/coach/showcase', icon: 'LayoutDashboard' },
      { label: 'Teams', href: '/coach/showcase/teams', icon: 'Layers' },
      { label: 'Events', href: '/coach/showcase/events', icon: 'Calendar' },
      { label: 'Organization', href: '/coach/showcase/org-profile', icon: 'Building' },
      { label: 'Settings', href: '/coach/showcase/settings', icon: 'Settings' },
    ];
  }
  
  // Team-level nav
  return [
    { label: 'Dashboard', href: base, icon: 'LayoutDashboard' },
    { label: 'Roster', href: `${base}/roster`, icon: 'Users' },
    { label: 'Videos', href: `${base}/videos`, icon: 'Video' },
    { label: 'Dev Plans', href: `${base}/dev-plans`, icon: 'ClipboardList' },
    { label: 'Calendar', href: `${base}/calendar`, icon: 'Calendar' },
    { label: 'Messages', href: `${base}/messages`, icon: 'MessageSquare' },
  ];
};
```

---

**Document End**
