#!/usr/bin/env node
// PreToolUse (Write|Edit|MultiEdit) — refuse to write a file another LIVE
// session is already working on.
//
// WHY THIS EXISTS
// ---------------
// Measured 2026-08-26 against this checkout's own session ledger: 13 sessions
// active in 24 hours, and FIFTEEN files touched by more than one of them —
// including `memory/registry.yml` (the semantic router) and six
// `memory/features/*.md` canonical current-state docs, plus
// `src/app/golf/actions/insights.ts` and `src/lib/notifications/push.ts`.
//
// That is the mechanical cause of "the agents keep getting confused". Session A
// reads a feature doc to orient itself, session B rewrites it mid-task, and A
// then acts on a stale reading and writes its own update over B's. Neither
// session ever sees an error. The knowledge base drifts away from the code, and
// from itself, one silent overwrite at a time.
//
// AGENTS.md already mandates the fix — each concurrent session takes its own
// worktree OUTSIDE the repo and leaves the canonical checkout alone. Nothing
// enforced it, so it did not happen. This hook is the mechanical version of
// that rule: it does not stop you working, it stops you working *on the same
// file as someone else, silently*.
//
// WHAT COUNTS AS A COLLISION
// --------------------------
// Another session's `touch` event for the SAME repo-relative path, where BOTH
// the touch and that session's ledger are recent (see the windows below). A
// session that finished hours ago is not a collision — its file is stale and
// its work is already on disk.
//
// FAIL-OPEN, DELIBERATELY. Anything unexpected — unreadable ledger, malformed
// line, missing session id — exits 0. A hook that cannot read its own evidence
// must not become a wall between the user and their repo; the cost of a missed
// warning is drift, the cost of a false block is a session that cannot work.
//
// OVERRIDE: HELM_ALLOW_CONCURRENT_EDIT=1 (deliberate, in-the-know coordination).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRepoRoot, isWithinRepo, toRepoRelative } from './lib/feature-map.mjs';

/** A session whose ledger has not been written in this long is finished, not live. */
const SESSION_LIVE_MS = 60 * 60 * 1000;
/** A touch older than this is history, not work-in-progress. */
const TOUCH_RECENT_MS = 2 * 60 * 60 * 1000;

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

/** Every path this tool call would write. MultiEdit still targets one file. */
function targetPath(input) {
  return input?.tool_input?.file_path || null;
}

function main() {
  if (process.env.HELM_ALLOW_CONCURRENT_EDIT === '1') return 0;

  const input = readStdin();
  if (!input) return 0;

  const filePath = targetPath(input);
  if (!filePath) return 0;

  const repoRoot = resolveRepoRoot(input);
  if (!repoRoot || !isWithinRepo(repoRoot, filePath)) return 0;

  const rel = toRepoRelative(repoRoot, filePath);
  if (!rel) return 0;

  const meId = String(input.session_id || '');
  const dir = join(repoRoot, '.claude/session-state');
  if (!existsSync(dir)) return 0;

  const now = Date.now();
  const collisions = [];

  for (const fn of readdirSync(dir)) {
    if (!fn.endsWith('.jsonl')) continue;
    const id = fn.slice(0, -'.jsonl'.length);
    if (meId && id === meId) continue; // never collide with yourself

    const full = join(dir, fn);
    let mtime;
    try {
      mtime = statSync(full).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtime > SESSION_LIVE_MS) continue; // that session is done

    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    let lastTouch = 0;
    for (const line of text.split('\n')) {
      if (!line.trim() || !line.includes('"touch"')) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue; // torn line — diagnostic state, not a database
      }
      if (ev?.type !== 'touch' || ev.path !== rel) continue;
      const t = Date.parse(ev.ts || '');
      if (Number.isFinite(t) && t > lastTouch) lastTouch = t;
    }

    if (lastTouch && now - lastTouch <= TOUCH_RECENT_MS) {
      collisions.push({ id: id.slice(0, 8), minutesAgo: Math.round((now - lastTouch) / 60000) });
    }
  }

  if (collisions.length === 0) return 0;

  const who = collisions
    .map((c) => `  session ${c.id} — touched it ${c.minutesAgo} min ago`)
    .join('\n');

  process.stderr.write(
    `BLOCKED: another live session is already editing ${rel}.\n\n${who}\n\n` +
      `Two sessions writing one file in this shared checkout is how the knowledge base\n` +
      `drifts: one reads, the other rewrites, and the first overwrites it without ever\n` +
      `seeing an error. Measured here 2026-08-26: 15 files were being edited by more\n` +
      `than one session at once, including memory/registry.yml and six\n` +
      `memory/features/*.md docs.\n\n` +
      `Do one of these:\n` +
      `  - Work in your own worktree OUTSIDE the repo, as AGENTS.md requires:\n` +
      `      git worktree add ../helmv3-<task> -b <branch>\n` +
      `  - Wait for that session to finish and re-read the file before editing.\n` +
      `  - If you know the other session is done with this file and you are\n` +
      `    deliberately taking it over, re-run with HELM_ALLOW_CONCURRENT_EDIT=1.\n`,
  );
  return 2;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0; // fail-open: never wall the user out of their own repo
}
process.exit(code);
