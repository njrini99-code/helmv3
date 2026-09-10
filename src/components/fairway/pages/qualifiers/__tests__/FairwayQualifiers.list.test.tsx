// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayQualifiers — list composition (docs/design/fairway-facelift/screens
 * /qualifiers.md)
 * ----------------------------------------------------------------------------
 * No existing test asserted this component's DOM composition before the
 * facelift — the only pre-existing test that touches this file
 * (`qualifier-date-format.test.ts`) exercises just the pure `formatDate`
 * export, never renders the component. So nothing here is an update to a
 * prior assertion; this file is new, added so a later change can't silently
 * reintroduce the removed per-qualifier card galleries.
 *
 * Covers:
 *   1. the live/next qualifier renders exactly once, as the Elevated hero,
 *      ABOVE the Toolbar (never duplicated into the row list below it).
 *   2. the Active + Concluded qualifiers render as rows inside ONE seamed
 *      Surface, not a grid of per-qualifier cards.
 *   3. a status filter that leaves only the hero behind renders NEITHER the
 *      seam Surface NOR a bare section heading over an empty body.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GolfQualifier } from '@/lib/types/golf';
import { FairwayQualifiers } from '../FairwayQualifiers';

const detailHref = (id: string) => `/golf/dashboard/qualifiers/${id}`;

function makeQualifier(
  overrides: Partial<GolfQualifier> & Pick<GolfQualifier, 'id' | 'name' | 'start_date' | 'status'>,
): GolfQualifier {
  return {
    course_id: null,
    course_name: 'Demo University Home Course',
    created_at: null,
    created_by: null,
    description: null,
    end_date: null,
    entry_deadline: null,
    num_rounds: 1,
    rules: null,
    selection_slots_coach_pick: 0,
    selection_slots_total: 5,
    selection_state: 'open',
    spots_available: 5,
    target_tournament_id: null,
    team_id: 'team-1',
    updated_at: null,
    ...overrides,
  } as GolfQualifier;
}

const live = makeQualifier({
  id: 'q-live',
  name: 'QA — Round Type Verification',
  start_date: '2026-08-31',
  status: 'in_progress',
});
const upcoming = makeQualifier({
  id: 'q-upcoming',
  name: 'Momentic Hell 20260824',
  start_date: '2026-09-24',
  status: 'upcoming',
});
const completed = makeQualifier({
  id: 'q-completed',
  name: 'Pre-Season Qualifier',
  start_date: '2026-08-07',
  status: 'completed',
});

describe('FairwayQualifiers — hero (Elevated, above the Toolbar, never duplicated)', () => {
  it('renders the live qualifier exactly once, elevated, above the Toolbar', () => {
    const { container } = render(<FairwayQualifiers isCoach qualifiers={[live, upcoming, completed]} />);

    const heroLinks = container.querySelectorAll(`a[href="${detailHref(live.id)}"]`);
    expect(heroLinks).toHaveLength(1);

    const heroEl = heroLinks[0]!.closest('[data-slot="qualifier-hero"]');
    expect(heroEl).not.toBeNull();

    const toolbar = screen.getByRole('toolbar');
    const heroPrecedesToolbar = heroEl!.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(heroPrecedesToolbar).toBeTruthy();
  });
});

describe('FairwayQualifiers — Active/Concluded (one seamed Surface, not cards)', () => {
  it('renders the non-hero rows inside exactly ONE surface, under Active/Concluded seam headings', () => {
    const { container } = render(<FairwayQualifiers isCoach qualifiers={[live, upcoming, completed]} />);

    const surfaces = container.querySelectorAll('[data-slot="surface"]');
    expect(surfaces).toHaveLength(1);
    const surface = surfaces[0]!;

    expect(surface.querySelectorAll('h3').length).toBeGreaterThanOrEqual(2);
    expect(surface.textContent).toContain('Active');
    expect(surface.textContent).toContain('Concluded');

    // One row (one anchor) per non-hero qualifier — no nested card markup.
    expect(surface.querySelectorAll(`a[href="${detailHref(upcoming.id)}"]`)).toHaveLength(1);
    expect(surface.querySelectorAll(`a[href="${detailHref(completed.id)}"]`)).toHaveLength(1);

    // The hero's own qualifier never appears a second time in the seam list.
    expect(surface.querySelectorAll(`a[href="${detailHref(live.id)}"]`)).toHaveLength(0);
  });
});

describe('FairwayQualifiers — no bare heading over an empty body', () => {
  it('renders neither the seam Surface nor a stray heading when a status filter leaves only the hero', () => {
    // `live` is the only qualifier the "Active" filter can match; `completed`
    // is excluded by the filter itself (not by search). Regression: this used
    // to still render an empty bordered Surface with a lone "Concluded"
    // heading over nothing.
    const { container } = render(<FairwayQualifiers isCoach qualifiers={[live, completed]} />);

    fireEvent.click(screen.getByRole('button', { name: /^Active/ }));

    // The hero is still shown (it ignores the Toolbar's own filter state).
    expect(container.querySelectorAll(`a[href="${detailHref(live.id)}"]`)).toHaveLength(1);
    // Nothing else matches — no seam Surface, no bare section heading.
    expect(container.querySelectorAll('[data-slot="surface"]')).toHaveLength(0);
    expect(container.querySelectorAll('h3')).toHaveLength(0);
  });
});
