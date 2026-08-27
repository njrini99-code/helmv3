// =============================================================================
// /admin/errors/[fingerprint] — resolution lifecycle surfacing
//
// This page's data-fetching body (`Body`) is an async Server Component
// embedded via `<Suspense>`. React 19 only supports async components on the
// server, so a plain client render in this repo's Vitest/jsdom setup can
// never resolve it — it suspends on the skeleton forever (verified directly:
// React logs "Only Server Components can be async at the moment" and the
// fallback never swaps in). A full-page render test here would therefore
// only ever prove the shell mounted, never that the resolution logic below
// produced anything — see the sibling `admin/baseball/__tests__/page.test.tsx`
// for a real example of that trap (it passes vacuously, asserting only
// `.not.toBeInTheDocument()`, which is trivially true against a stuck
// skeleton too).
//
// So this suite tests the exact new logic directly instead: the pure
// `resolveArchivedResolution` selector, and the two presentational
// components it feeds (`ResolutionSummary`, `RegressionBanner`), both plain
// synchronous components with no Suspense involved.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ArchivedResolution, ResolutionArchiveSnapshot } from '@/lib/admin/data/resolutions';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import { resolveArchivedResolution, ResolutionSummary, RegressionBanner } from '../../_components/ResolutionPanels';

function archivedResolution(overrides: Partial<ArchivedResolution> = {}): ArchivedResolution {
  return {
    fingerprint: 'fp-1',
    resolvedAt: '2026-08-21T09:00:00.000Z',
    resolvedBy: null,
    resolutionSource: 'auto',
    prNumber: null,
    prUrl: null,
    fixedInSha: null,
    note: null,
    lastSeenAtResolution: null,
    reopenedAt: null,
    reopenedCount: 0,
    createdAt: '2026-08-21T09:00:00.000Z',
    updatedAt: '2026-08-21T09:00:00.000Z',
    shipStatus: 'unknown',
    regressed: false,
    ...overrides,
  };
}

function archiveOk(resolutions: ArchivedResolution[]): AdminFetchResult<ResolutionArchiveSnapshot> {
  return {
    status: 'ok',
    data: { resolutions, evaluated: resolutions.length, confirmedTotal: resolutions.length },
    fetchedAt: '2026-08-27T00:00:00.000Z',
  };
}

describe('resolveArchivedResolution', () => {
  it('skips honestly (no failure) when the caller chose not to read at all', () => {
    expect(resolveArchivedResolution('fp-1', null)).toEqual({
      resolution: null,
      resolutionReadFailed: false,
    });
  });

  it('finds the matching row by fingerprint out of the whole archive', () => {
    const target = archivedResolution({ fingerprint: 'fp-1' });
    const archive = archiveOk([archivedResolution({ fingerprint: 'fp-other' }), target]);

    expect(resolveArchivedResolution('fp-1', archive)).toEqual({
      resolution: target,
      resolutionReadFailed: false,
    });
  });

  it('returns null, not a failure, for a fingerprint that was simply never resolved', () => {
    const archive = archiveOk([archivedResolution({ fingerprint: 'fp-other' })]);

    expect(resolveArchivedResolution('fp-1', archive)).toEqual({
      resolution: null,
      resolutionReadFailed: false,
    });
  });

  it('reports a FAILED read as a failure, never as "never resolved" — no error→null collapse', () => {
    const failed: AdminFetchResult<ResolutionArchiveSnapshot> = {
      status: 'error',
      data: null,
      fetchedAt: null,
      error: 'network blip',
    };

    expect(resolveArchivedResolution('fp-1', failed)).toEqual({
      resolution: null,
      resolutionReadFailed: true,
    });
  });
});

describe('ResolutionSummary', () => {
  it('renders source, resolved-at, ship status, PR link and fixed-in sha', () => {
    render(
      <ResolutionSummary
        resolution={archivedResolution({
          resolutionSource: 'manual',
          prNumber: 42,
          prUrl: 'https://github.com/helm/helmv3/pull/42',
          fixedInSha: 'abc1234',
          shipStatus: 'shipped',
        })}
      />,
    );

    expect(screen.getByText('Resolution')).toBeInTheDocument();
    expect(screen.getByText('resolved by a human')).toBeInTheDocument();
    expect(screen.getByText('shipped to production')).toBeInTheDocument();
    const prLink = screen.getByRole('link', { name: 'PR #42' });
    expect(prLink).toHaveAttribute('href', 'https://github.com/helm/helmv3/pull/42');
    expect(screen.getByText('abc1234')).toBeInTheDocument();
  });

  it('distinguishes auto-resolved (cron) from a human resolution', () => {
    render(<ResolutionSummary resolution={archivedResolution({ resolutionSource: 'auto' })} />);
    expect(screen.getByText('auto-resolved (cron)')).toBeInTheDocument();
  });

  it('never collapses an unknown ship status into pending or shipped', () => {
    render(<ResolutionSummary resolution={archivedResolution({ shipStatus: 'unknown' })} />);

    expect(screen.getByText('ship status unknown')).toBeInTheDocument();
    expect(screen.queryByText('fix not yet shipped')).not.toBeInTheDocument();
    expect(screen.queryByText('shipped to production')).not.toBeInTheDocument();
  });

  it('renders a pending ship status distinctly from shipped/unknown', () => {
    render(<ResolutionSummary resolution={archivedResolution({ shipStatus: 'pending' })} />);
    expect(screen.getByText('fix not yet shipped')).toBeInTheDocument();
  });

  it('shows "no PR linked" honestly rather than inventing one', () => {
    render(<ResolutionSummary resolution={archivedResolution({ prNumber: null, prUrl: null })} />);
    expect(screen.getByText('no PR linked')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a PR number as plain text (not a link) when no URL is recorded', () => {
    render(<ResolutionSummary resolution={archivedResolution({ prNumber: 7, prUrl: null })} />);
    expect(screen.getByText('PR #7')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the note when present', () => {
    render(<ResolutionSummary resolution={archivedResolution({ note: 'fixed by the retry-backoff change' })} />);
    expect(screen.getByText('fixed by the retry-backoff change')).toBeInTheDocument();
  });
});

describe('RegressionBanner', () => {
  it('is unmistakable: names the regression and shows the reopen count', () => {
    render(
      <RegressionBanner
        resolution={archivedResolution({
          reopenedAt: '2026-08-25T00:00:00.000Z',
          reopenedCount: 2,
          resolutionSource: 'auto',
          regressed: true,
        })}
      />,
    );

    expect(screen.getByText('Regressed')).toBeInTheDocument();
    expect(screen.getByText(/marked fixed and came back/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/auto-resolved \(cron\)/i)).toBeInTheDocument();
  });

  it('singularizes the reopen count copy for a single recurrence', () => {
    const { container } = render(
      <RegressionBanner resolution={archivedResolution({ reopenedCount: 1, regressed: true })} />,
    );
    // The count renders in its own <span>, with "time(s)" as a sibling text
    // node — assert on the rendered text as a whole rather than one node.
    expect(container.textContent).toContain('Reopened 1 time.');
    expect(container.textContent).not.toContain('Reopened 1 times');
  });
});
