import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HoleStats, RoundHole, ShotRecord } from '@/lib/types/golf';
import { RoundTracking, type RoundTrackingProps } from '../RoundTracking';
import { ToastProvider } from '../../../../ui/Toast';
import '../../../../__tests__/dialog-polyfill';

/**
 * Putting (owner, 2026-11-11): Putt result first, the required leave distance directly under it, and Break and slope
 * as one optional row below, closed until the player opens it and then open for the rest of the round. The two fields
 * and what they record are unchanged.
 */
Element.prototype.scrollIntoView ??= function () {};
vi.mock('@/app/golf/actions/shot-actions', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
afterEach(cleanup);

const HOLES: RoundHole[] = [
  { number: 1, par: 4, yardage: 380, score: null },
  { number: 2, par: 4, yardage: 400, score: null },
];
const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };
const shot = (s: Partial<ShotRecord> & Pick<ShotRecord, 'shotNumber' | 'shotType' | 'result'>): ShotRecord => ({
  clubType: 'non_driver',
  lieBefore: 'fairway',
  distanceToHoleBefore: 0,
  distanceUnitBefore: 'yards',
  distanceToHoleAfter: 0,
  distanceUnitAfter: 'yards',
  shotDistance: 0,
  isPenalty: false,
  ...s,
});
const TEE = shot({ shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 380, result: 'fairway', distanceToHoleAfter: 140, shotDistance: 240 });
const APPROACH = shot({ shotNumber: 2, shotType: 'approach', distanceToHoleBefore: 140, result: 'green', distanceToHoleAfter: 18, distanceUnitAfter: 'feet', shotDistance: 134 });

function setup(over: Partial<RoundTrackingProps> = {}) {
  const onHoleComplete = vi.fn(async (_i: number, _s: HoleStats) => true);
  const props: RoundTrackingProps = { round: ROUND, holes: HOLES, currentHoleIndex: 0, onHoleComplete, onNavigateToHole: vi.fn(), initialShots: [TEE, APPROACH], initialShotNumber: 3, ...over };
  render(
    <ToastProvider>
      <RoundTracking {...props} />
    </ToastProvider>,
  );
  return { onHoleComplete, user: userEvent.setup() };
}
const row = () => screen.getByRole('button', { name: /^Break and slope/ });
const quick = (n: number) => within(screen.getByRole('group', { name: 'Quick distances' })).getByRole('button', { name: String(n) });
const next = () => screen.getByRole('button', { name: /Record next shot|Complete hole/ });

describe('a putt asks its result first, then the leave, then the optional read', () => {
  it('the card’s order: Putt result, Leave distance, Break and slope', () => {
    setup();
    const parts = [...document.querySelectorAll('.ch-rt-card > *')].map((el) => (el.matches('.ch-rt-slot') ? 'result' : el.matches('.ch-rt-read') ? 'read' : el.querySelector('#ch-rt-dist') ? 'distance' : el.className));
    expect(parts).toEqual(['result', 'distance', 'read']);
    expect(screen.queryByText('Putting details')).toBeNull();
  });

  it('the four results stand in one row', () => {
    setup();
    const group = screen.getByRole('radiogroup', { name: 'Putt result' });
    expect(within(group).getAllByRole('radio').map((r) => r.childNodes[0]!.textContent)).toEqual(['Holed', 'Green', 'Rough', 'Sand']);
    expect(group.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
  });

  it('Break and slope is one row, closed until it is opened', async () => {
    const { user } = setup();
    expect(row().getAttribute('aria-expanded')).toBe('false');
    expect(row().textContent).toBe('Break and slopeOptional');
    expect(screen.queryByRole('radiogroup', { name: 'Putt break' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Putt slope' })).toBeNull();
    await user.click(row());
    expect(row().getAttribute('aria-expanded')).toBe('true');
    expect(within(screen.getByRole('radiogroup', { name: 'Putt break' })).getAllByRole('radio').map((r) => r.textContent)).toEqual(['L → R', 'Straight', 'R → L', 'Mult.']);
    expect(within(screen.getByRole('radiogroup', { name: 'Putt slope' })).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Uphill', 'Level', 'Downhill', 'Severe']);
    // The row comes first in the page's order (focus reaches it before its choices) and names what it opens.
    expect(row().getAttribute('aria-controls')).toBe(screen.getByRole('radiogroup', { name: 'Putt break' }).closest('.ch-rt-read__b')!.id);
    expect(row().compareDocumentPosition(screen.getByRole('radiogroup', { name: 'Putt break' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('closed, the row still says what the putt carries', async () => {
    const { user } = setup();
    await user.click(row());
    await user.click(screen.getByRole('radio', { name: 'R → L' }));
    expect(row().textContent).toBe('Break and slopeR → L');
    await user.click(screen.getByRole('radio', { name: 'Downhill' }));
    await user.click(row());
    expect(row().getAttribute('aria-expanded')).toBe('false');
    expect(row().textContent).toBe('Break and slopeR → L · Downhill');
    expect(screen.queryByRole('radiogroup', { name: 'Putt break' })).toBeNull();
  });

  it('once opened it is open on every putt for the rest of the round, on the next hole too', async () => {
    const Round = () => {
      const [index, setIndex] = useState(0);
      return (
        <RoundTracking
          round={ROUND}
          holes={HOLES}
          currentHoleIndex={index}
          initialShots={index === 0 ? [TEE, APPROACH] : [{ ...TEE, distanceToHoleBefore: 400 }, APPROACH]}
          initialShotNumber={3}
          onHoleComplete={async () => {
            setIndex(1);
            return true;
          }}
          onNavigateToHole={setIndex}
        />
      );
    };
    render(
      <ToastProvider>
        <Round />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    await user.click(row());
    await user.click(screen.getByRole('radio', { name: 'Green' }));
    await user.click(quick(2));
    await user.click(next());
    // The second putt: still open, and empty (the read belongs to each putt).
    expect(row().getAttribute('aria-expanded')).toBe('true');
    expect(row().textContent).toBe('Break and slopeOptional');
    expect(screen.getByRole('radiogroup', { name: 'Putt slope' })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Holed' }));
    await user.click(next());
    // Hole 2's first putt.
    expect(await screen.findByRole('heading', { name: /hole 2/ })).toBeTruthy();
    expect(row().getAttribute('aria-expanded')).toBe('true');
  });

  it('the read is recorded as it was: break and slope on the putt they were picked for', async () => {
    const { onHoleComplete, user } = setup();
    await user.click(row());
    await user.click(screen.getByRole('radio', { name: 'Mult.' }));
    await user.click(screen.getByRole('radio', { name: 'Severe' }));
    await user.click(screen.getByRole('radio', { name: 'Green' }));
    await user.click(quick(3));
    await user.click(next());
    await user.click(screen.getByRole('radio', { name: 'Straight' }));
    await user.click(screen.getByRole('radio', { name: 'Holed' }));
    await user.click(next());
    const shots = onHoleComplete.mock.calls[0]![1].shots;
    expect(shots[2]).toMatchObject({ shotType: 'putting', result: 'green', puttBreak: 'multiple', puttSlope: 'severe', distanceToHoleAfter: 3 });
    expect(shots[3]).toMatchObject({ shotType: 'putting', result: 'hole', puttBreak: 'straight' });
    expect(shots[3]!.puttSlope ?? null).toBeNull();
  });

  it('no other shot has the row', () => {
    setup({ initialShots: [TEE], initialShotNumber: 2 });
    expect(screen.queryByRole('button', { name: /^Break and slope/ })).toBeNull();
  });
});

describe('on the phone the row is the card’s foot and opens upward (rounds-track.css)', () => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds-track.css'), 'utf8');
  const phone = css.slice(css.indexOf('/* Board 3, "On the course, glove on"'));
  it('its choices are drawn above it, so the row just tapped does not move', () => {
    const at = phone.indexOf('\n  .ch-rt-card > .ch-rt-read {');
    expect(at).toBeGreaterThan(-1);
    expect(phone.slice(at, phone.indexOf('\n  }', at))).toMatch(/flex-direction: column-reverse;/);
    // On the desk it opens downward, a plain disclosure.
    expect(css.slice(0, css.indexOf('/* Board 3, "On the course, glove on"'))).toMatch(/\.ch-rt-read \{\s*display: flex;\s*flex-direction: column;/);
  });
  it('the missed putt’s tags pair up two by two', () => {
    const at = phone.indexOf('\n  .ch-rt-follow .ch-rt-tags {');
    expect(phone.slice(at, phone.indexOf('\n  }', at))).toMatch(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });
});
