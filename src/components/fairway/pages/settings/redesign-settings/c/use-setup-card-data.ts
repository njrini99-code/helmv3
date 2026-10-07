'use client';

/**
 * TEMP redesign direction C (removed before ship) — the remote values behind
 * the Setup card's rows.
 *
 * READ-ONLY on purpose. The panels' own hooks are not reused for these
 * summaries: useCoachPhilosophy and useCoachHelmSettings both INSERT a row
 * when none exists, which would turn opening Settings into a write. Plain
 * selects here; a missing row means "all default", the same thing those
 * hooks would have written.
 *
 * Every fetch starts on mount (in parallel with the profile), and a source is
 * re-read when a sheet that edits it closes. A re-read keeps showing the last
 * value until the new one lands, so rows never flash back to a skeleton.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getNotificationPreferences } from '@/app/actions/notification-preferences';
import { logError } from '@/lib/error-logging';
import {
  LOADING,
  type CoachHelmSource,
  type Loadable,
  type NotificationPrefsSource,
  type PhilosophySource,
  type TeamSettingsSource,
  type TeamSource,
} from './setup-card-model';

export type SourceKey = 'notifications' | 'philosophy' | 'teamSettings' | 'team' | 'coachHelm';

export interface SetupCardScope {
  role: 'coach' | 'player';
  coachId?: string;
  teamId?: string;
}

export interface SetupCardData {
  notifications: Loadable<NotificationPrefsSource>;
  philosophy: Loadable<PhilosophySource | null>;
  teamSettings: Loadable<TeamSettingsSource | null>;
  team: Loadable<TeamSource | null>;
  coachHelm: Loadable<CoachHelmSource | null>;
}

const INITIAL: SetupCardData = {
  notifications: LOADING,
  philosophy: LOADING,
  teamSettings: LOADING,
  team: LOADING,
  coachHelm: LOADING,
};

function applicableSources({ role, coachId, teamId }: SetupCardScope): SourceKey[] {
  const keys: SourceKey[] = ['notifications'];
  if (role === 'coach' && coachId) keys.push('philosophy', 'coachHelm');
  if (role === 'coach' && teamId) keys.push('teamSettings', 'team');
  return keys;
}

export function useSetupCardData(scope: SetupCardScope) {
  const { role, coachId, teamId } = scope;
  const [data, setData] = useState<SetupCardData>(INITIAL);
  const [supabase] = useState(() => createClient());
  // Per-source request counter: a slow first read must not overwrite a
  // newer one that already landed.
  const requestRef = useRef<Record<SourceKey, number>>({
    notifications: 0,
    philosophy: 0,
    teamSettings: 0,
    team: 0,
    coachHelm: 0,
  });

  const fetchSource = useCallback(
    async (key: SourceKey): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> => {
      switch (key) {
        case 'notifications': {
          const res = await getNotificationPreferences();
          if (res.error || !res.data) return { ok: false, message: res.error ?? 'No preferences returned' };
          return { ok: true, data: res.data };
        }
        case 'philosophy': {
          if (!coachId) return { ok: true, data: null };
          const { data: row, error } = await supabase
            .from('golf_coach_philosophy')
            .select(
              'alert_sensitivity, email_digest_enabled, alert_scoring_decline, alert_stat_regression, alert_tournament_pressure, alert_plateau, alert_bubble_player, alert_surge_player, alert_streaks, alert_recurring_weakness, alert_closing_holes, alert_par_3_issues',
            )
            .eq('coach_id', coachId)
            .maybeSingle();
          if (error) return { ok: false, message: error.message };
          return { ok: true, data: row satisfies PhilosophySource | null };
        }
        case 'teamSettings': {
          if (!teamId) return { ok: true, data: null };
          const { data: row, error } = await supabase
            .from('golf_team_settings')
            .select(
              'scoring_format, handicap_system, default_tees, timezone, event_reminders_enabled, event_reminder_early_hours, event_reminder_late_minutes',
            )
            .eq('team_id', teamId)
            .maybeSingle();
          if (error) return { ok: false, message: error.message };
          return { ok: true, data: row satisfies TeamSettingsSource | null };
        }
        case 'team': {
          if (!teamId) return { ok: true, data: null };
          const { data: row, error } = await supabase
            .from('golf_teams')
            .select('name, join_code')
            .eq('id', teamId)
            .maybeSingle();
          if (error) return { ok: false, message: error.message };
          return { ok: true, data: row satisfies TeamSource | null };
        }
        case 'coachHelm': {
          if (!coachId) return { ok: true, data: null };
          const { data: row, error } = await supabase
            .from('golf_coachhelm_settings')
            .select('enabled')
            .eq('coach_id', coachId)
            .maybeSingle();
          if (error) return { ok: false, message: error.message };
          return { ok: true, data: row satisfies CoachHelmSource | null };
        }
        default:
          return { ok: false, message: `Unknown source ${String(key)}` };
      }
    },
    [supabase, coachId, teamId],
  );

  const load = useCallback(
    async (key: SourceKey) => {
      const request = ++requestRef.current[key];
      let result: Awaited<ReturnType<typeof fetchSource>>;
      try {
        result = await fetchSource(key);
      } catch (err) {
        result = { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
      if (request !== requestRef.current[key]) return;
      if (!result.ok) {
        logError(
          new Error(`Setup card read failed (${key}): ${result.message}`),
          { component: 'SettingsDirectionC', action: `load-${key}`, sport: 'golf' },
          'low',
        );
      }
      const next = result.ok
        ? ({ status: 'ready', data: result.data } as SetupCardData[typeof key])
        : ({ status: 'error' } as const);
      setData((prev) => ({ ...prev, [key]: next }));
    },
    [fetchSource],
  );

  useEffect(() => {
    for (const key of applicableSources({ role, coachId, teamId })) void load(key);
  }, [load, role, coachId, teamId]);

  /** Re-read the given sources (after a sheet that edits them closes). */
  const reload = useCallback(
    (keys: readonly SourceKey[]) => {
      const live = new Set(applicableSources({ role, coachId, teamId }));
      for (const key of keys) if (live.has(key)) void load(key);
    },
    [load, role, coachId, teamId],
  );

  return { ...data, reload };
}
