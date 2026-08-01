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

/**
 * How many read-merge-write attempts one category toggle makes before it gives
 * up. Every losing attempt means another writer committed between our read and
 * our write; the retry re-reads THEIR value and merges on top of it, so no
 * toggle is dropped. Four is generous — the contended window is a single
 * round-trip and the only competing writers are this player's own tabs plus the
 * `last_*_seen_at` markers in player-notifications.ts.
 */
const PREFS_WRITE_ATTEMPTS = 4;

/** Postgres unique_violation: a concurrent first write created the row first. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * A timestamp guaranteed to differ from the row's current `updated_at`.
 *
 * The compare-and-set below keys on `updated_at`, so the value we write must
 * never equal the value we read — otherwise a competing writer whose guard
 * still holds could commit on top of us and the lost update would be invisible.
 * `Date.parse` truncates Postgres microseconds downward, so `prev + 1ms` is
 * strictly after the stored instant either way.
 */
function nextUpdatedAt(previous: string | null | undefined): string {
  const now = Date.now();
  const previousMs = previous ? Date.parse(previous) : Number.NaN;
  return new Date(
    Number.isNaN(previousMs) ? now : Math.max(now, previousMs + 1),
  ).toISOString();
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

    // DS-B10-7: `prefs` is ONE jsonb column shared by every category, so a
    // read-merge-write in JS loses a concurrent toggle — both writers read the
    // same snapshot and the second overwrites the first. PostgREST cannot
    // express a column-referencing expression (`prefs = prefs || $1`), so the
    // single-statement server-side merge needs an RPC (proposed as
    // `set_notification_category_channel` — see the migration note in the
    // review). Until that exists this is a real compare-and-set, not a
    // pretend one: the UPDATE is guarded on the exact `updated_at` we read, so
    // a writer that lost the race affects zero rows, re-reads the winner's
    // value and merges on top of it. Nothing is silently dropped.
    for (let attempt = 0; attempt < PREFS_WRITE_ATTEMPTS; attempt += 1) {
      const { data: row, error: readError } = await sb
        .from('golf_player_notification_state')
        .select('prefs, quiet_mode, updated_at')
        .eq('player_id', player.id)
        .maybeSingle();
      if (readError) throw readError;

      const currentPrefs = (row?.prefs as PrefsByCategory) ?? {};
      const currentChannels = currentPrefs[category] ?? { push: false, email: false, in_app: true };
      const updatedChannels: ChannelPref = { ...currentChannels, [channel]: enabled };
      const updatedPrefs: PrefsByCategory = { ...currentPrefs, [category]: updatedChannels };
      const quietMode = row?.quiet_mode ?? false;

      if (!row) {
        // First write for this player. A plain INSERT (not an upsert) so a
        // concurrent first write loses on unique(player_id) and retries
        // against the row the winner created — an upsert would clobber it.
        const { error: insertError } = await sb
          .from('golf_player_notification_state')
          .insert({
            player_id: player.id,
            prefs: updatedPrefs as unknown as Json,
            updated_at: new Date().toISOString(),
          });
        if (!insertError) {
          revalidatePath('/golf/dashboard/settings/notifications');
          return { ok: true, prefs: { prefs: updatedPrefs, quiet_mode: quietMode } };
        }
        if (!isUniqueViolation(insertError)) throw insertError;
        continue;
      }

      const guarded = sb
        .from('golf_player_notification_state')
        .update({
          prefs: updatedPrefs as unknown as Json,
          updated_at: nextUpdatedAt(row.updated_at),
        })
        .eq('player_id', player.id);
      const { data: written, error: writeError } = await (row.updated_at === null
        ? guarded.is('updated_at', null)
        : guarded.eq('updated_at', row.updated_at)
      ).select('player_id');
      if (writeError) throw writeError;

      if (written && written.length > 0) {
        revalidatePath('/golf/dashboard/settings/notifications');
        return { ok: true, prefs: { prefs: updatedPrefs, quiet_mode: quietMode } };
      }
      // Zero rows: someone else moved `updated_at` first. Loop and re-merge.
    }

    await logServerError(
      `setCategoryChannel exhausted ${PREFS_WRITE_ATTEMPTS} compare-and-set attempts`,
      { action: 'v3.notifications.setChannel' },
      'warning',
    );
    return { ok: false, error: 'Could not save — please try again' };
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
 * Replace the ENTIRE per-category prefs object in one write. Use this for bulk
 * operations (reset defaults, mute a whole channel) rather than firing N
 * parallel setCategoryChannel calls: those are individually safe (each one
 * compare-and-sets on `updated_at` and retries when it loses), but N of them
 * against one row is N serialized round-trips of contention for a result this
 * expresses in a single statement.
 *
 * Deliberately a blind write, not a merge: the caller has already composed the
 * complete desired object, so "last write wins" IS the intent here. A toggle
 * made in another tab between this call's page load and its write is therefore
 * overwritten — that is what "replace all" means, and it is why per-category
 * edits must not route through this function.
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

    // DS-B10-7: same check-then-insert race as setCategoryChannel — upsert on
    // the player_id PK removes it.
    const { error } = await sb
      .from('golf_player_notification_state')
      .upsert(
        {
          player_id: player.id,
          prefs: prefs as unknown as Json,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id' },
      );
    if (error) throw error;

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

    // DS-B10-7: same check-then-insert race as setCategoryChannel/setAllChannels
    // — upsert on the player_id PK removes it. Only `quiet_mode` and
    // `updated_at` are listed, so an existing row's `prefs` column is left
    // untouched by the ON CONFLICT DO UPDATE.
    const { error } = await sb
      .from('golf_player_notification_state')
      .upsert(
        {
          player_id: player.id,
          quiet_mode: enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id' },
      );
    if (error) throw error;
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
