#!/usr/bin/env node
// .claude/hooks/lib/record-event.mjs — CLI helper, run directly by Claude
// (NOT a hook — no stdin JSON contract), e.g.:
//   node .claude/hooks/lib/record-event.mjs no-memory-change --reason format-only
//   node .claude/hooks/lib/record-event.mjs delegated-verification --path src/x.ts --pr 1234
//
// SESSION ID: hooks get `session_id` on stdin JSON from the harness (the
// Claude Code hooks contract). A directly-invoked CLI has no such stdin, so
// this falls back to the CLAUDE_CODE_SESSION_ID environment variable —
// verified live in this repo's own dev environment (not assumed) to be set
// by the harness and to match the same id used elsewhere for this session
// (e.g. the session-scoped scratchpad directory path). If a future harness
// does not set it, this fails loudly rather than silently mis-attributing.
import { appendEvent, VALID_NO_MEMORY_CHANGE_REASONS } from './session-state.mjs';
import { toRepoRelative, resolveRepoRoot } from './feature-map.mjs';

function main() {
  const [, , command, ...rest] = process.argv;
  const repoRoot = resolveRepoRoot({});
  const sessionId = requireSessionId();

  if (command === 'no-memory-change') {
    recordNoMemoryChange(repoRoot, sessionId, rest);
  } else if (command === 'delegated-verification') {
    recordDelegatedVerification(repoRoot, sessionId, rest);
  } else {
    fail(
      `Unknown command '${command}'. Usage:\n` +
        `  record-event.mjs no-memory-change --reason <reason>\n` +
        `  record-event.mjs delegated-verification --path <p> (--pr <n> | --evidence <text>)`,
    );
  }
}

// The audit that designed this flagged the no_memory_change_reason mechanism
// as unresolved design surface: there was no existing convention for an
// agent to *state* a structured reason anywhere machine-readable. This is
// that convention — a real tool event lands in the session's own ledger,
// which the rebuilt Stop gate reads back, instead of accepting a bare
// unverifiable claim in the turn's prose.
function recordNoMemoryChange(repoRoot, sessionId, args) {
  const reason = flagValue(args, '--reason');
  if (!reason || !VALID_NO_MEMORY_CHANGE_REASONS.includes(reason)) {
    fail(
      `Invalid or missing --reason. Must be exactly one of:\n  ${VALID_NO_MEMORY_CHANGE_REASONS.join('\n  ')}\n` +
        `"not needed" is never a valid reason — pick the one that actually applies, or update memory instead.`,
    );
  }
  appendEvent(repoRoot, sessionId, { type: 'no_memory_change', reason });
  console.log(`Recorded no_memory_change_reason="${reason}" for session ${sessionId}.`);
}

// Addendum, 2026-08-21: an orchestrating session whose subagents/worker
// sessions do the actual branch+PR work was getting flagged by the Stop gate
// for files it never verified ITSELF — but those files ARE verified, by the
// worker's own pre-commit gates and CI on the worker's PR. This records that
// coverage as a real event instead of asking the orchestrator to either lie
// about running gates it didn't run, or re-run gates redundantly for code it
// has no local context for.
function recordDelegatedVerification(repoRoot, sessionId, args) {
  const rawPath = flagValue(args, '--path');
  const pr = flagValue(args, '--pr');
  const evidence = flagValue(args, '--evidence');
  if (!rawPath) {
    fail('Missing --path. Usage: record-event.mjs delegated-verification --path <p> (--pr <n> | --evidence <text>)');
  }
  if (!pr && !evidence) {
    fail('Must provide at least one of --pr <n> or --evidence <text> — a bare claim of "delegated" is not evidence.');
  }
  const path = toRepoRelative(repoRoot, rawPath);
  appendEvent(repoRoot, sessionId, { type: 'delegated_verification', path, pr: pr ?? null, evidence: evidence ?? null });
  console.log(`Recorded delegated_verification for '${path}'${pr ? ` (PR #${pr})` : ''} — session ${sessionId}.`);
}

function flagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function requireSessionId() {
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId) {
    fail(
      'CLAUDE_CODE_SESSION_ID is not set in this environment — cannot attribute the event to a session. ' +
        'This helper only works inside a Claude Code session.',
    );
  }
  return sessionId;
}

function fail(message) {
  console.error(`record-event: ${message}`);
  process.exit(1);
}

main();
