'use client';

/**
 * ============================================================================
 * TasksFairway — "The Living Annual" presentation of the baseball Tasks page
 * (spec: docs/baseball/design-system-living-annual.md; map: docs/baseball/
 * ui-migration-map.md "announcements,tasks,documents,travel,messages/[id]" row
 * — `SectionMasthead` + `PaperCard` + `EditorsLetter` consistency pass).
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Receives the SAME computed state + handlers the page owns
 * (tasks, filter, loading, overdue count, create-modal state, and the fetch
 * refresh) and re-skins the chrome — masthead + create action, overdue alert,
 * filter tabs, empty/loading states — with the Living-Annual kit. No data path
 * is touched here.
 *
 * The task list + create modal (`TasksList`, `CreateTaskModal`) are reused
 * verbatim inside the new frame — they keep every server action (task
 * completion, creation) they already owned, plus their own honest per-filter
 * empty row (out of this task's file scope). Reused-component prop types are
 * borrowed via `ComponentProps` so this stays in lockstep with them.
 *
 * LIVE ALERT, not an empty state: the overdue-task notice is real, present-tense
 * information about existing tasks — never routed through `<EmptyIssue>` (which
 * is reserved for the zero/nothing-here case). It stays an assertive, dismissed-
 * by-navigation `role="alert"` banner in the danger (red) tone — never the amber
 * `warning` tone, which this kit reserves for softer cautions.
 * ========================================================================== */

import type { ComponentProps } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button, Segmented, InlineNotice, SkeletonCard } from '@/components/fairway';
import { SectionMasthead, EditorsLetter } from '@/components/baseball/living-annual';
import { TasksList } from './TasksList';
import { CreateTaskModal } from './CreateTaskModal';

type TasksListProps = ComponentProps<typeof TasksList>;
type CreateModalProps = ComponentProps<typeof CreateTaskModal>;
type FilterType = TasksListProps['filter'];

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
];

export interface TasksFairwayProps {
  tasks: TasksListProps['tasks'];
  filter: FilterType;
  onFilterChange: (f: FilterType) => void;
  isCoach: boolean;
  currentPlayerId: TasksListProps['currentPlayerId'];
  selectedTeamId: string | null;
  loading: boolean;
  overdueCount: number;
  players: CreateModalProps['players'];
  showCreateModal: boolean;
  onShowCreateModal: (open: boolean) => void;
  onRefresh: TasksListProps['onRefresh'];
}

export function TasksFairway({
  tasks,
  filter,
  onFilterChange,
  isCoach,
  currentPlayerId,
  selectedTeamId,
  loading,
  overdueCount,
  players,
  showCreateModal,
  onShowCreateModal,
  onRefresh,
}: TasksFairwayProps) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8">
      <SectionMasthead
        eyebrow={isCoach ? 'Team tasks' : 'Your assignments'}
        title="Tasks"
        actions={
          isCoach && selectedTeamId ? (
            <Button variant="primary" size="sm" onClick={() => onShowCreateModal(true)}>
              Create task
            </Button>
          ) : undefined
        }
      >
        <p className="max-w-prose font-annual text-body text-text-secondary">
          {isCoach ? 'Create and manage team tasks.' : 'Everything assigned to you, in one board.'}
        </p>
      </SectionMasthead>

      {/* LIVE alert — real overdue tasks exist right now. Never demoted to an
          <EmptyIssue> composed letter; stays an assertive danger-tone banner. */}
      {overdueCount > 0 && !loading && (
        <InlineNotice
          tone="danger"
          icon={AlertCircle}
          title={`${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''}`}
          className="mt-6"
          action={
            <Button variant="ghost" size="sm" onClick={() => onFilterChange('overdue')}>
              View overdue
            </Button>
          }
        >
          {isCoach
            ? 'Some assigned tasks are past their due date.'
            : 'You have tasks past their due date.'}
        </InlineNotice>
      )}

      {!loading && tasks.length > 0 && (
        <div className="mt-6">
          <Segmented<FilterType>
            size="sm"
            aria-label="Filter tasks"
            value={filter}
            onValueChange={onFilterChange}
            options={FILTER_OPTIONS}
          />
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : !selectedTeamId ? (
          <EditorsLetter
            ink="team"
            title="No team selected."
            body="Choose a team from the sidebar to see its task board."
          />
        ) : (
          <TasksList
            tasks={tasks}
            filter={filter}
            isCoach={isCoach}
            currentPlayerId={currentPlayerId}
            onRefresh={onRefresh}
          />
        )}
      </div>

      {isCoach && selectedTeamId && (
        <CreateTaskModal
          isOpen={showCreateModal}
          onClose={() => onShowCreateModal(false)}
          onTaskCreated={onRefresh}
          teamId={selectedTeamId}
          players={players}
        />
      )}
    </div>
  );
}
