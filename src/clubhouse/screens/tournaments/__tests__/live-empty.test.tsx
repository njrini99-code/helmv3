// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../../../preview/fixtures-tournaments';
import { LiveRound } from '../LiveRound';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/tournaments', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/tournaments', () => ({ enterTournamentScore: vi.fn(), setTournamentRoundStatus: vi.fn() }));
vi.mock('@/app/golf/actions/tournaments-holes', () => ({ saveTournamentHole: vi.fn() }));

afterEach(cleanup);

/**
 * G15 (12 Nov): tournament-live?state=empty drew the whole lineup, the same as the default, so the round's empty state
 * was never seen. With nobody in the round the page says so once and offers the lineup: no lanes, no field.
 */
describe('the live round with nobody in it', () => {
  it.each([
    ['desktop', false],
    ['phone', true],
  ])('%s: draws the empty state and no lanes', (_, phone) => {
    const c = render(<LiveRound data={tourFixture('empty').live} load="ready" phone={phone} />).container;
    expect(c.textContent).toContain('Nobody is in this round yet');
    expect(c.querySelectorAll('[data-ch-lane]')).toHaveLength(0);
    expect(c.querySelector('#ch-tour-live-field')).toBeNull();
  });

  it('the default still draws the lineup', () => {
    const c = render(<LiveRound data={tourFixture('ready').live} load="ready" phone={false} />).container;
    expect(c.querySelectorAll('[data-ch-lane]').length).toBeGreaterThan(0);
    expect(c.textContent).not.toContain('Nobody is in this round yet');
  });
});
