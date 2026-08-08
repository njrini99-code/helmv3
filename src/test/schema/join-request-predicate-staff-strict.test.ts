// =============================================================================
// A SECURITY DEFINER predicate that gates a SELECT policy must be scoped to the
// same thing the rest of that policy is scoped to.
//
// `golf_players_select` is
//   (user_id = auth.uid()) OR user_is_coach_of_golf_player(id)
//   OR user_has_pending_join_request_to_coach_team(id)
//   OR user_is_teammate_of_golf_player(id)
//
// Every other coach-side predicate there was moved to STAFF scope in
// 20260612130000, so the men's/women's wall holds inside one program. This one
// was missed and still joined coaches to teams on `organization_id` — and being
// SECURITY DEFINER it answers without RLS in the way. At Shenandoah that let any
// coach in the org read the full profile of a player requesting to join EITHER
// team, including the squad they do not staff.
//
// It also guards the anon grant. The baseline migration carries
// `GRANT ALL ON FUNCTION ... TO "anon"` while production's ACL is
// authenticated + service_role only, so a rebuild from migrations was strictly
// more permissive than production on a definer function. Anyone holding the
// publishable key is anon.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');
const FN = 'user_has_pending_join_request_to_coach_team';

/** Every migration body, oldest first — later definitions win. */
function migrations(): Array<{ file: string; sql: string }> {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }));
}

/** The last CREATE [OR REPLACE] FUNCTION body for the predicate. */
function latestDefinition(): string {
  let latest: string | null = null;
  for (const { sql } of migrations()) {
    const idx = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION\\s+"?public"?\\.\\s*"?${FN}"?`));
    if (idx === -1) continue;
    const end = sql.indexOf('$function$;', idx);
    latest = sql.slice(idx, end === -1 ? idx + 4000 : end);
  }
  expect(latest, `no definition of ${FN} found`).not.toBeNull();
  return latest!;
}

describe(`${FN} — staff-scoped, not organization-scoped`, () => {
  it('resolves the coach through golf_team_coach_staff', () => {
    expect(latestDefinition()).toContain('golf_team_coach_staff');
  });

  it('no longer joins coaches to teams on organization_id', () => {
    // The exact predicate that made both Shenandoah squads answer "yes".
    expect(latestDefinition()).not.toMatch(/gc\.organization_id\s*=\s*gt\.organization_id/);
  });

  it('still requires the request to be pending and to belong to the caller', () => {
    // Tightening the join must not accidentally widen the rest.
    const def = latestDefinition();
    expect(def).toMatch(/jr\.status\s*=\s*'pending'/);
    expect(def).toMatch(/gc\.user_id\s*=\s*auth\.uid\(\)/);
    expect(def).toMatch(/jr\.player_id\s*=\s*check_player_id/);
  });
});

describe(`${FN} — anon must not execute a SECURITY DEFINER function`, () => {
  it('is revoked from anon after the last grant that mentions it', () => {
    // The baseline GRANTs to anon; only a later REVOKE makes the migration set
    // match production. Order matters, so compare positions across files.
    let lastGrant = -1;
    let lastRevoke = -1;
    migrations().forEach(({ sql }, fileIndex) => {
      const pos = (re: RegExp) => {
        const m = sql.match(re);
        return m ? fileIndex * 1e9 + (m.index ?? 0) : -1;
      };
      const g = pos(new RegExp(`GRANT[^;]*ON FUNCTION[^;]*${FN}[^;]*TO\\s+"?anon"?`, 's'));
      const r = pos(new RegExp(`REVOKE[^;]*ON FUNCTION[^;]*${FN}[^;]*FROM[^;]*anon`, 's'));
      if (g > lastGrant) lastGrant = g;
      if (r > lastRevoke) lastRevoke = r;
    });

    expect(lastGrant, 'expected the baseline anon grant to still be present').toBeGreaterThan(-1);
    expect(lastRevoke, 'no REVOKE ... FROM anon found for this function').toBeGreaterThan(-1);
    expect(lastRevoke).toBeGreaterThan(lastGrant);
  });
});
