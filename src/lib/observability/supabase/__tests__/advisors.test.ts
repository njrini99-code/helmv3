import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetSupabaseAdvisorsCacheForTests,
  dedupeAdvisorFindings,
  fetchSupabaseAdvisors,
  normalizeAdvisorLints,
  type AdvisorFinding,
} from '../advisors';

describe('normalizeAdvisorLints', () => {
  it('derives object from schema + name', () => {
    const [finding] = normalizeAdvisorLints(
      'security',
      [{ name: 'rls_disabled', level: 'ERROR', metadata: { schema: 'public', name: 'golf_shots' } }],
      '2026-09-03T12:00:00.000Z',
    ) as [AdvisorFinding];
    expect(finding.object).toBe('public.golf_shots');
    expect(finding.advisorType).toBe('security');
    expect(finding.featureMapping).toBeNull();
    expect(finding.status).toBe('open');
  });

  it('falls back to entity, then bare name, then null', () => {
    const [byEntity] = normalizeAdvisorLints('performance', [{ name: 'x', metadata: { entity: 'some_function()' } }], 'now') as [
      AdvisorFinding,
    ];
    expect(byEntity.object).toBe('some_function()');

    const [byName] = normalizeAdvisorLints('performance', [{ name: 'x', metadata: { name: 'bare' } }], 'now') as [AdvisorFinding];
    expect(byName.object).toBe('bare');

    const [none] = normalizeAdvisorLints('performance', [{ name: 'x' }], 'now') as [AdvisorFinding];
    expect(none.object).toBeNull();
  });

  it('falls back to title when name is absent, and UNKNOWN when level is absent', () => {
    const [finding] = normalizeAdvisorLints('security', [{ title: 'Some Title' }], 'now') as [AdvisorFinding];
    expect(finding.name).toBe('Some Title');
    expect(finding.level).toBe('UNKNOWN');
  });

  it('stamps every finding with the supplied firstSeen (this run), never the API', () => {
    const findings = normalizeAdvisorLints('security', [{ name: 'a' }, { name: 'b' }], '2026-09-03T00:00:00.000Z');
    expect(findings.every((f) => f.firstSeen === '2026-09-03T00:00:00.000Z')).toBe(true);
  });
});

describe('dedupeAdvisorFindings', () => {
  function finding(overrides: Partial<AdvisorFinding> = {}): AdvisorFinding {
    return {
      advisorType: 'security',
      name: 'rls_disabled',
      level: 'ERROR',
      object: 'public.golf_shots',
      featureMapping: null,
      firstSeen: '2026-09-03T00:00:00.000Z',
      status: 'open',
      ...overrides,
    };
  }

  it('dedupes exact (advisorType, name, object) repeats, keeping the first', () => {
    const result = dedupeAdvisorFindings([finding(), finding({ level: 'WARN' })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.level).toBe('ERROR');
  });

  it('keeps findings distinct by object even with the same name/type', () => {
    const result = dedupeAdvisorFindings([finding({ object: 'public.golf_shots' }), finding({ object: 'public.golf_rounds' })]);
    expect(result).toHaveLength(2);
  });

  it('keeps findings distinct by advisorType even with the same name/object', () => {
    const result = dedupeAdvisorFindings([finding({ advisorType: 'security' }), finding({ advisorType: 'performance' })]);
    expect(result).toHaveLength(2);
  });
});

describe('fetchSupabaseAdvisors — unconfigured path (no network)', () => {
  const originalToken = process.env.SUPABASE_ACCESS_TOKEN;
  const originalRef = process.env.SUPABASE_PROJECT_REF;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    __resetSupabaseAdvisorsCacheForTests();
    delete process.env.SUPABASE_ACCESS_TOKEN;
    delete process.env.SUPABASE_PROJECT_REF;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  afterEach(() => {
    for (const [key, value] of [
      ['SUPABASE_ACCESS_TOKEN', originalToken],
      ['SUPABASE_PROJECT_REF', originalRef],
      ['NEXT_PUBLIC_SUPABASE_URL', originalUrl],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __resetSupabaseAdvisorsCacheForTests();
  });

  it('returns an empty findings list with sourceStatus unconfigured — never a fabricated clean bill', async () => {
    const result = await fetchSupabaseAdvisors(0);
    expect(result.sourceStatus).toBe('unconfigured');
    expect(result.findings).toEqual([]);
  });

  it('caches the unconfigured result for 10 minutes', async () => {
    const first = await fetchSupabaseAdvisors(0);
    const second = await fetchSupabaseAdvisors(9 * 60_000);
    expect(second).toBe(first);
    const third = await fetchSupabaseAdvisors(11 * 60_000);
    expect(third).not.toBe(first);
  });
});
