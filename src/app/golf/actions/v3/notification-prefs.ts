'use server';

/**
 * v3 notification prefs server actions (W42).
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import type { Json } from '@/lib/types/database';
import type {
  NotificationCategory,
  ChannelPref,
  NotificationPrefs,
  PrefsByCategory,
} from '@/lib/coachhelm/v3/notifications/router';

export interface PrefsActionResult {
  ok: boolean;
  prefs?: NotificationPrefs;
  error?: string;
}

export async function loadMyNotificationPrefs(): Promise<PrefsActionResult> {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: player } = await sb
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!player) return { ok: false, error: 'Not a player' };

    const { data: row } = await sb
      .from('golf_player_notification_state')
      .select('prefs, quiet_mode')
      .eq('player_id', player.id)
      .maybeSingle();

    return {
      ok: true,
      prefs: {
        prefs: (row?.prefs as PrefsByCategory) ?? {},
        quiet_mode: row?.quiet_mode ?? false,
      },
    };
  } catch (err) {
    await logServerError(
      `loadMyNotificationPrefs failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.notifications.loadPrefs' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

export async function setCategoryChannel(
  category: NotificationCategory,
  channel: keyof ChannelPref,
  enabled: boolean,
): Promise<PrefsActionResult> {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: player } = await sb
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!player) return { ok: false, error: 'Not a player' };

    const { data: row } = await sb
      .from('golf_player_notification_state')
      .select('prefs, quiet_mode')
      .eq('player_id', player.id)
      .maybeSingle();

    const currentPrefs = (row?.prefs as PrefsByCategory) ?? {};
    const currentChannels = currentPrefs[category] ?? { push: false, email: false, in_app: true };
    const updatedChannels: ChannelPref = { ...currentChannels, [channel]: enabled };
    const updatedPrefs: PrefsByCategory = { ...currentPrefs, [category]: updatedChannels };

    if (row) {
      const { error } = await sb
        .from('golf_player_notification_state')
        .update({
          prefs: updatedPrefs as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', player.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('golf_player_notification_state').insert({
        player_id: player.id,
        prefs: updatedPrefs as unknown as Json,
      });
      if (error) throw error;
    }

    revalidatePath('/golf/dashboard/settings/notifications');
    return {
      ok: true,
      prefs: { prefs: updatedPrefs, quiet_mode: row?.quiet_mode ?? false },
    };
  } catch (err) {
    await logServerError(
      `setCategoryChannel failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.notifications.setChannel' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

export async function setQuietMode(enabled: boolean): Promise<PrefsActionResult> {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: player } = await sb
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!player) return { ok: false, error: 'Not a player' };

    const { data: row } = await sb
      .from('golf_player_notification_state')
      .select('prefs')
      .eq('player_id', player.id)
      .maybeSingle();
    if (row) {
      const { error } = await sb
        .from('golf_player_notification_state')
        .update({ quiet_mode: enabled, updated_at: new Date().toISOString() })
        .eq('player_id', player.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('golf_player_notification_state').insert({
        player_id: player.id,
        quiet_mode: enabled,
      });
      if (error) throw error;
    }
    revalidatePath('/golf/dashboard/settings/notifications');
    return { ok: true };
  } catch (err) {
    await logServerError(
      `setQuietMode failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.notifications.setQuietMode' },
    );
    return { ok: false, error: 'Internal error' };
  }
}
