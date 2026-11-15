import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/practice', useSearchParams: () => new URLSearchParams() }));

import { NO_DATA } from '../../../lib/format';
import { WeekStrip } from '../PracticeHome';

/*
 * F-0026 (audit 2026-11-13): a day with no practice drew an en dash "–", where Clubhouse marks nothing with the shared em dash
 * (NO_DATA, "—"), as Roster, Stats and Recruiting do. The tile keeps its quiet glyph and the words a reader hears.
 */

afterEach(cleanup);

describe('F-0026 an empty practice day reads the shared no-data mark', () => {
  it('draws NO_DATA, hidden from a reader, who hears "No practice"', () => {
    const { container } = render(<WeekStrip week={[{ key: 'mon', day: 'Mon', date: '9', today: false, items: [] }]} />);
    const none = container.querySelector('.ch-prc-tile__none')!;
    expect(none.querySelector('[aria-hidden="true"]')?.textContent).toBe(NO_DATA);
    expect(none.textContent).not.toContain('–');
    expect(none.querySelector('.ch-sr-only')?.textContent).toBe('No practice');
  });
});
