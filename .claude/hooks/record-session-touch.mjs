#!/usr/bin/env node
// .claude/hooks/record-session-touch.mjs — PostToolUse / Write|Edit|MultiEdit
//
// The ONLY hook in its matcher block (settings.json). Spec §11 planned
// "successful edit -> record session-owned path -> existing formatting/lint",
// with a post-edit.sh running after this one; that script was never wired and
// does not exist, so nothing formats an edited file — `npm run lint` and CI
// do. PostToolUse only fires after a tool completes successfully (failures go
// to a separate PostToolUseFailure event per the live hooks docs) — no extra
// success check needed here.
//
// This is the primitive that replaces stop-verify.sh's git-diff-based
// attribution: the write event itself knows, with certainty, which session
// wrote which file. git status --porcelain never could — it sees a dirty
// tree shared by every session in this checkout, never who dirtied it.
import { appendEvent } from './lib/session-state.mjs';
import { mapPathToFeatures, toRepoRelative, resolveRepoRoot, isWithinRepo } from './lib/feature-map.mjs';

async function main() {
  const input = await readStdinJson();
  const repoRoot = resolveRepoRoot(input);
  const sessionId = input.session_id || `unknown-${process.pid}`;
  const filePath = input.tool_input?.file_path;
  if (!filePath) {
    process.exit(0);
    return;
  }

  // Session scratchpad/staging paths (e.g. /private/tmp/claude-.../scratchpad/)
  // are not repo state — there is nothing there to gate, so no touch event is
  // recorded for them at all. This is the fix for a live 2026-08-21 incident:
  // the old git-diff-based stop-verify.sh counted such files as "touched,
  // unverified" and demanded gates be run against paths outside the repo.
  if (!isWithinRepo(repoRoot, filePath)) {
    process.exit(0);
    return;
  }

  try {
    const relPath = toRepoRelative(repoRoot, filePath);
    const { features } = await mapPathToFeatures(repoRoot, relPath);
    appendEvent(repoRoot, sessionId, { type: 'touch', path: relPath, feature_ids: features.map((f) => f.id) });
  } catch {
    // PostToolUse cannot block, and this hook must never be the reason a
    // write "fails" from Claude's perspective — never throw past this point.
  }
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

main();
