import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false, updatePreferences: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/qualifiers' }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: vi.fn(), removeChannel: vi.fn() }) }));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({ createGolfQualifier: vi.fn(), setQualifierRoundCourses: vi.fn(), updateGolfQualifierDetails: vi.fn(), updateQualifierStatus: vi.fn() }));
vi.mock('@/app/golf/actions/qualifier-setup', () => ({ setQualifierEntrants: vi.fn(), setQualifierSquadSize: vi.fn() }));

import { ToastProvider } from '../../../ui/Toast';
import { QualifiersList } from '../QualifiersList';
import { QualifierDetail } from '../QualifierDetail';
import { endedLabel, endedLive, missingRounds } from '../model';
import { DETAIL_INDEX, previewDetail, previewList } from '../../../preview/fixtures-qualifiers';

afterEach(cleanup);

const wrap = (node: ReactNode) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
const writes = () => ({ create: vi.fn(), saveEdit: vi.fn(), setStatus: vi.fn(async () => ({ success: true })), courses: vi.fn(async () => []), tees: vi.fn(async () => []) });
const dayAfter = (iso: string) => new Date(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Coach audit 13 Nov 2026 (§12): all five of Guilford's qualifiers were open; "Test Qualy" (17–19 Sep) never started and still
 * said "Upcoming" in November; Laurel Valley waited weeks on Samanyu's R3 with nothing naming it.
 */
describe('a qualifier past its last day', () => {
  it('one that never started is past its last day too, never Upcoming', () => {
    const base = { status: 'upcoming' as const, endDate: '2026-09-19', entrants: 6, numRounds: 3, submitted: 0 };
    expect(endedLive({ ...base, today: '2026-09-19' })).toBeNull();
    const ended = endedLive({ ...base, today: '2026-11-12' });
    expect(ended).toEqual({ outstanding: null });
    expect(endedLabel(ended!)).toBe('Past last day');
  });

  it('names who is a round short, and only them', () => {
    const r = (number: number) => ({ id: `r${number}`, playerId: 'x', number, total: 72, toPar: 0, date: '2026-09-27', course: 'Pine', holesPlayed: 18 });
    const rows = [
      { name: 'Braeden Moore', rounds: [r(1), r(2), r(3)] },
      { name: 'Samanyu Rao', rounds: [r(1), r(2)] },
      { name: 'Luke Dunn', rounds: [r(1)] },
    ];
    expect(missingRounds(rows, 3)).toEqual(['Samanyu: no R3 posted', 'Luke: no R2 or R3 posted']);
    expect(missingRounds([{ name: 'Ava Lind', rounds: [] }], 3)).toEqual([]);
  });

  it('on the list, an upcoming qualifier past its last day reads Past last day and asks the coach to close it', () => {
    const list = previewList('coach');
    const upcoming = list.items.find((i) => i.status === 'upcoming')!;
    const today = [upcoming.endDate, ...list.items.map((i) => i.endDate)].filter(Boolean).sort().at(-1)!;
    wrap(<QualifiersList data={{ ...list, today: dayAfter(today) }} />);
    const card = screen.getAllByText(upcoming.name).map((el) => el.closest('a')).find(Boolean) as HTMLElement;
    expect(card.textContent).toContain('Past last day');
    expect(card.textContent).not.toContain('Upcoming');
    expect(card.textContent).toContain('Review and close');
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
  });

  it('on its page, an upcoming qualifier past its last day can be closed', async () => {
    const d = previewDetail(DETAIL_INDEX.upcoming!, 'coach');
    await act(async () => {
      wrap(<QualifierDetail data={{ ...d, today: dayAfter(d.endDate!) }} writes={writes()} live={false} />);
    });
    expect(screen.getAllByRole('button', { name: /Close qualifier/ }).length).toBeGreaterThan(0);
  });

  it('closing a live one past its last day names the missing rounds first', async () => {
    const d = previewDetail(DETAIL_INDEX.live!, 'coach');
    const short = missingRounds(d.board!.rows, d.numRounds);
    expect(short.length).toBeGreaterThan(0);
    await act(async () => {
      wrap(<QualifierDetail data={{ ...d, today: dayAfter(d.endDate!) }} writes={writes()} live={false} />);
    });
    await userEvent.click(screen.getAllByRole('button', { name: /Close qualifier/ })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Close this qualifier?' });
    expect(within(dialog).getByText(short[0]!, { exact: false })).toBeTruthy();
  });
});
