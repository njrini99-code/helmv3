import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Package 10 gate pin (repair-plan §14.12): "Improvement is not attributed to
 * a mere page view, repeated cron scan, or unrelated later round." The
 * "mere page view" half of that sentence is `recordInsightExposure`
 * (`event-ledger.ts`) — an insight only counts as SHOWN when the UI read
 * path that actually renders it calls this. Its only real caller today is
 * `insight-delivery.ts`'s `recordExposureForReturned`. That fact previously
 * rested on the ABSENCE of any other call site (verified by grep, not
 * pinned by a test) — a future cron or digest module that imported
 * `recordInsightExposure` directly (to "warm" a trust signal, backfill
 * exposure for an unread insight, etc.) would silently manufacture evidence
 * with no test catching it. This test makes that absence a real invariant:
 * a static source scan over every cron route and every digest module,
 * asserting NONE of them reference `recordInsightExposure` — a scheduled,
 * server-side, no-user-present path must never write a SHOWN event.
 *
 * The scan is over literal source text (no TS type info), so it also
 * catches a re-export or an aliased import, not just a direct call —
 * cheaper and more conservative than an AST walk for this purpose.
 */

const ROOT = process.cwd();
const SCAN_ROOTS = [
  'src/app/api/cron', // every scheduled route, including src/app/api/cron/v3/**
  'src/lib/admin/digest', // digest assembly (admin-digest cron's data source)
];
const FORBIDDEN_SYMBOL = 'recordInsightExposure';

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(full);
    }
  }
  return out;
}

describe('Package 10 gate: no cron or digest path writes an insight-exposure ("mere page view") row', () => {
  it('sanity floor: the scan finds a real, non-trivial number of source files', () => {
    const files = SCAN_ROOTS.flatMap((root) => listFilesRecursive(join(ROOT, root)));
    // Fails loudly if directory discovery breaks (e.g. cron routes move)
    // rather than silently passing an empty-file no-op.
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('no cron route or digest module references recordInsightExposure', () => {
    const files = SCAN_ROOTS.flatMap((root) => listFilesRecursive(join(ROOT, root)));
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      if (source.includes(FORBIDDEN_SYMBOL)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('self-test: the scan is not vacuous — it does find the one real, non-cron caller', () => {
    // Proves the scan mechanism itself (readFileSync + includes) actually
    // detects the symbol when present, using the one legitimate call site —
    // outside SCAN_ROOTS, so this does not contradict the assertion above.
    const callerFile = join(ROOT, 'src/app/golf/actions/insight-delivery.ts');
    expect(statSync(callerFile).isFile()).toBe(true);
    const source = readFileSync(callerFile, 'utf-8');
    expect(source.includes(FORBIDDEN_SYMBOL)).toBe(true);
  });
});
