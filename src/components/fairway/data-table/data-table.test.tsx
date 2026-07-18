// @vitest-environment jsdom
/**
 * ============================================================================
 * DataTable — mobile name-truncation regression coverage (audit W1)
 * ----------------------------------------------------------------------------
 * On a phone-width viewport, an identity/name column with `min-w-0`-truncate
 * cell content used to collapse to a couple of characters while short
 * numeric/badge sibling columns kept their natural width. Root cause: every
 * `<th>` got an inline `width` from TanStack's `header.getSize()` — which
 * defaults to 150px for ANY column that doesn't set an explicit `size` — so
 * every column (name or not) requested an equal-weight hint. Under
 * `table-layout: auto`, a sibling whose min-content is near-zero (because its
 * content truncates) is the one the browser starves first when that combined
 * hint overruns the viewport.
 *
 * Locks two things:
 *   1. A column with NO `meta.minWidth` no longer gets that unintended
 *      TanStack-default inline width (the false equal-weight hint is gone).
 *   2. A column WITH `meta.minWidth` gets a real `min-width` floor on BOTH the
 *      header and body cell — a name column can still ellipsize past it, but
 *      the auto-layout table can never crush it thinner than the floor.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';
import type { ColumnDef } from './types';

interface RowT {
  id: string;
  name: string;
  score: number;
}

const columns: ColumnDef<RowT, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Player',
    meta: { minWidth: 160 },
  },
  {
    accessorKey: 'score',
    header: 'Score',
    meta: { align: 'right', numeric: true },
  },
];

const data: RowT[] = [{ id: '1', name: 'Alexandra Christopherson', score: 72 }];

describe('DataTable — column width floor', () => {
  it('applies a real min-width floor to the header AND body cell of a column with meta.minWidth', () => {
    const { container } = render(
      <DataTable<RowT> data={data} columns={columns} getRowId={(r) => r.id} enableSorting={false} />,
    );

    const headerCells = container.querySelectorAll<HTMLElement>('th');
    const bodyCells = container.querySelectorAll<HTMLElement>('tbody td');

    expect(headerCells[0]?.style.minWidth).toBe('160px');
    expect(bodyCells[0]?.style.minWidth).toBe('160px');
  });

  it('does NOT apply an unintended default width to a column with no meta.minWidth', () => {
    const { container } = render(
      <DataTable<RowT> data={data} columns={columns} getRowId={(r) => r.id} enableSorting={false} />,
    );

    const headerCells = container.querySelectorAll<HTMLElement>('th');
    const bodyCells = container.querySelectorAll<HTMLElement>('tbody td');

    // The Score column sets no `minWidth` — it must carry NO inline width/
    // min-width at all (no TanStack 150px default hint smuggled back in).
    expect(headerCells[1]?.style.width).toBe('');
    expect(headerCells[1]?.style.minWidth).toBe('');
    expect(bodyCells[1]?.style.width).toBe('');
    expect(bodyCells[1]?.style.minWidth).toBe('');
  });
});
