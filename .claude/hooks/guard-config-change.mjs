#!/usr/bin/env node
// .claude/hooks/guard-config-change.mjs — PreToolUse / Write|Edit|MultiEdit|Bash
//
// Refuses a change to one of the control-plane config surfaces —
// `.claude/settings.json`, anything under `.claude/hooks/`, `.mcp.json`, or
// anything under `.github/workflows/` — unless the environment variable
// `HELM_CONFIG_EDIT=1` is set in the process that runs this hook. The
// message tells the caller exactly how to proceed: set the variable and
// retry. This is a confirmation gate, not a review gate — the actual review
// happens on the PR the change ships in.
//
// WRITE/EDIT/MULTIEDIT: the guarded path comes straight from
// `tool_input.file_path`; exact and reliable.
//
// BASH: there is no reliable way to know from command TEXT alone whether a
// shell line writes to a given path — guard-canonical-write.mjs's header
// documents this at length, and the keyword-matching Bash guards this repo
// deleted for cause are the reason this file does NOT block on a guarded
// path appearing anywhere in a command. Instead it requires BOTH a guarded
// path AND a write-shaped token (a redirect, `sed -i`, `tee`, `perl -i`,
// `patch`, `git apply`, `cp`/`mv`/`rm`/`truncate`/`dd`) in the same command.
// That still under- and over-approximates real shell semantics — a `cp` into
// a variable-expanded path won't be caught, and a contrived one-liner could
// still slip past — but it does not refuse the read-only commands this repo
// actually runs against these paths every session (`cat`, `grep`, `git diff`,
// `git show`), which a bare path-substring match would have.
//
// Contract: reads hook JSON on stdin, exit 0 to allow, exit 2 with a
// one-line reason on stderr to block. Never throws — a crash must exit 0.

function readStdinJson() {
  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolvePromise(JSON.parse(data || '{}'));
      } catch {
        resolvePromise({});
      }
    });
    process.stdin.on('error', () => resolvePromise({}));
  });
}

// Matches a guarded path fragment ANYWHERE in a string — deliberately not
// anchored, since for Bash it is scanning free-form command text rather than
// a single file_path value.
const GUARDED_RE =
  /\.claude\/settings(\.local)?\.json\b|\.claude\/hooks\/|\.mcp\.json\b|\.github\/workflows\//;

const WRITE_TOKEN_RE =
  /(>{1,2})|\btee\b|\bsed\s+-i\b|\bperl\s+-i\b|\bpatch\b|\bgit\s+apply\b|\bcp\s|\bmv\s|\brm\s|\btruncate\s|\bdd\s/i;

/** True when `path` names one of the guarded config surfaces. */
export function isGuardedPath(path) {
  return GUARDED_RE.test(String(path || ''));
}

/** True when a Bash command both names a guarded path and looks write-shaped. */
export function isGuardedBashWrite(command) {
  const cmd = String(command || '');
  return GUARDED_RE.test(cmd) && WRITE_TOKEN_RE.test(cmd);
}

const HOW_TO_OVERRIDE =
  'Set HELM_CONFIG_EDIT=1 in the shell environment this session runs in, then retry. ' +
  'This confirms the config change is intentional; the actual review happens on the PR.';

function blockedMessage(what) {
  return (
    `BLOCKED by guard-config-change: ${what} touches a protected control-plane ` +
    `config surface (.claude/settings.json, .claude/hooks/*, .mcp.json, ` +
    `.github/workflows/*). ${HOW_TO_OVERRIDE}\n`
  );
}

async function run() {
  const input = await readStdinJson();
  const toolName = input?.tool_name;
  const toolInput = input?.tool_input || {};

  if (process.env.HELM_CONFIG_EDIT === '1') {
    process.exit(0);
    return;
  }

  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    const filePath = toolInput.file_path;
    if (isGuardedPath(filePath)) {
      process.stderr.write(blockedMessage(filePath));
      process.exit(2);
      return;
    }
    process.exit(0);
    return;
  }

  if (toolName === 'Bash') {
    const command = toolInput.command;
    if (isGuardedBashWrite(command)) {
      process.stderr.write(blockedMessage('this Bash command'));
      process.exit(2);
      return;
    }
    process.exit(0);
    return;
  }

  process.exit(0);
}

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
if (process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})()) {
  run().catch(() => process.exit(0));
}
