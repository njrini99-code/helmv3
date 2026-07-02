// =============================================================================
// src/lib/baseball/__tests__/public-team-profile-staff-query.test.ts
//
// REGRESSION GUARD (PR #656 follow-up, extended for the public-profile
// anon-gate fix): the public team/program profile pages
// (`src/app/baseball/(public)/team/[id]/page.tsx` and
// `src/app/baseball/(public)/program/[id]/page.tsx`) fetch coaching staff
// via `baseball_team_coach_staff` -> `baseball_coaches`. `baseball_coaches`
// has a single `full_name` column — it has never had `first_name`/`last_name`
// (see database.ts `baseball_coaches.Row` and the CREATE TABLE in
// supabase/migrations/20260527000000_prod_public_baseline.sql). Selecting
// `first_name`/`last_name` there 400s at runtime (PostgREST rejects unknown
// columns) and silently empties the Coaching Staff section, but slips past
// `tsc`/`eslint` because the query is a raw template-string `.select()` with
// an `as unknown as {...}` cast that bypasses Supabase's typed-select
// checking. This is a static, no-DB-connection guard against that class of
// column-name regression reappearing in either file.
//
// UPDATE: program/[id]/page.tsx previously had the identical bug (it's where
// this pattern was originally copied from) and was intentionally out of
// scope for PR #656. It was fixed alongside the anon-gating restructure that
// touched both files' staff queries — this guard now covers both.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..'); // -> repo root

const PAGE_FILES = [
  join(REPO_ROOT, 'src', 'app', 'baseball', '(public)', 'team', '[id]', 'page.tsx'),
  join(REPO_ROOT, 'src', 'app', 'baseball', '(public)', 'program', '[id]', 'page.tsx'),
];

describe.each(PAGE_FILES)('public profile page — coaching staff query columns (%s)', (pageFile) => {
  const source = readFileSync(pageFile, 'utf8');

  it('selects baseball_coaches columns that actually exist', () => {
    // Every baseball_coaches!inner(...) embed in the file must request real
    // columns (id, full_name, bio, avatar_url, ...) — never first_name/last_name,
    // which don't exist on baseball_coaches (only baseball_players has those).
    const embedMatches = [...source.matchAll(/baseball_coaches!inner\(([\s\S]*?)\)/g)];
    expect(
      embedMatches.length,
      `expected at least one baseball_coaches!inner(...) embed in ${pageFile}`
    ).toBeGreaterThan(0);

    for (const match of embedMatches) {
      const columns = match[1];
      expect(columns).toContain('full_name');
      expect(columns).not.toMatch(/\bfirst_name\b/);
      expect(columns).not.toMatch(/\blast_name\b/);
    }
  });

  it('renders the coach name from full_name, not the nonexistent first_name/last_name', () => {
    expect(source).toMatch(/c\.full_name/);
    expect(source).not.toMatch(/c\.first_name/);
    expect(source).not.toMatch(/c\.last_name/);
  });

  it('never selects baseball_coaches PII (email/phone) for the coaching staff card', () => {
    // Public coaching-staff cards on both pages are full_name + role + avatar
    // only (product decision) — email/phone should never appear on either
    // the authenticated or anon coach-staff query path in these files.
    const embedMatches = [...source.matchAll(/baseball_coaches!inner\(([\s\S]*?)\)/g)];
    for (const match of embedMatches) {
      expect(match[1]).not.toMatch(/\bemail\b/);
      expect(match[1]).not.toMatch(/\bphone\b/);
    }
  });
});
