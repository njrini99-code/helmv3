'use client';

import { useEffect, useState, useCallback, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import { Skeleton } from '@/components/ui/skeleton';
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
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import {
  getActiveDevPlan,
  completeGoal,
  uncompleteGoal,
  type DevelopmentalPlanWithGoals,
  type DevPlanGoal,
} from '@/app/baseball/actions/dev-plans';

// Helper to calculate days until/since a date
function getDaysUntil(dateStr: string): { days: number; label: string; isOverdue: boolean } {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { days: Math.abs(diffDays), label: `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`, isOverdue: true };
  } else if (diffDays === 0) {
    return { days: 0, label: 'Due today', isOverdue: false };
  } else if (diffDays === 1) {
    return { days: 1, label: 'Due tomorrow', isOverdue: false };
  } else {
    return { days: diffDays, label: `Due in ${diffDays} days`, isOverdue: false };
  }
}

// Confetti celebration component
function CelebrationConfetti({ show }: { show: boolean }) {
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
          initial={{ y: -20, opacity: 1, scale: 1 }}
          animate={{ y: '100vh', opacity: 0, scale: 0, rotate: 360 }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

// Goal card component
function GoalCard({
  goal,
  planId,
  onComplete,
  onUncomplete,
  isPending,
}: {
  goal: DevPlanGoal;
  planId: string;
  onComplete: (goalId: string) => void;
  onUncomplete: (goalId: string) => void;
  isPending: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isCompleted = goal.status === 'completed';
  const dueInfo = goal.target_date ? getDaysUntil(goal.target_date) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        'rounded-xl border p-4 transition-all',
        isCompleted
          ? 'bg-primary-50/50 border-primary-200'
          : 'bg-white border-warm-200 hover:border-warm-300'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={() => (isCompleted ? onUncomplete(goal.id) : onComplete(goal.id))}
          disabled={isPending}
          className={cn(
            'mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
            isCompleted
              ? 'bg-primary-500 border-primary-500 text-white'
              : 'border-warm-300 hover:border-primary-400',
            isPending && 'opacity-50 cursor-not-allowed'
          )}
        >
          <AnimatePresence>
            {isCompleted && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <IconCheck size={14} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4
                className={cn(
                  'font-medium text-sm',
                  isCompleted ? 'text-primary-700 line-through' : 'text-slate-900'
                )}
              >
                {goal.title}
              </h4>
              {goal.category && (
                <span className="text-xs text-slate-500 mt-0.5 inline-block">
                  {goal.category}
                </span>
              )}
            </div>

            {/* Due date badge */}
            {dueInfo && !isCompleted && (
              <span
                className={cn(
                  'text-xs px-2 py-1 rounded-full flex-shrink-0',
                  dueInfo.isOverdue
                    ? 'bg-red-100 text-red-700'
                    : dueInfo.days <= 3
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
                )}
              >
                {dueInfo.label}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {!isCompleted && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Progress</span>
                <span>{goal.progress}%</span>
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
                  initial={{ width: 0 }}
                  animate={{ width: `${goal.progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {/* Expand button for description/notes */}
          {(goal.description || goal.coach_notes) && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              {isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}

          {/* Expanded content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-3">
                  {goal.description && (
                    <p className="text-sm text-slate-600">{goal.description}</p>
                  )}
                  {goal.coach_notes && (
                    <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
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
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-12" />
                </div>
                <Skeleton className="w-12 h-12 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Goals skeleton */}
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-warm-200 p-4">
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
        </CardContent>
      </Card>
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
        <h3 className="text-xl font-semibold text-slate-900 mb-2">
          No development plan yet
        </h3>
        <p className="text-sm leading-relaxed text-slate-500 max-w-md mx-auto mb-6">
          Your coach hasn't assigned a development plan yet. Once they create one, you'll see your goals and track your progress here.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 text-primary-700 text-sm">
          <IconSparkles size={16} />
          Check back soon!
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlayerDevPlanPage() {
  const { user, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<DevelopmentalPlanWithGoals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Fetch plan data
  const fetchPlan = useCallback(async () => {
    if (!user?.player_id) return;

    try {
      const data = await getActiveDevPlan(user.player_id);
      setPlan(data);
    } catch (err) {
      console.error('Error fetching dev plan:', err);
      setError('Failed to load your development plan');
    } finally {
      setIsLoading(false);
    }
  }, [user?.player_id]);

  useEffect(() => {
    if (user?.player_id) {
      fetchPlan();
    }
  }, [user?.player_id, fetchPlan]);

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

  if (authLoading) return <PageLoading />;

  if (user?.role !== 'player') {
    return (
      <div className="p-8">
        <Card variant="glass">
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">Only players can access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Categorize goals
  const activeGoals = plan?.goals.filter((g) => g.status !== 'completed') || [];
  const completedGoals = plan?.goals.filter((g) => g.status === 'completed') || [];
  const totalGoals = plan?.goals.length || 0;
  const completionPercent = totalGoals > 0 ? Math.round((completedGoals.length / totalGoals) * 100) : 0;
  const inProgressCount = activeGoals.filter((g) => g.status === 'in_progress').length;

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
                <h2 className="font-semibold text-slate-900">How Development Plans Work</h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                      1
                    </span>
                    <div>
                      <span className="font-medium text-slate-900">Coach creates your plan</span>
                      <p className="text-slate-500 mt-0.5">
                        Your coach will set specific goals and drills tailored to your needs
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                      2
                    </span>
                    <div>
                      <span className="font-medium text-slate-900">Work on your goals</span>
                      <p className="text-slate-500 mt-0.5">
                        Follow the drills and practice routines to improve your skills
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                      3
                    </span>
                    <div>
                      <span className="font-medium text-slate-900">Track your progress</span>
                      <p className="text-slate-500 mt-0.5">
                        Mark goals as complete and see how far you've come
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                      4
                    </span>
                    <div>
                      <span className="font-medium text-slate-900">Celebrate achievements</span>
                      <p className="text-slate-500 mt-0.5">
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
            {/* Progress Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card variant="glass">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs md:text-sm font-medium text-slate-500">Active Goals</p>
                      <p className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 mt-1">
                        {activeGoals.length}
                      </p>
                    </div>
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-50 flex items-center justify-center">
                      <IconTarget size={20} className="text-blue-600 md:hidden" />
                      <IconTarget size={24} className="text-blue-600 hidden md:block" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs md:text-sm font-medium text-slate-500">Completed</p>
                      <p className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 mt-1">
                        {completedGoals.length}
                      </p>
                    </div>
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary-50 flex items-center justify-center">
                      <IconCheck size={20} className="text-primary-600 md:hidden" />
                      <IconCheck size={24} className="text-primary-600 hidden md:block" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs md:text-sm font-medium text-slate-500">In Progress</p>
                      <p className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 mt-1">
                        {inProgressCount}
                      </p>
                    </div>
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-amber-50 flex items-center justify-center">
                      <IconClock size={20} className="text-amber-600 md:hidden" />
                      <IconClock size={24} className="text-amber-600 hidden md:block" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs md:text-sm font-medium text-slate-500">Completion</p>
                      <p className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 mt-1">
                        {completionPercent}%
                      </p>
                    </div>
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-purple-50 flex items-center justify-center">
                      <IconNote size={20} className="text-purple-600 md:hidden" />
                      <IconNote size={24} className="text-purple-600 hidden md:block" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Plan Header */}
            {plan.description && (
              <Card variant="glass" className="mb-6">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <IconTarget size={20} className="text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{plan.title}</h3>
                      <p className="text-sm text-slate-600 mt-1">{plan.description}</p>
                      {(plan.start_date || plan.end_date) && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
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

            {/* Active Goals Section */}
            {activeGoals.length > 0 && (
              <Card variant="glass" className="mb-6">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <IconTarget size={18} className="text-blue-600" />
                    <h2 className="font-semibold text-slate-900">Active Goals</h2>
                    <span className="ml-auto text-sm text-slate-500">
                      {activeGoals.length} goal{activeGoals.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {activeGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        planId={plan.id}
                        onComplete={handleComplete}
                        onUncomplete={handleUncomplete}
                        isPending={isPending}
                      />
                    ))}
                  </AnimatePresence>
                </CardContent>
              </Card>
            )}

            {/* Completed Goals Section */}
            {completedGoals.length > 0 && (
              <Card variant="glass">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <IconCheck size={18} className="text-primary-600" />
                    <h2 className="font-semibold text-slate-900">Completed Goals</h2>
                    <span className="ml-auto text-sm text-slate-500">
                      {completedGoals.length} goal{completedGoals.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {completedGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        planId={plan.id}
                        onComplete={handleComplete}
                        onUncomplete={handleUncomplete}
                        isPending={isPending}
                      />
                    ))}
                  </AnimatePresence>
                </CardContent>
              </Card>
            )}

            {/* All goals completed celebration */}
            {activeGoals.length === 0 && completedGoals.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
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
