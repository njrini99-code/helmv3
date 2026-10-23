import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../../__tests__/dialog-polyfill';

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
const search = vi.hoisted(() => ({ current: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search.current) }));
const draw = vi.hoisted(() => ({ renderCardCanvas: vi.fn(), canvasBlob: vi.fn() }));
vi.mock('../draw-card', async (orig) => ({ ...(await orig<typeof import('../draw-card')>()), ...draw }));

import { PREVIEW_REVIEW, PREVIEW_REVIEW_COACH } from '../../../../preview/fixtures-round-review';
import { ToastProvider } from '../../../../ui/Toast';
import { GolfUserProvider } from '@/contexts/golf-user-context';
import { RoundCard } from '../RoundCard';
import { useJustSubmitted } from '../just-submitted';

function Probe() {
  return <output>{String(useJustSubmitted())}</output>;
}

const wrap = (ui: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {ui}
      </div>
    </ToastProvider>
  </LazyMotion>
);

beforeEach(() => {
  hapticSpy.mockClear();
  draw.renderCardCanvas.mockReset();
  draw.canvasBlob.mockReset();
  search.current = '';
});
afterEach(() => cleanup());

describe('RoundCard (page)', () => {
  it('phone: Out and In are two tables of nine holes each, named for a screen reader', () => {
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone just={false} settle={false} />));
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(tables[0]).toHaveAccessibleName(/Front nine/);
    expect(tables[1]).toHaveAccessibleName(/Back nine/);
    // 9 hole columns, the label and the subtotal.
    expect(within(tables[0]!).getAllByRole('columnheader')).toHaveLength(11);
  });

  it('desktop: one wide table, Out, In and Total', () => {
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone={false} just={false} settle={false} />));
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(1);
    const heads = within(tables[0]!).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Hole', ...Array.from({ length: 9 }, (_, i) => String(i + 1)), 'Out', ...Array.from({ length: 9 }, (_, i) => String(i + 10)), 'In', 'Total']);
    const score = within(tables[0]!).getByRole('row', { name: /^Score/ });
    expect(within(score).getAllByRole('cell').at(-1)).toHaveTextContent('74');
  });

  it('marks are named: a birdie is a birdie, a bogey a bogey, a par has no mark', () => {
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone={false} just={false} settle={false} />));
    expect(screen.getAllByRole('img', { name: '3, birdie' })).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: '6, bogey' })).toHaveLength(4);
    expect(document.querySelectorAll('.ch-rcard-mk.is-birdie')).toHaveLength(2);
    expect(document.querySelectorAll('.ch-rcard-mk.is-bogey')).toHaveLength(4);
  });

  it('shows the strokes gained by leg, gains and losses as the page does', () => {
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone={false} just={false} settle={false} />));
    const sg = within(document.querySelector('.ch-rcard-sg') as HTMLElement);
    expect(sg.getByText('Approach').nextElementSibling).toHaveTextContent('+1.3');
    expect(sg.getByText('Putting').nextElementSibling).toHaveTextContent('−0.9');
  });

  it('on a phone the legs carry short labels, each with its full name for a screen reader (A24)', () => {
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone just={false} settle={false} />));
    const terms = [...document.querySelectorAll('.ch-rcard-sg dt')];
    expect(terms.map((t) => t.querySelector('[aria-hidden="true"]')?.textContent ?? t.textContent)).toEqual(['Strokes gained', 'Off tee', 'Approach', 'Around', 'Putting']);
    expect(terms.map((t) => t.querySelector('.ch-sr-only')?.textContent ?? t.textContent)).toEqual(['Strokes gained', 'Off the tee', 'Approach', 'Around green', 'Putting']);
  });

  it('the quiet line shows only when the round was just posted; the card settles only when motion is on', () => {
    const { rerender } = render(wrap(<RoundCard review={PREVIEW_REVIEW} phone just={false} settle={false} />));
    expect(document.querySelector('[data-ch-code="CH-11924"]')).toBeNull();
    expect(document.querySelector('.ch-rcard.is-just')).toBeNull();
    rerender(wrap(<RoundCard review={PREVIEW_REVIEW} phone just settle />));
    expect(document.querySelector('[data-ch-code="CH-11924"]')).toHaveTextContent(/^Best on hole 5, a birdie\./);
    expect(document.querySelector('.ch-rcard.is-just')).not.toBeNull();
    rerender(wrap(<RoundCard review={PREVIEW_REVIEW} phone just settle={false} />));
    expect(document.querySelector('[data-ch-code="CH-11924"]')).not.toBeNull(); // reduced motion keeps the line, drops the movement
    expect(document.querySelector('.ch-rcard.is-just')).toBeNull();
  });

  it('fires no haptic of its own on arrival (the submit path already fired the success)', () => {
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone just settle />));
    expect(hapticSpy).not.toHaveBeenCalled();
  });

  it('Print is a desktop control; a phone has Share alone', () => {
    const { rerender } = render(wrap(<RoundCard review={PREVIEW_REVIEW} phone={false} just={false} settle={false} />));
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
    rerender(wrap(<RoundCard review={PREVIEW_REVIEW} phone just={false} settle={false} />));
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Share card' })).toBeInTheDocument();
  });

  it('a coach’s printed head names the player', () => {
    render(wrap(<RoundCard review={PREVIEW_REVIEW_COACH} phone={false} just={false} settle={false} />));
    expect(document.querySelector('.ch-rcard-pr__k')?.getAttribute('data-t')).toMatch(/^Jonah Okafor · /);
  });
});

describe('RoundCard share sheet', () => {
  const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

  beforeEach(() => {
    draw.renderCardCanvas.mockResolvedValue({});
    draw.canvasBlob.mockResolvedValue(png());
    URL.createObjectURL = vi.fn(() => 'blob:card');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('draws the picture before the tap, offers Save image where nothing can share files, and downloads', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share: undefined }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone={false} just={false} settle={false} />));
    await userEvent.click(screen.getByRole('button', { name: 'Share card' }));
    expect(await screen.findByRole('img', { name: /Scorecard: Finley GC, 74, \+2/ })).toBeInTheDocument();
    expect(draw.renderCardCanvas).toHaveBeenCalledWith(expect.objectContaining({ course: 'Finley GC' }), { sg: true, tally: true });
    await userEvent.click(screen.getByRole('button', { name: 'Save image' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(hapticSpy).toHaveBeenCalledWith('success');
    click.mockRestore();
  });

  it('shares the file through the share sheet when the device can', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share, canShare: () => true }));
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone={false} just={false} settle={false} />));
    await userEvent.click(screen.getByRole('button', { name: 'Share card' }));
    await screen.findByRole('img', { name: /Scorecard/ });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = share.mock.calls[0]![0] as ShareData;
    expect(arg.files?.[0]?.name).toBe('finley-gc-2026-10-14-74.png');
    expect(arg.files?.[0]?.type).toBe('image/png');
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('success'));
  });

  it('leaving the strokes gained off the picture draws it again without them', async () => {
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone={false} just={false} settle={false} />));
    await userEvent.click(screen.getByRole('button', { name: 'Share card' }));
    await screen.findByRole('img', { name: /Scorecard/ });
    await userEvent.click(screen.getByRole('switch', { name: 'Strokes gained' }));
    await waitFor(() => expect(draw.renderCardCanvas).toHaveBeenLastCalledWith(expect.anything(), { sg: false, tally: true }));
    await userEvent.click(screen.getByRole('switch', { name: 'Putts, fairways and greens' }));
    await waitFor(() => expect(draw.renderCardCanvas).toHaveBeenLastCalledWith(expect.anything(), { sg: false, tally: false }));
  });

  it('the picture names the signed-in player and their team on a player’s own round, and the player on a coach’s view', async () => {
    const as = (role: 'player' | 'coach', name: string, review: typeof PREVIEW_REVIEW) =>
      wrap(
        <GolfUserProvider userData={{ role, userId: 'u1', name, teamName: 'Varsity' }}>
          <RoundCard review={review} phone={false} just={false} settle={false} />
        </GolfUserProvider>,
      );
    const { unmount } = render(as('player', 'Jonah Okafor', PREVIEW_REVIEW));
    await userEvent.click(screen.getByRole('button', { name: 'Share card' }));
    await waitFor(() => expect(draw.renderCardCanvas).toHaveBeenCalled());
    expect(draw.renderCardCanvas.mock.calls[0]![0]).toMatchObject({ kicker: 'Jonah Okafor · Wed Oct 14 · Practice', team: 'Varsity' });
    unmount();
    draw.renderCardCanvas.mockClear();
    render(as('coach', 'Maya Reyes', PREVIEW_REVIEW_COACH));
    await userEvent.click(screen.getByRole('button', { name: 'Share card' }));
    await waitFor(() => expect(draw.renderCardCanvas).toHaveBeenCalled());
    expect(draw.renderCardCanvas.mock.calls[0]![0].kicker.startsWith('Jonah Okafor · ')).toBe(true);
  });

  it('a card that cannot be drawn says so and offers no Share', async () => {
    draw.renderCardCanvas.mockResolvedValue(null);
    render(wrap(<RoundCard review={PREVIEW_REVIEW} phone={false} just={false} settle={false} />));
    await userEvent.click(screen.getByRole('button', { name: 'Share card' }));
    expect(await screen.findByText(/couldn’t be drawn/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save image|Share$/ })).toBeDisabled();
  });
});

describe('useJustSubmitted', () => {
  it('is true only for ?just=submitted, and takes it out of the address so a reload does not replay it', () => {
    search.current = 'just=submitted';
    window.history.replaceState(null, '', '/golf/dashboard/rounds/r1?just=submitted&x=1');
    render(<Probe />);
    expect(screen.getByRole('status')).toHaveTextContent('true');
    expect(window.location.search).toBe('?x=1');
  });

  it('is false for a plain visit and for another value', () => {
    window.history.replaceState(null, '', '/golf/dashboard/rounds/r1');
    render(<Probe />);
    expect(screen.getByRole('status')).toHaveTextContent('false');
    cleanup();
    search.current = 'just=other';
    render(<Probe />);
    expect(screen.getByRole('status')).toHaveTextContent('false');
  });
});
