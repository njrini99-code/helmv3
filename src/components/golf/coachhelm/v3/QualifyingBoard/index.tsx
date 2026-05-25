/**
 * QualifyingBoard — top-level orchestrator for the W29 selection
 * workspace. Server component; renders a state header, the leaderboard
 * with top-N lock indicators, and the coach-pick panel.
 */

import type { QualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/types';
import { SelectionStateBar } from './SelectionStateBar';
import { LeaderboardWithSlots } from './LeaderboardWithSlots';
import { CoachPickPanel } from './CoachPickPanel';

export function QualifyingBoard({ workspace }: { workspace: QualifyingWorkspace }) {
  return (
    <div className="space-y-6">
      <header className="surface-stone rounded-3xl p-6 md:p-8">
        <p className="text-sm text-warm-500 mb-2">Selection workspace</p>
        <h1 className="text-2xl md:text-3xl font-medium text-warm-900 tracking-tight">
          {workspace.name}
        </h1>
        <p className="text-sm text-warm-600 mt-2">
          {workspace.selection_slots_total} spots ·{' '}
          {workspace.selection_slots_total - workspace.selection_slots_coach_pick}{' '}
          top score · {workspace.selection_slots_coach_pick} coach{' '}
          {workspace.selection_slots_coach_pick === 1 ? 'pick' : 'picks'}
        </p>
      </header>

      <SelectionStateBar
        qualifierId={workspace.qualifier_id}
        state={workspace.selection_state}
        canConfirm={workspace.coach_picks_complete}
      />

      <LeaderboardWithSlots
        candidates={workspace.candidates}
        topNCount={
          workspace.selection_slots_total - workspace.selection_slots_coach_pick
        }
      />

      <CoachPickPanel
        qualifierId={workspace.qualifier_id}
        candidates={workspace.candidates}
        slotsCoachPick={workspace.selection_slots_coach_pick}
        state={workspace.selection_state}
      />
    </div>
  );
}
