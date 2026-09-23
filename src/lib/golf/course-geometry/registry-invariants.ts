import type { LayoutManifest } from './catalog';
import type { CourseGeometryPolicy } from './course-policy';

/** Cross-policy invariants the generated registry must hold, independent of
 * how it was built (hand-written or hydrated from JSON). Shared by the
 * generator's `--check` and the registry test so both fail on the same
 * drift. Returns every problem; an empty list is a consistent registry. */
export function checkRegistryInvariants(policies: readonly CourseGeometryPolicy[], catalogLayouts: readonly Pick<LayoutManifest, 'layoutId' | 'name'>[]): string[] {
  const problems: string[] = [];
  const layoutIds = policies.map(p => p.layoutId);
  if (new Set(layoutIds).size !== layoutIds.length) problems.push('duplicate layoutId in registry');
  const dbCourseIds = policies.flatMap(p => [...p.dbCourseIds]);
  if (new Set(dbCourseIds).size !== dbCourseIds.length) problems.push('duplicate dbCourseId across registry policies');
  const namesById = new Map(catalogLayouts.map(l => [l.layoutId, l.name]));
  for (const policy of policies) {
    const ownName = namesById.get(policy.layoutId);
    if (ownName !== undefined && !policy.courseNamePatterns.some(p => p.test(ownName))) {
      problems.push(`registry ${policy.layoutId}: no courseNamePattern matches its own catalog name ${JSON.stringify(ownName)}`);
    }
    for (const layout of catalogLayouts) {
      if (layout.layoutId === policy.layoutId) continue;
      if (policy.courseNamePatterns.some(p => p.test(layout.name))) {
        problems.push(`registry ${policy.layoutId}: a courseNamePattern matches sister layout ${layout.layoutId}'s catalog name ${JSON.stringify(layout.name)}`);
      }
    }
  }
  return problems;
}
