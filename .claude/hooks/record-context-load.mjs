#!/usr/bin/env node
// .claude/hooks/record-context-load.mjs — PostToolUse / Read|Bash
//
// Records that THIS session actually loaded feature context, from real tool
// events only. Spec §9: "Do not let Claude mark context 'loaded' by writing a
// flag — state comes from actual tool events." Two triggers:
//   - Read of a path that IS a registry `docs.feature` value (i.e. a
//     canonical current-state feature doc — not just anything under
//     memory/features/, since that convention doesn't hold for every
//     feature; see lib/feature-map.mjs's buildFeatureDocIndex).
//   - Bash running `npm run knowledge:map` / `knowledge:context` — the
//     command's `--files` args are re-mapped in-process through the same
//     registry the gate uses, not by parsing the command's stdout, so this
//     doesn't depend on that script's exact print format.
import { appendEvent } from './lib/session-state.mjs';
import { mapPathToFeatures, buildFeatureDocIndex, toRepoRelative, resolveRepoRoot } from './lib/feature-map.mjs';

async function main() {
  const input = await readStdinJson();
  const repoRoot = resolveRepoRoot(input);
  const sessionId = input.session_id || `unknown-${process.pid}`;
  const toolName = input.tool_name;

  try {
    if (toolName === 'Read') {
      await handleRead(repoRoot, sessionId, input);
    } else if (toolName === 'Bash') {
      await handleBash(repoRoot, sessionId, input);
    }
  } catch {
    // PostToolUse cannot block the turn, and a recording miss here only
    // degrades the context gate to "ask again" — never crash over it.
  }
  process.exit(0);
}

async function handleRead(repoRoot, sessionId, input) {
  const filePath = input.tool_input?.file_path;
  if (!filePath) return;
  const relPath = toRepoRelative(repoRoot, filePath);
  // Every registry docs.feature value lives under memory/ or docs/ (verified
  // live against the real registry — one feature's canonical doc,
  // feature_awareness_system's, is the sole docs/ exception to the memory/
  // convention). Skip the registry parse entirely for anything else — this
  // is a PostToolUse hook on every Read in the repo, and most reads are
  // source code, not a feature doc.
  if (!relPath.startsWith('memory/') && !relPath.startsWith('docs/')) return;
  const docIndex = await buildFeatureDocIndex(repoRoot);
  const featureId = docIndex.get(relPath);
  if (!featureId) return;
  appendEvent(repoRoot, sessionId, {
    type: 'context_load',
    source: 'read',
    path: relPath,
    feature_ids: [featureId],
  });
}

async function handleBash(repoRoot, sessionId, input) {
  const command = input.tool_input?.command;
  if (!command || !/npm\s+run\s+knowledge:(map|context)\b/.test(command)) return;

  const files = extractFilesArg(command);
  if (files.length === 0) return;

  const relFiles = [...new Set(files.map((f) => toRepoRelative(repoRoot, f)))];
  const results = await Promise.all(relFiles.map((f) => mapPathToFeatures(repoRoot, f)));
  const featureIds = [...new Set(results.flatMap((r) => r.features.map((f) => f.id)))];

  if (featureIds.length > 0) {
    appendEvent(repoRoot, sessionId, { type: 'context_load', source: 'bash', command, feature_ids: featureIds });
  } else {
    // Zero matches is the "acknowledged gap" signal lib/stop-check.mjs looks
    // for (unmappedAcknowledged) — recorded per-file, `unmapped: true`, so the
    // Stop gate can find the exact path the session already ran knowledge:map
    // against. (An edit-time guard-feature-context.mjs used to consume this
    // too; it no longer exists, and the Stop gate is the only reader.)
    for (const relPath of relFiles) {
      appendEvent(repoRoot, sessionId, {
        type: 'context_load',
        source: 'bash',
        command,
        path: relPath,
        feature_ids: [],
        unmapped: true,
      });
    }
  }
}

/** Everything after `--files` up to the next `--flag` (e.g. `--task`). */
function extractFilesArg(command) {
  const idx = command.indexOf('--files');
  if (idx === -1) return [];
  const rest = command.slice(idx + '--files'.length).trim();
  const files = [];
  for (const tok of rest.split(/\s+/)) {
    if (tok.startsWith('--')) break;
    const cleaned = tok.replace(/^["']|["']$/g, '');
    if (cleaned) files.push(cleaned);
  }
  return files;
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
