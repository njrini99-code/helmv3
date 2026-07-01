'use client';

/**
 * ============================================================================
 * TasksFairway — Fairway (warm-premium) presentation of the baseball Tasks
 * page. Phase B leaf migration, Wave 1 · tasks. Flag-gated behind
 * `isRedesignEnabled()` — see the page fork.
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Receives the SAME computed state + handlers the page owns
 * (tasks, filter, loading, overdue count, create-modal state, and the fetch
 * refresh) and migrates the CHROME — header + create action, overdue notice,
 * filter tabs, empty/loading states — to `@/components/fairway` primitives.
 *
 * The task list + create modal (`TasksList`, `CreateTaskModal`) are reused
 * verbatim inside the new frame per playbook §3.5 — they keep every server
 * action (task completion, creation) they already owned. No data path is
 * touched here. Reused-component prop types are borrowed via `ComponentProps`
 * so this stays in lockstep with them.
 * ========================================================================== */

import type { ComponentProps } from 'react';
import { ClipboardList } from 'lucide-react';
import {
  ViewHeader,
  Segmented,
  Button,
  EmptyState,
  InlineNotice,
  SkeletonCard,
} from '@/components/fairway';
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
      <ViewHeader
        title="Tasks"
        description={isCoach ? 'Create and manage team tasks' : 'Your assigned tasks'}
        primaryAction={
          isCoach && selectedTeamId ? (
            <Button variant="primary" size="sm" onClick={() => onShowCreateModal(true)}>
              Create task
            </Button>
          ) : undefined
        }
      />

      {overdueCount > 0 && !loading && (
        <InlineNotice
          tone="warning"
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
          <EmptyState
            icon={ClipboardList}
            title="No team selected"
            description="Select a team from the sidebar to view tasks."
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

export default TasksFairway;
