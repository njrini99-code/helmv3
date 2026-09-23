#!/usr/bin/env node
/**
 * check-front-door.mjs — fail if the always-loaded context exceeds its
 * token budget.
 *
 * The front door is what every session pays for before its first file read:
 * CLAUDE.md, AGENTS.md (imported by CLAUDE.md), and every `.claude/rules/*.md`
 * without `paths:` frontmatter (a rule with `paths:` loads only when a
 * matching file is read). Growing it to answer one task's question taxes
 * every other task forever; the budget below makes that a gate.
 *
 * Token estimate: bytes / 4 (rough, stable, dependency-free).
 *
 * Usage:
 *   node scripts/knowledge/check-front-door.mjs
 *
 * Pure stdlib.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_TOKENS = 10_000;
const BYTES_PER_TOKEN = 4;
const RULES_DIR = '.claude/rules';

/** Frontmatter must open on the first line for Claude Code to honor `paths:`. */
function isPathScoped(text) {
  if (!text.startsWith('---\n')) return false;
  const end = text.indexOf('\n---', 4);
  return end !== -1 && /^paths:/m.test(text.slice(4, end));
}

const FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  ...readdirSync(RULES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(RULES_DIR, f))
    .filter((f) => !isPathScoped(readFileSync(f, 'utf8'))),
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
