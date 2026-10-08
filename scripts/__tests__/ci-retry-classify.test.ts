import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs module, scripts/ is outside tsconfig.
import { classifyJob, decideRetry } from '../github/ci-retry-classify.mjs';

const step = (name: string, conclusion: string, number = 1) => ({ name, conclusion, number });
const job = (name: string, conclusion: string, steps: ReturnType<typeof step>[] = []) => ({ name, conclusion, steps });
const aggregate = job('CI aggregate', 'failure', [step('Fail if any required CI check failed', 'failure')]);

describe('classifyJob', () => {
  it('treats a job with no failed step as runner loss', () => {
    const v = classifyJob(job('Unit tests (3)', 'failure', [step('Set up job', 'success', 1), step('Unit tests (shard 3/5)', 'cancelled', 5)]));
    expect(v.infra).toBe(true);
  });

  it('treats a setup or install step failure as infrastructure', () => {
    for (const name of ['Set up job', 'Checkout', 'Setup Node and install dependencies', 'Install dependencies', 'Install Playwright browsers', 'Download Next build artifact']) {
      expect(classifyJob(job('x', 'failure', [step(name, 'failure')])).infra).toBe(true);
    }
  });

  it('never treats a build, test, lint or type step as infrastructure', () => {
    for (const name of ['Build', 'Unit tests (shard 1/5)', 'Integration tests', 'Typecheck', 'ESLint', 'Lint ratchet', 'Start local Supabase stack', 'Run pgTAP']) {
      expect(classifyJob(job('x', 'failure', [step('Install dependencies', 'success', 1), step(name, 'failure', 2)])).infra).toBe(false);
    }
  });

  it('judges by the FIRST failed step', () => {
    const v = classifyJob(job('x', 'failure', [step('Typecheck', 'failure', 1), step('Install dependencies', 'failure', 2)]));
    expect(v.infra).toBe(false);
  });
});

describe('decideRetry', () => {
  it('retries when every failed job is infrastructure', () => {
    const d = decideRetry([
      job('Unit tests (2)', 'failure', [step('Install dependencies', 'failure')]),
      job('Next build', 'success'),
      aggregate,
    ]);
    expect(d.retry).toBe(true);
  });

  it('does not retry a draft run, where only the aggregate failed', () => {
    const d = decideRetry([job('Static checks', 'skipped'), aggregate]);
    expect(d.retry).toBe(false);
    expect(d.reason).toMatch(/only the aggregate/);
  });

  it('does not retry the aggregate alone even if it is the only failure', () => {
    expect(decideRetry([aggregate]).retry).toBe(false);
  });

  it('does not retry when any failed job failed in its own work, even beside an infra failure', () => {
    const d = decideRetry([
      job('Unit tests (2)', 'failure', [step('Install dependencies', 'failure')]),
      job('Next build', 'failure', [step('Build', 'failure')]),
      aggregate,
    ]);
    expect(d.retry).toBe(false);
    expect(d.reason).toContain('Next build');
  });

  it('ignores cancelled and skipped jobs', () => {
    expect(decideRetry([job('a', 'cancelled'), job('b', 'skipped')]).retry).toBe(false);
  });
});
