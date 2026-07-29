// =============================================================================
// Product-module state, for E2E specs.
//
// WHY THIS FILE EXISTS. Seven specs drive recruiting routes — pipeline,
// discover, watchlist, camps, scouting, activate — and none of them knew the
// module was sunset. Those routes now redirect, so every content assertion in
// them is destined to fail.
//
// It has not surfaced yet only because the Playwright job is path-gated: the
// "Detect E2E-relevant paths" step skipped it on the sunset commits. The first
// PR that touches an E2E-relevant path inherits a wall of red that has nothing
// to do with its change, and the reflex under that kind of failure is to delete
// the specs rather than read them.
//
// So the specs are SKIPPED, not deleted, with a reason that names the cause.
// They are the only end-to-end proof that recruiting works, and the sunset's
// whole design is that it is reversible — a deleted spec is not something you
// can flip a flag to get back.
//
// The import is a relative path into src rather than the `@/` alias: Playwright
// runs specs through its own transform and does not read tsconfig `paths`. The
// module is pure (no React, no Supabase, no env reads), which is what makes it
// safe to import from a Node-side test file at all.
// =============================================================================

import { isRecruitingEnabled } from '../../src/lib/baseball/product-modules';

/** True when the recruiting module ships in the build under test. */
export const RECRUITING_ENABLED = isRecruitingEnabled();

/** Reason string for `test.skip(...)`, phrased so a red-CI reader stops guessing. */
export const RECRUITING_SUNSET_REASON =
  'recruiting module is sunset (src/lib/baseball/product-modules.ts) — these routes ' +
  'redirect, so this spec is skipped rather than deleted; re-enabling the module ' +
  'restores it';
