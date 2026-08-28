import { describe, expect, it } from 'vitest';

import { buildDeployProof, deriveServesFix, type DeployProofInput } from '../deploy-proof';
import { PRODUCTION_PROOF_WINDOW_MS } from '../proof';

const NOW = Date.parse('2026-08-28T12:00:00.000Z');
const MERGED_AT = '2026-08-25T09:00:00.000Z';
const DEPLOY_AT = Date.parse('2026-08-25T10:00:00.000Z'); // one hour after the merge

function input(overrides: Partial<DeployProofInput> = {}): DeployProofInput {
  return {
    resolutionFixedInSha: null,
    repair: { status: 'merged', mergeSha: 'abc1234def5678', mergedAt: MERGED_AT },
    deploy: { deployAt: DEPLOY_AT, deploySha: 'abc1234def5678' },
    lastSeen: '2026-08-25T08:00:00.000Z', // before the deploy
    now: NOW,
    ...overrides,
  };
}

describe('deriveServesFix', () => {
  it('is true when production runs the fix commit exactly', () => {
    expect(deriveServesFix(input())).toBe(true);
  });

  it('accepts a short SHA against a long one in either direction', () => {
    expect(
      deriveServesFix(input({ deploy: { deployAt: DEPLOY_AT, deploySha: 'abc1234' } })),
    ).toBe(true);
    expect(
      deriveServesFix(
        input({
          repair: { status: 'merged', mergeSha: 'abc1234', mergedAt: MERGED_AT },
          deploy: { deployAt: DEPLOY_AT, deploySha: 'abc1234def5678' },
        }),
      ),
    ).toBe(true);
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * Production almost never sits on the fix commit — any later deploy moves it
   * past. The original implementation returned `false` here, so every fix older
   * than one deploy read as permanently unshipped. The merge timestamp is the
   * correct test and it must be reachable even when both SHAs are known.
   */
  it('stays true when production has moved PAST the fix (a later deploy shipped)', () => {
    const laterDeployAt = Date.parse('2026-08-27T10:00:00.000Z');
    expect(
      deriveServesFix(
        input({ deploy: { deployAt: laterDeployAt, deploySha: 'ffff999later0000' } }),
      ),
    ).toBe(true);
  });

  it('is false only when production is genuinely older than the merge', () => {
    const earlierDeployAt = Date.parse('2026-08-24T10:00:00.000Z');
    expect(
      deriveServesFix(
        input({ deploy: { deployAt: earlierDeployAt, deploySha: '0000oldsha00000' } }),
      ),
    ).toBe(false);
  });

  it('is null — never false — when the deploy anchor could not be read', () => {
    expect(deriveServesFix(input({ deploy: { deployAt: null, deploySha: null } }))).toBeNull();
  });

  it('is null when there is neither a SHA match nor a merge timestamp to reason from', () => {
    expect(
      deriveServesFix(
        input({
          repair: { status: 'merged', mergeSha: 'abc1234', mergedAt: null },
          deploy: { deployAt: DEPLOY_AT, deploySha: 'zzz9999' },
        }),
      ),
    ).toBeNull();
  });

  it('prefers the resolution ledger SHA over the PR merge SHA', () => {
    expect(
      deriveServesFix(
        input({
          resolutionFixedInSha: 'led9999abcd',
          repair: { status: 'merged', mergeSha: 'nomatch000', mergedAt: null },
          deploy: { deployAt: DEPLOY_AT, deploySha: 'led9999abcd' },
        }),
      ),
    ).toBe(true);
  });
});

describe('buildDeployProof', () => {
  it('returns null when there is no fix to prove', () => {
    expect(
      buildDeployProof(input({ repair: { status: 'none', mergeSha: null, mergedAt: null } })),
    ).toBeNull();
  });

  it('does not claim "production does not serve the fix yet" for a long-shipped fix', () => {
    const proof = buildDeployProof(
      input({ deploy: { deployAt: Date.parse('2026-08-27T10:00:00.000Z'), deploySha: 'later00' } }),
    );
    expect(proof?.servesFix).toBe(true);
    expect(proof?.gap).not.toBe('Merged, but production does not serve the fix yet.');
  });

  it('proves the fix once the post-deploy window passes with no recurrence', () => {
    const deployAt = NOW - PRODUCTION_PROOF_WINDOW_MS - 1000;
    const proof = buildDeployProof(
      input({
        deploy: { deployAt, deploySha: 'abc1234def5678' },
        lastSeen: new Date(deployAt - 3600_000).toISOString(),
      }),
    );
    expect(proof?.sufficientProof).toBe(true);
    expect(proof?.gap).toBeNull();
  });

  it('withholds proof while the window is still immature', () => {
    const deployAt = NOW - 3600_000;
    const proof = buildDeployProof(
      input({
        deploy: { deployAt, deploySha: 'abc1234def5678' },
        lastSeen: new Date(deployAt - 3600_000).toISOString(),
      }),
    );
    expect(proof?.sufficientProof).toBe(false);
    expect(proof?.gap).toBe('Live, but not enough post-deploy evidence to close.');
  });

  it('refuses proof when the fault fired again after the deploy', () => {
    const deployAt = NOW - PRODUCTION_PROOF_WINDOW_MS - 1000;
    const proof = buildDeployProof(
      input({
        deploy: { deployAt, deploySha: 'abc1234def5678' },
        lastSeen: new Date(deployAt + 60_000).toISOString(),
      }),
    );
    expect(proof?.sufficientProof).toBe(false);
    expect(proof?.gap).toBe('The fault fired again after the fix went live.');
  });

  it('reports unreadable deploy state as unknown rather than unshipped', () => {
    const proof = buildDeployProof(input({ deploy: { deployAt: null, deploySha: null } }));
    expect(proof?.servesFix).toBeNull();
    expect(proof?.sufficientProof).toBeNull();
    expect(proof?.gap).toBe(
      'Production deploy state could not be read, so shipping cannot be confirmed.',
    );
  });
});
