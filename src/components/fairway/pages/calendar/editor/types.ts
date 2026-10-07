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
  /** The calendar page merges the roster with the organisation's coaches and
   *  tags each row. Only players can be invited: attendance references
   *  `golf_players`, so a coach id can never be saved as an attendee. */
  role?: 'coach' | 'player';
}
