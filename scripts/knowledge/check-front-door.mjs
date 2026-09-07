#!/usr/bin/env node
/**
 * check-front-door.mjs — fail if the always-loaded context exceeds its
 * token budget.
 *
 * CLAUDE.md, AGENTS.md, and the rules files marked "loads every session"
 * (`.claude/rules/autonomy.md`, `shipping.md`, `code-review-tooling.md` per
 * CLAUDE.md's own header) are read on every single turn regardless of task.
 * That is the front door: growing it to answer one task's question taxes
 * every other task forever. Phase 5 declares a budget in AGENTS.md — CLAUDE
 * + AGENTS + always-on rules <= 10k tokens — and this is the check that
 * makes it a gate instead of a sentence.
 *
 * Token estimate: bytes / 4 (the same rough heuristic named in the plan;
 * not a real tokenizer, but stable and dependency-free).
 *
 * Usage:
 *   node scripts/knowledge/check-front-door.mjs
 *
 * Pure stdlib.
 */
import { readFileSync, statSync } from 'node:fs';

const BUDGET_TOKENS = 10_000;
const BYTES_PER_TOKEN = 4;

const FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.claude/rules/autonomy.md',
  '.claude/rules/shipping.md',
  '.claude/rules/code-review-tooling.md',
];

let totalBytes = 0;
const rows = [];
for (const f of FILES) {
  const bytes = statSync(f).size;
  totalBytes += bytes;
  rows.push({ file: f, bytes });
}

const totalTokens = Math.ceil(totalBytes / BYTES_PER_TOKEN);

for (const r of rows) {
  console.log(`  ${r.file}: ${r.bytes} bytes (~${Math.ceil(r.bytes / BYTES_PER_TOKEN)} tokens)`);
}
console.log(`front-door total: ${totalBytes} bytes (~${totalTokens} tokens), budget ${BUDGET_TOKENS} tokens`);

if (totalTokens > BUDGET_TOKENS) {
  console.error(
    `\n❌ Front door (CLAUDE.md + AGENTS.md + always-on rules) is ~${totalTokens} tokens, ` +
    `over the ${BUDGET_TOKENS}-token budget. Move task-specific detail out to a ` +
    'path-scoped rules file (frontmatter `paths:`) or a memory/ doc, rather than ' +
    'growing what every session pays for.',
  );
  process.exit(1);
}

console.log(`✅ Front door within budget (~${totalTokens} / ${BUDGET_TOKENS} tokens).`);
