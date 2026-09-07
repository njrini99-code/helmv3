// Fixture-stdin tests for .claude/hooks/save-session-state.mjs and
// .claude/hooks/restore-session-state.mjs, against a real disposable git
// fixture (not the real repo). State is written to a per-session file under
// the OS scratch directory, keyed by a random session_id per test so runs
// never collide with each other or with a real session's snapshot.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { scratchStatePath, tailStateFile } from '../../../.claude/hooks/save-session-state.mjs';
import { renderContext } from '../../../.claude/hooks/restore-session-state.mjs';
import { sessionStatePath } from '../../../.claude/hooks/lib/session-state.mjs';

const SAVE_HOOK = resolve(process.cwd(), '.claude/hooks/save-session-state.mjs');
const RESTORE_HOOK = resolve(process.cwd(), '.claude/hooks/restore-session-state.mjs');

let repo;
let sessionId;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'helm-session-state-'));
  sessionId = `test-${randomUUID()}`;
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  writeFileSync(join(repo, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(scratchStatePath(sessionId), { force: true });
});

function runSave(cwd, session = sessionId) {
  return execFileSync('node', [SAVE_HOOK], {
    input: JSON.stringify({ cwd, session_id: session }),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runRestore(session = sessionId) {
  return execFileSync('node', [RESTORE_HOOK], {
    input: JSON.stringify({ session_id: session }),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('tailStateFile', () => {
  it('returns [] when no STATE file exists for this session', () => {
    expect(tailStateFile(repo, sessionId)).toEqual([]);
  });

  it('returns the last n non-empty lines', () => {
    const path = sessionStatePath(repo, sessionId);
    mkdirSync(join(repo, '.claude/session-state'), { recursive: true });
    const lines = Array.from({ length: 25 }, (_, i) => JSON.stringify({ n: i }));
    writeFileSync(path, `${lines.join('\n')}\n`);
    const tail = tailStateFile(repo, sessionId, 20);
    expect(tail).toHaveLength(20);
    expect(tail[0]).toBe(lines[5]);
    expect(tail[19]).toBe(lines[24]);
  });
});

describe('save-session-state', () => {
  it('writes a per-session scratch file with branch, dirty count, and PR-number note', () => {
    writeFileSync(join(repo, 'dirty.txt'), 'x');
    runSave(repo);
    const statePath = scratchStatePath(sessionId);
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.worktree).toBe(repo);
    expect(state.dirtyFileCount).toBe(1);
    expect(typeof state.branch).toBe('string');
    expect(state.sessionId).toBe(sessionId);
    expect(state.openPrNumbersByAuthor).toBeNull();
    expect(state.openPrNumbersByAuthorNote).toMatch(/network/i);
  });

  it('includes the STATE file tail when one exists', () => {
    const path = sessionStatePath(repo, sessionId);
    mkdirSync(join(repo, '.claude/session-state'), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ type: 'touch', path: 'x.ts' })}\n`);
    runSave(repo);
    const state = JSON.parse(readFileSync(scratchStatePath(sessionId), 'utf-8'));
    expect(state.stateFileTail).toHaveLength(1);
  });

  it('different sessions get different scratch files', () => {
    const otherSession = `test-${randomUUID()}`;
    runSave(repo, sessionId);
    runSave(repo, otherSession);
    expect(scratchStatePath(sessionId)).not.toBe(scratchStatePath(otherSession));
    expect(existsSync(scratchStatePath(sessionId))).toBe(true);
    expect(existsSync(scratchStatePath(otherSession))).toBe(true);
    rmSync(scratchStatePath(otherSession), { force: true });
  });

  it('never throws on malformed stdin', () => {
    expect(() =>
      execFileSync('node', [SAVE_HOOK], { input: 'not json', encoding: 'utf-8' }),
    ).not.toThrow();
  });
});

describe('restore-session-state', () => {
  it('renderContext produces a line naming branch/worktree/dirty count', () => {
    const line = renderContext({
      savedAt: '2026-09-06T00:00:00.000Z',
      branch: 'agent/config-hardening',
      worktree: '/tmp/x',
      dirtyFileCount: 3,
      openPrNumbersByAuthor: null,
      stateFileTail: ['a', 'b'],
    });
    expect(line).toMatch(/agent\/config-hardening/);
    expect(line).toMatch(/dirty=3/);
    expect(line).toMatch(/stateTail=2/);
  });

  it('prints additionalContext under hookEventName SessionStart when a fresh state file exists', () => {
    runSave(repo);
    const stdout = runRestore();
    expect(stdout).toMatch(/"hookEventName":"SessionStart"/);
    expect(stdout).toMatch(/additionalContext/);
  });

  it('is silent when no state file exists for this session_id', () => {
    const stdout = runRestore(`test-${randomUUID()}`);
    expect(stdout).toBe('');
  });

  it('is silent when the state file is older than 24h', () => {
    runSave(repo);
    const statePath = scratchStatePath(sessionId);
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(statePath, old, old);
    const stdout = runRestore();
    expect(stdout).toBe('');
  });

  it('never throws on malformed stdin', () => {
    expect(() =>
      execFileSync('node', [RESTORE_HOOK], { input: 'not json', encoding: 'utf-8' }),
    ).not.toThrow();
  });
});
