/**
 * v3 Player Genome — dimension registry (W33-pt1 + W33-pt2).
 *
 * Every dimension implementation gets imported here and added to
 * GENOME_DIMENSIONS. The orchestrator runs whatever is in this array,
 * so adding a new dimension is one line + one new file under dimensions/.
 *
 * 7 dims shipped — one per category — so the radar has data in every
 * spoke. The weather_sensitivity stub was retired (audit row 18,
 * 2026-09-28): no weather or temperature is recorded, so it could never
 * produce a value and only padded the count ("6 of 8 real"). A weather
 * dimension comes back with a data source, not before.
 */

import missSideBias from './dimensions/miss-side-bias';
import pressureDelta from './dimensions/pressure-delta';
import scramblingRate from './dimensions/scrambling-rate';
import par3Proficiency from './dimensions/par3-proficiency';
import backNineDelta from './dimensions/back-nine-delta';
import scoringTrend from './dimensions/scoring-trend';
import driverUsage from './dimensions/driver-usage';
import type { GenomeDimension } from './types';

export const GENOME_DIMENSIONS: readonly GenomeDimension[] = [
  // One dim per category — order mirrors GENOME_CATEGORIES.
  missSideBias,            // miss_tendencies
  pressureDelta,           // pressure_response
  scramblingRate,          // recovery_patterns
  par3Proficiency,         // course_type_affinity
  backNineDelta,           // stamina
  scoringTrend,            // learning_velocity
  driverUsage,             // strategic_profile
];

/** Quick lookup by id (used by /compare and by-dim queries). */
export function getDimension(id: string): GenomeDimension | undefined {
  return GENOME_DIMENSIONS.find((d) => d.id === id);
}
