// =============================================================================
// The demo seed must write every table the baseball dashboard needs in order to
// RESOLVE A CONTEXT — otherwise auth succeeds and every authenticated page is
// blank.
//
// WHY THIS EXISTS — the third instance of one meta-pattern in a single night.
//
// `scripts/seed-baseball-demo.ts` never created a `baseball_team_coach_staff`
// row. `getActiveBaseballContext` (src/lib/baseball/active-context.ts) resolves a
// coach's active team from that table, so with no row `getBaseballNavContext`
// returns null, `DashboardSessionGuard` sits on `BaseballDashboardBootstrap`
// ("Opening your command center") and redirects to /baseball/coach-onboarding.
// The demo coach was a coach who belonged to no team.
//
// It was invisible for a month because production HAS the row
// (`fb71679b-…`, created 2026-06-25 13:30 — a day AFTER the coach row the seed
// writes) added by hand, out of band. The seed only ever ran against production,
// where the graph was already complete. The gap surfaced the first time it ran
// against a fresh database: login succeeded, the three anonymous specs passed,
// and all 16 authenticated coach/player renders failed with "element(s) not
// found" on the page heading.
//
// The same shape had already appeared twice that night — the `on_auth_user_created`
// trigger missing from tracked migrations (20260730020000), and the `avatars`
// storage bucket missing from them (20260730030000). In all three cases the thing
// that hid the defect was identical: **CI only ever exercised production, where
// the missing piece already existed.**
//
// WHAT THIS PINS. Not "the seed is complete" — that is not checkable. It pins the
// specific, small set of tables that context resolution reads, derived by reading
// active-context.ts and capabilities.ts. If a future refactor makes the dashboard
// depend on another table, add it here; if the seed stops writing one of these,
// this fails immediately instead of a month later in a CI run nobody can explain.
//
// Source-text, deliberately. A database test cannot catch this: it runs against a
// database somebody already seeded.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SEED = join(process.cwd(), 'scripts', 'seed-baseball-demo.ts');
const ACTIVE_CONTEXT = join(process.cwd(), 'src', 'lib', 'baseball', 'active-context.ts');
const CAPABILITIES = join(process.cwd(), 'src', 'lib', 'baseball', 'capabilities.ts');

/**
 * Tables the dashboard reads to answer "who is this user and which team are they
 * on". Every one must be written by the seed or the demo tenant cannot render a
 * single authenticated page.
 */
const CONTEXT_TABLES = [
  'baseball_coaches',
  'baseball_team_coach_staff',
  'baseball_players',
  'baseball_team_members',
  'baseball_teams',
] as const;

describe('the demo seed writes every table dashboard context resolution reads', () => {
  const seed = readFileSync(SEED, 'utf8');

  it.each(CONTEXT_TABLES)('seeds %s', (table) => {
    expect(
      new RegExp(`upsert\\(\\s*['"]${table}['"]`).test(seed),
      `scripts/seed-baseball-demo.ts never upserts ${table}. Context resolution ` +
        'reads it, so without a row the demo coach/player belongs to no team: auth ' +
        'succeeds, then every authenticated page sits on "Opening your command ' +
        'center" and renders no heading. Production may already have the row — that ' +
        'is exactly how this stays hidden until the seed runs against a fresh DB.',
    ).toBe(true);
  });

  it('still reads those tables in context resolution (list is not stale)', () => {
    // If active-context/capabilities stop reading a table, this list should shrink
    // rather than quietly pin a table nobody depends on any more.
    const resolution =
      readFileSync(ACTIVE_CONTEXT, 'utf8') + '\n' + readFileSync(CAPABILITIES, 'utf8');
    const unused = CONTEXT_TABLES.filter(
      (t) => t !== 'baseball_teams' && !resolution.includes(t),
    );
    expect(
      unused,
      'These tables are pinned here but no longer read by active-context.ts or ' +
        'capabilities.ts. Remove them from CONTEXT_TABLES.',
    ).toEqual([]);
  });

  it('conflicts baseball_team_coach_staff on its UNIQUE pair, not on id', () => {
    // The table has UNIQUE (team_id, coach_id) as well as an id primary key, and
    // production's row carries a RANDOM id because it was inserted by hand. An
    // upsert conflicting on `id` would try to INSERT a second row for the same
    // (team, coach) against production and violate the unique constraint —
    // playwright.yml would hit that on every push to main.
    const call = seed.slice(seed.indexOf("upsert('baseball_team_coach_staff'"));
    const end = call.indexOf(');');
    expect(end).toBeGreaterThan(0);
    expect(
      call.slice(0, end),
      'the baseball_team_coach_staff upsert must pass the conflict target ' +
        "'team_id,coach_id'",
    ).toContain("'team_id,coach_id'");
  });
});
