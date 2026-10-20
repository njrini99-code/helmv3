// .claude/hooks/lib/session-state.mjs — per-session state file path.
//
// `.claude/session-state/<session_id>.jsonl` (gitignored) is the per-session
// file path the PreCompact hook (save-session-state.mjs) tails. No hook
// writes it any more: the PostToolUse ledger that once appended to it was
// retired, along with its writer, reader and fold helpers. The path helper
// stays so a resumed session's snapshot shape is unchanged; a missing file
// reads as an empty tail.
import { join } from 'node:path';

export function sessionStatePath(repoRoot, sessionId) {
  return join(repoRoot, '.claude/session-state', `${safeId(sessionId)}.jsonl`);
}

function safeId(sessionId) {
  return String(sessionId || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
}
