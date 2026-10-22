// scripts/regen-resolve.mjs resolves conflicts in generated files by regenerating them (2026-10-21: they conflicted on nearly every
// merge of parallel branches). The plan decides which generators run and refuses one whose hand-written input is still conflicted.
import { describe, expect, it } from 'vitest';
import { GENERATED, planResolve } from '../regen-resolve.mjs';

const cmd = (plan) => plan.generators.map((g) => g.cmd.join(' '));

describe('planResolve', () => {
  it('maps each conflicted generated file to its generator, once, and leaves the rest for a hand merge', () => {
    const plan = planResolve([
      'docs/generated/WORLD_MODEL.json',
      'docs/generated/WORLD_MODEL.md',
      'src/clubhouse/preview/component-catalog.json',
      'src/clubhouse/screens/Home.tsx',
    ]);
    expect(plan.generated).toEqual(['docs/generated/WORLD_MODEL.json', 'docs/generated/WORLD_MODEL.md', 'src/clubhouse/preview/component-catalog.json']);
    expect(plan.other).toEqual(['src/clubhouse/screens/Home.tsx']);
    expect(cmd(plan)).toEqual(['node scripts/clubhouse/component-catalog.mjs', 'node scripts/knowledge/world-model.mjs']);
    expect(plan.blocked).toEqual([]);
  });

  it('runs the document inventory last, since it counts the other generated docs', () => {
    const plan = planResolve(['docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md', 'docs/generated/HELM_FEATURE_MAP.md', 'docs/generated/WORLD_MODEL.json']);
    expect(cmd(plan).at(-1)).toBe('node scripts/knowledge/document-inventory.mjs');
  });

  it('refuses the Clubhouse registry sync while the Bridge contracts it reads are still conflicted', () => {
    const plan = planResolve(['docs/clubhouse/generated/CLUBHOUSE_BRIDGE_MAP.md', 'config/clubhouse/bridge-contracts.json']);
    expect(plan.blocked).toEqual([{ cmd: 'node scripts/clubhouse/registry.mjs sync', input: 'config/clubhouse/bridge-contracts.json' }]);
  });

  it('the flag registry waits for config/feature-flags.yml the same way', () => {
    expect(planResolve(['src/lib/flags/registry.generated.ts', 'config/feature-flags.yml']).blocked).toHaveLength(1);
    expect(planResolve(['src/lib/flags/registry.generated.ts']).blocked).toEqual([]);
  });

  it('hand-written files that sit beside generated ones are never treated as generated', () => {
    for (const p of ['docs/clubhouse/pages/P013-coachhelm/CONTRACT.md', 'docs/clubhouse/CHANGELOG.md', 'src/lib/flags/registry.ts', 'docs/generated-notes.md']) {
      expect(GENERATED.some((g) => g.match(p)), p).toBe(false);
    }
  });
});
