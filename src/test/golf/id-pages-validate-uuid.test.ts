/**
 * QA run against production, 2026-09-02: `/golf/dashboard/roster/not-a-real-
 * uuid-12345` reached Postgres, which answered `22P02 invalid input syntax
 * for type uuid`; the page treated that as an unreadable player and threw
 * (JAVASCRIPT-NEXTJS-QV/QT/QR/QS + React #419/#441 on the client) instead of
 * answering 404. Every `[id]` page that queries by its param validates the
 * shape first. Contract over the source: the guard sits right after the
 * param is read.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES: Array<[string, string]> = [
  ['src/app/golf/(dashboard)/dashboard/roster/[id]/page.tsx', 'id'],
  ['src/app/golf/(dashboard)/dashboard/qualifiers/[id]/page.tsx', 'id'],
  ['src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx', 'id'],
  ['src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx', 'id'],
  ['src/app/golf/(dashboard)/dashboard/players/[playerId]/game/page.tsx', 'playerId'],
  ['src/app/golf/(dashboard)/dashboard/players/[playerId]/genome/page.tsx', 'playerId'],
];

describe('[id] pages answer a malformed id with 404, before Postgres sees it', () => {
  it.each(PAGES)('%s', (rel, param) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    expect(src).toContain("import { isUuid } from '@/lib/utils/uuid';");
    const reads = src.match(new RegExp(`const \\{ ${param} \\} = await params;\\n\\s*if \\(!isUuid\\(${param}\\)\\) notFound\\(\\);`, 'g')) ?? [];
    const allReads = src.match(new RegExp(`const \\{ ${param} \\} = await params;`, 'g')) ?? [];
    expect(allReads.length).toBeGreaterThan(0);
    // Every read of the param is guarded, including generateMetadata's.
    expect(reads.length).toBe(allReads.length);
  });
});

describe('command palette reads membership status from golf_team_members', () => {
  it('no longer asks golf_players for a roster_status column it does not have', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/golf/actions/command-palette.ts'), 'utf8');
    // The fix's own comment names the old column; what matters is that no
    // query template asks for it.
    const selects = src.match(/\.select\(`[\s\S]*?`\)/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const sel of selects) expect(sel).not.toContain('roster_status');
    expect(src).toMatch(/\.from\('golf_team_members'\)[\s\S]*?\.select\(`\s*status,\s*player:golf_players \(/);
  });
});
