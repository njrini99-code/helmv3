/**
 * Player Fingerprint shape — extracted from `player-fingerprint.ts` so that
 * non-async values (types + the section-order const) can be imported without
 * breaking the `'use server'` constraint that only async functions may be
 * exported from a server-actions file.
 *
 * Server-action file imports these (along with `EvidenceInsight`) and
 * downstream UI imports them too. Keep this file pure: no React, no Supabase,
 * no `'use server'` directive.
 */

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

export type FingerprintSectionKey =
  | 'tee'
  | 'approach'
  | 'short_game'
  | 'putting'
  | 'scoring'
  | 'pressure';

/** Stable section order — the UI renders in this order; tests assert it. */
export const FINGERPRINT_SECTION_ORDER: readonly FingerprintSectionKey[] = [
  'tee',
  'approach',
  'short_game',
  'putting',
  'scoring',
  'pressure',
] as const;

export interface FingerprintMetric {
  label: string;
  value: string;
  comparison?: string;
  tone: 'good' | 'neutral' | 'bad';
}

/** Shape passed to the per-section chart primitive. Unknown on purpose — each
 *  section knows its own chart and reads the fields it needs. */
export type FingerprintChartData =
  | { kind: 'bars'; bars: Array<{ label: string; value: number; max?: number }> }
  | {
      kind: 'pills';
      pills: Array<{ label: string; value: string; tone: 'good' | 'neutral' | 'bad' }>;
    }
  | null;

export interface SectionData {
  key: FingerprintSectionKey;
  category: string;
  /** `true` when we have < 5 qualifying samples for this section's
   *  underlying metric(s). UI renders "Not enough data" but preserves the
   *  slot so the layout doesn't shift. */
  sparse: boolean;
  metrics: FingerprintMetric[];
  insights: EvidenceInsight[];
  chart_data: FingerprintChartData;
}

export interface FingerprintTrendPoint {
  round_id: string;
  round_date: string;
  score_to_par: number | null;
  total_score: number | null;
  course_name: string | null;
  notable: boolean;
}

export interface PlayerFingerprint {
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    team_name: string | null;
    /** `golf_players.avatar_url` — feeds the identity-header Avatar on both
     *  the coach Game Fingerprint page and the player's own Game profile
     *  tab. Null → the Avatar primitive falls back to initials. */
    avatar_url: string | null;
  };
  composite: {
    rating: number | null;
    trend: 'up' | 'flat' | 'down';
    rounds_in_calculation: number;
  };
  sections: Record<FingerprintSectionKey, SectionData>;
  trend: {
    rolling: FingerprintTrendPoint[];
  };
  generated_at: string;
}
