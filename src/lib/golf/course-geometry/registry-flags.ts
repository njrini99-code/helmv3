import 'server-only';
import { evaluateFlag } from '@/lib/flags/is-enabled';
import { COURSE_GEOMETRY_REGISTRY } from './course-registry';

/** D3: the round pages' server-side half of "shared flag plus per-course
 * approval". Evaluates every distinct geometry/sync flag the registry names
 * — once per request, server-only — into a `layoutId -> {geometry, sync}`
 * map the client hook (`useOneTapLiveRoundState`'s `flagsByLayout`) looks up
 * by the round's resolved layout. A layout the registry lacks is simply
 * absent from the map, which the hook already treats as `false` for both. */
export function evaluateCourseGeometryFlags(registry: readonly { layoutId: string; geometryFeatureFlag: string; syncFeatureFlag: string | null }[] = COURSE_GEOMETRY_REGISTRY): Record<string, { geometry: boolean; sync: boolean }> {
  const flags: Record<string, { geometry: boolean; sync: boolean }> = {};
  for (const policy of registry) {
    flags[policy.layoutId] = {
      geometry: evaluateFlag(policy.geometryFeatureFlag).value,
      sync: policy.syncFeatureFlag ? evaluateFlag(policy.syncFeatureFlag).value : false,
    };
  }
  return flags;
}
