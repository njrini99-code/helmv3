// Focused fixture tests for .githooks/pre-commit. The real hook runs in a
// disposable repository, so no files or index entries in the working tree are
// changed.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), '.githooks/pre-commit');
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pre-commit-hook-'));
  tempDirs.push(dir);
  git(['init', '--quiet'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  git(['commit', '--quiet', '--allow-empty', '-m', 'base'], dir);

  const binDir = join(dir, 'bin');
  const argsLog = join(dir, 'gitleaks-args.log');
  mkdirSync(binDir);
  const fakeGitleaks = join(binDir, 'gitleaks');
  writeFileSync(
    fakeGitleaks,
    '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$GITLEAKS_ARGS_LOG"\n'
  );
  chmodSync(fakeGitleaks, 0o755);
  return { dir, binDir, argsLog };
}

function runHook({ dir, binDir, argsLog }) {
  try {
    const output = execFileSync('bash', [HOOK], {
      cwd: dir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        GITLEAKS_ARGS_LOG: argsLog,
      },
    });
    return { status: 0, output };
  } catch (error) {
    return {
      status: error.status ?? 1,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

describe('.githooks/pre-commit', () => {
  it('scans staged content redacted and only reminds on migrations', () => {
    const fixture = makeFixture();
    writeFileSync(join(fixture.dir, '.gitleaks.toml'), '[extend]\nuseDefault = true\n');
    // Use the real migration path, which is the hook's contract.
    mkdirSync(join(fixture.dir, 'supabase', 'migrations'), { recursive: true });
    writeFileSync(join(fixture.dir, 'supabase', 'migrations', '001_test.sql'), 'select 1;\n');
    git(['add', '.gitleaks.toml', 'supabase/migrations/001_test.sql'], fixture.dir);

    const result = runHook(fixture);

    expect(result.status).toBe(0);
    expect(result.output).toContain('migration staged');
    expect(result.output).toContain("run 'npm run db:types' explicitly");
    expect(result.output).not.toContain('regenerat');
    expect(git(['diff', '--cached', '--name-only'], fixture.dir)).toBe(
      '.gitleaks.toml\nsupabase/migrations/001_test.sql'
    );
    const args = readFileSync(fixture.argsLog, 'utf-8');
    expect(args).toContain('protect\n');
    expect(args).toContain('--staged\n');
    expect(args).toContain('--redact\n');
    expect(args).toContain('--config\n');
  });
});
