// deploy-prod.sh's verification block must finish — and say so — no matter
// what the Vercel CLI does once the deploy itself has succeeded.
//
// On 2026-09-02 a promote of a9638cecf deployed fine (READY, alias moved,
// `npm run release:status` found the SHA in the served bundle) and the script
// then died with exit 134 right after "Verifying the promote actually took
// effect...". Nothing after that line printed and the verified-release marker
// was never written. The macOS crash report names the mechanism. The alias
// lookup,
//
//   ALIAS_DPL="$(vercel inspect ... 2>&1 | awk '/^ *id\t/ {print $2; exit}')"
//
// closed the pipe the moment awk saw the `id` row; the CLI's remaining writes
// (it prints everything to stderr, and `2>&1` put that on the same pipe) hit
// EPIPE, and the CLI allocated until V8 aborted at the --max-old-space-size
// ceiling — SIGABRT, 134 — which `set -euo pipefail` faithfully carried out of
// the command substitution. A successful deploy was reported as a bare abort,
// about 90 seconds after the deploy had already finished.
//
// These cases run the REAL script against a fake `vercel` and a fake `curl`
// (fixtures/deploy-prod/, PATH and node_modules/.bin stubs; nothing here
// reaches a network or Vercel) in a real clone with a linked worktree — the
// shape a promote actually runs in (AGENTS.md: deploys promote from a
// worktree pinned at the merged main SHA). They pin:
//
//   - the CLI's real output shape is consumed in full: exit 0, VERIFIED LIVE,
//     and the marker lands in the CANONICAL checkout as well as the worktree
//   - a CLI that aborts outright during the alias lookup cannot stop the HTTP
//     and bundle-stamp checks; the abort is printed, and the marker is still
//     written, because THOSE checks are what "verified" means
//   - a missing stamp is still DEPLOY NOT VERIFIED, exit 1, no marker
//   - an unexpected failure inside verification is reported as DEPLOY NOT
//     VERIFIED naming the command that died — never as a bare non-zero exit
//   - DRY_RUN=1 and a pre-deploy refusal print no verdict and touch neither
//     the CLI nor the marker
//
// Same fixture shape as session-context-release.test.ts: real bare origin,
// real clones, no machine paths.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync,
  existsSync, copyFileSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const SCRIPT = resolve(REPO, 'scripts/deploy-prod.sh');
const FIXTURES = resolve(__dirname, 'fixtures/deploy-prod');

function git(args: string[], cwd: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function installExecutable(src: string, dest: string) {
  mkdirSync(resolve(dest, '..'), { recursive: true });
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
}

let tmp: string;
let clone: string;   // the canonical checkout, parked on a task branch
let wt: string;      // the linked worktree that has `main` checked out
let bin: string;     // PATH stubs: curl
let crashBin: string; // PATH stubs for the crash case: mktemp -> abort
let vercelLog: string;
let curlLog: string;
let headSha: string;

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-deploy-')));
  const originDir = join(tmp, 'origin.git');
  mkdirSync(originDir, { recursive: true });
  git(['init', '-q', '--bare', '-b', 'main'], originDir);

  const seed = join(tmp, 'seed');
  mkdirSync(seed, { recursive: true });
  git(['init', '-q', '-b', 'main'], seed);
  git(['config', 'user.email', 't@e.com'], seed);
  git(['config', 'user.name', 'T'], seed);
  // The script refuses a dirty tree, so everything the fixture drops into a
  // checkout after this commit must be ignored — exactly as in the real repo.
  writeFileSync(join(seed, '.gitignore'), 'node_modules/\n.vercel/\n.claude/\n');
  writeFileSync(join(seed, 'app.txt'), 'app\n');
  // Committed (not gitignored): the project-link and weekly-budget guards
  // read this from the deploying checkout, same as the real repo's
  // config/release-policy.yml.
  mkdirSync(join(seed, 'config'), { recursive: true });
  writeFileSync(
    join(seed, 'config/release-policy.yml'),
    'version: 1\n\nproduction:\n  routine_max_deploys_per_calendar_week: 2\n  timezone: America/New_York\n  vercel_project_id: prj_FIXTURE\n',
  );
  git(['add', '-A'], seed);
  git(['commit', '-qm', 'seed'], seed);
  git(['remote', 'add', 'origin', originDir], seed);
  git(['push', '-q', 'origin', 'main'], seed);

  clone = join(tmp, 'clone');
  git(['clone', '-q', originDir, clone], tmp);
  git(['config', 'user.email', 't@e.com'], clone);
  git(['config', 'user.name', 'T'], clone);
  // Park the canonical checkout on a task branch so `main` is free for the
  // deploy worktree to check out: the script's branch guard requires the
  // deploying checkout to BE on main, and git allows a branch in one
  // worktree at a time.
  git(['checkout', '-q', '-b', 'parked'], clone);
  wt = join(tmp, 'wt');
  git(['worktree', 'add', '-q', wt, 'main'], clone);
  headSha = git(['rev-parse', 'HEAD'], wt);

  vercelLog = join(tmp, 'vercel.log');
  curlLog = join(tmp, 'curl.log');

  bin = join(tmp, 'bin');
  installExecutable(join(FIXTURES, 'fake-curl.sh'), join(bin, 'curl'));
  crashBin = join(tmp, 'crashbin');
  installExecutable(join(FIXTURES, 'fake-abort.sh'), join(crashBin, 'mktemp'));

  // The script insists on the REPO-LOCAL CLI (AGENTS.md), so the fake lives
  // where the real one would, in each checkout it may run from.
  for (const root of [wt, clone]) {
    installExecutable(join(FIXTURES, 'fake-vercel.sh'), join(root, 'node_modules/.bin/vercel'));
    mkdirSync(join(root, '.vercel'), { recursive: true });
    writeFileSync(join(root, '.vercel/project.json'), JSON.stringify({ orgId: 'team_FIXTURE', projectId: 'prj_FIXTURE' }));
  }
});

afterAll(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

const marker = (root: string) => join(root, '.claude/session-state/last-verified-release');

beforeEach(() => {
  for (const r of [clone, wt]) if (existsSync(marker(r))) rmSync(marker(r));
  writeFileSync(vercelLog, '');
  writeFileSync(curlLog, '');
});

function deploy(cwd: string, env: Record<string, string> = {}, extraPath: string[] = []) {
  const base: Record<string, string | undefined> = { ...process.env };
  delete base.DRY_RUN;
  const r = spawnSync('bash', [SCRIPT], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: {
      ...base,
      PATH: [...extraPath, bin, process.env.PATH ?? ''].join(':'),
      FAKE_VERCEL_LOG: vercelLog,
      FAKE_CURL_LOG: curlLog,
      FAKE_STAMP_SHA: headSha,
      ...env,
    },
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  return { status: r.status, signal: r.signal, stdout, stderr, out: stdout + stderr };
}
const vercelCalls = () => readFileSync(vercelLog, 'utf-8').split('\n').filter(Boolean);
const curlCalls = () => readFileSync(curlLog, 'utf-8').split('\n').filter(Boolean);
const MARKER_RE = /^[0-9a-f]{40} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\n$/;

describe('a successful deploy always reaches a verdict and records it', () => {
  it('reads the CLI output in full: the real inspect shape verifies, exit 0, marker in canonical AND worktree', () => {
    const r = deploy(wt);
    expect(r.signal).toBeNull();
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('alias -> dpl_FIXTURE');
    expect(r.out).toContain('https://helmsportslabs.com/ -> 200');
    expect(r.out).toMatch(/VERIFIED LIVE: production is serving [0-9a-f]{7,}/);
    expect(r.out).not.toContain('DEPLOY NOT VERIFIED');
    expect(vercelCalls().some((c) => c.startsWith('deploy --prod'))).toBe(true);
    for (const root of [clone, wt]) {
      expect(existsSync(marker(root)), `marker missing in ${root === clone ? 'canonical' : 'worktree'}`).toBe(true);
      const text = readFileSync(marker(root), 'utf-8');
      expect(text).toMatch(MARKER_RE);
      expect(text.split(' ')[0]).toBe(headSha);
    }
  });

  it('a CLI that aborts during the alias lookup cannot stop the HTTP and stamp checks', () => {
    const r = deploy(wt, { FAKE_INSPECT_MODE: 'abort' });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/alias -> UNKNOWN \(vercel inspect exited 134/);
    expect(r.out).toContain('https://helmsportslabs.com/ -> 200');
    expect(r.out).toMatch(/VERIFIED LIVE/);
    expect(r.out).not.toContain('DEPLOY NOT VERIFIED');
    for (const root of [clone, wt]) expect(readFileSync(marker(root), 'utf-8').split(' ')[0]).toBe(headSha);
  });
});

describe('a deploy that cannot be proven live is never recorded as live', () => {
  it('stamp absent from every sampled chunk: DEPLOY NOT VERIFIED with the evidence, exit 1, no marker', () => {
    const r = deploy(wt, { FAKE_STAMP_SHA: 'f'.repeat(40) });
    expect(r.status, r.out).toBe(1);
    expect(r.stderr).toContain('DEPLOY NOT VERIFIED.');
    expect(r.stderr).toMatch(/http=200\s+release-stamp-found=0\s+expected-sha=[0-9a-f]{7,}/);
    expect(r.out).not.toMatch(/VERIFIED LIVE/);
    // It sampled the bundle, not the document: both chunk URLs were fetched.
    expect(curlCalls().filter((u) => u.includes('/_next/static/chunks/'))).toHaveLength(2);
    for (const root of [clone, wt]) expect(existsSync(marker(root))).toBe(false);
  });

  it('a crash inside verification is reported as DEPLOY NOT VERIFIED naming the command, never a bare exit', () => {
    const r = deploy(wt, {}, [crashBin]);
    expect(r.status, r.out).not.toBe(0);
    expect(r.stderr).toContain('DEPLOY NOT VERIFIED.');
    expect(r.stderr).toMatch(/crashed/i);
    expect(r.stderr).toMatch(/exit 134/);
    expect(r.stderr).toContain('mktemp');
    expect(r.stderr).toMatch(/release:status/);
    expect(r.out).not.toMatch(/VERIFIED LIVE/);
    for (const root of [clone, wt]) expect(existsSync(marker(root))).toBe(false);
  });
});

describe('nothing after the deploy step runs when there was no deploy', () => {
  it('DRY_RUN=1 deploys nothing, verifies nothing, writes nothing, but still prints the week budget', () => {
    const r = deploy(wt, { DRY_RUN: '1' });
    expect(r.status, r.out).toBe(0);
    expect(r.stdout).toContain('DRY_RUN=1 — nothing deployed.');
    expect(r.out).toContain("this week's production deploys -> 0 / budget 2");
    expect(r.out).not.toContain('DEPLOY NOT VERIFIED');
    expect(r.out).not.toMatch(/VERIFIED LIVE/);
    // The budget guard's `vercel ls` runs even in DRY_RUN (it is a guard, not
    // part of the deploy step) — only `deploy --prod` must never be called.
    expect(vercelCalls().some((c) => c.startsWith('deploy --prod'))).toBe(false);
    for (const root of [clone, wt]) expect(existsSync(marker(root))).toBe(false);
  });

  it('a pre-deploy refusal prints its own reason and no verification verdict', () => {
    const r = deploy(clone); // parked on a task branch, not main
    expect(r.status, r.out).toBe(1);
    expect(r.stderr).toContain("REFUSING: on branch 'parked', not main.");
    expect(r.out).not.toContain('DEPLOY NOT VERIFIED');
    expect(vercelCalls()).toHaveLength(0);
    for (const root of [clone, wt]) expect(existsSync(marker(root))).toBe(false);
  });
});

// The two accidental Vercel projects (helmv3-golf-reliability-release-20260825,
// helmv3-main-release-c350) both trace to a `vercel deploy` run from a
// directory that was not linked to the real helmv3 project — the CLI's
// fallback there is to silently create a NEW project, not to fail. This guard
// is what stands between "unlinked directory" and "accidental project" now.
describe('the deploying directory must be linked to the correct Vercel project', () => {
  const projectJsonPath = () => join(wt, '.vercel/project.json');

  it('refuses when .vercel/project.json is missing entirely', () => {
    const saved = readFileSync(projectJsonPath(), 'utf-8');
    rmSync(projectJsonPath());
    try {
      const r = deploy(wt);
      expect(r.status, r.out).toBe(1);
      expect(r.stderr).toContain('REFUSING: no .vercel/project.json');
      expect(vercelCalls()).toHaveLength(0);
      for (const root of [clone, wt]) expect(existsSync(marker(root))).toBe(false);
    } finally {
      writeFileSync(projectJsonPath(), saved);
    }
  });

  it("refuses when .vercel/project.json names a project other than helmv3's", () => {
    const saved = readFileSync(projectJsonPath(), 'utf-8');
    writeFileSync(projectJsonPath(), JSON.stringify({ orgId: 'team_FIXTURE', projectId: 'prj_WRONG' }));
    try {
      const r = deploy(wt);
      expect(r.status, r.out).toBe(1);
      expect(r.stderr).toContain("points at project 'prj_WRONG', not helmv3's");
      expect(vercelCalls()).toHaveLength(0);
      for (const root of [clone, wt]) expect(existsSync(marker(root))).toBe(false);
    } finally {
      writeFileSync(projectJsonPath(), saved);
    }
  });
});

// release-policy.yml caps routine production deploys at 2/calendar week
// (America/New_York); the Vercel audit found actual weeks running 4-16x that,
// unenforced. These pin the guard that makes the cap real.
describe('the weekly production-deploy budget (config/release-policy.yml)', () => {
  // 2026-06-10T12:00:00Z is a Wednesday, comfortably clear of any ISO-week
  // (Mon 00:00 - Sun 23:59:59, America/New_York) boundary, so a "1h ago" row
  // is unambiguously in the same week as "now" regardless of DST.
  const MID_WEEK_NOW = '2026-06-10T12:00:00Z';

  it("refuses when this week's count is already at or over budget", () => {
    const r = deploy(wt, { FAKE_LS_MODE: 'rows', FAKE_LS_COUNT: '2', HELM_DEPLOY_WEEK_COUNT_NOW: MID_WEEK_NOW });
    expect(r.status, r.out).toBe(1);
    expect(r.stderr).toContain('REFUSING: 2 production deploy(s) already this ISO week');
    expect(vercelCalls().some((c) => c.startsWith('deploy --prod'))).toBe(false);
    for (const root of [clone, wt]) expect(existsSync(marker(root))).toBe(false);
  });

  it('HELM_DEPLOY_OVERRIDE deploys anyway and logs the reason into the release marker', () => {
    const r = deploy(wt, {
      FAKE_LS_MODE: 'rows',
      FAKE_LS_COUNT: '2',
      HELM_DEPLOY_WEEK_COUNT_NOW: MID_WEEK_NOW,
      HELM_DEPLOY_OVERRIDE: 'hotfix for #1234, owner approved',
    });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('OVERRIDE: 2 >= budget 2, deploying anyway. Reason: hotfix for #1234, owner approved');
    expect(vercelCalls().some((c) => c.startsWith('deploy --prod'))).toBe(true);
    for (const root of [clone, wt]) {
      expect(readFileSync(marker(root), 'utf-8')).toContain(
        'HELM_DEPLOY_OVERRIDE=hotfix for #1234, owner approved',
      );
    }
  });

  it('an unparseable `vercel ls` output is UNKNOWN, and UNKNOWN refuses rather than guessing', () => {
    const r = deploy(wt, { FAKE_LS_MODE: 'unparseable' });
    expect(r.status, r.out).toBe(1);
    expect(r.stderr).toContain('REFUSING: could not parse `vercel ls helmv3 --prod`');
    expect(vercelCalls().some((c) => c.startsWith('deploy --prod'))).toBe(false);
    for (const root of [clone, wt]) expect(existsSync(marker(root))).toBe(false);
  });

  it('a failing `vercel ls` (e.g. an auth error) is also UNKNOWN, never a silent 0', () => {
    const r = deploy(wt, { FAKE_LS_MODE: 'error' });
    expect(r.status, r.out).toBe(1);
    expect(r.stderr).toContain('REFUSING: could not parse `vercel ls helmv3 --prod`');
    expect(r.stderr).toContain('vercel ls exited 1');
    expect(vercelCalls().some((c) => c.startsWith('deploy --prod'))).toBe(false);
  });
});
