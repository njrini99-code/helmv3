/**
 * `degraded` only works if the metadata column is FETCHED and HANDED to the
 * classifier. Both halves were missing, and either one silently disables the
 * whole status.
 *
 * When `classifyCronStatus` learned to read `metadata.degraded`, the data layer
 * still did this:
 *
 *     .select('job_type, status, duration_ms, error_message, started_at')
 *     ...
 *     classifyCronStatus(entry, { started_at: last.started_at, status: last.status }, now)
 *
 * The column was never selected, and the call site rebuilt a narrower object
 * that dropped it. A pure-layer test would have stayed green forever while the
 * board kept rendering degraded runs as healthy — the same producer-vs-pure
 * gap that let `fetch.ts` guess a branch name for CI checks (#1660).
 *
 * WHAT THIS TEST IS. A source-level guard, and it says so plainly: it asserts
 * the query selects `metadata` and that the classifier call receives it. It
 * does NOT execute the readers — that would need the full Supabase, GitHub,
 * reliability and deploy boundaries mocked. It is deliberately narrow, and it
 * catches the exact regression that made the feature inert.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  jobs: resolve(__dirname, '../data/jobs.ts'),
  selfheal: resolve(__dirname, '../data/selfheal.ts'),
};

describe('degraded pass-through — the column must be fetched and handed on', () => {
  for (const [name, path] of Object.entries(files)) {
    const src = readFileSync(path, 'utf-8');

    it(`${name}: every background_job_logs select includes metadata`, () => {
      // Each select that feeds a status classification must carry the column.
      const selects = [...src.matchAll(/\.select\('([^']*job_type[^']*)'\)/g)].map((m) => m[1] ?? '');
      expect(selects.length).toBeGreaterThan(0); // guards the matcher itself
      for (const sel of selects) {
        expect(sel).toContain('metadata');
      }
    });

    it(`${name}: no classifier call rebuilds a lastRun object without metadata`, () => {
      // The exact shape that dropped it. Matching the narrowed literal rather
      // than "does metadata appear somewhere in the file" — the file mentions
      // metadata in other contexts, and a substring check would pass on those.
      expect(src).not.toMatch(/\{\s*started_at:\s*last\.started_at,\s*status:\s*last\.status\s*\}/);
    });

    it(`${name}: the lastRun object passed to the classifier carries metadata`, () => {
      expect(src).toMatch(/started_at:\s*last\.started_at,\s*status:\s*last\.status,\s*metadata:\s*last\.metadata/);
    });
  }
});
