/**
 * 2026-09-23 security-review finding on the golf messages warm-start cache:
 * the "keep the warm copy current as realtime inserts/updates/edits land"
 * effect wrote to the client resource cache with the unguarded
 * `writeCachedResource`, unlike every other write path in this hook (the
 * initial fetch and the conversations-rail fetch), which capture
 * `getCacheEpoch()` and write through `writeCachedResourceIfCurrent`.
 *
 * A realtime event can schedule this effect around the same moment a
 * sign-out call clears the cache (`clearAllCachedResources()`, which bumps
 * the epoch — see client-resource-cache.ts); the unguarded write could then
 * resurrect the signed-out viewer's messages into the cleared cache.
 *
 * Asserted on the source, matching the sibling G-13 stale-fetch suite's
 * idiom in this same file's directory: reaching the effect behaviourally
 * requires a full supabase + auth + realtime harness, and what distinguishes
 * fixed from broken here is whether the write is epoch-guarded at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/hooks/golf/use-golf-messages.ts'), 'utf-8');

const code = source
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  })
  .join('\n');

describe('use-golf-messages — the realtime warm-copy write is epoch-guarded', () => {
  it('no longer calls the unguarded writeCachedResource', () => {
    // The named import must be gone too, not just unused at the call site —
    // an unused import would itself fail lint, but this pins the intent.
    expect(code).not.toMatch(/\bwriteCachedResource\s*\(/);
  });

  it('the "keep the warm copy current" effect writes through the epoch guard', () => {
    const idx = code.indexOf('cacheableMessages(messages)');
    expect(idx).toBeGreaterThan(-1);
    const preceding = code.slice(Math.max(0, idx - 300), idx);
    expect(preceding).toContain('writeCachedResourceIfCurrent');
    expect(preceding).toContain('getCacheEpoch()');
  });
});
