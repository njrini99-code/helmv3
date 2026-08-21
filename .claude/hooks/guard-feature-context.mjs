#!/usr/bin/env node
// .claude/hooks/guard-feature-context.mjs — PreToolUse / Write|Edit|MultiEdit
//
// Spec §10: block feature code writes until context is loaded. Sits in the
// SAME matcher block as guard-sql.sh (settings.json) — confirmed from the
// live hooks docs that PreToolUse precedence is deny > defer > ask > allow,
// so this hook needs no coordination with guard-sql.sh; either can deny
// independently.
//
// exit 0                = no objection
// exit 2 (stderr reason) = BLOCK — same contract as guard-bash.sh / guard-sql.sh
import { readEvents, foldState } from './lib/session-state.mjs';
import {
  mapPathToFeatures,
  toRepoRelative,
  resolveRepoRoot,
  isGoverned,
  isExcluded,
} from './lib/feature-map.mjs';

async function main() {
  const input = await readStdinJson();
  const repoRoot = resolveRepoRoot(input);
  const sessionId = input.session_id || `unknown-${process.pid}`;
  const filePath = input.tool_input?.file_path;
  if (!filePath) process.exit(0);

  const relPath = toRepoRelative(repoRoot, filePath);

  if (isExcluded(relPath)) process.exit(0);
  if (!isGoverned(relPath)) process.exit(0);

  const { features } = await mapPathToFeatures(repoRoot, relPath);
  const events = readEvents(repoRoot, sessionId);
  const state = foldState(events);

  if (features.length === 0) {
    if (state.unmappedAcknowledged.has(relPath)) process.exit(0);
    block(`BLOCKED: '${relPath}' is under a governed path (golf/baseball/database) but maps to NO feature in memory/registry.yml.
This is an explicit gap, not a silent allow (spec §10). Either:
  1. Run: npm run knowledge:map -- --files ${relPath}
     (this session then has an acknowledged-gap record and the write is allowed), or
  2. Add a feature mapping for this path to memory/registry.yml.`);
  }

  const missing = features.filter((f) => !state.loadedFeatureIds.has(f.id));
  if (missing.length > 0) {
    const remedies = missing
      .map((f) => {
        const doc = (f.docs && f.docs[0]) || `memory/features/${f.id}.md`;
        return `  - ${f.id}: read ${doc}, or run: npm run knowledge:context -- --files ${relPath} --task "<your task>"`;
      })
      .join('\n');
    block(`BLOCKED: '${relPath}' maps to feature(s) ${missing.map((f) => f.id).join(', ')} whose context this session has not loaded.
Load it first, then retry the edit:
${remedies}`);
  }

  process.exit(0);
}

function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
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

// An internal error here (e.g. a malformed registry.yml) must fail OPEN, not
// closed — a bug in this gate blocking every governed edit repo-wide would be
// far worse than the gate occasionally missing a real gap. guard-sql.sh and
// the other PreToolUse guards fail on purpose; this one must not fail loud.
main().catch((err) => {
  process.stderr.write(`guard-feature-context: internal error, allowing by default: ${err?.message ?? err}\n`);
  process.exit(0);
});
