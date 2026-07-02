/**
 * CONTRACT: every server entry point under src/app/admin must call
 * requireSuperAdmin() or checkSuperAdminAccess() before doing anything.
 * A page/action file that never mentions the gate fails this test — the
 * cheap, always-on version of "enforced in review".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ADMIN_ROOT = join(process.cwd(), 'src/app/admin');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : walk(full);
    }
    return [full];
  });
}

describe('admin gate coverage', () => {
  it('every page.tsx, layout.tsx and actions/*.ts under src/app/admin calls the gate', () => {
    const files = walk(ADMIN_ROOT).filter(
      (f) =>
        f.endsWith('/page.tsx') ||
        f.endsWith('/layout.tsx') ||
        (f.includes('/actions/') && f.endsWith('.ts')),
    );
    expect(files.length).toBeGreaterThan(0);
    const missing = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return !src.includes('requireSuperAdmin') && !src.includes('checkSuperAdminAccess');
    });
    expect(missing).toEqual([]);
  });
});
