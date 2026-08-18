/**
 * Spot the same person appearing twice on one roster (#1477).
 *
 * ── WHAT IS ACTUALLY HAPPENING ──────────────────────────────────────────────
 *
 * A student signs up with a personal address, then again with the school one.
 * Measured against production 2026-08-18, every duplicate pair has a DIFFERENT
 * `user_id` and exactly that personal-vs-institutional split:
 *
 *     Hunter Swidzinski   hunterswidz@gmail.com     / hs8639@uncw.edu
 *     Duncan Wheeler      duncanwheeler00@gmail.com / dwheeler@hsc.edu
 *     Larsen Gallimore    larsengallimore@gmail.com / lgallimore@guilford.edu
 *
 * Two consequences, and both constrain what a fix can be.
 *
 * A `user_id` uniqueness guard — the fix #1477 proposes — would have prevented
 * NONE of these; each signup is a genuinely distinct auth identity. And the
 * Duncan Wheeler pair is not the "unguarded double-submit" it reads as: the
 * rows are 95 seconds apart with two different addresses, which is a person
 * registering, noticing the wrong email, and registering again.
 *
 * ── WHY THIS DETECTS RATHER THAN BLOCKS ─────────────────────────────────────
 *
 * The create path cannot reject this and should not try. Two people may share
 * a name, and refusing a signup on that basis locks a real student out of
 * their team. What the product can stop is the coach finding out by accident:
 * Hunter's rounds attach to one row, so the other reads as a player who has
 * never played, and any per-player surface resolves to whichever id it picks.
 *
 * Detection is WITHIN A TEAM by construction, which also means the deliberate
 * `Demo University Golf` / `Demo University Golf (Pat)` clone pairs are never
 * flagged — those are the buyer demo and deleting them would break it.
 *
 * Precision today: one group across every team in production, and it is a real
 * duplicate.
 */

export interface RosterMemberLike {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  /** Membership status; only `active` rows are considered. */
  status?: string | null;
}

export interface SuspectedDuplicateMember {
  /** Display name, taken from the first row in the group. */
  name: string;
  /** Every member id sharing this name, in the order given. */
  memberIds: string[];
  /**
   * The addresses behind each row. This is the only field that actually tells
   * the coach which is which — in every real case one is personal and one is
   * the school's.
   */
  emails: string[];
}

/** Lowercase, collapse whitespace. Empty when there is no usable name. */
function normalizeName(first: string | null, last: string | null): string {
  return `${first ?? ''} ${last ?? ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findSuspectedDuplicateMembers(
  members: readonly RosterMemberLike[],
): SuspectedDuplicateMember[] {
  const groups = new Map<string, RosterMemberLike[]>();
  const seenIds = new Set<string>();

  for (const m of members) {
    if ((m.status ?? 'active') !== 'active') continue;
    // A join that fans out must not manufacture a duplicate from one row.
    if (seenIds.has(m.id)) continue;
    const key = normalizeName(m.first_name, m.last_name);
    // Two nameless rows are not "the same player" — grouping them would invent
    // a duplicate out of missing data.
    if (!key) continue;
    seenIds.add(m.id);
    const bucket = groups.get(key);
    if (bucket) bucket.push(m);
    else groups.set(key, [m]);
  }

  const out: SuspectedDuplicateMember[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const head = bucket[0]!;
    out.push({
      name: `${head.first_name ?? ''} ${head.last_name ?? ''}`.trim().replace(/\s+/g, ' '),
      memberIds: bucket.map((m) => m.id),
      emails: bucket.map((m) => m.email ?? ''),
    });
  }
  return out;
}
