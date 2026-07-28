'use server';

/**
 * v3 notification prefs server actions (W42).
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import type { Json } from '@/lib/types/database';
import type {
  NotificationCategory,
  ChannelPref,
  NotificationPrefs,
  PrefsByCategory,
} from '@/lib/coachhelm/v3/notifications/router';
import { describeError } from '@/lib/utils/describe-error';

export interface PrefsActionResult {
  ok: boolean;
  prefs?: NotificationPrefs;
  error?: string;
}

async function loadMyNotificationPrefsImpl(): Promise<PrefsActionResult> {
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
      `loadMyNotificationPrefs failed: ${describeError(err)}`,
      { action: 'v3.notifications.loadPrefs' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedLoadMyNotificationPrefs = withAdminObserved(
  'loadMyNotificationPrefs',
  { sport: 'golf', feature: 'settings' },
  loadMyNotificationPrefsImpl,
);

export async function loadMyNotificationPrefs(): Promise<PrefsActionResult> {
  return observedLoadMyNotificationPrefs();
}

async function setCategoryChannelImpl(
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
      `setCategoryChannel failed: ${describeError(err)}`,
      { action: 'v3.notifications.setChannel' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedSetCategoryChannel = withAdminObserved(
  'setCategoryChannel',
  { sport: 'golf', feature: 'settings' },
  setCategoryChannelImpl,
);

export async function setCategoryChannel(
  category: NotificationCategory,
  channel: keyof ChannelPref,
  enabled: boolean,
): Promise<PrefsActionResult> {
  return observedSetCategoryChannel(category, channel, enabled);
}

/**
 * Atomically replace the ENTIRE per-category prefs object in one
 * read-modify-write. Use this for bulk operations (reset defaults,
 * mute a whole channel) instead of firing N parallel setCategoryChannel
 * calls — those each read the same stale snapshot and clobber each
 * other (last-write-wins) against the shared `prefs` JSONB column.
 */
async function setAllChannelsImpl(
  prefs: PrefsByCategory,
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
      .select('quiet_mode')
      .eq('player_id', player.id)
      .maybeSingle();

    if (row) {
      const { error } = await sb
        .from('golf_player_notification_state')
        .update({
          prefs: prefs as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', player.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('golf_player_notification_state').insert({
        player_id: player.id,
        prefs: prefs as unknown as Json,
      });
      if (error) throw error;
    }

    revalidatePath('/golf/dashboard/settings/notifications');
    return {
      ok: true,
      prefs: { prefs, quiet_mode: row?.quiet_mode ?? false },
    };
  } catch (err) {
    await logServerError(
      `setAllChannels failed: ${describeError(err)}`,
      { action: 'v3.notifications.setAllChannels' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedSetAllChannels = withAdminObserved(
  'setAllChannels',
  { sport: 'golf', feature: 'settings' },
  setAllChannelsImpl,
);

export async function setAllChannels(
  prefs: PrefsByCategory,
): Promise<PrefsActionResult> {
  return observedSetAllChannels(prefs);
}

async function setQuietModeImpl(enabled: boolean): Promise<PrefsActionResult> {
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
      `setQuietMode failed: ${describeError(err)}`,
      { action: 'v3.notifications.setQuietMode' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedSetQuietMode = withAdminObserved(
  'setQuietMode',
  { sport: 'golf', feature: 'settings' },
  setQuietModeImpl,
);

export async function setQuietMode(enabled: boolean): Promise<PrefsActionResult> {
  return observedSetQuietMode(enabled);
}
