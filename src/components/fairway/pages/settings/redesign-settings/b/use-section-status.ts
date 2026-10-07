'use client';

/**
 * TEMP redesign direction B (removed before ship) · live status for the rail.
 *
 * Every line the rail prints comes from a column the settings panels read or
 * write. All reads here are plain SELECTs. The CoachHelm hooks
 * (useCoachHelmSettings, useCoachPhilosophy) are deliberately NOT used: both
 * INSERT a default row when none exists, and a status line must never write.
 *
 * Freshness:
 *  - Team: re-read when an explicit-save panel in the Team section goes from
 *    dirty to clean (see section-dirty-scope.tsx), and on window focus.
 *  - Notifications: NotificationsPanel exposes no change signal, so this is
 *    re-read on every section switch and on window focus. While you toggle on
 *    the Notifications section itself the line can lag one switch behind.
 *  - CoachHelm: CoachHelmToggle's `onToggle` updates it directly; the alert
 *    count is re-read on window focus (alerts are edited on another route).
 *  - Preferences, Account and Golf come from live client state (the theme and
 *    unit stores, the settings profile), so they need nothing here.
 *
 * A refresh that fails keeps the last value it had; only a first read that
 * fails turns into the error state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getNotificationPreferences } from '@/app/actions/notification-preferences';
import { GOLF_NOTIFICATION_GROUPS } from '@/components/fairway/pages/settings/FairwaySettingsGeneral';
import type { SettingsProfile } from '@/components/fairway/pages/settings/use-settings-profile';
import type { DeliveryNotificationPreferences } from '@/lib/coachhelm/v3/notifications/types';
import { resolveEventReminderSettings } from '@/lib/golf/event-reminder-settings';
import { logError } from '@/lib/error-logging';

export type Loadable<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; value: T }
  | { kind: 'error' };

export interface TeamStatus {
  /** 5 of 10 live teams have no golf_team_settings row at all. */
  hasRow: boolean;
  scoringFormat: string | null;
  remindersOn: boolean;
}

export interface NotificationStatus {
  quietMode: boolean;
  emailOn: number;
  emailTotal: number;
  pushOn: number;
  pushTotal: number;
}

export type AlertCount =
  | { kind: 'row'; on: number; total: number; sensitivity: string | null }
  /** No golf_coach_philosophy row yet (8 of 22 coaches). */
  | { kind: 'default' }
  | { kind: 'unknown' };

export interface CoachHelmStatus {
  enabled: boolean;
  alerts: AlertCount;
}

/**
 * The ten boolean alert switches Coaching Intelligence renders (ALERT_GROUPS
 * in @/lib/coachhelm/types), by column. `alert_digest` and `alert_sensitivity`
 * share the prefix but are strings, so this list is explicit, not a glob.
 * Column names follow useCoachPhilosophy's tsToDb (note `alert_par_3_issues`).
 */
const ALERT_COLUMNS = [
  'alert_scoring_decline',
  'alert_stat_regression',
  'alert_tournament_pressure',
  'alert_plateau',
  'alert_bubble_player',
  'alert_surge_player',
  'alert_streaks',
  'alert_recurring_weakness',
  'alert_closing_holes',
  'alert_par_3_issues',
] as const;

/**
 * Counts mirror what the panel's switches DISPLAY (`checked={prefs[key]}`), so
 * a key the stored prefs lack counts as off, exactly as the switch renders it.
 * (`push_announcements` is one such key: see the direction B report.)
 */
function countNotifications(
  prefs: Partial<DeliveryNotificationPreferences>,
): NotificationStatus {
  let emailOn = 0;
  let pushOn = 0;
  let pushTotal = 0;
  for (const group of GOLF_NOTIFICATION_GROUPS) {
    if (prefs[group.emailKey] === true) emailOn += 1;
    if (group.pushKey) {
      pushTotal += 1;
      if (prefs[group.pushKey] === true) pushOn += 1;
    }
  }
  return {
    quietMode: prefs.quiet_mode === true,
    emailOn,
    emailTotal: GOLF_NOTIFICATION_GROUPS.length,
    pushOn,
    pushTotal,
  };
}

/** Keep the last good value on a failed refresh; error only on a failed first read. */
function failed<T>(prev: Loadable<T>): Loadable<T> {
  return prev.kind === 'ready' ? prev : { kind: 'error' };
}

export function useSectionStatus(profile: SettingsProfile) {
  const [supabase] = useState(() => createClient());
  const teamId = profile.role === 'coach' ? profile.teamId : undefined;
  const coachId = profile.role === 'coach' ? profile.coachId : undefined;

  const [team, setTeam] = useState<Loadable<TeamStatus>>({ kind: 'loading' });
  const [notifications, setNotifications] = useState<Loadable<NotificationStatus>>({
    kind: 'loading',
  });
  const [coachHelm, setCoachHelm] = useState<Loadable<CoachHelmStatus>>({ kind: 'loading' });

  // Out-of-order guard: only the newest request of each kind may write state.
  const seq = useRef({ team: 0, notifications: 0, coachHelm: 0 });

  const refreshTeam = useCallback(async () => {
    if (!teamId) return;
    const ticket = ++seq.current.team;
    const { data, error } = await supabase
      .from('golf_team_settings')
      .select('scoring_format, event_reminders_enabled, event_reminder_early_hours, event_reminder_late_minutes')
      .eq('team_id', teamId)
      .maybeSingle();
    if (ticket !== seq.current.team) return;
    if (error) {
      logError(
        new Error(error.message),
        { component: 'SettingsDirectionB', action: 'status-team-settings', sport: 'golf', teamId },
        'low',
      );
      setTeam(failed);
      return;
    }
    setTeam({
      kind: 'ready',
      value: {
        hasRow: data !== null,
        scoringFormat: data?.scoring_format ?? null,
        // A missing row gets the defaults the reminder cron actually uses.
        remindersOn: resolveEventReminderSettings(data).enabled,
      },
    });
  }, [supabase, teamId]);

  const refreshNotifications = useCallback(async () => {
    const ticket = ++seq.current.notifications;
    try {
      const res = await getNotificationPreferences();
      if (ticket !== seq.current.notifications) return;
      if (res.error || !res.data) {
        setNotifications(failed);
        return;
      }
      setNotifications({
        kind: 'ready',
        value: countNotifications(res.data as Partial<DeliveryNotificationPreferences>),
      });
    } catch (err) {
      if (ticket !== seq.current.notifications) return;
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'SettingsDirectionB', action: 'status-notifications', sport: 'golf' },
        'low',
      );
      setNotifications(failed);
    }
  }, []);

  const refreshCoachHelm = useCallback(async () => {
    if (!coachId) return;
    const ticket = ++seq.current.coachHelm;
    const [settingsRes, philosophyRes] = await Promise.all([
      supabase.from('golf_coachhelm_settings').select('enabled').eq('coach_id', coachId).maybeSingle(),
      supabase
        .from('golf_coach_philosophy')
        .select(
          'alert_sensitivity, alert_scoring_decline, alert_stat_regression, alert_tournament_pressure, alert_plateau, alert_bubble_player, alert_surge_player, alert_streaks, alert_recurring_weakness, alert_closing_holes, alert_par_3_issues',
        )
        .eq('coach_id', coachId)
        .maybeSingle(),
    ]);
    if (ticket !== seq.current.coachHelm) return;
    if (settingsRes.error) {
      logError(
        new Error(settingsRes.error.message),
        { component: 'SettingsDirectionB', action: 'status-coachhelm-settings', sport: 'golf' },
        'low',
      );
      setCoachHelm(failed);
      return;
    }

    let alerts: AlertCount;
    if (philosophyRes.error) {
      logError(
        new Error(philosophyRes.error.message),
        { component: 'SettingsDirectionB', action: 'status-coach-philosophy', sport: 'golf' },
        'low',
      );
      alerts = { kind: 'unknown' };
    } else if (!philosophyRes.data) {
      alerts = { kind: 'default' };
    } else {
      const row = philosophyRes.data;
      alerts = {
        kind: 'row',
        on: ALERT_COLUMNS.filter((column) => row[column] === true).length,
        total: ALERT_COLUMNS.length,
        sensitivity: row.alert_sensitivity,
      };
    }

    setCoachHelm({
      kind: 'ready',
      // No settings row reads as on: that is what useCoachHelmSettings and
      // CoachHelmToggle both render (`settings?.enabled ?? true`).
      value: { enabled: settingsRes.data?.enabled ?? true, alerts },
    });
  }, [supabase, coachId]);

  useEffect(() => {
    void refreshTeam();
  }, [refreshTeam]);

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    void refreshCoachHelm();
  }, [refreshCoachHelm]);

  useEffect(() => {
    // `focus` and `visibilitychange` usually arrive together on return to the
    // tab (and only the latter fires on an iOS resume); read once per return.
    let lastRun = 0;
    const refreshAll = () => {
      const now = Date.now();
      if (now - lastRun < 1000) return;
      lastRun = now;
      void refreshTeam();
      void refreshNotifications();
      void refreshCoachHelm();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };
    window.addEventListener('focus', refreshAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refreshAll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshTeam, refreshNotifications, refreshCoachHelm]);

  /** CoachHelmToggle reports a committed on/off; no read needed. */
  const setCoachHelmEnabled = useCallback((enabled: boolean) => {
    setCoachHelm((prev) =>
      prev.kind === 'ready' ? { kind: 'ready', value: { ...prev.value, enabled } } : prev,
    );
  }, []);

  return {
    team,
    notifications,
    coachHelm,
    refreshTeam,
    refreshNotifications,
    setCoachHelmEnabled,
  };
}
