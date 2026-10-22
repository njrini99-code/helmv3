// scripts/pr-land.mjs refuses to land unless one CI run of the head commit ran all five unit shards. A follow-up push runs only the
// related tests (a separate step of each shard) and skips the full-suite step, so every required context can be green without the suite having run (#2269 / #2270).
import { describe, expect, it } from 'vitest';
import { checkUnitShards, evaluateUnitShards, newestAttempts, unitShardVerdict, workflowFile } from '../pr-land.mjs';

const SHA = 'a'.repeat(40);

/** A "Unit tests (n)" job as the Actions API returns it. */
const job = (n, { scope = 'success', test } = {}) => ({
  name: `Unit tests (${n})`,
  conclusion: 'success',
  steps: [
    { name: 'Checkout', conclusion: 'success' },
    { name: 'Decide test scope', conclusion: scope },
    ...(test === undefined ? [] : [{ name: `Unit tests (shard ${n}/5)`, conclusion: test }]),
  ],
});
const fullRun = (id) => ({ id, jobs: [1, 2, 3, 4, 5].map((n) => job(n, { test: 'success' })) });
/** The follow-up-push shape: every shard runs its related tests in a differently named step and skips the full-suite step. */
const scopedRun = (id) => ({
  id,
  jobs: [1, 2, 3, 4, 5].map((n) => job(n, { test: 'skipped' })),
});

describe('unitShardVerdict', () => {
  it('a successful test step is a pass', () => {
    expect(unitShardVerdict(job(3, { test: 'success' }), 3)).toEqual({ ok: true, why: 'ran' });
  });
  it('a skipped step after a scope decision is a refusal that explains the follow-up push', () => {
    const v = unitShardVerdict(job(4, { test: 'skipped' }), 4);
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/follow-up push/);
  });
  it('a docs-only PR (path gate skipped the scope step) has nothing to test and passes', () => {
    const j = { name: 'Unit tests (2)', conclusion: 'success', steps: [{ name: 'Decide test scope', conclusion: 'skipped' }] };
    expect(unitShardVerdict(j, 2)).toEqual({ ok: true, why: 'no code-relevant change' });
  });
  it('a failed or cancelled test step names its conclusion', () => {
    expect(unitShardVerdict(job(5, { test: 'failure' }), 5)).toEqual({ ok: false, why: 'step failure' });
    expect(unitShardVerdict(job(5, { test: 'cancelled' }), 5).why).toBe('step cancelled');
  });
  it('a step that has not finished is not a pass', () => {
    expect(unitShardVerdict(job(1, { test: null }), 1)).toEqual({ ok: false, why: 'step not finished' });
  });
  it('a missing job (draft run, other matrix) is a refusal', () => {
    expect(unitShardVerdict(undefined, 2).ok).toBe(false);
  });
  it('a job with no steps at all (never started) is a refusal', () => {
    expect(unitShardVerdict({ name: 'Unit tests (1)', conclusion: 'skipped', steps: [] }, 1).ok).toBe(false);
  });
});

describe('evaluateUnitShards', () => {
  it('passes when one run ran all five shards', () => {
    expect(evaluateUnitShards([fullRun(10)])).toEqual({ ok: true, runId: 10, problems: [] });
  });
  it('refuses a follow-up (scoped) run and names every shard', () => {
    const r = evaluateUnitShards([scopedRun(11)]);
    expect(r.ok).toBe(false);
    expect(r.runId).toBe(11);
    expect(r.problems.map((p) => p.split(':')[0])).toEqual(['shard 1/5', 'shard 2/5', 'shard 3/5', 'shard 4/5', 'shard 5/5']);
  });
  it('refuses one red shard in an otherwise full run', () => {
    const run = fullRun(12);
    run.jobs[4] = job(5, { test: 'failure' });
    expect(evaluateUnitShards([run]).problems).toEqual(['shard 5/5: step failure']);
  });
  it('refuses when there is no run at all', () => {
    expect(evaluateUnitShards([]).ok).toBe(false);
    expect(evaluateUnitShards(null).problems[0]).toMatch(/no CI run/);
  });
  it('passes on a full run even when a newer scoped run exists for the same head', () => {
    expect(evaluateUnitShards([scopedRun(21), fullRun(20)])).toMatchObject({ ok: true, runId: 20 });
  });
  it('never mixes shards from different runs', () => {
    // run 31 passed shard 1 only; run 30 passed shards 2-5 only: no single run covers the suite
    const a = { id: 30, jobs: [1, 2, 3, 4, 5].map((n) => job(n, { test: n === 1 ? 'failure' : 'success' })) };
    const b = scopedRun(31);
    expect(evaluateUnitShards([a, b]).ok).toBe(false);
  });
  it('reports the best run: most shards passing, then the newest', () => {
    const a = scopedRun(40);
    const b = { id: 41, jobs: [1, 2, 3, 4, 5].map((n) => job(n, { test: n <= 3 ? 'success' : 'skipped' })) };
    expect(evaluateUnitShards([a, b])).toMatchObject({ ok: false, runId: 41 });
  });
  it('an empty job list for a run is a refusal, not a pass', () => {
    expect(evaluateUnitShards([{ id: 50, jobs: [] }]).ok).toBe(false);
  });
});

describe('checkUnitShards (gh faked)', () => {
  const fakeGh = ({ runs, jobsByRun }) => {
    const calls = [];
    const run = (args) => {
      calls.push(args);
      const url = args[1];
      if (url.includes('/actions/runs?')) return runs ? { ok: true, stdout: JSON.stringify(runs) } : { ok: false, stdout: '' };
      const id = Number(url.match(/runs\/(\d+)\/jobs/)[1]);
      return jobsByRun[id] ? { ok: true, stdout: JSON.stringify({ jobs: jobsByRun[id] }) } : { ok: false, stdout: '' };
    };
    return { calls, run };
  };
  const wr = (id, path = '.github/workflows/ci.yml', head_sha = SHA) => ({ id, path, head_sha });

  it('reads the CI runs for the head SHA and their latest-attempt jobs', () => {
    const gh = fakeGh({ runs: { workflow_runs: [wr(1)] }, jobsByRun: { 1: fullRun(1).jobs } });
    expect(checkUnitShards({ repo: 'o/r', sha: SHA, run: gh.run })).toEqual({ ok: true, runId: 1, problems: [] });
    expect(gh.calls[0][1]).toBe(`repos/o/r/actions/runs?head_sha=${SHA}&per_page=100`);
    expect(gh.calls[1][1]).toBe('repos/o/r/actions/runs/1/jobs?filter=all&per_page=100&page=1');
  });
  it('ignores other workflows (CodeQL, Clubhouse journeys) and runs of other SHAs', () => {
    const gh = fakeGh({
      runs: { workflow_runs: [wr(2, '.github/workflows/codeql.yml'), wr(3, '.github/workflows/ci.yml', 'b'.repeat(40)), wr(4)] },
      jobsByRun: { 4: scopedRun(4).jobs },
    });
    const r = checkUnitShards({ repo: 'o/r', sha: SHA, run: gh.run });
    expect(r.ok).toBe(false);
    expect(r.runId).toBe(4);
    expect(gh.calls.length).toBe(2);
  });
  it('fails closed when the runs cannot be read', () => {
    const r = checkUnitShards({ repo: 'o/r', sha: SHA, run: fakeGh({ runs: null, jobsByRun: {} }).run });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/could not read the CI runs/);
  });
  it('fails closed when a run\'s jobs cannot be read', () => {
    const r = checkUnitShards({ repo: 'o/r', sha: SHA, run: fakeGh({ runs: { workflow_runs: [wr(5)] }, jobsByRun: {} }).run });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/could not read the jobs of CI run 5/);
  });
  it('a head with no CI run at all is a refusal', () => {
    const r = checkUnitShards({ repo: 'o/r', sha: SHA, run: fakeGh({ runs: { workflow_runs: [] }, jobsByRun: {} }).run });
    expect(r.ok).toBe(false);
  });
});

describe('newestAttempts — a failed-jobs rerun keeps the shards that already passed', () => {
  const at = (j, run_attempt, id) => ({ ...j, run_attempt, id });
  it('keeps an attempt-1 pass that was not rerun and takes the attempt-2 result of one that was', () => {
    const jobs = [
      ...[1, 2, 3, 4].map((n, i) => at(job(n, { test: 'success' }), 1, 10 + i)),
      at(job(5, { test: 'failure' }), 1, 14),
      at(job(5, { test: 'success' }), 2, 20),
    ];
    expect(evaluateUnitShards([{ id: 7, jobs: newestAttempts(jobs) }])).toMatchObject({ ok: true, runId: 7 });
  });
  it('a shard that passed in attempt 1 but failed when rerun in attempt 2 is a failure', () => {
    const jobs = [at(job(5, { test: 'success' }), 1, 14), at(job(5, { test: 'failure' }), 2, 20)];
    const picked = newestAttempts(jobs);
    expect(picked).toHaveLength(1);
    expect(picked[0].run_attempt).toBe(2);
  });
  it('checkUnitShards reads every attempt and pages past 100 jobs', () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ name: `Other ${i}`, id: i, run_attempt: 1, steps: [] }));
    const second = [1, 2, 3, 4, 5].map((n) => ({ ...job(n, { test: 'success' }), run_attempt: 1, id: 200 + n }));
    const calls = [];
    const run = (args) => {
      calls.push(args[1]);
      if (args[1].includes('/actions/runs?')) return { ok: true, stdout: JSON.stringify({ workflow_runs: [{ id: 9, path: '.github/workflows/ci.yml', head_sha: SHA }] }) };
      return { ok: true, stdout: JSON.stringify({ jobs: args[1].endsWith('page=1') ? first : second }) };
    };
    expect(checkUnitShards({ repo: 'o/r', sha: SHA, run })).toEqual({ ok: true, runId: 9, problems: [] });
    expect(calls.filter((c) => c.includes('/jobs?')).length).toBe(2);
  });
});

describe('workflowFile — the run path with or without a ref suffix', () => {
  it('strips what follows @', () => {
    expect(workflowFile('.github/workflows/ci.yml@refs/pull/2273/merge')).toBe('.github/workflows/ci.yml');
    expect(workflowFile('.github/workflows/ci.yml@main')).toBe('.github/workflows/ci.yml');
  });
  it('leaves a plain path alone and survives a missing one', () => {
    expect(workflowFile('.github/workflows/ci.yml')).toBe('.github/workflows/ci.yml');
    expect(workflowFile(undefined)).toBe('');
  });
  it('checkUnitShards finds the CI run when the path carries a ref', () => {
    const run = (args) => {
      if (args[1].includes('/actions/runs?')) {
        return { ok: true, stdout: JSON.stringify({ workflow_runs: [{ id: 3, path: '.github/workflows/ci.yml@refs/pull/9/merge', head_sha: SHA }] }) };
      }
      return { ok: true, stdout: JSON.stringify({ jobs: [1, 2, 3, 4, 5].map((n) => ({ ...job(n, { test: 'success' }), run_attempt: 1, id: n })) }) };
    };
    expect(checkUnitShards({ repo: 'o/r', sha: SHA, run })).toEqual({ ok: true, runId: 3, problems: [] });
  });
});
