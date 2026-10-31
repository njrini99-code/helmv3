import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** F-0012 (audit 2026-10-29): a failed feed on the phone said "nobody on course"; it says the feed failed, with Try again. */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/live' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => true }));
vi.mock('../../../shell/phone-chrome', () => ({
  PhoneTop: ({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) => (
    <header>
      {title}
      {action}
    </header>
  ),
}));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_LIVE_EMPTY, PREVIEW_LIVE_FAILED, PREVIEW_LIVE_NOW } from '../../../preview/fixtures-live';
import { LiveView } from '../LiveView';

afterEach(cleanup);
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

describe('Live on a phone, when the feed fails (F-0012)', () => {
  it('shows CH-16604 with Try again, not the empty state, and the chip does not claim Live', () => {
    render(<LiveView initial={PREVIEW_LIVE_FAILED} frozen now={PREVIEW_LIVE_NOW} />);
    expect(code('CH-16604')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(code('CH-16619')).toBeNull();
    expect(document.querySelector('.ch-lv-chip[data-feed="live"]')).toBeNull();
  });

  it('an empty feed that loaded is still the empty state', () => {
    render(<LiveView initial={PREVIEW_LIVE_EMPTY} frozen now={PREVIEW_LIVE_NOW} />);
    expect(code('CH-16604')).toBeNull();
  });
});
