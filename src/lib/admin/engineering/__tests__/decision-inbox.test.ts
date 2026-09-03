import { describe, it, expect, vi } from 'vitest';
import { buildDecisionInbox } from '@/lib/admin/engineering/decision-inbox';

const HELD_MD =
  '| migration | status | why | decided |\n|---|---|---|---|\n' +
  '| `20260101000000_a.sql` | **HOLD** | Draft. | 2026-01-01 |\n';

const SAMPLE_FINDING = {
  id: 'duplicate_helpers-1',
  class: 'duplicate_helpers',
  scope: 'src/lib/foo.ts',
  reason: '[duplicate_helpers] two copies of formatDate',
  closes_when: 'PR merging the two',
  confidence: 'high',
  size_of_change: 'small',
};

const JANITOR_JSON = {
  generated_at: '2026-09-01T00:00:00Z',
  classes: [{ classId: 'duplicate_helpers', evidenceCommand: 'node scripts/janitor/run.mjs' }],
  findings: [SAMPLE_FINDING],
};

describe('buildDecisionInbox', () => {
  it('returns held-migration items when only HELD.md is available', () => {
    const items = buildDecisionInbox({ heldMarkdown: HELD_MD, janitorFindings: null, now: Date.now() });
    expect(items).toHaveLength(1);
    expect(items[0]?.reason).toBe('held-migration');
    expect(items[0]?.headline).toContain('20260101000000_a.sql');
  });

  it('returns janitor-finding items when only the findings file is available', () => {
    const items = buildDecisionInbox({ heldMarkdown: null, janitorFindings: JANITOR_JSON, now: Date.now() });
    expect(items).toHaveLength(1);
    expect(items[0]?.reason).toBe('janitor-finding');
    expect(items[0]?.evidenceCommand).toBe('node scripts/janitor/run.mjs');
  });

  it('composes both sources, held migrations first', () => {
    const items = buildDecisionInbox({ heldMarkdown: HELD_MD, janitorFindings: JANITOR_JSON, now: Date.now() });
    expect(items.map((i) => i.reason)).toEqual(['held-migration', 'janitor-finding']);
  });

  it('caps the number of Janitor findings surfaced', () => {
    const many = {
      ...JANITOR_JSON,
      findings: Array.from({ length: 25 }, (_, i) => ({ ...SAMPLE_FINDING, id: `f-${i}` })),
    };
    const items = buildDecisionInbox({ heldMarkdown: null, janitorFindings: many, now: Date.now(), janitorLimit: 5 });
    expect(items).toHaveLength(5);
  });

  it('returns an empty list when neither source is available', () => {
    expect(buildDecisionInbox({ heldMarkdown: null, janitorFindings: null, now: Date.now() })).toEqual([]);
  });

  it('sources are disjoint from incident/self-heal data: every item comes only from held-migration or janitor-finding', () => {
    const items = buildDecisionInbox({ heldMarkdown: HELD_MD, janitorFindings: JANITOR_JSON, now: Date.now() });
    for (const item of items) {
      expect(['held-migration', 'janitor-finding']).toContain(item.reason);
    }
  });
});

describe('fetchDecisionInbox', () => {
  it('discloses a gap (unconfigured) rather than reporting zero decisions when both sources are unreadable', async () => {
    vi.resetModules();
    vi.doMock('node:fs/promises', () => ({ readFile: vi.fn().mockRejectedValue(new Error('ENOENT')) }));
    const { fetchDecisionInbox } = await import('@/lib/admin/engineering/decision-inbox');
    const result = await fetchDecisionInbox();
    expect(result.status).toBe('unconfigured');
    vi.doUnmock('node:fs/promises');
    vi.resetModules();
  });
});
