#!/usr/bin/env node
/**
 * Bulk-files the BaseballHelm bug-audit findings (see ./issues.mjs) as GitHub
 * issues via the `gh` CLI.
 *
 * This script exists because automated agents in this workspace only have
 * read-only `gh` access (no issue-creation tool) — a human must run this with
 * their own authenticated `gh` to actually file the issues.
 *
 * Usage:
 *   node scripts/baseballhelm-bug-audit/create-issues.mjs --dry-run   # preview only, no API calls
 *   node scripts/baseballhelm-bug-audit/create-issues.mjs --yes       # actually create all issues
 *   node scripts/baseballhelm-bug-audit/create-issues.mjs --yes --start 10 --end 15  # subset, 1-indexed inclusive
 *
 * Requires: `gh` CLI installed and authenticated (`gh auth status`).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { issues } from './issues.mjs';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirmed = args.includes('--yes');
const startIdx = args.includes('--start') ? Number(args[args.indexOf('--start') + 1]) : 1;
const endIdx = args.includes('--end') ? Number(args[args.indexOf('--end') + 1]) : issues.length;

if (!isDryRun && !isConfirmed) {
  console.error(
    'Refusing to create issues without --yes (or use --dry-run to preview).\n' +
      'Example: node scripts/baseballhelm-bug-audit/create-issues.mjs --dry-run'
  );
  process.exit(1);
}

const selected = issues.slice(startIdx - 1, endIdx);

console.log(
  `${isDryRun ? '[DRY RUN] ' : ''}Preparing to file ${selected.length} of ${issues.length} BaseballHelm bug-audit issues (range ${startIdx}-${endIdx}).\n`
);

let created = 0;
let failed = 0;

for (const [i, issue] of selected.entries()) {
  const num = startIdx + i;
  console.log(`[${num}/${issues.length}] ${issue.title}`);

  if (isDryRun) {
    console.log(`    labels: ${issue.labels.join(', ')}`);
    continue;
  }

  const tmpFile = join(tmpdir(), `baseballhelm-issue-${num}-${Date.now()}.md`);
  writeFileSync(tmpFile, issue.body, 'utf8');

  try {
    const output = execFileSync(
      'gh',
      [
        'issue',
        'create',
        '--title',
        issue.title,
        '--body-file',
        tmpFile,
        '--label',
        issue.labels.join(','),
      ],
      { encoding: 'utf8' }
    );
    console.log(`    -> ${output.trim()}`);
    created += 1;
  } catch (err) {
    console.error(`    FAILED: ${err.message}`);
    failed += 1;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // best-effort cleanup
    }
  }
}

if (!isDryRun) {
  console.log(`\nDone. Created ${created}, failed ${failed}.`);
}
