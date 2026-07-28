'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import { describeError } from '@/lib/utils/describe-error';

interface PhilosophySettings {
  coachId: string;
  alertSensitivity: 'conservative' | 'balanced' | 'aggressive';
  declineThreshold: number;
  pressureGapThreshold: number;
  bubbleZoneRange: number;
  priority_hitting: number;
  priority_power: number;
  priority_plate_discipline: number;
  priority_speed: number;
  priority_defense: number;
}

const PHILOSOPHY_PATHS = [
  '/baseball/dashboard/settings/philosophy',
  '/baseball/dashboard/command-center',
] as const;

function revalidatePhilosophySettingsPaths() {
  for (const path of PHILOSOPHY_PATHS) {
    revalidatePath(path);
  }
}

function mapPhilosophyActionError(error: unknown): { success: false; error: string } {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Not authenticated' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage settings' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not save philosophy settings. Please try again.' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred' };
}

export async function savePhilosophySettings(
  settings: PhilosophySettings,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await savePhilosophySettingsAction(settings);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'philosophy.savePhilosophySettings', featureArea: 'baseball-philosophy' },
    );
    return mapPhilosophyActionError(error);
  }
}

const savePhilosophySettingsAction = withBaseballAction(
  'savePhilosophySettings',
  { featureArea: 'baseball-philosophy', requiredCapability: 'can_manage_settings' },
  async (ctx, settings: PhilosophySettings): Promise<{ success: boolean; error?: string }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Not authenticated' };
    }
    if (settings.coachId !== coachId) {
      return { success: false, error: 'Unauthorized' };
    }

    const philosophyData = {
      coach_id: coachId,
      alert_sensitivity: settings.alertSensitivity,
      decline_threshold: settings.declineThreshold,
      pressure_gap_threshold: settings.pressureGapThreshold,
      bubble_zone_range: settings.bubbleZoneRange,
      priority_hitting: settings.priority_hitting,
      priority_power: settings.priority_power,
      priority_plate_discipline: settings.priority_plate_discipline,
      priority_speed: settings.priority_speed,
      priority_defense: settings.priority_defense,
      updated_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (supabase as any)
      .from('baseball_coach_philosophy')
      .upsert(philosophyData, {
        onConflict: 'coach_id',
      });

    if (upsertError) {
      await logServerError(`Failed to save philosophy: ${describeError(upsertError)}`, { action: 'philosophy.savePhilosophySettings' });
      return { success: false, error: 'Failed to save settings' };
    }

    revalidatePhilosophySettingsPaths();
    return { success: true };
  },
);

async function getPhilosophySettingsImpl(coachId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_coach_philosophy')
    .select('*')
    .eq('coach_id', coachId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export const getPhilosophySettings = withAdminObserved(
  'getPhilosophySettings',
  { sport: 'baseball', feature: 'baseball_philosophy', featureArea: 'baseball-philosophy' },
  getPhilosophySettingsImpl,
);
