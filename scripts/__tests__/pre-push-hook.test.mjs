// Focused fixture tests for .githooks/pre-push. Each test invokes the real
// hook in a disposable repository and feeds Git's pre-push stdin contract.
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

const HOOK = resolve(process.cwd(), '.githooks/pre-push');
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
  const dir = mkdtempSync(join(tmpdir(), 'pre-push-hook-'));
  tempDirs.push(dir);
  git(['init', '--quiet'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  writeFileSync(join(dir, 'README.md'), '# Fixture\n');
  git(['add', '.'], dir);
  git(['commit', '--quiet', '-m', 'base'], dir);
  return { dir, base: git(['rev-parse', 'HEAD'], dir) };
}

function runHook({ cwd, localSha, remoteSha, env = {} }) {
  const stdin = `refs/heads/test ${localSha} refs/heads/test ${remoteSha}\n`;
  try {
    const output = execFileSync('bash', [HOOK], {
      cwd,
      input: stdin,
      encoding: 'utf-8',
      env: { ...process.env, ...env },
    });
    return { status: 0, output };
  } catch (error) {
    return {
      status: error.status ?? 1,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

describe('.githooks/pre-push', () => {
  it('skips local checks when HELM_SKIP_PREPUSH=1', () => {
    const { dir, base } = makeFixture();
    const result = runHook({
      cwd: dir,
      localSha: base,
      remoteSha: base,
      env: { HELM_SKIP_PREPUSH: '1' },
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('HELM_SKIP_PREPUSH=1');
    expect(result.output).toContain('CI still runs');
  });

  it('passes a clean pushed range without running project-wide checks', () => {
    const { dir, base } = makeFixture();
    writeFileSync(join(dir, 'README.md'), '# Fixture\n\nA clean change.\n');
    git(['add', '.'], dir);
    git(['commit', '--quiet', '-m', 'clean change'], dir);
    const head = git(['rev-parse', 'HEAD'], dir);
    const result = runHook({ cwd: dir, localSha: head, remoteSha: base });

    expect(result.status).toBe(0);
    expect(result.output).toContain(`git diff --check OK (${base}..${head})`);
    expect(result.output).not.toContain('typecheck');
    expect(result.output).not.toContain('Review Gate');
  });

  it('blocks a pushed range containing trailing whitespace', () => {
    const { dir, base } = makeFixture();
    writeFileSync(join(dir, 'README.md'), '# Fixture  \n');
    git(['add', '.'], dir);
    git(['commit', '--quiet', '-m', 'whitespace error'], dir);
    const head = git(['rev-parse', 'HEAD'], dir);
    const result = runHook({ cwd: dir, localSha: head, remoteSha: base });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain(`git diff --check FAILED (${base}..${head})`);
    expect(result.output).toContain('trailing whitespace');
  });

  it('runs gitleaks against each pushed commit range when available', () => {
    const { dir, base } = makeFixture();
    writeFileSync(join(dir, 'README.md'), '# Fixture\n\nA change.\n');
    git(['add', '.'], dir);
    git(['commit', '--quiet', '-m', 'scan change'], dir);
    const head = git(['rev-parse', 'HEAD'], dir);

    const binDir = join(dir, 'bin');
    const logPath = join(dir, 'gitleaks-args.log');
    mkdirSync(binDir);
    const fakeGitleaks = join(binDir, 'gitleaks');
    writeFileSync(
      fakeGitleaks,
      '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$GITLEAKS_ARGS_LOG"\n'
    );
    chmodSync(fakeGitleaks, 0o755);
    const result = runHook({
      cwd: dir,
      localSha: head,
      remoteSha: base,
      env: {
        PATH: `${binDir}:${process.env.PATH}`,
        GITLEAKS_ARGS_LOG: logPath,
      },
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain(`gitleaks OK (${base}..${head})`);
    const args = readFileSync(logPath, 'utf-8');
    expect(args).toContain('git\n');
    expect(args).toContain('--redact\n');
    expect(args).toContain(`--log-opts=${base}..${head}\n`);
  });
});
