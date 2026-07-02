'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressTracker } from '@/components/baseball/dev-plans/ProgressTracker';
import { IconCalendar, IconCheck, IconClock, IconNote, IconRotateCcw } from '@/components/icons';
import { getFullName } from '@/lib/utils';
import type { DevPlanGoal, DevPlanWithPlayer, GoalStatus } from '@/lib/baseball/dev-plan-types';

interface PlanDetailProps {
  plan: DevPlanWithPlayer;
  /** Coach marks a goal complete. Omit to render the detail read-only. */
  onComplete?: (goalId: string) => void;
  /** Coach reverts a completed goal back to in-progress. */
  onUncomplete?: (goalId: string) => void;
  /** goalId currently mutating (disables its buttons + shows a pending state). */
  pendingGoalId?: string | null;
}

const getStatusVariant = (status: string | null): 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' => {
  if (!status) return 'secondary';
  const variants: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info'> = {
    draft: 'secondary',
    sent: 'default',
    in_progress: 'primary',
    completed: 'success',
    archived: 'secondary',
  };
  return variants[status] || 'secondary';
};

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const GOAL_STATUS_VARIANT: Record<GoalStatus, 'secondary' | 'primary' | 'success'> = {
  not_started: 'secondary',
  in_progress: 'primary',
  completed: 'success',
};

export function PlanDetail({ plan, onComplete, onUncomplete, pendingGoalId }: PlanDetailProps) {
  const goals: DevPlanGoal[] = Array.isArray(plan.goals) ? plan.goals : [];
  const completedGoals = goals.filter((goal) => goal.status === 'completed').length;
  const playerName = getFullName(plan.player?.first_name, plan.player?.last_name);
  const canManage = Boolean(onComplete && onUncomplete);

  return (
    <div className="space-y-6">
      <Card variant="glass">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={playerName} src={plan.player?.avatar_url || undefined} size="md" />
            <div>
              <p className="text-sm text-warm-500">Development Plan</p>
              <h1 className="text-xl font-semibold text-warm-900">{plan.title}</h1>
              <p className="text-sm text-warm-500 mt-1">
                {playerName} • {plan.player?.primary_position || 'Position N/A'} • Class of {plan.player?.grad_year || '—'}
              </p>
            </div>
          </div>
          <Badge variant={getStatusVariant(plan.status)}>{plan.status || 'Draft'}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProgressTracker completed={completedGoals} total={goals.length} />

          {plan.description && (
            <div className="rounded-xl border border-warm-200 bg-cream-100/75 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-warm-700">
                <IconNote size={16} />
                <span>Plan Overview</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-warm-600">{plan.description}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-warm-500">
            {plan.start_date && (
              <span className="flex items-center gap-1">
                <IconCalendar size={14} />
                Starts {new Date(plan.start_date).toLocaleDateString()}
              </span>
            )}
            {plan.end_date && (
              <span className="flex items-center gap-1">
                <IconClock size={14} />
                Ends {new Date(plan.end_date).toLocaleDateString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card variant="glass">
        <CardHeader>
          <h2 className="font-semibold text-warm-900">Goals & Milestones</h2>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <p className="text-sm text-warm-500">No goals have been added to this plan yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {goals.map((goal) => {
                const isPending = pendingGoalId === goal.id;
                const isCompleted = goal.status === 'completed';
                return (
                  <div key={goal.id} className="rounded-xl border border-warm-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-warm-900">{goal.title}</h3>
                        {goal.description && (
                          <p className="mt-1 text-sm leading-relaxed text-warm-600">{goal.description}</p>
                        )}
                      </div>
                      <Badge variant={GOAL_STATUS_VARIANT[goal.status]} className="flex shrink-0 items-center gap-1">
                        {isCompleted && <IconCheck size={12} />}
                        {GOAL_STATUS_LABEL[goal.status]}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      {goal.target_date ? (
                        <p className="text-xs text-warm-500">
                          Target: {new Date(goal.target_date).toLocaleDateString()}
                        </p>
                      ) : (
                        <span />
                      )}
                      {canManage && (
                        isCompleted ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => onUncomplete?.(goal.id)}
                          >
                            <IconRotateCcw size={14} className="mr-1" />
                            {isPending ? 'Updating…' : 'Mark In Progress'}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isPending}
                            onClick={() => onComplete?.(goal.id)}
                          >
                            <IconCheck size={14} className="mr-1" />
                            {isPending ? 'Updating…' : 'Mark Complete'}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
