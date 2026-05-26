/**
 * QualifyingBoard — top-level orchestrator for the W29 selection
 * workspace. Server component; renders a state header, the leaderboard
 * with top-N lock indicators, and the coach-pick panel.
 *
 * Premium polish: editorial eyebrow style + Reveal stagger across the
 * 4 sections so the workspace assembles itself rather than appearing.
 */

import type { QualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/types';
import { Reveal } from '@/components/ui/reveal';
import { SelectionStateBar } from './SelectionStateBar';
import { LeaderboardWithSlots } from './LeaderboardWithSlots';
import { CoachPickPanel } from './CoachPickPanel';

export function QualifyingBoard({ workspace }: { workspace: QualifyingWorkspace }) {
  const topScoreSlots =
    workspace.selection_slots_total - workspace.selection_slots_coach_pick;
  const pickLabel = workspace.selection_slots_coach_pick === 1 ? 'pick' : 'picks';
  return (
    <div className="space-y-6">
      <Reveal>
        <header className="surface-stone rounded-3xl p-6 md:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-warm-500 mb-1.5">
            Selection workspace
          </p>
          <h1 className="text-2xl md:text-3xl font-medium text-warm-900 tracking-tight">
            {workspace.name}
          </h1>
          <p className="text-sm text-warm-600 mt-2.5">
            {workspace.selection_slots_total} spots · {topScoreSlots} top score ·{' '}
            {workspace.selection_slots_coach_pick} coach {pickLabel}
          </p>
        </header>
      </Reveal>

      <Reveal staggerIndex={1}>
        <SelectionStateBar
          qualifierId={workspace.qualifier_id}
          state={workspace.selection_state}
          canConfirm={workspace.coach_picks_complete}
        />
      </Reveal>

      <Reveal staggerIndex={2}>
        <LeaderboardWithSlots candidates={workspace.candidates} topNCount={topScoreSlots} />
      </Reveal>

      <Reveal staggerIndex={3}>
        <CoachPickPanel
          qualifierId={workspace.qualifier_id}
          candidates={workspace.candidates}
          slotsCoachPick={workspace.selection_slots_coach_pick}
          state={workspace.selection_state}
        />
      </Reveal>
    </div>
  );
}
