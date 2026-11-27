import { describe, it, expect } from 'vitest';
import { GROUP_OVER, groupByPage } from '../lists';

describe('groupByPage', () => {
  it('cuts rows into runs by page, keeping first-seen page order and row order', () => {
    const rows = [
      { id: 'a', page: 'P002' },
      { id: 'b', page: 'P000' },
      { id: 'c', page: 'P002' },
    ];
    expect(groupByPage(rows)).toEqual([
      { page: 'P002', rows: [rows[0], rows[2]] },
      { page: 'P000', rows: [rows[1]] },
    ]);
  });
  it('folds only lists long enough to need it', () => {
    expect(GROUP_OVER).toBeGreaterThanOrEqual(20);
  });
});
