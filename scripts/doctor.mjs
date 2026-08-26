#!/usr/bin/env node
/**
 * npm run doctor — one command that answers "why is my session broken?"
 *
 * Checks the four things agent sessions repeatedly trip over on this machine
 * and prints the EXACT fix for each. Read-only; never mutates anything.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg, fix) => {
  failures += 1;
  console.log(`  ✗ ${msg}`);
  console.log(`    fix: ${fix}`);
};
const run = (cmd) => execSync(cmd, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

console.log('helm doctor — dev environment checks\n');

// 1. Node version vs the pin
console.log('Node');
const want = readFileSync(join(repo, '.nvmrc'), 'utf8').trim();
const got = process.version;
if (got.slice(1).split('.')[0] === want.split('.')[0]) {
  ok(`${got} matches .nvmrc (${want}.x)`);
} else {
  bad(
    `running ${got}, repo pins ${want}.x`,
    `fnm use ${want}   (or: nvm use) — .nvmrc/.node-version are committed, so 'fnm use'/'nvm use' with no args also works`,
  );
}

// 2. Repo-pinned Supabase CLI (there is NO global binary, on purpose)
console.log('Supabase CLI');
const pinned = join(repo, 'node_modules', '.bin', 'supabase');
if (existsSync(pinned)) {
  try {
    ok(`repo-pinned CLI v${run(`${JSON.stringify(pinned)} --version`)} — invoke as ./node_modules/.bin/supabase or npx supabase (bare 'supabase' will NOT resolve)`);
  } catch {
    bad('pinned CLI present but failed to run', 'npm ci');
  }
} else {
  bad(
    "node_modules/.bin/supabase missing — this checkout hasn't installed deps (fresh worktrees start empty)",
    'npm ci   (required once per worktree)',
  );
}

// 3. Docker daemon — required by every supabase local-stack command
console.log('Docker');
let dockerUp = false;
try {
  run('docker info');
  dockerUp = true;
  ok('daemon running');
} catch {
  bad(
    "daemon not running — 'supabase start/status/test db --local' will all fail with a docker.sock error that reads like a CLI problem but is not",
    'open -a Docker   then wait ~30s until `docker info` succeeds',
  );
}

// 4. Local Supabase stack (only meaningful when docker is up)
console.log('Local Supabase stack');
if (!dockerUp) {
  console.log('  – skipped (docker down decides this one)');
} else {
  try {
    run('npx supabase status');
    ok('local stack running (API 54321 / DB 54322)');
  } catch {
    bad('stack not running', 'npx supabase start   (applies supabase/migrations + seed; ~1-2 min)');
  }
}

console.log(failures === 0 ? '\nAll clear.' : `\n${failures} issue(s) — fixes above are copy-pasteable.`);
process.exit(failures === 0 ? 0 : 1);
