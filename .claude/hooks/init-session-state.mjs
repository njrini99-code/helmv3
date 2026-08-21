#!/usr/bin/env node
// .claude/hooks/init-session-state.mjs — SessionStart
//
// Runs ALONGSIDE session-context.sh (does not replace or reorder it — both
// are separate entries under the same SessionStart matcher). Creates this
// session's append-only event ledger and announces the OS in a few lines.
// Spec §8: "Do not dump the whole OS into SessionStart output."
import { existsSync } from 'node:fs';
import { sessionStatePath, appendEvent } from './lib/session-state.mjs';

async function main() {
  const input = await readStdinJson();
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const sessionId = input.session_id || `unknown-${process.pid}`;
  const source = input.source || 'startup';

  // "resume" must NOT blow away an existing session-state file for the same
  // id — everything else (startup/clear/fork/compact) gets a fresh ledger if
  // one doesn't already exist for this session id.
  const statePath = sessionStatePath(repoRoot, sessionId);
  if (source !== 'resume' || !existsSync(statePath)) {
    appendEvent(repoRoot, sessionId, { type: 'session_start', session_id: sessionId, source });
  }

  const ctx = [
    'GolfHelm Engineering OS is active. Router: memory/registry.yml -> memory/features/*.',
    'Full contract: memory/system/golfhelm-engineering-os.md.',
    'Governed golf/baseball/db edits require loaded feature context (session-attributed, not git-inferred).',
    'Daily reliability never deploys production; release is owner-approved, capped 2/week (config/release-policy.yml).',
  ].join('\n');

  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }),
  );
  process.exit(0);
}

function readStdinJson() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

// SessionStart must never hard-fail a session over a recording miss.
main().catch(() => process.exit(0));
