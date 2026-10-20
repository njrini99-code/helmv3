import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function DataTable({ columns = [], rows = [], rowKey = 'id', onRowClick, selectedKey, dense = false, defaultSort, className = '' }) {
  const [sort, setSort] = React.useState(defaultSort || null);
  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const c = columns.find((x) => x.key === sort.key);
    const get = (r) => (c && c.sortValue ? c.sortValue(r) : r[sort.key]);
    return [...rows].sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * (sort.dir === 'desc' ? -1 : 1));
  }, [rows, sort, columns]);
  const toggle = (k) => setSort((s) => (s && s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' }));
  return (
    <table className={'fw-table' + (dense ? ' fw-table--dense' : '') + ' ' + className}>
      <thead><tr>
        {columns.map((c) => (
          <th key={c.key} data-align={c.align} style={{ width: c.width }} aria-sort={sort && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            {c.sortable ? (
              <button onClick={() => toggle(c.key)}>{c.label}{sort && sort.key === c.key ? <Icon name={sort.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={11} strokeWidth={2} /> : <Icon name="chevrons-up-down" size={11} style={{ opacity: 0.45 }} />}</button>
            ) : c.label}
          </th>
        ))}
      </tr></thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r[rowKey]} data-interactive={onRowClick ? '' : undefined} aria-selected={selectedKey === r[rowKey] || undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
            {columns.map((c) => <td key={c.key} data-align={c.align} data-num={c.numeric ? '' : undefined}>{c.render ? c.render(r) : r[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
