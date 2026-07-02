'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressTracker } from '@/components/baseball/dev-plans/ProgressTracker';
import { IconCalendar, IconCheck, IconClock, IconNote } from '@/components/icons';
import { getFullName, cn } from '@/lib/utils';
import type { DevelopmentalPlanWithGoals } from '@/app/baseball/actions/dev-plans';

interface PlanDetailProps {
  plan: DevelopmentalPlanWithGoals;
  /** Called when a coach marks a goal complete. Omit to render read-only. */
  onComplete?: (goalId: string) => void;
  /** Called when a coach reopens a completed goal. Omit to render read-only. */
  onUncomplete?: (goalId: string) => void;
  /** Disables the goal controls while a mutation is in flight. */
  isPending?: boolean;
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

export function PlanDetail({ plan, onComplete, onUncomplete, isPending = false }: PlanDetailProps) {
  const goals = plan.goals ?? [];
  const completedGoals = goals.filter((goal) => goal.status === 'completed').length;
  const playerName = getFullName(plan.player?.first_name, plan.player?.last_name);
  const canToggle = Boolean(onComplete && onUncomplete);

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
                const isCompleted = goal.status === 'completed';
                return (
                  <div key={goal.id} className="rounded-xl border border-warm-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {canToggle && (
                          <Button
                            variant="primary"
                            onClick={() => (isCompleted ? onUncomplete?.(goal.id) : onComplete?.(goal.id))}
                            disabled={isPending}
                            aria-label={isCompleted ? `Mark ${goal.title} as incomplete` : `Mark ${goal.title} as complete`}
                            className={cn(
                              'mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all p-0',
                              isCompleted
                                ? 'bg-primary-500 border-primary-500 text-white'
                                : 'border-warm-300 bg-transparent hover:border-primary-400 hover:bg-primary-50',
                              isPending && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            {isCompleted && <IconCheck size={12} />}
                          </Button>
                        )}
                        <div className="min-w-0">
                          <h3
                            className={cn(
                              'text-sm font-semibold',
                              isCompleted ? 'text-primary-700 line-through' : 'text-warm-900'
                            )}
                          >
                            {goal.title}
                          </h3>
                          {goal.description && (
                            <p className="mt-1 text-sm leading-relaxed text-warm-600">{goal.description}</p>
                          )}
                        </div>
                      </div>
                      {isCompleted && (
                        <Badge variant="success" className="flex items-center gap-1 flex-shrink-0">
                          <IconCheck size={12} />
                          Done
                        </Badge>
                      )}
                    </div>

                    {!isCompleted && goal.progress > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-warm-500 mb-1">
                          <span>Progress</span>
                          <span className="font-medium">{goal.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary-500" style={{ width: `${goal.progress}%` }} />
                        </div>
                      </div>
                    )}

                    {goal.target_date && (
                      <p className="mt-3 text-xs text-warm-500">
                        Target: {new Date(goal.target_date).toLocaleDateString()}
                      </p>
                    )}
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
