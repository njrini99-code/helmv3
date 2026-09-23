/**
 * Small shared types for the event editor's `editor/**` modules.
 *
 * Pulled out on their own so `FairwayEventEditor.tsx` (the orchestrator) and
 * every extracted module can import the same shape without a circular
 * import between the orchestrator and its own children.
 */

export interface TeamPlayer {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}
