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

/**
 * ============================================================================
 * DataTable — mobileCard render path (audit W2)
 * ----------------------------------------------------------------------------
 * A raw <table> dropped into overflow-x-auto reads as broken on a phone: only
 * 2-3 of N columns fit, no scroll affordance. The optional `mobileCard` prop
 * recomposes the same rows as native cards below `sm` — this locks that (a)
 * opting in hides the desktop `<table>` below `sm` and renders exactly one
 * card per row via the caller's render function, and (b) every EXISTING
 * consumer that doesn't pass `mobileCard` gets byte-identical markup (no
 * `hidden` class smuggled onto the table, no stray mobile block in the DOM).
 * ========================================================================== */
describe('DataTable — mobileCard render path', () => {
  it('hides the desktop table below `sm` and renders one card per row via mobileCard', () => {
    const { container } = render(
      <DataTable<RowT>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        enableSorting={false}
        mobileCard={(row) => <span data-testid="mobile-card">{row.original.name}</span>}
      />,
    );

    // The scroll container that owns the <table> must be hidden below `lg`.
    //
    // Threshold moved sm -> lg (audit 2026-07-24, C1): the breakpoint measures
    // the VIEWPORT, but the table's real constraint is its own box, and the
    // coach shell's 260px fixed rail eats the difference. At 768px main was
    // 508px wide and 249px of a 691px table was silently clipped — Score, To
    // Par and Date vanished with no scroll affordance.
    const scrollRegion = container.querySelector('table')?.parentElement;
    expect(scrollRegion?.className).toContain('hidden');
    expect(scrollRegion?.className).toContain('lg:block');

    // Exactly one mobile card per data row, rendered via the caller's function
    // (not a clipped subset of table columns) — same real data as the (still
    // present, CSS-hidden) desktop table, not a placeholder.
    const cards = container.querySelectorAll('[data-testid="mobile-card"]');
    expect(cards).toHaveLength(data.length);
    expect(cards[0]?.textContent).toBe('Alexandra Christopherson');
  });

  it('omits the mobile-card block and the hidden-table class when mobileCard is not passed', () => {
    const { container } = render(
      <DataTable<RowT> data={data} columns={columns} getRowId={(r) => r.id} enableSorting={false} />,
    );

    const scrollRegion = container.querySelector('table')?.parentElement;
    expect(scrollRegion?.className).not.toContain('hidden');
    expect(scrollRegion?.className).not.toContain('sm:block');
    expect(container.querySelector('[data-testid="mobile-card"]')).toBeNull();
  });

  it('renders a card-shaped skeleton (no table rows) for the mobile path while loading', () => {
    const { container } = render(
      <DataTable<RowT>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        enableSorting={false}
        loading
        loadingRows={3}
        mobileCard={(row) => <span data-testid="mobile-card">{row.original.name}</span>}
      />,
    );

    // No real row content leaks through while loading, on either path.
    expect(container.querySelector('[data-testid="mobile-card"]')).toBeNull();
    // The mobile skeleton renders shape-matched shimmer blocks, not <tr>s.
    const mobileBlock = container.querySelector('.sm\\:hidden');
    expect(mobileBlock?.querySelectorAll('tr').length ?? 0).toBe(0);
  });
});
