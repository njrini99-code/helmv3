// Local Supabase/Postgres stack checks (D1, Helm Database Plan).
//
// Three questions this answers:
//   1. Is Docker reachable at all? (a hard prerequisite for `npm run db:local`)
//   2. If the local stack is UP, does its running Postgres major version
//      match what supabase/config.toml pins (production parity)?
//   3. Is the scrubbed prod-sample seed stale (>30 days)? WARN, not FAIL —
//      a stale seed still works, it's just drifting from what production's
//      shape actually looks like today.
//
// Docker/stack checks that can't run (Docker not installed, stack not up)
// degrade to LOCAL_ONLY, never a manufactured FAIL — same reasoning as
// db-observability.mjs's live-credential checks.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { check, Status } from '../result.mjs';

export const meta = { id: 'db-local', title: 'Local database stack' };

const STALE_SEED_DAYS = 30;

/** Pure classification, unit-tested without filesystem scaffolding. */
export function classifySeedAge(ageDays) {
  return ageDays <= STALE_SEED_DAYS
    ? { status: Status.PASS, days: Math.round(ageDays) }
    : { status: Status.WARN, days: Math.round(ageDays) };
}

/** Pure classification of the major-version comparison. */
export function classifyMajorVersionMatch(configured, running) {
  if (configured === null) return { status: Status.BLOCKED };
  if (running === null) return { status: Status.LOCAL_ONLY };
  return configured === running ? { status: Status.PASS } : { status: Status.DRIFT };
}

function dockerReachable() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function readConfiguredMajorVersion(repoRoot) {
  const configPath = join(repoRoot, 'supabase/config.toml');
  if (!existsSync(configPath)) return null;
  const text = readFileSync(configPath, 'utf-8');
  const m = text.match(/^major_version\s*=\s*(\d+)/m);
  return m ? Number(m[1]) : null;
}

/** Query the running local stack's Postgres server_version_num major digit(s). */
function readRunningMajorVersion(repoRoot) {
  try {
    const out = execFileSync(
      'docker',
      ['exec', '-i', 'supabase_db_helmv3', 'psql', '-U', 'postgres', '-tAc', 'SHOW server_version_num;'],
      { cwd: repoRoot, encoding: 'utf-8', timeout: 8000 },
    );
    const num = parseInt(out.trim(), 10);
    if (!Number.isFinite(num)) return null;
    return Math.floor(num / 10000);
  } catch {
    return null;
  }
}

export async function run(ctx) {
  const { repoRoot } = ctx;
  const out = [];

  const dockerUp = dockerReachable();
  out.push(
    dockerUp
      ? check('db-local.docker-reachable', Status.PASS, 'Docker is reachable')
      : check('db-local.docker-reachable', Status.LOCAL_ONLY, 'Docker is not reachable here — start Docker Desktop to run npm run db:local'),
  );

  if (dockerUp) {
    const configured = readConfiguredMajorVersion(repoRoot);
    const running = readRunningMajorVersion(repoRoot);
    const { status } = classifyMajorVersionMatch(configured, running);
    if (status === Status.LOCAL_ONLY) {
      out.push(
        check(
          'db-local.postgres-major-matches',
          Status.LOCAL_ONLY,
          'Local Supabase stack is not running — start it with `npm run db:local` to verify Postgres major version parity',
        ),
      );
    } else if (status === Status.BLOCKED) {
      out.push(check('db-local.postgres-major-matches', Status.BLOCKED, 'Could not read major_version from supabase/config.toml'));
    } else if (status === Status.PASS) {
      out.push(check('db-local.postgres-major-matches', Status.PASS, `Running stack is Postgres ${running}, matches config.toml`));
    } else {
      out.push(
        check(
          'db-local.postgres-major-matches',
          Status.DRIFT,
          `Running stack is Postgres ${running}, but supabase/config.toml pins ${configured}`,
          { expected: configured, actual: running },
        ),
      );
    }
  }

  const seedPath = join(repoRoot, 'supabase/seed/prod-sample-seed.sql');
  if (!existsSync(seedPath)) {
    out.push(check('db-local.seed-freshness', Status.WARN, 'supabase/seed/prod-sample-seed.sql is missing — run npm run db:seed:refresh'));
  } else {
    const ageDays = (Date.now() - statSync(seedPath).mtimeMs) / (1000 * 60 * 60 * 24);
    const { status: seedStatus, days } = classifySeedAge(ageDays);
    out.push(
      seedStatus === Status.PASS
        ? check('db-local.seed-freshness', Status.PASS, `prod-sample-seed.sql is ${days} day(s) old`)
        : check(
            'db-local.seed-freshness',
            Status.WARN,
            `prod-sample-seed.sql is ${days} day(s) old (>${STALE_SEED_DAYS}) — consider npm run db:seed:refresh`,
          ),
    );
  }

  return out;
}
