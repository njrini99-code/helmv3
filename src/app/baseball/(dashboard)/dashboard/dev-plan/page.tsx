'use client';

import { useEffect, useState, useCallback, useTransition, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  IconNote,
  IconTarget,
  IconCheck,
  IconClock,
  IconMessage,
  IconCalendar,
  IconSparkles,
  IconChevronDown,
  IconChevronUp,
  IconTrendingUp,
  IconList,
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  getActiveDevPlan,
  completeGoal,
  uncompleteGoal,
  type DevelopmentalPlanWithGoals,
  type DevPlanGoal,
} from '@/app/baseball/actions/dev-plans';

// Helper to calculate days until/since a date
function getDaysUntil(dateStr: string): { days: number; label: string; isOverdue: boolean; isUpcoming: boolean } {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { days: Math.abs(diffDays), label: `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`, isOverdue: true, isUpcoming: false };
  } else if (diffDays === 0) {
    return { days: 0, label: 'Due today', isOverdue: false, isUpcoming: false };
  } else if (diffDays === 1) {
    return { days: 1, label: 'Due tomorrow', isOverdue: false, isUpcoming: false };
  } else if (diffDays > 7) {
    return { days: diffDays, label: `Due in ${diffDays} days`, isOverdue: false, isUpcoming: true };
  } else {
    return { days: diffDays, label: `Due in ${diffDays} days`, isOverdue: false, isUpcoming: false };
  }
}

// Confetti celebration component
function CelebrationConfetti({ show }: { show: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  if (!show) return null;

  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1 + Math.random() * 0.5,
    color: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'][Math.floor(Math.random() * 5)],
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-2 h-2 rounded-full"
          style={{ left: `${p.x}%`, backgroundColor: p.color }}
          initial={prefersReducedMotion ? false : ({ y: -20, opacity: 1, scale: 1 })}
          animate={{ y: '100vh', opacity: 0, scale: 0, rotate: 360 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: p.duration, delay: p.delay, ease: 'easeIn' })}
        />
      ))}
    </div>
  );
}

// Goal card component
function GoalCard({
  goal,
  planId: _planId,
  onComplete,
  onUncomplete,
  isPending,
}: {
  goal: DevPlanGoal;
  planId: string; // Reserved for future use (e.g., deep links)
  onComplete: (goalId: string) => void;
  onUncomplete: (goalId: string) => void;
  isPending: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [isExpanded, setIsExpanded] = useState(false);
  const isCompleted = goal.status === 'completed';
  const dueInfo = goal.target_date ? getDaysUntil(goal.target_date) : null;

  return (
    <motion.div
      layout
      initial={prefersReducedMotion ? false : ({ opacity: 0, y: 20 })}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        'rounded-xl border p-4 transition-all',
        isCompleted
          ? 'bg-primary-50/50 border-primary-200'
          : 'bg-white border-warm-200 hover:border-warm-300 hover:shadow-sm'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <Button variant="primary"
          onClick={() => (isCompleted ? onUncomplete(goal.id) : onComplete(goal.id))}
          disabled={isPending}
          className={cn(
            'mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
            isCompleted
              ? 'bg-primary-500 border-primary-500 text-white'
              : 'border-warm-300 hover:border-primary-400 hover:bg-primary-50',
            isPending && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
        >
          <AnimatePresence>
            {isCompleted && (
              <motion.span
                initial={prefersReducedMotion ? false : ({ scale: 0 })}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <IconCheck size={14} />
              </motion.span>
            )}
          </AnimatePresence>
        </Button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4
                className={cn(
                  'font-medium text-sm',
                  isCompleted ? 'text-primary-700 line-through' : 'text-warm-900'
                )}
              >
                {goal.title}
              </h4>
              {goal.category && (
                <span className="text-xs text-warm-500 mt-0.5 inline-block">
                  {goal.category}
                </span>
              )}
            </div>

            {/* Due date badge */}
            {dueInfo && !isCompleted && (
              <span
                className={cn(
                  'text-xs px-2 py-1 rounded-full flex-shrink-0 font-medium',
                  dueInfo.isOverdue
                    ? 'bg-red-100 text-red-700'
                    : dueInfo.days <= 3
                    ? 'bg-amber-100 text-amber-700'
                    : dueInfo.isUpcoming
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-warm-100 text-warm-600'
                )}
              >
                {dueInfo.label}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {!isCompleted && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-warm-500 mb-1">
                <span>Progress</span>
                <span className="font-medium">{goal.progress}%</span>
              </div>
              <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    'h-full rounded-full',
                    goal.progress >= 75
                      ? 'bg-primary-500'
                      : goal.progress >= 50
                      ? 'bg-blue-500'
                      : goal.progress >= 25
                      ? 'bg-amber-500'
                      : 'bg-warm-300'
                  )}
                  initial={prefersReducedMotion ? false : ({ width: 0 })}
                  animate={{ width: `${goal.progress}%` }}
                  transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, ease: 'easeOut' })}
                />
              </div>
            </div>
          )}

          {/* Expand button for description/notes */}
          {(goal.description || goal.coach_notes) && (
            <Button variant="ghost"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700 transition-colors"
            >
              {isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              {isExpanded ? 'Show less' : 'Show more'}
            </Button>
          )}

          {/* Expanded content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={prefersReducedMotion ? false : ({ height: 0, opacity: 0 })}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-3">
                  {goal.description && (
                    <p className="text-sm text-warm-600">{goal.description}</p>
                  )}
                  {goal.coach_notes && (
                    <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <IconMessage size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-blue-700 mb-1">Coach Notes</p>
                        <p className="text-sm text-blue-800">{goal.coach_notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Completion date */}
          {isCompleted && goal.completed_at && (
            <p className="text-xs text-primary-600 mt-2 flex items-center gap-1">
              <IconCheck size={12} />
              Completed {new Date(goal.completed_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Loading skeleton for dev plan
function DevPlanSkeleton() {
  return (
    <>
      {/* Progress overview skeleton */}
      <Card variant="glass" className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Skeleton className="w-28 h-28 rounded-full" />
            <div className="flex-1 grid grid-cols-3 gap-4 w-full">
              {[1, 2, 3].map((i) => (
                <div key={i} className="text-center sm:text-left">
                  <Skeleton className="h-3 w-16 mx-auto sm:mx-0 mb-2" />
                  <Skeleton className="h-8 w-12 mx-auto sm:mx-0" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs skeleton */}
      <Skeleton className="h-12 w-full mb-6 rounded-lg" />

      {/* Goals skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-warm-200 p-4 bg-white">
            <div className="flex items-start gap-3">
              <Skeleton className="w-6 h-6 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/4" />
                <div className="space-y-1">
                  <Skeleton className="h-2 w-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// Empty state
function EmptyState() {
  return (
    <Card variant="glass">
      <CardContent className="p-12 text-center">
        <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-6">
          <IconNote size={40} className="text-primary-400" />
        </div>
        <h3 className="text-xl font-semibold text-warm-900 mb-2">
          No development plan yet
        </h3>
        <p className="text-sm leading-relaxed text-warm-500 max-w-md mx-auto mb-6">
          Your coach hasn't assigned a development plan yet. Once they create one, you'll see your goals and track your progress here.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 text-primary-700 text-sm font-medium">
          <IconSparkles size={16} />
          Check back soon!
        </div>
      </CardContent>
    </Card>
  );
}

// Goals list component with empty state
function GoalsList({
  goals,
  planId,
  onComplete,
  onUncomplete,
  isPending,
  emptyMessage,
  emptyIcon: EmptyIcon,
}: {
  goals: DevPlanGoal[];
  planId: string;
  onComplete: (goalId: string) => void;
  onUncomplete: (goalId: string) => void;
  isPending: boolean;
  emptyMessage: string;
  emptyIcon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  if (goals.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
          <EmptyIcon size={24} className="text-warm-400" />
        </div>
        <p className="text-sm text-warm-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            planId={planId}
            onComplete={onComplete}
            onUncomplete={onUncomplete}
            isPending={isPending}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function PlayerDevPlanPage() {
  const prefersReducedMotion = useReducedMotion();
  const { user, player, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<DevelopmentalPlanWithGoals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState('active');

  // Fetch plan data
  const fetchPlan = useCallback(async () => {
    if (!player?.id) return;

    try {
      const data = await getActiveDevPlan(player.id);
      setPlan(data);
    } catch (err) {
      console.error('Error fetching dev plan:', err);
      setError('Failed to load your development plan');
    } finally {
      setIsLoading(false);
    }
  }, [player?.id]);

  useEffect(() => {
    if (player?.id) {
      fetchPlan();
    }
  }, [player?.id, fetchPlan]);

  // Handle goal completion
  const handleComplete = useCallback(
    (goalId: string) => {
      if (!plan) return;

      startTransition(async () => {
        try {
          await completeGoal(plan.id, goalId);
          // Show celebration
          setShowCelebration(true);
          setTimeout(() => setShowCelebration(false), 2000);
          // Refresh data
          await fetchPlan();
        } catch (err) {
          console.error('Error completing goal:', err);
        }
      });
    },
    [plan, fetchPlan]
  );

  // Handle goal uncomplete
  const handleUncomplete = useCallback(
    (goalId: string) => {
      if (!plan) return;

      startTransition(async () => {
        try {
          await uncompleteGoal(plan.id, goalId);
          await fetchPlan();
        } catch (err) {
          console.error('Error uncompleting goal:', err);
        }
      });
    },
    [plan, fetchPlan]
  );

  // Categorize goals
  const categorizedGoals = useMemo(() => {
    if (!plan?.goals) return { active: [], upcoming: [], completed: [], all: [] };

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const completed = plan.goals.filter((g) => g.status === 'completed');
    const notCompleted = plan.goals.filter((g) => g.status !== 'completed');

    // Upcoming: not started AND target date is > 7 days away
    const upcoming = notCompleted.filter((g) => {
      if (g.status !== 'not_started') return false;
      if (!g.target_date) return false;
      const targetDate = new Date(g.target_date);
      targetDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 7;
    });

    // Active: in progress OR (not started AND due within 7 days OR no target date)
    const active = notCompleted.filter((g) => !upcoming.includes(g));

    return {
      active,
      upcoming,
      completed,
      all: plan.goals,
    };
  }, [plan?.goals]);

  // Stats
  const totalGoals = plan?.goals.length || 0;
  const completedCount = categorizedGoals.completed.length;
  const activeCount = categorizedGoals.active.length;
  const upcomingCount = categorizedGoals.upcoming.length;
  const completionPercent = totalGoals > 0 ? Math.round((completedCount / totalGoals) * 100) : 0;

  // Average progress of active goals
  const avgProgress = useMemo(() => {
    if (categorizedGoals.active.length === 0) return 0;
    const total = categorizedGoals.active.reduce((sum, g) => sum + g.progress, 0);
    return Math.round(total / categorizedGoals.active.length);
  }, [categorizedGoals.active]);

  if (authLoading) return <PageLoading />;

  if (user?.role !== 'player') {
    return (
      <div className="p-8">
        <Card variant="glass">
          <CardContent className="p-12 text-center">
            <p className="text-warm-500">Only players can access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <CelebrationConfetti show={showCelebration} />

      <Header
        title="My Development Plan"
        subtitle={plan ? `Assigned by ${plan.coach?.full_name || 'Your Coach'}` : 'Track your progress and complete goals set by your coach'}
      />

      <div className="p-4 md:p-8">
        {isLoading ? (
          <DevPlanSkeleton />
        ) : error ? (
          <Card variant="glass">
            <CardContent className="p-12 text-center">
              <p className="text-red-500">{error}</p>
            </CardContent>
          </Card>
        ) : !plan ? (
          <>
            <EmptyState />

            {/* How it works card */}
            <Card className="mt-6">
              <CardHeader>
                <h2 className="font-semibold text-warm-900">How Development Plans Work</h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-warm-600">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                      1
                    </span>
                    <div>
                      <span className="font-medium text-warm-900">Coach creates your plan</span>
                      <p className="text-warm-500 mt-0.5">
                        Your coach will set specific goals and drills tailored to your needs
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                      2
                    </span>
                    <div>
                      <span className="font-medium text-warm-900">Work on your goals</span>
                      <p className="text-warm-500 mt-0.5">
                        Follow the drills and practice routines to improve your skills
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                      3
                    </span>
                    <div>
                      <span className="font-medium text-warm-900">Track your progress</span>
                      <p className="text-warm-500 mt-0.5">
                        Mark goals as complete and see how far you've come
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                      4
                    </span>
                    <div>
                      <span className="font-medium text-warm-900">Celebrate achievements</span>
                      <p className="text-warm-500 mt-0.5">
                        Your coach will review your progress and set new goals
                      </p>
                    </div>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Progress Overview with Circular Ring */}
            <Card variant="glass" className="mb-6">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  {/* Circular progress */}
                  <div className="flex-shrink-0">
                    <ProgressRing
                      value={completionPercent}
                      size="lg"
                      color="primary"
                      label="Complete"
                    />
                  </div>

                  {/* Stats grid */}
                  <div className="flex-1 grid grid-cols-3 gap-4 w-full">
                    <div className="text-center sm:text-left">
                      <p className="text-xs font-medium text-warm-500 uppercase tracking-wide">Active</p>
                      <p className="text-2xl font-semibold text-warm-900 mt-1">{activeCount}</p>
                      {avgProgress > 0 && (
                        <p className="text-xs text-warm-500 mt-0.5 flex items-center gap-1 justify-center sm:justify-start">
                          <IconTrendingUp size={12} className="text-primary-500" />
                          {avgProgress}% avg progress
                        </p>
                      )}
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-xs font-medium text-warm-500 uppercase tracking-wide">Upcoming</p>
                      <p className="text-2xl font-semibold text-warm-900 mt-1">{upcomingCount}</p>
                      <p className="text-xs text-warm-500 mt-0.5">goals queued</p>
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-xs font-medium text-warm-500 uppercase tracking-wide">Done</p>
                      <p className="text-2xl font-semibold text-primary-600 mt-1">{completedCount}</p>
                      <p className="text-xs text-warm-500 mt-0.5">of {totalGoals} goals</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Plan Header */}
            {plan.description && (
              <Card variant="glass" className="mb-6">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <IconTarget size={20} className="text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-warm-900">{plan.title}</h3>
                      <p className="text-sm text-warm-600 mt-1">{plan.description}</p>
                      {(plan.start_date || plan.end_date) && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-warm-500">
                          <IconCalendar size={14} />
                          {plan.start_date && (
                            <span>Started {new Date(plan.start_date).toLocaleDateString()}</span>
                          )}
                          {plan.start_date && plan.end_date && <span>•</span>}
                          {plan.end_date && (
                            <span>Ends {new Date(plan.end_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Goals with Tabs */}
            <Tabs defaultValue="active" value={activeTab} onChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger
                  value="active"
                  icon={<IconTarget size={16} />}
                  badge={activeCount > 0 ? activeCount : undefined}
                >
                  Active
                </TabsTrigger>
                <TabsTrigger
                  value="upcoming"
                  icon={<IconClock size={16} />}
                  badge={upcomingCount > 0 ? upcomingCount : undefined}
                >
                  Upcoming
                </TabsTrigger>
                <TabsTrigger
                  value="completed"
                  icon={<IconCheck size={16} />}
                  badge={completedCount > 0 ? completedCount : undefined}
                >
                  Completed
                </TabsTrigger>
                <TabsTrigger value="all" icon={<IconList size={16} />} badge={totalGoals}>
                  All
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active">
                <GoalsList
                  goals={categorizedGoals.active}
                  planId={plan.id}
                  onComplete={handleComplete}
                  onUncomplete={handleUncomplete}
                  isPending={isPending}
                  emptyMessage="No active goals right now. Check upcoming or completed tabs."
                  emptyIcon={IconTarget}
                />
              </TabsContent>

              <TabsContent value="upcoming">
                <GoalsList
                  goals={categorizedGoals.upcoming}
                  planId={plan.id}
                  onComplete={handleComplete}
                  onUncomplete={handleUncomplete}
                  isPending={isPending}
                  emptyMessage="No upcoming goals. All your goals are active or completed!"
                  emptyIcon={IconClock}
                />
              </TabsContent>

              <TabsContent value="completed">
                <GoalsList
                  goals={categorizedGoals.completed}
                  planId={plan.id}
                  onComplete={handleComplete}
                  onUncomplete={handleUncomplete}
                  isPending={isPending}
                  emptyMessage="No completed goals yet. Keep working on your active goals!"
                  emptyIcon={IconCheck}
                />
              </TabsContent>

              <TabsContent value="all">
                <GoalsList
                  goals={categorizedGoals.all}
                  planId={plan.id}
                  onComplete={handleComplete}
                  onUncomplete={handleUncomplete}
                  isPending={isPending}
                  emptyMessage="No goals in your plan yet."
                  emptyIcon={IconNote}
                />
              </TabsContent>
            </Tabs>

            {/* All goals completed celebration */}
            {activeCount === 0 && upcomingCount === 0 && completedCount > 0 && (
              <motion.div
                initial={prefersReducedMotion ? false : ({ opacity: 0, scale: 0.95 })}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-6"
              >
                <Card variant="glass" className="border-primary-200 bg-primary-50/50">
                  <CardContent className="p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
                      <IconSparkles size={32} className="text-primary-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-primary-900 mb-2">
                      Congratulations! 🎉
                    </h3>
                    <p className="text-sm text-primary-700">
                      You've completed all your goals! Check back soon for new challenges from your
                      coach.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}
      </div>
    </>
  );
}
