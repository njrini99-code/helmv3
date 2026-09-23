import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard for the 2026-09-23 finding: two golf-identity sign-out
 * paths (FairwaySettingsGeneral's Settings sign-out, Helm Bridge's AdminShell
 * sign-out) called `supabase.auth.signOut()` without `clearAllCachedResources()`
 * — cached message/conversation content in sessionStorage survived logout on
 * a shared device, which is exactly the risk client-resource-cache.ts's
 * contract exists to close.
 *
 * A golf-identity sign-out is identified structurally rather than by a fixed
 * file list, so a NEW sign-out path that forgets the cache-clear fails this
 * test instead of shipping silently: any file that calls the golf-specific
 * `clearActiveTeam()` team-switcher action alongside `auth.signOut()` is
 * signing out of a GolfHelm-authenticated session (Helm Bridge shares that
 * session — see AdminShell.tsx), so it must also clear the cache.
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('golf sign-out clears the client resource cache', () => {
  it('every file that clears the active team AND signs out also clears the cache', () => {
    const roots = ['src/app', 'src/components', 'src/lib', 'src/hooks'];
    const offenders: string[] = [];

    for (const root of roots) {
      let files: string[];
      try {
        files = walk(root);
      } catch {
        continue;
      }
      for (const file of files) {
        if (file.includes('__tests__') || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
        // The cache module's own file defines clearAllCachedResources — not
        // a caller, and has no clearActiveTeam/signOut of its own.
        if (file.endsWith('client-resource-cache.ts')) continue;

        const text = readFileSync(file, 'utf-8');
        const callsClearActiveTeam = /\bclearActiveTeam\s*\(/.test(text);
        const callsSignOut = /auth\.signOut\s*\(/.test(text);
        if (callsClearActiveTeam && callsSignOut && !/clearAllCachedResources\s*\(/.test(text)) {
          offenders.push(file);
        }
      }
    }

    expect(
      offenders,
      `Found golf-identity sign-out path(s) that clear the active team and ` +
        `sign out, but never call clearAllCachedResources() — cached ` +
        `rails/threads would survive logout on a shared device:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
