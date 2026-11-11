import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { DataGapAsk } from '@/lib/coachhelm/data-gap/asks';
import { RoundTracking, type RoundTrackingProps } from '../RoundTracking';
import { ToastProvider } from '../../../../ui/Toast';
import '../../../../__tests__/dialog-polyfill';

/**
 * The data prompts' place (owner, 2026-11-11): the card's foot band, which they share with the distance row. A prompt
 * shows while that row is still held (no result yet) and pushes nothing as it comes, is answered or is skipped: once it
 * goes it is still drawn, hidden and inert, until the next shot. What a tap writes is unchanged (data-prompts.test.tsx).
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
const TEE_ROUGH = shot({ ...TEE, result: 'rough', missDirection: 'right' });
const APPROACH = shot({ shotNumber: 2, shotType: 'approach', distanceToHoleBefore: 140, result: 'green', distanceToHoleAfter: 8, distanceUnitAfter: 'feet', shotDistance: 137 });
const PUTT_MISS = shot({ shotNumber: 3, shotType: 'putting', lieBefore: 'green', distanceToHoleBefore: 8, distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', puttDistanceFeet: 8 });
const ASK: DataGapAsk = {
  readId: 'read-1',
  readTitle: 'Putts from 5–10 ft',
  field: 'miss_direction',
  filter: { shot_type: 'putting', first_putt: true, distance_feet: [5, 10], holed: false },
  targetCount: 6,
  haveCount: 2,
  taggedSince: 3,
  untaggedSince: 0,
  bandLabel: '5–10 ft',
  windowEnd: '2026-10-01',
};

function setup(over: Partial<RoundTrackingProps> = {}) {
  const onAutoSave = vi.fn(async () => undefined);
  const props: RoundTrackingProps = { round: ROUND, holes: HOLES, currentHoleIndex: 0, onHoleComplete: vi.fn(async () => true), onNavigateToHole: vi.fn(), onAutoSave, ...over };
  render(
    <ToastProvider>
      <RoundTracking {...props} />
    </ToastProvider>,
  );
  return { onAutoSave, user: userEvent.setup() };
}
const band = () => document.querySelector<HTMLElement>('.ch-rt-band')!;
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const putt = { initialShots: [TEE, APPROACH, PUTT_MISS], initialShotNumber: 4, dataGapAsks: [ASK] };

describe('a data prompt stands in the card’s foot band, with the distance row', () => {
  it('no prompt: the band holds the distance row alone', () => {
    setup({ initialShots: [TEE], initialShotNumber: 2 });
    expect(band().dataset.face).toBe('distance');
    expect(band().querySelector('.ch-rt-band__ask')).toBeNull();
    expect(band().querySelector('#ch-rt-dist')).not.toBeNull();
  });

  it('the prompt is in the band, after the results, not first in the card', () => {
    setup(putt);
    const ask = code('CH-11960')!;
    expect(ask.closest('.ch-rt-band')).toBe(band());
    expect(ask.parentElement!.className).toBe('ch-rt-band__ask');
    expect(band().dataset.face).toBe('ask');
    // The card's order: the result's place, then the band (the prompt, and the distance row held under it), then the read row.
    expect([...document.querySelectorAll('.ch-rt-card > *')].map((el) => el.className.split(' ')[0])).toEqual(['ch-rt-slot', 'ch-rt-band', 'ch-rt-sec']);
    expect(document.getElementById('ch-rt-dist')!.closest('.is-reserved')).not.toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Putt result' }).compareDocumentPosition(ask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('picking a result gives the band to the distance row; Change gives it back', async () => {
    const { user } = setup(putt);
    await user.click(screen.getByRole('radio', { name: 'Green' }));
    expect(band().dataset.face).toBe('distance');
    expect(document.getElementById('ch-rt-dist')!.closest('.is-reserved')).toBeNull();
    // Still mounted (it is hidden by the band's face on the phone), so the band is as tall as the taller of the two.
    expect(code('CH-11960')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: /Change$/ }));
    await user.click(screen.getByRole('radio', { name: 'Holed' }));
    // A holed ball asks no distance: the row is held again, and the prompt has the band.
    expect(band().dataset.face).toBe('distance');
  });

  it('Skip takes the prompt away and leaves its box: held, hidden from everyone, until the next shot', async () => {
    const { onAutoSave, user } = setup(putt);
    const before = band().querySelector('.ch-rt-ask')!.innerHTML.length;
    await user.click(screen.getByRole('button', { name: 'Skip tagging this putt' }));
    expect(code('CH-11960')).toBeNull();
    expect(onAutoSave).not.toHaveBeenCalled();
    expect(band().dataset.face).toBe('distance');
    const held = band().querySelector<HTMLElement>('.ch-rt-held')!;
    expect(held).not.toBeNull();
    expect(held.hasAttribute('inert')).toBe(true);
    expect(held.getAttribute('aria-hidden')).toBe('true');
    const copy = held.querySelector('.ch-rt-ask.is-held')!;
    expect(copy.hasAttribute('data-ch-code')).toBe(false);
    expect(copy.querySelector('[role="status"]')).toBeNull();
    // The same question, chips and line as it last stood, so it is the same height.
    expect(copy.textContent).toContain('Which side did it miss?');
    expect(copy.querySelectorAll('.ch-rt-tags button')).toHaveLength(4);
    expect(copy.textContent).toContain('First putt, 8 ft · 3 of 6 for your 5–10 ft putt read');
    expect(before).toBeGreaterThan(0);
    // Nothing of it can be reached.
    expect(screen.queryByText('Which side did it miss?', { ignore: '[aria-hidden="true"] *' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Short' })).toBeNull();
    // The next shot starts clean.
    await user.click(screen.getByRole('radio', { name: 'Holed' }));
    await user.click(screen.getByRole('button', { name: /Complete hole/ }));
  });

  it('an answered prompt keeps its place as the receipt, and its heading keeps the line Skip stood in', async () => {
    const { user } = setup({ initialShots: [TEE_ROUGH], initialShotNumber: 2, recoveryPrompt: true });
    const ask = code('CH-11961')!;
    expect(ask.closest('.ch-rt-band__ask')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear shot' }));
    expect(code('CH-11961')!.textContent).toContain('Saved: a clear shot');
    expect(within(code('CH-11961') as HTMLElement).queryByRole('button', { name: 'Skip the recovery question' })).toBeNull();
    expect(band().dataset.face).toBe('ask');
    expect(band().querySelector('.ch-rt-held')).toBeNull();
  });

  it('the held copy goes with its shot', async () => {
    const { user } = setup({ initialShots: [TEE_ROUGH], initialShotNumber: 2, recoveryPrompt: true });
    await user.click(screen.getByRole('button', { name: 'Skip the recovery question' }));
    expect(band().querySelector('.ch-rt-held')).not.toBeNull();
    await user.click(screen.getByRole('radio', { name: /^Green/ }));
    await user.click(within(screen.getByRole('group', { name: 'Quick distances' })).getByRole('button', { name: '10' }));
    await user.click(screen.getByRole('button', { name: 'Record next shot' }));
    expect(band().querySelector('.ch-rt-held')).toBeNull();
    expect(band().querySelector('.ch-rt-band__ask')).toBeNull();
  });
});

describe('the band is one cell on the phone (rounds-track.css)', () => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds-track.css'), 'utf8');
  const cut = css.indexOf('/* Board 3, "On the course, glove on"');
  const desk = css.slice(0, cut);
  const phone = css.slice(cut);
  const rule = (src: string, selector: string, indent = '  ') => {
    const at = src.indexOf(`\n${indent}${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return src.slice(at, src.indexOf(`\n${indent}}`, at));
  };
  it('the prompt and the distance row share the cell, and a gone prompt keeps its box', () => {
    expect(rule(phone, '.ch-rt-band')).toMatch(/display: grid;/);
    expect(rule(phone, '.ch-rt-band > *')).toMatch(/grid-area: 1 \/ 1;/);
    const hidden = rule(phone, ".ch-rt-band[data-face='distance'] > .ch-rt-band__ask");
    expect(hidden).toMatch(/visibility: hidden;/);
    expect(hidden).not.toMatch(/display: none/);
    const held = rule(phone, '.ch-rt-held');
    expect(held).toMatch(/display: block;/);
    expect(held).toMatch(/visibility: hidden;/);
  });
  it('a prompt is one height whatever it says', () => {
    expect(rule(phone, '.ch-rt-ask .ch-rt-sec__h')).toMatch(/min-height: 28px;/);
    expect(rule(phone, '.ch-rt-ask .ch-rt-tags')).toMatch(/grid-auto-flow: column;/);
  });
  it('on the desk the prompt stands first in the panel as before, and a gone prompt takes no room', () => {
    expect(rule(desk, '.ch-rt-band', '')).toMatch(/display: contents;/);
    expect(rule(desk, '.ch-rt-band__ask', '')).toMatch(/order: -1;/);
    expect(rule(desk, '.ch-rt-held', '')).toMatch(/display: none;/);
  });
});
