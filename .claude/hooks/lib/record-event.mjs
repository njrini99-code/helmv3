#!/usr/bin/env node
// .claude/hooks/lib/record-event.mjs — CLI helper, run directly by Claude
// (NOT a hook — no stdin JSON contract), e.g.:
//   node .claude/hooks/lib/record-event.mjs no-memory-change --reason format-only
//
// The audit that designed this flagged the no_memory_change_reason mechanism
// as unresolved design surface: there was no existing convention for an
// agent to *state* a structured reason anywhere machine-readable. This is
// that convention — a real tool event lands in the session's own ledger,
// which the rebuilt Stop gate reads back, instead of accepting a bare
// unverifiable claim in the turn's prose.
//
// SESSION ID: hooks get `session_id` on stdin JSON from the harness (the
// Claude Code hooks contract). A directly-invoked CLI has no such stdin, so
// this falls back to the CLAUDE_CODE_SESSION_ID environment variable —
// verified live in this repo's own dev environment (not assumed) to be set
// by the harness and to match the same id used elsewhere for this session
// (e.g. the session-scoped scratchpad directory path). If a future harness
// does not set it, this fails loudly rather than silently mis-attributing.
import { appendEvent, VALID_NO_MEMORY_CHANGE_REASONS } from './session-state.mjs';

function main() {
  const [, , command, ...rest] = process.argv;
  if (command !== 'no-memory-change') {
    fail(`Unknown command '${command}'. Usage: record-event.mjs no-memory-change --reason <reason>`);
  }

  const reasonIdx = rest.indexOf('--reason');
  const reason = reasonIdx !== -1 ? rest[reasonIdx + 1] : undefined;
  if (!reason || !VALID_NO_MEMORY_CHANGE_REASONS.includes(reason)) {
    fail(
      `Invalid or missing --reason. Must be exactly one of:\n  ${VALID_NO_MEMORY_CHANGE_REASONS.join('\n  ')}\n` +
        `"not needed" is never a valid reason — pick the one that actually applies, or update memory instead.`,
    );
  }

  const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId) {
    fail(
      'CLAUDE_CODE_SESSION_ID is not set in this environment — cannot attribute the event to a session. ' +
        'This helper only works inside a Claude Code session.',
    );
  }

  appendEvent(repoRoot, sessionId, { type: 'no_memory_change', reason });
  console.log(`Recorded no_memory_change_reason="${reason}" for session ${sessionId}.`);
}

function fail(message) {
  console.error(`record-event: ${message}`);
  process.exit(1);
}

main();
