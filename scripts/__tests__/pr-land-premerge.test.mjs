// scripts/pr-land.mjs checks a PR against the CURRENT main before merging (see PRE-MERGE CHECK there): it merges the head into
// origin/main in memory with `git merge-tree`, refuses a conflict, and refuses a Bridge ID or CH code that the merged result uses
// twice. It does this under a single-flight lock, so two sessions landing at once take turns.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireLandLock, bridgeCollisions, parseMergeTree, preMergeCheck } from '../pr-land.mjs';

const TREE = 'f'.repeat(40);
const temps = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop(), { recursive: true, force: true });
});
const temp = (name) => {
  const d = mkdtempSync(join(tmpdir(), `pr-land-${name}-`));
  temps.push(d);
  return d;
};

describe('parseMergeTree', () => {
  it('a clean merge is the tree alone', () => {
    expect(parseMergeTree({ ok: true, stdout: TREE })).toEqual({ clean: true, tree: TREE, conflicts: [] });
  });

  it('a conflict lists each conflicted path once, and stops at the messages', () => {
    const stdout = `${TREE}\nsrc/a.ts\nsrc/a.ts\ndocs/b.md\n\nAuto-merging src/a.ts\nCONFLICT (content): Merge conflict in src/a.ts`;
    expect(parseMergeTree({ ok: false, stdout })).toEqual({ clean: false, tree: TREE, conflicts: ['src/a.ts', 'docs/b.md'] });
  });

  it('output that is not a tree is never clean', () => {
    expect(parseMergeTree({ ok: true, stdout: 'fatal: not a commit' }).clean).toBe(false);
  });
});

describe('bridgeCollisions', () => {
  it('finds ids and CH codes used twice (the 2026-10-21 130742-130745 clash)', () => {
    const rows = [
      { id: 130742, chCode: 'CH-13932' },
      { id: 130742, chCode: 'CH-13940' },
      { id: 130746, chCode: 'CH-13940' },
      { id: 130747 },
    ];
    expect(bridgeCollisions(rows)).toEqual({ ids: [130742], chCodes: ['CH-13940'] });
  });

  it('a clean list, or something that is not a list, has none', () => {
    expect(bridgeCollisions([{ id: 1, chCode: 'CH-1' }, { id: 2, chCode: 'CH-2' }])).toEqual({ ids: [], chCodes: [] });
    expect(bridgeCollisions(null)).toEqual({ ids: [], chCodes: [] });
  });
});

describe('preMergeCheck (stubbed git)', () => {
  const stub = (answers) => (cmd, args) => {
    const key = args[0] === 'show' ? 'show' : args[0];
    return answers[key] ?? { ok: true, stdout: '', stderr: '' };
  };

  it('fetches main and the PR head, and passes a clean merge with unique Bridge rows', () => {
    const calls = [];
    const run = (cmd, args) => {
      calls.push(args.join(' '));
      return stub({
        'rev-parse': { ok: true, stdout: 'a'.repeat(40) },
        'merge-tree': { ok: true, stdout: TREE },
        show: { ok: true, stdout: JSON.stringify([{ id: 1, chCode: 'CH-1' }]) },
      })(cmd, args);
    };
    expect(preMergeCheck({ prNumber: 7, headSha: 'b'.repeat(40), run })).toMatchObject({ ok: true, problems: [] });
    expect(calls[0]).toBe('fetch --quiet origin main refs/pull/7/head');
    expect(calls).toContain(`merge-tree --write-tree --name-only origin/main ${'b'.repeat(40)}`);
  });

  it('refuses a conflict and names the files', () => {
    const run = stub({ 'merge-tree': { ok: false, stdout: `${TREE}\nconfig/clubhouse/bridge-contracts.json\n\nCONFLICT` } });
    const r = preMergeCheck({ prNumber: 7, headSha: 'b'.repeat(40), run });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/does not merge cleanly/);
    expect(r.problems[0]).toMatch(/bridge-contracts\.json/);
  });

  it('refuses a merged result that uses a Bridge ID or a CH code twice', () => {
    const run = stub({ 'merge-tree': { ok: true, stdout: TREE }, show: { ok: true, stdout: JSON.stringify([{ id: 5, chCode: 'CH-9' }, { id: 5, chCode: 'CH-9' }]) } });
    const r = preMergeCheck({ prNumber: 7, headSha: 'b'.repeat(40), run });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/Bridge IDs are used twice: 5/);
    expect(r.problems.join('\n')).toMatch(/CH codes are used twice: CH-9/);
  });

  it('a failed fetch is a refusal, never a pass', () => {
    const r = preMergeCheck({ prNumber: 7, headSha: 'b'.repeat(40), run: stub({ fetch: { ok: false, stdout: '', stderr: 'offline' } }) });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/offline/);
  });

  it('a repo without the Bridge file passes on the merge alone', () => {
    const run = stub({ 'merge-tree': { ok: true, stdout: TREE }, show: { ok: false, stdout: '', stderr: 'does not exist' } });
    expect(preMergeCheck({ prNumber: 7, headSha: 'b'.repeat(40), run }).ok).toBe(true);
  });
});

describe('preMergeCheck (real git)', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const run = (cwd) => (cmd, args) => {
    try {
      return { ok: true, stdout: execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(), stderr: '' };
    } catch (e) {
      return { ok: false, stdout: String(e.stdout ?? '').trim(), stderr: String(e.stderr ?? '').trim() };
    }
  };
  const bridge = (rows) => `${JSON.stringify(rows, null, 2)}\n`;

  // An "origin" with main and a PR head under refs/pull/7/head, as GitHub serves them, and a clone that lands from it.
  function setup({ mainRows, prRows }) {
    const origin = temp('origin');
    git(origin, 'init', '--quiet', '--bare', '--initial-branch=main');
    const work = temp('work');
    git(work, 'init', '--quiet', '--initial-branch=main');
    git(work, 'config', 'user.email', 't@example.com');
    git(work, 'config', 'user.name', 'T');
    git(work, 'config', 'commit.gpgsign', 'false');
    mkdirSync(join(work, 'config/clubhouse'), { recursive: true });
    writeFileSync(join(work, 'config/clubhouse/bridge-contracts.json'), bridge([{ id: 1, chCode: 'CH-1' }]));
    git(work, 'add', '.');
    git(work, 'commit', '--quiet', '-m', 'base');
    git(work, 'checkout', '--quiet', '-b', 'pr');
    writeFileSync(join(work, 'config/clubhouse/bridge-contracts.json'), bridge(prRows));
    writeFileSync(join(work, 'feature.txt'), 'the PR\'s own change\n');
    git(work, 'add', '.');
    git(work, 'commit', '--quiet', '-m', 'pr');
    const head = git(work, 'rev-parse', 'HEAD');
    git(work, 'checkout', '--quiet', 'main');
    writeFileSync(join(work, 'config/clubhouse/bridge-contracts.json'), bridge(mainRows));
    git(work, 'commit', '--quiet', '-am', 'main moves');
    git(work, 'remote', 'add', 'origin', origin);
    git(work, 'push', '--quiet', 'origin', 'main', `${head}:refs/pull/7/head`);
    return { work, head };
  }

  it('refuses a PR that conflicts with what main gained since its CI ran', () => {
    const { work, head } = setup({
      mainRows: [{ id: 1, chCode: 'CH-1' }, { id: 2, chCode: 'CH-2' }],
      prRows: [{ id: 1, chCode: 'CH-1' }, { id: 2, chCode: 'CH-3' }],
    });
    const r = preMergeCheck({ prNumber: 7, headSha: head, run: run(work) });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/does not merge cleanly.*bridge-contracts\.json/);
  });

  it('passes a PR that merges cleanly into the current main', () => {
    const rows = [{ id: 1, chCode: 'CH-1' }];
    const { work, head } = setup({ mainRows: [...rows, { id: 2, chCode: 'CH-2' }], prRows: rows });
    expect(preMergeCheck({ prNumber: 7, headSha: head, run: run(work) })).toMatchObject({ ok: true, problems: [] });
  });
});

describe('acquireLandLock', () => {
  it('one landing at a time; released, the next one takes it', () => {
    const dir = join(temp('lock'), 'pr-land.lock');
    const first = acquireLandLock(dir, { pid: 111, isAlive: () => true });
    expect(first.ok).toBe(true);
    const second = acquireLandLock(dir, { pid: 222, isAlive: () => true });
    expect(second.ok).toBe(false);
    expect(second.holder.pid).toBe(111);
    first.release();
    expect(existsSync(dir)).toBe(false);
    expect(acquireLandLock(dir, { pid: 222, isAlive: () => true }).ok).toBe(true);
  });

  it('takes over a lock whose pid is gone, or that is older than the stale limit', () => {
    const dir = join(temp('lock'), 'pr-land.lock');
    const now = Date.parse('2026-10-22T10:00:00Z');
    expect(acquireLandLock(dir, { pid: 111, now, isAlive: () => true }).ok).toBe(true);
    expect(acquireLandLock(dir, { pid: 222, now: now + 1000, isAlive: () => false }).ok).toBe(true);
    expect(acquireLandLock(dir, { pid: 333, now: now + 2000, isAlive: () => true }).ok).toBe(false);
    expect(acquireLandLock(dir, { pid: 333, now: now + 31 * 60 * 1000, isAlive: () => true }).ok).toBe(true);
  });
});
