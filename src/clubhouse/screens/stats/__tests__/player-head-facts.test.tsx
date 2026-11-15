import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn() }));

import { PREVIEW_PLAYER_SHS } from '../../../preview/fixtures-stats-redesign';
import { asDesktop, asPhone, painted, resetAddress, showPlayer } from './_shs-harness';

/**
 * A coach's phone head for a player: class year, rounds this season, handicap. On a 390pt phone "Sophomore · 21 rounds this
 * season · 3.9 HCP" is wider than the 254pt beside the avatar; it broke inside a fact and began the second line with the dot.
 */
beforeEach(() => {
  asPhone();
  resetAddress();
});
afterEach(() => {
  cleanup();
  asDesktop();
});

describe('a player’s head on a coach’s phone', () => {
  it('reads as one line of facts, each named with its window', async () => {
    showPlayer(PREVIEW_PLAYER_SHS);
    await painted('sg');
    expect(document.querySelector('.ch-spm-head p')!.textContent).toBe('Sophomore · 21 rounds this season · 3.9 HCP');
  });

  it('each fact is one item that opens with its own separator, so a wrap falls between facts', async () => {
    showPlayer(PREVIEW_PLAYER_SHS);
    await painted('sg');
    const facts = [...document.querySelectorAll('.ch-spm-head p.ch-spm-facts > span')];
    expect(facts.map((f) => f.textContent)).toEqual(['Sophomore', '· 21 rounds this season', '· 3.9 HCP']);
    // The separator is its own slot inside the fact; the first fact has none.
    expect(facts.map((f) => f.querySelector('i')?.textContent ?? null)).toEqual([null, '· ', '· ']);
  });

  it('a fact never breaks, and the separator that would start a line is clipped away', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/stats.css'), 'utf8');
    const rule = (sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
    expect(rule('  .ch-spm-head p > span')).toContain('white-space: nowrap');
    const facts = rule('  .ch-spm-head .ch-spm-facts');
    expect(facts).toContain('margin-left: calc(-1 * var(--ch-spm-sep))');
    expect(facts).toContain('clip-path: inset(0 0 0 var(--ch-spm-sep))');
    expect(rule('  .ch-spm-head .ch-spm-facts > span')).toContain('padding-left: var(--ch-spm-sep)');
    expect(rule('  .ch-spm-facts > span > i')).toContain('margin-left: calc(-1 * var(--ch-spm-sep))');
  });
});
