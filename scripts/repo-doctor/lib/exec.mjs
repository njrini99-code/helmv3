// Safe, read-only exec helpers. Every helper returns a structured result —
// { ok: true, value } or { ok: false, error } — so a failed probe is NEVER
// mistaken for a real negative. (That exact confusion — empty output read as a
// result — produced a false "alias never moved" on 2026-08-20.)

import { execFileSync } from 'node:child_process';

/**
 * Run a command read-only, capturing stdout. Returns a structured result.
 * Throws nothing — a non-zero exit or a missing binary becomes { ok:false }.
 */
export function run(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: opts.cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout ?? 15000,
      maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
      env: opts.env ?? process.env,
    });
    return { ok: true, value: out.replace(/\n$/, '') };
  } catch (err) {
    return {
      ok: false,
      error: err?.message ?? String(err),
      code: typeof err?.status === 'number' ? err.status : null,
    };
  }
}

/** Convenience for git invocations rooted at a repo. */
export function git(repoRoot, args, opts = {}) {
  return run('git', args, { ...opts, cwd: repoRoot });
}
