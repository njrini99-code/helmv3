import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { sentenceCase } from '../data/coachhelm-map';
import { placeRefLabel } from '../screens/coachhelm/chat/Evidence';
import { CoachHelmSkeleton } from '../screens/coachhelm/CoachHelmSkeleton';
import { AskSkeleton } from '../screens/coachhelm/chat/AskSkeleton';
import { Head } from '../screens/coachhelm/parts';
import { DiveSkeleton, ProfileSkeleton, StandingSkeleton } from '../screens/coachhelm/views/Skeletons';
import { sentence, withoutDrill } from '../screens/coachhelm/views/DeepDive';

/** The CoachHelm premium pass (P013 findings D3, D6, D8, D12). */

afterEach(cleanup);

describe('P013 D3 the trend’s reference label never sits on the line', () => {
  const W = 650;
  // The audit's case: the last points run along the reference at the right.
  const flatAtRight = [
    { x: 38, y: 60 },
    { x: 188, y: 120 },
    { x: 338, y: 60 },
    { x: 488, y: 80 },
    { x: 640, y: 80 },
  ];

  it('goes above the dashed line at the right when that is clear', () => {
    expect(placeRefLabel([{ x: 38, y: 120 }, { x: 640, y: 120 }], 60, 70, W)).toEqual({ x: 640, y: 55, anchor: 'end' });
  });
  it('moves below, or to the left, when the line passes through the label’s box', () => {
    const at = placeRefLabel(flatAtRight, 84, 70, W);
    expect(at).not.toBeNull();
    // Whatever place it takes, no drawn point falls inside the text's box.
    const x0 = at!.anchor === 'end' ? at!.x - 70 : at!.x;
    for (const p of flatAtRight) if (p.x >= x0 && p.x <= x0 + 70) expect(p.y + 5 < at!.y - 11 || p.y - 5 > at!.y + 3).toBe(true);
  });
  it('gives up on an inline place (null: a key under the chart) when every place touches the line', () => {
    const zigzag = Array.from({ length: 30 }, (_, i) => ({ x: 38 + i * 21, y: i % 2 ? 40 : 100 }));
    expect(placeRefLabel(zigzag, 70, 70, W)).toBeNull();
  });
});

describe('P013 D6 the Deep dive says the drill once, in sentences', () => {
  const drill = 'Rehearse a downhill-only ladder: start 2 ft below the hole and add a foot at a time.';
  it('drops the write-up’s sentence that repeats the drill, and keeps the rest', () => {
    const why = 'Short putts carry the highest leverage. It looks like pace control. Rehearse a downhill-only ladder drill: start 2 ft below the hole.';
    expect(withoutDrill(why, drill)).toBe('Short putts carry the highest leverage. It looks like pace control.');
    expect(withoutDrill(why, null)).toBe(why);
    expect(withoutDrill('Rehearse a downhill-only ladder now.', drill)).toBeNull();
  });
  it('ends a generator’s line with a full stop, and leaves one that has its stop', () => {
    expect(sentence('the gap shows up inside 6 ft')).toBe('the gap shows up inside 6 ft.');
    expect(sentence('Already done.')).toBe('Already done.');
    expect(sentence('Is it?')).toBe('Is it?');
  });
});

describe('P013 D8 one h1 per screen', () => {
  it('on the phone the page’s large title is text (the top bar carries the h1), still labelling the page', () => {
    render(
      <Head who="Player" phone>
        Line
      </Head>,
    );
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.getElementById('ch-hl-title')!.textContent).toBe('CoachHelm');
    cleanup();
    render(<Head who="Player">Line</Head>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('CoachHelm');
  });
  it('every CoachHelm skeleton has exactly one h1', () => {
    for (const node of [<CoachHelmSkeleton key="c" view="coach" />, <CoachHelmSkeleton key="p" view="player" />, <ProfileSkeleton key="g" />, <StandingSkeleton key="s" />, <DiveSkeleton key="d" />, <AskSkeleton key="a" />]) {
      render(<LazyMotion features={domAnimation}>{node}</LazyMotion>);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      cleanup();
    }
  });
});

describe('P013 D12 a generator’s Title Case label in sentence case', () => {
  it('lowers the title-cased words and keeps acronyms and the Tour', () => {
    expect(sentenceCase('Penalties per Round')).toBe('Penalties per round');
    expect(sentenceCase('GIR vs Tour Average')).toBe('GIR vs Tour average');
    expect(sentenceCase('Downhill penalty vs level putts (distance-controlled)')).toBe('Downhill penalty vs level putts (distance-controlled)');
  });
});
