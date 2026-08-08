// =============================================================================
// An UPDATE policy that can change a row's OWNING KEY must constrain that key
// in WITH CHECK, not just in USING.
//
// `golf_rounds_update_team` constrained only `player_id`. USING decides which
// rows a coach may touch; WITH CHECK decides what the row may BECOME — and it
// said nothing about `team_id`. So an UPDATE that moved a round to another team
// was permitted as long as the player stayed one of the coach's own. Nothing in
// the policy tied `team_id` to the coach at all, so the destination could be any
// team in the database, including another organization's.
//
// `golf_rounds.team_id` is what the coach SELECT policy keys on
// (`team_id IS NOT NULL AND is_golf_team_coach(team_id)`) and what every roster
// stat, team average and leaderboard aggregates by. A round moved to the
// sibling team silently joins the wrong squad's scoring average and leaves the
// right one — for a player who is not on that team. At Shenandoah, one org with
// a men's and a women's team and one head coach staffed on both, that is a
// two-click mistake with no error.
//
// The sibling policy `golf_rounds_update` already applies exactly this
// constraint to PLAYERS (`team_id IS NULL OR is_golf_team_player(team_id)`).
// The coach path simply never got it — which is what makes this a gap rather
// than a design choice.
//
// This test reads the MIGRATION rather than the live database: it has to fail
// in CI, where there is no production connection, and the migration is the
// artifact under review.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');

/** The LAST migration that defines the policy — the one that actually applies. */
function latestPolicyDefinition(policy: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let latest: string | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const idx = sql.indexOf(`CREATE POLICY "${policy}"`);
    if (idx === -1) continue;
    // Policy body runs to the statement terminator.
    const end = sql.indexOf(';', idx);
    latest = sql.slice(idx, end === -1 ? undefined : end);
  }

  expect(latest, `no CREATE POLICY "${policy}" found in any migration`).not.toBeNull();
  return latest!;
}

describe('golf_rounds_update_team — a round cannot be moved onto another squad', () => {
  it('constrains the resulting team_id in WITH CHECK, not only player_id', () => {
    const policy = latestPolicyDefinition('golf_rounds_update_team');
    const withCheck = policy.slice(policy.indexOf('WITH CHECK'));

    expect(withCheck).toContain('is_golf_team_coach(team_id)');
  });

  it('still allows a NULL team, which is a legitimate state', () => {
    // A player with no active membership genuinely produces a round with no
    // team — six such rows exist in production, all correct. `golf_rounds_update`
    // permits NULL for the same reason; forbidding it here would block a real
    // write to close a hole that is about the non-null case.
    const policy = latestPolicyDefinition('golf_rounds_update_team');
    const withCheck = policy.slice(policy.indexOf('WITH CHECK'));

    expect(withCheck).toMatch(/team_id IS NULL/);
  });

  it('keeps the player_id constraint that was already there', () => {
    // The fix ADDS a predicate. Losing the original one would trade a
    // cross-team hole for a cross-player one.
    const policy = latestPolicyDefinition('golf_rounds_update_team');
    const withCheck = policy.slice(policy.indexOf('WITH CHECK'));

    expect(withCheck).toContain('golf_team_coach_staff');
    expect(withCheck).toMatch(/player_id IN/);
  });

  it('matches the constraint the player-side policy has always had', () => {
    // `golf_rounds_update` pins the player's own writes the same way. The two
    // paths drifting apart is what left this open, so pin the pairing.
    const playerPolicy = latestPolicyDefinition('golf_rounds_update');
    expect(playerPolicy).toContain('is_golf_team_player(team_id)');
  });
});
