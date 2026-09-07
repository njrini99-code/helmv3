#!/usr/bin/env node
// .claude/hooks/guard-config-change.mjs — PreToolUse / Write|Edit|MultiEdit|Bash
//
// Refuses a change to one of the control-plane config surfaces —
// `.claude/settings.json`, anything under `.claude/hooks/`, `.mcp.json`, or
// anything under `.github/workflows/` — unless the environment variable
// `HELM_CONFIG_EDIT=1` is set in the process that runs this hook. This is a
// confirmation gate, not a review gate — the actual review happens on the PR
// the change ships in.
//
// WRITE/EDIT/MULTIEDIT: the guarded path comes straight from
// `tool_input.file_path`; exact and reliable.
//
// BASH: this hook does NOT ask "does a guarded path appear in the command"
// (a bare substring match refuses every `cat`/`grep`/`git diff` against these
// files, which this repo runs constantly). Nor does it ask, as it did until
// 2026-09-07, "does a guarded path appear AND does a write-shaped token appear
// anywhere in the same command" — those two questions are independent, so
//
//     grep -n jobs .github/workflows/ci.yml > /tmp/out
//     grep -n jobs .github/workflows/ci.yml 2>/dev/null
//     cat > /tmp/notes.md <<EOF ... mentions .claude/hooks/x.mjs ... EOF
//
// were all refused, none of which writes to a guarded path. That is the
// keyword-matching failure mode guard-canonical-write.mjs's header criticizes,
// and it cost several sessions real time. Worse, the remedy the message names
// is unreachable from inside a session: HELM_CONFIG_EDIT is read from this
// hook's process, which inherits the environment Claude Code was LAUNCHED
// with, so `export HELM_CONFIG_EDIT=1` inside a Bash tool call does nothing.
// The message below now says so.
//
// Instead this extracts the WRITE TARGETS of a command — the operand of each
// redirect, the file arguments of `tee`/`sed -i`/`perl -i`/`patch`/`git apply`,
// the arguments of `cp`/`mv`/`rm`/`truncate`/`install`, `dd of=` — and blocks
// only when one of THOSE names a guarded surface. The token and the path have
// to be related, which is the whole bug.
//
// This still under-approximates real shell semantics, deliberately and in the
// same direction the repo already accepts: a variable-expanded destination, a
// python script, or a `bash -c` payload will not be caught. Bash was never a
// sealed boundary here (guard-canonical-write.mjs's header says so at length,
// as does .claude/rules/shipping.md), and the structural fix remains
// `sandbox.filesystem`, which is an owner decision. What this file must not do
// is impose the cost of enforcement without the benefit.
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

// Matches a guarded path fragment anywhere in a single path-shaped string.
// Applied to ONE path at a time (a file_path, or one extracted write target),
// never to free-form command text.
const GUARDED_RE =
  /\.claude\/settings(\.local)?\.json\b|\.claude\/hooks\/|\.mcp\.json\b|\.github\/workflows\//;

// A shell word: stops at whitespace, separators, redirects and subshells.
const WORD = "[^\\s;|&()<>]+";

// Commands whose non-flag operands are written to. `cp`/`mv`/`install` write
// only their LAST operand, but treating every operand as a target is the safe
// direction for a guard: it can over-block a read of a guarded file used as a
// SOURCE (`cp .mcp.json /tmp/x`), which is rare and has an obvious workaround,
// while never under-blocking a real write.
const FILE_ARG_CMD_RE = new RegExp(
  '\\b(?:sed\\s+-i(?:\\s+(?![-\\s])' + WORD + ')?|perl\\s+-i\\S*|patch|git\\s+apply|cp|mv|rm|truncate|install)\\b([^;|&]*)',
  'g',
);

// `>` / `>>`, not preceded by `>` or `&` (so `2>&1` and `>>` are handled once).
// A leading fd digit (`2>`) is fine — the capture is the destination path.
const REDIRECT_RE = new RegExp('(?<![>&])>{1,2}\\s*(' + WORD + ')', 'g');
const TEE_RE = new RegExp('\\btee\\b((?:\\s+-' + WORD + ')*)((?:\\s+' + WORD + ')*)', 'g');
const DD_OF_RE = new RegExp('\\bof=(' + WORD + ')', 'g');

/**
 * Every path this command plausibly WRITES to. Best-effort by design — see the
 * header for what it deliberately does not catch.
 * @param {string} command
 * @returns {string[]}
 */
export function writeTargets(command) {
  const cmd = String(command || '');
  const targets = [];

  for (const m of cmd.matchAll(REDIRECT_RE)) targets.push(m[1]);
  for (const m of cmd.matchAll(DD_OF_RE)) targets.push(m[1]);

  for (const m of cmd.matchAll(TEE_RE)) {
    for (const arg of String(m[2] || '').trim().split(/\s+/)) {
      if (arg) targets.push(arg);
    }
  }

  for (const m of cmd.matchAll(FILE_ARG_CMD_RE)) {
    for (const arg of String(m[1] || '').trim().split(/\s+/)) {
      if (arg && !arg.startsWith('-')) targets.push(arg);
    }
  }

  return targets.filter(Boolean);
}

/** True when `path` names one of the guarded config surfaces. */
export function isGuardedPath(path) {
  return GUARDED_RE.test(String(path || ''));
}

/** True when a Bash command writes to a guarded config surface. */
export function isGuardedBashWrite(command) {
  return writeTargets(command).some(isGuardedPath);
}

const HOW_TO_OVERRIDE =
  'To proceed, HELM_CONFIG_EDIT=1 must be set in the environment Claude Code was ' +
  'LAUNCHED with — exporting it inside a Bash tool call does not reach this hook. ' +
  'Restart with: HELM_CONFIG_EDIT=1 claude. This confirms the config change is ' +
  'intentional; the actual review happens on the PR.';

function blockedMessage(what) {
  return (
    `BLOCKED by guard-config-change: ${what} writes to a protected control-plane ` +
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
