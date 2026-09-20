import { describe, expect, it } from 'vitest';
import corpus from '@/test/fixtures/course-geometry/factory/catalog-invariants.json';
import { scorecardProfileSchema } from '../catalog';

describe('shared Python/TypeScript scorecard contract', () => {
  for (const fixture of corpus.cases) it(fixture.name, () => {
    const card = structuredClone(corpus.base);
    for (const change of fixture.changes) {
      let target: unknown = card;
      for (const key of change.path.slice(0, -1)) target = (target as Record<string, unknown>)[key];
      const parent = target as Record<string, unknown>;
      const key = change.path.at(-1)!;
      if ('remove' in change && change.remove) delete parent[key];
      else parent[key] = 'repeat' in change ? change.repeat!.repeat(change.count!) : 'value' in change ? change.value : undefined;
    }
    expect(scorecardProfileSchema.safeParse(card).success).toBe(fixture.valid);
  });
});
