import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoundReviewSkeleton, RoundsSkeleton } from '../RoundsSkeleton';

/**
 * B9 (round-flow review, 2026-11-11; F-0060 for the library): the loading shapes are the loaded pages' shapes, in their
 * order. The phone review drew five figures where the page has its scorecard card, and the library's first card was a
 * pale block where the page has the green round card.
 */
describe('Rounds skeletons mirror the loaded pages (B9)', () => {
  it('the library’s phone card is the green feature card, and the head draws no New round', () => {
    const { container } = render(<RoundsSkeleton />);
    const card = container.querySelector('.ch-rd-sk-phone .ch-rd-sk-hero > .ch-skel');
    expect(card?.classList.contains('ch-skel--feature')).toBe(true);
    // At rest the page's head has no button (the idle card carries New round): the eyebrow and the title on the phone, their one
    // block on a desk.
    expect(container.querySelectorAll('.ch-rd-sk-phone .ch-rd-sk-h > *').length).toBe(2);
    expect(container.querySelectorAll('.ch-rd-sk-desk > .ch-rd-h > *').length).toBe(1);
  });

  it.each(['.ch-rv-sk-phone', '.ch-rv-sk-desk'])('%s: the scorecard card, with its actions under it, comes before the figures', (root) => {
    const { container } = render(<RoundReviewSkeleton />);
    const blocks = [...container.querySelectorAll(`${root} > *`)];
    const card = blocks.findIndex((b) => b.classList.contains('ch-rv-sk-card'));
    const figs = blocks.findIndex((b) => b.classList.contains('ch-rv-sk-figs') || b.classList.contains('ch-rv-sk-figsd'));
    expect(card).toBeGreaterThan(0);
    expect(figs).toBeGreaterThan(card);
    // The card itself, then what stands under it (Share card; Share card and Print on a desk).
    const inCard = container.querySelector(`${root} > .ch-rv-sk-card`)!.children;
    expect(inCard.length).toBe(2);
    expect(inCard[0]!.classList.contains('ch-skel')).toBe(true);
  });
});
