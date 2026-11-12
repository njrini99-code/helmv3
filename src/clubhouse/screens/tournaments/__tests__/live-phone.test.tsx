// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../../../preview/fixtures-tournaments';
import { LiveRound } from '../LiveRound';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/tournaments', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/tournaments', () => ({ enterTournamentScore: vi.fn(), setTournamentRoundStatus: vi.fn() }));
vi.mock('@/app/golf/actions/tournaments-holes', () => ({ saveTournamentHole: vi.fn() }));

beforeEach(() => {
  // jsdom has no modal dialog.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

const live = tourFixture('live').live;
const draw = (phone: boolean) => render(<LiveRound data={live} load="ready" phone={phone} />).container;

/**
 * G16 (12 Nov): on a phone the live round opened on about twelve keys: Suspend play and Finish round stacked full width,
 * then Score by hole and Edit score on every lane. A phone now has one primary (Finish round) beside a quiet Suspend,
 * and each lane is one row that opens its score; scoring by hole is offered inside that sheet.
 */
describe('the live round on a phone · one primary, quiet rows', () => {
  it('has one primary key, and Suspend play is quiet beside it', () => {
    const c = draw(true);
    expect(c.querySelectorAll('.ch-btn--primary')).toHaveLength(1);
    expect(c.querySelector('.ch-btn--primary')?.textContent).toContain('Finish round');
    const suspend = screen.getByRole('button', { name: 'Suspend play' });
    expect(suspend.className).toContain('ch-btn--ghost');
  });

  it('draws each lane as one row that opens its score, with no keys of its own', () => {
    const c = draw(true);
    const lanes = c.querySelectorAll('[data-ch-lane]');
    expect(lanes.length).toBe(live.lanes.length);
    for (const lane of lanes) {
      expect(lane.querySelectorAll('button')).toHaveLength(1);
      expect(lane.querySelector('.ch-btn')).toBeNull();
    }
    expect(screen.queryAllByRole('button', { name: /score by hole/i })).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Theo Marchetti.*edit score/i })).toBeTruthy();
  });

  it('a lane opens its score sheet, which offers scoring hole by hole', () => {
    draw(true);
    fireEvent.click(screen.getByRole('button', { name: /Theo Marchetti.*edit score/i }));
    const sheet = screen.getByRole('dialog', { name: 'Score for Theo Marchetti' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Score hole by hole instead' }));
    expect(screen.queryByRole('dialog', { name: 'Score for Theo Marchetti' })).toBeNull();
  });

  it('the desk keeps both keys on each lane', () => {
    draw(false);
    expect(screen.getAllByRole('button', { name: /score .* by hole/i })).toHaveLength(live.lanes.length);
    expect(screen.getAllByRole('button', { name: /edit score for/i })).toHaveLength(live.lanes.length);
    expect(screen.getByRole('button', { name: 'Suspend play' }).className).toContain('ch-btn--secondary');
  });
});
