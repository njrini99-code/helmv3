/**
 * Fairway · Recruiting · status vocabulary.
 *
 * Ports the legacy `RECRUIT_STATUSES` value/label/description set (source of
 * truth for those strings: `@/components/golf/recruiting/RecruitStatusChip`)
 * and re-expresses the four per-status tones in Fairway's `FwStatusTone`
 * vocabulary. Rendering only — the `RecruitStatus` type still comes from the
 * canonical actions module.
 *
 * Tone mapping (legacy → Fairway). Fairway's FwStatusTone has no `violet`/`blue`
 * (the locked palette is green-forward; amber + red the only off-green hues), so
 * the four legacy tones collapse onto the honest Fairway set:
 *   watched    (amber)   → warning   (tracking from afar — warm amber)
 *   recruiting (primary) → accent    (actively engaged — the single green accent)
 *   offered    (violet)  → info      (offer out — quiet neutral; no blue/violet token)
 *   committed  (blue)    → success   (locked in — the positive green-family tone)
 */

import type { FwStatusTone } from '@/components/fairway/controls';
import type { RecruitStatus } from '@/app/golf/actions/recruiting';

export interface RecruitStatusMeta {
  value: RecruitStatus;
  label: string;
  description: string;
  tone: FwStatusTone;
}

export const RECRUIT_STATUS_META: RecruitStatusMeta[] = [
  { value: 'watched', label: 'Watched', description: 'Tracking from a distance', tone: 'warning' },
  { value: 'recruiting', label: 'Recruiting', description: 'Actively engaged', tone: 'accent' },
  { value: 'offered', label: 'Offered', description: 'Offer extended', tone: 'info' },
  { value: 'committed', label: 'Committed', description: 'Locked in', tone: 'success' },
];

const BY_VALUE = Object.fromEntries(
  RECRUIT_STATUS_META.map((s) => [s.value, s]),
) as Record<RecruitStatus, RecruitStatusMeta>;

export function recruitStatusMeta(status: RecruitStatus): RecruitStatusMeta {
  return BY_VALUE[status] ?? RECRUIT_STATUS_META[1]!;
}
