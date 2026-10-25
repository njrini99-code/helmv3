// release-status must find the served commit however far behind main it is.
//
// On 2026-10-23 production served d0f467a73 while main was 67 commits ahead.
// The script only searched the newest 60 commits (`--depth 60`), so
// `npm run release:status` and SessionStart's live probe both reported
// UNKNOWN ("no commit from the last 60 on main appears in the served bundle")
// at exactly the moment the gap mattered most. These fixtures pin:
//
//   - a stamp 70 commits behind main is found, with the right `behind` count
//   - a stamp that is not on main at all is still UNKNOWN (exit 2), never a
//     guess
//
// Real git repo, a local HTTP server standing in for the site, no network.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const REPO = resolve(__dirname, '../..');
const SCRIPT = resolve(REPO, 'scripts/release-status.mjs');
const run = promisify(execFile);

function git(args: string[], cwd: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

let tmp: string;
let repo: string;
let shas: string[];
let server: Server;
let site: string;
let stamp = '';

beforeAll(async () => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-release-status-')));
  repo = join(tmp, 'repo');
  mkdirSync(repo, { recursive: true });
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.email', 't@example.com'], repo);
  git(['config', 'user.name', 't'], repo);
  shas = [];
  for (let i = 0; i < 80; i++) {
    git(['commit', '-q', '--allow-empty', '-m', `c${i}`], repo);
    shas.push(git(['rev-parse', 'HEAD'], repo));
  }
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD'], repo);

  server = createServer((req, res) => {
    if (req.url === '/') {
      res.end('<html><script src="/_next/static/chunks/main-abc.js"></script></html>');
    } else if (req.url === '/_next/static/chunks/main-abc.js') {
      res.end(`self.__SENTRY_RELEASE__={id:"${stamp}"};`);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(tmp, { recursive: true, force: true });
});

async function releaseStatus(): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await run('node', [SCRIPT, '--json', '--no-fetch', '--timeout-ms', '10000'], {
      cwd: repo,
      env: { ...process.env, HELM_PROD_URL: site },
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '' };
  }
}

describe('release-status', () => {
  it('finds a served commit more than 60 commits behind main', async () => {
    stamp = shas[9]; // 70 commits behind main's tip (shas[79])
    const { code, stdout } = await releaseStatus();
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.deployed).toBe(shas[9]);
    expect(out.behind).toBe(70);
  });

  it('stays UNKNOWN when the served stamp is not on main', async () => {
    stamp = 'f'.repeat(40);
    const { code, stdout } = await releaseStatus();
    expect(code).toBe(2);
    expect(JSON.parse(stdout).error).toMatch(/release-status: no commit/);
  });
});
