import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type DataColumn } from '../DataTable';

afterEach(() => cleanup());

type Row = { id: string; name: string; avg: number };
const ROWS: Row[] = [
  { id: 'a', name: 'Ava', avg: 72.1 },
  { id: 'b', name: 'Ben', avg: 74.5 },
  { id: 'c', name: 'Cal', avg: 70.9 },
];
const COLUMNS: DataColumn<Row, 'name' | 'avg'>[] = [
  { id: 'who', header: 'Player', sortKey: 'name', cell: (r) => <button type="button" className="who">{r.name}</button> },
  { id: 'avg', header: 'Avg', align: 'end', sortKey: 'avg', sortDirection: 'ascending', cell: (r) => r.avg },
];

function Harness({ onSelect }: { onSelect?: (k: string) => void }) {
  const [sort, setSort] = useState<'name' | 'avg'>('name');
  const [sel, setSel] = useState<string | null>('b');
  return (
    <DataTable<Row, 'name' | 'avg'>
      label="Roster"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(r) => r.id}
      primary=".who"
      sort={sort}
      onSort={setSort}
      selected={sel}
      onSelect={(k) => {
        onSelect?.(k);
        setSel(k);
      }}
    />
  );
}

/** Premium plan section 3.8 and S7: the shared desk table (ui/DataTable.tsx). */
describe('DataTable', () => {
  it('is a named table whose sortable headers say how they sort, and sorts from a header', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const table = screen.getByRole('table', { name: 'Roster' });
    const heads = screen.getAllByRole('columnheader');
    expect(heads.map((h) => h.getAttribute('aria-sort'))).toEqual(['ascending', 'none']);
    await user.click(screen.getByRole('button', { name: 'Avg' }));
    expect(screen.getAllByRole('columnheader')[1]!.getAttribute('aria-sort')).toBe('ascending');
    expect(table.querySelector('.ch-dt__head')).not.toBeNull();
    expect(screen.getAllByRole('columnheader')[1]!.className).toContain('r');
  });

  it('marks the selected row aria-current and makes it the one Tab stop', () => {
    render(<Harness />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => r.getAttribute('aria-current'))).toEqual([null, 'true', null]);
    const keys = rows.map((r) => r.querySelector<HTMLButtonElement>('.who')!);
    expect(keys.map((k) => k.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('walks rows with the arrows and with J and K, Home and End, and the selection follows the keys', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    // Past the two sortable headers, the table's one row stop is the selected row.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Ben');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Cal');
    expect(onSelect).toHaveBeenLastCalledWith('c');
    await user.keyboard('k');
    expect(document.activeElement?.textContent).toBe('Ben');
    expect(onSelect).toHaveBeenLastCalledWith('b');
    await user.keyboard('kk');
    expect(document.activeElement?.textContent).toBe('Ava');
    await user.keyboard('j{End}');
    expect(document.activeElement?.textContent).toBe('Cal');
    expect(onSelect).toHaveBeenLastCalledWith('c');
    await user.keyboard('{Home}');
    expect(document.activeElement?.textContent).toBe('Ava');
    expect(onSelect).toHaveBeenLastCalledWith('a');
    // Every move the keys made selected the row it landed on, in order.
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(['c', 'b', 'a', 'b', 'c', 'a']);
  });

  it('never selects on a pointer focus: a click selects through the row’s own control', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const ava = screen.getByRole('button', { name: 'Ava' });
    // A mouse focus is not :focus-visible.
    ava.matches = ((sel: string) => (sel === ':focus-visible' ? false : Element.prototype.matches.call(ava, sel))) as typeof ava.matches;
    fireEvent.focus(ava);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
