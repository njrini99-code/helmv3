import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/**
 * A sheet imported from a module a client component draws lands ahead of the shared sheets in the page's styles, where
 * controls.css can then beat the page's own rules on the loaded page (Practice hit it: Drills' pills wrapped, 6dd3d9ec4c).
 * So Roster's client skeleton imports no stylesheet, and the route's loading file imports the Roster sheet on the server.
 */
describe('Roster loading: its stylesheet comes from the server', () => {
  it('the client skeleton imports no stylesheet', () => {
    const src = read('src/clubhouse/screens/roster/RosterSkeleton.tsx');
    expect(src).toContain("'use client'");
    expect(src).not.toMatch(/import\s+['"][^'"]+\.css['"]/);
  });

  it('the route’s loading file is a server module and imports the Roster sheet', () => {
    const src = read('src/app/golf/(dashboard)/dashboard/roster/loading.tsx');
    expect(src).not.toContain("'use client'");
    const sheets = [...src.matchAll(/import\s+'@\/clubhouse\/styles\/([a-z-]+)\.css'/g)].map((m) => m[1]);
    expect(sheets).toEqual(['roster']);
  });
});
