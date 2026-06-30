import { describe, it, expect } from 'vitest';

const REVOKED = new Set(['suspended', 'removed', 'invited']);

function filterStaffRows(
  rows: Array<{ team_id: string; status: string | null }>,
): string[] {
  return rows
    .filter((row) => {
      const status = typeof row.status === 'string' ? row.status : null;
      return !status || !REVOKED.has(status);
    })
    .map((row) => row.team_id);
}

describe('active context staff status filter (#405)', () => {
  it('excludes invited, suspended, and removed staff', () => {
    const teamIds = filterStaffRows([
      { team_id: 'active-team', status: 'active' },
      { team_id: 'invited-team', status: 'invited' },
      { team_id: 'suspended-team', status: 'suspended' },
      { team_id: 'legacy-team', status: null },
    ]);
    expect(teamIds).toEqual(['active-team', 'legacy-team']);
  });
});
