import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import config from '../../vitest.config.ts';

/**
 * Guards the correction made 2026-08-29, when a green PR went red on a check
 * named "no imports of GlassCard / GlassStatCard / PremiumGlassCard remain in
 * src". No such import existed. The guard had timed out at 5000ms while
 * sweeping 4,066 files, and vitest reports a timeout the same way it reports a
 * failed assertion — so the red check asserted something untrue.
 *
 * These tests cannot prove the sweeps are fast enough; that depends on the
 * runner. They pin the two things that made the failure possible: a project
 * full of filesystem sweeps inheriting a unit test's default bound, and a
 * hand-maintained count that had already rotted twice.
 *
 * This file lives under scripts/ and NOT under src/ deliberately. It imports
 * the root vitest config, which imports @vitejs/plugin-react; from inside src/
 * that drags the build-plugin graph into `check:cycles`, whose madge run is
 * rooted at src/ and fails closed on anything it cannot resolve. Product code
 * is what that ratchet exists to police — a config guard does not belong in it.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

function projects() {
  const raw = config?.test?.projects;
  expect(Array.isArray(raw), 'vitest.config.ts must declare test.projects').toBe(true);
  return raw.map((p) => p.test ?? {}).filter((t) => typeof t.name === 'string');
}

function project(name) {
  const found = projects().find((p) => p.name === name);
  expect(found, `expected a vitest project named '${name}'`).toBeDefined();
  return found;
}

describe('vitest project timeouts', () => {
  it("the 'unit' project declares an explicit testTimeout", () => {
    // Not "is 30_000" — the point is that it is DECLARED. Inheriting vitest's
    // 5000ms default is what let a filesystem sweep be bounded by machine load
    // rather than by the property it asserts.
    expect(
      project('unit').testTimeout,
      "the 'unit' project must set testTimeout explicitly: it runs repo-sweep " +
        'guards from scripts/__tests__ that read thousands of files, and the ' +
        '5000ms default times them out on loaded CI runners, which vitest then ' +
        'reports as a failed assertion about the property being guarded',
    ).toBeTypeOf('number');
  });

  it('the project holding the repo sweeps is the MOST generous of all', () => {
    // REWRITTEN 2026-08-29. This used to assert that `unit` was bounded no more
    // tightly than its siblings, because `unit` was where the repo-wide sweeps
    // lived. They have moved to a dedicated `guards` project, so that premise is
    // gone — and the test failing on that move is the premise announcing itself
    // rather than a regression.
    //
    // The invariant that actually matters now: whichever project runs the
    // filesystem sweeps must have the loosest bound, because it is the only one
    // that is I/O-bound by design.
    const guards = project('guards');
    const others = projects()
      .filter((p) => p.name !== 'guards' && typeof p.testTimeout === 'number')
      .map((p) => p.testTimeout);
    expect(typeof guards.testTimeout, 'the guards project must declare a timeout').toBe('number');
    expect(guards.testTimeout).toBeGreaterThanOrEqual(Math.max(...others));
  });

  it('the sweeps live in `guards`, not in `unit`', () => {
    // A sweep back inside `unit` would inherit a bound calibrated for unit
    // tests, which is how a timeout came to be reported as a GlassCard
    // violation in the first place.
    const unitInclude = project('unit').include ?? [];
    const guardsInclude = project('guards').include ?? [];
    expect(guardsInclude.length, 'guards project should list the sweeps').toBeGreaterThan(5);
    const strays = unitInclude.filter((g) =>
      guardsInclude.includes(g),
    );
    expect(strays, 'these sweeps are listed in BOTH projects').toEqual([]);
  });

  it('every project that runs a scripts/__tests__ sweep declares a timeout', () => {
    const undeclared = projects()
      .filter((p) => (Array.isArray(p.include) ? p.include : []).some((g) => g.startsWith('scripts/__tests__/')))
      .filter((p) => typeof p.testTimeout !== 'number')
      .map((p) => p.name);

    expect(undeclared, "these projects run repo sweeps on vitest's 5000ms default").toEqual([]);
  });
});

describe('vitest.config.ts carries no rotted count', () => {
  const source = readFileSync(join(REPO_ROOT, 'vitest.config.ts'), 'utf8');

  it('does not restate the counts that were wrong on 2026-08-29', () => {
    // The removed comment read "of 51 files under scripts/__tests__/, 32 now
    // run under vitest and 19 still run nowhere", and instructed the reader to
    // update it by hand. One file was dropped and the number never moved.
    expect(source).not.toMatch(/32 now run under vitest/);
    expect(source).not.toMatch(/51 files under/);
  });

  it('any count it does state about scripts/__tests__ is true', () => {
    // This does not forbid a number — it forbids a WRONG one. If someone
    // writes a count back in, it has to survive being checked.
    const promoted = (source.match(/^\s*'scripts\/__tests__\/[^']+',/gm) ?? []).length;
    const onDisk = readdirSync(join(REPO_ROOT, 'scripts', '__tests__')).filter((f) =>
      /\.(test|spec)\.(mjs|ts)$/.test(f),
    ).length;

    expect(promoted, 'sanity: the config should list some sweep guards').toBeGreaterThan(0);
    expect(onDisk).toBeGreaterThanOrEqual(promoted);

    const claims = [...source.matchAll(/(\d+)\s+(?:now run under vitest|are promoted|promoted below)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n !== promoted);

    expect(
      claims,
      `vitest.config.ts states a promoted-guard count that is not ${promoted}. ` +
        'Counts here are hand-maintained and have rotted twice; state the ' +
        'command instead of the number.',
    ).toEqual([]);
  });
});
