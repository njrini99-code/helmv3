import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReleaseRunwayStrip } from '@/components/admin/triage/ReleaseRunwayStrip';
import { buildRuntimeIdentityTriplet } from '@/lib/admin/incidents/release-context';
import type { ReleaseRunwayRow, ReleaseRunwayView } from '@/lib/admin/triage/release-runway';

function row(overrides: Partial<ReleaseRunwayRow> = {}): ReleaseRunwayRow {
  return {
    uid: 'r1',
    commitSha: 'abc12345',
    commitMessage: 'fix: something',
    commitRef: 'main',
    commitAuthor: 'nick',
    createdAt: Date.parse('2026-09-03T00:00:00.000Z'),
    isLive: false,
    watchState: 'clean-so-far',
    runtimeIdentity: buildRuntimeIdentityTriplet({ appSha: 'abc12345', dbMigrationHead: null, dbMigrationHeadState: 'unknown' }),
    newFingerprintsSince: 0,
    resolvedAndQuietSince: 0,
    errorsBefore2h: 0,
    errorsAfter2h: 0,
    gatheringSignal: false,
    ...overrides,
  };
}

function view(overrides: Partial<ReleaseRunwayView> = {}): ReleaseRunwayView {
  return { rows: [row()], deploySource: 'vercel', ...overrides };
}

describe('ReleaseRunwayStrip', () => {
  it('renders one card per release with its watch state', () => {
    render(<ReleaseRunwayStrip view={view()} />);
    expect(screen.getByText('CLEAN SO FAR')).toBeInTheDocument();
  });

  it('renders an honest empty state when there are no releases', () => {
    render(<ReleaseRunwayStrip view={view({ rows: [] })} />);
    expect(screen.getByText(/No deploys recorded yet/i)).toBeInTheDocument();
  });

  it('marks the live release distinctly from historical ones', () => {
    render(<ReleaseRunwayStrip view={view({ rows: [row({ isLive: true })] })} />);
    expect(screen.getByText('live')).toBeInTheDocument();
  });

  it('shows the DB migration head as unknown for a non-live release, never a backdated value', () => {
    render(<ReleaseRunwayStrip view={view({ rows: [row({ isLive: false })] })} />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('shows a real migration head for the live release when known', () => {
    render(
      <ReleaseRunwayStrip
        view={view({
          rows: [
            row({
              isLive: true,
              runtimeIdentity: buildRuntimeIdentityTriplet({ appSha: 'x', dbMigrationHead: '20260903120000', dbMigrationHeadState: 'known' }),
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText('202609031200')).toBeInTheDocument();
  });

  it('never renders a rollback-recommended badge — states rollback intelligence is never a visual recommendation', () => {
    render(<ReleaseRunwayStrip view={view({ rows: [row({ watchState: 'regression-detected' })] })} />);
    expect(screen.getByText(/Never execute a rollback from a visual recommendation/i)).toBeInTheDocument();
    expect(screen.queryByText('ROLLBACK RECOMMENDED')).not.toBeInTheDocument();
  });

  it('surfaces the marker-fallback warning honestly when the Vercel API is not configured', () => {
    render(<ReleaseRunwayStrip view={view({ deploySource: 'marker-fallback' })} />);
    expect(screen.getByText(/Vercel API is not configured/i)).toBeInTheDocument();
  });
});
