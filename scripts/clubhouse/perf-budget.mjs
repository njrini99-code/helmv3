/** Compare genuine perf-measure / perf-pages JSON; no browser, credentials, or invented baseline. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const keyOf = (run) => `${run.role} ${run.viewport} | ${run.kind} | ${run.scenario}`;
function index(result) {
  if (!Array.isArray(result?.rows) || !Array.isArray(result?.runs)) throw new Error('Expected recorded JSON with rows and runs arrays.');
  const rows = new Map();
  for (const row of result.rows) {
    if (typeof row.key !== 'string' || rows.has(row.key)) throw new Error('Missing or duplicate result key.');
    rows.set(row.key, row);
  }
  return rows;
}
const runValue = (run, metric) => metric === 'tbt' ? run.long?.tbt : metric === 'flash' ?
  (Array.isArray(run.timeline) ? run.timeline.some(([time, state]) => time >= 0 && (state === 'skeleton' || state === 'none')) : undefined) : run[metric];
export function compareBudgets(before, after, budget) {
  if (budget?.version !== 1 || !Number.isInteger(budget.minimumRuns) || budget.minimumRuns < 1 || !budget.metrics || !Array.isArray(budget.requiredCases)) throw new Error('Invalid quality budget configuration.');
  const supported = new Set(['content', 'lcp', 'tbt', 'cls', 'clsRaw', 'inp', 'flash']);
  if (!Object.keys(budget.metrics).length || budget.requiredCases.some((key) => typeof key !== 'string' || !/^(coach|player) \d+ \| (cold|warm|nav|switch) \| .+$/.test(key))) throw new Error('Invalid metric or required case configuration.');
  for (const [metric, policy] of Object.entries(budget.metrics)) {
    if (!supported.has(metric) || !policy || typeof policy.required !== 'boolean' || (policy.kinds && (!Array.isArray(policy.kinds) || !policy.kinds.length || policy.kinds.some((kind) => !['cold', 'warm', 'nav', 'switch'].includes(kind))))) throw new Error(`Invalid policy for ${metric}.`);
    if (policy.max !== undefined && (metric === 'flash' ? typeof policy.max !== 'boolean' : !finite(policy.max))) throw new Error(`Invalid absolute budget for ${metric}.`);
    if (policy.regression) {
      const { warningSpreadMultiples, failureSpreadMultiples } = policy.regression;
      if (metric === 'flash' || !finite(warningSpreadMultiples) || !finite(failureSpreadMultiples) || failureSpreadMultiples < warningSpreadMultiples) throw new Error(`Invalid regression multipliers for ${metric}.`);
    }
  }
  const previous = index(before), current = index(after), findings = [];
  const add = (status, key, metric, reason, values = {}) => findings.push({ status, key, metric, reason, ...values });
  if (!before.throttle || before.throttle !== after.throttle) add('fail', '(run)', 'throttle', 'CPU throttle missing or differs; captures are not comparable.');
  if (!before.at || !after.at || !Number.isFinite(Date.parse(before.at)) || !Number.isFinite(Date.parse(after.at))) add('fail', '(run)', 'provenance', 'Both captures need valid recorded timestamps.');
  for (const capture of [before, after]) for (const run of capture.runs)
    if (run.kind === 'problems') add('fail', `${capture === before ? 'before' : 'after'} ${run.role} ${run.viewport}`, 'capture', `Harness recorded problems: ${(run.problems ?? []).join('; ')}`);
  const required = new Set([...previous.keys(), ...budget.requiredCases]);
  if (!required.size) add('fail', '(run)', 'coverage', 'No measured baseline cases.');
  for (const key of required) {
    if (!previous.has(key) || !current.has(key)) { add('fail', key, 'coverage', `Required case missing ${!previous.has(key) ? 'before' : 'after'}.`); continue; }
    const kind = key.split(' | ')[1];
    if (!['cold', 'warm', 'nav', 'switch'].includes(kind)) { add('fail', key, 'capture', 'Unknown scenario kind.'); continue; }
    const oldRuns = before.runs.filter((run) => keyOf(run) === key), newRuns = after.runs.filter((run) => keyOf(run) === key);
    if (oldRuns.length < budget.minimumRuns || newRuns.length < budget.minimumRuns) add('fail', key, 'samples', `Need ${budget.minimumRuns} recorded runs before and after, got ${oldRuns.length}/${newRuns.length}.`);
    if ([oldRuns, newRuns].some((runs) => runs.some((run) => !Number.isInteger(run.run) || run.run < 0) || new Set(runs.map((run) => run.run)).size !== runs.length)) add('fail', key, 'samples', 'Recorded run indices must be unique non-negative integers per case.');
    for (const [metric, policy] of Object.entries(budget.metrics)) {
      if (policy.kinds && !policy.kinds.includes(kind)) continue;
      const oldValues = oldRuns.map((run) => runValue(run, metric)), newValues = newRuns.map((run) => runValue(run, metric));
      const valid = (value) => metric === 'flash' ? typeof value === 'boolean' : finite(value);
      if (policy.max !== undefined && newValues.some((value) => valid(value) && (metric === 'flash' ? value !== policy.max : value > policy.max))) add('fail', key, metric, `An observed after run exceeds the absolute budget ${policy.max}.`);
      if (!oldValues.length || !newValues.length || !oldValues.every(valid) || !newValues.every(valid)) {
        add(policy.required ? 'fail' : 'unknown', key, metric, 'Missing/non-finite raw-run metric; null is not a measured zero.'); continue;
      }
      const oldValue = metric === 'flash' ? oldValues.some(Boolean) : metric.startsWith('cls') ? Math.max(...oldValues) : median(oldValues);
      const newValue = metric === 'flash' ? newValues.some(Boolean) : metric.startsWith('cls') ? Math.max(...newValues) : median(newValues);
      if (policy.regression) {
        const { warningSpreadMultiples, failureSpreadMultiples } = policy.regression;
        const spread = Math.max(...oldValues) - Math.min(...oldValues), delta = newValue - oldValue;
        if (delta > failureSpreadMultiples * spread) add('fail', key, metric, 'Median worsening exceeds the measured baseline spread at the failure multiplier.', { before: oldValue, after: newValue, delta, baselineSpread: spread });
        else if (delta > warningSpreadMultiples * spread) add('warn', key, metric, 'Median worsening exceeds the measured baseline spread at the warning multiplier.', { before: oldValue, after: newValue, delta, baselineSpread: spread });
      }
    }
  }
  for (const key of current.keys()) if (!previous.has(key)) add('unknown', key, 'baseline', 'New case has no measured before baseline.');
  return { ok: !findings.some((finding) => finding.status === 'fail'), comparedCases: required.size, findings, coverageNote: budget.coverageNote ?? 'Coverage is limited to the supplied cases.' };
}
export function main(argv = process.argv.slice(2)) {
  const [beforeFile, afterFile, budgetFile = resolve(ROOT, 'config/clubhouse/quality-budgets.json')] = argv;
  if (!beforeFile || !afterFile) throw new Error('usage: perf-budget.mjs <before.json> <after.json> [budget.json]');
  const load = (file) => JSON.parse(readFileSync(resolve(file), 'utf8'));
  const report = compareBudgets(load(beforeFile), load(afterFile), load(budgetFile));
  console.log(JSON.stringify(report, null, 2));
  return report.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
