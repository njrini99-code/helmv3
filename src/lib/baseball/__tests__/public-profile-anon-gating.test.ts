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
//
// UPDATE (W4d, docs/baseball/ui-migration-map.md): the `isPublicViewer = !user`
// derivation (plus the coach-type gate around it) that used to be duplicated
// near-verbatim in both pages was extracted into one shared helper,
// `resolveRecruitingViewerAccess` (src/lib/baseball/recruiting-viewer-access.ts).
// Presentation/behavior are unchanged — the invariant just moved. Each page is
// now checked for delegating to that one shared gate; the underlying
// `isPublicViewer: !user` derivation is guarded directly on the helper below.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Hoisted so the `notFound` mock exists before `vi.mock('next/navigation', ...)`
// runs (vitest hoists vi.mock calls above imports). We assert on the throw so
// tests below can distinguish "blocked via the gate" from any other failure.
const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

import { resolveRecruitingViewerAccess } from '../recruiting-viewer-access';

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

  it('derives its public-viewer flag through the one shared recruiting-viewer gate', () => {
    expect(source).toMatch(/resolveRecruitingViewerAccess/);
    expect(source).toMatch(/isPublicViewer/);
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

describe('resolveRecruitingViewerAccess — shared gate extracted from team/[id] + program/[id] (W4d)', () => {
  const helperFile = join(REPO_ROOT, 'src', 'lib', 'baseball', 'recruiting-viewer-access.ts');
  const source = readFileSync(helperFile, 'utf8');

  it('derives isPublicViewer from the absence of an authenticated user', () => {
    expect(source).toMatch(/isPublicViewer:\s*!user/);
  });

  it('does not unconditionally notFound() a logged-out visitor', () => {
    expect(source).not.toMatch(/if\s*\(\s*!user\s*\)\s*\{\s*\n?\s*notFound\(\)/);
  });

  it('blocks non-recruiting authenticated users via notFound()', () => {
    expect(source).toMatch(/notFound\(\)/);
    expect(source).toMatch(/\[.college.,\s*.juco.\]/);
  });
});

// The regex checks above are belt-and-braces (they'd catch a naive revert of
// the source shape). These tests actually invoke resolveRecruitingViewerAccess
// against a mocked Supabase client, mirroring the fake-client idiom used by
// ../server-route-guards.test.ts, so the gate's real runtime behavior — not
// just its source text — is what's under test.
describe('resolveRecruitingViewerAccess — direct unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Builds a fake Supabase client whose `.auth.getUser()` resolves to the
   * given user and whose `.from('baseball_coaches').select().eq().single()`
   * chain resolves to the given coach row — enough surface for the gate. */
  function fakeSupabase(
    user: { id: string } | null,
    coachRow: { coach_type: string } | null = null,
  ) {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: coachRow, error: null }),
    };
    return {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from: vi.fn().mockReturnValue(query),
    } as unknown as Parameters<typeof resolveRecruitingViewerAccess>[0];
  }

  it('no signed-in user -> public viewer, no coach lookup performed', async () => {
    const supabase = fakeSupabase(null);
    const result = await resolveRecruitingViewerAccess(supabase);
    expect(result).toEqual({ isPublicViewer: true, coach: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each(['college', 'juco'] as const)(
    'signed-in %s (recruiting) coach -> non-public viewer, coach resolved',
    async (coachType) => {
      const supabase = fakeSupabase({ id: 'user-1' }, { coach_type: coachType });
      const result = await resolveRecruitingViewerAccess(supabase);
      expect(result).toEqual({ isPublicViewer: false, coach: { coach_type: coachType } });
    },
  );

  it('signed-in non-recruiting coach (e.g. high_school) -> blocked via notFound()', async () => {
    const supabase = fakeSupabase({ id: 'user-1' }, { coach_type: 'high_school' });
    await expect(resolveRecruitingViewerAccess(supabase)).rejects.toThrow('NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it('signed-in user with no coach row -> blocked via notFound()', async () => {
    const supabase = fakeSupabase({ id: 'user-1' }, null);
    await expect(resolveRecruitingViewerAccess(supabase)).rejects.toThrow('NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});
