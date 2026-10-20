import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs module, scripts/ is outside tsconfig.
import { QUEUED_EXIT_CODE, classifyChanged, overallExit } from '../check-changed.mjs';

describe('classifyChanged', () => {
  it('routes a source file to lint, types and related tests', () => {
    const plan = classifyChanged(['src/lib/foo.ts']);
    expect(plan.lintSrc).toEqual(['src/lib/foo.ts']);
    expect(plan.types).toBe(true);
    expect(plan.sources).toEqual(['src/lib/foo.ts']);
    expect(plan.tests).toEqual([]);
  });

  it('runs a changed test file directly and does not treat it as a source', () => {
    const plan = classifyChanged(['src/lib/foo.test.ts']);
    expect(plan.tests).toEqual(['src/lib/foo.test.ts']);
    expect(plan.sources).toEqual([]);
  });

  it('keeps scripts and hooks out of the src zero-warning lint and out of the type check', () => {
    const plan = classifyChanged(['scripts/check-changed.mjs', '.claude/hooks/route-prompt.mjs', 'scripts/foo.ts']);
    expect(plan.lintSrc).toEqual([]);
    expect(plan.lintOther).toEqual(['scripts/check-changed.mjs', '.claude/hooks/route-prompt.mjs', 'scripts/foo.ts']);
    expect(plan.types).toBe(false);
  });

  it('skips deleted files and the untracked scratch scripts eslint ignores', () => {
    const plan = classifyChanged(['src/gone.ts', 'scripts/wf_x.js', 'src/kept.ts'], (f: string) => f !== 'src/gone.ts');
    expect(plan.lint).toEqual(['src/kept.ts']);
  });

  it('type-checks when a manifest or tsconfig changes, even with no .ts file', () => {
    expect(classifyChanged(['package.json']).types).toBe(true);
    expect(classifyChanged(['tsconfig.json']).types).toBe(true);
    expect(classifyChanged(['docs/readme.md']).types).toBe(false);
  });

  it('does not send Playwright specs to vitest or docs to lint', () => {
    const plan = classifyChanged(['e2e/auth.spec.ts', 'docs/x.md']);
    expect(plan.tests).toEqual([]);
    expect(plan.lint).toEqual(['e2e/auth.spec.ts']);
  });

  it('deduplicates repeated paths', () => {
    expect(classifyChanged(['src/a.ts', 'src/a.ts']).lint).toEqual(['src/a.ts']);
  });
});

describe('overallExit', () => {
  it('is 0 when every step passed or none ran', () => {
    expect(overallExit([])).toBe(0);
    expect(overallExit([{ name: 'a', code: 0 }])).toBe(0);
  });

  it('is 1 when any step failed', () => {
    expect(overallExit([{ name: 'a', code: 0 }, { name: 'b', code: 2 }])).toBe(1);
  });

  it('is 75 only when every failure was a queued gate', () => {
    expect(overallExit([{ name: 'a', code: QUEUED_EXIT_CODE }])).toBe(75);
    expect(overallExit([{ name: 'a', code: QUEUED_EXIT_CODE }, { name: 'b', code: 1 }])).toBe(1);
  });
});
