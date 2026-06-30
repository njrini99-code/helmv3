import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import {
  DEPRECATED_STAT_TABLES,
  GRANDFATHERED_CONSUMERS,
  STAT_LAYER_SCAN_EXCLUDED_FILES,
} from '@/lib/baseball/stat-layer-manifest';

/**
 * Stat-layer contract test — the automated enforcement half of
 * docs/baseball/stats-architecture.md.
 *
 * Two invariants, both required for the manifest to stay trustworthy as a
 * migration backlog:
 *
 *   1. No file OUTSIDE the manifest's allowlist references a deprecated
 *      table. This is what blocks a NEW stat surface from reaching for
 *      baseball_player_stats / baseball_player_aggregates instead of the
 *      canonical read-model layer.
 *   2. No file INSIDE the allowlist has stopped referencing a deprecated
 *      table. If it has, it migrated and the manifest entry is stale —
 *      delete it in the same commit as the migration.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const stat = statSync(p);
    if (stat.isDirectory()) {
      out.push(...walk(p));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

/** Repo-relative, forward-slash path — matches the manifest's `path` field. */
function toRepoRelative(absolutePath: string, repoRoot: string): string {
  return absolutePath.slice(repoRoot.length + 1).split('\\').join('/');
}

function referencesDeprecatedTable(source: string): boolean {
  return DEPRECATED_STAT_TABLES.some((table) => source.includes(table));
}

describe('Baseball stat-layer contract (#381)', () => {
  const repoRoot = process.cwd();
  const excluded = new Set<string>(STAT_LAYER_SCAN_EXCLUDED_FILES);
  const allowlist = new Map(GRANDFATHERED_CONSUMERS.map((c) => [c.path, c]));

  const scannedFiles = walk(join(repoRoot, 'src'))
    .map((abs) => toRepoRelative(abs, repoRoot))
    .filter((rel) => !excluded.has(rel));

  it('only allowlisted files reference a deprecated stat table', () => {
    const offenders: string[] = [];

    for (const relPath of scannedFiles) {
      if (allowlist.has(relPath)) continue;
      const source = readFileSync(join(repoRoot, relPath), 'utf8');
      if (referencesDeprecatedTable(source)) {
        offenders.push(relPath);
      }
    }

    expect(
      offenders,
      `New surface(s) reference a deprecated stat table (${DEPRECATED_STAT_TABLES.join(
        ', ',
      )}) without a manifest entry. Either read from the canonical read-model ` +
        `layer instead (src/lib/baseball/read-models/stats-center.ts or ` +
        `elite-stat-events.ts — see docs/baseball/stats-architecture.md), or, if ` +
        `this really is a grandfathered consumer, add it to GRANDFATHERED_CONSUMERS ` +
        `in src/lib/baseball/stat-layer-manifest.ts with a migration note.\n\n` +
        `Offending files:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('every allowlisted file still references a deprecated stat table (no stale entries)', () => {
    const stale: string[] = [];

    for (const { path: relPath } of GRANDFATHERED_CONSUMERS) {
      let source: string;
      try {
        source = readFileSync(join(repoRoot, relPath), 'utf8');
      } catch {
        stale.push(`${relPath} (file no longer exists)`);
        continue;
      }
      if (!referencesDeprecatedTable(source)) {
        stale.push(relPath);
      }
    }

    expect(
      stale,
      `These manifest entries no longer reference a deprecated stat table — ` +
        `they have migrated. Remove them from GRANDFATHERED_CONSUMERS in ` +
        `src/lib/baseball/stat-layer-manifest.ts so the backlog stays accurate:\n\n` +
        stale.join('\n'),
    ).toEqual([]);
  });

  it('the manifest allowlist has no duplicate entries', () => {
    const paths = GRANDFATHERED_CONSUMERS.map((c) => c.path);
    const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i);
    expect(duplicates).toEqual([]);
  });
});
