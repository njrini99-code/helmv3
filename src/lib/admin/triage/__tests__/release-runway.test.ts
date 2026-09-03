import { describe, it, expect } from 'vitest';
import { buildReleaseRunway } from '../release-runway';
import { buildRuntimeIdentityTriplet } from '@/lib/admin/incidents/release-context';
import type { ReleaseCardData, ReleaseLedgerData } from '@/lib/admin/data/release-ledger';

function card(overrides: Partial<ReleaseCardData> = {}): ReleaseCardData {
  return {
    uid: 'r1',
    commitSha: 'abc123',
    commitMessage: 'fix: something',
    commitRef: 'main',
    commitAuthor: 'nick',
    createdAt: Date.parse('2026-09-03T00:00:00.000Z'),
    isLive: false,
    gatheringSignal: false,
    errorsBefore2h: 2,
    errorsAfter2h: 2,
    delta: 0,
    verdict: { tone: 'neutral', label: 'Stable' },
    resolvedAndQuietSince: 0,
    newFingerprintsSince: 0,
    topFeatureDeltas: [],
    newFingerprintSamples: [],
    ...overrides,
  };
}

function ledger(overrides: Partial<ReleaseLedgerData> = {}): ReleaseLedgerData {
  return {
    trend: [],
    cards: [card()],
    currentBuildSha: 'live-sha',
    deploySource: 'vercel',
    ...overrides,
  };
}

const NOW = Date.parse('2026-09-03T06:00:00.000Z');
const LIVE_TRIPLET = buildRuntimeIdentityTriplet({ appSha: 'live-sha', dbMigrationHead: 'mig-42', dbMigrationHeadState: 'known' });

describe('buildReleaseRunway', () => {
  it('attaches the live triplet (known DB migration head) only to the live release', () => {
    const view = buildReleaseRunway(
      ledger({ cards: [card({ uid: 'live', isLive: true }), card({ uid: 'past', isLive: false })] }),
      LIVE_TRIPLET,
      NOW,
    );
    const live = view.rows.find((r) => r.uid === 'live')!;
    const past = view.rows.find((r) => r.uid === 'past')!;
    expect(live.runtimeIdentity.dbMigrationHeadState).toBe('known');
    expect(past.runtimeIdentity.dbMigrationHeadState).toBe('unknown');
    // Never backdates today's head onto a past release.
    expect(past.runtimeIdentity.dbMigrationHead).toBeNull();
  });

  it('every past release still carries its own real app SHA, never the live one', () => {
    const view = buildReleaseRunway(
      ledger({ cards: [card({ uid: 'past', commitSha: 'past-sha', isLive: false })] }),
      LIVE_TRIPLET,
      NOW,
    );
    expect(view.rows[0]!.runtimeIdentity.appSha).toBe('past-sha');
  });

  it('never fabricates a rollback recommendation, even with a regression', () => {
    const view = buildReleaseRunway(
      ledger({ cards: [card({ createdAt: NOW - 60_000, verdict: { tone: 'danger', label: 'Worse' } })] }),
      LIVE_TRIPLET,
      NOW,
    );
    expect(view.rows[0]!.watchState).toBe('regression-detected');
    expect(view.rows[0]!.watchState).not.toBe('rollback-recommended');
  });

  it('maps a danger verdict to a real regression signal in the watch state', () => {
    const clean = buildReleaseRunway(
      ledger({ cards: [card({ createdAt: NOW - 60_000, verdict: { tone: 'neutral', label: 'Stable' } })] }),
      LIVE_TRIPLET,
      NOW,
    );
    expect(clean.rows[0]!.watchState).not.toBe('regression-detected');
  });

  it('a marker-fallback deploy source marks source coverage blind — no proven-healthy from silence alone', () => {
    const oldEnough = NOW - 7 * 24 * 60 * 60_000;
    const view = buildReleaseRunway(
      ledger({ deploySource: 'marker-fallback', cards: [card({ createdAt: oldEnough })] }),
      LIVE_TRIPLET,
      NOW,
    );
    expect(view.deploySource).toBe('marker-fallback');
    expect(view.rows[0]!.watchState).toBe('unknown');
  });

  it('an old, clean, fully-covered release reads proven-healthy', () => {
    const oldEnough = NOW - 7 * 24 * 60 * 60_000;
    const view = buildReleaseRunway(
      ledger({ deploySource: 'vercel', cards: [card({ createdAt: oldEnough, newFingerprintsSince: 0, verdict: { tone: 'neutral', label: 'Stable' } })] }),
      LIVE_TRIPLET,
      NOW,
    );
    expect(view.rows[0]!.watchState).toBe('proven-healthy');
  });

  it('preserves the ledger row order and passes through the raw counts unchanged', () => {
    const view = buildReleaseRunway(
      ledger({ cards: [card({ uid: 'a' }), card({ uid: 'b' })] }),
      LIVE_TRIPLET,
      NOW,
    );
    expect(view.rows.map((r) => r.uid)).toEqual(['a', 'b']);
  });
});
