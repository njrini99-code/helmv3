import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/tournaments' }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false }));
vi.mock('../shell/phone-chrome', () => ({ PhoneTop: ({ title }: { title: React.ReactNode }) => <header>{title}</header> }));

/** Every event and the live lanes draw a part that throws: each is said in its own place and the rest of the page stays. */
vi.mock('../screens/tournaments/SeasonLedger', () => ({
  SeasonLedger: () => {
    throw new Error('ledger broke');
  },
}));
vi.mock('../screens/live/live-parts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../screens/live/live-parts')>();
  return {
    ...real,
    LiveGroupsList: () => {
      throw new Error('lanes broke');
    },
  };
});

import './dialog-polyfill';
import { tourFixture } from '../preview/fixtures-tournaments';
import { PREVIEW_LIVE, PREVIEW_LIVE_NOW } from '../preview/fixtures-live';
import { History } from '../screens/tournaments/History';
import { LiveView } from '../screens/live/LiveView';

afterEach(cleanup);

const plain = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * GAP-S-10: one section that throws takes only itself. Tournaments History, the live round, the lineup builder and Live
 * wrap each part in SectionBoundary (CH-16294); this forces two of them and checks the rest of the page still draws.
 */
describe('CH-16294 a Tournaments or Live section that throws is named in place', () => {
  it('History: Every event couldn’t be shown, and the trend above it still draws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<History data={tourFixture('ready').history} search={{ mode: 'actual', adjust: 'raw' }} load="ready" phone={false} />);
    const notices = container.querySelectorAll('[data-ch-code="CH-16294"]');
    expect(notices).toHaveLength(1);
    expect(plain(notices[0])).toContain('Every event couldn’t be shown');
    expect(notices[0]?.querySelector('button')?.textContent).toMatch(/Try again/);
    expect(container.querySelector('.ch-tour-rev-trend')).not.toBeNull();
  });

  it('Live: the players on the course couldn’t be shown, and the page head and freshness stay', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<LiveView initial={PREVIEW_LIVE} frozen now={PREVIEW_LIVE_NOW} />);
    const lanes = [...container.querySelectorAll('[data-ch-code="CH-16294"]')].find((n) => plain(n).includes('Players on the course couldn’t be shown'));
    expect(lanes).toBeTruthy();
    expect(container.querySelector('h1')).not.toBeNull();
  });
});
