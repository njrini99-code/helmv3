'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  checkHoursAdjustment,
  checkHoursSettings,
  hoursTables,
  isHoursStoreMissing,
  roundHours,
  settingsToRow,
  type HoursSettings,
} from '@/lib/golf/practice-hours';

/**
 * Launch readiness F-03: the Practice hours page's two saves. RLS decides who may write (a coach of the team, through
 * is_golf_team_coach; an adjustment's event must be the same team's), so a player's or another team's write comes back
 * with no row and is refused here. Until the held migration 20261115230000 is applied the tables aren't there: each save
 * answers `unavailable` and the page says saving waits on the update; nothing else is touched.
 */

export type HoursResult = { success: true } | { success: false; error: string; code: string; unavailable?: boolean };

const HOURS_PATH = '/golf/dashboard/calendar/hours';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function who() {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  return { sb, userId: data.user?.id ?? null };
}

const refused = (error: string, code: string, dbCode?: string | null): HoursResult => ({
  success: false,
  error,
  code,
  unavailable: isHoursStoreMissing(dbCode) || undefined,
});

export interface HoursSettingsInput {
  teamId: string;
  settings: HoursSettings;
  untimedHours: number | null;
}

async function saveHoursSettingsImpl(input: HoursSettingsInput): Promise<HoursResult> {
  if (!UUID.test(input.teamId)) return refused('Couldn’t save your limits.', 'CH-6080');
  const problem = checkHoursSettings(input.settings, input.untimedHours);
  if (problem) return refused(problem.message, 'CH-6180');
  const { sb, userId } = await who();
  if (!userId) return refused('Your session ended. Sign in again to save.', 'CH-6080');
  const row = settingsToRow(input.teamId, input.settings, input.untimedHours, userId);
  const { data, error } = await hoursTables(sb).from('golf_team_hours_settings').upsert(row, { onConflict: 'team_id' }).select('team_id').maybeSingle();
  if (error || !data) {
    if (error && !isHoursStoreMissing(error.code))
      await logServerError(
        `practice hours: settings save failed: ${describeError(error)}`,
        { action: 'hours.saveSettings', featureArea: 'calendar_events' },
        'warning',
      );
    // No row and no error: RLS kept it (not a coach of this team).
    return refused(error ? 'Couldn’t save your limits.' : 'Only a coach of the team can change its limits.', 'CH-6080', error?.code);
  }
  revalidatePath(HOURS_PATH);
  return { success: true };
}

export interface HoursAdjustmentInput {
  teamId: string;
  eventId: string;
  /** Null takes the change off: the event counts as drafted again. */
  adjustment: { counted: boolean; hours: number | null; note: string | null } | null;
}

async function saveHoursAdjustmentImpl(input: HoursAdjustmentInput): Promise<HoursResult> {
  if (!UUID.test(input.teamId) || !UUID.test(input.eventId)) return refused('Couldn’t save the change.', 'CH-6081');
  const { sb, userId } = await who();
  if (!userId) return refused('Your session ended. Sign in again to save.', 'CH-6081');
  const db = hoursTables(sb).from('golf_hours_adjustments');
  if (!input.adjustment) {
    const { error } = await db.delete().eq('team_id', input.teamId).eq('event_id', input.eventId);
    if (error) {
      if (!isHoursStoreMissing(error.code))
        await logServerError(
          `practice hours: adjustment delete failed: ${describeError(error)}`,
          { action: 'hours.saveAdjustment', featureArea: 'calendar_events' },
          'warning',
        );
      return refused('Couldn’t take the change off.', 'CH-6081', error.code);
    }
    revalidatePath(HOURS_PATH);
    return { success: true };
  }
  const note = input.adjustment.note?.trim() ? input.adjustment.note.trim() : null;
  const a = {
    counted: input.adjustment.counted,
    hours: input.adjustment.counted && input.adjustment.hours != null ? roundHours(input.adjustment.hours) : null,
    note,
  };
  const problem = checkHoursAdjustment(a);
  if (problem) return refused(problem.message, 'CH-6181');
  const { data, error } = await db
    .upsert(
      {
        team_id: input.teamId,
        event_id: input.eventId,
        counted: a.counted,
        hours: a.hours,
        note: a.note,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' },
    )
    .select('event_id')
    .maybeSingle();
  if (error || !data) {
    if (error && !isHoursStoreMissing(error.code))
      await logServerError(
        `practice hours: adjustment save failed: ${describeError(error)}`,
        { action: 'hours.saveAdjustment', featureArea: 'calendar_events' },
        'warning',
      );
    return refused(error ? 'Couldn’t save the change.' : 'Only a coach of the team can change how an event counts.', 'CH-6081', error?.code);
  }
  revalidatePath(HOURS_PATH);
  return { success: true };
}

const observedSettings = withAdminObserved('saveHoursSettings', { sport: 'golf', feature: 'calendar_events' }, saveHoursSettingsImpl);
const observedAdjustment = withAdminObserved('saveHoursAdjustment', { sport: 'golf', feature: 'calendar_events' }, saveHoursAdjustmentImpl);

export async function saveHoursSettings(input: HoursSettingsInput) {
  return observedSettings(input);
}
export async function saveHoursAdjustment(input: HoursAdjustmentInput) {
  return observedAdjustment(input);
}
