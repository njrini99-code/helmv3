import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseSuperAdminUserIds } from '@/lib/admin/super-admin-shared';

/**
 * ============================================================================
 * Helm Bridge has TWO super-admin gates, and they read different sources.
 * ----------------------------------------------------------------------------
 *   READ  — `requireSuperAdmin()` (require-super-admin.ts) → the
 *           `SUPER_ADMIN_USER_IDS` env var. Decides who may open the console
 *           and who may call its server actions.
 *   WRITE — `is_super_admin()` in Postgres → the `admin_allowlist` TABLE.
 *           Decides who may actually mutate: `resolve_admin_event()` raises
 *           `Forbidden` (42501) when it returns false, and RLS policies across
 *           the database call it too.
 *
 * Nothing keeps those two in sync, and when they drift the failure is close to
 * undiagnosable from the UI. On 2026-07-29 the founder's account was in the env
 * var and NOT in the table: full console access, every Resolve click a silent
 * no-op. Measured — 0 events resolved in 24 hours, against a last-ever-resolved
 * of 2026-07-28 07:31Z from the one account that IS in the table. The report
 * that surfaced it was "if the errors are resolved it still doesn't go away it
 * just stays", which points at the list, the cache, the revalidation — anywhere
 * but a privilege table.
 *
 * This module makes the divergence a thing the console SAYS rather than a thing
 * an operator infers. It is deliberately read-only and advisory: it never grants
 * or revokes anything. Reconciling the two lists is a human decision, because
 * `is_super_admin()` is also the gate on RLS policies elsewhere in the schema —
 * adding a row widens more than the Resolve button.
 * ========================================================================== */

export interface SuperAdminGateDivergence {
  /** In `SUPER_ADMIN_USER_IDS` but NOT in `admin_allowlist` — can read the
   *  console, cannot write. This is the dangerous direction: it looks like
   *  full access right up until a mutation silently fails. */
  consoleOnly: string[];
  /** In `admin_allowlist` but NOT in the env var — holds database-level admin
   *  (including via RLS policies that call `is_super_admin()`) while being
   *  unable to open the console. Less confusing, more of a security question:
   *  a stale row here is standing privilege nobody is looking at. */
  allowlistOnly: string[];
  /** False when the allowlist table could not be read; the arrays are then
   *  empty for lack of data, NOT because the gates agree. Callers must not
   *  render "in sync" on a failed read. */
  checked: boolean;
}

export const GATES_IN_SYNC: SuperAdminGateDivergence = {
  consoleOnly: [],
  allowlistOnly: [],
  checked: true,
};

/** Pure comparison, so the interesting logic is testable without a database. */
export function compareSuperAdminGates(
  envUserIds: ReadonlySet<string>,
  allowlistUserIds: readonly string[],
): SuperAdminGateDivergence {
  const inTable = new Set(allowlistUserIds);
  return {
    consoleOnly: [...envUserIds].filter((id) => !inTable.has(id)).sort(),
    allowlistOnly: [...inTable].filter((id) => !envUserIds.has(id)).sort(),
    checked: true,
  };
}

/** True when there is something an operator should act on. */
export function hasGateDivergence(d: SuperAdminGateDivergence): boolean {
  return d.checked && (d.consoleOnly.length > 0 || d.allowlistOnly.length > 0);
}

/**
 * One sentence an operator can act on, or null when there is nothing to say.
 * Names the SYMPTOM before the mechanism — the whole point is that someone
 * staring at a Resolve button that does nothing recognises their own situation.
 */
export function describeGateDivergence(d: SuperAdminGateDivergence): string | null {
  if (!hasGateDivergence(d)) return null;
  const parts: string[] = [];
  if (d.consoleOnly.length > 0) {
    parts.push(
      `${d.consoleOnly.length} account${d.consoleOnly.length === 1 ? '' : 's'} can open Bridge but ` +
        `cannot resolve anything — present in SUPER_ADMIN_USER_IDS, missing from the ` +
        `admin_allowlist table that is_super_admin() reads (${d.consoleOnly.join(', ')})`,
    );
  }
  if (d.allowlistOnly.length > 0) {
    parts.push(
      `${d.allowlistOnly.length} account${d.allowlistOnly.length === 1 ? '' : 's'} hold database-level ` +
        `admin via admin_allowlist without console access (${d.allowlistOnly.join(', ')})`,
    );
  }
  return parts.join('. ') + '.';
}

/**
 * CALLER must have passed requireSuperAdmin() — this reads with the service
 * role. Honest-only: a failed read returns `checked: false` rather than empty
 * arrays that would render as "the gates agree".
 */
export async function fetchSuperAdminGateDivergence(): Promise<SuperAdminGateDivergence> {
  const envIds = parseSuperAdminUserIds(process.env.SUPER_ADMIN_USER_IDS);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from('admin_allowlist').select('user_id');
    if (error || !data) return { consoleOnly: [], allowlistOnly: [], checked: false };
    return compareSuperAdminGates(
      envIds,
      data.map((r) => (r as { user_id: string }).user_id),
    );
  } catch {
    return { consoleOnly: [], allowlistOnly: [], checked: false };
  }
}
