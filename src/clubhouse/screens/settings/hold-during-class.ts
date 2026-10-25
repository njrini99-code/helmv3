'use client';

import { useMemo, useState } from 'react';
import { refetchMyClassDay, useMyClassDay } from '../../lib/use-class-day';
import { useClassAwareness } from '../../shell/context';
import { createLiveClassStatusWrites } from '../classes/class-status-writes';
import type { ChSettingsData } from './model';
import { useInstantSave } from './parts';

/**
 * P-10 class awareness: Settings > Notifications > "Hold during class", a player's switch, one row under Quiet mode. Non-urgent
 * pushes wait until class ends and then arrive as one; urgent ones still come through. Stored in
 * golf_player_class_settings.hold_pushes (never in users.notification_preferences, whose whitelist would drop a new key).
 *
 * Draws nothing (`null`) for a coach, with the flag off, or while the class day is not there (the migrations are held, the player
 * has no team). While sharing is off the switch is off and disabled, and says how to turn it back on. Turning it off sends anything
 * waiting now.
 */
export const HOLD_HELP = 'Non-urgent pushes wait until class ends, then arrive as one. Urgent ones still come through.';
export const HOLD_HELP_NEEDS_SHARING = 'Turn on class status sharing in Classes to hold pushes.';

export type ChHoldRow = {
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  saved: boolean;
  help: string;
  onChange: (on: boolean) => void;
};

export function useHoldDuringClass(data: Pick<ChSettingsData, 'role' | 'playerId' | 'teamId'>): ChHoldRow | null {
  const awareness = useClassAwareness();
  const enabled = awareness && data.role === 'player' && !!data.playerId && !!data.teamId;
  const { day } = useMyClassDay({ enabled });
  const writes = useMemo(() => (enabled ? createLiveClassStatusWrites({ playerId: data.playerId!, teamId: data.teamId! }) : null), [enabled, data.playerId, data.teamId]);
  const save = useInstantSave('class hold');
  const [override, setOverride] = useState<boolean | null>(null);
  if (!enabled || !writes || !day) return null;

  const sharing = day.settings.shareStatus;
  const onChange = (on: boolean) =>
    void save
      .run({
        key: 'class_hold',
        apply: () => setOverride(on),
        rollback: () => setOverride(null),
        write: async () => {
          const r = await writes.setHold(on);
          // Turning it off sends what is waiting at once (best effort: the next tick would too).
          if (r.success && !on) void writes.deliverNow();
          return r;
        },
        failed: 'Couldn’t change Hold during class',
        code: 'CH-8030',
      })
      .then(async (ok) => {
        if (ok) await refetchMyClassDay();
        setOverride(null);
      });

  return {
    checked: sharing && (override ?? day.settings.holdPushes),
    disabled: !sharing,
    busy: save.pending.has('class_hold'),
    saved: save.saved.has('class_hold'),
    help: sharing ? HOLD_HELP : HOLD_HELP_NEEDS_SHARING,
    onChange,
  };
}
