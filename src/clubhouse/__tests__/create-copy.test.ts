import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, walk } from './_scan';

/**
 * CONS-38: one pattern for making things. "New {noun}" opens something authored (New round, New qualifier, New
 * prospect); "Add {noun}" attaches. A form's own commit keeps its verb: the qualifier form's "Create qualifier" and
 * round setup's "Start round" (in-flow, for the owner). A toast says "{Noun} saved" with the title as its detail, never "Saved “…”".
 */
const ALLOW_CREATE: Record<string, number> = {
  'screens/qualifiers/QualifierForm.tsx': 1,
  'screens/rounds/setup/RoundSetup.tsx': 1,
};

describe('create and toast copy (CONS-38)', () => {
  it('entry points say New, not Create or Start a', () => {
    const r = ratchet(hits(/['"`>](Create (a )?qualifier|Start (a |a new |your first )?round|Add prospect)['"`<]/, walk(ROOT, /\.tsx?$/)), ALLOW_CREATE);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });

  it('toasts lead with the noun', () => {
    expect(hits(/toast[^(]*\(\s*[`'"](Saved|Posted|Removed|Restored|Started)\b/, walk(ROOT, /\.tsx?$/))).toEqual([]);
  });
});
