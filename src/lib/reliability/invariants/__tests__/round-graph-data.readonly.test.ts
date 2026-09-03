import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * D.5's "assert it is read-only/bounded" requirement, adapted from a raw-SQL
 * grep (this repo's invariant queries go through the Supabase PostgREST
 * client, not raw SQL) to the equivalent TS-client check: the invariant data
 * layer must call only `.select(...)`/count probes, never a write method.
 * A source-text check rather than a runtime mock, so it fails the moment a
 * write call is ADDED, without needing a live database to catch it.
 */
describe('round-graph-data.ts is read-only by construction', () => {
  it('contains no Supabase write-method calls', () => {
    const path = resolve(dirname(fileURLToPath(import.meta.url)), '../round-graph-data.ts');
    const text = readFileSync(path, 'utf8');
    for (const method of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
      expect(text.includes(method), `${method} must not appear in an invariant data layer`).toBe(false);
    }
    // Sanity check the test itself isn't vacuous — the file must actually
    // read data, or "no writes found" would be trivially true of an empty
    // file too.
    expect(text.includes('.select(')).toBe(true);
  });
});
