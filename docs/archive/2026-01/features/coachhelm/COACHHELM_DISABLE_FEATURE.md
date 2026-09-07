<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Part of the pre-build docs/features/coachhelm/ implementation-guide package (untouched since 2026-01-14), superseded by the shipped V2 engine and its 2026-06 audits. Live reference: memory/context/coachhelm-ai.md.
KEPT FOR HISTORY -- do not delete this file.
-->

# CoachHelm System Settings — Enable/Disable Feature

## Overview

This document specifies how to add a master toggle that allows coaches and players to completely disable the CoachHelm intelligence system. Some users may prefer a simpler experience without AI-powered insights.

---

## Database Schema

Add to your migration file or create `supabase/migrations/033_coachhelm_settings.sql`:

```sql
-- ============================================================================
-- COACHHELM SYSTEM SETTINGS
-- Master toggle for enabling/disabling CoachHelm intelligence
-- ============================================================================

-- Coach settings
ALTER TABLE golf_coaches 
ADD COLUMN IF NOT EXISTS coachhelm_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS coachhelm_disabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS coachhelm_disabled_reason TEXT;

-- Player settings
ALTER TABLE golf_players
ADD COLUMN IF NOT EXISTS coachhelm_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS coachhelm_disabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS coachhelm_disabled_reason TEXT;

-- Team-level override (coach can disable for entire team)
ALTER TABLE golf_teams
ADD COLUMN IF NOT EXISTS coachhelm_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS coachhelm_disabled_at TIMESTAMPTZ;

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_coaches_coachhelm ON golf_coaches(coachhelm_enabled);
CREATE INDEX IF NOT EXISTS idx_players_coachhelm ON golf_players(coachhelm_enabled);
CREATE INDEX IF NOT EXISTS idx_teams_coachhelm ON golf_teams(coachhelm_enabled);

-- Function to check if CoachHelm is enabled for a player
-- (respects both player preference AND team/coach override)
CREATE OR REPLACE FUNCTION is_coachhelm_enabled(p_player_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_player_enabled BOOLEAN;
  v_team_enabled BOOLEAN;
BEGIN
  -- Get player preference
  SELECT coachhelm_enabled INTO v_player_enabled
  FROM golf_players WHERE id = p_player_id;
  
  -- If player disabled, return false
  IF v_player_enabled = FALSE THEN
    RETURN FALSE;
  END IF;
  
  -- Check team setting (coach can override)
  SELECT t.coachhelm_enabled INTO v_team_enabled
  FROM golf_players p
  JOIN golf_teams t ON t.id = p.team_id
  WHERE p.id = p_player_id;
  
  -- If team disabled, return false
  IF v_team_enabled = FALSE THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

---

## TypeScript Types

Add to `src/lib/coachhelm/v2/types.ts`:

```typescript
// ============================================================================
// COACHHELM SETTINGS
// ============================================================================

export interface CoachHelmSettings {
  enabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
}

export interface CoachHelmStatus {
  // Is it enabled for this specific user?
  userEnabled: boolean;
  
  // Is it enabled at the team level?
  teamEnabled: boolean;
  
  // Final determination
  effectivelyEnabled: boolean;
  
  // If disabled, why?
  disabledReason: string | null;
  
  // Who disabled it?
  disabledBy: 'user' | 'coach' | 'team' | null;
}
```

---

## React Hook

Create `src/hooks/coachhelm/useCoachHelmSettings.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CoachHelmSettings, CoachHelmStatus } from '@/lib/coachhelm/v2/types';

interface UseCoachHelmSettingsReturn {
  status: CoachHelmStatus | null;
  loading: boolean;
  error: string | null;
  enable: () => Promise<boolean>;
  disable: (reason?: string) => Promise<boolean>;
  // For coaches: control team-wide setting
  enableForTeam: () => Promise<boolean>;
  disableForTeam: () => Promise<boolean>;
}

export function useCoachHelmSettings(
  entityType: 'coach' | 'player',
  entityId: string | null
): UseCoachHelmSettingsReturn {
  const [status, setStatus] = useState<CoachHelmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const supabase = createClient();

  // Fetch current status
  useEffect(() => {
    if (!entityId) {
      setLoading(false);
      return;
    }

    async function fetchStatus() {
      setLoading(true);
      setError(null);

      try {
        if (entityType === 'player') {
          // Get player + team settings
          const { data: player, error: playerError } = await supabase
            .from('golf_players')
            .select(`
              coachhelm_enabled,
              coachhelm_disabled_at,
              coachhelm_disabled_reason,
              team:golf_teams(coachhelm_enabled)
            `)
            .eq('id', entityId)
            .single();

          if (playerError) throw playerError;

          const userEnabled = player.coachhelm_enabled;
          const teamEnabled = player.team?.coachhelm_enabled ?? true;

          setStatus({
            userEnabled,
            teamEnabled,
            effectivelyEnabled: userEnabled && teamEnabled,
            disabledReason: player.coachhelm_disabled_reason,
            disabledBy: !userEnabled ? 'user' : !teamEnabled ? 'coach' : null,
          });
        } else {
          // Coach - get coach + team settings
          const { data: coach, error: coachError } = await supabase
            .from('golf_coaches')
            .select(`
              coachhelm_enabled,
              coachhelm_disabled_at,
              coachhelm_disabled_reason,
              team:golf_teams(coachhelm_enabled)
            `)
            .eq('id', entityId)
            .single();

          if (coachError) throw coachError;

          setStatus({
            userEnabled: coach.coachhelm_enabled,
            teamEnabled: coach.team?.coachhelm_enabled ?? true,
            effectivelyEnabled: coach.coachhelm_enabled,
            disabledReason: coach.coachhelm_disabled_reason,
            disabledBy: !coach.coachhelm_enabled ? 'user' : null,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
  }, [entityId, entityType, supabase]);

  // Enable CoachHelm for this user
  const enable = useCallback(async (): Promise<boolean> => {
    if (!entityId) return false;

    const table = entityType === 'coach' ? 'golf_coaches' : 'golf_players';
    
    const { error: updateError } = await supabase
      .from(table)
      .update({
        coachhelm_enabled: true,
        coachhelm_disabled_at: null,
        coachhelm_disabled_reason: null,
      })
      .eq('id', entityId);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    setStatus(prev => prev ? {
      ...prev,
      userEnabled: true,
      effectivelyEnabled: prev.teamEnabled,
      disabledBy: prev.teamEnabled ? null : 'coach',
      disabledReason: null,
    } : null);

    return true;
  }, [entityId, entityType, supabase]);

  // Disable CoachHelm for this user
  const disable = useCallback(async (reason?: string): Promise<boolean> => {
    if (!entityId) return false;

    const table = entityType === 'coach' ? 'golf_coaches' : 'golf_players';
    
    const { error: updateError } = await supabase
      .from(table)
      .update({
        coachhelm_enabled: false,
        coachhelm_disabled_at: new Date().toISOString(),
        coachhelm_disabled_reason: reason || null,
      })
      .eq('id', entityId);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    setStatus(prev => prev ? {
      ...prev,
      userEnabled: false,
      effectivelyEnabled: false,
      disabledBy: 'user',
      disabledReason: reason || null,
    } : null);

    return true;
  }, [entityId, entityType, supabase]);

  // Coach: Enable for entire team
  const enableForTeam = useCallback(async (): Promise<boolean> => {
    if (!entityId || entityType !== 'coach') return false;

    // Get coach's team
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('team_id')
      .eq('id', entityId)
      .single();

    if (!coach?.team_id) return false;

    const { error: updateError } = await supabase
      .from('golf_teams')
      .update({
        coachhelm_enabled: true,
        coachhelm_disabled_at: null,
      })
      .eq('id', coach.team_id);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    setStatus(prev => prev ? {
      ...prev,
      teamEnabled: true,
      effectivelyEnabled: prev.userEnabled,
      disabledBy: prev.userEnabled ? null : 'user',
    } : null);

    return true;
  }, [entityId, entityType, supabase]);

  // Coach: Disable for entire team
  const disableForTeam = useCallback(async (): Promise<boolean> => {
    if (!entityId || entityType !== 'coach') return false;

    // Get coach's team
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('team_id')
      .eq('id', entityId)
      .single();

    if (!coach?.team_id) return false;

    const { error: updateError } = await supabase
      .from('golf_teams')
      .update({
        coachhelm_enabled: false,
        coachhelm_disabled_at: new Date().toISOString(),
      })
      .eq('id', coach.team_id);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    setStatus(prev => prev ? {
      ...prev,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledBy: 'coach',
    } : null);

    return true;
  }, [entityId, entityType, supabase]);

  return {
    status,
    loading,
    error,
    enable,
    disable,
    enableForTeam,
    disableForTeam,
  };
}
```

---

## Settings UI Component

Create `src/components/golf/coachhelm/settings/CoachHelmToggle.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useCoachHelmSettings } from '@/hooks/coachhelm/useCoachHelmSettings';
import { cn } from '@/lib/utils';

interface CoachHelmToggleProps {
  entityType: 'coach' | 'player';
  entityId: string;
  showTeamControls?: boolean; // Only for coaches
}

export function CoachHelmToggle({ 
  entityType, 
  entityId, 
  showTeamControls = false 
}: CoachHelmToggleProps) {
  const { status, loading, enable, disable, enableForTeam, disableForTeam } = 
    useCoachHelmSettings(entityType, entityId);
  
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'disable' | 'disableTeam' | null>(null);

  if (loading) {
    return (
      <div className="animate-pulse bg-slate-100 rounded-xl h-32" />
    );
  }

  if (!status) return null;

  const handleToggle = async () => {
    if (status.userEnabled) {
      // Show confirmation before disabling
      setConfirmAction('disable');
      setShowConfirm(true);
    } else {
      await enable();
    }
  };

  const handleTeamToggle = async () => {
    if (status.teamEnabled) {
      setConfirmAction('disableTeam');
      setShowConfirm(true);
    } else {
      await enableForTeam();
    }
  };

  const confirmDisable = async () => {
    if (confirmAction === 'disable') {
      await disable('User preference');
    } else if (confirmAction === 'disableTeam') {
      await disableForTeam();
    }
    setShowConfirm(false);
    setConfirmAction(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
            <span className="text-xl">🧠</span>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">CoachHelm Intelligence</h3>
            <p className="text-sm text-slate-500">AI-powered coaching insights</p>
          </div>
        </div>
      </div>

      {/* User Toggle */}
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900">
              {entityType === 'coach' ? 'Enable for me' : 'Enable CoachHelm'}
            </p>
            <p className="text-sm text-slate-500">
              {status.userEnabled 
                ? 'You\'re receiving AI-powered insights and analysis'
                : 'AI insights are currently disabled for your account'}
            </p>
          </div>
          
          <button
            onClick={handleToggle}
            className={cn(
              'relative w-14 h-8 rounded-full transition-colors',
              status.userEnabled ? 'bg-green-500' : 'bg-slate-200'
            )}
          >
            <div
              className={cn(
                'absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform',
                status.userEnabled ? 'translate-x-7' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Team override notice for players */}
        {entityType === 'player' && !status.teamEnabled && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> Your coach has disabled CoachHelm for the team. 
              Your personal preference will take effect if they re-enable it.
            </p>
          </div>
        )}
      </div>

      {/* Team Controls (Coaches only) */}
      {showTeamControls && entityType === 'coach' && (
        <div className="p-5 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">Enable for entire team</p>
              <p className="text-sm text-slate-500">
                {status.teamEnabled 
                  ? 'All players can use CoachHelm (unless they disable it personally)'
                  : 'CoachHelm is disabled for all players on your team'}
              </p>
            </div>
            
            <button
              onClick={handleTeamToggle}
              className={cn(
                'relative w-14 h-8 rounded-full transition-colors',
                status.teamEnabled ? 'bg-green-500' : 'bg-slate-200'
              )}
            >
              <div
                className={cn(
                  'absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform',
                  status.teamEnabled ? 'translate-x-7' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </div>
      )}

      {/* Status Summary */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-2 h-2 rounded-full',
            status.effectivelyEnabled ? 'bg-green-500' : 'bg-slate-400'
          )} />
          <span className="text-sm text-slate-600">
            {status.effectivelyEnabled 
              ? 'CoachHelm is active'
              : `CoachHelm is disabled ${status.disabledBy === 'coach' ? 'by your coach' : ''}`}
          </span>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h4 className="text-lg font-semibold text-slate-900 mb-2">
              {confirmAction === 'disableTeam' 
                ? 'Disable CoachHelm for Team?' 
                : 'Disable CoachHelm?'}
            </h4>
            <p className="text-slate-600 mb-6">
              {confirmAction === 'disableTeam' 
                ? 'This will turn off AI insights for all players on your team. Players won\'t see round reviews, pattern detection, or performance predictions.'
                : 'You won\'t receive AI-powered insights, round reviews, or performance predictions. You can re-enable this anytime.'}
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 px-4 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDisable}
                className="flex-1 py-2.5 px-4 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                Disable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Integration with Settings Pages

### Coach Settings Page

Add to `src/app/golf/(dashboard)/dashboard/settings/page.tsx`:

```typescript
import { CoachHelmToggle } from '@/components/golf/coachhelm/settings/CoachHelmToggle';

// Inside the page component, add this section:
<section className="mt-8">
  <h2 className="text-lg font-semibold text-slate-900 mb-4">AI Coaching</h2>
  <CoachHelmToggle 
    entityType="coach" 
    entityId={coachId} 
    showTeamControls={true}
  />
</section>
```

### Player Settings Page

Add to player settings (wherever that lives):

```typescript
import { CoachHelmToggle } from '@/components/golf/coachhelm/settings/CoachHelmToggle';

<section className="mt-8">
  <h2 className="text-lg font-semibold text-slate-900 mb-4">AI Coaching</h2>
  <CoachHelmToggle 
    entityType="player" 
    entityId={playerId}
  />
</section>
```

---

## Gating CoachHelm Features

### Server-Side Check

Create `src/lib/coachhelm/v2/gate.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';

export async function isCoachHelmEnabled(playerId: string): Promise<boolean> {
  const supabase = createClient();
  
  const { data } = await supabase
    .rpc('is_coachhelm_enabled', { p_player_id: playerId });
  
  return data === true;
}

export async function isCoachHelmEnabledForCoach(coachId: string): Promise<boolean> {
  const supabase = createClient();
  
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('coachhelm_enabled')
    .eq('id', coachId)
    .single();
  
  return coach?.coachhelm_enabled === true;
}
```

### Client-Side Hook

Create `src/hooks/coachhelm/useCoachHelmGate.ts`:

```typescript
'use client';

import { useCoachHelmSettings } from './useCoachHelmSettings';

export function useCoachHelmGate(
  entityType: 'coach' | 'player',
  entityId: string | null
) {
  const { status, loading } = useCoachHelmSettings(entityType, entityId);
  
  return {
    isEnabled: status?.effectivelyEnabled ?? false,
    isLoading: loading,
    disabledBy: status?.disabledBy ?? null,
  };
}
```

### Using the Gate

In any component that uses CoachHelm features:

```typescript
import { useCoachHelmGate } from '@/hooks/coachhelm/useCoachHelmGate';

export function RoundReviewPage({ playerId }: { playerId: string }) {
  const { isEnabled, isLoading, disabledBy } = useCoachHelmGate('player', playerId);
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (!isEnabled) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">
          CoachHelm insights are disabled
          {disabledBy === 'coach' && ' by your coach'}.
        </p>
        <p className="text-sm text-slate-500 mt-2">
          Visit settings to enable AI-powered coaching insights.
        </p>
      </div>
    );
  }
  
  // Render full CoachHelm features
  return <FullRoundReview playerId={playerId} />;
}
```

---

## Orchestrator Integration

Update the orchestrator to check the gate:

```typescript
// In src/lib/coachhelm/v2/orchestrator.ts

import { isCoachHelmEnabled } from './gate';

export class CoachHelmIntelligence {
  async analyzePlayer(
    playerId: string,
    options: AnalysisOptions = {}
  ): Promise<PlayerAnalysis | null> {
    // Check if enabled
    const enabled = await isCoachHelmEnabled(playerId);
    
    if (!enabled) {
      return null; // Return null instead of analysis
    }
    
    // Continue with normal analysis...
  }
  
  async generateRoundReview(
    roundId: string,
    playerId: string
  ): Promise<IntelligentRoundReview | null> {
    const enabled = await isCoachHelmEnabled(playerId);
    
    if (!enabled) {
      return null;
    }
    
    // Continue with normal generation...
  }
}
```

---

## Summary

This system provides:

1. **Individual control** — Both coaches and players can disable CoachHelm for themselves
2. **Team-level override** — Coaches can disable CoachHelm for their entire team
3. **Cascading logic** — If team is disabled, players can't use it even if they want to
4. **Clear UI** — Toggle switches with confirmation dialogs
5. **Gating functions** — Easy checks before running any CoachHelm feature
6. **Graceful degradation** — When disabled, shows helpful message instead of errors

Users who don't want AI insights get a clean, simple experience without any CoachHelm features appearing.
