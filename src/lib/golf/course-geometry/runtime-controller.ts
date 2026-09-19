import { planArtifactResidency, type ArtifactResidencyOptions, type ArtifactResidencyPlan, type HoleArtifactBytes } from './artifact-residency';
import type { Point3M, TerrainCamera } from './terrain';
import type { V2BudgetTier } from './v2-budgets';

/** Camera updates are presentation-only and do not enter React's shot state.
 * The GPU surface and its evidence overlay are painted by this one controller. */
export interface TerrainRuntimeController {
  setCamera(camera: TerrainCamera, width: number, height: number): void;
  /** Read-only terrain inspection; never records a ball, pin or edited source. */
  pick(screenX: number, screenY: number): Point3M | null;
}

/** Task 19 (V2 plan §86-89): the pure call a multi-hole lifecycle owner makes
 * at a hole transition to decide which holes' V2 artifacts to keep at full
 * detail versus drop to LOD2-only. `TerrainRuntimeController` above is
 * per-hole (see `three-renderer.ts`'s `ThreeTerrainRuntime`, rebuilt on every
 * hole change — CourseTerrainCanvas.test.tsx), so this residency decision
 * does not belong on that interface; it is reached through this module
 * instead, which owns no fetch/dispose side effects itself — the concrete
 * runtime that already owns load/dispose lifecycle acts on the plan. A
 * named re-export of `artifact-residency.ts`'s policy so a caller can reach
 * it from the runtime-controller module without knowing the policy lives in
 * a separate file. */
export function computeArtifactResidency(
  currentHole: string,
  holesInOrder: readonly string[],
  bytesPerHole: Readonly<Record<string, HoleArtifactBytes>>,
  tier: V2BudgetTier,
  options?: ArtifactResidencyOptions,
): ArtifactResidencyPlan {
  return planArtifactResidency(currentHole, holesInOrder, bytesPerHole, tier, options);
}
