import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';

test('detector shallow PR checkout retains both diff trees without repository history', () => {
  const workflow = load(readFileSync('.github/workflows/detect-changes.yml', 'utf8'));
  const checkout = workflow.jobs.detect.steps.find((step) => step.name === 'Checkout');
  const depth = checkout.with['fetch-depth'];
  assert.equal(depth, 2);
  const root = mkdtempSync(join(tmpdir(), 'helm-detect-checkout-'));
  const source = join(root, 'source');
  const clone = join(root, 'clone');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git(root, 'init', '-b', 'main', source);
    git(source, 'config', 'user.name', 'Checkout test');
    git(source, 'config', 'user.email', 'checkout-test@example.invalid');
    for (let i = 0; i < 8; i++) {
      writeFileSync(join(source, 'history.txt'), String(i));
      git(source, 'add', 'history.txt');
      git(source, 'commit', '-m', `History ${i}`);
    }
    const base = git(source, 'rev-parse', 'HEAD');
    git(source, 'checkout', '-b', 'pr');
    writeFileSync(join(source, 'popup.txt'), 'PR change');
    git(source, 'add', 'popup.txt');
    git(source, 'commit', '-m', 'Popup fix');
    const head = git(source, 'rev-parse', 'HEAD');
    git(source, 'checkout', '-b', 'merge-ref', base);
    git(source, 'merge', '--no-ff', 'pr', '-m', 'PR merge');
    const expected = git(source, 'diff', '--name-only', '--diff-filter=ACMRT', base, head);
    git(root, 'clone', '--depth', String(depth), '--single-branch', '--branch', 'merge-ref', pathToFileURL(source).href, clone);
    assert.equal(git(clone, 'rev-parse', '--is-shallow-repository'), 'true');
    assert.equal(git(clone, 'diff', '--name-only', '--diff-filter=ACMRT', base, head), expected);
    assert.equal(expected, 'popup.txt');
    assert.ok(Number(git(clone, 'rev-list', '--count', 'HEAD')) < Number(git(source, 'rev-list', '--count', 'HEAD')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
