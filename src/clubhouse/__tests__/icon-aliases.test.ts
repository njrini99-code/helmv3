import { describe, expect, it } from 'vitest';
import { clubhouseRestrictions } from '../../../eslint-rules/import-restrictions.mjs';
import { hits, ROOT, walk } from './_scan';

/**
 * CONS-19, corrected on the auditor's read of #2361: in lucide-react, BarChart3 and MoreHorizontal are deprecated aliases
 * of ChartColumn and Ellipsis (one glyph each). The map bans the alias and keeps the canonical name, so the ban never
 * requires the name lucide is retiring.
 */
describe('icon map uses canonical lucide names (CONS-19)', () => {
  const { paths } = clubhouseRestrictions[1] as { paths: { name: string; importNames?: string[] }[] };
  const banned = paths.find((p) => p.name === 'lucide-react')!.importNames!;

  it('bans the aliases and allows the names they stand for', async () => {
    // Read as a module object: the aliases can't be named in an import here, which is the point.
    const lucide: Record<string, unknown> = await import('lucide-react');
    expect(lucide.BarChart3).toBe(lucide.ChartColumn);
    expect(lucide.MoreHorizontal).toBe(lucide.Ellipsis);
    expect(banned).toEqual(expect.arrayContaining(['BarChart3', 'MoreHorizontal']));
    expect(banned).not.toContain('ChartColumn');
    expect(banned).not.toContain('Ellipsis');
  });

  it('no Clubhouse source names a banned icon', () => {
    const re = new RegExp(`\\b(${banned.join('|')})\\b`);
    expect(hits(re, walk(ROOT, /\.tsx?$/))).toEqual([]);
  });
});
