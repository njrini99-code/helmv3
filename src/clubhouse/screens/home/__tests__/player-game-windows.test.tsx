import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import type { ChScoringPoint } from '../../../data/player-home';
import { PREVIEW_PLAYER_HOME } from '../../../preview/fixtures-player-home';
import { ToastProvider } from '../../../ui/Toast';
import { PlayerGame } from '../PlayerGame';

afterEach(cleanup);

const point = (i: number, score: number): ChScoringPoint => ({ id: `r${i}`, label: `R${i}`, score, par: 72 });
const show = (phone: boolean, points?: ChScoringPoint[]) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <PlayerGame phone={phone} data={{ ...PREVIEW_PLAYER_HOME, ...(points ? { scoring: { points, error: false } } : {}) }} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
const sub = (label: string) => screen.getByText(label).closest('div')!.textContent!;

// Prod audit 2026-11-15, PL-HOME-01, PL-HOME-02, PL-HOME-03: strokes gained is the last ten rounds (figure-window.ts, QA-1), never
// "this season", and every figure on the Scoring card names its own window.
describe('Your game names each figure’s window', () => {
  it('PL-HOME-01 strokes gained says Last 10, nowhere "this season"', () => {
    show(false);
    expect(sub('Strokes gained')).toMatch(/Last 10, per round/);
    expect(document.body.textContent).not.toMatch(/this season/i);
    expect(document.body.textContent).not.toMatch(/Season, per round/);
    const sr = [...document.querySelectorAll('.ch-ph-leg__sg .ch-sr-only')].map((n) => n.textContent);
    for (const t of sr) expect(t).toBe(' strokes gained a round, last 10 rounds');
  });

  it('PL-HOME-03 the phone’s Your game meta names the window, as the desktop caption does', () => {
    show(true);
    expect(document.querySelector('.ch-ph-legs-sec .ch-hm-meta')!.textContent).toMatch(/^Last 10 rounds · strokes gained /);
    cleanup();
    show(false);
    expect(document.querySelector('.ch-ph-legs-sec .ch-ph-game__h span')!.textContent).toMatch(/^Last 10 rounds · strokes gained /);
  });

  it('PL-HOME-02 the average and under par say their window, with a change and without one', () => {
    const ten = [80, 81, 79, 80, 82, 80, 79, 81, 80, 80].map((s, i) => point(i, s));
    const better = [71, 72, 70, 71, 72, 71, 70, 72, 71, 71].map((s, i) => point(10 + i, s));
    show(false, [...ten, ...better]);
    expect(sub('Scoring avg')).toMatch(/Last 10 · −\d+\.\d · Better than previous 10/);
    expect(sub('Under par')).toMatch(/In last 10$/);
    expect(sub('Handicap')).toMatch(/Index$/);
  });

  // The presentation gate (cramped-text, home-player at 390): "Last 10 · −0.9 · Better than previous 10" ran to three lines in the
  // phone card's half-width cell. The card's own picker says Last 10, so the caption says only the change, as coach Home's does.
  it('on the phone the picker names the average’s window and its caption carries only the change', () => {
    const ten = [80, 81, 79, 80, 82, 80, 79, 81, 80, 80].map((s, i) => point(i, s));
    const better = [71, 72, 70, 71, 72, 71, 70, 72, 71, 71].map((s, i) => point(10 + i, s));
    show(true, [...ten, ...better]);
    const picker = screen.getByRole('radiogroup', { name: 'Rounds shown' });
    expect(picker.querySelector('[aria-checked="true"]')!.textContent).toBe('Last 10');
    expect(sub('Scoring avg')).toMatch(/−\d+\.\d · Better than previous 10$/);
    expect(sub('Scoring avg')).not.toMatch(/Last/);
  });
});
