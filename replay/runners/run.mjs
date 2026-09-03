#!/usr/bin/env node
// replay/runners/run.mjs
//
// Checks out a manifest's bad_version SHA in an isolated, disposable
// worktree (via the repo's one sanctioned worktree creator,
// scripts/new-worktree.sh — this is NOT a second worktree mechanism),
// overlays the manifest's fixture, runs the linked test and expects it to
// fail; then checks out fixed_version in the SAME worktree, re-applies the
// fixture, reruns the test, and expects it to pass. Writes
// replay/proofs/<replay_id>.json only when a real run completed — a disk
// or install refusal is reported as `unknown` and writes nothing, per
// replay/README.md's "absence means not yet run, never passed".
//
// Never touches production: no Supabase client, no Vercel API, no network
// call this script makes itself. The only state it mutates is its own
// disposable worktree, which it removes when the run finishes (pass --keep
// to leave it for inspection).
//
// Usage:
//   node replay/runners/run.mjs <replay_id>
//   node replay/runners/run.mjs --all
//   node replay/runners/run.mjs <replay_id> --keep

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  REPLAY_DIR,
  PROOFS_DIR,
  listManifestFiles,
  loadManifest,
  validateManifest,
  resolveFixtureFiles,
} from './manifest.mjs';

const REPO_ROOT = resolve(REPLAY_DIR, '..');
const OUTPUT_TAIL_CHARS = 4000;

function log(...args) {
  console.log('[replay]', ...args);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8', ...opts });
}

function tail(text, n = OUTPUT_TAIL_CHARS) {
  if (!text) return '';
  return text.length > n ? `…(truncated)…${text.slice(-n)}` : text;
}

/** Heuristic only — documented as such in replay/README.md and the schema. */
function classifyFailure(combinedOutput) {
  const s = combinedOutput.toLowerCase();
  if (s.includes('has no exported member') || s.includes('does not provide an export named') || s.includes('cannot find module')) {
    return 'missing-export';
  }
  if (s.includes('assertionerror') || s.includes('expected') && s.includes('received')) {
    return 'assertion';
  }
  if (s.includes('ts(') || s.includes('type error') || s.includes('is not assignable to type')) {
    return 'type-error';
  }
  return 'runtime-error';
}

function createWorktree(taskName, baseRef) {
  const result = run('scripts/new-worktree.sh', [taskName, '--base', baseRef], { stdio: 'pipe' });
  if (result.status !== 0) {
    return { ok: false, stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
  }
  const lines = (result.stdout ?? '').trim().split('\n');
  const dir = lines[lines.length - 1].trim();
  if (!dir || !existsSync(dir)) {
    return { ok: false, stderr: `new-worktree.sh did not print a valid workspace path (got ${JSON.stringify(dir)})`, stdout: result.stdout ?? '' };
  }
  return { ok: true, dir };
}

function checkDepsAffordable(dir) {
  const check = run('node', ['scripts/ensure-worktree-deps.mjs', dir, '--check'], { stdio: 'pipe' });
  return { ok: check.status === 0, reason: (check.stderr || check.stdout || '').trim() };
}

function installDeps(dir) {
  const install = run('node', ['scripts/ensure-worktree-deps.mjs', dir], { stdio: 'pipe' });
  return { ok: install.status === 0, reason: (install.stderr || install.stdout || '').trim() };
}

function applyFixture(dir, manifest) {
  for (const { absSource, target } of resolveFixtureFiles(manifest)) {
    if (!existsSync(absSource)) {
      throw new Error(`fixture source missing: ${absSource}`);
    }
    const dest = join(dir, target);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(absSource, dest);
  }
}

function checkoutSha(dir, sha) {
  // --force: this worktree is disposable scratch space seeded fresh by
  // createWorktree() for this run only, never a task/PR worktree — there is
  // nothing here worth preserving across the bad->fixed transition.
  const result = spawnSync('git', ['-C', dir, 'checkout', '--force', '--detach', sha], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git checkout ${sha} failed: ${result.stderr}`);
  }
}

function runTest(dir, testCommand) {
  const result = spawnSync(testCommand, { cwd: dir, shell: true, encoding: 'utf8' });
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return {
    exitCode: result.status,
    passed: result.status === 0,
    output: tail(combined),
    failureMode: result.status === 0 ? null : classifyFailure(combined),
  };
}

function removeWorktree(dir, taskBranch) {
  spawnSync('git', ['-C', REPO_ROOT, 'worktree', 'remove', '--force', dir], { encoding: 'utf8' });
  spawnSync('git', ['-C', REPO_ROOT, 'branch', '-D', taskBranch], { encoding: 'utf8' });
}

function replayOne(manifestPath, { keep }) {
  const { manifest, path } = loadManifest(manifestPath);
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    log(`SCHEMA INVALID: ${path}`);
    errors.forEach((e) => log('  -', e));
    return { replay_id: manifest.replay_id ?? '(unknown)', verdict: 'invalid', errors };
  }
  if (manifest.sanitization?.reviewed !== true) {
    log(`REFUSED: ${manifest.replay_id} has no sanitization review (sanitization.reviewed !== true)`);
    return { replay_id: manifest.replay_id, verdict: 'refused', reason: 'no sanitization review' };
  }

  log(`${manifest.replay_id}: creating worktree at bad_version ${manifest.bad_version}`);
  const taskName = `replay-${manifest.replay_id}`.slice(0, 60);
  const branch = `agent/${taskName}`;
  const wt = createWorktree(taskName, manifest.bad_version);
  if (!wt.ok) {
    log(`UNKNOWN: could not create worktree for ${manifest.replay_id}`);
    log(wt.stderr);
    return { replay_id: manifest.replay_id, verdict: 'unknown', reason: `worktree creation refused/failed: ${wt.stderr}` };
  }

  try {
    const affordable = checkDepsAffordable(wt.dir);
    if (!affordable.ok) {
      log(`UNKNOWN: dependency install refused for ${manifest.replay_id} — ${affordable.reason}`);
      // A refusal to install is NOT evidence the fix is broken or missing.
      // Report unknown, matching canClaimAllClear's rule that a blind input
      // never yields the optimistic (or pessimistic) verdict.
      return { replay_id: manifest.replay_id, verdict: 'unknown', reason: affordable.reason };
    }
    log(`${manifest.replay_id}: installing dependencies`);
    const installed = installDeps(wt.dir);
    if (!installed.ok) {
      log(`UNKNOWN: dependency install failed for ${manifest.replay_id} — ${installed.reason}`);
      return { replay_id: manifest.replay_id, verdict: 'unknown', reason: installed.reason };
    }

    applyFixture(wt.dir, manifest);
    log(`${manifest.replay_id}: running test at bad_version (expect fail)`);
    const badRun = runTest(wt.dir, manifest.test_command);

    checkoutSha(wt.dir, manifest.fixed_version);
    applyFixture(wt.dir, manifest);
    log(`${manifest.replay_id}: running test at fixed_version (expect pass)`);
    const fixedRun = runTest(wt.dir, manifest.test_command);

    const badAsExpected = !badRun.passed;
    const fixedAsExpected = fixedRun.passed;
    const verdict = badAsExpected && fixedAsExpected ? 'reproduced' : 'inconclusive';

    const proof = {
      replay_id: manifest.replay_id,
      incident_id: manifest.incident_id,
      feature_id: manifest.feature_id,
      bad_version: manifest.bad_version,
      fixed_version: manifest.fixed_version,
      ran_at: new Date().toISOString(),
      verdict,
      bad_version_run: {
        expected: 'fail',
        passed: badRun.passed,
        as_expected: badAsExpected,
        failure_mode: badRun.failureMode,
        expected_failure_mode: manifest.expected_failure_mode ?? null,
        failure_mode_matches_expected: manifest.expected_failure_mode
          ? badRun.failureMode === manifest.expected_failure_mode
          : null,
        output_tail: badRun.output,
      },
      fixed_version_run: {
        expected: 'pass',
        passed: fixedRun.passed,
        as_expected: fixedAsExpected,
        output_tail: fixedRun.output,
      },
    };

    mkdirSync(PROOFS_DIR, { recursive: true });
    writeFileSync(join(PROOFS_DIR, `${manifest.replay_id}.json`), `${JSON.stringify(proof, null, 2)}\n`);
    log(`${manifest.replay_id}: verdict=${verdict} (proof written)`);
    return proof;
  } finally {
    if (!keep) {
      removeWorktree(wt.dir, branch);
      log(`${manifest.replay_id}: scratch worktree removed`);
    } else {
      log(`${manifest.replay_id}: kept worktree at ${wt.dir} (--keep)`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const keep = args.includes('--keep');
  const all = args.includes('--all');
  const positional = args.find((a) => !a.startsWith('--'));

  if (!all && !positional) {
    console.error('usage: node replay/runners/run.mjs <replay_id> | --all [--keep]');
    process.exit(2);
  }

  const targets = all ? listManifestFiles() : [join(REPLAY_DIR, 'manifests', `${positional}.yml`)];
  const results = targets.map((t) => replayOne(t, { keep }));

  const failed = results.filter((r) => r.verdict === 'inconclusive' || r.verdict === 'invalid');
  const unknown = results.filter((r) => r.verdict === 'unknown' || r.verdict === 'refused');
  log('---');
  log(`${results.length} replay(s): ${results.filter((r) => r.verdict === 'reproduced').length} reproduced, ${failed.length} inconclusive/invalid, ${unknown.length} unknown/refused`);
  process.exit(failed.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { replayOne, classifyFailure };
