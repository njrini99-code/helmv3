# Cursor: Fix All Production Readiness Issues

## Overview

This document contains step-by-step instructions to fix all critical issues in the Helm Sports Labs codebase. Complete these in order - later fixes depend on earlier ones.

---

## ISSUE 1: Dashboard Redirect by Coach Type (P0 - CRITICAL)

### Problem
The main dashboard `/baseball/dashboard/page.tsx` shows the recruiting dashboard to ALL coaches, but only College coaches should see recruiting. HS coaches should see team dashboard, JUCO should respect mode toggle, Showcase should see org dashboard.

### File to Modify
`/src/app/baseball/(dashboard)/dashboard/page.tsx`

### Current Behavior
- All coaches see recruiting dashboard
- No redirect logic based on coach_type

### Fix Instructions

Add redirect logic at the top of the component, after the auth hooks:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
// ... other imports

export default function DashboardPage() {
  const router = useRouter();
  const { user, coach, player, loading, coachMode } = useAuth();

  // ADD THIS: Redirect based on coach type
  useEffect(() => {
    if (loading) return;
    
    if (user?.role === 'coach' && coach) {
      switch (coach.coach_type) {
        case 'high_school':
          // HS coaches always go to team dashboard
          router.replace('/baseball/dashboard/team/high-school');
          return;
        case 'showcase':
          // Showcase coaches go to team/org dashboard
          router.replace('/baseball/dashboard/team');
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
  }, [loading, user, coach, coachMode, router]);

  // Show loading while redirecting
  if (loading) return <PageLoading />;
  
  // If coach should be redirected, show loading
  if (user?.role === 'coach' && coach) {
    if (coach.coach_type === 'high_school' || 
        coach.coach_type === 'showcase' || 
        (coach.coach_type === 'juco' && coachMode === 'team')) {
      return <PageLoading />;
    }
  }

  // Rest of existing dashboard code for College coaches and JUCO in recruiting mode
  // ... existing code
}
```

### Testing
1. Login as HS coach → Should redirect to `/baseball/dashboard/team/high-school`
2. Login as Showcase coach → Should redirect to `/baseball/dashboard/team`
3. Login as JUCO coach in team mode → Should redirect to `/baseball/dashboard/team`
4. Login as JUCO coach in recruiting mode → Should stay on `/baseball/dashboard`
5. Login as College coach → Should stay on `/baseball/dashboard`

---

## ISSUE 2: JUCO Mode Toggle Dashboard Sync (P0 - CRITICAL)

### Problem
When JUCO coach toggles between recruiting and team mode, the sidebar navigation changes but they stay on the same page. They should be redirected to the appropriate dashboard.

### File to Modify
`/src/components/layout/Sidebar.tsx`

### Current Code (around line 180)
```typescript
const handleModeChange = (mode: Mode) => {
  setCoachMode(mode as 'recruiting' | 'team');
  // Redirect to appropriate dashboard based on mode and coach type
  if (mode === 'recruiting') {
    router.push('/baseball/dashboard');
  } else {
    // Team mode - redirect to coach-specific team dashboard
    if (coach?.coach_type === 'high_school') {
      router.push('/baseball/dashboard/team/high-school');
    } else {
      router.push('/baseball/dashboard/team');
    }
  }
};
```

### Fix Instructions
The current code looks correct, but verify it's actually being called. Check that:

1. The ModeToggle component is receiving `onModeChange` prop correctly
2. The `setCoachMode` function is updating the Zustand store
3. The router.push is executing

Add console logs temporarily to debug:

```typescript
const handleModeChange = (mode: Mode) => {
  console.log('Mode changing to:', mode);
  setCoachMode(mode as 'recruiting' | 'team');
  
  if (mode === 'recruiting') {
    console.log('Redirecting to recruiting dashboard');
    router.push('/baseball/dashboard');
  } else {
    console.log('Redirecting to team dashboard');
    router.push('/baseball/dashboard/team');
  }
};
```

### Additional Fix Needed
The issue might be that `/baseball/dashboard` doesn't re-check the mode on navigation. Update the dashboard page to also check on route change:

In `/src/app/baseball/(dashboard)/dashboard/page.tsx`, make sure the useEffect dependency array includes the pathname:

```typescript
import { usePathname } from 'next/navigation';

// Inside component:
const pathname = usePathname();

useEffect(() => {
  // ... redirect logic
}, [loading, user, coach, coachMode, router, pathname]); // Add pathname
```

---

## ISSUE 3: Team Context Filtering (P0 - CRITICAL)

### Problem
When Showcase coaches select a team from the team switcher, or when players have multiple teams, the data queries don't filter by the selected team. Everyone sees all data.

### Files to Modify
1. `/src/hooks/use-teams.ts` - Add selectedTeamId to state
2. `/src/stores/team-store.ts` - Create if doesn't exist
3. All team-related pages that fetch data

### Step 1: Create Team Store

Create `/src/stores/team-store.ts`:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TeamState {
  selectedTeamId: string | null;
  setSelectedTeamId: (teamId: string | null) => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      selectedTeamId: null,
      setSelectedTeamId: (teamId) => set({ selectedTeamId: teamId }),
    }),
    {
      name: 'team-storage',
    }
  )
);
```

### Step 2: Update useTeams Hook

Modify `/src/hooks/use-teams.ts`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';

export function useTeams() {
  const { coach } = useAuth();
  const { selectedTeamId, setSelectedTeamId } = useTeamStore();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (coach?.id) {
      fetchTeams();
    }
  }, [coach?.id]);

  async function fetchTeams() {
    const supabase = createClient();
    
    const { data } = await supabase
      .from('team_coach_staff')
      .select('team_id, teams(*)')
      .eq('coach_id', coach!.id);

    const teamList = data?.map(d => d.teams).filter(Boolean) || [];
    setTeams(teamList);
    
    // Auto-select first team if none selected
    if (!selectedTeamId && teamList.length > 0) {
      setSelectedTeamId(teamList[0].id);
    }
    
    setLoading(false);
  }

  const selectedTeam = teams.find(t => t.id === selectedTeamId) || teams[0] || null;
  const hasMultipleTeams = teams.length > 1;

  return {
    teams,
    selectedTeam,
    selectedTeamId,
    setSelectedTeamId,
    hasMultipleTeams,
    loading,
  };
}
```

### Step 3: Update Team Switcher Component

Modify `/src/components/layout/team-switcher.tsx`:

```typescript
'use client';

import { useTeams } from '@/hooks/use-teams';
import { Select } from '@/components/ui/select';

interface TeamSwitcherProps {
  collapsed?: boolean;
}

export function TeamSwitcher({ collapsed }: TeamSwitcherProps) {
  const { teams, selectedTeamId, setSelectedTeamId, hasMultipleTeams } = useTeams();

  if (!hasMultipleTeams) return null;

  const options = teams.map(team => ({
    value: team.id,
    label: team.name,
  }));

  if (collapsed) {
    // Show abbreviated version when sidebar collapsed
    return (
      <div className="px-2 py-2">
        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
          <span className="text-xs font-bold text-green-700">
            {teams.find(t => t.id === selectedTeamId)?.name?.charAt(0) || 'T'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">
        Active Team
      </label>
      <Select
        value={selectedTeamId || ''}
        onChange={(value) => setSelectedTeamId(value)}
        options={options}
        className="w-full"
      />
    </div>
  );
}
```

### Step 4: Update Roster Page to Use Team Filter

Modify `/src/app/baseball/(dashboard)/dashboard/roster/page.tsx`:

Find the `fetchRoster` function and update it:

```typescript
// Add import at top
import { useTeamStore } from '@/stores/team-store';

// Inside component, add:
const { selectedTeamId } = useTeamStore();

// Update fetchRoster to use selectedTeamId instead of fetching it:
async function fetchRoster() {
  if (!selectedTeamId) {
    setLoading(false);
    return;
  }

  setLoading(true);
  const supabase = createClient();

  const { data, error } = await supabase
    .from('team_members')
    .select(`
      id,
      jersey_number,
      joined_at,
      player:players (
        id,
        first_name,
        last_name,
        email,
        primary_position,
        secondary_position,
        grad_year,
        city,
        state,
        avatar_url,
        recruiting_activated
      )
    `)
    .eq('team_id', selectedTeamId)  // Use the store value
    .order('joined_at', { ascending: false });

  // ... rest of function
}

// Update useEffect to depend on selectedTeamId:
useEffect(() => {
  if (selectedTeamId) {
    fetchRoster();
  }
}, [selectedTeamId]);
```

### Step 5: Update All Other Team-Related Pages

Apply the same pattern to these files:
- `/src/app/baseball/(dashboard)/dashboard/videos/page.tsx`
- `/src/app/baseball/(dashboard)/dashboard/dev-plans/page.tsx`
- `/src/app/baseball/(dashboard)/dashboard/calendar/page.tsx`
- `/src/app/baseball/(dashboard)/dashboard/team/page.tsx`

For each file:
1. Import `useTeamStore`
2. Get `selectedTeamId` from the store
3. Use it in queries instead of fetching team ID separately
4. Add `selectedTeamId` to useEffect dependencies

---

## ISSUE 4: Player Multi-Team Validation (P0 - CRITICAL)

### Problem
No validation prevents players from joining invalid team combinations. Rules should be:
- HS player: 1 HS team + 1 Showcase team max
- Showcase player: 1 Showcase team + 1 HS team max  
- JUCO player: 1 JUCO team only
- College player: 1 College team only

### Files to Modify
1. `/src/app/baseball/actions/team.ts` - Add validation to join action
2. Create `/src/lib/team-validation.ts` - Validation logic

### Step 1: Create Validation Helper

Create `/src/lib/team-validation.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';

export type PlayerType = 'high_school' | 'showcase' | 'juco' | 'college';
export type TeamType = 'high_school' | 'showcase' | 'juco' | 'college';

interface TeamMembership {
  team_id: string;
  team_type: TeamType;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

export async function validateTeamJoin(
  playerId: string,
  playerType: PlayerType,
  newTeamType: TeamType
): Promise<ValidationResult> {
  const supabase = createClient();

  // Get existing team memberships
  const { data: memberships } = await supabase
    .from('team_members')
    .select(`
      team_id,
      teams!inner(team_type)
    `)
    .eq('player_id', playerId);

  const existingTeamTypes = (memberships || []).map(
    (m: any) => m.teams?.team_type as TeamType
  ).filter(Boolean);

  // Validation rules
  switch (playerType) {
    case 'college':
      // College players: only 1 college team
      if (newTeamType !== 'college') {
        return { valid: false, error: 'College players can only join college teams' };
      }
      if (existingTeamTypes.includes('college')) {
        return { valid: false, error: 'You are already on a college team' };
      }
      break;

    case 'juco':
      // JUCO players: only 1 JUCO team
      if (newTeamType !== 'juco') {
        return { valid: false, error: 'JUCO players can only join JUCO teams' };
      }
      if (existingTeamTypes.includes('juco')) {
        return { valid: false, error: 'You are already on a JUCO team' };
      }
      break;

    case 'high_school':
      // HS players: 1 HS team + 1 Showcase team max
      if (newTeamType === 'college' || newTeamType === 'juco') {
        return { valid: false, error: 'High school players cannot join college or JUCO teams' };
      }
      if (newTeamType === 'high_school' && existingTeamTypes.includes('high_school')) {
        return { valid: false, error: 'You are already on a high school team' };
      }
      if (newTeamType === 'showcase' && existingTeamTypes.includes('showcase')) {
        return { valid: false, error: 'You are already on a showcase team' };
      }
      break;

    case 'showcase':
      // Showcase players: 1 Showcase team + 1 HS team max
      if (newTeamType === 'college' || newTeamType === 'juco') {
        return { valid: false, error: 'Showcase players cannot join college or JUCO teams' };
      }
      if (newTeamType === 'showcase' && existingTeamTypes.includes('showcase')) {
        return { valid: false, error: 'You are already on a showcase team' };
      }
      if (newTeamType === 'high_school' && existingTeamTypes.includes('high_school')) {
        return { valid: false, error: 'You are already on a high school team' };
      }
      break;
  }

  return { valid: true };
}
```

### Step 2: Add team_type Column to Teams Table

Run this SQL migration:

```sql
-- Add team_type column if it doesn't exist
ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS team_type VARCHAR(20) 
CHECK (team_type IN ('high_school', 'showcase', 'juco', 'college'));

-- Update existing teams based on organization/coach type
-- You may need to manually set these or derive from existing data
UPDATE teams t
SET team_type = COALESCE(
  (SELECT c.coach_type FROM coaches c 
   JOIN team_coach_staff tcs ON c.id = tcs.coach_id 
   WHERE tcs.team_id = t.id 
   LIMIT 1),
  'high_school'
);
```

### Step 3: Update Team Join Action

Modify `/src/app/baseball/actions/team.ts` (or create if it doesn't exist):

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { validateTeamJoin } from '@/lib/team-validation';
import { revalidatePath } from 'next/cache';

export async function joinTeam(inviteCode: string) {
  const supabase = createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Get player record
  const { data: player } = await supabase
    .from('players')
    .select('id, player_type')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return { error: 'Player profile not found' };
  }

  // Validate invite code
  const { data: invite } = await supabase
    .from('team_invitations')
    .select('id, team_id, expires_at, max_uses, uses, active, teams(team_type)')
    .eq('code', inviteCode)
    .eq('active', true)
    .single();

  if (!invite) {
    return { error: 'Invalid or expired invite code' };
  }

  // Check expiration
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { error: 'This invite has expired' };
  }

  // Check max uses
  if (invite.max_uses && invite.uses >= invite.max_uses) {
    return { error: 'This invite has reached its maximum uses' };
  }

  // Get team type
  const teamType = (invite.teams as any)?.team_type;
  if (!teamType) {
    return { error: 'Team type not configured' };
  }

  // VALIDATE TEAM JOIN
  const validation = await validateTeamJoin(
    player.id,
    player.player_type,
    teamType
  );

  if (!validation.valid) {
    return { error: validation.error };
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', invite.team_id)
    .eq('player_id', player.id)
    .single();

  if (existingMember) {
    return { error: 'You are already a member of this team' };
  }

  // Add player to team
  const { error: memberError } = await supabase
    .from('team_members')
    .insert({
      team_id: invite.team_id,
      player_id: player.id,
      joined_at: new Date().toISOString(),
    });

  if (memberError) {
    return { error: 'Failed to join team' };
  }

  // Increment invite uses
  await supabase
    .from('team_invitations')
    .update({ uses: invite.uses + 1 })
    .eq('id', invite.id);

  revalidatePath('/baseball/dashboard');
  
  return { success: true, teamId: invite.team_id };
}
```

### Step 4: Update Join Page to Show Errors

Modify `/src/app/baseball/join/[code]/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { joinTeam } from '@/app/baseball/actions/team';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function JoinTeamPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setLoading(true);
    setError(null);

    const result = await joinTeam(params.code);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Success - redirect to team dashboard
    router.push('/baseball/dashboard/team');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center">
          <h1 className="text-xl font-semibold mb-4">Join Team</h1>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          
          <Button onClick={handleJoin} disabled={loading} className="w-full">
            {loading ? 'Joining...' : 'Join Team'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## ISSUE 5: Academics Real Data (P1)

### Problem
The JUCO academics page uses mock/random data for credits, standing, and eligibility.

### Step 1: Create Database Table

Run this SQL:

```sql
CREATE TABLE IF NOT EXISTS student_academics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  semester VARCHAR(20), -- 'fall', 'spring', 'summer'
  year INTEGER,
  gpa DECIMAL(3,2),
  credits_attempted INTEGER DEFAULT 0,
  credits_earned INTEGER DEFAULT 0,
  academic_standing VARCHAR(20) DEFAULT 'good' CHECK (academic_standing IN ('good', 'warning', 'probation', 'suspended')),
  eligibility_status VARCHAR(20) DEFAULT 'pending' CHECK (eligibility_status IN ('eligible', 'ineligible', 'pending')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, semester, year)
);

-- Create index
CREATE INDEX idx_student_academics_player ON student_academics(player_id);
CREATE INDEX idx_student_academics_team ON student_academics(team_id);
```

### Step 2: Update Academics Page

Modify `/src/app/baseball/(dashboard)/dashboard/academics/page.tsx`:

Replace the mock data fetching with real queries:

```typescript
async function fetchStudentAthletes() {
  if (!coach?.id) return;

  setLoading(true);
  const supabase = createClient();

  // Get team ID
  const { data: staffData } = await supabase
    .from('team_coach_staff')
    .select('team_id')
    .eq('coach_id', coach.id)
    .single();

  if (!staffData?.team_id) {
    setStudents([]);
    setLoading(false);
    return;
  }

  // Get team members with player details AND academic records
  const { data: membersData } = await supabase
    .from('team_members')
    .select(`
      id,
      player_id,
      players (
        id,
        first_name,
        last_name,
        avatar_url,
        primary_position,
        grad_year
      ),
      student_academics (
        gpa,
        credits_earned,
        academic_standing,
        eligibility_status,
        semester,
        year
      )
    `)
    .eq('team_id', staffData.team_id);

  // Transform data - get most recent academic record for each player
  const transformedStudents: StudentAthlete[] = (membersData || []).map((member) => {
    const player = member.players as any;
    const academics = member.student_academics as any[] || [];
    
    // Get most recent academic record
    const latestAcademic = academics.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      const semesterOrder = { spring: 1, summer: 2, fall: 3 };
      return (semesterOrder[b.semester] || 0) - (semesterOrder[a.semester] || 0);
    })[0];

    // Calculate cumulative credits
    const totalCredits = academics.reduce((sum, a) => sum + (a.credits_earned || 0), 0);

    return {
      id: member.id,
      player_id: member.player_id,
      first_name: player?.first_name || null,
      last_name: player?.last_name || null,
      avatar_url: player?.avatar_url || null,
      primary_position: player?.primary_position || null,
      grad_year: player?.grad_year || null,
      gpa: latestAcademic?.gpa || null,
      credits_completed: totalCredits,
      credits_required: 60, // Standard for associate degree
      academic_standing: latestAcademic?.academic_standing || null,
      eligibility_status: latestAcademic?.eligibility_status || null,
    };
  });

  setStudents(transformedStudents);
  setLoading(false);
}
```

### Step 3: Create Server Action for Saving Academic Data

Create `/src/app/baseball/actions/academics.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function saveAcademicRecord(data: {
  playerId: string;
  teamId: string;
  semester: 'fall' | 'spring' | 'summer';
  year: number;
  gpa: number;
  creditsAttempted: number;
  creditsEarned: number;
  academicStanding: 'good' | 'warning' | 'probation' | 'suspended';
  eligibilityStatus: 'eligible' | 'ineligible' | 'pending';
  notes?: string;
}) {
  const supabase = createClient();

  const { error } = await supabase
    .from('student_academics')
    .upsert({
      player_id: data.playerId,
      team_id: data.teamId,
      semester: data.semester,
      year: data.year,
      gpa: data.gpa,
      credits_attempted: data.creditsAttempted,
      credits_earned: data.creditsEarned,
      academic_standing: data.academicStanding,
      eligibility_status: data.eligibilityStatus,
      notes: data.notes,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'player_id,semester,year',
    });

  if (error) {
    return { error: 'Failed to save academic record' };
  }

  revalidatePath('/baseball/dashboard/academics');
  return { success: true };
}

export async function updateQuickAcademics(
  memberId: string,
  playerId: string,
  teamId: string,
  updates: {
    gpa?: number;
    academicStanding?: string;
    eligibilityStatus?: string;
  }
) {
  const supabase = createClient();
  
  // Get current semester/year
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const semester = month < 5 ? 'spring' : month < 8 ? 'summer' : 'fall';

  const { error } = await supabase
    .from('student_academics')
    .upsert({
      player_id: playerId,
      team_id: teamId,
      semester,
      year,
      gpa: updates.gpa,
      academic_standing: updates.academicStanding,
      eligibility_status: updates.eligibilityStatus,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'player_id,semester,year',
    });

  if (error) {
    return { error: 'Failed to update' };
  }

  revalidatePath('/baseball/dashboard/academics');
  return { success: true };
}
```

---

## ISSUE 6: Anonymous vs Identified Interest (P1)

### Problem
Players should see anonymous interest ("A D1 coach from Texas viewed your profile") when `recruiting_activated = false`, and identified interest ("Coach John Smith from Texas A&M viewed your profile") when `recruiting_activated = true`.

### Files to Modify
1. `/src/app/baseball/(dashboard)/dashboard/analytics/page.tsx`
2. `/src/components/player/ActivityFeed.tsx` (if exists)
3. Any component displaying engagement events

### Fix Instructions

Create a helper function in `/src/lib/utils/interest-display.ts`:

```typescript
interface EngagementEvent {
  id: string;
  event_type: string;
  created_at: string;
  coach?: {
    full_name: string | null;
    school_name: string | null;
    division: string | null;
    state: string | null;
  };
}

interface DisplayEvent {
  id: string;
  event_type: string;
  created_at: string;
  title: string;
  description: string;
}

export function formatEngagementEvent(
  event: EngagementEvent,
  recruitingActivated: boolean
): DisplayEvent {
  const eventTypeLabels: Record<string, string> = {
    profile_view: 'viewed your profile',
    watchlist_add: 'added you to their watchlist',
    video_view: 'watched your video',
    message_sent: 'sent you a message',
  };

  const action = eventTypeLabels[event.event_type] || 'interacted with your profile';

  if (recruitingActivated && event.coach) {
    // Show full details
    return {
      id: event.id,
      event_type: event.event_type,
      created_at: event.created_at,
      title: event.coach.school_name || 'A coach',
      description: `${event.coach.full_name || 'A coach'} from ${event.coach.school_name || 'a program'} ${action}`,
    };
  } else {
    // Show anonymous version
    const division = event.coach?.division || 'college';
    const state = event.coach?.state || 'unknown location';
    
    return {
      id: event.id,
      event_type: event.event_type,
      created_at: event.created_at,
      title: `A ${division} program`,
      description: `A ${division} coach from ${state} ${action}`,
    };
  }
}

export function formatEngagementEvents(
  events: EngagementEvent[],
  recruitingActivated: boolean
): DisplayEvent[] {
  return events.map(event => formatEngagementEvent(event, recruitingActivated));
}
```

### Update Analytics Page

In `/src/app/baseball/(dashboard)/dashboard/analytics/page.tsx`:

```typescript
import { formatEngagementEvents } from '@/lib/utils/interest-display';

// Inside component:
const { player } = useAuth();
const recruitingActivated = player?.recruiting_activated ?? false;

// When displaying events:
const displayEvents = formatEngagementEvents(rawEvents, recruitingActivated);

// In the render:
{displayEvents.map(event => (
  <div key={event.id} className="p-3 border rounded-lg">
    <p className="font-medium">{event.title}</p>
    <p className="text-sm text-slate-600">{event.description}</p>
    <p className="text-xs text-slate-400">{formatRelativeTime(event.created_at)}</p>
  </div>
))}
```

### Update Activity Feed in Player Dashboard

Apply same pattern to `/src/app/baseball/(dashboard)/dashboard/page.tsx` (player view):

```typescript
// When fetching activity for players
const displayActivity = formatEngagementEvents(
  activityData,
  player?.recruiting_activated ?? false
);
```

---

## ISSUE 7: College Discovery Filters (P2)

### Problem
The college discovery page for players has no filters for division, state, or conference.

### File to Modify
`/src/app/baseball/(dashboard)/dashboard/colleges/page.tsx`

### Fix Instructions

Add a filter panel similar to player discovery:

```typescript
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageLoading } from '@/components/ui/loading';
import { IconSearch, IconFilter, IconBuilding } from '@/components/icons';

const DIVISIONS = [
  { value: '', label: 'All Divisions' },
  { value: 'D1', label: 'Division I' },
  { value: 'D2', label: 'Division II' },
  { value: 'D3', label: 'Division III' },
  { value: 'NAIA', label: 'NAIA' },
  { value: 'JUCO', label: 'JUCO' },
];

const STATES = [
  { value: '', label: 'All States' },
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  // ... add all states
  { value: 'TX', label: 'Texas' },
  // ... etc
];

export default function CollegesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [colleges, setColleges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters from URL
  const filters = useMemo(() => ({
    search: searchParams.get('search') || '',
    division: searchParams.get('division') || '',
    state: searchParams.get('state') || '',
    conference: searchParams.get('conference') || '',
  }), [searchParams]);

  // Update URL with filters
  const updateFilters = (newFilters: Partial<typeof filters>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries({ ...filters, ...newFilters }).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    router.push(`/baseball/dashboard/colleges?${params.toString()}`);
  };

  // Fetch colleges
  useEffect(() => {
    async function fetchColleges() {
      setLoading(true);

      let query = supabase
        .from('organizations')
        .select('*')
        .eq('organization_type', 'college');

      if (filters.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters.division) {
        query = query.eq('division', filters.division);
      }
      if (filters.state) {
        query = query.eq('state', filters.state);
      }
      if (filters.conference) {
        query = query.ilike('conference', `%${filters.conference}%`);
      }

      const { data } = await query.order('name').limit(50);
      setColleges(data || []);
      setLoading(false);
    }

    fetchColleges();
  }, [filters]);

  const clearFilters = () => {
    router.push('/baseball/dashboard/colleges');
  };

  const hasActiveFilters = filters.search || filters.division || filters.state || filters.conference;

  return (
    <>
      <Header title="Explore Colleges" subtitle="Find programs that match your goals" />

      <div className="p-6">
        {/* Filter Bar */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <IconSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search schools..."
                    value={filters.search}
                    onChange={(e) => updateFilters({ search: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <Select
                value={filters.division}
                onChange={(value) => updateFilters({ division: value })}
                options={DIVISIONS}
                className="w-40"
              />

              <Select
                value={filters.state}
                onChange={(value) => updateFilters({ state: value })}
                options={STATES}
                className="w-40"
              />

              <Input
                placeholder="Conference..."
                value={filters.conference}
                onChange={(e) => updateFilters({ conference: e.target.value })}
                className="w-40"
              />

              {hasActiveFilters && (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {loading ? (
          <PageLoading />
        ) : colleges.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <IconBuilding size={32} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No colleges found</h3>
              <p className="text-slate-500">Try adjusting your filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {colleges.map((college) => (
              <Card key={college.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {college.logo_url ? (
                      <img src={college.logo_url} alt="" className="w-12 h-12 rounded-lg object-contain" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                        <IconBuilding size={20} className="text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-900 truncate">{college.name}</h3>
                      <p className="text-sm text-slate-500">
                        {college.city}, {college.state}
                      </p>
                      <div className="flex gap-2 mt-2">
                        {college.division && (
                          <Badge variant="secondary">{college.division}</Badge>
                        )}
                        {college.conference && (
                          <Badge variant="outline" className="text-xs">{college.conference}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
```

---

## ISSUE 8: Dev Plans Drill Library (P2)

### Problem
Dev plans are basic - no drill library, no progress tracking, players can't mark tasks complete.

### Step 1: Create Database Tables

```sql
-- Drill library
CREATE TABLE IF NOT EXISTS drill_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) CHECK (category IN ('hitting', 'pitching', 'fielding', 'baserunning', 'conditioning', 'mental')),
  difficulty VARCHAR(20) CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  video_url TEXT,
  duration_minutes INTEGER,
  equipment TEXT[],
  instructions TEXT,
  created_by UUID REFERENCES coaches(id),
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plan drills (junction table)
CREATE TABLE IF NOT EXISTS plan_drills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID REFERENCES developmental_plans(id) ON DELETE CASCADE,
  drill_id UUID REFERENCES drill_library(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  sets INTEGER,
  reps INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drill completions (player progress)
CREATE TABLE IF NOT EXISTS drill_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_drill_id UUID REFERENCES plan_drills(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  video_url TEXT,
  coach_feedback TEXT,
  UNIQUE(plan_drill_id, player_id, completed_at::date)
);

-- Indexes
CREATE INDEX idx_drill_library_category ON drill_library(category);
CREATE INDEX idx_plan_drills_plan ON plan_drills(plan_id);
CREATE INDEX idx_drill_completions_player ON drill_completions(player_id);
```

### Step 2: Seed Default Drills

```sql
INSERT INTO drill_library (name, description, category, difficulty, duration_minutes, is_public) VALUES
('Tee Work - Line Drives', 'Focus on hitting line drives off a tee with proper bat path', 'hitting', 'beginner', 15, true),
('Soft Toss Inside/Outside', 'Partner soft toss focusing on inside and outside pitches', 'hitting', 'intermediate', 20, true),
('Bullpen Session', 'Full bullpen with pitch mix and location work', 'pitching', 'intermediate', 30, true),
('Ground Ball Repetitions', 'Field 25 ground balls with focus on footwork', 'fielding', 'beginner', 20, true),
('60-Yard Sprint Work', 'Sprint training for base running speed', 'baserunning', 'beginner', 15, true),
('Visualization Exercise', 'Pre-game mental preparation and visualization', 'mental', 'beginner', 10, true);
```

### Step 3: Create Drill Library Component

Create `/src/components/coach/DrillLibrary.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { IconSearch, IconPlus, IconVideo } from '@/components/icons';

interface Drill {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  duration_minutes: number;
  video_url: string | null;
}

interface DrillLibraryProps {
  onSelectDrill: (drill: Drill) => void;
  selectedDrillIds?: string[];
}

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'hitting', label: 'Hitting' },
  { value: 'pitching', label: 'Pitching' },
  { value: 'fielding', label: 'Fielding' },
  { value: 'baserunning', label: 'Baserunning' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'mental', label: 'Mental' },
];

export function DrillLibrary({ onSelectDrill, selectedDrillIds = [] }: DrillLibraryProps) {
  const [drills, setDrills] = useState<Drill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    fetchDrills();
  }, [category]);

  async function fetchDrills() {
    const supabase = createClient();
    
    let query = supabase
      .from('drill_library')
      .select('*')
      .eq('is_public', true);

    if (category) {
      query = query.eq('category', category);
    }

    const { data } = await query.order('name');
    setDrills(data || []);
    setLoading(false);
  }

  const filteredDrills = drills.filter(drill =>
    drill.name.toLowerCase().includes(search.toLowerCase()) ||
    drill.description?.toLowerCase().includes(search.toLowerCase())
  );

  const categoryColors: Record<string, string> = {
    hitting: 'bg-red-100 text-red-700',
    pitching: 'bg-blue-100 text-blue-700',
    fielding: 'bg-green-100 text-green-700',
    baserunning: 'bg-amber-100 text-amber-700',
    conditioning: 'bg-purple-100 text-purple-700',
    mental: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <IconSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search drills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={category}
          onChange={setCategory}
          options={CATEGORIES}
          className="w-40"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
        {filteredDrills.map((drill) => {
          const isSelected = selectedDrillIds.includes(drill.id);
          
          return (
            <Card
              key={drill.id}
              className={`cursor-pointer transition-all ${
                isSelected ? 'ring-2 ring-green-500' : 'hover:shadow-md'
              }`}
              onClick={() => !isSelected && onSelectDrill(drill)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-slate-900 truncate">{drill.name}</h4>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                      {drill.description}
                    </p>
                  </div>
                  {drill.video_url && (
                    <IconVideo size={16} className="text-slate-400 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={categoryColors[drill.category] || 'bg-slate-100'}>
                    {drill.category}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    {drill.duration_minutes} min
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

This provides the foundation. The full implementation would need:
- Dev plan creation modal with drill selection
- Player view to mark drills complete
- Progress dashboard
- Coach feedback system

---

## ISSUE 9: Video Clipping (P2)

### Problem
Database schema supports clips (`is_clip`, `parent_video_id`) but no UI exists.

### Create Clip Editor Component

Create `/src/components/video/ClipEditor.tsx`:

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';

interface ClipEditorProps {
  videoUrl: string;
  videoId: string;
  videoDuration: number;
  onSave: (clipData: {
    title: string;
    startTime: number;
    endTime: number;
    type: string;
  }) => Promise<void>;
  onClose: () => void;
}

export function ClipEditor({ videoUrl, videoId, videoDuration, onSave, onClose }: ClipEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(Math.min(30, videoDuration));
  const [title, setTitle] = useState('');
  const [type, setType] = useState('highlight');
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Parse MM:SS to seconds
  const parseTime = (timeStr: string) => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return parseInt(timeStr) || 0;
  };

  // Preview clip
  const previewClip = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Stop at end time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= endTime) {
        video.pause();
        video.currentTime = startTime;
        setIsPlaying(false);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [startTime, endTime]);

  // Set current time as start/end
  const setCurrentAsStart = () => {
    if (videoRef.current) {
      setStartTime(videoRef.current.currentTime);
    }
  };

  const setCurrentAsEnd = () => {
    if (videoRef.current) {
      setEndTime(videoRef.current.currentTime);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a clip title');
      return;
    }
    if (endTime <= startTime) {
      alert('End time must be after start time');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        startTime,
        endTime,
        type,
      });
      onClose();
    } catch (error) {
      alert('Failed to save clip');
    } finally {
      setSaving(false);
    }
  };

  const clipDuration = endTime - startTime;

  return (
    <Modal open onClose={onClose} title="Create Clip" size="lg">
      <div className="space-y-4">
        {/* Video Player */}
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full aspect-video"
            controls
          />
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-500 block mb-1">Start Time</label>
              <div className="flex gap-2">
                <Input
                  value={formatTime(startTime)}
                  onChange={(e) => setStartTime(parseTime(e.target.value))}
                  className="w-24"
                />
                <Button variant="secondary" size="sm" onClick={setCurrentAsStart}>
                  Set Current
                </Button>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-500 block mb-1">End Time</label>
              <div className="flex gap-2">
                <Input
                  value={formatTime(endTime)}
                  onChange={(e) => setEndTime(parseTime(e.target.value))}
                  className="w-24"
                />
                <Button variant="secondary" size="sm" onClick={setCurrentAsEnd}>
                  Set Current
                </Button>
              </div>
            </div>
          </div>

          {/* Visual timeline bar */}
          <div className="h-8 bg-slate-200 rounded relative">
            <div
              className="absolute h-full bg-green-500 rounded opacity-50"
              style={{
                left: `${(startTime / videoDuration) * 100}%`,
                width: `${((endTime - startTime) / videoDuration) * 100}%`,
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-medium">
              Clip: {formatTime(clipDuration)} ({clipDuration.toFixed(1)}s)
            </div>
          </div>

          <Button variant="secondary" onClick={previewClip} className="w-full">
            {isPlaying ? 'Playing Preview...' : 'Preview Clip'}
          </Button>
        </div>

        {/* Clip Details */}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Clip Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Line Drive to Center"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Clip Type</label>
            <Select
              value={type}
              onChange={setType}
              options={[
                { value: 'highlight', label: 'Highlight' },
                { value: 'at_bat', label: 'At-Bat' },
                { value: 'pitch', label: 'Pitch' },
                { value: 'fielding', label: 'Fielding Play' },
                { value: 'baserunning', label: 'Baserunning' },
              ]}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Clip'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

### Create Server Action for Saving Clips

Create `/src/app/baseball/actions/video-clips.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createVideoClip(data: {
  parentVideoId: string;
  title: string;
  startTime: number;
  endTime: number;
  type: string;
}) {
  const supabase = createClient();

  // Get parent video
  const { data: parentVideo } = await supabase
    .from('videos')
    .select('*')
    .eq('id', data.parentVideoId)
    .single();

  if (!parentVideo) {
    return { error: 'Parent video not found' };
  }

  // Create clip record
  // Note: The video_url includes timestamp params for clip playback
  const clipUrl = `${parentVideo.video_url}#t=${data.startTime},${data.endTime}`;

  const { data: clip, error } = await supabase
    .from('videos')
    .insert({
      player_id: parentVideo.player_id,
      title: data.title,
      video_url: clipUrl,
      thumbnail_url: parentVideo.thumbnail_url, // Use parent thumbnail for now
      type: data.type,
      is_clip: true,
      parent_video_id: data.parentVideoId,
      duration: data.endTime - data.startTime,
      privacy: parentVideo.privacy,
    })
    .select()
    .single();

  if (error) {
    return { error: 'Failed to create clip' };
  }

  revalidatePath('/baseball/dashboard/videos');
  return { success: true, clip };
}
```

---

## TESTING CHECKLIST

After implementing all fixes, verify:

### Authentication & Routing
- [ ] HS coach → Redirects to `/baseball/dashboard/team/high-school`
- [ ] JUCO coach (recruiting mode) → Shows recruiting dashboard
- [ ] JUCO coach (team mode) → Redirects to `/baseball/dashboard/team`
- [ ] Showcase coach → Redirects to `/baseball/dashboard/team`
- [ ] College coach → Shows recruiting dashboard
- [ ] Mode toggle → Immediately redirects to correct dashboard

### Team Context
- [ ] Showcase coach selects team → Roster shows only that team's players
- [ ] Player selects team → Team dashboard shows that team's data
- [ ] Team switch persists across page navigation

### Player Validation
- [ ] HS player joins HS team → Success
- [ ] HS player joins second HS team → Error: "Already on a high school team"
- [ ] HS player joins Showcase team → Success
- [ ] HS player joins JUCO team → Error: "Cannot join JUCO teams"
- [ ] College player joins any team → Error unless college team

### Academics
- [ ] JUCO coach sees academics page with real data
- [ ] Inline editing saves to database
- [ ] Summary stats calculate correctly

### Interest Display
- [ ] Player without recruiting → Sees "A D1 coach from Texas"
- [ ] Player with recruiting → Sees "Coach John Smith from Texas A&M"

### College Discovery
- [ ] Division filter works
- [ ] State filter works
- [ ] Search works
- [ ] Filters persist in URL

---

## DEPLOYMENT ORDER

1. **Database migrations first** (Issues 3, 4, 5)
2. **Route protection & redirects** (Issues 1, 2)
3. **Team context filtering** (Issue 3)
4. **Player validation** (Issue 4)
5. **Feature enhancements** (Issues 5-9)

Run `npm run build` after each major change to catch TypeScript errors.

---

*End of Cursor Instructions*
