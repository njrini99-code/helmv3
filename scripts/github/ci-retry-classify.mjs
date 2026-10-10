#!/usr/bin/env node
/**
 * Decide whether a failed CI run is worth ONE automatic "re-run failed jobs".
 *
 * Reads the jobs of a workflow run (the `jobs` array from
 * `GET /repos/{repo}/actions/runs/{id}/jobs`, or the bare array) on stdin and
 * prints one JSON object: { retry, reason, jobs: [{ name, infra, why }] }.
 *
 * The rule, owner-narrowed 2026-10-07 from "retry once, for all PRs":
 * retry ONLY when every failed job, other than `CI aggregate`, failed for a
 * reason that is not the code under test:
 *   - it has no failed step at all (the runner shut down or lost contact, so
 *     the steps that did not finish are cancelled or absent), or
 *   - its first failed step is a setup or install step (checkout, setup-node
 *     and npm ci, Deno, artifact download, Playwright browser install): a
 *     registry 429, a cache outage, a dropped download.
 * Never retried: a build, a test shard, a lint or type step, a ratchet, the
 * Supabase stack (a broken migration fails there), or a run whose only failure
 * is the aggregate. A draft PR fails the aggregate on purpose and nothing else,
 * so it never retries; the aggregate is derived from the jobs it needs.
 *
 *   gh api repos/$REPO/actions/runs/$RUN/jobs --paginate --jq '.jobs[]' | jq -s . \
 *     | node scripts/github/ci-retry-classify.mjs
 */
import { readFileSync } from 'node:fs';

/** Check-run names that are derived from other jobs, never a cause. */
const DERIVED_JOBS = new Set(['CI aggregate']);

/** Step names that are setup or install: a failure here says nothing about the change. */
const INFRA_STEP = [
  /^set up job$/i,
  /^checkout$/i,
  /^setup node( and install dependencies)?$/i,
  /^install dependencies$/i,
  /^setup deno$/i,
  /^restore .*cache$/i,
  /^download .*artifact/i,
  /^install playwright browsers$/i,
  /^cache playwright browsers$/i,
];

/**
 * Classify one failed job. Pure.
 * @param {{ name: string, steps?: Array<{ name: string, conclusion: string | null, number?: number }> }} job
 */
export function classifyJob(job) {
  const steps = [...(job.steps ?? [])].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const firstFailed = steps.find((s) => s.conclusion === 'failure');
  if (!firstFailed) {
    return { name: job.name, infra: true, why: 'no failed step: the runner shut down or lost contact' };
  }
  if (INFRA_STEP.some((re) => re.test(firstFailed.name.trim()))) {
    return { name: job.name, infra: true, why: `failed in setup/install step "${firstFailed.name}"` };
  }
  return { name: job.name, infra: false, why: `failed in "${firstFailed.name}", which is the change's own work` };
}

/**
 * @param {Array<{ name: string, conclusion: string | null, steps?: Array<object> }>} jobs
 * @returns {{ retry: boolean, reason: string, jobs: Array<{ name: string, infra: boolean, why: string }> }}
 */
export function decideRetry(jobs) {
  const failed = jobs.filter((j) => j.conclusion === 'failure' && !DERIVED_JOBS.has(j.name));
  if (failed.length === 0) {
    const aggregateFailed = jobs.some((j) => j.conclusion === 'failure' && DERIVED_JOBS.has(j.name));
    return {
      retry: false,
      reason: aggregateFailed
        ? 'only the aggregate failed (a draft PR, or a cancelled/skipped dependency): nothing to re-run'
        : 'no failed job',
      jobs: [],
    };
  }
  const verdicts = failed.map(classifyJob);
  const real = verdicts.filter((v) => !v.infra);
  if (real.length > 0) {
    return { retry: false, reason: `${real.length} job(s) failed in the change's own work: ${real.map((v) => v.name).join(', ')}`, jobs: verdicts };
  }
  return { retry: true, reason: `every failed job failed for infrastructure reasons: ${verdicts.map((v) => v.name).join(', ')}`, jobs: verdicts };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const raw = JSON.parse(readFileSync(0, 'utf8'));
  const jobs = Array.isArray(raw) ? raw : raw.jobs ?? [];
  console.log(JSON.stringify(decideRetry(jobs)));
}
