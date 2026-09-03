/**
 * Command Deck tone tokens.
 *
 * A local `StateTone`-keyed rail/ink pairing, same shape as
 * `AttentionQueue.tsx` / `TruthStrip.tsx` / `ChangeTimeline.tsx` each already
 * keep (see `AttentionQueue.tsx`'s header comment for why: `Row.tsx`'s
 * `RailRow` is keyed by a different five-value axis, `RowSeverity`, and
 * forcing this file's `StateTone` rows onto it is the wrong fix). This is
 * the fourth copy of that same small map, which is the established pattern
 * here, not a new one.
 *
 * `-ink` pairings, never the raw semantic token, on TEXT — `design-tokens.css`
 * measured `text-fw-warning` at 2.08:1 and `text-fw-danger` at 4.01:1 against
 * the card; the `-ink` pairings measure 7.27:1.
 */

import type { PostureTone } from '@/lib/admin/command-deck/types';
import type { StateTone } from '@/lib/admin/incidents/types';

export const TONE_RAIL: Readonly<Record<StateTone, string>> = {
  danger: 'bg-fw-danger',
  warning: 'bg-fw-warning',
  success: 'bg-fw-success',
  accent: 'bg-accent-600',
  neutral: 'bg-warm-300',
};

export const TONE_INK: Readonly<Record<StateTone, string>> = {
  danger: 'text-fw-danger-ink',
  warning: 'text-fw-warning-ink',
  success: 'text-fw-success-ink',
  accent: 'text-accent-700',
  neutral: 'text-warm-500',
};

export const POSTURE_TONE_INK: Readonly<Record<PostureTone, string>> = {
  healthy: 'text-fw-success-ink',
  degraded: 'text-fw-warning-ink',
  critical: 'text-fw-danger-ink',
  unknown: 'text-warm-500',
};

export const POSTURE_TONE_RAIL: Readonly<Record<PostureTone, string>> = {
  healthy: 'bg-fw-success',
  degraded: 'bg-fw-warning',
  critical: 'bg-fw-danger',
  unknown: 'bg-warm-300',
};

/** Node-state -> the same four-way palette, since `OrbitNodeState` and
 *  `PostureTone` share the same four values by construction. */
export const NODE_STATE_INK = POSTURE_TONE_INK;
export const NODE_STATE_RAIL = POSTURE_TONE_RAIL;
