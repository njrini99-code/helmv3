// The queue cap in scripts/serialize.mjs: a gate that cannot get a slot within
// HELM_GATE_MAX_WAIT_MS exits 75 with a retry command instead of blocking or
// running anyway. Exercised against the real script and a throwaway lock dir.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error -- plain .mjs module, scripts/ is outside tsconfig.
import { DEFAULT_MAX_WAIT_MS, QUEUED_EXIT_CODE, queuedMessage } from '../serialize.mjs';

const SCRIPT = resolve(__dirname, '..', 'serialize.mjs');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'helm-gates-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A lock file naming a live pid (this test process), as a running gate would write. */
function holdSlot(name: string) {
  writeFileSync(join(dir, `${name}.lock`), `${process.pid}\nsome gate\n${process.cwd()}\n`);
}

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [SCRIPT, '--', ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HELM_GATE_DIR: dir,
      HELM_GATE_LEDGER: join(dir, 'ledger.jsonl'),
      HELM_GATE_POLL_MS: '20',
      ...env,
    },
  });
}

describe('serialize queue cap', () => {
  it('defaults the wait cap to 8 minutes', () => {
    expect(DEFAULT_MAX_WAIT_MS).toBe(8 * 60 * 1000);
    expect(QUEUED_EXIT_CODE).toBe(75);
  });

  it('exits 75 with a retry command when every slot is held past the cap', () => {
    holdSlot('a');
    holdSlot('b');
    const r = run(['echo', 'hello world'], { HELM_GATE_SLOTS: '2', HELM_GATE_MAX_WAIT_MS: '150' });
    expect(r.status).toBe(75);
    expect(r.stdout).not.toContain('hello'); // the wrapped command never ran
    expect(r.stderr).toContain('queued');
    expect(r.stderr).toContain("retry with: echo 'hello world'");
  });

  it('runs the command and passes its exit code through when a slot is free', () => {
    holdSlot('a');
    const ok = run(['node', '-e', 'process.exit(0)'], { HELM_GATE_SLOTS: '2', HELM_GATE_MAX_WAIT_MS: '150' });
    expect(ok.status).toBe(0);
    const bad = run(['node', '-e', 'process.exit(3)'], { HELM_GATE_SLOTS: '2', HELM_GATE_MAX_WAIT_MS: '150' });
    expect(bad.status).toBe(3);
  });

  it('keeps a failing gate (its own code) distinguishable from being queued', () => {
    const r = run(['node', '-e', 'process.exit(1)'], { HELM_GATE_SLOTS: '2' });
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain('queued');
  });

  it('queuedMessage quotes arguments so the line can be pasted', () => {
    const m = queuedMessage({ holders: 2, slots: 2, waitedMs: 480000, command: ['npm', 'run', 'test:run', '--', '--shard=1/5', "it's"] });
    expect(m).toContain("retry with: npm run test:run -- --shard=1/5 'it'\\''s'");
    expect(m).toContain('8 min');
  });
});
