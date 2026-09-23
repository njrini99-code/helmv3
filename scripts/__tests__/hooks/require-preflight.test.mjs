// Tests for .claude/hooks/require-preflight.mjs — the Claude-session guard
// that refuses a push / non-draft PR / `gh pr ready` without a green
// preflight stamp for the exact tree being published.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { evaluate, publishIntent } from '../../../.claude/hooks/require-preflight.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/require-preflight.mjs');
const STAMP_LIB = resolve(process.cwd(), 'scripts/lib/preflight-stamp.mjs');
const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function fixture({ branch = 'agent/x', withPreflight = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'require-preflight-'));
  dirs.push(dir);
  git(['init', '--quiet', '-b', 'main'], dir);
  git(['config', 'user.email', 't@example.com'], dir);
  git(['config', 'user.name', 'T'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  writeFileSync(join(dir, '.gitignore'), '.helm/\n');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  if (withPreflight) {
    mkdirSync(join(dir, 'scripts/lib'), { recursive: true });
    writeFileSync(join(dir, 'scripts/preflight.mjs'), '// fixture\n');
    copyFileSync(STAMP_LIB, join(dir, 'scripts/lib/preflight-stamp.mjs'));
  }
  git(['add', '.'], dir);
  git(['commit', '--quiet', '-m', 'base'], dir);
  if (branch !== 'main') git(['checkout', '--quiet', '-b', branch], dir);
  return dir;
}

function stamp(dir, tree = git(['rev-parse', 'HEAD^{tree}'], dir)) {
  mkdirSync(join(dir, '.helm/runtime'), { recursive: true });
  writeFileSync(join(dir, '.helm/runtime/preflight.json'), JSON.stringify({ treeHash: tree, headSha: 'x', mode: 'fast' }));
}

const bash = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });

describe('publishIntent', () => {
  it('recognises pushes, non-draft PR creation and gh pr ready', () => {
    expect(publishIntent('git push -u origin agent/x')).toMatchObject({ action: 'git push', rev: 'agent/x' });
    expect(publishIntent('git push')).toMatchObject({ action: 'git push', rev: 'HEAD' });
    expect(publishIntent('gh pr create --title "t" --body "b"')).toMatchObject({ action: 'gh pr create (not --draft)' });
    expect(publishIntent('gh pr ready 12')).toMatchObject({ action: 'gh pr ready' });
    expect(publishIntent('cd /tmp/w && git push origin HEAD')).toMatchObject({ dir: '/tmp/w', rev: 'HEAD' });
    expect(publishIntent('git -C /tmp/w push origin agent/x')).toMatchObject({ dir: '/tmp/w' });
  });

  it('ignores drafts, deletions, tags, dry runs, main and prose', () => {
    expect(publishIntent('gh pr create --draft --title "t"')).toBeNull();
    expect(publishIntent('gh pr ready 12 --undo')).toBeNull();
    expect(publishIntent('git push origin --delete agent/x')).toBeNull();
    expect(publishIntent('git push origin :agent/x')).toBeNull();
    expect(publishIntent('git push origin refs/tags/v1')).toBeNull();
    expect(publishIntent('git push --dry-run origin agent/x')).toBeNull();
    expect(publishIntent('git push origin main')).toBeNull();
    expect(publishIntent('echo "remember to git push"')).toBeNull();
    expect(publishIntent('git commit -m "then gh pr ready"')).toBeNull();
  });
});

describe('evaluate', () => {
  it('blocks a push without a stamp and allows it once the stamp matches the tree', async () => {
    const dir = fixture();
    const reason = await evaluate(bash('git push -u origin agent/x', dir), {});
    expect(reason).toMatch(/npm run preflight/);
    expect(reason).toMatch(/--draft/);
    stamp(dir);
    expect(await evaluate(bash('git push -u origin agent/x', dir), {})).toBeNull();
  });

  it('blocks again after the tree changes', async () => {
    const dir = fixture();
    stamp(dir);
    writeFileSync(join(dir, 'a.txt'), 'two\n');
    git(['commit', '--quiet', '-am', 'change'], dir);
    expect(await evaluate(bash('gh pr ready 5', dir), {})).toMatch(/different tree/);
  });

  it('does not apply to main, to repos without preflight, or with the owner override', async () => {
    const onMain = fixture({ branch: 'main' });
    expect(await evaluate(bash('git push', onMain), {})).toBeNull();
    const old = fixture({ withPreflight: false });
    expect(await evaluate(bash('git push origin agent/x', old), {})).toBeNull();
    const dir = fixture();
    expect(await evaluate(bash('git push origin agent/x', dir), { HELM_PREFLIGHT_OVERRIDE: '1' })).toBeNull();
  });

  it('exits 2 with the reason when run as a hook', () => {
    const dir = fixture();
    let status = 0;
    let stderr = '';
    try {
      execFileSync('node', [HOOK], { input: JSON.stringify(bash('gh pr create --title t', dir)), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HELM_PREFLIGHT_OVERRIDE: '' } });
    } catch (err) {
      status = err.status;
      stderr = String(err.stderr);
    }
    expect(status).toBe(2);
    expect(stderr).toMatch(/BLOCKED by require-preflight/);
  });
});
