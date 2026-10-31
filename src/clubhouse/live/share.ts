import { SHARE_LABEL } from './copy';
import type { LiveRoundType, LiveShare } from './model';

/**
 * Live sharing: which levels a round can be at, and which the player may pick (owner calls 1 and 3, defaults taken).
 * A practice round is the player's to share at any level; a qualifier round is always shown to coaches and never to
 * teammates; a tournament round is shown to coaches and has no control. The database floors the same way
 * (`helm_private.golf_round_live_floor`), so this only keeps the control honest.
 */

export const SHARE_LEVELS: readonly LiveShare[] = ['off', 'coaches', 'team'];

/** The level a round of this type is shown at, whatever was asked for. */
export function floorShare(type: LiveRoundType, share: LiveShare): LiveShare {
  return type === 'practice' ? share : 'coaches';
}

/** The three choices as the segmented control draws them. A level a type cannot take is drawn but disabled. */
export function shareOptions(type: LiveRoundType): Array<{ value: LiveShare; label: string; disabled?: boolean }> {
  return SHARE_LEVELS.map((value) => ({ value, label: SHARE_LABEL[value], disabled: type !== 'practice' && value !== 'coaches' ? true : undefined }));
}

/** What a player may do with the control for this round type: change it, read the floor, or nothing (a tournament). */
export type ShareControl = 'choose' | 'floor' | 'none';
export function shareControl(type: LiveRoundType): ShareControl {
  return type === 'practice' ? 'choose' : type === 'qualifier' ? 'floor' : 'none';
}
