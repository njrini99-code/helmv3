import type { LoadedGenome } from '@/lib/coachhelm/v3/genome/loader';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';
import { toChProfile, type ChProfile } from '../data/coachhelm-profile-shape';
import type { ChViewLoad } from '../data/coachhelm-views-shape';

/**
 * Sample data for the player's CoachHelm views (Game profile, Standing, Deep dive). Each fixture is the stored shape the loader reads
 * (a genome row, the standing rows) run through the same mapper the page runs, so a preview cannot draw what the page cannot.
 */

/** The day the fixtures were read: "refreshed" wording is relative to it. */
export const VIEWS_NOW = new Date('2026-10-01T15:00:00Z');

// ── Game profile ───────────────────────────────────────────────────────────

const FULL_VECTOR: GenomeVector = {
  miss_side_bias: { value: -0.42, confidence: 0.85, label: 'Left bias' },
  pressure_delta: { value: 0.82, confidence: 0.5, label: 'Tightens up' },
  scrambling_rate: { value: 0.438, confidence: 0.9, label: 'Wizard' },
  par3_proficiency: { value: -0.38, confidence: 1, label: 'Under par' },
  back_nine_delta: { value: 0.31, confidence: 0.7, label: 'Fades late' },
  scoring_trend: { value: -0.64, confidence: 0.33, label: 'Improving' },
  driver_usage: { value: 0.62, confidence: 0.95, label: 'Mixed' },
};

const genome = (vector: GenomeVector, rounds = 14): LoadedGenome => ({ player_id: 'pl-jonah', vector, computed_at: '2026-09-30T02:30:00Z', rounds_basis: rounds });
const PARTIAL_VECTOR: GenomeVector = {
  ...FULL_VECTOR,
  pressure_delta: { value: null, confidence: null },
  scoring_trend: { value: null, confidence: null },
  miss_side_bias: { value: null, confidence: null },
};

export const PREVIEW_PROFILE: ChProfile = toChProfile(genome(FULL_VECTOR), VIEWS_NOW);
export const PREVIEW_PROFILE_PARTIAL: ChProfile = toChProfile(genome(PARTIAL_VECTOR, 6), VIEWS_NOW);
export const PREVIEW_PROFILE_EMPTY: ChProfile = toChProfile(null, VIEWS_NOW);
/** Values at the edge of their scales: bounds, not measurements. */
export const PREVIEW_PROFILE_EDGE: ChProfile = toChProfile(
  genome({ ...FULL_VECTOR, pressure_delta: { value: 3, confidence: 1, label: 'Tightens up' }, back_nine_delta: { value: -2, confidence: 1, label: 'Closes strong' } }),
  VIEWS_NOW,
);

export const profileLoad = (data: ChProfile): ChViewLoad<ChProfile> => ({ status: 'ready', data });
