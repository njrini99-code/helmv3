import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A ratchet must count the same thing in every checkout of the same commit.
 *
 * On 2026-08-27 `markdown-lint-ratchet.mjs` did not. It resolved its scope with
 * a `readdirSync` walk of `docs/`, which is not gitignore-aware — and
 * `.gitignore:11` ignores the whole of `docs/redesign/`, which holds 21 `.md`
 * files. So the canonical checkout linted 1,479 files while CI linted 1,458.
 * The same script, on the same commit, failed locally and passed in CI. Two
 * sessions spent an evening disagreeing about a "+389 regression" that only one
 * checkout could see, and nearly wrote a fix for a defect that did not exist.
 *
 * Both scripts now intersect their walk with `git ls-files`. This test is a
 * cheap guard on that property.
 *
 * WHAT THIS TEST DOES NOT DO: it does not prove the scope is correct at
 * runtime — it is a source-level assertion that the tracked-file intersection
 * is still present. The runtime proof was done empirically when the fix landed
 * (create a gitignored `.md` under `docs/`, confirm byte-identical output) and
 * is recorded in the commit. This exists so a later refactor cannot quietly
 * drop the intersection and reintroduce a coin-flip ratchet.
 */

// Named rather than indexed: `noUncheckedIndexedAccess` widens SCRIPTS[0] to
// include undefined, and the repo convention is to avoid the assertion
// entirely where a name will do (docs/REPO_MAP.md, guard-then-assert).
const MARKDOWN_RATCHET = 'scripts/markdown-lint-ratchet.mjs';
const PATH_DRIFT = 'scripts/check-doc-path-drift.mjs';
const SCRIPTS = [MARKDOWN_RATCHET, PATH_DRIFT];

describe('doc ratchets are scoped to tracked files', () => {
  it.each(SCRIPTS)('%s intersects its file walk with git ls-files', (rel) => {
    const src = readFileSync(resolve(process.cwd(), rel), 'utf8');

    // The call itself.
    expect(src).toMatch(/ls-files/);

    // And it must actually gate the walk's output, not merely be imported.
    // Both scripts build a Set of tracked paths and test membership.
    expect(src).toMatch(/\.has\(/);
  });

  // Each script has a different shape, so guard each one's actual regression
  // rather than writing one clever regex that fits neither.
  it('markdown-lint-ratchet does not lint the bare docs/ walk', () => {
    const src = readFileSync(resolve(process.cwd(), MARKDOWN_RATCHET), 'utf8');
    // The exact line that shipped the defect.
    expect(src).not.toMatch(/const files = markdownFilesUnder\('docs'\);\s*\n/);
    expect(src).toMatch(/markdownFilesUnder\('docs'\)\.filter/);
  });

  it('check-doc-path-drift filters inside its walk, not after', () => {
    const src = readFileSync(resolve(process.cwd(), PATH_DRIFT), 'utf8');
    // The membership test must sit on the push, so a nested directory of
    // untracked notes is skipped as it is walked.
    expect(src).toMatch(/endsWith\('\.md'\) && TRACKED_MD\.has\(p\)/);
  });
});
