#!/usr/bin/env node
/**
 * Run the repo-wide static guards and report WHY each one failed.
 *
 * THE LIE THIS CLOSES
 *
 * On 2026-08-29 a green PR went red on a check named "no imports of GlassCard /
 * GlassStatCard / PremiumGlassCard remain in src". No such import existed. The
 * guard had TIMED OUT while sweeping 4,066 files, and vitest reports a timeout
 * using the same failure shape as a failed assertion. CI therefore printed a
 * specific, false claim about the codebase, and the reader's correct instinct
 * was to go looking for a banned import that was never there.
 *
 * #1672 raised the timeout. Its own PR body says plainly that this makes the
 * unknown RARER, not DISTINGUISHABLE. This is the distinguishable part.
 *
 *     PASS                    the guard ran to completion and found nothing
 *     POLICY_FAILURE          the guard ran to completion and found violations
 *     INFRASTRUCTURE_FAILURE  the guard did not finish, or could not read the
 *                             tree — we do not know whether the policy holds
 *
 * Exit codes mirror that: 0 / 1 / 2. UNKNOWN never becomes PASS.
 *
 * WHY THIS WRAPS VITEST RATHER THAN REPLACING THE GUARDS
 *
 * The eleven guards are 116-357 lines of bespoke matching logic each. Rewriting
 * them into a declarative runner to fix a REPORTING defect would risk weakening
 * the guards themselves, which is the opposite of the point. The lie lives at
 * the reporting boundary, so it is fixed at the reporting boundary: the guards
 * are untouched, and this classifies their outcomes.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

export const PASS = 'PASS';
export const POLICY_FAILURE = 'POLICY_FAILURE';
export const INFRASTRUCTURE_FAILURE = 'INFRASTRUCTURE_FAILURE';

/**
 * Decide what a single failed test actually tells us. Pure, so every branch is
 * testable without making a real guard time out.
 *
 * An assertion failure is the ONLY evidence that the policy is violated.
 * Everything else — a timeout, an unreadable tree, a descriptor limit, a thrown
 * TypeError inside the guard — means the guard did not finish asking.
 */
export function classifyFailure(message = '', name = '') {
  const text = `${name} ${message}`;
  if (/Test timed out in \d+ms|timed out|Timeout/i.test(text)) {
    return { outcome: INFRASTRUCTURE_FAILURE, why: 'the guard did not finish (timeout)' };
  }
  if (/ENOENT|EACCES|EMFILE|ENFILE|ENOSPC|EPERM|EBUSY/.test(text)) {
    return { outcome: INFRASTRUCTURE_FAILURE, why: 'the guard could not read the tree' };
  }
  if (/AssertionError|expected .* to|assert\./i.test(text)) {
    return { outcome: POLICY_FAILURE, why: 'the guard finished and found violations' };
  }
  // Unrecognised: fail toward UNKNOWN, never toward "policy violated".
  return {
    outcome: INFRASTRUCTURE_FAILURE,
    why: 'the guard failed for a reason this runner does not recognise — treated as UNKNOWN, not as a violation',
  };
}

/** Fold per-test outcomes into a process result. */
export function summarise(results) {
  const policy = results.filter((r) => r.outcome === POLICY_FAILURE);
  const infra = results.filter((r) => r.outcome === INFRASTRUCTURE_FAILURE);
  if (infra.length) return { outcome: INFRASTRUCTURE_FAILURE, code: 2, policy, infra };
  if (policy.length) return { outcome: POLICY_FAILURE, code: 1, policy, infra };
  return { outcome: PASS, code: 0, policy, infra };
}

/**
 * WHAT THE JSON REPORTER ACTUALLY GIVES US, measured 2026-08-29.
 *
 * A real 120s timeout arrives in `failureMessages` as `Error: STACK_TRACE_ERROR`
 * — the reporter does not carry the timeout text at all. Only vitest's
 * human-readable stream says "Test timed out in 120000ms".
 *
 * A first draft scraped that stream and correlated it back to test names. It
 * did not match, and it was the wrong idea anyway: parsing a tool's
 * human-readable output to make a safety decision is the brittle-regex pattern
 * this repo has already deleted guards for. It would have been one vitest
 * version away from silently reclassifying timeouts.
 *
 * So the guarantee is the DEFAULT, not a pattern: an unrecognised failure is
 * INFRASTRUCTURE_FAILURE. Proven end to end — a real injected timeout exits 2
 * and is never reported as a policy violation. The label reads "a reason this
 * runner does not recognise", which is exactly what is true.
 */
function parseVitestJson(path) {
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const out = [];
  for (const file of raw.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      if (t.status === 'passed' || t.status === 'pending') {
        out.push({ guard: t.fullName || t.title, outcome: PASS, why: 'ran to completion, no violations' });
        continue;
      }
      const msg = (t.failureMessages ?? []).join('\n');
      const title = t.fullName || t.title;
      out.push({ guard: title, ...classifyFailure(msg, t.title), message: msg.split('\n')[0] ?? '' });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tmp = mkdtempSync(join(tmpdir(), 'helm-guards-'));
  const jsonPath = join(tmp, 'guards.json');
  try {
    const r = spawnSync(
      'npx',
      ['vitest', 'run', '--project', 'guards', '--reporter=json', '--outputFile', jsonPath],
      { cwd: REPO, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let results;
    try {
      results = parseVitestJson(jsonPath);
    } catch (err) {
      // The runner itself could not learn anything. That is UNKNOWN, loudly —
      // not a pass, and not a policy violation.
      console.error('repo-guards: INFRASTRUCTURE_FAILURE — could not read the guard report');
      console.error(`  ${err.message}`);
      console.error(`  vitest exit=${r.status}`);
      if (r.stderr) console.error(r.stderr.split('\n').slice(-12).join('\n'));
      process.exit(2);
    }

    const summary = summarise(results);
    const width = Math.max(...results.map((x) => x.guard.length), 10);
    for (const x of results) {
      const mark = x.outcome === PASS ? 'PASS' : x.outcome === POLICY_FAILURE ? 'POLICY' : 'INFRA';
      console.log(`  ${mark.padEnd(7)} ${x.guard.padEnd(width)}  ${x.why}`);
    }
    console.log('');
    console.log(`  ${results.length} guard(s): ${results.filter((x) => x.outcome === PASS).length} pass, ` +
      `${summary.policy.length} policy failure(s), ${summary.infra.length} infrastructure failure(s)`);

    if (summary.infra.length) {
      console.error('');
      console.error('  INFRASTRUCTURE_FAILURE means these guards DID NOT FINISH.');
      console.error('  It is NOT evidence that the policy they check is violated,');
      console.error('  and it is NOT evidence that it holds. It is unknown.');
      for (const x of summary.infra) console.error(`    ${x.guard}: ${x.message ?? x.why}`);
    }
    if (summary.policy.length) {
      console.error('');
      console.error('  POLICY_FAILURE — these guards ran and found real violations:');
      for (const x of summary.policy) console.error(`    ${x.guard}: ${x.message ?? ''}`);
    }
    process.exit(summary.code);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
