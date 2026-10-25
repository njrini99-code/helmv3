// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A7 on Game detail: a new player's rates say what they need instead of 0% or 100%; between the floors a rate keeps its value,
 * untoned, with the early-read tag; from the steady floor it reads as before.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import { PREVIEW_PLAYER } from '../../../preview/fixtures-stats';
import { GameDetail } from '../GameDetail';

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

const base = PREVIEW_PLAYER.stats!;
const draw = (over: Partial<typeof base>, rounds: number) =>
  render(
    <div className="ch-root" data-ui="clubhouse">
      <GameDetail s={{ ...base, ...over }} x={PREVIEW_PLAYER.extra} bench={{ ...PREVIEW_PLAYER.bench, scrambling_pct_sand: 50 }} first="Jonah" rounds={rounds} window={PREVIEW_PLAYER.window} />
    </div>,
  );
/** A figure's value cell and the line under it, by its label. */
const fig = (label: string) => {
  const dt = [...document.querySelectorAll('.ch-gm__figs dt')].find((d) => d.textContent === label)!;
  const [value, note] = [...dt.parentElement!.querySelectorAll('dd')];
  return { value: value!, note: note?.textContent ?? null };
};

describe('rate floors on Game detail (A7)', () => {
  it('one bunker shot, one scramble and one round: each says what it needs, never 100%', () => {
    draw({ sandSaveAttempts: 1, sandSavesMade: 1, sandSavePercentage: 100, scrambleAttempts: 1, scramblesMade: 1, scramblingPercentage: 100 }, 1);
    expect(fig('Sand saves').value.textContent).toBe('Needs 10 chances');
    expect(fig('Sand saves').value.className).toBe('ch-gm__none');
    expect(fig('Scrambling').value.textContent).toBe('Needs 10 chances');
    expect(fig('Fairways hit').value.textContent).toBe('Needs 2 rounds');
    expect(fig('Greens in regulation').value.textContent).toBe('Needs 2 rounds');
    expect(document.querySelector('#gm-short .ch-gm__t p')!.textContent).not.toMatch(/100%/);
  });

  it('twelve sand attempts are an early read: the value, untoned, with its tag', () => {
    draw({ sandSaveAttempts: 12, sandSavesMade: 9, sandSavePercentage: 75, scrambleAttempts: 40, scramblesMade: 20, scramblingPercentage: 50 }, 12);
    const sand = fig('Sand saves');
    expect(sand.value.textContent).toBe('75%');
    expect(sand.value.className).toBe('ch-num');
    expect(sand.note).toBe('Early read · 12 chances · Tour 50%');
  });

  it('forty attempts read plain, toned against the Tour', () => {
    draw({ sandSaveAttempts: 40, sandSavesMade: 30, sandSavePercentage: 75, scrambleAttempts: 40, scramblesMade: 20, scramblingPercentage: 50 }, 12);
    const sand = fig('Sand saves');
    expect(sand.value.textContent).toBe('75%');
    expect(sand.value.className).toBe('ch-num ch-gain');
    expect(sand.note).toBe('Tour 50%');
  });
});
