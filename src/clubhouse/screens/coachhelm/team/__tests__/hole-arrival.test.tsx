import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATIONS, stationFigures } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { HOLE } from '../hole-geometry';
import { FLIGHT_MS, flightEase, flightTable, flightTime, holeFlight, pointAt, stationFraction } from '../hole-flight';
import { TeamHole } from '../TeamHole';
import { Huddle } from '../Huddle';

let reduce = false;
vi.mock('../../../../lib/reduced-motion', () => ({ useChReducedMotion: () => reduce }));

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-team.css'), 'utf8');
const list = PREVIEW_TEAM_BOARD.players.list;
const stations = stationFigures(list);

afterEach(() => {
  cleanup();
  reduce = false;
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe('the ball’s flight, worked out from the hole’s own line (M-TEAM-01)', () => {
  it.each(['v', 'h'] as const)('%s: leaves the tee and lands on the flag', (o) => {
    const f = holeFlight(HOLE[o]);
    const first = f.frames[0]!;
    const last = f.frames[f.frames.length - 1]!;
    expect(first.offset).toBe(0);
    expect(last.offset).toBe(1);
    expect(first.x * HOLE[o].w).toBeCloseTo(HOLE[o].st.tee.x, 0);
    expect(last.x * HOLE[o].w).toBeCloseTo(HOLE[o].flag.x, 0);
    expect(last.y * HOLE[o].h).toBeCloseTo(HOLE[o].flag.y, 0);
  });

  it('stays on the drawn line the whole way: every frame is a point of the path, in order', () => {
    const table = flightTable(HOLE.v.path);
    let before = -1;
    for (const frame of holeFlight(HOLE.v).frames) {
      const along = stationFraction(table, { x: frame.x * HOLE.v.w, y: frame.y * HOLE.v.h });
      expect(along).toBeGreaterThanOrEqual(before);
      before = along;
      const on = pointAt(table, along);
      expect(Math.hypot(on.x - frame.x * HOLE.v.w, on.y - frame.y * HOLE.v.h)).toBeLessThan(1.5);
    }
  });

  it('is slow off the tee and onto the green: the page’s ease, and its inverse', () => {
    expect(flightEase(0)).toBe(0);
    expect(flightEase(0.5)).toBeCloseTo(0.5);
    expect(flightEase(1)).toBe(1);
    for (const e of [0, 0.1, 0.42, 0.5, 0.77, 1]) expect(flightEase(flightTime(e))).toBeCloseTo(e, 6);
  });

  it('rings the stations in the order the ball passes them, the tee first and putting as it lands (M-TEAM-03)', () => {
    const { passMs } = holeFlight(HOLE.v);
    expect(passMs.tee).toBe(0);
    expect(passMs.tee).toBeLessThan(passMs.approach);
    expect(passMs.approach).toBeLessThan(passMs.short_game);
    expect(passMs.short_game).toBeLessThan(passMs.putting);
    expect(passMs.putting).toBeLessThanOrEqual(FLIGHT_MS);
    // The lane's 07 file reads these off the page at 790, 1270 and 1710ms; the path maths lands within a few frames of each.
    expect(Math.abs(passMs.approach - 790)).toBeLessThan(90);
    expect(Math.abs(passMs.short_game - 1270)).toBeLessThan(90);
    expect(Math.abs(passMs.putting - 1710)).toBeLessThan(90);
  });
});

describe('the hole is whole before anything moves', () => {
  const draw = (arrive = true) => render(<TeamHole stations={stations} players={list} station="approach" onStation={() => {}} orientation="v" arrive={arrive} />);

  it('draws every station, figure and coin at rest in the first frame, with nothing hidden for the arrival', () => {
    const { container } = draw();
    expect(container.querySelectorAll('.stn')).toHaveLength(STATIONS.length);
    for (const el of container.querySelectorAll<SVGElement>('.stn, .scn, .flight, .sv, .sl')) {
      expect(el.style.opacity).toBe('');
      expect(el.style.transform).toBe('');
      expect(el.getAttribute('opacity')).toBeNull();
    }
    // No ball parked in the drawing, and no dash offset holding the line back.
    expect(container.querySelector('.holesvg .ball')).toBeNull();
    expect(css).not.toMatch(/\.holesvg \.flight \{[^}]*stroke-dashoffset/);
    // The layer that moves takes no taps and holds nothing until the ball leaves.
    const fx = container.querySelector('.holefx')!;
    expect(fx.getAttribute('aria-hidden')).toBe('true');
    expect(fx.children).toHaveLength(0);
    expect(css).toMatch(/\.ch-htb \.holefx \{[^}]*pointer-events:none;/);
  });

  it('flies once a session: the ball, its trail and one ring a station, then the layer is empty again', async () => {
    vi.useFakeTimers();
    const played: Array<{ el: Element; frames: Keyframe[]; options: KeyframeAnimationOptions; anim: { onfinish: (() => void) | null; cancel: () => void } }> = [];
    const animate = vi.fn(function (this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      const anim = { onfinish: null as (() => void) | null, cancel: vi.fn() };
      played.push({ el: this, frames, options, anim });
      return anim as unknown as Animation;
    });
    const had = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
    try {
      const { container, unmount } = draw();
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(260);
      });
      const fx = container.querySelector('.holefx')!;
      expect(fx.hasAttribute('data-ch-team-fly')).toBe(true);
      expect(fx.querySelectorAll('[data-fly]')).toHaveLength(4);
      expect(fx.querySelectorAll('[data-ripple]')).toHaveLength(STATIONS.length);
      // Transform and opacity, nothing else, on every moving part.
      for (const p of played) for (const k of p.frames) expect(Object.keys(k).filter((key) => key !== 'offset').every((key) => key === 'transform' || key === 'opacity')).toBe(true);
      const ball = played.find((p) => p.el.matches('[data-fly="0"]'))!;
      expect(ball.options.duration).toBe(FLIGHT_MS);
      expect(ball.options.easing).toBe('linear');
      const ring = played.find((p) => p.el.matches('[data-ripple="putting"]'))!;
      expect(ring.frames[0]).toMatchObject({ transform: 'scale(1)' });
      expect(ring.frames[1]).toMatchObject({ opacity: 0, transform: 'scale(1.7)' });
      // The stations under it never changed.
      for (const el of container.querySelectorAll<SVGElement>('.stn')) expect(el.style.opacity).toBe('');
      // The ball's fade ends it.
      const fade = played.find((p) => p.el.matches('.holefx__ball') && p.el.parentElement?.matches('[data-fly="0"]'))!;
      act(() => fade.anim.onfinish?.());
      expect(container.querySelector('.holefx')!.children).toHaveLength(0);
      unmount();
      // The next visit in this session is still.
      const again = draw();
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(600);
      });
      expect(again.container.querySelector('[data-fly]')).toBeNull();
    } finally {
      if (had) Object.defineProperty(Element.prototype, 'animate', had);
      else delete (Element.prototype as { animate?: unknown }).animate;
    }
  });

  it('is still under Reduce Motion and Animations off: no ball, no ring, no pulse', async () => {
    reduce = true;
    vi.useFakeTimers();
    const { container, rerender } = render(<TeamHole stations={stations} players={list} station="approach" onStation={() => {}} orientation="v" arrive picks={0} />);
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(600);
    });
    rerender(<TeamHole stations={stations} players={list} station="putting" onStation={() => {}} orientation="v" arrive picks={1} />);
    expect(container.querySelector('.holefx')!.children).toHaveLength(0);
    expect(window.sessionStorage.getItem('ch:team:htb-flown')).toBeNull();
  });

  it('does not fly on the empty hole or a picture of it', async () => {
    vi.useFakeTimers();
    const { container } = draw(false);
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(600);
    });
    expect(container.querySelector('[data-fly]')).toBeNull();
  });
});

describe('the selected station’s pulse (M-TEAM-06)', () => {
  it('answers a choice, never the first paint or a station brought back from the last visit', () => {
    const { container, rerender } = render(<TeamHole stations={stations} players={list} station="approach" onStation={() => {}} orientation="v" picks={0} />);
    expect(container.querySelector('.is-pulse')).toBeNull();
    rerender(<TeamHole stations={stations} players={list} station="putting" onStation={() => {}} orientation="v" picks={0} />);
    expect(container.querySelector('.is-pulse')).toBeNull();
    rerender(<TeamHole stations={stations} players={list} station="short_game" onStation={() => {}} orientation="v" picks={1} />);
    expect(container.querySelectorAll('.is-pulse')).toHaveLength(1);
    rerender(<TeamHole stations={stations} players={list} station="course" onStation={() => {}} orientation="v" picks={2} />);
    expect(container.querySelector('.is-pulse')).toBeNull();
  });

  it('is scale 1 to 1.7 over 2.4s, twice', () => {
    expect(css).toMatch(/\.holefx__ring\.is-pulse \{\s*animation:ch-htb-pulse 2400ms var\(--ch-ease\) 2;/);
    expect(css).toMatch(/@keyframes ch-htb-pulse \{\s*from \{\s*opacity:\.7;\s*transform:scale\(1\);\s*\}\s*to \{\s*opacity:0;\s*transform:scale\(1\.7\);/);
  });
});

describe('coins on the hole and the huddle', () => {
  it('wear the class year, and are hollow under 5 rounds', () => {
    const { container } = render(<TeamHole stations={stations} players={list} station="approach" onStation={() => {}} orientation="v" />);
    const coins = [...container.querySelectorAll('.scn:not(.is-more)')];
    expect(coins.length).toBeGreaterThan(0);
    for (const c of coins) expect(['sr', 'jr', 'so', 'fr']).toContain(c.getAttribute('data-year'));
    expect(list.filter((p) => p.early).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.scn.early').length).toBeGreaterThan(0);
    // No colour is written into the drawing: it comes from the year tokens.
    for (const c of container.querySelectorAll('.scn circle')) expect(c.getAttribute('fill')).toBeNull();
    expect(css).toMatch(/\.ch-htb \.scn\[data-year='sr'\],\s*\.ch-htb \.hudsvg \[data-year='sr'\] \{\s*--ch-coin:var\(--ch-yr-sr\);/);
  });

  it('the huddle draws a trail and names it in the legend only when the board carries a first-10 window', () => {
    const none = render(<Huddle data={PREVIEW_TEAM_BOARD} onPlayer={() => {}} />);
    expect(none.container.querySelector('.trail')).toBeNull();
    expect(none.container.textContent).not.toContain('first 10 rounds');
    none.unmount();
    const eli = list[0]!;
    const withTrail = { ...PREVIEW_TEAM_BOARD, players: { list: [{ ...eli, first10: { tee: -0.28, approach: -1.21, short_game: -0.3, putting: -0.62 } }, ...list.slice(1)], error: false } };
    const some = render(<Huddle data={withTrail} onPlayer={() => {}} />);
    expect(some.container.querySelectorAll('.trail')).toHaveLength(1);
    expect(some.container.querySelector(`[data-ch-team-trail="${eli.id}"]`)).not.toBeNull();
    expect(some.container.textContent).toContain('Line: from their first 10 rounds to now');
  });
});

describe('the team board’s styles come from the shared tokens', () => {
  it('has no private colour and wins no fight with !important', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
    expect(css).not.toContain('!important');
    expect(css).not.toContain('--ch-tb-');
  });
});
