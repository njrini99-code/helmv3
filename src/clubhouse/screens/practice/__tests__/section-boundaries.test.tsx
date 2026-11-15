import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChPracticeHome } from '../../../data/practice-home-shape';

/**
 * GAP-S-10: a section of Practice that crashes while drawing fails on its own (CH-13204), with its notice and Try
 * again, and the rest of the page keeps working, instead of the whole page falling to the route error.
 */
const crash = vi.hoisted(() => ({ on: false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard/practice', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));
vi.mock('../../../ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../../lib/track', async (importOriginal) => ({ ...(await importOriginal<object>()), chReport: vi.fn() }));
vi.mock('../DayStrip', async (importOriginal) => {
  const real = await importOriginal<typeof import('../DayStrip')>();
  return {
    ...real,
    DayStrip: (p: Parameters<typeof real.DayStrip>[0]) => {
      if (crash.on) throw new Error('day strip broke');
      return real.DayStrip(p);
    },
  };
});

import { PracticeHome } from '../PracticeHome';

const HOME = {
  teamName: 'Demo',
  week: [],
  weekLine: null,
  firstRun: false,
  upNext: { title: 'Thursday practice', when: 'Thu', rows: [{ time: '2:00', title: 'Warm-up', place: 'Range', min: 30 }], day: [{ min: 30, tone: 'plain' }], planHref: null, editHref: '/x', eventId: null },
  drafts: [],
  published: [{ id: 'p1', day: 'Fri', title: 'Friday practice', time: '2:00', line: '2:00 Warm-up', state: 'Published', href: '/golf/dashboard/practice/plan/p1' }],
  past: [],
  open: [],
  copies: [],
  roster: [],
  zone: 'America/New_York',
} as unknown as ChPracticeHome;

describe('Practice sections fail one at a time (GAP-S-10)', () => {
  const quiet = vi.spyOn(console, 'error');
  beforeEach(() => quiet.mockImplementation(() => {}));
  afterEach(() => {
    crash.on = false;
    quiet.mockReset();
  });

  it('draws every section when nothing crashes', () => {
    render(<PracticeHome data={HOME} />);
    expect(screen.getByRole('heading', { name: 'Thursday practice' })).toBeTruthy();
    expect(screen.queryByText(/couldn’t be shown/)).toBeNull();
  });

  it("keeps Published and the week when Up next crashes, and names what didn't draw", () => {
    crash.on = true;
    const { container } = render(<PracticeHome data={HOME} />);
    const notice = container.querySelector('[data-ch-code="CH-13204"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('Up next couldn’t be shown');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Published' })).toBeTruthy();
    expect(screen.getByText('Friday practice')).toBeTruthy();
    expect(container.querySelector('section[aria-label="This week"]')).not.toBeNull();
  });
});
