// Fixture-stdin tests for .claude/hooks/require-gates.mjs, against a real
// disposable git fixture set up as a linked worktree (so workspaceRoots()
// sees `kind: 'task'`, matching a real agent worktree rather than the
// canonical checkout).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  trackedModifiedFiles,
  newestLedgerEntryMs,
} from '../../../.claude/hooks/require-gates.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/require-gates.mjs');

let bare, main, task;

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), 'helm-require-gates-'));
  bare = join(base, 'bare.git');
  main = join(base, 'main');
  task = join(base, 'task');

  execFileSync('git', ['init', '-q', '--bare', bare]);
  execFileSync('git', ['clone', '-q', bare, main]);
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: main });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: main });
  writeFileSync(join(main, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: main });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: main });
  execFileSync('git', ['push', '-q', 'origin', 'HEAD'], { cwd: main });
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'agent/test-task', task], { cwd: main });
});

afterEach(() => {
  rmSync(join(main, '..'), { recursive: true, force: true });
});

function runHook(cwd) {
  return execFileSync('node', [HOOK], {
    input: JSON.stringify({ cwd }),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('trackedModifiedFiles', () => {
  it('is empty on a clean tree', () => {
    expect(trackedModifiedFiles(task)).toEqual([]);
  });

  it('lists a modified tracked file, but not an untracked one', () => {
    writeFileSync(join(task, 'README.md'), '# changed\n');
    writeFileSync(join(task, 'untracked.txt'), 'x');
    const modified = trackedModifiedFiles(task);
    expect(modified).toContain('README.md');
    expect(modified).not.toContain('untracked.txt');
  });
});

describe('newestLedgerEntryMs', () => {
  it('returns null when the ledger does not exist', () => {
    expect(newestLedgerEntryMs(task)).toBeNull();
  });

  it('returns the newest ts across ledger lines', () => {
    mkdirSync(join(task, '.helm/runtime'), { recursive: true });
    const lines = [
      JSON.stringify({ ts: '2026-01-01T00:00:00.000Z' }),
      JSON.stringify({ ts: '2026-06-01T00:00:00.000Z' }),
    ];
    writeFileSync(join(task, '.helm/runtime/gates.jsonl'), `${lines.join('\n')}\n`);
    expect(newestLedgerEntryMs(task)).toBe(Date.parse('2026-06-01T00:00:00.000Z'));
  });

  it('skips a malformed line instead of throwing', () => {
    mkdirSync(join(task, '.helm/runtime'), { recursive: true });
    writeFileSync(
      join(task, '.helm/runtime/gates.jsonl'),
      `not json\n${JSON.stringify({ ts: '2026-06-01T00:00:00.000Z' })}\n`,
    );
    expect(newestLedgerEntryMs(task)).toBe(Date.parse('2026-06-01T00:00:00.000Z'));
  });

  it('reads the epoch-millisecond timestamps the gate serializer records', () => {
    mkdirSync(join(task, '.helm/runtime'), { recursive: true });
    writeFileSync(
      join(task, '.helm/runtime/gates.jsonl'),
      `${JSON.stringify({ ts: 1788927434124 })}\n`,
    );
    expect(newestLedgerEntryMs(task)).toBe(1788927434124);
  });
});

describe('require-gates subprocess contract', () => {
  it('is silent on a clean task worktree', () => {
    const stdout = runHook(task);
    expect(stdout).toBe('');
  });

  it('is silent in the canonical (non-worktree) checkout even with dirty tracked files', () => {
    writeFileSync(join(main, 'README.md'), '# changed in canonical\n');
    const stdout = runHook(main);
    expect(stdout).toBe('');
  });

  it('never blocks (always exits 0) even with dirty files and no ledger', () => {
    writeFileSync(join(task, 'README.md'), '# changed\n');
    expect(() => runHook(task)).not.toThrow();
  });

  it('never emits a turn-blocking JSON decision', () => {
    writeFileSync(join(task, 'README.md'), '# changed\n');
    // stdout is empty by design (the reminder goes to stderr); assert no
    // JSON decision object appears on stdout either way.
    const stdout = execFileSync('node', [HOOK], {
      input: JSON.stringify({ cwd: task }),
      encoding: 'utf-8',
    });
    expect(stdout).not.toMatch(/"decision"\s*:\s*"block"/);
  });

  it('never throws on malformed stdin', () => {
    expect(() =>
      execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf-8' }),
    ).not.toThrow();
  });
});
