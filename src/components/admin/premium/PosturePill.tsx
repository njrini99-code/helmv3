import type { ReactNode } from 'react';
import { StatusPill, type FwStatusTone } from '@/components/fairway';
import type { StateTone } from '@/lib/admin/incidents/types';
import type { ReleaseWatchState } from '@/lib/admin/incidents/release-context';
import { RELEASE_WATCH_LABEL } from '@/lib/admin/incidents/release-context';
import { UnknownValue } from './UnknownValue';

/**
 * ============================================================================
 * Bridge Premium · PosturePill
 * ----------------------------------------------------------------------------
 * ONE tone-mapping surface for Bridge's closed-vocabulary states (brief §3
 * "Non-negotiable visual language": "green only for genuinely verified good
 * outcomes; unknown, stale and blind visually distinct from healthy"). Every
 * screen that renders a lifecycle state, a Release Watch state, or any other
 * future closed-vocabulary posture should route through this component
 * instead of building its own tone table — that duplication is exactly how
 * the Bridge ended up with two error tabs that disagreed (`types.ts`'s own
 * header).
 *
 * `BridgePostureTone` is `StateTone` (the vocabulary `types.ts` already
 * defines) PLUS `'unknown'` — deliberately not folded into `'neutral'`.
 * `'unknown'` renders via `UnknownValue`'s hatched treatment, never a plain
 * gray pill, so it can never be mistaken for "we checked and it's fine"
 * (`'neutral'`) at a glance.
 * ========================================================================== */

export type BridgePostureTone = StateTone | 'unknown';

export interface PosturePillProps {
  tone: BridgePostureTone;
  children: ReactNode;
  size?: 'sm' | 'md';
  /** A quiet "live" ping — reserve for genuinely live/actively-updating
   *  posture (a self-heal stage in progress, a release still being watched).
   *  Honors reduced-motion via `StatusPill`. */
  pulse?: boolean;
  /** Required whenever `tone === 'unknown'` — surfaced as the hover tooltip,
   *  same contract as every other "why is this unknown" spot in Bridge. */
  reason?: string | null;
  className?: string;
}

/** `StateTone` has no `success`… wait — it does; the only tone `StatusPill`
 *  itself is missing relative to `StateTone` is nothing: both unions already
 *  agree on danger/warning/accent/success/neutral. This map exists so a
 *  future divergence between the two unions is a compile error here, not a
 *  silent mis-tone somewhere else. */
const TONE_TO_STATUS_PILL: Readonly<Record<StateTone, FwStatusTone>> = {
  danger: 'danger',
  warning: 'warning',
  accent: 'accent',
  success: 'success',
  neutral: 'neutral',
};

export function PosturePill({ tone, children, size = 'md', pulse = false, reason = null, className }: PosturePillProps) {
  if (tone === 'unknown') {
    return (
      <UnknownValue size={size} reason={reason} className={className}>
        {children}
      </UnknownValue>
    );
  }
  return (
    <StatusPill tone={TONE_TO_STATUS_PILL[tone]} size={size} pulse={pulse} className={className}>
      {children}
    </StatusPill>
  );
}

/** Release Watch state -> posture tone, kept beside the pill so a caller
 *  cannot invent a different mapping per screen. `'rollback-recommended'` is
 *  the single worst state Bridge can show today and gets its own danger
 *  rendering identical to `'regression-detected'` — the label text is what
 *  tells the two apart, per "color is never the only indicator". */
export const RELEASE_WATCH_POSTURE_TONE: Readonly<Record<ReleaseWatchState, BridgePostureTone>> = {
  observing: 'neutral',
  'clean-so-far': 'accent',
  degraded: 'warning',
  'regression-detected': 'danger',
  'rollback-recommended': 'danger',
  'proven-healthy': 'success',
  unknown: 'unknown',
};

export function ReleaseWatchPosturePill({ state, pulse = false }: { state: ReleaseWatchState; pulse?: boolean }) {
  return (
    <PosturePill
      tone={RELEASE_WATCH_POSTURE_TONE[state]}
      pulse={pulse && (state === 'observing' || state === 'clean-so-far')}
      reason={state === 'unknown' ? 'Release watch state could not be determined — a required source is blind or the release deploy time is unknown.' : null}
    >
      {RELEASE_WATCH_LABEL[state]}
    </PosturePill>
  );
}
