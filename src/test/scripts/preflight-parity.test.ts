// Parity between the required CI workflows and `npm run preflight`.
//
// scripts/preflight.mjs reads .github/workflows/{ci,review-gate,
// migration-lockdown}.yml at runtime, so most workflow edits need nothing
// here. This test fails when a workflow gains a step preflight cannot
// reproduce or explain — an unresolvable `${{ }}` expression, an unknown
// action — so the PR that changes CI also teaches preflight
// (scripts/lib/workflow-steps.mjs) in the same diff, instead of the local
// command silently drifting from what CI checks.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STEP_RULES,
  WORKFLOW_FILES,
  advisoryJobs,
  classifyWorkflows,
  evalIf,
  loadWorkflow,
  substitute,
} from '../../../scripts/lib/workflow-steps.mjs';

const ROOT = process.cwd();
const entries = classifyWorkflows(ROOT);
const PREFLIGHT_SRC = readFileSync(resolve(ROOT, 'scripts/preflight.mjs'), 'utf8');

/** Jobs that feed a required check: every job of a workflow without an aggregate, or the aggregate's needs. */
function requiredJobEntries() {
  const byFile = new Map(WORKFLOW_FILES.map((f) => [f, advisoryJobs(loadWorkflow(ROOT, f))]));
  return entries.filter((e) => !byFile.get(e.workflow)?.has(e.jobId) && e.jobId !== 'all');
}

describe('preflight ↔ CI parity', () => {
  it('reads every required-check workflow', () => {
    for (const f of WORKFLOW_FILES) expect(entries.some((e) => e.workflow === f), f).toBe(true);
  });

  it('maps every step of every required job (no step preflight cannot run or explain)', () => {
    const unmapped = requiredJobEntries()
      .filter((e) => e.kind === 'unmapped')
      .map((e) => `${e.key}: ${e.reason}`);
    expect(unmapped, 'teach scripts/lib/workflow-steps.mjs about these CI steps').toEqual([]);
  });

  it('gives every step it does not run a reason', () => {
    const silent = entries.filter((e) => e.kind !== 'check' && e.kind !== 'unmapped' && !e.reason).map((e) => e.key);
    expect(silent).toEqual([]);
  });

  it('runs the checks that make up the required static, lint, typecheck and review-gate jobs', () => {
    const checks = requiredJobEntries().filter((e) => e.kind === 'check');
    expect(checks.some((e) => e.handler === 'typecheck'), 'typecheck').toBe(true);
    expect(checks.some((e) => e.rule === 'eslint-scan'), 'shared ESLint scan').toBe(true);
    expect(checks.some((e) => e.handler === 'unit-tests'), 'unit tests').toBe(true);
    expect(checks.some((e) => e.handler === 'build'), 'next build').toBe(true);
    expect(checks.filter((e) => e.workflow.endsWith('review-gate.yml')).length, 'review gate steps').toBeGreaterThan(5);
    expect(checks.some((e) => e.jobId === 'block-historical-edits'), 'block-historical-edits').toBe(true);
    // Every step of ci.yml's always-on jobs is a check or plumbing — never CI-only.
    const alwaysOn = requiredJobEntries().filter((e) => e.workflow.endsWith('ci.yml') && ['static-checks', 'lint', 'typecheck'].includes(e.jobId));
    expect(alwaysOn.filter((e) => !['check', 'plumbing'].includes(e.kind)).map((e) => e.key)).toEqual([]);
  });

  it('implements a local handler for every handler a rule can assign', () => {
    const handlers = new Set(STEP_RULES.filter((r) => r.kind === 'check').map((r) => r.handler));
    for (const h of handlers) expect(PREFLIGHT_SRC.includes(`case '${h}':`), `scripts/preflight.mjs handles '${h}'`).toBe(true);
  });

  it('uses unique step keys', () => {
    const keys = entries.map((e) => e.key);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });
});

describe('workflow expression model', () => {
  it('evaluates job/step conditions as a ready pull request', () => {
    expect(evalIf("github.event_name != 'pull_request' || github.event.pull_request.draft != true")).toBe(true);
    expect(evalIf("${{ github.event_name == 'push' && needs.detect-changes.outputs.code == 'true' }}")).toBe(false);
    expect(evalIf("needs.detect-changes.outputs.code == 'true'")).toBe(true);
    expect(evalIf('always() && !cancelled()')).toBe(true);
    expect(evalIf('matrix.shard == 1', { matrix: { shard: 1 } })).toBe(true);
    expect(evalIf("contains(needs.*.result, 'failure')")).toBe(false);
    expect(evalIf('hashFiles(\'x\') != \'\'')).toBeNull();
  });

  it('substitutes the expressions a local run can answer, and reports the rest', () => {
    const ctx = { BASE_SHA: 'b', HEAD_SHA: 'h', secret: (n: string) => (n === 'SET' ? 'v' : '') };
    expect(substitute("x ${{ github.event.pull_request.base.sha }} ${{ github.sha }}", ctx).text).toBe('x b h');
    expect(substitute("${{ secrets.UNSET || 'fallback' }}", ctx).text).toBe('fallback');
    expect(substitute('${{ secrets.SET }}', ctx).text).toBe('v');
    expect(substitute('${{ toJSON(steps) }}', ctx).unresolved).toEqual(['toJSON(steps)']);
  });
});
