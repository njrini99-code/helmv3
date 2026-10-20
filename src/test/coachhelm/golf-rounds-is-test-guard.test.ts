import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// OD-03 guard (2026-09-28 audit, demo team 6ecdd1a6): CoachHelm read
// golf_rounds without `is_test = false`, so QA rounds reached the round recap,
// prediction grading, v2 pattern mining and the insight baselines. Every
// golf_rounds read under src/lib/coachhelm must now filter is_test, unless it
// is a by-id lookup or listed below with its reason.
// ---------------------------------------------------------------------------

const ROOT = join(process.cwd(), 'src/lib/coachhelm');

/** file (relative to src/lib/coachhelm) → why its golf_rounds read may skip is_test. */
const ALLOWED: Record<string, string> = {
  'v3/ingest/providers/arccos.ts': 'dedupe lookup of already-imported rounds by external id, not analysis',
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

/** The statement starting at a golf_rounds `from`, up to its first `;` (max 20 lines). */
function statements(src: string): string[] {
  const lines = src.split('\n');
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!/from\('golf_rounds'\)|'golf_rounds'\)/.test(line)) return;
    const block: string[] = [];
    for (const l of lines.slice(i, i + 20)) {
      block.push(l);
      if (l.trimEnd().endsWith(';')) break;
    }
    out.push(block.join('\n'));
  });
  return out;
}

describe('CoachHelm golf_rounds reads filter is_test (OD-03)', () => {
  it('every multi-row golf_rounds read under src/lib/coachhelm filters is_test', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = file.slice(ROOT.length + 1);
      if (ALLOWED[rel]) continue;
      for (const stmt of statements(readFileSync(file, 'utf8'))) {
        if (stmt.includes("'is_test'")) continue;
        if (/\.eq\('id',/.test(stmt)) continue; // single-round lookup by id
        if (/\.(update|insert|upsert|delete)\(/.test(stmt)) continue;
        offenders.push(`${rel}: ${stmt.split('\n')[0]!.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
