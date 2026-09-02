import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArchivePanel } from '@/app/admin/errors/_components/ArchivePanel';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { ArchivedResolution, ResolutionArchiveSnapshot } from '@/lib/admin/data/resolutions';

function resolution(overrides: Partial<ArchivedResolution> = {}): ArchivedResolution {
  return {
    fingerprint: 'fp-abc123',
    resolvedAt: '2026-08-20T00:00:00.000Z',
    resolvedBy: 'user-1',
    resolutionSource: 'manual',
    prNumber: 42,
    prUrl: 'https://github.com/org/repo/pull/42',
    fixedInSha: 'abcdef1',
    note: null,
    lastSeenAtResolution: '2026-08-19T00:00:00.000Z',
    reopenedAt: null,
    reopenedCount: 0,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    shipStatus: 'shipped',
    regressed: false,
    ...overrides,
  };
}

function okResult(snapshot: Partial<ResolutionArchiveSnapshot> = {}): AdminFetchResult<ResolutionArchiveSnapshot> {
  return {
    status: 'ok',
    fetchedAt: '2026-08-27T00:00:00.000Z',
    data: {
      resolutions: [],
      evaluated: 0,
      confirmedTotal: 0,
      ...snapshot,
    },
  };
}

describe('ArchivePanel', () => {
  it('renders an honest error state, not an empty archive, when the fetch failed', () => {
    render(
      <ArchivePanel
        result={{ status: 'error', data: null, fetchedAt: null, error: 'connection reset' }}
      />,
    );

    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('connection reset')).toBeInTheDocument();
    // Must not render as an all-clear / no-data state that would read as
    // "nothing has ever been fixed".
    expect(screen.queryByText(/nothing archived yet/i)).not.toBeInTheDocument();
  });

  it('renders an honest empty state when the archive genuinely has nothing in it', () => {
    render(<ArchivePanel result={okResult({ resolutions: [], evaluated: 0, confirmedTotal: 0 })} />);

    expect(screen.getByText(/nothing archived yet/i)).toBeInTheDocument();
  });

  it('renders the three ship states distinctly: shipped, pending, and unknown (never unknown as pending)', () => {
    render(
      <ArchivePanel
        result={okResult({
          resolutions: [
            resolution({ fingerprint: 'fp-shipped', shipStatus: 'shipped' }),
            resolution({ fingerprint: 'fp-pending', shipStatus: 'pending' }),
            resolution({ fingerprint: 'fp-unknown', shipStatus: 'unknown' }),
          ],
          evaluated: 3,
          confirmedTotal: 3,
        })}
      />,
    );

    // Three distinct, exact labels — the unknown row must render its own
    // honest text, never fold into "pending" or "shipped".
    expect(screen.getByText('shipped')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('ship state unknown')).toBeInTheDocument();
    expect(screen.queryAllByText('pending')).toHaveLength(1);
  });

  it('renders regressed rows first, ahead of newer non-regressed rows', () => {
    render(
      <ArchivePanel
        result={okResult({
          resolutions: [
            resolution({
              fingerprint: 'fp-newest-clean',
              resolvedAt: '2026-08-26T00:00:00.000Z',
              regressed: false,
            }),
            resolution({
              fingerprint: 'fp-older-regressed',
              resolvedAt: '2026-08-10T00:00:00.000Z',
              regressed: true,
              reopenedAt: '2026-08-15T00:00:00.000Z',
              reopenedCount: 1,
            }),
          ],
          evaluated: 2,
          confirmedTotal: 2,
        })}
      />,
    );

    const fingerprintLinks = screen.getAllByRole('link', { name: /^fp-/ });
    expect(fingerprintLinks.map((el) => el.textContent)).toEqual(['fp-older-regressed', 'fp-newest-clean']);
  });

  it('shows the reopened count so a repeat regression is not lost, even at count 1', () => {
    render(
      <ArchivePanel
        result={okResult({
          resolutions: [
            resolution({
              fingerprint: 'fp-repeat',
              regressed: true,
              reopenedAt: '2026-08-25T00:00:00.000Z',
              reopenedCount: 3,
            }),
            resolution({
              fingerprint: 'fp-repeat-once',
              regressed: true,
              reopenedAt: '2026-08-25T00:00:00.000Z',
              reopenedCount: 1,
            }),
          ],
          evaluated: 2,
          confirmedTotal: 2,
        })}
      />,
    );

    expect(screen.getByText(/regressed 3x/i)).toBeInTheDocument();
    expect(screen.getByText(/regressed 1x/i)).toBeInTheDocument();
  });

  it('does not launder a re-fixed regression: reopenedCount > 0 stays visible even after regressed clears', () => {
    // admin_resolve_error_fingerprint clears reopened_at on a re-resolve
    // while reopened_count survives — a row can be CURRENTLY fixed
    // (regressed: false) while having broken and been refixed before. That
    // history must not silently disappear into a plain clean row.
    render(
      <ArchivePanel
        result={okResult({
          resolutions: [
            resolution({
              fingerprint: 'fp-refixed',
              regressed: false,
              reopenedAt: null,
              reopenedCount: 3,
            }),
          ],
          evaluated: 1,
          confirmedTotal: 1,
        })}
      />,
    );

    expect(screen.getByText(/regressed 3x before/i)).toBeInTheDocument();
  });

  it('distinguishes auto (cron) from manual (operator) resolutions visually and in text', () => {
    render(
      <ArchivePanel
        result={okResult({
          resolutions: [
            resolution({ fingerprint: 'fp-auto', resolutionSource: 'auto' }),
            resolution({ fingerprint: 'fp-manual', resolutionSource: 'manual' }),
          ],
          evaluated: 2,
          confirmedTotal: 2,
        })}
      />,
    );

    expect(screen.getByText(/auto · cron inferred/i)).toBeInTheDocument();
    expect(screen.getByText(/manual · operator confirmed/i)).toBeInTheDocument();
  });

  it('renders the PR as a link when pr_url is present, and "PR #N" as plain text when only pr_number is', () => {
    render(
      <ArchivePanel
        result={okResult({
          resolutions: [
            resolution({ fingerprint: 'fp-with-url', prNumber: 7, prUrl: 'https://github.com/org/repo/pull/7' }),
            resolution({ fingerprint: 'fp-number-only', prNumber: 9, prUrl: null }),
            resolution({ fingerprint: 'fp-no-pr', prNumber: null, prUrl: null }),
          ],
          evaluated: 3,
          confirmedTotal: 3,
        })}
      />,
    );

    const prLink = screen.getByRole('link', { name: 'PR #7' });
    expect(prLink).toHaveAttribute('href', 'https://github.com/org/repo/pull/7');
    expect(screen.getByText('PR #9')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'PR #9' })).not.toBeInTheDocument();
    expect(screen.getByText(/no pr recorded/i)).toBeInTheDocument();
  });

  it('links the fingerprint to its detail page', () => {
    render(<ArchivePanel result={okResult({ resolutions: [resolution({ fingerprint: 'fp-detail' })], evaluated: 1, confirmedTotal: 1 })} />);

    expect(screen.getByRole('link', { name: 'fp-detail' })).toHaveAttribute(
      'href',
      '/admin/errors/fp-detail',
    );
  });

  it('surfaces truncation honestly instead of silently showing a partial archive as complete', () => {
    render(
      <ArchivePanel
        result={{
          ...okResult({ resolutions: [resolution()], evaluated: 1, confirmedTotal: 5_000 }),
          truncated: true,
        }}
      />,
    );

    expect(screen.getByText(/showing the 1 most recently resolved of 5000/i)).toBeInTheDocument();
  });
});
