#!/usr/bin/env node
// .claude/hooks/guard-config-change.mjs — PreToolUse / Write|Edit|MultiEdit|Bash
//
// Refuses a change to one of the control-plane config surfaces —
// `.claude/settings.json`, anything under `.claude/hooks/`, `.mcp.json`, or
// anything under `.github/workflows/` — WHEN THE TARGET IS INSIDE THE CANONICAL
// CHECKOUT. A config surface in a task worktree is not guarded at all.
//
// Scope is the whole point. This is a confirmation gate, not a review gate: the
// review that actually catches a bad config change happens on the PR. A guard
// that also refused the edit in the worktree where the PR is written bought no
// review and cost the agent the ability to fix its own tooling — including this
// file, whose repair it refused. Canonical is the shared checkout every session
// resolves `$CLAUDE_PROJECT_DIR` to and the one a hook is read from on every
// invocation, so an edit there takes effect immediately, for everyone, unseen.
// That is worth a gate. A branch is not.
//
// `HELM_CONFIG_EDIT=1` still lifts the gate for canonical, and must be set in
// the environment Claude Code is LAUNCHED with — this hook's process inherits
// that environment, so an `export` inside a Bash tool call never reaches it.
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

import { resolveActiveRoot, canonicalRootOf } from './lib/workspace-identity.mjs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

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

/**
 * True when `target` lands inside the canonical checkout.
 *
 * Canonical comes from git itself, the same source guard-canonical-write.mjs
 * uses, so a worktree is never mistaken for it. A relative target is resolved
 * against a leading `cd` in the command when there is one, and otherwise
 * against this process's cwd.
 *
 * Fails OPEN: if canonical cannot be resolved, nothing is guarded. An agent
 * unable to edit config is a real, daily cost; a config edit landing on a
 * branch is reviewed on the PR like every other change.
 */
export function isInsideCanonical(target, baseDir) {
  const raw = String(target || '');
  if (!raw) return false;
  let canonicalRoot;
  try {
    canonicalRoot = canonicalRootOf(resolveActiveRoot(baseDir || process.cwd()));
  } catch {
    return false;
  }
  if (!canonicalRoot) return false;
  const abs = isAbsolute(raw) ? raw : resolve(baseDir || process.cwd(), raw);
  const rel = relative(canonicalRoot, abs);
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel));
}

/** The directory a command runs in, when it opens with an unambiguous `cd`. */
export function baseDirOf(command) {
  const m = String(command || '').match(/^\s*cd\s+("[^"]+"|'[^']+'|[^\s;|&]+)/);
  if (!m) return null;
  const dir = m[1].replace(/^["']|["']$/g, '');
  if (dir.includes('$')) return null;
  return dir.startsWith('~') ? (process.env.HOME || '') + dir.slice(1) : dir;
}

/** True when `path` names one of the guarded config surfaces. */
export function isGuardedPath(path) {
  return GUARDED_RE.test(String(path || ''));
}

/**
 * True when a Bash command writes to a guarded config surface INSIDE canonical.
 */
export function isGuardedBashWrite(command) {
  const baseDir = baseDirOf(command);
  return writeTargets(command).some(
    (t) => isGuardedPath(t) && isInsideCanonical(t, baseDir),
  );
}

const HOW_TO_OVERRIDE =
  'Only the canonical checkout is guarded: make this change in a task worktree ' +
  '(scripts/new-worktree.sh <task>) and it ships through the PR like any other. ' +
  'To edit canonical directly instead, HELM_CONFIG_EDIT=1 must be set in the ' +
  'environment Claude Code was LAUNCHED with — exporting it inside a Bash tool ' +
  'call does not reach this hook. Restart with: HELM_CONFIG_EDIT=1 claude \u{2014} but ' +
  'that reaches Bash writes only: on Write/Edit/MultiEdit guard-canonical-write.mjs ' +
  'still refuses canonical and has no override at all.';

function blockedMessage(what) {
  return (
    `BLOCKED by guard-config-change: ${what} writes to a protected control-plane ` +
    `config surface inside the canonical checkout (.claude/settings.json, ` +
    `.claude/hooks/*, .mcp.json, .github/workflows/*). ${HOW_TO_OVERRIDE}\n`
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
    if (isGuardedPath(filePath) && isInsideCanonical(filePath)) {
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
