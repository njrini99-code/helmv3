'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CoachHelmStatus } from '@/lib/coachhelm/v2/types';

// Type for query results until migration is applied
interface SettingsQueryResult {
  enabled: boolean;
  disabled_reason: string | null;
}

interface UseCoachHelmGateReturn {
  status: CoachHelmStatus | null;
  loading: boolean;
  error: string | null;
  isEnabled: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook to check CoachHelm enabled status for a user
 *
 * Checks both user-level and team-level settings.
 *
 * @param userId - The user's UUID
 * @param teamId - Optional team UUID for team-level checks
 */
export function useCoachHelmGate(
  userId: string | null,
  teamId?: string | null
): UseCoachHelmGateReturn {
  const [status, setStatus] = useState<CoachHelmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Check if globally enabled via environment
  const globallyEnabled =
    process.env.NEXT_PUBLIC_COACHHELM_ENABLED !== 'false';

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setStatus({
        userEnabled: true,
        teamEnabled: true,
        effectivelyEnabled: globallyEnabled,
        disabledReason: globallyEnabled ? null : 'CoachHelm is disabled globally',
        disabledBy: null,
      });
      setLoading(false);
      return;
    }

    if (!globallyEnabled) {
      setStatus({
        userEnabled: false,
        teamEnabled: false,
        effectivelyEnabled: false,
        disabledReason: 'CoachHelm is disabled globally',
        disabledBy: null,
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check user-level settings
      const { data: userSettings, error: userError } = await (supabase
        .from('golf_coachhelm_settings' as 'users')
        .select('enabled, disabled_reason')
        .eq('user_id', userId)
        .maybeSingle() as unknown as Promise<{ data: SettingsQueryResult | null; error: { code?: string; message: string } | null }>);

      if (userError && userError.code !== 'PGRST116') {
        throw new Error(userError.message);
      }

      const userEnabled = userSettings?.enabled ?? true;

      if (!userEnabled) {
        setStatus({
          userEnabled: false,
          teamEnabled: true,
          effectivelyEnabled: false,
          disabledReason:
            userSettings?.disabled_reason ?? 'Disabled by user preference',
          disabledBy: 'user',
        });
        setLoading(false);
        return;
      }

      // Check team-level settings if team provided
      if (teamId) {
        const { data: teamSettings, error: teamError } = await (supabase
          .from('golf_team_coachhelm_settings' as 'users')
          .select('enabled, disabled_reason')
          .eq('team_id', teamId)
          .maybeSingle() as unknown as Promise<{ data: SettingsQueryResult | null; error: { code?: string; message: string } | null }>);

        if (teamError && teamError.code !== 'PGRST116') {
          throw new Error(teamError.message);
        }

        const teamEnabled = teamSettings?.enabled ?? true;

        if (!teamEnabled) {
          setStatus({
            userEnabled: true,
            teamEnabled: false,
            effectivelyEnabled: false,
            disabledReason:
              teamSettings?.disabled_reason ?? 'Disabled by coach for this team',
            disabledBy: 'coach',
          });
          setLoading(false);
          return;
        }
      }

      // Both enabled
      setStatus({
        userEnabled: true,
        teamEnabled: true,
        effectivelyEnabled: true,
        disabledReason: null,
        disabledBy: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check status';
      setError(message);
      // Default to enabled on error to not block the user
      setStatus({
        userEnabled: true,
        teamEnabled: true,
        effectivelyEnabled: true,
        disabledReason: null,
        disabledBy: null,
      });
    } finally {
      setLoading(false);
    }
  }, [userId, teamId, globallyEnabled, supabase]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const refresh = async () => {
    await fetchStatus();
  };

  return {
    status,
    loading,
    error,
    isEnabled: status?.effectivelyEnabled ?? true,
    refresh,
  };
}

/**
 * Hook to check CoachHelm enabled status for a coach
 *
 * @param coachId - The coach's UUID (from golf_coaches table)
 */
export function useCoachHelmGateForCoach(
  coachId: string | null
): UseCoachHelmGateReturn {
  const [status, setStatus] = useState<CoachHelmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const globallyEnabled =
    process.env.NEXT_PUBLIC_COACHHELM_ENABLED !== 'false';

  const fetchStatus = useCallback(async () => {
    if (!coachId) {
      setStatus({
        userEnabled: true,
        teamEnabled: true,
        effectivelyEnabled: globallyEnabled,
        disabledReason: globallyEnabled ? null : 'CoachHelm is disabled globally',
        disabledBy: null,
      });
      setLoading(false);
      return;
    }

    if (!globallyEnabled) {
      setStatus({
        userEnabled: false,
        teamEnabled: false,
        effectivelyEnabled: false,
        disabledReason: 'CoachHelm is disabled globally',
        disabledBy: null,
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get coach record
      const { data: coach, error: coachError } = await supabase
        .from('golf_coaches')
        .select('user_id, team_id')
        .eq('id', coachId)
        .single();

      if (coachError) {
        throw coachError;
      }

      // Check user-level settings
      const { data: userSettings } = await (supabase
        .from('golf_coachhelm_settings' as 'users')
        .select('enabled, disabled_reason')
        .eq('user_id', coach.user_id)
        .maybeSingle() as unknown as Promise<{ data: SettingsQueryResult | null; error: Error | null }>);

      const userEnabled = userSettings?.enabled ?? true;

      if (!userEnabled) {
        setStatus({
          userEnabled: false,
          teamEnabled: true,
          effectivelyEnabled: false,
          disabledReason: userSettings?.disabled_reason ?? 'Disabled by user',
          disabledBy: 'user',
        });
        setLoading(false);
        return;
      }

      // Check team-level settings
      if (coach.team_id) {
        const { data: teamSettings } = await (supabase
          .from('golf_team_coachhelm_settings' as 'users')
          .select('enabled, disabled_reason')
          .eq('team_id', coach.team_id)
          .maybeSingle() as unknown as Promise<{ data: SettingsQueryResult | null; error: Error | null }>);

        const teamEnabled = teamSettings?.enabled ?? true;

        if (!teamEnabled) {
          setStatus({
            userEnabled: true,
            teamEnabled: false,
            effectivelyEnabled: false,
            disabledReason: teamSettings?.disabled_reason ?? 'Disabled by team',
            disabledBy: 'team',
          });
          setLoading(false);
          return;
        }
      }

      setStatus({
        userEnabled: true,
        teamEnabled: true,
        effectivelyEnabled: true,
        disabledReason: null,
        disabledBy: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check status';
      setError(message);
      setStatus({
        userEnabled: true,
        teamEnabled: true,
        effectivelyEnabled: true,
        disabledReason: null,
        disabledBy: null,
      });
    } finally {
      setLoading(false);
    }
  }, [coachId, globallyEnabled, supabase]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const refresh = async () => {
    await fetchStatus();
  };

  return {
    status,
    loading,
    error,
    isEnabled: status?.effectivelyEnabled ?? true,
    refresh,
  };
}
