// SessionStart's release line must say WHERE its answer came from.
//
// On 2026-09-01 the canonical marker read 53ae81a4c while production served
// fb425aa2b, because deploy-prod.sh had written the marker into the worktree
// it deployed from and the hook read the canonical copy. Every session opened
// with "16 unreleased commits" against a real figure of 1, and nothing in the
// text distinguished a verified number from a stale file. These fixtures pin:
//
//   - a live probe (a stub release-status.mjs in the fixture) is preferred,
//     is labelled "verified live", and refreshes the marker in BOTH checkouts
//   - with the probe skipped, the marker is read from the CANONICAL root even
//     when the hook runs in a linked worktree, and the line says "MARKER" and
//     carries the marker's date
//   - a legacy one-field marker still works, dated from its mtime
//   - no marker + no probe -> UNKNOWN, never a number
//
// Real bare origin + real clones, no machine paths, same shape as
// src/test/hooks/session-context-distance.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const HOOK = resolve(REPO, '.claude/hooks/session-context.sh');

function git(args: string[], cwd: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function commit(dir: string, name: string) {
  writeFileSync(join(dir, `${name}.txt`), `${name}\n`);
  git(['add', '-A'], dir);
  git(['commit', '-qm', name], dir);
  return git(['rev-parse', 'HEAD'], dir);
}
function sessionContext(cwd: string, env: Record<string, string> = {}): string {
  return execFileSync('bash', [HOOK], {
    cwd,
    input: '{}',
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

let tmp: string;
let clone: string;
let wt: string;
let shas: string[];

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-release-')));
  const originDir = join(tmp, 'origin.git');
  mkdirSync(originDir, { recursive: true });
  git(['init', '-q', '--bare', '-b', 'main'], originDir);

  const seed = join(tmp, 'seed');
  mkdirSync(seed, { recursive: true });
  git(['init', '-q', '-b', 'main'], seed);
  git(['config', 'user.email', 't@e.com'], seed);
  git(['config', 'user.name', 'T'], seed);
  shas = [commit(seed, 'c1'), commit(seed, 'c2'), commit(seed, 'c3')];
  git(['remote', 'add', 'origin', originDir], seed);
  git(['push', '-q', 'origin', 'main'], seed);

  clone = join(tmp, 'clone');
  git(['clone', '-q', originDir, clone], tmp);
  git(['config', 'user.email', 't@e.com'], clone);
  git(['config', 'user.name', 'T'], clone);

  // A linked worktree — the shape a deploy or a task session actually runs in.
  wt = join(tmp, 'wt');
  git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/x', wt, 'origin/main'], clone);
});

afterAll(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

const marker = (root: string) => join(root, '.claude/session-state/last-verified-release');
function writeMarker(root: string, text: string) {
  mkdirSync(join(root, '.claude/session-state'), { recursive: true });
  writeFileSync(marker(root), text);
}
function clearMarkers() {
  for (const r of [clone, wt]) if (existsSync(marker(r))) rmSync(marker(r));
}

describe('no probe, no marker', () => {
  it('reports UNKNOWN rather than a number', () => {
    clearMarkers();
    const out = sessionContext(wt, { HELM_SESSION_OFFLINE: '1' });
    expect(out).toMatch(/release state: UNKNOWN/);
    expect(out).not.toMatch(/UNRELEASED:/);
  });
});

describe('marker path — the offline fallback', () => {
  it('reads the CANONICAL marker from a linked worktree, labels it MARKER with its date', () => {
    clearMarkers();
    writeMarker(clone, `${shas[0]} 2026-08-30T10:00:00Z\n`);
    const out = sessionContext(wt, { HELM_SESSION_OFFLINE: '1' });
    // c1 is live; c2 and c3 are merged and unreleased.
    expect(out).toContain('UNRELEASED: 2 commit(s)');
    expect(out).toMatch(/per MARKER written 2026-08-30T10:00:00Z/);
    expect(out).toMatch(/NOT re-verified/);
    expect(out).not.toMatch(/verified live/);
  });

  it('a legacy one-field marker still resolves, dated from the file', () => {
    clearMarkers();
    writeMarker(clone, `${shas[1]}\n`);
    const out = sessionContext(wt, { HELM_SESSION_OFFLINE: '1' });
    expect(out).toContain('UNRELEASED: 1 commit(s)');
    expect(out).toMatch(/per MARKER written \d{4}-\d{2}-\d{2}T/);
  });

  it('a marker at origin/main reports production as serving main, still as MARKER', () => {
    clearMarkers();
    writeMarker(clone, `${shas[2]} 2026-09-01T00:00:00Z\n`);
    const out = sessionContext(wt, { HELM_SESSION_OFFLINE: '1' });
    expect(out).toMatch(/production: \w{9} — serving origin\/main \(per MARKER/);
    expect(out).not.toMatch(/UNRELEASED:/);
  });

  it('a marker naming a commit this checkout cannot resolve is UNKNOWN, not zero', () => {
    clearMarkers();
    writeMarker(clone, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef 2026-09-01T00:00:00Z\n');
    const out = sessionContext(wt, { HELM_SESSION_OFFLINE: '1' });
    expect(out).toMatch(/release state: UNKNOWN/);
    expect(out).toMatch(/cannot resolve/);
  });
});

describe('live path — the probe wins and refreshes the marker everywhere', () => {
  function stubReleaseStatus(root: string, body: string) {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts/release-status.mjs'), body);
  }

  it('prefers the live answer over a stale marker and says "verified live"', () => {
    clearMarkers();
    // Stale marker says c1 is live (2 unreleased). The bundle says c2 is.
    writeMarker(clone, `${shas[0]} 2026-08-30T10:00:00Z\n`);
    stubReleaseStatus(wt, `console.log(JSON.stringify({ deployed: ${JSON.stringify(shas[1])}, mainSha: ${JSON.stringify(shas[2])}, behind: 1 }));\n`);
    const out = sessionContext(wt);
    expect(out).toContain('UNRELEASED: 1 commit(s)');
    expect(out).toMatch(/verified live in the served bundle at session start/);
    expect(out).not.toMatch(/per MARKER/);
    // Both checkouts now carry the live sha with a date.
    for (const root of [clone, wt]) {
      const [sha, date] = readFileSync(marker(root), 'utf-8').trim().split(' ');
      expect(sha).toBe(shas[1]);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
  });

  it('a probe that fails falls back to the marker, labelled as such', () => {
    clearMarkers();
    writeMarker(clone, `${shas[0]} 2026-08-30T10:00:00Z\n`);
    stubReleaseStatus(wt, 'console.log(JSON.stringify({ error: "release-status: could not reach site" })); process.exit(2);\n');
    const out = sessionContext(wt);
    expect(out).toContain('UNRELEASED: 2 commit(s)');
    expect(out).toMatch(/per MARKER written 2026-08-30T10:00:00Z/);
  });

  it('HELM_SESSION_OFFLINE=1 skips the probe even when it would succeed', () => {
    clearMarkers();
    writeMarker(clone, `${shas[0]} 2026-08-30T10:00:00Z\n`);
    stubReleaseStatus(wt, `console.log(JSON.stringify({ deployed: ${JSON.stringify(shas[2])}, mainSha: ${JSON.stringify(shas[2])}, behind: 0 }));\n`);
    const out = sessionContext(wt, { HELM_SESSION_OFFLINE: '1' });
    expect(out).toContain('UNRELEASED: 2 commit(s)');
    expect(out).toMatch(/per MARKER/);
  });
});
