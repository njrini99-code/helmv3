#!/usr/bin/env node
/**
 * Fail the build on `.limit(N)` where N > PostgREST's 1,000-row cap —
 * INCLUDING when N is a named constant.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE AST-GREP RULE.
 * `.coderabbit/ast-grep/no-limit-above-postgrest-cap.yml` catches literals.
 * It is syntactic, so it cannot see through `.limit(SHOT_DRIVERS_FETCH_CAP)`
 * — and that is exactly where the worst instance hid:
 *
 *   SHOT_DRIVERS_FETCH_CAP = 25_000, passed to .limit(), with no ORDER BY.
 *   PostgREST returned 1,000, so shot-driver analysis for any player past
 *   1,000 shots was computed from an ARBITRARY subset. Measured 2026-07-31:
 *   6 of 33 players were already over that line.
 *
 * The lint rule shipped with a fixture noting that a const "still slips
 * through". This closes that.
 *
 * HOW: resolve module-scope numeric consts per file, then scan real code lines.
 * Comments are skipped deliberately — an earlier version of this scan reported
 * a `.limit(...)` written inside a comment explaining why the author does NOT
 * do that, and a sibling scan reported 13 phantom cron-auth gaps by matching
 * CRON_SECRET in doc comments.
 *
 * Usage:  node scripts/check-row-cap-limits.mjs [--json]
 * Exit 1 with the offending sites, 0 when clean.
 */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'scripts'];
/** PostgREST's server-side per-request row cap. Exactly 1000 is honest. */
const POSTGREST_MAX_ROWS = 1000;

/** Tests may legitimately ask for more — one asserting what the cap DOES has
 *  to exceed it. Rule-pack fixtures are intentionally broken. */
const EXEMPT = /(\.test\.tsx?$|__tests__|^src\/test\/|^\.coderabbit\/)/;

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      out.push(...(await walk(p)));
    } else if (/\.(ts|tsx|mjs)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Module-scope `const NAME = 1234;` only. A value built from an expression is
 *  deliberately out of scope — better to miss one than to guess and cry wolf. */
function numericConsts(source) {
  const map = new Map();
  const re = /^const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*number\s*)?=\s*([0-9_]+)\s*;/gm;
  let m;
  while ((m = re.exec(source)) !== null) map.set(m[1], Number(m[2].replace(/_/g, '')));
  return map;
}

const isComment = (line) => {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

const findings = [];
for (const dir of SCAN_DIRS) {
  for (const file of await walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    if (EXEMPT.test(rel)) continue;
    const src = readFileSync(file, 'utf8');
    const consts = numericConsts(src);
    src.split('\n').forEach((line, i) => {
      if (isComment(line)) return;
      const m = /\.limit\(\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\s*\)/.exec(line);
      if (!m) return;
      const arg = m[1];
      const value = /^\d+$/.test(arg) ? Number(arg) : consts.get(arg);
      if (value === undefined || value <= POSTGREST_MAX_ROWS) return;
      findings.push({ file: rel, line: i + 1, arg, value });
    });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
} else if (findings.length === 0) {
  console.log(`OK  no .limit() above PostgREST's ${POSTGREST_MAX_ROWS}-row cap`);
} else {
  console.error(`FAIL  ${findings.length} .limit() call(s) above PostgREST's ${POSTGREST_MAX_ROWS}-row cap:\n`);
  for (const f of findings) {
    const shown = /^\d+$/.test(f.arg) ? f.arg : `${f.arg} = ${f.value}`;
    console.error(`  ${f.file}:${f.line}   .limit(${shown})`);
  }
  console.error(
    `\nPostgREST truncates every response at ${POSTGREST_MAX_ROWS} rows, so a larger` +
      `\nnumber is silently wrong — you get ${POSTGREST_MAX_ROWS}, not what you asked for, and any` +
      `\n"short page means drained" check against a bigger threshold can never fire.` +
      `\n\nFix one of:` +
      `\n  need <= ${POSTGREST_MAX_ROWS}?       .limit(N)` +
      `\n  bounded drain page?    .limit(${POSTGREST_MAX_ROWS}), compare short-page against ${POSTGREST_MAX_ROWS}` +
      `\n  need every row?        fetchAllRows / fetchAllRowsResult, with a stable` +
      `\n                         .order() and the ceiling enforced by stopping` +
      `\n                         page accumulation\n`,
  );
}

process.exit(findings.length === 0 ? 0 : 1);
