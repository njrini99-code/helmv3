/**
 * Cloud Course Library — pure helpers (no I/O, fully unit-testable).
 *
 * Used by the server-action DAL (src/app/golf/actions/course-library.ts) and,
 * later, by client dedup hints. Keep these pure so they can run on both sides.
 */

import type {
  GolfCourse,
  GolfCourseTee,
  GolfCourseTeeHole,
  GolfTeamSavedCourse,
} from '@/lib/types/golf-course';

// ─────────────────────────────────────────────────────────────────────────────
// Name normalization — TS mirror of the SQL public.golf_normalize_name().
// MUST stay byte-for-byte equivalent to
//   supabase/migrations/20260613160100_course_library_normalize_fix.sql
// because the stored golf_courses.normalized_name (computed by the SQL fn) is
// matched against values produced here when we dedup-check before insert.
//
// Behavior: lower + trim, drop the "#" token and the WHOLE WORDS "no"/"no."/
// "number", then collapse whitespace. Word-anchored so it can't strip "No" out
// of words like "Northwood".
//   "Pinehurst No. 2" = "Pinehurst #2" = "Pinehurst Number 2" = "Pinehurst 2"
//     = "Pinehurst No.2" → "pinehurst 2"
//   "Northwood Country Club" → "northwood country club"  (No NOT stripped)
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeName(input: string | null | undefined): string {
  const lowered = (input ?? '').trim().toLowerCase();
  // `\bno\b\.?` mirrors SQL `\mno\M\.?`; JS `\b` covers string edges too.
  const stripped = lowered.replace(/(#|\bno\b\.?|\bnumber\b)/g, ' ');
  return stripped.replace(/\s+/g, ' ').trim();
}

/** True when two names refer to the same facility under the dedup key. */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeName(a);
  return na.length > 0 && na === normalizeName(b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tee completeness — an 18-hole tee with < 18 hole rows (or a 9-hole tee with
// < 9) is a DRAFT: visible + editable, but not offered for official tracking.
// ─────────────────────────────────────────────────────────────────────────────
export function isTeeComplete(
  holesCount: number,
  holes: ReadonlyArray<{ hole_number: number; par: number }>,
): boolean {
  if (holesCount !== 9 && holesCount !== 18) return false;
  if (holes.length !== holesCount) return false;
  const seen = new Set<number>();
  for (const h of holes) {
    if (h.hole_number < 1 || h.hole_number > holesCount) return false;
    if (seen.has(h.hole_number)) return false;
    if (!Number.isFinite(h.par) || h.par < 3 || h.par > 6) return false;
    seen.add(h.hole_number);
  }
  return seen.size === holesCount;
}

/** Sum of pars across hole rows (null when empty so callers can leave it unset). */
export function sumPar(holes: ReadonlyArray<{ par: number }>): number | null {
  if (holes.length === 0) return null;
  return holes.reduce((acc, h) => acc + (Number.isFinite(h.par) ? h.par : 0), 0);
}

/** Sum of yardages; null when no hole carries a yardage. */
export function sumYards(holes: ReadonlyArray<{ yardage: number | null }>): number | null {
  const withYards = holes.filter((h) => typeof h.yardage === 'number' && h.yardage! > 0);
  if (withYards.length === 0) return null;
  return withYards.reduce((acc, h) => acc + (h.yardage as number), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit-history diff — { field: { from, to } } over an allow-listed set of
// fields. Returns null when nothing in the allow-list actually changed (so the
// caller can skip writing an empty history row).
// ─────────────────────────────────────────────────────────────────────────────
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: ReadonlyArray<keyof T>,
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    const next = after[f];
    if (next === undefined) continue; // omitted → not a change
    if (!Object.is(next, before[f])) {
      changes[String(f)] = { from: before[f] ?? null, to: next ?? null };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → domain mappers. The new tables are typed in database.ts so these are
// mostly identity, but golf_courses carries legacy aspirational fields the
// domain GolfCourse type expects (default_tee_*, total_yardage, is_public).
// ─────────────────────────────────────────────────────────────────────────────
type CourseRowish = Record<string, unknown>;

export function mapCourseRow(row: CourseRowish): GolfCourse {
  return {
    id: row.id as string,
    name: row.name as string,
    city: (row.city as string) ?? null,
    state: (row.state as string) ?? null,
    country: (row.country as string) ?? null,
    course_rating: (row.course_rating as number) ?? null,
    slope_rating: (row.slope_rating as number) ?? null,
    default_tee_name: null,
    default_tee_color: null,
    total_yardage: null,
    total_par: (row.par as number) ?? null,
    created_by: (row.created_by_user_id as string) ?? null,
    is_public: true,
    created_at: (row.created_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null,
    normalized_name: (row.normalized_name as string) ?? null,
    slug: (row.slug as string) ?? null,
    address: (row.address as string) ?? null,
    website: (row.website as string) ?? null,
    image_url: (row.image_url as string) ?? null,
    source: (row.source as string) ?? null,
    created_by_user_id: (row.created_by_user_id as string) ?? null,
    created_by_team_id: (row.created_by_team_id as string) ?? null,
    last_edited_by_user_id: (row.last_edited_by_user_id as string) ?? null,
    last_edited_by_team_id: (row.last_edited_by_team_id as string) ?? null,
    last_edited_at: (row.last_edited_at as string) ?? null,
    deleted_at: (row.deleted_at as string) ?? null,
  };
}

export function mapTeeRow(row: CourseRowish): GolfCourseTee {
  return {
    id: row.id as string,
    course_id: row.course_id as string,
    tee_name: row.tee_name as string,
    normalized_tee_name: row.normalized_tee_name as string,
    tee_color: (row.tee_color as string) ?? null,
    category: (row.category as GolfCourseTee['category']) ?? null,
    total_yards: (row.total_yards as number) ?? null,
    total_par: (row.total_par as number) ?? null,
    course_rating: (row.course_rating as number) ?? null,
    slope_rating: (row.slope_rating as number) ?? null,
    holes_count: (row.holes_count as number) ?? 18,
    source: (row.source as string) ?? null,
    is_draft: Boolean(row.is_draft),
    created_by_user_id: (row.created_by_user_id as string) ?? null,
    created_by_team_id: (row.created_by_team_id as string) ?? null,
    last_edited_by_user_id: (row.last_edited_by_user_id as string) ?? null,
    last_edited_by_team_id: (row.last_edited_by_team_id as string) ?? null,
    last_edited_at: (row.last_edited_at as string) ?? null,
    deleted_at: (row.deleted_at as string) ?? null,
    created_at: (row.created_at as string) ?? '',
    updated_at: (row.updated_at as string) ?? '',
  };
}

export function mapTeeHoleRow(row: CourseRowish): GolfCourseTeeHole {
  return {
    id: row.id as string,
    tee_id: row.tee_id as string,
    hole_number: row.hole_number as number,
    par: row.par as number,
    yardage: (row.yardage as number) ?? null,
    handicap_index: (row.handicap_index as number) ?? null,
    created_at: (row.created_at as string) ?? '',
    updated_at: (row.updated_at as string) ?? '',
  };
}

export function mapSavedRow(row: CourseRowish): GolfTeamSavedCourse {
  return {
    id: row.id as string,
    team_id: row.team_id as string,
    course_id: row.course_id as string,
    default_tee_id: (row.default_tee_id as string) ?? null,
    pinned: Boolean(row.pinned),
    last_played_at: (row.last_played_at as string) ?? null,
    times_played: (row.times_played as number) ?? 0,
    created_by_user_id: (row.created_by_user_id as string) ?? null,
    created_at: (row.created_at as string) ?? '',
    updated_at: (row.updated_at as string) ?? '',
  };
}
