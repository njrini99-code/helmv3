// =============================================================================
// src/lib/baseball/__tests__/public-profile-anon-gating.test.ts
//
// REGRESSION GUARD (public-team-profile share-link 404 fix): both
// `src/app/baseball/(public)/team/[id]/page.tsx` and
// `src/app/baseball/(public)/program/[id]/page.tsx` previously called
// notFound() unconditionally for ANY logged-out visitor (`if (!user) {
// notFound(); }`), so shared team/program links 404'd for recruits' parents,
// fans, and any non-recruiting-coach visitor. Product decision: these pages
// are now TRULY PUBLIC for logged-out visitors with a SAFE field set (team/
// org identity, coaching staff name+role+avatar, team-level facts), while
// the roster stays gated behind a "sign in" prompt for anon and the
// existing authenticated-coach permission checks otherwise.
//
// This is a static, no-DB-connection guard against the unconditional
// logged-out block reappearing, and against the roster/PII fields leaking
// into the anon-safe read paths.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..'); // -> repo root

const PAGE_FILES = [
  join(REPO_ROOT, 'src', 'app', 'baseball', '(public)', 'team', '[id]', 'page.tsx'),
  join(REPO_ROOT, 'src', 'app', 'baseball', '(public)', 'program', '[id]', 'page.tsx'),
];

describe.each(PAGE_FILES)('public profile page — anon visitors are not hard-blocked (%s)', (pageFile) => {
  const source = readFileSync(pageFile, 'utf8');

  it('does not unconditionally notFound() a logged-out visitor', () => {
    // The old bug: `if (!user) { notFound(); ... }` right after auth.getUser().
    // A correct fix branches on `!user` (or an isPublicViewer flag derived
    // from it) to serve the SAFE public view instead of hard-blocking.
    expect(source).not.toMatch(/if\s*\(\s*!user\s*\)\s*\{\s*\n?\s*notFound\(\)/);
  });

  it('derives a public-viewer flag from the auth check', () => {
    expect(source).toMatch(/isPublicViewer\s*=\s*!user/);
  });

  it('reads through the anon-safe public views, not raw base tables, for the org/team read', () => {
    expect(source).toMatch(/organizations_public_profile/);
  });

  it('reads coaching staff identity through the anon-safe staff view', () => {
    expect(source).toMatch(/baseball_team_coach_staff_public/);
  });

  it('gates the roster behind a sign-in prompt for anon, not a live roster query', () => {
    expect(source).toMatch(/Sign in to view roster/);
    expect(source).toMatch(/\/baseball\/login\?returnTo=/);
  });

  it('never selects a team join_code on a call chained off a *_public view', () => {
    // join_code is a team invite secret — it must never appear in a
    // `.select(...)` call chained directly off one of the anon-safe public
    // views. (It's still fetched, unrendered, in the authenticated-coach
    // branch's unchanged base-table query — that's fine, it's never
    // reachable by an anon viewer.)
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (!/_public(_profile)?'\)\s*$/.test(line)) continue;
      // Look ahead a few lines for the chained .select(...) call.
      const window = lines.slice(i + 1, i + 4).join('\n');
      const selectMatch = window.match(/\.select\(['"`]([^'"`]*)['"`]\)/);
      const selectedColumns = selectMatch?.[1];
      if (!selectedColumns) continue;
      expect(selectedColumns).not.toMatch(/join_code/);
    }
  });
});
