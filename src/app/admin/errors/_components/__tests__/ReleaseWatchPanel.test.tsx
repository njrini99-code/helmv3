import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReleaseWatchPanel } from '../ReleaseWatchPanel';
import type { CurrentReleaseWatch } from '@/lib/admin/incidents/release-watch';

function baseWatch(overrides: Partial<CurrentReleaseWatch> = {}): CurrentReleaseWatch {
  return {
    context: {
      releaseSha: 'abc1234',
      deployedAt: '2026-09-02T12:00:00.000Z',
      baselineReleaseSha: 'def5678',
      runtimeIdentity: {
        appSha: 'abc1234567890',
        dbMigrationHead: '20260901120000',
        dbMigrationHeadState: 'known',
        aiConfigIdentity: 'compose=model-a',
      },
      includedPrs: [],
      releaseWatch: 'clean-so-far',
      newFingerprints: [],
      regressedFingerprints: [],
      cohort: null,
    },
    relationships: new Map(),
    comparison: null,
    currentCard: null,
    baselineCard: null,
    unavailableReason: null,
    newFingerprintsTotal: 0,
    ...overrides,
  };
}

describe('ReleaseWatchPanel', () => {
  it('renders the watch state posture and runtime identity triplet', () => {
    render(<ReleaseWatchPanel releaseWatch={baseWatch()} />);
    expect(screen.getByText('CLEAN SO FAR')).toBeInTheDocument();
    expect(screen.getByText(/abc123456789/)).toBeInTheDocument();
    expect(screen.getByText('20260901120000')).toBeInTheDocument();
  });

  it('says why release data is unavailable rather than rendering an empty panel', () => {
    render(
      <ReleaseWatchPanel
        releaseWatch={baseWatch({ unavailableReason: 'No production deploy could be identified.' })}
      />,
    );
    expect(screen.getByText('No production deploy could be identified.')).toBeInTheDocument();
  });

  it('shows "no read model yet" for metrics this codebase cannot compute, never a fabricated number', () => {
    render(
      <ReleaseWatchPanel
        releaseWatch={baseWatch({
          comparison: {
            rootIncidents: { baseline: 3, current: 5, delta: 2, state: 'worsened' },
            affectedUsers: { baseline: 10, current: 8, delta: -2, state: 'improved' },
            journeySuccessRate: { baseline: null, current: null, delta: null, state: 'unknown' },
            dbP95Ms: { baseline: null, current: null, delta: null, state: 'unknown' },
            invariantBreaches: { baseline: null, current: null, delta: null, state: 'unknown' },
            newSqlstates: null,
            dbBlind: true,
          },
        })}
      />,
    );
    expect(screen.getByText('5')).toBeInTheDocument(); // root incidents current
    expect(screen.getAllByText('no read model yet').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('DB source blind this window')).toBeInTheDocument();
  });

  it('shows the true new-fingerprint total, never truncated to the 5-sample cap', () => {
    // Regression test for PR #1789 review defect #1: the panel used to read
    // context.newFingerprints.length (a display sample capped at 5 by
    // release-ledger.ts) as if it were the true count.
    render(<ReleaseWatchPanel releaseWatch={baseWatch({ newFingerprintsTotal: 23 })} />);
    expect(screen.getByText(/23 new fingerprints/)).toBeInTheDocument();
  });

  it('shows root incidents as unknown, never "unchanged", when the baseline was never measured', () => {
    // Regression test for PR #1789 review defect #2: reusing the live board
    // for both baseline and current used to make an unmeasured baseline
    // read as an identical, "unchanged" 5 — a false claim that a comparison
    // was made. baseline: null is what an honest, unmeasured comparison
    // renders through this panel: the metric falls through to UnknownInline,
    // never a number.
    render(
      <ReleaseWatchPanel
        releaseWatch={baseWatch({
          comparison: {
            rootIncidents: { baseline: null, current: 5, delta: null, state: 'unknown' },
            affectedUsers: { baseline: null, current: 3, delta: null, state: 'unknown' },
            journeySuccessRate: { baseline: null, current: null, delta: null, state: 'unknown' },
            dbP95Ms: { baseline: null, current: null, delta: null, state: 'unknown' },
            invariantBreaches: { baseline: null, current: null, delta: null, state: 'unknown' },
            newSqlstates: null,
            dbBlind: true,
          },
        })}
      />,
    );
    // metricRow renders UnknownInline whenever metric.current === null OR
    // state === 'unknown' — root incidents' current (5) is a real number so
    // it renders, but with no "unchanged from N" baseline clause attached.
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.queryByText(/unchanged from/)).not.toBeInTheDocument();
  });
});
