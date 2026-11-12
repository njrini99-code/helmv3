import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { STATIONS, stationFigures, type ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { coinSlots, HOLE } from '../hole-geometry';
import { TeamHole } from '../TeamHole';

/**
 * W9 (staging, 11 Nov): at Putting the coins overlapped, one covered by the next ("+2", a half-hidden "B", "MR"). A coin keeps its
 * 22px on screen, so when the hole draws smaller than its own width the coin grows in the drawing, and the hand-placed slots, 24
 * units apart, no longer held it. The slots fan out with the coin and stay inside the drawing.
 */

vi.mock('../../../../lib/reduced-motion', () => ({ useChReducedMotion: () => true }));

const RING = 1.5;
const GAP = 3;
const apart = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('coinSlots: a station’s coins never touch, at any drawn size, and stay on the hole', () => {
  for (const o of ['h', 'v'] as const) {
    for (const s of STATIONS) {
      it.each([1, 1.1, 1.33, 1.6, 2])(`${o} ${s}: coins at ${'%s'}x keep a gap and sit inside`, (up) => {
        const r = 11 * up;
        for (let drawn = 1; drawn <= HOLE[o].coins[s].length; drawn++) {
          const slots = coinSlots(HOLE[o], s, r, drawn);
          expect(slots).toHaveLength(drawn);
          for (let i = 0; i < slots.length; i++) {
            const [x, y] = slots[i]!;
            expect(x - r - RING / 2).toBeGreaterThanOrEqual(-1e-9);
            expect(y - r - RING / 2).toBeGreaterThanOrEqual(-1e-9);
            expect(x + r + RING / 2).toBeLessThanOrEqual(HOLE[o].w + 1e-9);
            expect(y + r + RING / 2).toBeLessThanOrEqual(HOLE[o].h + 1e-9);
            for (let j = i + 1; j < slots.length; j++) expect(apart(slots[i]!, slots[j]!)).toBeGreaterThanOrEqual(2 * r + RING + GAP - 1e-9);
          }
        }
      });
    }
  }

  it('a lone coin stands on its hand-placed slot whenever it fits there', () => {
    expect(coinSlots(HOLE.h, 'putting', 11, 1)).toEqual([HOLE.h.coins.putting[0]]);
    expect(coinSlots(HOLE.h, 'approach', 22, 1)).toEqual([HOLE.h.coins.approach[0]]);
  });
});

describe('the hole drawn at three quarters of its width, five players losing most at Putting (W9)', () => {
  const origRO = globalThis.ResizeObserver;
  const origRect = Element.prototype.getBoundingClientRect;
  afterEach(() => {
    cleanup();
    globalThis.ResizeObserver = origRO;
    Element.prototype.getBoundingClientRect = origRect;
  });

  it('draws two coins and "+3", fanned so no coin covers another', () => {
    // The drawing measures 570 of its 760 units wide: a coin is 11 / 0.75 units in radius.
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.getBoundingClientRect = function () {
      return { width: this instanceof SVGSVGElement ? 570 : 0, height: 0, x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
    };
    const base = PREVIEW_TEAM_BOARD.players.list[0] as ChTeamPlayer;
    const names = ['Mason Reed', 'Ethan Brooks', 'Cole Bennett', 'Dylan Park', 'Owen Carter'];
    const players = names.map((name, i) => ({ ...base, id: `p-${i}`, name, first: name.split(' ')[0]!, worst: 'putting' as const, early: false }));
    const { container } = render(<TeamHole stations={stationFigures(PREVIEW_TEAM_BOARD.players.list)} players={players} station="approach" onStation={() => {}} orientation="h" />);
    const coins = [...container.querySelectorAll('.scn')].map((g) => {
      const c = g.querySelector('circle:not(.hit)') as SVGCircleElement;
      return { at: [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))] as [number, number], r: Number(c.getAttribute('r')), text: g.textContent };
    });
    expect(coins.map((c) => c.text)).toEqual(['MR', 'EB', '+3']);
    const r = 11 / 0.75;
    for (const c of coins) expect(c.r).toBeCloseTo(r, 5);
    for (let i = 0; i < coins.length; i++) {
      for (let j = i + 1; j < coins.length; j++) expect(apart(coins[i]!.at, coins[j]!.at)).toBeGreaterThanOrEqual(2 * r + RING);
    }
  });
});
