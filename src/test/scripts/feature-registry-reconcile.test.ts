// The crosswalk between the two feature maps, and what it refuses.
//
// memory/registry.yml owns semantic identity; src/lib/admin/feature-registry.ts
// owns the runtime FeatureKey vocabulary written into admin_events.feature.
// Measured 2026-08-30 the relationship is 87 keys to 20 features, so a
// one-to-one identity was never available and merging them was never an option.
//
// The crosswalk is DECLARED rather than derived, and that is the interesting
// part. Deriving it from action-file overlap was tried first: 28 of 39
// golf/coachhelm keys came back owned by three or more features, because shared
// modules like src/app/golf/actions/golf.ts legitimately appear in many
// features' code blocks. Ownership is a judgement about which doc DESCRIBES a
// surface, and judgements get written down.
//
// What these tests pin is the refusal set. Every one of them is a way a key
// could go unowned silently, which is the failure the reconciliation removes.

import { describe, it, expect } from 'vitest';
import { reconcile } from '../../../scripts/knowledge/lib/feature-registry-reconcile';

const KEYS = new Set(['round_tracking', 'my_qualifiers', 'qualifiers', 'integrations']);

const ok = {
  features: {
    golf_round_lifecycle: {
      criticality: 'high',
      observability: { feature_keys: ['round_tracking'] },
    },
    qualifiers: {
      criticality: 'high',
      observability: { feature_keys: ['qualifiers', 'my_qualifiers'] },
    },
  },
  observability_keys_unowned: {
    integrations: { classification: 'platform', reason: 'Inngest job execution.' },
  },
};

const kinds = (reg: unknown) => reconcile(reg as never, KEYS).map((p) => p.kind);

describe('feature-registry reconciliation', () => {
  it('accepts a registry where every key has exactly one owner or a classification', () => {
    expect(reconcile(ok as never, KEYS)).toEqual([]);
  });

  it('refuses a runtime key that nobody owns and nobody classified', () => {
    // The default failure. A key missing from every list is indistinguishable
    // from an oversight, which is the point of failing on it.
    const reg = { ...ok, observability_keys_unowned: {} };
    expect(kinds(reg)).toContain('UNCLASSIFIED_FEATURE_KEY');
  });

  it('refuses a mapped key that does not exist in the runtime registry', () => {
    const reg = {
      ...ok,
      features: {
        ...ok.features,
        qualifiers: { criticality: 'high', observability: { feature_keys: ['qualifiers', 'ghost_key'] } },
      },
    };
    expect(kinds(reg)).toContain('PHANTOM_FEATURE_KEY');
  });

  it('refuses the same key claimed by two features — one owner per key', () => {
    const reg = {
      ...ok,
      features: {
        ...ok.features,
        golf_round_lifecycle: {
          criticality: 'high',
          observability: { feature_keys: ['round_tracking', 'qualifiers'] },
        },
      },
    };
    expect(kinds(reg)).toContain('CONTESTED_FEATURE_KEY');
  });

  it('refuses a feature with no observability decision at all', () => {
    const reg = { ...ok, features: { ...ok.features, shot_tracking: { criticality: 'high' } } };
    expect(kinds(reg)).toContain('NO_OBSERVABILITY_DECISION');
  });

  it('accepts zero coverage WITH a reason — that is a recorded limit, not a gap', () => {
    // shot_tracking really does own no key: shot entry is instrumented as part
    // of round_tracking. Saying so is the honest outcome; inventing a key to
    // make a table look complete is not.
    const reg = {
      ...ok,
      features: {
        ...ok.features,
        shot_tracking: {
          criticality: 'high',
          observability: {
            feature_keys: [],
            covered_by: 'golf_round_lifecycle',
            reason: 'Instrumented as part of round_tracking.',
          },
        },
      },
    };
    expect(reconcile(reg as never, KEYS)).toEqual([]);
  });

  it('refuses zero coverage WITHOUT a reason', () => {
    const reg = {
      ...ok,
      features: { ...ok.features, shot_tracking: { criticality: 'high', observability: { feature_keys: [] } } },
    };
    expect(kinds(reg)).toContain('UNEXPLAINED_ZERO_COVERAGE');
  });

  it('refuses a covered_by that names something outside the registry', () => {
    const reg = {
      ...ok,
      features: {
        ...ok.features,
        shot_tracking: {
          criticality: 'high',
          observability: { feature_keys: [], covered_by: 'not_a_feature', reason: 'x' },
        },
      },
    };
    expect(kinds(reg)).toContain('UNKNOWN_COVERED_BY');
  });

  it('refuses an unowned entry with an unrecognised classification', () => {
    const reg = {
      ...ok,
      observability_keys_unowned: { integrations: { classification: 'probably_fine', reason: 'x' } },
    };
    expect(kinds(reg)).toContain('BAD_CLASSIFICATION');
  });

  it('refuses an unowned entry with no reason — "probably fine" is not a state', () => {
    const reg = { ...ok, observability_keys_unowned: { integrations: { classification: 'platform' } } };
    expect(kinds(reg)).toContain('UNEXPLAINED_UNOWNED_KEY');
  });

  it('refuses a key that is both owned and listed as unowned', () => {
    const reg = {
      ...ok,
      observability_keys_unowned: {
        ...ok.observability_keys_unowned,
        round_tracking: { classification: 'platform', reason: 'x' },
      },
    };
    expect(kinds(reg)).toContain('OWNED_AND_UNOWNED');
  });

  it('refuses an unowned entry naming a key the runtime does not have', () => {
    const reg = {
      ...ok,
      observability_keys_unowned: {
        ...ok.observability_keys_unowned,
        ghost: { classification: 'excluded', reason: 'x' },
      },
    };
    expect(kinds(reg)).toContain('PHANTOM_UNOWNED_KEY');
  });

  it('refuses a malformed feature_keys value rather than coercing it', () => {
    const reg = {
      ...ok,
      features: { ...ok.features, qualifiers: { criticality: 'high', observability: { feature_keys: 'qualifiers' } } },
    };
    expect(kinds(reg)).toContain('MALFORMED_OBSERVABILITY');
  });
});
