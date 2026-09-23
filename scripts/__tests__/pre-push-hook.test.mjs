// Focused fixture tests for .githooks/pre-push. Each test invokes the real
// hook in a disposable repository and feeds Git's pre-push stdin contract.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
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

// A stand-in scripts/preflight.mjs: logs its arguments, fails on
// PREFLIGHT_FAIL=1, otherwise stamps HEAD's tree the way the real one does.
// The real stamp verifier is copied in, so the hook's decision is the real one.
function withFakePreflight(fixture) {
  const { dir } = fixture;
  mkdirSync(join(dir, 'scripts/lib'), { recursive: true });
  copyFileSync(resolve(process.cwd(), 'scripts/lib/preflight-stamp.mjs'), join(dir, 'scripts/lib/preflight-stamp.mjs'));
  writeFileSync(join(dir, 'scripts/preflight.mjs'), [
    "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
    "import { execFileSync } from 'node:child_process';",
    "appendFileSync(process.env.PREFLIGHT_LOG, `ran ${process.argv.slice(2).join(' ')}\\n`);",
    "if (process.env.PREFLIGHT_FAIL === '1') process.exit(1);",
    "const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();",
    "mkdirSync('.helm/runtime', { recursive: true });",
    "writeFileSync('.helm/runtime/preflight.json', JSON.stringify({ treeHash: tree, mode: 'fast' }));",
    '',
  ].join('\n'));
  writeFileSync(join(dir, '.gitignore'), '.helm/\nscripts/\npreflight.log\n');
  return { ...fixture, logPath: join(dir, 'preflight.log') };
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

  it('says so when the branch has no preflight script', () => {
    const { dir, base } = makeFixture();
    const result = runHook({ cwd: dir, localSha: base, remoteSha: base });
    expect(result.status).toBe(0);
    expect(result.output).toContain('preflight skipped');
  });

  it('runs preflight when no stamp covers the pushed tree, then passes', () => {
    const { dir, base, logPath } = withFakePreflight(makeFixture());
    const result = runHook({ cwd: dir, localSha: base, remoteSha: base, env: { PREFLIGHT_LOG: logPath } });
    expect(result.status).toBe(0);
    expect(readFileSync(logPath, 'utf-8')).toBe('ran --fast\n');
    expect(result.output).toContain('preflight OK');
  });

  it('skips preflight when the stamp already matches the pushed tree', () => {
    const { dir, base, logPath } = withFakePreflight(makeFixture());
    const tree = git(['rev-parse', 'HEAD^{tree}'], dir);
    mkdirSync(join(dir, '.helm/runtime'), { recursive: true });
    writeFileSync(join(dir, '.helm/runtime/preflight.json'), JSON.stringify({ treeHash: tree, headSha: base, mode: 'fast' }));
    const result = runHook({ cwd: dir, localSha: base, remoteSha: base, env: { PREFLIGHT_LOG: logPath } });
    expect(result.status).toBe(0);
    expect(result.output).toContain('preflight stamp matches');
    expect(() => readFileSync(logPath, 'utf-8')).toThrow();
  });

  it('aborts the push when preflight fails', () => {
    const { dir, base, logPath } = withFakePreflight(makeFixture());
    const result = runHook({ cwd: dir, localSha: base, remoteSha: base, env: { PREFLIGHT_LOG: logPath, PREFLIGHT_FAIL: '1' } });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('preflight FAILED');
    expect(result.output).toContain('push aborted');
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
