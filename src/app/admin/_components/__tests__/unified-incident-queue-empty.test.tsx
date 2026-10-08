import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedIncidentQueue } from '@/app/admin/_components/UnifiedIncidentQueue';

/**
 * The queue's EMPTY states, which are what the Incidents tab shows on a calm
 * day. The list this component gets is already narrowed by the page's lens
 * and filters, so what an empty list may claim is scoped by the page
 * (`allClearLabel`), and it may only claim anything at all when every source
 * could be read (`canClaimAllClear`).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/app/admin/actions/triage', () => ({ resolveTriageEvents: vi.fn() }));
vi.mock('@/app/admin/actions/sentry-resolve', () => ({ resolveSentryIssueAction: vi.fn() }));

const CHECKED_AT = '2026-10-06T12:00:00.000Z';

describe('UnifiedIncidentQueue empty state', () => {
  it('says what the page scoped it to, not a platform-wide claim', () => {
    render(
      <UnifiedIncidentQueue
        incidents={[]}
        eventIdsByIncident={{}}
        canClaimAllClear
        checkedAt={CHECKED_AT}
        allClearLabel="No incidents match this view in the last 72 hours"
      />,
    );
    expect(screen.getByText('No incidents match this view in the last 72 hours')).toBeInTheDocument();
    expect(screen.queryByText(/no unresolved incidents/)).not.toBeInTheDocument();
  });

  it('shrinks to one quiet row under a page-level all-clear banner', () => {
    const { container } = render(
      <UnifiedIncidentQueue
        incidents={[]}
        eventIdsByIncident={{}}
        canClaimAllClear
        checkedAt={CHECKED_AT}
        allClearLabel="Nothing needs action in the last 72 hours"
        quietAllClear
      />,
    );
    expect(screen.getByText('Nothing needs action in the last 72 hours')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="panel-all-clear"]')).toHaveAttribute('data-variant', 'inline');
  });

  it('keeps the full block when nothing above it already says all-clear', () => {
    const { container } = render(
      <UnifiedIncidentQueue incidents={[]} eventIdsByIncident={{}} canClaimAllClear checkedAt={CHECKED_AT} />,
    );
    expect(container.querySelector('[data-slot="panel-all-clear"]')).toHaveAttribute('data-variant', 'block');
  });

  it('blind source: an empty list is a partial count, never an all-clear, whatever label or quiet flag it gets', () => {
    const { container } = render(
      <UnifiedIncidentQueue
        incidents={[]}
        eventIdsByIncident={{}}
        canClaimAllClear={false}
        blindnessNote="Reliability coverage incomplete: SENTRY could not be read this refresh."
        checkedAt={CHECKED_AT}
        allClearLabel="Nothing needs action in the last 72 hours"
        quietAllClear
      />,
    );
    expect(screen.getByText('No incidents found in readable sources')).toBeInTheDocument();
    expect(screen.getByText(/SENTRY could not be read/)).toBeInTheDocument();
    expect(screen.queryByText('Nothing needs action in the last 72 hours')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="panel-all-clear"]')).toBeNull();
  });
});
