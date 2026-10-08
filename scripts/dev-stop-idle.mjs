#!/usr/bin/env node
/**
 * Stop `next dev` servers that have been idle for more than 2 hours.
 *
 *   npm run dev:stop-idle                   list them, stop nothing
 *   npm run dev:stop-idle -- --apply        send SIGTERM to each idle one
 *   npm run dev:stop-idle -- --idle-hours 6 a different threshold
 *
 * Why: every worktree that ran `npm run dev` and was forgotten keeps a ~1 GB
 * Node process and its file watchers for days. There is no cron on purpose;
 * run it when the machine feels slow, or from a session you trust.
 *
 * "Idle" is measured by the checkout's own dev output, not by CPU: the newest
 * modification time under <cwd>/.next/ (the trace file and the server output
 * Next rewrites whenever a page compiles or a request is traced). A server that
 * started less than the threshold ago is never idle, whatever its files say,
 * and a process whose working directory cannot be read is left alone.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cliGuard } from './lib/cli-guard.mjs';

/** "[[dd-]hh:]mm:ss" from `ps -o etime` to milliseconds. Pure. */
export function parseEtime(etime) {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(String(etime).trim());
  if (!m) return null;
  const [, d = '0', h = '0', mi, s] = m;
  return (((Number(d) * 24 + Number(h)) * 60 + Number(mi)) * 60 + Number(s)) * 1000;
}

/** `ps -axo pid=,etime=,command=` lines to rows. Pure. */
export function parsePs(output) {
  const rows = [];
  for (const line of String(output).split('\n')) {
    const m = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const ageMs = parseEtime(m[2]);
    if (ageMs !== null) rows.push({ pid: Number(m[1]), ageMs, command: m[3] });
  }
  return rows;
}

/** A `next dev` server (the CLI, the node entry point, or its next-server child). Pure. */
export function isNextDev(command) {
  return /(^|[\s/])next(-server)?(\s|$)/.test(command) && /(\bdev\b|next-server)/.test(command) && !/dev-stop-idle/.test(command);
}

/** Pure decision. `lastActiveMs` is the newest .next mtime, or null when unknown. */
export function isIdle({ ageMs, lastActiveMs, now, thresholdMs }) {
  if (ageMs < thresholdMs) return false; // too young to have idled that long
  if (lastActiveMs === null) return false; // cannot tell: leave it alone
  return now - lastActiveMs > thresholdMs;
}

/** Newest mtime under `dir`, to a small depth so the walk stays cheap. */
export function newestMtime(dir, depth = 3) {
  let newest = null;
  const visit = (path, left) => {
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(path, e.name);
      try {
        const t = statSync(full).mtimeMs;
        if (newest === null || t > newest) newest = t;
        if (e.isDirectory() && left > 0 && e.name !== 'cache') visit(full, left - 1);
      } catch {
        /* vanished mid-walk */
      }
    }
  };
  visit(dir, depth);
  return newest;
}

function cwdOf(pid) {
  try {
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = out.split('\n').find((l) => l.startsWith('n'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
}

function main() {
  const cli = cliGuard({
    name: 'scripts/dev-stop-idle.mjs',
    summary: 'Lists `next dev` servers idle for more than 2 hours and, with --apply, stops them with SIGTERM. Idle means nothing under the checkout\'s .next directory changed for that long.',
    usage: '[--idle-hours N]',
    options: [['--idle-hours N', 'Idle threshold in hours (default 2)']],
  });
  const hoursArg = process.argv.indexOf('--idle-hours');
  const hours = hoursArg === -1 ? 2 : Number(process.argv[hoursArg + 1]);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error('--idle-hours needs a positive number.');
    process.exit(2);
  }
  const thresholdMs = hours * 3600 * 1000;
  const now = Date.now();
  const ps = execFileSync('ps', ['-axo', 'pid=,etime=,command='], { encoding: 'utf8' });
  const servers = parsePs(ps).filter((r) => isNextDev(r.command) && r.pid !== process.pid && r.pid !== process.ppid);
  if (servers.length === 0) {
    console.log('No next dev servers running.');
    return;
  }
  let idle = 0;
  for (const s of servers) {
    const cwd = cwdOf(s.pid);
    const next = cwd && existsSync(join(cwd, '.next')) ? join(cwd, '.next') : null;
    const lastActiveMs = next ? newestMtime(next) : null;
    const verdict = isIdle({ ageMs: s.ageMs, lastActiveMs, now, thresholdMs });
    const quiet = lastActiveMs === null ? 'unknown' : `${Math.round((now - lastActiveMs) / 360000) / 10}h quiet`;
    console.log(`${verdict ? 'IDLE  ' : 'active'}  pid ${s.pid}  up ${Math.round(s.ageMs / 360000) / 10}h  ${quiet}  ${cwd ?? '(cwd unreadable)'}`);
    if (!verdict) continue;
    idle += 1;
    if (cli.apply) {
      try {
        process.kill(s.pid, 'SIGTERM');
        console.log(`        stopped pid ${s.pid}`);
      } catch (e) {
        console.log(`        could not stop pid ${s.pid}: ${e.message}`);
      }
    }
  }
  if (!cli.apply && idle > 0) console.log(`[dry-run] would stop ${idle} idle server(s). Re-run with --apply to do it.`);
  if (idle === 0) console.log('Nothing idle past the threshold.');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
