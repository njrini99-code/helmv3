// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayQualifiers — the field-sheet composition
 * (docs/design/fairway-facelift/screens/qualifiers.v3.md)
 * ----------------------------------------------------------------------------
 * Replaces the v2 assertions, which pinned the composition this pass deletes:
 * an Elevated hero above a Toolbar, and one bordered Surface holding two
 * seam-lists. Those cases could only pass by keeping the layout the owner
 * rejected, so they are rewritten rather than adapted.
 *
 * What is pinned now:
 *   1. the page anatomy, in DOM order: verdict, ONE Surface stage, the ledger,
 *      the table.
 *   2. exactly one Surface above the table — the stage. No card deck.
 *   3. the stage draws one bar row per qualifier and is NOT narrowed by the
 *      table's search box.
 *   4. an entry deadline is never invented: the verdict says nothing about
 *      entries when the column is null.
 *   5. a null spot count is not summed as zero, and the readout says how many
 *      rows it could not count.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { GolfQualifier } from '@/lib/types/golf';
import { FairwayQualifiers } from '../FairwayQualifiers';

const TODAY = '2026-09-10';
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
  name: 'QA Round Type Verification',
  start_date: '2026-08-31',
  end_date: '2026-09-14',
  status: 'in_progress',
});
const upcoming = makeQualifier({
  id: 'q-upcoming',
  name: 'Fall Selection Qualifier',
  start_date: '2026-09-24',
  entry_deadline: '2026-09-13',
  status: 'upcoming',
});
const completed = makeQualifier({
  id: 'q-completed',
  name: 'Pre-Season Qualifier',
  start_date: '2026-08-07',
  end_date: '2026-08-09',
  status: 'completed',
});

const renderPage = (qualifiers: GolfQualifier[], isCoach = true) =>
  render(<FairwayQualifiers isCoach={isCoach} qualifiers={qualifiers} today={TODAY} />);

describe('FairwayQualifiers, the field sheet', () => {
  it('renders the verdict, one Surface stage, the ledger and the table in that DOM order', () => {
    const { container } = renderPage([live, upcoming, completed]);

    const verdict = container.querySelector('[data-slot="verdict"]');
    const stage = screen.getByRole('table', { name: 'Qualifying field' });
    const ledger = screen.getByText('Needs a decision');
    const table = container.querySelector('[data-slot="qualifiers-ledger"]');

    expect(verdict).not.toBeNull();
    expect(table).not.toBeNull();

    const order = [verdict!, stage, ledger, table!];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('puts exactly one Surface on the page, and it is the stage', () => {
    const { container } = renderPage([live, upcoming, completed]);
    const surfaces = container.querySelectorAll('[data-slot="surface"]');
    expect(surfaces).toHaveLength(1);
    expect(within(surfaces[0] as HTMLElement).getByRole('table', { name: 'Qualifying field' })).toBeInTheDocument();
  });

  it('draws one stage row per qualifier and keeps them when the table is searched', () => {
    renderPage([live, upcoming, completed]);
    const stage = screen.getByRole('table', { name: 'Qualifying field' });

    expect(within(stage).getByRole('rowheader', { name: /QA Round Type Verification/ })).toBeInTheDocument();
    expect(within(stage).getByRole('rowheader', { name: /Fall Selection Qualifier/ })).toBeInTheDocument();

    // The search box narrows the table only. If it narrowed the stage too, an
    // instrument could empty itself out from under the reader.
    fireEvent.change(screen.getByLabelText('Search qualifiers'), { target: { value: 'Pre-Season' } });
    expect(within(stage).getByRole('rowheader', { name: /Fall Selection Qualifier/ })).toBeInTheDocument();

    const table = document.querySelector('[data-slot="qualifiers-ledger"]') as HTMLElement;
    expect(within(table).getByRole('link', { name: 'Pre-Season Qualifier' })).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'Fall Selection Qualifier' })).not.toBeInTheDocument();
  });

  it('states the entry deadline when one exists and says nothing about entries when it does not', () => {
    const { container: withDeadline } = renderPage([upcoming]);
    expect(withDeadline.querySelector('[data-slot="verdict"]')!.textContent).toMatch(/Entries close .*3 days away/);

    const noDeadline = makeQualifier({
      id: 'q-none',
      name: 'Deadline-free Qualifier',
      start_date: '2026-09-24',
      status: 'upcoming',
    });
    const { container: without } = renderPage([noDeadline]);
    expect(without.querySelector('[data-slot="verdict"]')!.textContent).not.toMatch(/Entries close/);
    expect(without.querySelector('[data-slot="verdict"]')!.textContent).toMatch(/The lineup is open/);
  });

  it('never sums a missing spot count as zero, and says how many it left out', () => {
    const unknownSpots = makeQualifier({
      id: 'q-unknown',
      name: 'Unmetered Qualifier',
      start_date: '2026-09-20',
      status: 'upcoming',
      spots_available: null,
    });
    renderPage([upcoming, unknownSpots]);

    // upcoming carries 5; the null row contributes nothing and is disclosed.
    const openSpots = screen.getByText('Open spots').closest('div') as HTMLElement;
    expect(within(openSpots).getByText('5')).toBeInTheDocument();
    expect(within(openSpots).getByText(/excludes 1 with no spot count set/)).toBeInTheDocument();
  });

  it('gives a phone the same rows as a list instead of a table it has to scroll sideways', () => {
    renderPage([live, upcoming, completed]);

    // Both branches are always in the DOM; CSS picks one. The list is what a
    // 390px screen gets, so it must carry the full name rather than the
    // truncated one the table shows.
    const compact = document.querySelector('[data-slot="qualifiers-ledger-compact"]') as HTMLElement;
    expect(compact).not.toBeNull();
    expect(within(compact).getAllByRole('listitem')).toHaveLength(3);
    expect(within(compact).getByRole('link', { name: /Fall Selection Qualifier/ })).toHaveAttribute(
      'href',
      detailHref(upcoming.id),
    );
  });

  it('keeps the plain empty state when the team has no qualifiers at all', () => {
    renderPage([]);
    expect(screen.getByText('No qualifiers yet')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Qualifying field' })).not.toBeInTheDocument();
  });

  it('sends a player to the detail page rather than through the coach-only workspace redirect', () => {
    renderPage([upcoming], false);
    const decisionRow = screen.getAllByRole('link', { name: 'Fall Selection Qualifier' });
    expect(decisionRow.some((a) => a.getAttribute('href') === detailHref(upcoming.id))).toBe(true);
    expect(decisionRow.every((a) => !a.getAttribute('href')?.includes('/coachhelm/qualifying/'))).toBe(true);
  });
});
