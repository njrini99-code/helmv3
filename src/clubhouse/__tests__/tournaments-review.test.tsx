import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { Review } from '../screens/tournaments/Review';
import type { ChTourLoad, ChTourReviewData } from '../screens/tournaments/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

afterEach(cleanup);

/**
 * An event’s review (P016, board `Review`), as its own page and as the desk’s Review tab (`embedded`). Catalog: CH-16201
 * and CH-16401 (the page states), CH-16235 (the review didn’t load), CH-16335 (the review opens when every round is
 * final), CH-16336 (nothing to review yet), CH-16337 (no notes or reflections yet). The words come from the preview
 * fixture’s Oakmont review: three layers, three notes, and Sofia and Eli without a reflection.
 */
const fixture = tourFixture('ready');
const data = fixture.review;

const draw = (d: ChTourReviewData, opts: { phone?: boolean; load?: ChTourLoad; embedded?: boolean } = {}) =>
  render(<Review data={d} load={opts.load ?? 'ready'} phone={opts.phone ?? false} embedded={opts.embedded} />).container;
const plain = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Review', () => {
  it('opens with the event, then the layers: an observation, its evidence, a possible reason', () => {
    const c = draw(data);
    expect(c.querySelector('[data-ch-tour-view="review"] h1')?.textContent).toBe('Review');
    expect(within(c as HTMLElement).getByRole('link', { name: 'Oakmont Fall Classic' })).toHaveAttribute('href', '/golf/dashboard/tournaments/e33');
    const layers = c.querySelectorAll('.ch-tour-rev-layer');
    expect(layers).toHaveLength(3);
    const first = layers[0] as HTMLElement;
    expect(Array.from(first.querySelectorAll('dt')).map((x) => x.textContent)).toEqual(['Observation', 'Evidence', 'Possible reason']);
    expect(plain(first.querySelectorAll('dd')[0])).toBe('Jonah’s 69 in the final round was the team’s best score of the event and counted, after two rounds that did not.');
    expect(plain(first.querySelectorAll('dd')[1])).toBe('R1 75 and R2 76, both dropped · R3 69 counted · 2 of 3 rounds with shot data');
    expect(plain(first.querySelectorAll('dd')[2])).toContain('Worth asking what changed in his strategy before assuming it will repeat.');
    expect(plain(layers[1])).toContain('penalty strokes across 15 team rounds');
    expect(plain(layers[2])).toContain('Unknown. Ask Sofia for her reflection before drawing a conclusion.');
    // Said as only possible: the reason is labelled, and the review draws no key to press (its writes have no action yet).
    expect(c.querySelectorAll('.ch-btn')).toHaveLength(0);
  });

  it('lists the notes and reflections by who wrote them, and who has not reflected yet', () => {
    const c = draw(data);
    const notes = Array.from(c.querySelectorAll('.ch-tour-rev-note')).map((n) => [n.querySelector('.ch-tour-rev-note__n')?.textContent, n.querySelector('.ch-tour-rev-note__k')?.textContent, n.querySelector('p')?.textContent]);
    expect(notes).toEqual([
      ['Maya Reyes', 'Coach note', 'Course played firm. We under-clubbed into 13 all week.'],
      ['Jonah Okafor', 'Player reflection', 'Stopped aiming at flags on the par 3s on day two. Felt calmer.'],
      ['Theo Marchetti', 'Player reflection', 'Putter felt good. Left a few short on fast greens in R2.'],
    ]);
    expect(plain(c.querySelector('.ch-tour-rev-missing'))).toBe('Sofia and Eli haven’t added reflections.');
    expect(plain(c.querySelector('#ch-tour-rev-notes-t')?.parentElement)).toContain('Private to coaches until you share');
  });

  it('says it right for one missing reflection', () => {
    const one = { ...data, review: { ...data.review!, missingReflections: ['sofia'] } };
    expect(plain(draw(one).querySelector('.ch-tour-rev-missing'))).toBe('Sofia hasn’t added a reflection.');
  });

  it('draws on the phone without portraits, the rows stacked', () => {
    const c = draw(data, { phone: true });
    expect(c.querySelector('.ch-tour')).toHaveClass('is-phone');
    expect(c.querySelector('.ch-avatar')).toBeNull();
    expect(c.querySelectorAll('.ch-tour-rev-layer')).toHaveLength(3);
  });

  it('is the desk’s tab when embedded: no page, no head, the same sections', () => {
    const c = draw(data, { embedded: true });
    expect(c.querySelector('main')).toBeNull();
    expect(c.querySelector('h1')).toBeNull();
    expect(c.querySelector('[data-ch-tour-view="review"]')).not.toBeNull();
    expect(c.querySelectorAll('.ch-tour-rev-layer')).toHaveLength(3);
  });
});

describe.each([
  ['desktop', false],
  ['phone', true],
] as const)('Review states, %s', (_, phone) => {
  it('draws the loading state busy (CH-16401), as a page and as a tab', () => {
    const page = draw(data, { load: 'loading', phone }).querySelector('[data-ch-tour-view="review"]');
    expect(page).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(page).toHaveAttribute('aria-busy', 'true');
    cleanup();
    const tab = draw(data, { load: 'loading', phone, embedded: true }).querySelector('[data-ch-code="CH-16401"]');
    expect(tab).toHaveAttribute('aria-busy', 'true');
  });

  it('draws the page failure (CH-16201), as a page and as a tab', () => {
    const page = draw(data, { load: 'failed', phone });
    expect(page.querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
    expect(page.querySelector('h1')?.textContent).toBe('Review');
    cleanup();
    expect(draw(data, { load: 'failed', phone, embedded: true }).querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
  });

  it('names a failed review read and offers Try again, never an empty review (CH-16235)', () => {
    const c = draw(tourFixture('partial').review, { phone });
    const notice = c.querySelector('[data-ch-code="CH-16235"]') as HTMLElement;
    expect(notice).toHaveAttribute('role', 'alert');
    expect(plain(notice)).toContain('The review didn’t load');
    expect(within(notice).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(c.querySelector('[data-ch-code="CH-16336"]')).toBeNull();
    expect(c.querySelector('.ch-tour-rev-layer')).toBeNull();
  });

  it('says the review waits for every round to be final (CH-16335)', () => {
    const c = draw({ ...data, review: { ...data.review!, open: false } }, { phone });
    expect(plain(c.querySelector('[data-ch-code="CH-16335"]'))).toContain('The review opens when every round is final');
    expect(c.querySelector('.ch-tour-rev-layer')).toBeNull();
  });

  it('says there is nothing to review for an event with no review (CH-16336)', () => {
    const c = draw({ ...data, review: null }, { phone });
    expect(plain(c.querySelector('[data-ch-code="CH-16336"]'))).toContain('Nothing to review yet');
  });

  it('says there are no notes yet but keeps the layers (CH-16337)', () => {
    const c = draw({ ...data, review: { ...data.review!, notes: [], missingReflections: [] } }, { phone });
    expect(plain(c.querySelector('[data-ch-code="CH-16337"]'))).toContain('No notes or reflections yet');
    expect(c.querySelectorAll('.ch-tour-rev-layer')).toHaveLength(3);
    expect(c.querySelector('.ch-tour-rev-missing')).toBeNull();
  });

  it('writes no exclamation mark and no straight apostrophe', () => {
    for (const d of [data, tourFixture('partial').review, { ...data, review: null }]) {
      for (const embedded of [false, true]) {
        expect(plain(draw(d, { phone, embedded }))).not.toMatch(/[!']/);
        cleanup();
      }
    }
  });
});
