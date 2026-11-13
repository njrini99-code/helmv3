// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import { Pipeline } from '../Pipeline';

afterEach(cleanup);

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/recruiting.css'), 'utf8');

/**
 * W41 (12 Nov): "Committed 0" was the only filled dark coin on the pipeline, so the stage with nobody in it was the
 * loudest of the four. A stage's tone is earned by the people in it: a stage at 0 draws the quiet coin.
 */
describe('Recruiting pipeline · an empty stage is quiet', () => {
  const draw = (counts: { watched: number; recruiting: number; offered: number; committed: number }) =>
    render(<Pipeline counts={counts} total={counts.watched + counts.recruiting + counts.offered + counts.committed} stage={null} onPick={() => {}} />).container;
  const stage = (c: Element, s: string) => c.querySelector(`.ch-rec-pipe__stage.is-${s}`)!;

  it('marks a stage at 0 as zero, and a stage with people as not', () => {
    const c = draw({ watched: 3, recruiting: 3, offered: 2, committed: 0 });
    expect(stage(c, 'committed').classList.contains('is-zero')).toBe(true);
    for (const s of ['watched', 'recruiting', 'offered']) expect(stage(c, s).classList.contains('is-zero')).toBe(false);
  });

  it('a committed stage with people keeps its filled coin', () => {
    const c = draw({ watched: 3, recruiting: 3, offered: 1, committed: 1 });
    expect(stage(c, 'committed').classList.contains('is-zero')).toBe(false);
  });

  it('the zero coin is the quiet one, after every stage fill and the night ones, so it wins whatever the stage', () => {
    const at = css.lastIndexOf('.ch-rec-pipe__stage.is-zero > .ch-rec-pipe__dot');
    expect(at).toBeGreaterThan(css.lastIndexOf('.ch-rec-pipe__stage.is-committed > .ch-rec-pipe__dot {'));
    expect(at).toBeGreaterThan(css.lastIndexOf(".ch-rec-pipe__stage.is-offered > .ch-rec-pipe__dot"));
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toContain('background: var(--ch-ivory-25)');
    expect(rule).toContain('--ch-rec-ring: var(--ch-ivory-400)');
  });
});
