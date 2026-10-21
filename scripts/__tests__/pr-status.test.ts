import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs module, scripts/ is outside tsconfig.
import { collect, formatSummary, parseArgs, runStats, summarizePr } from '../github/pr-status.mjs';

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const pr = (over = {}) => ({
  number: 7,
  title: 'A change',
  headRefName: 'claude/thing',
  headRefOid: HEAD,
  isDraft: false,
  state: 'OPEN',
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  reviewDecision: '',
  labels: [{ name: 'needs-fixer' }],
  ...over,
});
const REQUIRED = ['CI aggregate', 'Review Gate aggregate'];
const green = REQUIRED.map((name) => ({ name, status: 'completed', conclusion: 'success' }));
const run = (over = {}) => ({ head_sha: HEAD, run_attempt: 1, status: 'completed', conclusion: 'success', name: 'CI', ...over });

describe('parseArgs', () => {
  it('reads a PR number and flags', () => {
    expect(parseArgs(['2238', '--log', '--json'])).toMatchObject({ prNumber: 2238, log: true, json: true, error: null });
  });
  it('requires a number and rejects unknown flags', () => {
    expect(parseArgs([]).error).toMatch(/PR number/);
    expect(parseArgs(['1', '--nope']).error).toMatch(/unknown flag/);
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('runStats', () => {
  it('counts runs, heads, re-attempts, cancellations and in-flight on the head', () => {
    const s = runStats(
      [run(), run({ head_sha: OLD, conclusion: 'cancelled' }), run({ head_sha: OLD, run_attempt: 2 }), run({ name: 'Other' })],
      HEAD,
    );
    expect(s).toMatchObject({ runs: 3, heads: 2, reattempts: 1, cancelled: 1, onHead: 1, headInFlight: false });
    expect(runStats([run({ status: 'in_progress', conclusion: null })], HEAD).headInFlight).toBe(true);
  });
});

describe('summarizePr verdicts', () => {
  const base = { pr: pr(), checks: green, runs: [run()], failedJobs: [] };
  it('GREEN when every required context passed', () => {
    expect(summarizePr(base, REQUIRED).verdict).toMatch(/^GREEN/);
  });
  it('DRAFT before anything else about CI', () => {
    expect(summarizePr({ ...base, pr: pr({ isDraft: true }), checks: [] }, REQUIRED).verdict).toMatch(/^DRAFT/);
  });
  it('CONFLICT when the PR cannot merge', () => {
    expect(summarizePr({ ...base, pr: pr({ mergeable: 'CONFLICTING' }) }, REQUIRED).verdict).toMatch(/^CONFLICT/);
  });
  it('CI_RUNNING means do not push', () => {
    const s = summarizePr({ ...base, checks: [], runs: [run({ status: 'in_progress', conclusion: null })] }, REQUIRED);
    expect(s.verdict).toMatch(/^CI_RUNNING/);
  });
  it('NO_CI_ON_HEAD when a new head has no run yet', () => {
    expect(summarizePr({ ...base, checks: [], runs: [run({ head_sha: OLD })] }, REQUIRED).verdict).toMatch(/^NO_CI_ON_HEAD/);
  });
  it('RED_INFRA when the only failed job lost its runner', () => {
    const failedJobs = [{ id: 1, name: 'Next build', conclusion: 'failure', steps: [{ name: 'Build', conclusion: 'cancelled', number: 9 }] }];
    const checks = [{ name: 'CI aggregate', status: 'completed', conclusion: 'failure' }, green[1]];
    const s = summarizePr({ ...base, checks, runs: [run({ conclusion: 'failure' })], failedJobs }, REQUIRED);
    expect(s.verdict).toMatch(/^RED_INFRA/);
    expect(s.failedJobs[0]).toMatchObject({ name: 'Next build', step: 'Build', infra: true });
  });
  it('RED when a test shard failed in its own work', () => {
    const failedJobs = [{ id: 2, name: 'Unit tests (3)', conclusion: 'failure', steps: [{ name: 'Unit tests (shard 3/5)', conclusion: 'failure', number: 6 }] }];
    const checks = [{ name: 'CI aggregate', status: 'completed', conclusion: 'failure' }, green[1]];
    const s = summarizePr({ ...base, checks, runs: [run({ conclusion: 'failure' })], failedJobs }, REQUIRED);
    expect(s.verdict).toMatch(/^RED:/);
    expect(s.failedJobs[0].infra).toBe(false);
  });
  it('CI_RUNNING while another required context is still pending, even if the CI workflow is done', () => {
    const checks = [green[0], { name: 'Review Gate aggregate', status: 'in_progress', conclusion: null }];
    const s = summarizePr({ ...base, checks }, REQUIRED);
    expect(s.verdict).toMatch(/^CI_RUNNING/);
    expect(s.ci.requiredPending).toEqual(['Review Gate aggregate']);
  });
  it('ignores the derived CI aggregate as a cause', () => {
    const failedJobs = [{ id: 3, name: 'CI aggregate', conclusion: 'failure', steps: [] }];
    expect(summarizePr({ ...base, failedJobs }, REQUIRED).failedJobs).toEqual([]);
  });
});

describe('collect and formatSummary', () => {
  it('reads gh through exec, tails the log only for own-work failures, and prints the verdict', () => {
    const calls: string[][] = [];
    const exec = (args: string[]) => {
      calls.push(args);
      const joined = args.join(' ');
      if (args[0] === 'pr') return JSON.stringify(pr());
      if (joined.includes('/check-runs')) return JSON.stringify([{ name: 'CI aggregate', status: 'completed', conclusion: 'failure' }]);
      if (joined.includes('/actions/runs?')) return JSON.stringify([{ head_sha: HEAD, run_attempt: 1, status: 'completed', conclusion: 'failure', name: 'CI', id: 99 }]);
      if (joined.includes('/jobs')) {
        return JSON.stringify([
          { id: 11, name: 'Lint', conclusion: 'failure', steps: [{ name: 'Lint ratchet', conclusion: 'failure', number: 6 }] },
          { id: 12, name: 'Next build', conclusion: 'failure', steps: [{ name: 'Build', conclusion: 'cancelled', number: 9 }] },
        ]);
      }
      if (args[0] === 'run') return Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
      throw new Error(`unexpected ${joined}`);
    };
    const s = collect(7, exec, { log: true });
    const lint = s.failedJobs.find((j: { name: string }) => j.name === 'Lint');
    expect(lint.log.split('\n')).toHaveLength(40);
    expect(lint.log).toContain('line 99');
    expect(s.failedJobs.find((j: { name: string }) => j.name === 'Next build').log).toBeUndefined();
    expect(calls.filter((c) => c[0] === 'run')).toHaveLength(1);
    const text = formatSummary(s);
    expect(text).toContain('VERDICT');
    expect(text).toContain('Lint > Lint ratchet  [own work]');
    expect(text).toContain('Next build > Build  [infra]');
    expect(text).toContain('CI spent 1 run(s)');
  });

  it('only looks at failed jobs of the CI workflow run, and reads required contexts from live protection', () => {
    const calls: string[] = [];
    const exec = (args: string[]) => {
      const joined = args.join(' ');
      calls.push(joined);
      if (args[0] === 'pr') return JSON.stringify(pr());
      if (joined.includes('/branches/main/protection')) return JSON.stringify(['Only This One']);
      if (joined.includes('/check-runs')) return JSON.stringify([{ name: 'Only This One', status: 'completed', conclusion: 'success' }]);
      if (joined.includes('/actions/runs?')) {
        return JSON.stringify([
          { head_sha: HEAD, run_attempt: 1, status: 'completed', conclusion: 'failure', name: 'Review Gate', id: 5 },
          { head_sha: HEAD, run_attempt: 1, status: 'completed', conclusion: 'success', name: 'CI', id: 6 },
        ]);
      }
      throw new Error(`unexpected ${joined}`);
    };
    const s = collect(7, exec);
    expect(s.verdict).toMatch(/^GREEN/);
    expect(s.failedJobs).toEqual([]);
    expect(calls.some((c) => c.includes('/actions/runs/5/jobs'))).toBe(false);
  });
});
