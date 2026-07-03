/**
 * v3 genome persona derivation (W34).
 *
 * Reads a player's genome vector + dimension definitions and produces
 * three editorial summaries:
 *
 *   - strengths: dims where the player ranks high on the radar good-axis
 *     (normalized ≥ 0.7) AND has confidence ≥ 0.5
 *   - watchouts: dims where the player ranks low (≤ 0.3) AND confidence ≥ 0.5
 *   - course_profile: one or two-sentence summary keyed off driver_usage +
 *     par3_proficiency + miss_side_bias
 *
 * All three are pure functions over the vector — no DB hits.
 */

import { GENOME_DIMENSIONS } from './registry';
import { normalizeForRadar } from './normalize';
import type { DimensionResult, GenomeVector } from './types';

export interface PersonaEntry {
  dim_id: string;
  label: string;
  /** The per-dim label from compute() — e.g. "Wizard", "Fades late". */
  qualitative: string | null;
  value: number | string | null;
  confidence: number | null;
}

const STRENGTH_THRESHOLD = 0.7;
const WATCHOUT_THRESHOLD = 0.3;
const MIN_CONFIDENCE = 0.5;
const TOP_N = 3;

export interface Persona {
  strengths: PersonaEntry[];
  watchouts: PersonaEntry[];
  course_profile: string;
}

export function derivePersona(vector: GenomeVector): Persona {
  const scored: Array<PersonaEntry & { norm: number | null }> = [];
  for (const dim of GENOME_DIMENSIONS) {
    const r: DimensionResult | undefined = vector[dim.id];
    if (!r) continue;
    const norm = normalizeForRadar(dim.id, r);
    scored.push({
      dim_id: dim.id,
      label: dim.label,
      qualitative: r.label ?? null,
      value: r.value,
      confidence: r.confidence,
      norm,
    });
  }

  const confident = scored.filter(
    (s) => s.norm !== null && (s.confidence ?? 0) >= MIN_CONFIDENCE,
  );

  const strengths = confident
    .filter((s) => (s.norm ?? 0) >= STRENGTH_THRESHOLD)
    .sort((a, b) => (b.norm ?? 0) - (a.norm ?? 0))
    .slice(0, TOP_N)
    .map(stripNorm);

  const watchouts = confident
    .filter((s) => (s.norm ?? 0) <= WATCHOUT_THRESHOLD)
    .sort((a, b) => (a.norm ?? 0) - (b.norm ?? 0))
    .slice(0, TOP_N)
    .map(stripNorm);

  return {
    strengths,
    watchouts,
    course_profile: buildCourseProfile(vector),
  };
}

function stripNorm(s: PersonaEntry & { norm: number | null }): PersonaEntry {
  return {
    dim_id: s.dim_id,
    label: s.label,
    qualitative: s.qualitative,
    value: s.value,
    confidence: s.confidence,
  };
}

/**
 * One-sentence course-archetype summary. Reads from the dims that
 * most predict course fit: driver_usage (off-tee profile),
 * par3_proficiency (one-shot quality), miss_side_bias (lay-up
 * direction).
 */
function buildCourseProfile(vector: GenomeVector): string {
  const driver = vector['driver_usage'];
  const par3 = vector['par3_proficiency'];
  const miss = vector['miss_side_bias'];

  if (!driver || driver.value === null) return 'Not enough rounds yet for a course profile.';

  const teeProfile = driver.label ?? 'Mixed';
  const par3Note =
    par3 && par3.value !== null
      ? (par3.label === 'Under par'
        ? 'thrives on par-3 holes'
        : par3.label === 'Even'
          ? 'holds steady on par-3 holes'
          : 'leaks shots on par-3 holes')
      : null;
  const missNote =
    miss && miss.value !== null && miss.label && miss.label !== 'Symmetric'
      ? `tendency to miss ${miss.label.toLowerCase().replace(' bias', '')}`
      : null;

  const parts = [
    `${teeProfile.toLowerCase()} off the tee`,
    par3Note,
    missNote,
  ].filter(Boolean) as string[];

  if (parts.length === 0) return 'Not enough rounds yet for a course profile.';

  // Capitalize first word + join with em-dashes for editorial feel.
  const sentence = parts.join(' · ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}




