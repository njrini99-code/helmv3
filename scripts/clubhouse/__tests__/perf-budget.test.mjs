import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareBudgets } from '../perf-budget.mjs';
const budget = JSON.parse(readFileSync(new URL('../../../config/clubhouse/quality-budgets.json', import.meta.url), 'utf8'));
const key = 'coach 390 | cold | home';
const capture = (values = [90, 100, 110]) => ({ at: '2026-10-06T10:00:00Z', throttle: '4x CPU (CDP)', rows: [{ key, content: 100 }], runs: values.map((content, run) => ({ role: 'coach', viewport: 390, kind: 'cold', scenario: 'home', run, content, lcp: content, cls: 0, clsRaw: 0, long: { tbt: 0 } })) });
test('real-format captures compare measured medians and spread', () => {
  assert.equal(compareBudgets(capture(), capture(), budget).ok, true);
  const warning = compareBudgets(capture(), capture([115, 125, 135]), budget);
  assert(warning.findings.some((finding) => finding.metric === 'content' && finding.status === 'warn'));
  assert.equal(warning.ok, true);
  const failed = compareBudgets(capture(), capture([145, 155, 165]), budget);
  assert(failed.findings.some((finding) => finding.metric === 'content' && finding.status === 'fail'));
  assert.equal(failed.ok, false);
});
test('missing cases, samples, raw metrics and recorded problems fail', () => {
  const missing = capture(); missing.rows = [];
  assert.equal(compareBudgets(capture(), missing, budget).ok, false);
  assert.equal(compareBudgets(capture(), capture([100]), budget).ok, false);
  const noMetric = capture(); noMetric.runs[0].lcp = null;
  assert.equal(compareBudgets(capture(), noMetric, budget).ok, false);
  const problems = capture(); problems.runs.push({ kind: 'problems', role: 'coach', viewport: 390, problems: ['pageerror'] });
  assert.equal(compareBudgets(capture(), problems, budget).ok, false);
});
test('absolute shift budgets inspect every run instead of a flattering median', () => {
  const after = capture(); after.runs[2].clsRaw = .01;
  assert.equal(compareBudgets(capture(), after, budget).ok, false);
});
test('unobserved tap INP is unknown; required INP fails rather than assuming zero', () => {
  const tap = () => { const out = capture(); out.rows[0].key = key.replace('cold', 'nav'); out.runs.forEach((run) => { run.kind = 'nav'; run.inp = null; }); return out; };
  const report = compareBudgets(tap(), tap(), budget);
  assert(report.findings.some((finding) => finding.metric === 'inp' && finding.status === 'unknown'));
  const required = structuredClone(budget); required.metrics.inp.required = true;
  assert.equal(compareBudgets(tap(), tap(), required).ok, false);
  const after = tap(); after.runs.forEach((run) => { run.inp = 201; });
  const before = tap(); before.runs.forEach((run) => { run.inp = 100; });
  assert.equal(compareBudgets(before, after, budget).ok, false);
  assert.equal(compareBudgets(tap(), after, budget).ok, false);
});
test('config cannot silently accept missing baseline or incompatible capture', () => {
  assert.throws(() => compareBudgets({}, capture(), budget), /rows and runs/);
  assert.throws(() => compareBudgets(capture(), capture(), { ...budget, minimumRuns: 0 }), /Invalid/);
  const after = capture(); after.throttle = '1x CPU';
  assert.equal(compareBudgets(capture(), after, budget).ok, false);
  assert.equal(compareBudgets(capture(), capture(), { ...budget, requiredCases: ['player 390 | cold | messages'] }).ok, false);
  const duplicate = capture(); duplicate.runs[1].run = 0;
  assert.equal(compareBudgets(capture(), duplicate, budget).ok, false);
  const typo = structuredClone(budget); typo.metrics.typo = { required: false };
  assert.throws(() => compareBudgets(capture(), capture(), typo), /Invalid policy/);
  const invalidThreshold = structuredClone(budget); invalidThreshold.metrics.lcp.regression.warningSpreadMultiples = -1;
  assert.throws(() => compareBudgets(capture(), capture(), invalidThreshold), /Invalid regression/);
});
