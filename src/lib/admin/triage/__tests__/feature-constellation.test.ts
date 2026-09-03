import { describe, it, expect } from 'vitest';
import { buildFeatureConstellation } from '../feature-constellation';
import type { FeatureHealth } from '@/lib/admin/data/feature-health';
import type { FeatureDef } from '@/lib/admin/feature-registry';

function featureHealth(overrides: Partial<FeatureHealth> = {}): FeatureHealth {
  return {
    key: 'round_tracking' as FeatureHealth['key'],
    app: 'golfhelm',
    label: 'Round Tracking',
    status: 'green',
    trend: 'flat',
    reason: 'No signal.',
    summary: 'Healthy.',
    topSignatures: [],
    drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: 2 },
    healthSignal: 'ok',
    knownGaps: [],
    ...overrides,
  } as FeatureHealth;
}

function featureDef(overrides: Partial<FeatureDef> = {}): FeatureDef {
  return {
    key: 'round_tracking' as FeatureDef['key'],
    label: 'Round Tracking',
    app: 'golfhelm',
    actions: {},
    primaryTable: 'golf_rounds',
    heartbeatTable: 'golf_rounds',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'ok',
    ...overrides,
  } as FeatureDef;
}

describe('buildFeatureConstellation', () => {
  it('builds one node per feature with a real, labelled size proxy', () => {
    const view = buildFeatureConstellation(
      [
        featureHealth({
          topSignatures: [
            { fingerprint: 'a', title: 'x', count: 5, firstSeen: '', lastSeen: '', severity: 'error' },
            { fingerprint: 'b', title: 'y', count: 3, firstSeen: '', lastSeen: '', severity: 'error' },
          ],
        }),
      ],
      [],
    );
    expect(view.nodes).toHaveLength(1);
    expect(view.nodes[0]!.signalVolume).toBe(8);
    expect(view.nodes[0]!.activeIncidentSignatures).toBe(2);
  });

  it('a feature with no top signatures gets zero volume, not an omitted node', () => {
    const view = buildFeatureConstellation([featureHealth({ topSignatures: [] })], []);
    expect(view.nodes[0]!.signalVolume).toBe(0);
  });

  it('draws an edge only between features that genuinely share a table', () => {
    const registry = [
      featureDef({ key: 'round_tracking' as FeatureDef['key'], primaryTable: 'golf_rounds', heartbeatTable: 'golf_rounds' }),
      featureDef({ key: 'stats' as FeatureDef['key'], primaryTable: 'golf_rounds', heartbeatTable: null }),
      featureDef({ key: 'qualifiers' as FeatureDef['key'], primaryTable: 'golf_qualifiers', heartbeatTable: null }),
    ];
    const view = buildFeatureConstellation([], registry);
    expect(view.edges).toHaveLength(1);
    expect(view.edges[0]).toEqual({ source: 'round_tracking', target: 'stats', sharedTable: 'golf_rounds' });
    expect(view.edgeSource).toBe('shared-table');
  });

  it('reports edgeSource "none" honestly when nothing shares a table — never fabricates one', () => {
    const registry = [
      featureDef({ key: 'round_tracking' as FeatureDef['key'], primaryTable: 'golf_rounds', heartbeatTable: null }),
      featureDef({ key: 'billing' as FeatureDef['key'], primaryTable: 'billing_invoices', heartbeatTable: null }),
    ];
    const view = buildFeatureConstellation([], registry);
    expect(view.edges).toEqual([]);
    expect(view.edgeSource).toBe('none');
  });

  it('a feature with both tables null contributes no edges but is not excluded from nodes', () => {
    const registry = [
      featureDef({ key: 'a' as FeatureDef['key'], primaryTable: null, heartbeatTable: null }),
      featureDef({ key: 'b' as FeatureDef['key'], primaryTable: null, heartbeatTable: null }),
    ];
    const view = buildFeatureConstellation([featureHealth({ key: 'a' as FeatureHealth['key'] })], registry);
    expect(view.nodes).toHaveLength(1);
    expect(view.edges).toEqual([]);
  });
});
