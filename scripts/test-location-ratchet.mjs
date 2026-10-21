#!/usr/bin/env node
/**
 * test-location-ratchet.mjs: the number of test files under src/test/** may only
 * go DOWN.
 *
 * New tests go in a `__tests__/` folder next to the code they cover (AGENTS.md,
 * "Verification"). `src/test/**` is the older, centralized location; its files
 * stay where they are until they are moved, but nothing new should land there.
 * This script counts them and fails when the count grows past the baseline.
 * Moving a test next to its code, or deleting a dead one, lowers the count;
 * run with --update to lock the gain in.
 *
 *   node scripts/test-location-ratchet.mjs            # check (exit 1 on a regression)
 *   node scripts/test-location-ratchet.mjs --update   # rewrite the baseline after moving tests
 *   node scripts/test-location-ratchet.mjs --list     # print the files
 *
 * Baseline: .test-location-baseline.json. Only rewrite it to a LOWER count.
 * Support files that are not tests (stubs, fixtures, helpers) are not counted.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = resolve(ROOT, '.test-location-baseline.json');
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

export function listLegacyTests(root = ROOT) {
  // Tracked plus new-but-unstaged files, so a local run sees what CI will.
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'src/test'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(out.split('\0'))].filter((f) => TEST_FILE.test(f) && existsSync(resolve(root, f))).sort();
}

function main() {
  const files = listLegacyTests();
  if (process.argv.includes('--list')) for (const f of files) console.log(f);
  console.log(`test files under src/test/**: ${files.length}`);

  if (process.argv.includes('--update')) {
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          $comment:
            'Test files under src/test/**. May only go DOWN: new tests go in a __tests__/ folder next to the code ' +
            '(AGENTS.md). After moving or deleting tests run `node scripts/test-location-ratchet.mjs --update`.',
          legacyTestFiles: files.length,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Wrote ${BASELINE_PATH}`);
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error('test-location-ratchet: no baseline. Run `node scripts/test-location-ratchet.mjs --update` once.');
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).legacyTestFiles;
  if (files.length > baseline) {
    console.error(
      `\ntest-location-ratchet: REGRESSION: ${files.length} > baseline ${baseline}.\n` +
        'A new test landed under src/test/**. Put it in a __tests__/ folder next to the code it covers.\n',
    );
    process.exit(1);
  }
  if (files.length < baseline) {
    console.log(`test-location-ratchet: improved (${files.length} < ${baseline}). Run with --update to lock it in.`);
  } else {
    console.log('test-location-ratchet: holds.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
