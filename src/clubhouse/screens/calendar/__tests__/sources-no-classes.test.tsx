import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// W45 (preview walk, 11 Nov): the side panel's Sources said "Class schedules for 0 players", which read as broken.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/calendar', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_CALENDAR } from '../../../preview/fixtures-calendar';
import { Calendar } from '../Calendar';
import { ToastProvider } from '../../../ui/Toast';
import type { ChCalendarData } from '../../../data/calendar';

afterEach(cleanup);

const wrap = (data: ChCalendarData) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar data={data} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );

describe('W45 Sources with no class schedules', () => {
  it('says none are added yet instead of "for 0 players"', () => {
    wrap({ ...PREVIEW_CALENDAR, events: PREVIEW_CALENDAR.events.filter((e) => e.type !== 'class') });
    expect(screen.queryByText(/Class schedules for 0/)).toBeNull();
    expect(screen.getAllByText('No class schedules added yet').length).toBeGreaterThan(0);
  });

  it('still counts the players when there are some', () => {
    wrap(PREVIEW_CALENDAR);
    expect(screen.getAllByText(/^Class schedules for \d+ players?$/).length).toBeGreaterThan(0);
  });
});
