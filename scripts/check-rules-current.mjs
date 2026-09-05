#!/usr/bin/env node
// scripts/check-rules-current.mjs
//
// Rules files (AGENTS.md, CLAUDE.md, .claude/rules/*.md) must state current
// behavior only. History — "this used to say X", a verified/re-checked date,
// a hardcoded count — belongs in memory/incidents/, a baseline file, or an
// AUTOGEN block, never in a file every session loads. This is the gate that
// keeps that true: it fails on a history phrase, a bare date, a `verified:`
// frontmatter key, a count-in-prose pattern, a single rules file over 80
// lines, or the always-on total (AGENTS.md + CLAUDE.md + every
// .claude/rules/*.md file with no `paths:` frontmatter) over 300 lines.
//
// Wire-up: `npm run docs:rules-current`, a step of `docs:check`.
//
// Usage: node scripts/check-rules-current.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const RULES_DIR = '.claude/rules';
const ALWAYS_ON_EXTRA = ['AGENTS.md', 'CLAUDE.md'];
const MAX_RULE_FILE_LINES = 80;
const MAX_ALWAYS_ON_TOTAL = 300;

// Trailing-newline-insensitive line count, matching `wc -l` for a file that
// ends in a single trailing newline (the normal case for a text file).
function countLines(text) {
  return text.replace(/\n$/, '').split('\n').length;
}

const HISTORY_PATTERNS = [
  { name: 'until-date', re: /\buntil 20\d{2}-/i },
  { name: 'previously-claimed', re: /\bpreviously (said|read|claimed)\b/i },
  { name: 'used-to', re: /\bused to (say|read|end|spell)\b/i },
  {
    name: 'this-x-said',
    re: /\bthis (line|bullet|section|paragraph) (said|read|claimed)\b/i,
  },
];

const DATE_RE = /\b(19|20)\d{2}-\d{2}-\d{2}\b/;
const VERIFIED_KEY_RE = /^verified:/;
const COUNT_IN_PROSE_RE =
  /\b\d{2,}\s+(tables|scripts|branches|migrations|files|checks|rules)\b/i;

function hasFrontmatterPathsKey(text) {
  // Frontmatter is the first `---`/`---` fenced block in the file — it need
  // not start at byte 0 (quality-gates.md, for one, opens with a
  // markdownlint-disable comment before the fence).
  const lines = text.split('\n');
  const start = lines.indexOf('---');
  if (start === -1) return false;
  const end = lines.indexOf('---', start + 1);
  if (end === -1) return false;
  return lines.slice(start + 1, end).some((l) => /^paths:/.test(l));
}

function listRuleFiles() {
  return readdirSync(join(ROOT, RULES_DIR))
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(RULES_DIR, f));
}

function checkFile(relPath, { enforceFileCap }) {
  const problems = [];
  const text = readFileSync(join(ROOT, relPath), 'utf8');
  const lines = text.split('\n');
  const lineCount = countLines(text);

  if (enforceFileCap && lineCount > MAX_RULE_FILE_LINES) {
    problems.push(
      `${relPath}: ${lineCount} lines (max ${MAX_RULE_FILE_LINES})`,
    );
  }

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    for (const { name, re } of HISTORY_PATTERNS) {
      if (re.test(line)) {
        problems.push(
          `${relPath}:${lineNo}: history phrase (${name}) — ${line.trim().slice(0, 100)}`,
        );
      }
    }
    if (DATE_RE.test(line)) {
      problems.push(
        `${relPath}:${lineNo}: date literal — ${line.trim().slice(0, 100)}`,
      );
    }
    if (VERIFIED_KEY_RE.test(line)) {
      problems.push(
        `${relPath}:${lineNo}: verified: frontmatter key — staleness markers must not be a date`,
      );
    }
    if (COUNT_IN_PROSE_RE.test(line)) {
      problems.push(
        `${relPath}:${lineNo}: count in prose — ${line.trim().slice(0, 100)}`,
      );
    }
  });

  return { problems, lineCount };
}

function main() {
  const problems = [];
  let alwaysOnTotal = 0;

  for (const relPath of ALWAYS_ON_EXTRA) {
    const { problems: fileProblems, lineCount } = checkFile(relPath, {
      enforceFileCap: false,
    });
    problems.push(...fileProblems);
    alwaysOnTotal += lineCount;
  }

  for (const relPath of listRuleFiles()) {
    const text = readFileSync(join(ROOT, relPath), 'utf8');
    const isAlwaysOn = !hasFrontmatterPathsKey(text);
    const { problems: fileProblems, lineCount } = checkFile(relPath, {
      enforceFileCap: true,
    });
    problems.push(...fileProblems);
    if (isAlwaysOn) alwaysOnTotal += lineCount;
  }

  if (alwaysOnTotal > MAX_ALWAYS_ON_TOTAL) {
    problems.push(
      `always-on total: ${alwaysOnTotal} lines (max ${MAX_ALWAYS_ON_TOTAL}) — ` +
        'AGENTS.md + CLAUDE.md + every .claude/rules/*.md file with no paths: frontmatter',
    );
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(
      `\ndocs:rules-current FAILED — ${problems.length} violation(s). ` +
        'Rules files must state current behavior only; history belongs in memory/incidents/.',
    );
    process.exit(1);
  }

  console.log(
    `docs:rules-current PASSED — always-on total ${alwaysOnTotal}/${MAX_ALWAYS_ON_TOTAL} lines.`,
  );
}

main();
