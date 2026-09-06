// scripts/pr-land.mjs — the one-command "merge, then clean up" flow (see
// AGENTS.md's "Helm agent canonicality" and PR #1863). This file covers the
// two PURE pieces the brief calls out: argument handling and the
// required-checks gate. The gh/git-driving parts of main() are exercised
// only implicitly here — a full end-to-end run against fake `gh`/`git`
// binaries would duplicate scripts/__tests__/create-workspace.test.ts's and
// src/test/scripts/worktree-lifecycle.test.ts's fixture-repo machinery for
// marginal additional coverage, since the gate and the branch-name/state
// refusals below are where the actual decisions live.

import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  evaluateRequiredChecks,
  DEFAULT_REQUIRED_CONTEXTS,
} from '../../../scripts/pr-land.mjs';

describe('pr-land parseArgs', () => {
  it('parses a bare PR number', () => {
    expect(parseArgs(['1863'])).toMatchObject({ prNumber: 1863, anyBranch: false, error: null });
  });

  it('parses --any-branch alongside the PR number, in either order', () => {
    expect(parseArgs(['1863', '--any-branch'])).toMatchObject({ prNumber: 1863, anyBranch: true });
    expect(parseArgs(['--any-branch', '1863'])).toMatchObject({ prNumber: 1863, anyBranch: true });
  });

  it('reports --help without an error', () => {
    expect(parseArgs(['--help'])).toMatchObject({ help: true, error: null });
    expect(parseArgs(['-h'])).toMatchObject({ help: true, error: null });
  });

  it('errors on a missing PR number', () => {
    expect(parseArgs([]).error).toMatch(/usage/);
  });

  it('errors on a non-numeric PR number', () => {
    expect(parseArgs(['abc']).error).toMatch(/usage/);
  });

  it('errors on more than one positional argument', () => {
    expect(parseArgs(['1863', '1864']).error).toMatch(/usage/);
  });

  it('errors on an unknown flag', () => {
    expect(parseArgs(['1863', '--force']).error).toMatch(/unknown flag: --force/);
  });
});

describe('pr-land evaluateRequiredChecks', () => {
  const allGreen = DEFAULT_REQUIRED_CONTEXTS.map((name) => ({ name, state: 'SUCCESS' }));

  it('is ok when every required context reports SUCCESS', () => {
    const result = evaluateRequiredChecks(allGreen, DEFAULT_REQUIRED_CONTEXTS);
    expect(result).toEqual({ ok: true, missing: [], failing: [] });
  });

  it('reports a context missing from the rollup entirely as missing, not failing', () => {
    const rollup = allGreen.filter((c) => c.name !== 'block-historical-edits');
    const result = evaluateRequiredChecks(rollup, DEFAULT_REQUIRED_CONTEXTS);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['block-historical-edits']);
    expect(result.failing).toEqual([]);
  });

  it('reports a present-but-non-SUCCESS context as failing, with its state', () => {
    const rollup = allGreen.map((c) => (c.name === 'CI aggregate' ? { name: c.name, state: 'FAILURE' } : c));
    const result = evaluateRequiredChecks(rollup, DEFAULT_REQUIRED_CONTEXTS);
    expect(result.ok).toBe(false);
    expect(result.failing).toEqual(['CI aggregate=FAILURE']);
  });

  it('treats PENDING/IN_PROGRESS as failing, not ok', () => {
    const rollup = allGreen.map((c) => (c.name === 'Review Gate aggregate' ? { name: c.name, state: 'PENDING' } : c));
    const result = evaluateRequiredChecks(rollup, DEFAULT_REQUIRED_CONTEXTS);
    expect(result.ok).toBe(false);
    expect(result.failing).toEqual(['Review Gate aggregate=PENDING']);
  });

  it('reads gh CheckRun-shaped items via `conclusion` as well as `state`', () => {
    const rollup = DEFAULT_REQUIRED_CONTEXTS.map((name) => ({ name, conclusion: 'SUCCESS' }));
    expect(evaluateRequiredChecks(rollup, DEFAULT_REQUIRED_CONTEXTS).ok).toBe(true);
  });

  it('is ok on an empty required-contexts list regardless of rollup', () => {
    expect(evaluateRequiredChecks(allGreen, []).ok).toBe(true);
  });

  it('handles a null/empty rollup as everything missing', () => {
    const result = evaluateRequiredChecks(null, DEFAULT_REQUIRED_CONTEXTS);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(DEFAULT_REQUIRED_CONTEXTS);
  });
});
