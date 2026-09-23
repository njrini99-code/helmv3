// Direct tests of the retired hook; active configuration must leave it disabled.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const HOOK = resolve(REPO, '.claude/hooks/guard-canonical-write.mjs');
const SETTINGS = resolve(REPO, '.claude/settings.json');

// A REAL canonical checkout + linked worktree, built here.
//
// An earlier version of this file hardcoded the author's machine path as
// "canonical". It passed locally and failed all four path assertions in CI,
// because on a CI runner that path does not exist AND the checkout itself IS
// the canonical one — so both directions inverted. That is the same defect
// this whole program is about: an assertion trusted what a path resolved to
// without checking. Build the topology instead of assuming it.
let tmp: string;
let canonical: string;
let worktree: string;

function git(args: string[], cwd: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-boundary-')));
  canonical = join(tmp, 'helmv3');
  worktree = join(tmp, 'worktrees', 'task-one');
  mkdirSync(join(canonical, 'src'), { recursive: true });

  git(['init', '-q', '-b', 'main'], canonical);
  git(['config', 'user.email', 'test@example.com'], canonical);
  git(['config', 'user.name', 'Test'], canonical);
  writeFileSync(join(canonical, 'src/app.ts'), 'export const x = 1;\n');
  git(['add', '-A'], canonical);
  git(['commit', '-qm', 'initial'], canonical);

  mkdirSync(join(tmp, 'worktrees'), { recursive: true });
  git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/task-one', worktree], canonical);
});

afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/** Run the hook with a raw payload; 2 = BLOCK, anything else = ALLOW. */
function runHook(payload: Record<string, unknown>): 'BLOCK' | 'ALLOW' {
  try {
    execFileSync('node', [HOOK], {
      input: JSON.stringify(payload),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 'ALLOW';
  } catch (err) {
    return (err as { status?: number }).status === 2 ? 'BLOCK' : 'ALLOW';
  }
}

describe('retired canonical-write hook — direct invocation', () => {
  it.each(['Write', 'Edit', 'MultiEdit'])(
    'BLOCKS %s targeting a path inside the canonical checkout',
    (tool) => {
      expect(
        runHook({
          tool_name: tool,
          cwd: canonical,
          tool_input: { file_path: `${canonical}/src/anything.ts` },
        }),
      ).toBe('BLOCK');
    },
  );

  it('ALLOWS the same tools inside a task worktree', () => {
    expect(
      runHook({
        tool_name: 'Write',
        cwd: worktree,
        tool_input: { file_path: `${worktree}/src/anything.ts` },
      }),
    ).toBe('ALLOW');
  });
});

describe('retired canonical-write hook — scope and retirement', () => {
  it('documents the Bash gap: a realistic Bash payload is not blocked', () => {
    // A Bash payload carries `command`, not `file_path`. The hook exits 0 on a
    // missing file_path, so even if it were invoked it would allow the write.
    expect(
      runHook({
        tool_name: 'Bash',
        cwd: canonical,
        tool_input: { command: `echo x > ${canonical}/src/anything.ts` },
      }),
    ).toBe('ALLOW');
  });

  it('is not configured for any hook event or tool', () => {
    const settings = JSON.parse(readFileSync(SETTINGS, 'utf-8')) as {
      hooks?: Record<string, unknown>;
    };
    expect(JSON.stringify(settings.hooks ?? {})).not.toContain('guard-canonical-write');
  });
});
