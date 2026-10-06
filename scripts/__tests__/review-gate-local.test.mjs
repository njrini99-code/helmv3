// Outcome contract for scripts/review-gate-local.mjs (`npm run gates:review`).
//
// A step whose tool is not installed is SKIPPED. Before 2026-10-06 the script
// still printed "Review Gate would be green." and exited 0 in that case, so a
// laptop missing half the scanners reported a CI-equivalent pass it had not
// earned. These tests pin the INCOMPLETE outcome: skipped steps are named, the
// run says it is NOT CI-equivalent, and it exits 2 unless --allow-missing.
//
// Each test runs the real script from the repo root with PATH narrowed to a
// temp dir holding only the binaries it needs (git, sh, bash, grep), so which
// scanners count as "installed" is decided by the test, not by the machine.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const SCRIPT = join(repoRoot, 'scripts/review-gate-local.mjs');
const NEEDED = ['git', 'sh', 'bash', 'grep'];

let binDir;

beforeAll(() => {
  binDir = mkdtempSync(join(tmpdir(), 'review-gate-local-bin-'));
  for (const tool of NEEDED) {
    const found = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
    if (!found) throw new Error(`test needs ${tool} on PATH`);
    symlinkSync(found, join(binDir, tool));
  }
});

afterAll(() => {
  if (binDir) rmSync(binDir, { recursive: true, force: true });
});

function run(args, extraBins = {}) {
  for (const [name, body] of Object.entries(extraBins)) {
    const p = join(binDir, name);
    writeFileSync(p, body);
    chmodSync(p, 0o755);
  }
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, PATH: binDir },
  });
  for (const name of Object.keys(extraBins)) rmSync(join(binDir, name), { force: true });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('review-gate-local outcomes', () => {
  it('exits 2 and reports INCOMPLETE when a scanner is missing', () => {
    const { status, out } = run(['--only', 'ruff']);
    expect(out).toMatch(/SKIPPED\s+ruff/);
    expect(out).toContain('INCOMPLETE');
    expect(out).toMatch(/skipped because the tool is missing: ruff\./);
    expect(out).toContain('NOT CI-equivalent');
    expect(out).not.toContain('Review Gate would be green.');
    expect(status).toBe(2);
  });

  it('exits 0 with --allow-missing but still names the skipped scanners', () => {
    const { status, out } = run(['--only', 'ruff', '--allow-missing']);
    expect(out).toContain('INCOMPLETE');
    expect(out).toMatch(/tool is missing: ruff\./);
    expect(out).toContain('--allow-missing given');
    expect(out).not.toContain('Review Gate would be green.');
    expect(status).toBe(0);
  });

  it('reports green and exits 0 only when nothing was skipped or failed', () => {
    const { status, out } = run(['--only', 'no-such-step']);
    expect(out).toContain('Review Gate would be green.');
    expect(out).not.toContain('INCOMPLETE');
    expect(status).toBe(0);
  });

  it('mirrors the workflow hadolint step with a local hadolint (override still matches)', () => {
    const { status, out } = run(['--only', 'hadolint'], {
      hadolint: '#!/bin/sh\necho "Haskell Dockerfile Linter (test stub)"\n',
    });
    expect(out).not.toContain('changed shape');
    expect(out).toMatch(/ok\s+hadolint/);
    expect(status).toBe(0);
  });
});
