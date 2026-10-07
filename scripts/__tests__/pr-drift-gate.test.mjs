/**
 * scripts/github/pr-drift-gate.mjs — which drift fails a pull request.
 *
 * The gate's whole value is the verdict table in its header: introduced
 * drift fails, inherited drift (main already failing) and merge skew (PR and
 * main each consistent, their merge not) do not. Each case below builds a
 * throwaway git repo whose "check" passes or fails per tree, so the verdict
 * is exercised end to end — including the detached worktrees the gate makes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const GATE = resolve(import.meta.dirname, '..', 'github', 'pr-drift-gate.mjs');
const CHECK = ['node', '-e', "process.exit(require('fs').readFileSync('state','utf8').trim()==='ok'?0:1)"];

let dir;
const sha = {};
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();

function commit(state, msg) {
  writeFileSync(join(dir, 'state'), `${state}\n`);
  git('add', 'state');
  git('commit', '-q', '-m', msg);
  return git('rev-parse', 'HEAD');
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pr-drift-gate-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  sha.good = commit('ok', 'good');
  sha.bad = commit('bad', 'bad');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Run the gate with the working tree (the "merge") in `mergeState`. */
function gate({ mergeState, base, head, event = 'pull_request', skew = false }) {
  writeFileSync(join(dir, 'state'), `${mergeState}\n`);
  const args = [GATE, ...(skew ? ['--allow-merge-skew'] : []), '--', ...CHECK];
  const r = spawnSync(process.execPath, args, {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: event,
      PR_BASE_SHA: base ?? '',
      PR_HEAD_SHA: head ?? '',
      RUNNER_TEMP: join(dir, '.runner-temp'),
    },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('pr-drift-gate verdicts', () => {
  it('passes when the merge passes, without touching base or head', () => {
    expect(gate({ mergeState: 'ok', base: sha.bad, head: sha.bad }).status).toBe(0);
  });

  it('fails drift this PR introduced (main passes, PR head fails)', () => {
    const r = gate({ mergeState: 'bad', base: sha.good, head: sha.bad, skew: true });
    expect(r.status).toBe(1);
    expect(r.out).toContain('introduced by this PR');
  });

  it('does not fail drift inherited from main', () => {
    const r = gate({ mergeState: 'bad', base: sha.bad, head: sha.bad });
    expect(r.status).toBe(0);
    expect(r.out).toContain('inherited');
  });

  it('tolerates merge skew only with --allow-merge-skew', () => {
    const lenient = gate({ mergeState: 'bad', base: sha.good, head: sha.good, skew: true });
    expect(lenient.status).toBe(0);
    expect(lenient.out).toContain('merge');
    const strict = gate({ mergeState: 'bad', base: sha.good, head: sha.good });
    expect(strict.status).toBe(1);
  });

  it('is strict outside pull_request unless it is a push with --allow-merge-skew', () => {
    expect(gate({ mergeState: 'bad', event: 'merge_group' }).status).toBe(1);
    expect(gate({ mergeState: 'bad', event: 'push' }).status).toBe(1);
    expect(gate({ mergeState: 'bad', event: 'push', skew: true }).status).toBe(0);
  });

  it('is strict on a pull_request with no base/head to compare against', () => {
    expect(gate({ mergeState: 'bad', skew: true }).status).toBe(1);
  });
});
