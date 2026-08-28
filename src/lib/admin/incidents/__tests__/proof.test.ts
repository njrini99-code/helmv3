// =============================================================================
// The proof strip — one derivation, two views (`deriveProof` / `deriveProofGaps`)
// plus the mechanical evidence checklist (`deriveEvidenceCoverage`).
//
// These are pure functions of an evidence snapshot. Every fixture below is a
// COMPLETE `ProofInput`, built from `buildInput()` with only the fields that
// matter for that scenario overridden, so a fixture cannot pass by accident
// because some other field defaulted to something convenient.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveProof, deriveProofGaps, deriveEvidenceCoverage, PRODUCTION_PROOF_WINDOW_MS, type ProofInput } from '@/lib/admin/incidents/proof';
import { PROOF_MILESTONES, type ProofState, type ProofGapKind } from '@/lib/admin/incidents/types';
import type {
  IncidentAnalysis,
  IncidentRepair,
  IncidentDeployProof,
  IncidentSourceEvidence,
} from '@/lib/admin/incidents/types';

const ROOT = join(__dirname, '../../../../..');
const NOW = Date.parse('2026-08-28T12:00:00.000Z');

function buildInput(overrides: Partial<ProofInput> = {}): ProofInput {
  return {
    firstSeen: '2026-08-20T00:00:00.000Z',
    lastSeen: '2026-08-20T00:00:00.000Z',
    analysis: null,
    repair: null,
    deployProof: null,
    resolution: null,
    sources: [],
    hasStack: false,
    hasBreadcrumbs: false,
    route: null,
    errorCode: null,
    hasDeployContext: false,
    hasGitHistory: false,
    now: NOW,
    ...overrides,
  };
}

function buildSource(overrides: Partial<IncidentSourceEvidence>): IncidentSourceEvidence {
  return {
    source: 'app',
    health: 'reading',
    reason: null,
    occurrences: 1,
    firstSeen: '2026-08-20T00:00:00.000Z',
    lastSeen: '2026-08-20T00:00:00.000Z',
    ref: 'fp-1',
    permalink: null,
    summary: null,
    ...overrides,
  };
}

function buildAnalysis(overrides: Partial<IncidentAnalysis> = {}): IncidentAnalysis {
  return {
    category: 'fix-here',
    probableCause: 'A null check is missing on the round summary path.',
    suggestedFix: 'FIX HERE — add a null guard before dereferencing round.summary.',
    confidence: 'high',
    suspectFiles: [],
    relatedFingerprints: [],
    model: 'claude-opus-5',
    generatedAt: '2026-08-27T00:00:00.000Z',
    repairVerdict: 'not-reviewed',
    ...overrides,
  };
}

function buildRepair(overrides: Partial<IncidentRepair> = {}): IncidentRepair {
  return {
    status: 'merged',
    prNumber: 101,
    prUrl: 'https://github.com/org/repo/pull/101',
    branch: 'fix/incident-123',
    checks: { total: 3, passed: 3, failed: 0, pending: 0 },
    mergedAt: '2026-08-26T11:00:00.000Z',
    mergeSha: 'abc1234',
    note: null,
    ...overrides,
  };
}

function buildDeployProof(overrides: Partial<IncidentDeployProof> = {}): IncidentDeployProof {
  return {
    fixedInSha: 'abc1234',
    productionSha: 'abc1234',
    deployedAt: '2026-08-26T12:00:00.000Z',
    servesFix: true,
    lastOccurrenceAt: null,
    sinceDeployMs: 2 * PRODUCTION_PROOF_WINDOW_MS,
    sufficientProof: true,
    gap: null,
    ...overrides,
  };
}

/** Convenience: pull one dot's { state, evidence } out of a full strip. */
function dotFor(input: ProofInput, milestone: (typeof PROOF_MILESTONES)[number]) {
  const dot = deriveProof(input).find((d) => d.milestone === milestone);
  if (!dot) throw new Error(`missing milestone ${milestone}`);
  return dot;
}

describe('deriveProof — the six-dot strip', () => {
  it('a fully proven incident: all six dots are proven', () => {
    const deployedAt = NOW - 2 * PRODUCTION_PROOF_WINDOW_MS;
    const input = buildInput({
      sources: [buildSource({ source: 'app' }), buildSource({ source: 'sentry' })],
      analysis: buildAnalysis(),
      repair: buildRepair(),
      deployProof: buildDeployProof({
        deployedAt: new Date(deployedAt).toISOString(),
        lastOccurrenceAt: new Date(deployedAt - 1000).toISOString(), // stopped BEFORE the deploy
        sinceDeployMs: NOW - deployedAt,
        sufficientProof: true,
      }),
      hasStack: true,
      hasBreadcrumbs: true,
      route: '/golf/dashboard',
      errorCode: 'ERR_ROUND_SUMMARY',
      hasDeployContext: true,
      hasGitHistory: true,
    });

    const dots = deriveProof(input);
    expect(dots.map((d) => d.state)).toEqual(['proven', 'proven', 'proven', 'proven', 'proven', 'proven']);
  });

  it('a brand-new observed-only incident: observed is proven, everything else is not-reached', () => {
    const input = buildInput({
      sources: [buildSource({ source: 'app' })],
    });

    const dots = deriveProof(input);
    expect(dotFor(input, 'observed').state).toBe('proven');
    for (const milestone of ['analyzed', 'reproduced', 'ci-proven', 'deployed', 'production-verified'] as const) {
      expect(dotFor(input, milestone).state).toBe('not-reached');
    }
    // not-reached dots carry no evidence.
    for (const dot of dots) {
      if (dot.state === 'not-reached') expect(dot.evidence).toBeNull();
    }
  });

  it('checks unreadable (repair exists, checks === null) reads ci-proven as unknown, NOT pending', () => {
    // Conflating "could not read the checks" with "checks are in progress" is
    // exactly the `unknown -> healthy` collapse this module exists to refuse
    // — `'pending'` reads as orderly progress, which this read is not.
    const input = buildInput({
      repair: buildRepair({ status: 'pr-open', checks: null, mergedAt: null, mergeSha: null }),
    });

    const dot = dotFor(input, 'ci-proven');
    expect(dot.state).toBe('unknown');
    expect(dot.state).not.toBe('pending');
    expect(dot.evidence).not.toBeNull();
  });

  it('deployed and it happened again: production-verified is failed, not pending', () => {
    // A recurrence after the fix went live CONTRADICTS the proof; it is not
    // merely immature evidence, so this must never read as 'pending'.
    const deployedAt = NOW - 5 * 86_400_000;
    const recurredAt = NOW - 1 * 86_400_000; // after deployedAt
    const input = buildInput({
      repair: buildRepair(),
      deployProof: buildDeployProof({
        deployedAt: new Date(deployedAt).toISOString(),
        lastOccurrenceAt: new Date(recurredAt).toISOString(),
        sinceDeployMs: NOW - deployedAt,
        sufficientProof: false,
        gap: 'Recurred after the fix went live.',
      }),
    });

    const dot = dotFor(input, 'production-verified');
    expect(dot.state).toBe('failed');
    expect(dot.state).not.toBe('pending');
    expect(dot.evidence).not.toBeNull();
  });

  it('deployed 10 minutes ago: production-verified is pending, with an awaiting-traffic gap', () => {
    const deployedAt = NOW - 10 * 60_000;
    const input = buildInput({
      repair: buildRepair({ mergedAt: new Date(deployedAt - 60_000).toISOString() }),
      deployProof: buildDeployProof({
        deployedAt: new Date(deployedAt).toISOString(),
        lastOccurrenceAt: null,
        sinceDeployMs: 10 * 60_000,
        sufficientProof: false,
      }),
    });

    expect(dotFor(input, 'production-verified').state).toBe('pending');

    const gaps = deriveProofGaps(input);
    const trafficGap = gaps.find((g) => g.kind === 'awaiting-traffic');
    expect(trafficGap).toBeDefined();
    expect(trafficGap?.detail).toMatch(/10 minute/);
    expect(trafficGap?.ageMs).toBe(10 * 60_000);
  });

  it('deriveProof always returns exactly PROOF_MILESTONES.length dots, in that exact order', () => {
    const input = buildInput({ sources: [buildSource({})] });
    const dots = deriveProof(input);
    expect(dots).toHaveLength(PROOF_MILESTONES.length);
    expect(dots.map((d) => d.milestone)).toEqual([...PROOF_MILESTONES]);
  });
});

describe('deriveProofGaps — the punch list', () => {
  it('a blind Sentry source produces a source-blind gap naming it and its reason', () => {
    const input = buildInput({
      sources: [
        buildSource({
          source: 'sentry',
          health: 'blind',
          reason: 'API token expired',
          occurrences: null,
          firstSeen: null,
          lastSeen: '2026-08-26T00:00:00.000Z',
          ref: null,
        }),
      ],
      hasStack: true,
      hasBreadcrumbs: true,
      route: '/golf/dashboard',
      errorCode: 'ERR_X',
      hasDeployContext: true,
      hasGitHistory: true,
    });

    const gaps = deriveProofGaps(input);
    const blindGap = gaps.find((g) => g.kind === 'source-blind');
    expect(blindGap).toBeDefined();
    expect(blindGap?.detail).toContain('SENTRY');
    expect(blindGap?.detail).toContain('API token expired');

    // Every source is blind, so the mechanical checklist cannot claim to know
    // whether a stack or breadcrumbs exist — 'unknown', never 'absent'.
    const coverage = deriveEvidenceCoverage(input);
    const stack = coverage.dimensions.find((d) => d.dimension === 'stack');
    const breadcrumbs = coverage.dimensions.find((d) => d.dimension === 'breadcrumbs');
    expect(stack?.state).toBe('unknown');
    expect(breadcrumbs?.state).toBe('unknown');
    // Dimensions unrelated to source health are unaffected.
    expect(coverage.dimensions.find((d) => d.dimension === 'route')?.state).toBe('present');
  });

  it('PR open with all checks green: awaiting-owner, and NO awaiting-ci', () => {
    const input = buildInput({
      sources: [buildSource({})],
      repair: buildRepair({
        status: 'pr-open',
        mergedAt: null,
        mergeSha: null,
        checks: { total: 2, passed: 2, failed: 0, pending: 0 },
      }),
    });

    expect(dotFor(input, 'ci-proven').state).toBe('proven');

    const gaps = deriveProofGaps(input);
    expect(gaps.find((g) => g.kind === 'awaiting-owner')).toBeDefined();
    expect(gaps.find((g) => g.kind === 'awaiting-ci')).toBeUndefined();
  });

  it('FIX HERE with no repair produces an awaiting-repair gap', () => {
    const input = buildInput({
      analysis: buildAnalysis({ category: 'fix-here', generatedAt: new Date(NOW - 3_600_000).toISOString() }),
      repair: null,
    });

    const gaps = deriveProofGaps(input);
    const repairGap = gaps.find((g) => g.kind === 'awaiting-repair');
    expect(repairGap).toBeDefined();
    expect(repairGap?.detail).not.toBe('No repair attempted'); // must be specific, not the category label
    expect(repairGap?.ageMs).toBe(3_600_000);
  });
});

describe('deriveEvidenceCoverage — a checklist, never a percentage', () => {
  it('present counts only present dimensions, and total is EVIDENCE_DIMENSIONS.length', () => {
    const input = buildInput({
      hasStack: true,
      hasBreadcrumbs: false,
      route: '/x',
      errorCode: null,
      hasDeployContext: true,
      hasGitHistory: false,
      sources: [buildSource({})],
    });

    const coverage = deriveEvidenceCoverage(input);
    expect(coverage.total).toBe(coverage.dimensions.length);
    expect(coverage.present).toBe(coverage.dimensions.filter((d) => d.state === 'present').length);
  });
});

describe('the shared PRODUCTION_PROOF_WINDOW_MS / RELEASE_GRACE_MS pin', () => {
  it('mirrors auto-resolve.ts RELEASE_GRACE_MS by value, not by import', () => {
    // proof.ts cannot import RELEASE_GRACE_MS directly: auto-resolve.ts
    // transitively imports vercel-api.ts and resolution-ledger.ts, both of
    // which open with `import 'server-only'`, and pulling that in would
    // poison this module's client-safe bundle. This test is the guard that
    // keeps the two constants from silently drifting apart instead.
    const src = readFileSync(join(ROOT, 'src/lib/admin/auto-resolve.ts'), 'utf8');
    expect(src).toContain('export const RELEASE_GRACE_MS = 24 * 3600_000;');
    expect(PRODUCTION_PROOF_WINDOW_MS).toBe(24 * 3600_000);
  });

  it('auto-resolve.ts really is server-only transitively (the reason this cannot just import it)', () => {
    const vercelApiSrc = readFileSync(join(ROOT, 'src/lib/admin/vercel-api.ts'), 'utf8');
    const resolutionLedgerSrc = readFileSync(join(ROOT, 'src/lib/admin/resolution-ledger.ts'), 'utf8');
    expect(vercelApiSrc).toContain("import 'server-only'");
    expect(resolutionLedgerSrc).toContain("import 'server-only'");
  });
});

describe('non-vacuity — the fixtures actually exercise the vocabulary', () => {
  it('produces at least 4 distinct ProofState values and 4 distinct ProofGapKind values', () => {
    const deployedAt = NOW - 2 * PRODUCTION_PROOF_WINDOW_MS;
    const fixtures: ProofInput[] = [
      // proven
      buildInput({
        sources: [buildSource({})],
        analysis: buildAnalysis(),
        repair: buildRepair(),
        deployProof: buildDeployProof({
          deployedAt: new Date(deployedAt).toISOString(),
          lastOccurrenceAt: new Date(deployedAt - 1000).toISOString(),
          sinceDeployMs: NOW - deployedAt,
          sufficientProof: true,
        }),
      }),
      // not-reached
      buildInput({ sources: [buildSource({})] }),
      // unknown (ci-proven)
      buildInput({ repair: buildRepair({ status: 'pr-open', checks: null, mergedAt: null, mergeSha: null }) }),
      // failed (production-verified)
      buildInput({
        repair: buildRepair(),
        deployProof: buildDeployProof({
          deployedAt: new Date(NOW - 5 * 86_400_000).toISOString(),
          lastOccurrenceAt: new Date(NOW - 1 * 86_400_000).toISOString(),
          sufficientProof: false,
        }),
      }),
      // pending (production-verified) — also yields an awaiting-traffic gap
      buildInput({
        repair: buildRepair({ mergedAt: new Date(NOW - 10 * 60_000 - 60_000).toISOString() }),
        deployProof: buildDeployProof({
          deployedAt: new Date(NOW - 10 * 60_000).toISOString(),
          lastOccurrenceAt: null,
          sinceDeployMs: 10 * 60_000,
          sufficientProof: false,
        }),
      }),
      // source-blind gap
      buildInput({
        sources: [buildSource({ source: 'sentry', health: 'blind', reason: 'timeout' })],
      }),
      // awaiting-owner gap
      buildInput({
        repair: buildRepair({
          status: 'pr-open',
          mergedAt: null,
          mergeSha: null,
          checks: { total: 1, passed: 1, failed: 0, pending: 0 },
        }),
      }),
      // awaiting-repair gap
      buildInput({ analysis: buildAnalysis({ category: 'fix-here' }), repair: null }),
    ];

    const states = new Set<ProofState>();
    const gapKinds = new Set<ProofGapKind>();
    for (const fixture of fixtures) {
      for (const dot of deriveProof(fixture)) states.add(dot.state);
      for (const gap of deriveProofGaps(fixture)) gapKinds.add(gap.kind);
    }

    expect(states.size).toBeGreaterThanOrEqual(4);
    expect(gapKinds.size).toBeGreaterThanOrEqual(4);
  });

  it('every dot with state !== not-reached carries a non-null evidence string', () => {
    const deployedAt = NOW - 2 * PRODUCTION_PROOF_WINDOW_MS;
    const fixtures: ProofInput[] = [
      buildInput({
        sources: [buildSource({})],
        analysis: buildAnalysis(),
        repair: buildRepair(),
        deployProof: buildDeployProof({
          deployedAt: new Date(deployedAt).toISOString(),
          lastOccurrenceAt: new Date(deployedAt - 1000).toISOString(),
          sinceDeployMs: NOW - deployedAt,
          sufficientProof: true,
        }),
      }),
      buildInput({ sources: [buildSource({})] }),
      buildInput({ repair: buildRepair({ status: 'pr-open', checks: null, mergedAt: null, mergeSha: null }) }),
      buildInput({
        repair: buildRepair(),
        deployProof: buildDeployProof({
          deployedAt: new Date(NOW - 5 * 86_400_000).toISOString(),
          lastOccurrenceAt: new Date(NOW - 1 * 86_400_000).toISOString(),
          sufficientProof: false,
        }),
      }),
    ];

    for (const fixture of fixtures) {
      for (const dot of deriveProof(fixture)) {
        if (dot.state !== 'not-reached') {
          expect(dot.evidence, `${dot.milestone} (${dot.state}) must carry evidence`).not.toBeNull();
        } else {
          expect(dot.evidence).toBeNull();
        }
      }
    }
  });
});
