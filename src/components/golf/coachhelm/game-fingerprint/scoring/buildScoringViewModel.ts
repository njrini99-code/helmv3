/**
 * ============================================================================
 * buildScoringViewModel — pure adapter for the A7 Scoring surface (addendum
 * §13, slice 2).
 * ----------------------------------------------------------------------------
 * Takes A3's flat `MetricResult[]` (`computeParOpportunities`) and splits it
 * into A3's own two independent metric families (see that file's header):
 *
 *   - `parSections` — one section per par (3/4/5) present in the results,
 *     each holding an `'all'` row plus whichever length-band rows cleared
 *     their own sample floor. Identity-agnostic: never keyed by hole.
 *   - `par5Holes` — one card per SPECIFIC par-5 hole (keyed by
 *     `dimensions.course_hole_key`), each holding its three opportunity
 *     rows (regulation, green-in-two, putting conversion) in that fixed
 *     order.
 *
 * Every row's `kind` is copied directly from `MetricResult.status` — never
 * inferred from `value !== null` — mirroring `buildDistanceProfileViewModel`
 * (A2)'s own rule exactly. This file does no fetching, no Supabase, and no
 * formatting beyond label text; it is a plain function of its input.
 * ========================================================================== */

import type { MetricResult, MetricStatus } from '@/lib/coachhelm/v3/metrics/par-opportunities';

type ParValue = 3 | 4 | 5;
type ParLengthGroup = 'all' | 'short' | 'mid' | 'long';

const PAR_LENGTH_METRIC_ID = 'par_length_scoring';
const PAR5_METRIC_ORDER = [
  'par5_regulation_opportunity_rate',
  'par5_green_in_two_rate',
  'par5_putting_conversion_rate',
] as const;
type Par5MetricId = (typeof PAR5_METRIC_ORDER)[number];

const PAR5_METRIC_LABELS: Record<Par5MetricId, string> = {
  par5_regulation_opportunity_rate: 'Regulation opportunity rate',
  par5_green_in_two_rate: 'Green-in-two rate',
  par5_putting_conversion_rate: 'Putting conversion rate',
};

const LENGTH_GROUP_ORDER: readonly ParLengthGroup[] = ['all', 'short', 'mid', 'long'];

function isParLengthGroup(value: string): value is ParLengthGroup {
  return (LENGTH_GROUP_ORDER as readonly string[]).includes(value);
}

function isPar5MetricId(value: string): value is Par5MetricId {
  return (PAR5_METRIC_ORDER as readonly string[]).includes(value);
}

/** "All", or a yardage range built from the row's own `dimensions` — never
 *  a hardcoded copy of `par-opportunities.ts`'s band constants, so a future
 *  cutoff change is reflected here automatically. `band_max_yards` absent
 *  means "no upper bound" (the `'long'` band). */
function lengthGroupLabel(lengthGroup: ParLengthGroup, dimensions: MetricResult['dimensions']): string {
  if (lengthGroup === 'all') return 'All';
  const min = dimensions.band_min_yards;
  const max = dimensions.band_max_yards;
  if (typeof min !== 'number') return lengthGroup;
  if (typeof max !== 'number') return `${min}+ yd`;
  return `${min}-${max} yd`;
}

export interface ScoringParRowViewModel {
  lengthGroup: ParLengthGroup;
  label: string;
  kind: MetricStatus;
  row: MetricResult;
}

export interface ScoringParSectionViewModel {
  par: ParValue;
  label: string;
  rows: ScoringParRowViewModel[];
}

export interface ScoringPar5RowViewModel {
  metricId: Par5MetricId;
  label: string;
  kind: MetricStatus;
  row: MetricResult;
}

export interface ScoringPar5HoleViewModel {
  courseHoleKey: string;
  courseId: string;
  holeNumber: number;
  label: string;
  /**
   * A course-distinguishing label — the resolved `golf_courses.name` when
   * `courseNameById` supplies one, otherwise a short, honest fallback built
   * from `courseId` (never a raw full UUID dump, and never silently
   * dropped). Without this, "Hole 7" at two different courses in the same
   * player's history renders as two identical, indistinguishable cards —
   * the exact cross-course conflation A3's own identity keying
   * (`holeIdentityKey`, `course_hole_key`) exists to prevent one layer down;
   * this label is what keeps that distinction visible at the surface too.
   */
  courseLabel: string;
  rows: ScoringPar5RowViewModel[];
}

export interface ScoringViewModel {
  parSections: ScoringParSectionViewModel[];
  par5Holes: ScoringPar5HoleViewModel[];
}

/** A short, honest fallback when a course's real name isn't available —
 *  never a raw full UUID dump, but never a fabricated name either. */
function fallbackCourseLabel(courseId: string): string {
  return `Course ${courseId.slice(0, 8)}`;
}

/**
 * Groups `computeParOpportunities`'s flat result array into the two
 * independent view sections above, in canonical par / length-band / hole
 * order. A row this builder cannot place (unrecognized `metricId`, or a
 * dimension shape that doesn't match what that `metricId` is expected to
 * carry) is dropped rather than guessed into a section — a hole/par-5 row
 * with no `course_hole_key` at all should already be impossible per A3's
 * own identity contract, but this builder never renders one under a
 * fabricated identity either way.
 *
 * `courseNameById` (optional — the caller's own `golf_courses.name` lookup,
 * keyed by `course_id`) resolves each par-5 card's `courseLabel`. Without
 * it, two different courses' hole 7 would both render as a bare "Hole 7" —
 * indistinguishable at the surface even though A3 itself never conflates
 * them (`course_hole_key`/`holeIdentityKey`). A missing entry falls back to
 * a short id fragment rather than silently omitting the distinction.
 */
export function buildScoringViewModel(
  results: readonly MetricResult[],
  courseNameById: Readonly<Record<string, string>> = {},
): ScoringViewModel {
  const byPar = new Map<ParValue, Map<ParLengthGroup, MetricResult>>();
  const byHole = new Map<string, { courseId: string; holeNumber: number; rows: Map<Par5MetricId, MetricResult> }>();

  for (const result of results) {
    if (result.metricId === PAR_LENGTH_METRIC_ID) {
      const par = result.dimensions.par;
      const lengthGroup = result.dimensions.length_group;
      if (typeof par !== 'number' || (par !== 3 && par !== 4 && par !== 5)) continue;
      if (typeof lengthGroup !== 'string' || !isParLengthGroup(lengthGroup)) continue;
      let byLengthGroup = byPar.get(par);
      if (!byLengthGroup) {
        byLengthGroup = new Map();
        byPar.set(par, byLengthGroup);
      }
      byLengthGroup.set(lengthGroup, result);
      continue;
    }

    if (isPar5MetricId(result.metricId)) {
      const courseHoleKey = result.dimensions.course_hole_key;
      const courseId = result.dimensions.course_id;
      const holeNumber = result.dimensions.hole_number;
      if (typeof courseHoleKey !== 'string' || typeof courseId !== 'string' || typeof holeNumber !== 'number') {
        continue;
      }
      let hole = byHole.get(courseHoleKey);
      if (!hole) {
        hole = { courseId, holeNumber, rows: new Map() };
        byHole.set(courseHoleKey, hole);
      }
      hole.rows.set(result.metricId, result);
    }
  }

  const parSections: ScoringParSectionViewModel[] = [];
  for (const par of [3, 4, 5] as const) {
    const byLengthGroup = byPar.get(par);
    if (!byLengthGroup) continue;
    const rows: ScoringParRowViewModel[] = [];
    for (const lengthGroup of LENGTH_GROUP_ORDER) {
      const row = byLengthGroup.get(lengthGroup);
      if (!row) continue;
      rows.push({
        lengthGroup,
        label: lengthGroupLabel(lengthGroup, row.dimensions),
        kind: row.status,
        row,
      });
    }
    if (rows.length > 0) parSections.push({ par, label: `Par ${par}`, rows });
  }

  const par5Holes: ScoringPar5HoleViewModel[] = [...byHole.entries()]
    .sort(([, a], [, b]) => a.holeNumber - b.holeNumber)
    .map(([courseHoleKey, hole]) => {
      const rows: ScoringPar5RowViewModel[] = [];
      for (const metricId of PAR5_METRIC_ORDER) {
        const row = hole.rows.get(metricId);
        if (!row) continue;
        rows.push({ metricId, label: PAR5_METRIC_LABELS[metricId], kind: row.status, row });
      }
      return {
        courseHoleKey,
        courseId: hole.courseId,
        holeNumber: hole.holeNumber,
        label: `Hole ${hole.holeNumber}`,
        courseLabel: courseNameById[hole.courseId] ?? fallbackCourseLabel(hole.courseId),
        rows,
      };
    })
    .filter((hole) => hole.rows.length > 0);

  return { parSections, par5Holes };
}
