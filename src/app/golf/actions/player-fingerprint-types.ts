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
import type { FormScore } from '@/lib/golf/form-score';

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
  /** `value` null = no data for that bar (drawn as a gap, never as 0). */
  | { kind: 'bars'; bars: Array<{ label: string; value: number | null; max?: number }> }
  | {
      kind: 'pills';
      pills: Array<{ label: string; value: string; tone: 'good' | 'neutral' | 'bad' }>;
    }
  | null;

/**
 * Strokes gained per round over one window of COUNTABLE rounds (FP-09): the
 * last 5, the last 10, or all of them. Same aggregator as the sections' SG
 * (aggregateCountableRounds over golf_round_stats_cache), so the "all" scope
 * equals the ledger's SG.
 */
export type FingerprintSgScopeKey = 'last5' | 'last10' | 'all';

export interface FingerprintSgScope {
  key: FingerprintSgScopeKey;
  /** Countable rounds in the window. */
  rounds: number;
  /** Of those, rounds that carried strokes gained. */
  sgRounds: number;
  total: number | null;
  tee: number | null;
  approach: number | null;
  short_game: number | null;
  putting: number | null;
}

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
    /** The Form score (OD-02), 0–99; null with no countable rounds. */
    rating: number | null;
    trend: 'up' | 'flat' | 'down';
    rounds_in_calculation: number;
    /** Form's quality ("Early read") and formula inputs (src/lib/golf/form-score.ts). */
    form: FormScore;
  };
  /** Rounds the section metrics rest on (the stats-cache window), which can
   *  differ from `composite.rounds_in_calculation`. */
  metrics_rounds: number;
  /** Strokes gained per round by window (FP-09). Absent when the per-round
   *  read failed; the screen then shows the all-rounds waterfall only. */
  sg_scopes?: FingerprintSgScope[];
  sections: Record<FingerprintSectionKey, SectionData>;
  trend: {
    rolling: FingerprintTrendPoint[];
  };
  generated_at: string;
}
