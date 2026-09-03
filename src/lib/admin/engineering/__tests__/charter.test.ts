import { describe, it, expect } from 'vitest';
import {
  toMutationGateCharter,
  toContractCharterSummary,
  toJanitorCharter,
  fetchMutationGateCharter,
  fetchContractsCharter,
  fetchJanitorCharter,
} from '@/lib/admin/engineering/charter';

describe('toMutationGateCharter', () => {
  it('reads floor/scope and detects the PROVISIONAL comment', () => {
    const charter = toMutationGateCharter({
      floor: 40,
      scope: 'src/lib/coachhelm/v2/**/*.ts',
      $comment: ['line one', 'PROVISIONAL. No real weekly mutation score...'],
    });
    expect(charter.floor).toBe(40);
    expect(charter.provisional).toBe(true);
  });

  it('is not provisional when the comment does not say so', () => {
    const charter = toMutationGateCharter({ floor: 60, scope: 'src/**' });
    expect(charter.provisional).toBe(false);
  });
});

describe('toContractCharterSummary', () => {
  it('counts current and superseded claims', () => {
    const summary = toContractCharterSummary({
      feature_id: 'admin_platform',
      anchor_sha: 'abc123',
      resolution: { via: 'direct' },
      current_contract: [{}, {}, {}],
      superseded_claims: [{}],
    });
    expect(summary.claimCount).toBe(3);
    expect(summary.supersededCount).toBe(1);
    expect(summary.evidenceCommand).toContain('admin_platform');
  });

  it('handles a missing superseded_claims field as 0, not a crash', () => {
    const summary = toContractCharterSummary({
      feature_id: 'x',
      anchor_sha: 'sha',
      resolution: { via: 'alias' },
      current_contract: [],
    } as never);
    expect(summary.supersededCount).toBe(0);
  });
});

describe('toJanitorCharter', () => {
  it('caps findings at topN and preserves class-level evidence commands', () => {
    const file = {
      generated_at: '2026-09-01T00:00:00Z',
      generated_at_sha: 'deadbeef',
      classes: [{ classId: 'duplicate_helpers', title: 'Duplicate helpers', verdict: 'FINDINGS' as const, findingCount: 3, evidenceCommand: 'npm run janitor' }],
      findings: Array.from({ length: 30 }, (_, i) => ({
        id: `f-${i}`, class: 'duplicate_helpers', scope: `src/x${i}.ts`, reason: 'dup', confidence: 'high', size_of_change: 'small',
      })),
    };
    const charter = toJanitorCharter(file, 5);
    expect(charter.topFindings).toHaveLength(5);
    expect(charter.classes[0]?.evidenceCommand).toBe('npm run janitor');
  });
});

describe('fetch* functions discloses missing artifacts as unconfigured, not a fabricated empty result', () => {
  it('fetchMutationGateCharter reads the real committed config', async () => {
    const result = await fetchMutationGateCharter();
    expect(result.status).toBe('ok');
    expect(result.data?.floor).toBeGreaterThan(0);
  });

  it('fetchContractsCharter reads the real committed contracts directory', async () => {
    const result = await fetchContractsCharter();
    expect(result.status).toBe('ok');
    expect(result.data?.length).toBeGreaterThan(0);
  });

  it('fetchJanitorCharter reports unconfigured — the findings file is generated, not committed', async () => {
    const result = await fetchJanitorCharter();
    expect(result.status).toBe('unconfigured');
    expect(result.data).toBeNull();
  });
});
