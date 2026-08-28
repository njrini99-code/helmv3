// What the canonical-write boundary ACTUALLY enforces.
//
// These assertions deliberately pin a gap as well as a guarantee. That is not
// resignation — it is the point. The invariant "the canonical checkout is
// agent-read-only" was stated as though universal while a normal route ran
// straight through it, and nothing in the repo could tell you that. A test
// that encodes the real shape makes the limit visible and makes any future
// widening a deliberate, reviewed change rather than a quiet one.
//
// If someone later closes the Bash route structurally (a path-based sandbox
// write policy), the `documents the Bash gap` case below will start failing —
// and that failure is the signal to update the docs, not to delete the test.

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

describe('canonical-write boundary — what IS enforced', () => {
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

describe('canonical-write boundary — what is NOT enforced', () => {
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

  it('the hook is not even ROUTED for Bash — the matcher excludes it', () => {
    // The more fundamental of the two reasons. Fixing the payload shape alone
    // would change nothing while the matcher stays tool-scoped.
    const settings = JSON.parse(readFileSync(SETTINGS, 'utf-8')) as {
      hooks?: { PreToolUse?: { matcher?: string; hooks?: { command?: string }[] }[] };
    };
    const entry = settings.hooks?.PreToolUse?.find((e) =>
      e.hooks?.some((h) => h.command?.includes('guard-canonical-write')),
    );
    expect(entry).toBeDefined();
    const matcher = entry?.matcher ?? '';
    expect(new RegExp(`^(?:${matcher})$`).test('Write')).toBe(true);
    expect(new RegExp(`^(?:${matcher})$`).test('Bash')).toBe(false);
  });
});

describe('canonical-write boundary — the docs must match the mechanism', () => {
  it('the guard names its own scope rather than claiming to be universal', () => {
    const src = readFileSync(HOOK, 'utf-8');
    // It must say what it does NOT cover. A guard that only advertises its
    // guarantee is how "agent-read-only" came to be believed.
    expect(src).toMatch(/NOT BLOCKED by anything/);
    expect(src).toMatch(/Write \/ Edit \/ MultiEdit/);
  });

  it('shipping.md states the boundary as a table, not as an absolute', () => {
    const rules = readFileSync(
      resolve(REPO, '.claude/rules/shipping.md'),
      'utf-8',
    );
    expect(rules).toMatch(/canonical checkout boundary/i);
    expect(rules).toMatch(/Do not close this with a Bash command parser/);
  });
});
