/**
 * v3 Player Genome — dimension registry (W33-pt1).
 *
 * Every dimension implementation gets imported here and added to
 * GENOME_DIMENSIONS. The orchestrator runs whatever is in this array,
 * so adding a new dimension is one line + one new file under dimensions/.
 *
 * W33-pt1 ships 1 example dimension (miss_side_bias). W33-pt2 fills
 * out 7 more (one per category) so the radar has data in every spoke.
 * The remaining 72 land as data sources mature.
 */

import missSideBias from './dimensions/miss-side-bias';
import type { GenomeDimension } from './types';

export const GENOME_DIMENSIONS: readonly GenomeDimension[] = [
  missSideBias,
];

/** Quick lookup by id (used by /compare and by-dim queries). */
export function getDimension(id: string): GenomeDimension | undefined {
  return GENOME_DIMENSIONS.find((d) => d.id === id);
}
