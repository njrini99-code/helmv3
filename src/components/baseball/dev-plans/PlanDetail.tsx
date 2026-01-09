'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ProgressTracker } from '@/components/baseball/dev-plans/ProgressTracker';
import { IconCalendar, IconCheck, IconClock, IconNote } from '@/components/icons';
import { getFullName } from '@/lib/utils';

interface Goal {
  title: string;
  description?: string;
  target_date?: string;
  completed?: boolean;
}

interface PlanDetailProps {
  plan: {
    id: string;
    title: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string | null;
    notes: string | null;
    drills: unknown;
    goals: unknown;
    player: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
      primary_position: string | null;
      grad_year: number | null;
    } | null;
  };
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

export function PlanDetail({ plan }: PlanDetailProps) {
  const goals = Array.isArray(plan.goals) ? (plan.goals as Goal[]) : [];
  const completedGoals = goals.filter((goal) => goal.completed).length;
  const playerName = getFullName(plan.player?.first_name, plan.player?.last_name);

  return (
    <div className="space-y-6">
      <Card variant="glass">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={playerName} src={plan.player?.avatar_url || undefined} size="md" />
            <div>
              <p className="text-sm text-slate-500">Development Plan</p>
              <h1 className="text-xl font-semibold text-slate-900">{plan.title}</h1>
              <p className="text-sm text-slate-500 mt-1">
                {playerName} • {plan.player?.primary_position || 'Position N/A'} • Class of {plan.player?.grad_year || '—'}
              </p>
            </div>
          </div>
          <Badge variant={getStatusVariant(plan.status)}>{plan.status || 'Draft'}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProgressTracker completed={completedGoals} total={goals.length} />

          {plan.description && (
            <div className="rounded-xl border border-slate-200 bg-white/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <IconNote size={16} />
                <span>Plan Overview</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{plan.description}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
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
          <h2 className="font-semibold text-slate-900">Goals & Milestones</h2>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <p className="text-sm text-slate-500">No goals have been added to this plan yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {goals.map((goal, index) => (
                <div key={`${goal.title}-${index}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{goal.title}</h3>
                      {goal.description && (
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{goal.description}</p>
                      )}
                    </div>
                    {goal.completed && (
                      <Badge variant="success" className="flex items-center gap-1">
                        <IconCheck size={12} />
                        Done
                      </Badge>
                    )}
                  </div>
                  {goal.target_date && (
                    <p className="mt-3 text-xs text-slate-500">
                      Target: {new Date(goal.target_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
