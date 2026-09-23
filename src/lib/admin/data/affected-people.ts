import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_AFFECTED_PEOPLE, type AffectedPerson } from '@/lib/admin/data/triage';

/**
 * Turning an incident's identities into people an operator can recognise.
 *
 * WHY THIS EXISTS. `mergeTriage` has always built a Set of `user_id` /
 * `user_email` per fingerprint and then kept only `.size` — so every Bridge
 * surface could say "2 users" and none could say WHICH two. Meanwhile
 * `/admin/thread/[entity]/[id]` and `entity-thread.ts` have shipped the whole
 * time with nothing linking to them from an incident. The identities were
 * read out of the database on every page load and discarded one line later;
 * this module is the other half.
 *
 * NAMES DO NOT LIVE ON `users`. That table is `id, email, role, created_at,
 * last_seen` and nothing else — a person's name is on their sport profile
 * (`golf_players.first_name/last_name`, `golf_coaches.full_name`, and the
 * baseball pair), which is also where their role comes from. Resolving a name
 * therefore means fanning out across four profile tables, which is why this is
 * one bounded helper rather than an inline join at each call site.
 *
 * DEGRADES, NEVER THROWS. A name is an enrichment on a page whose real subject
 * is the fault. Every lookup below is failure-tolerant and falls back to the
 * email, then to a shortened id — an operator who can see "3 people" and one
 * unresolved id is strictly better off than one looking at a stale panel
 * because a profile join 500'd.
 */

/** One affected person, resolved as far as the database allows. */
export interface ResolvedAffectedPerson {
  userId: string | null;
  email: string | null;
  /** Best available label: real name → email → shortened id → 'Unknown user'. */
  name: string;
  /** 'player' / 'coach' when a sport profile matched; null otherwise. */
  role: string | null;
  sport: 'golf' | 'baseball' | null;
  /**
   * `/admin/thread/user/<id>`, or null when this row carried only an email.
   * NEVER built from an email — the thread page resolves by user id, so an
   * email href is a link that cannot land.
   */
  href: string | null;
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function joinName(first: string | null, last: string | null): string | null {
  const name = `${first ?? ''} ${last ?? ''}`.trim();
  return name.length > 0 ? name : null;
}

/**
 * Resolve identities to display records, preserving input order.
 *
 * Bounded by `MAX_AFFECTED_PEOPLE` at the caller (`affectedPeople` is already
 * capped when it is built), so the four `IN (…)` lookups below stay well under
 * PostgREST's URL ceiling without chunking — unlike `queryPriorResolutions`,
 * which is bounded only by the size of the feed.
 */
export async function resolveAffectedPeople(
  people: readonly AffectedPerson[],
): Promise<ResolvedAffectedPerson[]> {
  const capped = people.slice(0, MAX_AFFECTED_PEOPLE);
  if (capped.length === 0) return [];

  const ids = capped.map((p) => p.userId).filter((id): id is string => Boolean(id));
  const emailById = new Map<string, string>();
  const names = new Map<string, { name: string; role: string; sport: 'golf' | 'baseball' }>();

  if (ids.length > 0) {
    const admin = createAdminClient();
    const [users, golfPlayers, golfCoaches, ballPlayers, ballCoaches] = await Promise.all([
      admin.from('users').select('id, email').in('id', ids),
      admin.from('golf_players').select('user_id, first_name, last_name').in('user_id', ids),
      admin.from('golf_coaches').select('user_id, full_name').in('user_id', ids),
      admin.from('baseball_players').select('user_id, first_name, last_name').in('user_id', ids),
      admin.from('baseball_coaches').select('user_id, full_name').in('user_id', ids),
    ]);

    // Each read is inspected on its own: one failed profile table costs that
    // table's names, not the whole panel. supabase-js resolves a failure as
    // `{ data: null, error }`, so an unbound `error` would silently read as
    // "this person has no profile" — a working empty rather than a broken
    // read, which is the distinction this Bridge exists to preserve.
    if (users.error) {
      console.warn('[resolveAffectedPeople] users lookup failed', users.error.message);
    }
    for (const row of (users.data ?? []) as Array<{ id: string; email: string | null }>) {
      if (row.email) emailById.set(row.id, row.email);
    }

    const profileReads = [
      { res: golfPlayers, role: 'player', sport: 'golf' as const, kind: 'split' as const },
      { res: golfCoaches, role: 'coach', sport: 'golf' as const, kind: 'full' as const },
      { res: ballPlayers, role: 'player', sport: 'baseball' as const, kind: 'split' as const },
      { res: ballCoaches, role: 'coach', sport: 'baseball' as const, kind: 'full' as const },
    ];
    for (const { res, role, sport, kind } of profileReads) {
      if (res.error) {
        console.warn(`[resolveAffectedPeople] ${sport} ${role} lookup failed`, res.error.message);
        continue;
      }
      for (const raw of res.data ?? []) {
        const row = raw as {
          user_id: string | null;
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
        };
        if (!row.user_id || names.has(row.user_id)) continue;
        const name =
          kind === 'split' ? joinName(row.first_name ?? null, row.last_name ?? null) : (row.full_name ?? null);
        if (name) names.set(row.user_id, { name, role, sport });
      }
    }
  }

  return capped.map((person) => {
    const profile = person.userId ? names.get(person.userId) : undefined;
    // The row's own captured email first: it is what the fault actually
    // recorded. The `users` row is the fallback for a capture path that stored
    // an id and no address.
    const email = person.email ?? (person.userId ? (emailById.get(person.userId) ?? null) : null);
    const name =
      profile?.name ?? email ?? (person.userId ? shortId(person.userId) : null) ?? 'Unknown user';
    return {
      userId: person.userId,
      email,
      name,
      role: profile?.role ?? null,
      sport: profile?.sport ?? null,
      href: person.userId ? `/admin/thread/user/${person.userId}` : null,
    };
  });
}

/**
 * Every distinct person behind ONE fingerprint, straight from `admin_events`.
 *
 * The detail page needs this rather than the board's `affectedPeople`, for two
 * reasons: the board is windowed (72h by default) while the detail page is the
 * fault's whole history, and the board's array is capped for transport. This
 * reads the identity columns alone — two columns, no message text — so it is
 * cheap enough to run per detail view.
 *
 * `row:<id>` keys resolve by primary key, mirroring `fetchFingerprintDetail`'s
 * own `scoped()` branch, so a pre-fingerprint row's detail page works too.
 *
 * IDENTITY_ROW_LIMIT is a TOTAL bound across pages, not a single-request
 * `.limit()` — PostgREST caps every request at 1,000 rows regardless of what
 * is asked for (`.claude/rules/database.md`), so a bare `.limit(2000)` here
 * silently returned only 1,000 rows and looked complete. `PAGE_SIZE` stays at
 * the cap and the loop below drains up to `IDENTITY_ROW_LIMIT` total rows in
 * pages of `PAGE_SIZE`, ordered by `created_at` with an `id` tiebreaker so
 * page boundaries don't drift when many rows share a timestamp.
 */
const IDENTITY_ROW_LIMIT = 2000;
const PAGE_SIZE = 1000;

export async function fetchAffectedPeopleForFingerprint(
  rawFingerprint: string,
): Promise<{ people: ResolvedAffectedPerson[]; total: number; known: boolean }> {
  const admin = createAdminClient();
  const fingerprint = decodeURIComponent(rawFingerprint);
  const isRowKey = fingerprint.startsWith('row:');

  const data: Array<{ user_id: string | null; user_email: string | null }> = [];
  for (let from = 0; from < IDENTITY_ROW_LIMIT; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, IDENTITY_ROW_LIMIT) - 1;
    let pageQuery = admin
      .from('admin_events')
      .select('user_id, user_email')
      .neq('event_type', 'rca_analysis')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    pageQuery = isRowKey
      ? pageQuery.eq('id', fingerprint.slice('row:'.length))
      : pageQuery.eq('fingerprint', fingerprint);

    const { data: page, error } = await pageQuery;
    if (error) {
      console.warn('[fetchAffectedPeopleForFingerprint] identity read failed', error.message);
      // `known: false` — "we could not read who", never "nobody".
      return { people: [], total: 0, known: false };
    }
    const rows = page ?? [];
    data.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  // Same `user_id ?? user_email` dedupe key `mergeTriage` uses, so this total
  // and the board's `affectedUsers` count the same population.
  const byKey = new Map<string, AffectedPerson>();
  for (const row of data) {
    const key = row.user_id ?? row.user_email;
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || (existing.userId === null && row.user_id)) {
      byKey.set(key, { userId: row.user_id, email: row.user_email });
    }
  }

  const people = await resolveAffectedPeople([...byKey.values()]);
  return { people, total: byKey.size, known: true };
}
