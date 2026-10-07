'use client';

/**
 * Direction A · the reads behind the index's right-edge values.
 *
 * READ-ONLY BY CONSTRUCTION. The index deliberately does not mount
 * useCoachPhilosophy or useCoachHelmSettings (via CoachHelmToggle): both
 * INSERT a row on mount when none exists (8/22 coaches have no philosophy
 * row, 6/22 no coachhelm row), so opening the index would write to
 * production. Each table is read here with a plain `.maybeSingle()` instead;
 * the writing components stay behind their drill-ins, exactly as before.
 *
 * All reads start together from the golf user context (no wait on the
 * profile) and resolve as one batch, so the value column fills in once rather
 * than row by row.
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getNotificationPreferences } from '@/app/actions/notification-preferences';
import { logError } from '@/lib/error-logging';
import type { GolfUserData } from '@/contexts/golf-user-context';
import type { DeliveryNotificationPreferences } from '@/lib/coachhelm/v3/notifications/types';
import type { PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import type {
  PhilosophySummaryRow,
  Read,
  TeamSettingsSummaryRow,
} from './format';

type Client = ReturnType<typeof createClient>;

export interface IndexValues {
  delivery: Read<Partial<DeliveryNotificationPreferences>>;
  /** Coach with an active team. */
  teamSettings?: Read<TeamSettingsSummaryRow>;
  team?: Read<{ join_code: string; season: string | null }>;
  /** Coach. */
  philosophy?: Read<PhilosophySummaryRow>;
  coachHelm?: Read<{ enabled: boolean | null }>;
  /** Player. */
  categoryState?: Read<{ prefs: PrefsByCategory; quiet_mode: boolean }>;
}

const ERROR = { state: 'error' } as const;
const MISSING = { state: 'missing' } as const;

function report(action: string, message: string) {
  logError(new Error(message), { component: 'SettingsDirectionA', action, sport: 'golf' }, 'low');
}

async function readDelivery(): Promise<IndexValues['delivery']> {
  try {
    const res = await getNotificationPreferences();
    if (res.error || !res.data) {
      report('load-notification-preferences', res.error ?? 'No notification preferences returned');
      return ERROR;
    }
    return { state: 'ok', data: res.data as Partial<DeliveryNotificationPreferences> };
  } catch (err) {
    report('load-notification-preferences', err instanceof Error ? err.message : String(err));
    return ERROR;
  }
}

async function readTeamSettings(supabase: Client, teamId: string): Promise<Read<TeamSettingsSummaryRow>> {
  const { data, error } = await supabase
    .from('golf_team_settings')
    .select('scoring_format, handicap_system, event_reminders_enabled, event_reminder_early_hours, event_reminder_late_minutes')
    .eq('team_id', teamId)
    .maybeSingle();
  if (error) {
    report('load-team-settings', error.message);
    return ERROR;
  }
  return data ? { state: 'ok', data } : MISSING;
}

async function readTeam(supabase: Client, teamId: string): Promise<NonNullable<IndexValues['team']>> {
  const { data, error } = await supabase
    .from('golf_teams')
    .select('join_code, season')
    .eq('id', teamId)
    .maybeSingle();
  if (error) {
    report('load-team', error.message);
    return ERROR;
  }
  return data ? { state: 'ok', data } : MISSING;
}

async function readPhilosophy(supabase: Client, coachId: string): Promise<Read<PhilosophySummaryRow>> {
  const { data, error } = await supabase
    .from('golf_coach_philosophy')
    .select(
      'email_digest_enabled, alert_sensitivity, alert_scoring_decline, alert_stat_regression, alert_tournament_pressure, alert_plateau, alert_bubble_player, alert_surge_player, alert_streaks, alert_recurring_weakness, alert_closing_holes, alert_par_3_issues',
    )
    .eq('coach_id', coachId)
    .maybeSingle();
  if (error) {
    report('load-coach-philosophy', error.message);
    return ERROR;
  }
  return data ? { state: 'ok', data } : MISSING;
}

async function readCoachHelm(supabase: Client, coachId: string): Promise<NonNullable<IndexValues['coachHelm']>> {
  const { data, error } = await supabase
    .from('golf_coachhelm_settings')
    .select('enabled')
    .eq('coach_id', coachId)
    .maybeSingle();
  if (error) {
    report('load-coachhelm-settings', error.message);
    return ERROR;
  }
  return data ? { state: 'ok', data } : MISSING;
}

async function readCategoryState(
  supabase: Client,
  playerId: string,
): Promise<NonNullable<IndexValues['categoryState']>> {
  const { data, error } = await supabase
    .from('golf_player_notification_state')
    .select('prefs, quiet_mode')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) {
    report('load-player-notification-state', error.message);
    return ERROR;
  }
  return data
    ? { state: 'ok', data: { prefs: (data.prefs ?? {}) as PrefsByCategory, quiet_mode: data.quiet_mode } }
    : MISSING;
}

async function loadIndexValues(user: Pick<GolfUserData, 'role' | 'coachId' | 'teamId' | 'playerId'>): Promise<IndexValues> {
  const supabase = createClient();

  if (user.role === 'coach') {
    const [delivery, teamSettings, team, philosophy, coachHelm] = await Promise.all([
      readDelivery(),
      user.teamId ? readTeamSettings(supabase, user.teamId) : Promise.resolve(undefined),
      user.teamId ? readTeam(supabase, user.teamId) : Promise.resolve(undefined),
      user.coachId ? readPhilosophy(supabase, user.coachId) : Promise.resolve(undefined),
      user.coachId ? readCoachHelm(supabase, user.coachId) : Promise.resolve(undefined),
    ]);
    return { delivery, teamSettings, team, philosophy, coachHelm };
  }

  const [delivery, categoryState] = await Promise.all([
    readDelivery(),
    user.playerId ? readCategoryState(supabase, user.playerId) : Promise.resolve(undefined),
  ]);
  return { delivery, categoryState };
}

/** Every read this user would have made, marked failed (a throw, not a resolved error). */
function allFailed(user: Pick<GolfUserData, 'role' | 'coachId' | 'teamId' | 'playerId'>): IndexValues {
  if (user.role === 'coach') {
    return {
      delivery: ERROR,
      teamSettings: user.teamId ? ERROR : undefined,
      team: user.teamId ? ERROR : undefined,
      philosophy: user.coachId ? ERROR : undefined,
      coachHelm: user.coachId ? ERROR : undefined,
    };
  }
  return { delivery: ERROR, categoryState: user.playerId ? ERROR : undefined };
}

/** `values` is null until every read has settled (each one may settle as an error). */
export function useSettingsIndexValues(user: GolfUserData) {
  const { role, coachId, teamId, playerId } = user;
  const [values, setValues] = useState<IndexValues | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setValues(null);
    const who = { role, coachId, teamId, playerId };
    loadIndexValues(who)
      .then((next) => {
        if (!cancelled) setValues(next);
      })
      .catch((err: unknown) => {
        // supabase-js resolves query errors, but a dropped connection can
        // still throw; without this the value column would wait forever.
        report('load-index-values', err instanceof Error ? err.message : String(err));
        if (!cancelled) setValues(allFailed(who));
      });
    return () => {
      cancelled = true;
    };
  }, [role, coachId, teamId, playerId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const failed =
    values !== null &&
    [values.delivery, values.teamSettings, values.team, values.philosophy, values.coachHelm, values.categoryState].some(
      (read) => read?.state === 'error',
    );

  return { values, failed, reload };
}
