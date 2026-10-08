#!/usr/bin/env node
/**
 * any-ratchet.mjs: the type-escape-hatch count may only go DOWN.
 *
 * Production's database lacks some pending functions, so `src/lib/types/database.ts`
 * cannot be regenerated to cover every table yet. Until it can, code reaches
 * untyped tables through `fromUntyped` (src/lib/supabase/untyped.ts) and
 * sometimes through a bare `any`. Both are debt, and neither is visible to the
 * compiler. This script counts them and fails when a count grows past the
 * committed baseline, so new code cannot add to the pile while the old code is
 * paid down.
 *
 * What it counts (production source only; tests are excluded):
 *   fromUntyped   files under src/ that import `fromUntyped`
 *   explicitAny   `any` type keywords under src/ (annotations, `as any`,
 *                 `any[]`, generics), counted from the TypeScript syntax tree.
 *                 Lines carrying an eslint-disable for no-explicit-any count
 *                 too: the disable hides the debt from ESLint, not from here.
 *
 *   node scripts/any-ratchet.mjs            # check (exit 1 on a regression)
 *   node scripts/any-ratchet.mjs --update   # rewrite the baseline after paying down
 *   node scripts/any-ratchet.mjs --list     # print every offending file with its counts
 *
 * Baseline: .any-ratchet-baseline.json. Only rewrite it to LOWER counts. A
 * rewrite that raises a count is weakening the gate.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = resolve(ROOT, '.any-ratchet-baseline.json');
const TEST_FILE = /(^|\/)(__tests__|test|tests)\/|\.(test|spec)\.[cm]?[jt]sx?$|\.d\.ts$/;

export function listSourceFiles(root = ROOT) {
  // Tracked plus new-but-unstaged files, so a local run sees what CI will.
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'src'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(out.split('\0'))].filter((f) => /\.(ts|tsx)$/.test(f) && !TEST_FILE.test(f) && existsSync(resolve(root, f)));
}

/** Counts for one file's source text. Pure. */
export function countFile(fileName, text) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let anyCount = 0;
  let importsFromUntyped = false;
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) anyCount += 1;
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      node.importClause.namedBindings.elements.some((el) => (el.propertyName ?? el.name).text === 'fromUntyped')
    ) {
      importsFromUntyped = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { explicitAny: anyCount, fromUntyped: importsFromUntyped ? 1 : 0 };
}

export function measure(root = ROOT) {
  const totals = { fromUntyped: 0, explicitAny: 0 };
  const perFile = [];
  for (const file of listSourceFiles(root)) {
    const c = countFile(file, readFileSync(resolve(root, file), 'utf8'));
    totals.fromUntyped += c.fromUntyped;
    totals.explicitAny += c.explicitAny;
    if (c.fromUntyped || c.explicitAny) perFile.push({ file, ...c });
  }
  return { totals, perFile };
}

/** Which counts grew past the baseline. Pure. */
export function regressions(current, baseline) {
  return Object.keys(baseline)
    .filter((k) => k !== '$comment' && typeof baseline[k] === 'number')
    .filter((k) => (current[k] ?? 0) > baseline[k])
    .map((k) => `${k}: ${current[k]} > baseline ${baseline[k]}`);
}

function main() {
  const { totals, perFile } = measure();
  if (process.argv.includes('--list')) {
    for (const f of perFile.sort((a, b) => b.explicitAny - a.explicitAny)) {
      console.log(`${String(f.explicitAny).padStart(4)} any  ${f.fromUntyped ? 'fromUntyped' : '           '}  ${f.file}`);
    }
  }
  console.log(`fromUntyped imports: ${totals.fromUntyped}`);
  console.log(`explicit any:        ${totals.explicitAny}`);

  if (process.argv.includes('--update')) {
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          $comment:
            'Production source under src/ (tests excluded). May only go DOWN: pay debt down, then run ' +
            '`node scripts/any-ratchet.mjs --update`. Never raise a number to get green.',
          fromUntyped: totals.fromUntyped,
          explicitAny: totals.explicitAny,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Wrote ${BASELINE_PATH}`);
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error('any-ratchet: no baseline. Run `node scripts/any-ratchet.mjs --update` once.');
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const bad = regressions(totals, baseline);
  if (bad.length) {
    console.error(`\nany-ratchet: REGRESSION\n  ${bad.join('\n  ')}\n`);
    console.error('Type the query instead (src/lib/types/database.ts) or use a real type. See `--list` for where the counts are.');
    process.exit(1);
  }
  const better = Object.keys(baseline).filter((k) => typeof baseline[k] === 'number' && totals[k] < baseline[k]);
  if (better.length) {
    console.log(`any-ratchet: improved (${better.map((k) => `${k} ${totals[k]} < ${baseline[k]}`).join(', ')}). Run with --update to lock it in.`);
  } else {
    console.log('any-ratchet: holds.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
