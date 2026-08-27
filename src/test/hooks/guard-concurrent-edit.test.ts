import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * `.claude/hooks/guard-concurrent-edit.mjs` — one live session per file.
 *
 * WHY THIS HOOK EXISTS
 * --------------------
 * Measured 2026-08-26 against this checkout's own session ledger: 13 sessions
 * active in 24 hours, and FIFTEEN files being edited by more than one of them —
 * including `memory/registry.yml` (the semantic router every agent uses to
 * orient itself) and six `memory/features/*.md` canonical current-state docs,
 * plus `src/app/golf/actions/insights.ts` and `src/lib/notifications/push.ts`.
 *
 * That is the mechanism behind "the agents keep getting confused": session A
 * reads a feature doc, session B rewrites it mid-task, A acts on the stale
 * reading and overwrites B. Neither ever sees an error. AGENTS.md already
 * required per-session worktrees; nothing enforced it, so it did not happen.
 *
 * WHY THE TEST ASSERTS BOTH DIRECTIONS
 * ------------------------------------
 * `guard-bash-worktree.test.ts` records the same lesson twice: a guard that
 * cannot fire is worse than no guard, because it is believed. And a guard that
 * fires on everything gets switched off. So every ALLOW case here is as
 * load-bearing as the BLOCK case — especially "fail open", since this hook sits
 * in front of every Write and Edit in the repo.
 */

const REPO = resolve(__dirname, '../../..');
const HOOK = resolve(REPO, '.claude/hooks/guard-concurrent-edit.mjs');

let dir: string;

/** Exit 2 = blocked; anything else = allowed. Never exit 1. */
function runGuard(
  relFile: string,
  sessionId: string,
  env: Record<string, string> = {},
): 'BLOCK' | 'ALLOW' {
  try {
    execFileSync('node', [HOOK], {
      input: JSON.stringify({
        session_id: sessionId,
        tool_name: 'Edit',
        tool_input: { file_path: join(dir, relFile) },
      }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 'ALLOW';
  } catch (err) {
    return (err as { status?: number }).status === 2 ? 'BLOCK' : 'ALLOW';
  }
}

function ledger(id: string, lines: object[], staleMs = 0) {
  const p = join(dir, '.claude/session-state', `${id}.jsonl`);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  if (staleMs) {
    const when = (Date.now() - staleMs) / 1000;
    utimesSync(p, when, when);
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'helm-concurrent-'));
  mkdirSync(join(dir, '.claude/session-state'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });

  const now = new Date().toISOString();
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  ledger('aaaaaaaa-other', [
    { schema: 1, ts: now, type: 'session_start', session_id: 'aaaaaaaa-other' },
    { schema: 1, ts: now, type: 'touch', path: 'src/shared.ts', feature_ids: [] },
  ]);

  // Touched long ago AND its ledger has not been written in days: finished.
  ledger(
    'bbbbbbbb-stale',
    [{ schema: 1, ts: threeHoursAgo, type: 'touch', path: 'src/stale.ts', feature_ids: [] }],
    6 * 24 * 60 * 60 * 1000,
  );

  ledger('cccccccc-me', [
    { schema: 1, ts: now, type: 'touch', path: 'src/shared.ts', feature_ids: [] },
    { schema: 1, ts: now, type: 'touch', path: 'src/only-mine.ts', feature_ids: [] },
  ]);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('guard-concurrent-edit — collision with a live session', () => {
  it('BLOCKS a file another live session touched moments ago', () => {
    expect(runGuard('src/shared.ts', 'cccccccc-me')).toBe('BLOCK');
  });

  it('names the other session in the refusal', () => {
    try {
      execFileSync('node', [HOOK], {
        input: JSON.stringify({
          session_id: 'cccccccc-me',
          tool_name: 'Edit',
          tool_input: { file_path: join(dir, 'src/shared.ts') },
        }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      throw new Error('expected the guard to block');
    } catch (err) {
      const stderr = String((err as { stderr?: string }).stderr ?? '');
      // The whole point is telling the user WHO to coordinate with.
      expect(stderr).toContain('aaaaaaaa');
      expect(stderr).toContain('src/shared.ts');
    }
  });
});

describe('guard-concurrent-edit — must not block ordinary work', () => {
  it('ALLOWS a file only this session has touched', () => {
    expect(runGuard('src/only-mine.ts', 'cccccccc-me')).toBe('ALLOW');
  });

  it('ALLOWS a file whose only toucher is a finished session', () => {
    expect(runGuard('src/stale.ts', 'cccccccc-me')).toBe('ALLOW');
  });

  it('ALLOWS a file nobody has touched', () => {
    expect(runGuard('src/untouched.ts', 'cccccccc-me')).toBe('ALLOW');
  });

  it('ALLOWS a deliberate takeover via HELM_ALLOW_CONCURRENT_EDIT', () => {
    expect(runGuard('src/shared.ts', 'cccccccc-me', { HELM_ALLOW_CONCURRENT_EDIT: '1' })).toBe(
      'ALLOW',
    );
  });
});

describe('guard-concurrent-edit — fails open on anything unexpected', () => {
  // This hook runs before EVERY Write/Edit. If it cannot read its own evidence
  // it must get out of the way, not wall the user out of their repo.
  it('ALLOWS when stdin is not JSON', () => {
    try {
      execFileSync('node', [HOOK], {
        input: 'not json',
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      expect((err as { status?: number }).status).not.toBe(2);
    }
  });

  it('ALLOWS when the payload carries no file_path', () => {
    expect(runGuard('', 'cccccccc-me')).toBe('ALLOW');
  });

  it('ALLOWS a path outside the repo', () => {
    try {
      execFileSync('node', [HOOK], {
        input: JSON.stringify({
          session_id: 'cccccccc-me',
          tool_name: 'Edit',
          tool_input: { file_path: '/etc/hosts' },
        }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      expect((err as { status?: number }).status).not.toBe(2);
    }
  });
});
