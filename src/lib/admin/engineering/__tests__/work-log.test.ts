import { describe, it, expect, vi } from 'vitest';
import { buildWorkLogProof, buildRepairQuality } from '@/lib/admin/engineering/work-log';
import type { WorkLogEntry } from '@/lib/admin/github-pr-timeline';
import type { ReleaseCardData } from '@/lib/admin/data/release-ledger';

function entry(overrides: Partial<WorkLogEntry> & { number: number }): WorkLogEntry {
  return {
    html_url: `https://github.com/x/y/pull/${overrides.number}`,
    title: `PR ${overrides.number}`,
    state: 'merged',
    authorLogin: 'nick',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    merged_at: '2026-09-01T00:00:00Z',
    closed_at: null,
    parsed: { summary: null, partnerSummary: null, problem: null, fix: null, area: 'bridge', timelineNote: null, changeTypes: [] },
    repairIncidentIds: [],
    repairVerdict: 'not-reviewed',
    ...overrides,
  };
}

function card(overrides: Partial<ReleaseCardData> & { createdAt: number }): ReleaseCardData {
  return {
    uid: `deploy-${overrides.createdAt}`,
    commitSha: 'abc123',
    commitMessage: null,
    commitRef: null,
    commitAuthor: null,
    isLive: false,
    gatheringSignal: false,
    errorsBefore2h: 0,
    errorsAfter2h: 0,
    delta: 0,
    verdict: { tone: 'neutral', label: 'No change' },
    resolvedAndQuietSince: 0,
    newFingerprintsSince: 0,
    topFeatureDeltas: [],
    newFingerprintSamples: [],
    ...overrides,
  };
}

const MERGED_AT_MS = Date.parse('2026-09-01T00:00:00Z');

describe('buildWorkLogProof', () => {
  it('maps a merged PR to the earliest release deployed at or after its merge time', () => {
    const rows = buildWorkLogProof(
      [entry({ number: 1, merged_at: '2026-09-01T00:00:00Z' })],
      [card({ createdAt: MERGED_AT_MS - 3600_000 }), card({ createdAt: MERGED_AT_MS + 3600_000, commitSha: 'shipped-sha' }), card({ createdAt: MERGED_AT_MS + 7200_000 })],
    );
    expect(rows[0]?.shippedInRelease?.commitSha).toBe('shipped-sha');
    expect(rows[0]?.notYetDeployed).toBe(false);
  });

  it('marks a PR merged after every known deploy as not yet deployed', () => {
    const rows = buildWorkLogProof(
      [entry({ number: 2, merged_at: '2026-09-01T00:00:00Z' })],
      [card({ createdAt: MERGED_AT_MS - 3600_000 })],
    );
    expect(rows[0]?.shippedInRelease).toBeNull();
    expect(rows[0]?.notYetDeployed).toBe(true);
  });

  it('leaves shippedInRelease null (and notYetDeployed false) for an open PR — it has not merged at all', () => {
    const rows = buildWorkLogProof(
      [entry({ number: 3, state: 'open', merged_at: null })],
      [card({ createdAt: MERGED_AT_MS + 3600_000 })],
    );
    expect(rows[0]?.shippedInRelease).toBeNull();
    expect(rows[0]?.notYetDeployed).toBe(false);
  });

  it('every row gets shippedInRelease: null when the release ledger is unavailable — never fabricates a match', () => {
    const rows = buildWorkLogProof([entry({ number: 4, merged_at: '2026-09-01T00:00:00Z' })], null);
    expect(rows[0]?.shippedInRelease).toBeNull();
    expect(rows[0]?.notYetDeployed).toBe(false);
  });

  it('sorts release cards ascending internally regardless of input order', () => {
    const rows = buildWorkLogProof(
      [entry({ number: 5, merged_at: '2026-09-01T00:00:00Z' })],
      [card({ createdAt: MERGED_AT_MS + 7200_000, commitSha: 'later' }), card({ createdAt: MERGED_AT_MS + 3600_000, commitSha: 'earliest-after-merge' })],
    );
    expect(rows[0]?.shippedInRelease?.commitSha).toBe('earliest-after-merge');
  });
});

describe('buildRepairQuality', () => {
  it('filters to only PRs that claim a repair', () => {
    const rows = buildWorkLogProof(
      [
        entry({ number: 1, repairIncidentIds: ['fp-1'] }),
        entry({ number: 2, repairIncidentIds: [] }),
      ],
      null,
    );
    const quality = buildRepairQuality(rows);
    expect(quality).toHaveLength(1);
    expect(quality[0]?.number).toBe(1);
  });

  it('labels stayedFixed "improved" when the shipping release verdict tone is success', () => {
    const rows = buildWorkLogProof(
      [entry({ number: 1, repairIncidentIds: ['fp-1'], merged_at: '2026-09-01T00:00:00Z' })],
      [card({ createdAt: MERGED_AT_MS + 3600_000, verdict: { tone: 'success', label: 'Improved' } })],
    );
    expect(buildRepairQuality(rows)[0]?.stayedFixed).toBe('improved');
  });

  it('labels stayedFixed "worsened" when the shipping release verdict tone is danger', () => {
    const rows = buildWorkLogProof(
      [entry({ number: 1, repairIncidentIds: ['fp-1'], merged_at: '2026-09-01T00:00:00Z' })],
      [card({ createdAt: MERGED_AT_MS + 3600_000, verdict: { tone: 'danger', label: 'Regressed' } })],
    );
    expect(buildRepairQuality(rows)[0]?.stayedFixed).toBe('worsened');
  });

  it('labels stayedFixed "not-yet-deployed" rather than "unknown" when the PR has not shipped', () => {
    const rows = buildWorkLogProof(
      [entry({ number: 1, repairIncidentIds: ['fp-1'], merged_at: '2026-09-01T00:00:00Z' })],
      [card({ createdAt: MERGED_AT_MS - 3600_000 })],
    );
    expect(buildRepairQuality(rows)[0]?.stayedFixed).toBe('not-yet-deployed');
  });

  it('labels stayedFixed "unknown" when release data is unavailable at all', () => {
    const rows = buildWorkLogProof([entry({ number: 1, repairIncidentIds: ['fp-1'] })], null);
    expect(buildRepairQuality(rows)[0]?.stayedFixed).toBe('unknown');
  });
});

describe('fetchWorkLogProof / fetchRepairQuality per-source isolation', () => {
  it('still returns Work Log rows when the release ledger read fails', async () => {
    vi.resetModules();
    vi.doMock('@/lib/admin/github-pr-timeline', () => ({
      fetchWorkLog: async () => ({
        status: 'ok',
        data: {
          entries: [entry({ number: 9 })],
          repoLabel: 'x/y',
          authorLogins: [],
          counts: { total: 1, merged: 1, open: 0, byArea: {} },
          fetchLimit: 60,
        },
        fetchedAt: '2026-09-01T00:00:00Z',
        truncated: false,
      }),
    }));
    vi.doMock('@/lib/admin/data/release-ledger', () => ({
      fetchReleaseLedger: async () => ({ status: 'error', data: null, fetchedAt: null, error: 'Vercel unreachable' }),
    }));
    const { fetchWorkLogProof } = await import('@/lib/admin/engineering/work-log');
    const result = await fetchWorkLogProof();
    expect(result.status).toBe('ok');
    expect(result.data?.rows).toHaveLength(1);
    expect(result.data?.releaseDataAvailable).toBe(false);
    vi.doUnmock('@/lib/admin/github-pr-timeline');
    vi.doUnmock('@/lib/admin/data/release-ledger');
    vi.resetModules();
  });
});
