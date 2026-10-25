import { normalizeName } from '@/lib/golf/course-library';
import { isUuid } from '@/lib/utils/uuid';

/*
 * P-7: what counts as "a course" for one player's rounds, and the address of its page.
 *
 * Rounds carry `course_id` when the course is in the library, and always `course_name`. Many rounds have no id (a typed
 * course, a saved course with no library row), so a course is grouped by id first and then by normalized name: a round
 * with no id joins an id group when its normalized name maps to exactly one id, and otherwise forms a name group. A round
 * with no name belongs to no course. The Rounds library's "By course" view and the course page both group with this, so
 * their counts never disagree.
 *
 * Pure: no Supabase, no React.
 */

export type ChCourseKey = { kind: 'id'; id: string } | { kind: 'name'; normalized: string };

/** The fields a round needs to be grouped. */
export interface ChCourseRoundLite {
  id: string;
  course_id: string | null;
  course_name: string | null;
}

export interface ChCourseRoundGroup<T extends ChCourseRoundLite> {
  key: ChCourseKey;
  /** The group's name as typed on its newest round (the first in `rounds` order), trimmed. */
  name: string;
  rounds: T[];
}

const NAME_PREFIX = 'n-';
const NAME_MAX = 120;

/** The key as it sits in the address: the bare uuid, or `n-` plus the normalized name, URI-encoded. */
export function courseKeyString(k: ChCourseKey): string {
  return k.kind === 'id' ? k.id : NAME_PREFIX + encodeURIComponent(k.normalized);
}

/** A key read back from the address; null for anything that is neither a uuid nor a usable name key. */
export function parseCourseKey(raw: string): ChCourseKey | null {
  // `isUuid` is a type guard on unknown; read through it without narrowing `raw` away on the false branch.
  if (isUuid(raw as unknown)) return { kind: 'id', id: raw.toLowerCase() };
  if (!raw.startsWith(NAME_PREFIX)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.slice(NAME_PREFIX.length));
  } catch {
    return null;
  }
  // Read back through the same normalizer, so a hand-edited address cannot name a group no round belongs to.
  const normalized = normalizeName(decoded);
  if (!normalized || normalized.length > NAME_MAX || normalized !== decoded) return null;
  return { kind: 'name', normalized };
}

/**
 * One player's rounds by course, keyed by `courseKeyString`. Order inside each group is the input's (the loaders pass
 * newest first). Rounds with no course name and no id belong to no group.
 */
export function groupCourseRounds<T extends ChCourseRoundLite>(rounds: readonly T[]): Map<string, ChCourseRoundGroup<T>> {
  // Which library ids each normalized name has been seen with.
  const idsByName = new Map<string, Set<string>>();
  for (const r of rounds) {
    if (!r.course_id) continue;
    const n = normalizeName(r.course_name);
    if (!n) continue;
    const set = idsByName.get(n) ?? new Set<string>();
    set.add(r.course_id.toLowerCase());
    idsByName.set(n, set);
  }
  const groups = new Map<string, ChCourseRoundGroup<T>>();
  for (const r of rounds) {
    const n = normalizeName(r.course_name);
    let key: ChCourseKey | null = null;
    if (r.course_id) key = { kind: 'id', id: r.course_id.toLowerCase() };
    else if (n) {
      const ids = idsByName.get(n);
      key = ids && ids.size === 1 ? { kind: 'id', id: [...ids][0]! } : { kind: 'name', normalized: n };
    }
    if (!key) continue;
    const k = courseKeyString(key);
    const g = groups.get(k);
    if (g) g.rounds.push(r);
    else groups.set(k, { key, name: (r.course_name ?? '').trim(), rounds: [r] });
  }
  return groups;
}

/**
 * Which group an address names, or where it should go instead: a name key whose name now maps to one library id
 * redirects to that id; an id key no round carries, whose library name matches a name group, redirects to the name.
 * `libraryName` is the `golf_courses` name for an id key, when the loader read it.
 */
export function resolveCourseKey<T extends ChCourseRoundLite>(
  key: ChCourseKey,
  groups: Map<string, ChCourseRoundGroup<T>>,
  libraryName?: string | null,
): { group: string | null; redirectTo: string | null } {
  const k = courseKeyString(key);
  if (groups.has(k)) return { group: k, redirectTo: null };
  if (key.kind === 'name') {
    for (const [gk, g] of groups) {
      if (g.key.kind === 'id' && g.rounds.some((r) => normalizeName(r.course_name) === key.normalized)) return { group: null, redirectTo: gk };
    }
    return { group: null, redirectTo: null };
  }
  const n = normalizeName(libraryName);
  if (n) {
    const byName = courseKeyString({ kind: 'name', normalized: n });
    if (groups.has(byName)) return { group: null, redirectTo: byName };
  }
  return { group: null, redirectTo: null };
}

/** The course page for a key: `/golf/dashboard/rounds/course/<key>`, with the coach's player, a hole or the season window. */
export function courseHref(k: ChCourseKey | string, opts: { player?: string; hole?: number; window?: 'season' } = {}): string {
  const key = typeof k === 'string' ? k : courseKeyString(k);
  const q = new URLSearchParams();
  if (opts.player) q.set('player', opts.player);
  if (opts.hole != null && Number.isInteger(opts.hole) && opts.hole >= 1 && opts.hole <= 18) q.set('hole', String(opts.hole));
  if (opts.window) q.set('w', opts.window);
  const s = q.toString();
  return `/golf/dashboard/rounds/course/${key}${s ? `?${s}` : ''}`;
}
