/**
 * PlayerGameLog.tsx — TOTALS row column-alignment regression.
 *
 * THE BUG. The batting header is 16 columns (Date, Opponent, Type, 11 stat
 * columns, AVG, OPS) and each body row emits 16 cells, but the TOTALS row spanned
 * THREE columns after `K` instead of two. That single `colSpan` swallowed
 * SB + HBP + AVG, so the season batting average landed one cell right and printed
 * under the OPS heading while AVG rendered empty — a coach read a .312 average as
 * a .312 OPS. It also made the row 17 cells wide in a 16-column table.
 *
 * WHY A TEST AND NOT JUST THE FIX. Nothing about a wrong `colSpan` is visible in
 * TypeScript, in lint, or in a screenshot of a table whose numbers all look
 * plausible. It is exactly the class of defect that comes back the next time a
 * stat column is added, and the fix is one character. So the invariant that is
 * actually worth pinning is arithmetic: every row of this table — head, body and
 * foot — must occupy the same number of grid columns.
 *
 * The pitching table is asserted alongside it because it was CORRECT while
 * batting was wrong, which is what proved the batting row a copy-paste slip
 * rather than a deliberate layout.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import * as React from 'react';

vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) =>
    React.createElement('a', rest, children),
}));

import { PlayerGameLog } from './PlayerGameLog';

/** Total grid columns a row occupies, honouring colSpan. */
function columnSpan(row: HTMLTableRowElement): number {
  return Array.from(row.cells).reduce((n, cell) => n + (cell.colSpan || 1), 0);
}

function battingRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    ab: 4, r: 1, h: 2, doubles: 1, triples: 0, hr: 0, rbi: 2, bb: 1, k: 1,
    sb: 0, hbp: 0, sf: 0,
    game: { id: `g-${id}`, game_date: '2026-04-01', opponent_name: 'Rival', game_type: 'game' },
    ...overrides,
  } as never;
}

function pitchingRow(id: string) {
  return {
    // `ip` is the innings field (sumInningsPitched folds it in outs, #434).
    id,
    ip: 5, h: 4, r: 2, er: 2, bb: 1, k: 6, hr: 0, pitches: 78,
    result: 'W',
    game: { id: `g-${id}`, game_date: '2026-04-01', opponent_name: 'Rival', game_type: 'game' },
  } as never;
}

describe('PlayerGameLog — every row spans the same number of columns', () => {
  it('batting: head, body and TOTALS rows all span 16 columns', () => {
    // Two rows: the TOTALS foot only renders at length > 1, which is the branch
    // carrying the bug.
    const { container } = render(
      <PlayerGameLog batting={[battingRow('a'), battingRow('b')]} pitching={[]} />,
    );

    const head = container.querySelector('thead tr') as HTMLTableRowElement;
    const bodyRows = Array.from(container.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
    const foot = container.querySelector('tfoot tr') as HTMLTableRowElement;

    expect(head).toBeTruthy();
    expect(foot).toBeTruthy();
    expect(columnSpan(head)).toBe(16);
    for (const row of bodyRows) expect(columnSpan(row)).toBe(16);
    // Was 17 before the fix.
    expect(columnSpan(foot)).toBe(16);
  });

  it('batting: the season average lands in the AVG column, not OPS', () => {
    // .500 (2 H of 4 AB) per row -> .500 across both. Locating it by INDEX is the
    // whole point: the old bug produced the correct number in the wrong cell, so
    // any assertion that merely searched for the text passed while the table lied.
    const { container } = render(
      <PlayerGameLog batting={[battingRow('a'), battingRow('b')]} pitching={[]} />,
    );

    const headers = Array.from(
      container.querySelectorAll('thead th'),
    ) as HTMLTableCellElement[];
    const avgIndex = headers.findIndex((th) => th.textContent?.trim() === 'AVG');
    const opsIndex = headers.findIndex((th) => th.textContent?.trim() === 'OPS');
    expect(avgIndex).toBeGreaterThan(-1);
    expect(opsIndex).toBe(avgIndex + 1);

    // Walk the foot accumulating colSpan to find which grid column each cell
    // starts at — a plain cells[] index is not a column index once colSpan > 1.
    const foot = container.querySelector('tfoot tr') as HTMLTableRowElement;
    const byColumn = new Map<number, HTMLTableCellElement>();
    let column = 0;
    for (const cell of Array.from(foot.cells) as HTMLTableCellElement[]) {
      byColumn.set(column, cell);
      column += cell.colSpan || 1;
    }

    expect(byColumn.get(avgIndex)?.textContent?.trim()).toBe('.500');
    // OPS has no season total (it is not additive across games) — empty, but
    // present, so the row stays aligned.
    expect(byColumn.has(opsIndex)).toBe(true);
    expect(byColumn.get(opsIndex)?.textContent?.trim()).toBe('');
  });

  it('pitching: head, body and TOTALS rows all span 14 columns', () => {
    // No tab click needed — the component defaults to the pitching tab when
    // there is no batting data (`useState<LogTab>(batting.length > 0 ? ...)`).
    const { container } = render(
      <PlayerGameLog batting={[]} pitching={[pitchingRow('a'), pitchingRow('b')]} />,
    );

    const head = container.querySelector('thead tr') as HTMLTableRowElement;
    const bodyRows = Array.from(container.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
    const foot = container.querySelector('tfoot tr') as HTMLTableRowElement;

    expect(head).toBeTruthy();
    expect(foot).toBeTruthy();
    expect(columnSpan(head)).toBe(14);
    for (const row of bodyRows) expect(columnSpan(row)).toBe(14);
    // This row was already correct — it is asserted so that a future stat-column
    // change cannot break the good half while only the batting half is guarded.
    expect(columnSpan(foot)).toBe(14);
  });
});
