#!/usr/bin/env node
/**
 * The dev-server port for THIS checkout, shared by `npm run dev` (scripts/dev.mjs)
 * and scripts/ios-dev.sh so they always agree.
 *
 * Every worktree used to start `next dev` on 3000 and the second one failed or
 * silently took 3001, and which tab answered which worktree was anyone's guess.
 * A linked worktree now gets a stable port in 3001..3099 derived from its
 * directory name; the canonical checkout keeps 3000, so nothing that assumed
 * 3000 for the main checkout changes. An explicit PORT always wins.
 *
 *   node scripts/lib/dev-port.mjs        prints the port for the current directory
 */
import { execFileSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';

export const CANONICAL_PORT = 3000;
export const PORT_MIN = 3001;
export const PORT_MAX = 3099;
const SPAN = PORT_MAX - PORT_MIN + 1;

/** 32-bit FNV-1a, stable across Node versions and platforms. */
export function hashName(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The first-choice port for a worktree directory name. Pure. */
export function portForName(name) {
  return PORT_MIN + (hashName(name) % SPAN);
}

/** Next port in range after `port`, wrapping, for when the first choice is busy. */
export function nextPort(port) {
  return port >= PORT_MAX ? PORT_MIN : port + 1;
}

/** Whether `cwd` is the canonical checkout (not a linked worktree). */
export function isCanonicalCheckout(cwd, run = execFileSync) {
  try {
    const common = run('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const top = run('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return resolve(cwd, dirname(resolve(cwd, common))) === resolve(top);
  } catch {
    return true; // not a git checkout: behave like the canonical one
  }
}

/**
 * The first-choice port for a checkout. PORT, when set to a valid port, wins.
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, canonical?: boolean }} [opts]
 */
export function devPort({ cwd = process.cwd(), env = process.env, canonical } = {}) {
  const fromEnv = Number(env.PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536) return fromEnv;
  const isCanonical = canonical ?? isCanonicalCheckout(cwd);
  return isCanonical ? CANONICAL_PORT : portForName(basename(resolve(cwd)));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  console.log(devPort());
}
