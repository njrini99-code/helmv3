/**
 * What this browser session knows of a saved plan, by its event: the plan's id and stored version. A redraft is the same plan's next version (S-ASKD),
 * so the next card saves over it with the version the last save returned. A plan not saved here has no entry, and its first save sends a null version.
 */
export interface SavedPlanRef {
  planId: string;
  version: number;
}

const known = new Map<string, SavedPlanRef>();

export const savedPlanFor = (key: string): SavedPlanRef | null => known.get(key) ?? null;
export const rememberSavedPlan = (key: string, ref: SavedPlanRef): void => void known.set(key, ref);
export const forgetSavedPlan = (key: string): void => void known.delete(key);

/** What Publish says in the thread. The save ran in the browser, so this is how the model learns the id and version `publish_practice_plan` needs. */
export const publishRequest = (title: string, ref: SavedPlanRef): string => `Publish the plan ${title}. plan_id ${ref.planId}, version ${ref.version}.`;
