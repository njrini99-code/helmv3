'use client';

// =============================================================================
// PlanDetail — the coach's single development-plan detail card, migrated onto
// "The Living Annual" kit (Lane 1 · THE PRESSBOX, green ink; rendered by
// dev-plans/[id]/page.tsx, which already carries the page's single <h1>). All
// data props (`plan`, `onComplete`/`onUncomplete`/`pendingGoalId`) are
// unchanged — only the render moved to the kit: `<PaperCard>` instead of the
// glass `<Card>`, `<InkBadge>` instead of the status `<Badge>` map.
// =============================================================================

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ProgressTracker } from '@/components/baseball/dev-plans/ProgressTracker';
import { IconCalendar, IconCheck, IconClock, IconNote, IconRotateCcw } from '@/components/icons';
import { getFullName } from '@/lib/utils';
import { PaperCard, Eyebrow, InkBadge } from '@/components/baseball/living-annual';
import type { DevPlanGoal, DevPlanWithPlayer, GoalStatus } from '@/lib/baseball/dev-plan-types';
import { parseDateOnly } from '@/lib/utils/date-only';

interface PlanDetailProps {
  plan: DevPlanWithPlayer;
  /** Coach marks a goal complete. Omit to render the detail read-only. */
  onComplete?: (goalId: string) => void;
  /** Coach reverts a completed goal back to in-progress. */
  onUncomplete?: (goalId: string) => void;
  /** goalId currently mutating (disables its buttons + shows a pending state). */
  pendingGoalId?: string | null;
}

const PLAN_STATUS_BADGE: Record<string, { tone: 'team' | 'neutral'; variant: 'soft' | 'solid' }> = {
  draft: { tone: 'neutral', variant: 'soft' },
  sent: { tone: 'team', variant: 'soft' },
  in_progress: { tone: 'team', variant: 'soft' },
  completed: { tone: 'team', variant: 'solid' },
  archived: { tone: 'neutral', variant: 'soft' },
};

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const GOAL_STATUS_BADGE: Record<GoalStatus, { tone: 'team' | 'neutral'; variant: 'soft' | 'solid' }> = {
  not_started: { tone: 'neutral', variant: 'soft' },
  in_progress: { tone: 'team', variant: 'soft' },
  completed: { tone: 'team', variant: 'solid' },
};

export function PlanDetail({ plan, onComplete, onUncomplete, pendingGoalId }: PlanDetailProps) {
  const goals: DevPlanGoal[] = Array.isArray(plan.goals) ? plan.goals : [];
  const completedGoals = goals.filter((goal) => goal.status === 'completed').length;
  const playerName = getFullName(plan.player?.first_name, plan.player?.last_name);
  const canManage = Boolean(onComplete && onUncomplete);
  const planBadge = PLAN_STATUS_BADGE[plan.status ?? 'draft'] ?? { tone: 'neutral' as const, variant: 'soft' as const };

  return (
    <div className="space-y-6">
      <PaperCard className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Avatar decorative name={playerName} src={plan.player?.avatar_url || undefined} size="md" />
            <div>
              <Eyebrow ink="team">Development Plan</Eyebrow>
              <h2 className="font-annual text-h2 font-semibold text-text-primary">{plan.title}</h2>
              <p className="mt-1 font-annual text-body-sm text-text-secondary">
                {playerName} • {plan.player?.primary_position || 'Position N/A'} • Class of {plan.player?.grad_year || '—'}
              </p>
            </div>
          </div>
          <InkBadge label={(plan.status || 'Draft').toUpperCase()} tone={planBadge.tone} variant={planBadge.variant} />
        </div>

        <div className="mt-4 space-y-4">
          <ProgressTracker completed={completedGoals} total={goals.length} />

          {plan.description && (
            <div className="rounded-fw-md border border-[color:var(--hairline)] bg-[color:var(--paper-canvas)] p-4">
              <div className="flex items-center gap-2 font-annual text-body-sm font-medium text-text-secondary">
                <IconNote size={16} />
                <span>Plan Overview</span>
              </div>
              <p className="mt-2 font-annual text-body-sm text-text-secondary">{plan.description}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 font-annual text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
            {plan.start_date && (
              <span className="flex items-center gap-1">
                <IconCalendar size={12} />
                Starts {new Date(plan.start_date).toLocaleDateString('en-US')}
              </span>
            )}
            {plan.end_date && (
              <span className="flex items-center gap-1">
                <IconClock size={12} />
                Ends {new Date(plan.end_date).toLocaleDateString('en-US')}
              </span>
            )}
          </div>
        </div>
      </PaperCard>

      <PaperCard className="p-5">
        <Eyebrow as="h2" ink="team">Goals &amp; Milestones</Eyebrow>
        <div className="mt-4">
          {goals.length === 0 ? (
            <p className="font-annual text-body-sm text-text-tertiary">No goals have been added to this plan yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {goals.map((goal) => {
                const isPending = pendingGoalId === goal.id;
                const isCompleted = goal.status === 'completed';
                const goalBadge = GOAL_STATUS_BADGE[goal.status];
                return (
                  <div key={goal.id} className="rounded-fw-md border border-[color:var(--hairline)] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-annual text-body-sm font-semibold text-text-primary">{goal.title}</h3>
                        {goal.description && (
                          <p className="mt-1 font-annual text-body-sm text-text-secondary">{goal.description}</p>
                        )}
                      </div>
                      <InkBadge
                        label={GOAL_STATUS_LABEL[goal.status].toUpperCase()}
                        tone={goalBadge.tone}
                        variant={goalBadge.variant}
                        className="shrink-0"
                      />
                    </div>

                    {!isCompleted && goal.progress > 0 && (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between font-annual text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                          <span>Progress</span>
                          <span className="font-medium text-text-secondary">{goal.progress}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--hairline)]">
                          <div className="h-full rounded-full bg-grade-plus" style={{ width: `${goal.progress}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      {goal.target_date ? (
                        <p className="font-annual text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                          Target: {parseDateOnly(goal.target_date).toLocaleDateString('en-US')}
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
        </div>
      </PaperCard>
    </div>
  );
}
