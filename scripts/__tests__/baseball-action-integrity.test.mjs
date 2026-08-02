// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest (issue #1194).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Baseball action integrity guard (#397).
 *
 * Catches merge artifacts before they ship:
 *   - duplicated TOP-LEVEL keys in `return { ... }` object literals
 *   - consecutive duplicate return statements (unreachable dead code)
 *   - stale "types will be regenerated" comments in production action files
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const ACTIONS_DIR = join(REPO_ROOT, 'src', 'app', 'baseball', 'actions');

const STALE_TYPE_COMMENT = /types will be regenerated/i;

async function collectActionFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...(await collectActionFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Extract duplicate keys at depth 0 inside each `return { ... };` block. */
function findDuplicateTopLevelReturnKeys(source) {
  const findings = [];
  const returnRe = /return\s*\{/g;
  let match;

  while ((match = returnRe.exec(source)) !== null) {
    let i = match.index + match[0].length;
    let depth = 1;
    const keys = [];
    let expectKey = true;

    while (i < source.length && depth > 0) {
      const ch = source[i];

      if (ch === '{') {
        depth += 1;
        i += 1;
        continue;
      }

      if (ch === '}') {
        depth -= 1;
        i += 1;
        continue;
      }

      if (depth === 1 && expectKey) {
        const keyMatch = source.slice(i).match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
        if (keyMatch) {
          keys.push(keyMatch[1]);
          i += keyMatch[0].length;
          expectKey = false;
          continue;
        }
      }

      if (depth === 1 && ch === ',') {
        expectKey = true;
      }

      i += 1;
    }

    const seen = new Set();
    for (const key of keys) {
      if (seen.has(key)) {
        findings.push(key);
      }
      seen.add(key);
    }
  }

  return [...new Set(findings)];
}

function findConsecutiveDuplicateReturns(source) {
  const lines = source.split('\n');
  const findings = [];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1].trim();
    const curr = lines[i].trim();
    if (prev.startsWith('return ') && curr.startsWith('return ') && prev === curr) {
      findings.push({ line: i + 1, text: curr });
    }
  }
  return findings;
}

test('baseball action files have no duplicated top-level keys in return objects', async () => {
  const files = await collectActionFiles(ACTIONS_DIR);
  assert.ok(files.length >= 10, 'Expected baseball action files under src/app/baseball/actions');

  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const dupKeys = findDuplicateTopLevelReturnKeys(source);
    if (dupKeys.length > 0) {
      offenders.push({ file, keys: dupKeys });
    }
  }

  if (offenders.length > 0) {
    assert.fail(
      `Found duplicated top-level return keys in baseball action files:\n` +
        offenders.map((o) => `  ${o.file}: ${o.keys.join(', ')}`).join('\n'),
    );
  }
});

test('baseball action files have no consecutive duplicate return statements', async () => {
  const files = await collectActionFiles(ACTIONS_DIR);
  const offenders = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const dups = findConsecutiveDuplicateReturns(source);
    if (dups.length > 0) offenders.push({ file, dups });
  }

  if (offenders.length > 0) {
    assert.fail(
      `Found consecutive duplicate return statements:\n` +
        offenders
          .map((o) => o.dups.map((d) => `  ${o.file}:${d.line} ${d.text}`).join('\n'))
          .join('\n'),
    );
  }
});

test('baseball action files do not contain stale "types will be regenerated" comments', async () => {
  const files = await collectActionFiles(ACTIONS_DIR);
  const stale = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (STALE_TYPE_COMMENT.test(source)) stale.push(file);
  }

  if (stale.length > 0) {
    assert.fail(
      `Remove stale type-drift comments (use fromUntyped or regen types instead):\n` +
        stale.map((f) => `  - ${f}`).join('\n'),
    );
  }
});
