// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { loadImportSourceRegistration } from '@/lib/baseball/import-source-enabled';

function makeDb(rows: Array<{ source_name: string; enabled: boolean; source_type?: string }>) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: rows, error: null }),
      }),
    }),
  };
}

describe('loadImportSourceRegistration (#407)', () => {
  it('prefers exact source_type match over display-name collision', async () => {
    const db = makeDb([
      { source_name: 'trackman', source_type: 'other', enabled: true },
      { source_name: 'TrackMan CSV', source_type: 'trackman', enabled: true },
    ]);

    const row = await loadImportSourceRegistration(db, 'team-1', 'trackman');
    expect(row?.source_name).toBe('TrackMan CSV');
    expect(row?.enabled).toBe(true);
  });

  it('treats any disabled matching row as disabled', async () => {
    const db = makeDb([
      { source_name: 'TrackMan', source_type: 'trackman', enabled: true },
      { source_name: 'TrackMan Legacy', source_type: 'trackman', enabled: false },
    ]);

    const row = await loadImportSourceRegistration(db, 'team-1', 'trackman');
    expect(row?.enabled).toBe(false);
  });

  it('returns null when no registry rows match', async () => {
    const db = makeDb([{ source_name: 'GameChanger', source_type: 'gamechanger', enabled: true }]);
    expect(await loadImportSourceRegistration(db, 'team-1', 'trackman')).toBeNull();
  });
});
