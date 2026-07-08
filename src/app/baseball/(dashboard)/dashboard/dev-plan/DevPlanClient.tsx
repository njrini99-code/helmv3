'use client';

// =============================================================================
// src/app/baseball/(dashboard)/dashboard/dev-plan/DevPlanClient.tsx
//
// Player-facing development plan view. Split out of page.tsx (COHERENCE
// RULING 2026-07-08 Ruling 5, "dev-plan cold-URL bounce"): this component is
// entirely client-rendered (own auth hook, own data fetch via
// getActiveDevPlan), which raced (dashboard)/layout.tsx's client-side
// DashboardSessionGuard on a hard/cold navigation — the guard's auth check
// and this component's own auth/fetch cycle could settle in either order,
// occasionally producing a transient 500 before the guard's redirect fired.
// page.tsx now resolves the player session server-side first
// (requireBaseballPlayerRoute — redirects synchronously, before any client
// hydration race is possible) and only then mounts this client component.
//
// LIVING-ANNUAL CHROME MIGRATION (2026-07-08, lane D1b): PRESENTATION ONLY —
// every fetch, handler, state transition, and categorization rule below is
// byte-identical to the pre-migration client; only the rendered chrome moved
// to the kit (SectionMasthead / PaperCard / RuledStatLine / StatReadout /
// InkBadge / EmptyIssue / EditorsLetter). Two concrete fixes from the map:
//   1. The generic `Header` + glass `Card` + `ProgressRing` + amber/blue ad
//      hoc badges are gone — this reads as a Passport page now, not a CRM
//      form, and never renders a yellow/amber box.
//   2. The goal-complete toggle was a bare 24px circle (`w-6 h-6`) — below
//      the 44px touch-target floor. It keeps its 24px VISUAL circle but now
//      sits inside a 44px hit area (`-m-2.5` compensates the extra footprint
//      so the row layout is visually unchanged).
// =============================================================================

import { useEffect, useState, useCallback, useTransition, useMemo } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageLoading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import {
  IconTarget,
  IconCheck,
  IconClock,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconList,
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { fairwayScope } from '@/lib/redesign/flag';
import {
  SectionMasthead,
  PaperCard,
  Eyebrow,
  RuledStatLine,
  StatReadout,
  InkBadge,
  EmptyIssue,
  EditorsLetter,
  Reveal,
  EASE_SOFT,
} from '@/components/baseball/living-annual';
import {
  getActiveDevPlan,
  completeGoalAsPlayer,
  uncompleteGoalAsPlayer,
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

// The four "how it works" beats shown on the honest empty state. Numbered
// with a hairline-ring green numeral, never a filled gray/primary circle —
// spec §4.2 rule 5 ("no gray card-soup ... structure comes from hairline
// rules + whitespace, not filled gray boxes").
const HOW_IT_WORKS = [
  { title: 'Coach creates your plan', body: 'Your coach sets specific goals and drills tailored to your needs.' },
  { title: 'Work on your goals', body: 'Follow the drills and practice routines to improve your skills.' },
  { title: 'Track your progress', body: 'Mark goals as complete and see how far you’ve come.' },
  { title: 'Celebrate achievements', body: 'Your coach reviews your progress and sets new goals.' },
] as const;

// Goal card component
function GoalCard({
  goal,
  onComplete,
  onUncomplete,
  isPending,
}: {
  goal: DevPlanGoal;
  onComplete: (goalId: string) => void;
  onUncomplete: (goalId: string) => void;
  isPending: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [isExpanded, setIsExpanded] = useState(false);
  const isCompleted = goal.status === 'completed';
  const dueInfo = goal.target_date ? getDaysUntil(goal.target_date) : null;
  // Deadlines are one of the spec's explicit clay exceptions inside a green
  // lane (§4.2 rule 2: "clay/oxblood only on stamps, seals, DEADLINES,
  // offers, hot signals") — overdue/due-soon badges read pursuit, everything
  // else stays neutral graphite. Never red, never amber.
  const urgent = dueInfo ? !isCompleted && (dueInfo.isOverdue || dueInfo.days <= 3) : false;
  const hasExpandable = Boolean(goal.description || goal.coach_notes);

  return (
    <m.div
      layout
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: EASE_SOFT }}
    >
      <PaperCard className={cn('p-4', isCompleted && 'opacity-80')}>
        <div className="flex items-start gap-3">
          {/* Complete toggle — 24px visual circle, 44px hit area (`-m-2.5`
              expands the button by 10px on every side without shifting the
              visual position of the circle inside the row). */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => (isCompleted ? onUncomplete(goal.id) : onComplete(goal.id))}
            disabled={isPending}
            haptic="none"
            aria-label={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
            aria-pressed={isCompleted}
            className="-m-2.5 flex-shrink-0 rounded-full p-0 text-transparent hover:bg-grade-plus/[0.08] hover:text-transparent focus-visible:ring-grade-plus/40"
          >
            <span
              aria-hidden
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors',
                isCompleted
                  ? 'border-grade-plus bg-grade-plus text-[var(--paper)]'
                  : 'border-[color:var(--hairline)] text-transparent',
              )}
            >
              <IconCheck size={14} />
            </span>
          </Button>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4
                  className={cn(
                    'font-annual text-body-lg leading-snug',
                    isCompleted ? 'text-grade-plus line-through' : 'text-text-primary',
                  )}
                >
                  {goal.title}
                </h4>
                {goal.category ? (
                  <Eyebrow className="mt-1">{goal.category}</Eyebrow>
                ) : null}
              </div>

              {dueInfo && !isCompleted ? (
                <InkBadge
                  label={dueInfo.label}
                  tone={urgent ? 'pursuit' : 'neutral'}
                  variant={dueInfo.isOverdue ? 'solid' : 'soft'}
                  className="flex-shrink-0"
                />
              ) : null}
            </div>

            {/* Progress — a single green fill, never a red/amber/blue
                threshold ramp (the two-ink law: this is a team/dev lane). */}
            {!isCompleted ? (
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">Progress</span>
                  <StatReadout value={goal.progress} suffix="%" className="text-body-sm" ariaLabel="Goal progress" />
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--hairline)]">
                  <m.div
                    className="h-full rounded-full bg-grade-plus"
                    initial={prefersReducedMotion ? false : { width: 0 }}
                    animate={{ width: `${goal.progress}%` }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            ) : null}

            {/* Expand toggle — Button already guarantees a >=44px hit area
                (`size="sm"` → `min-h-[44px]`); only the typography is
                re-skinned to the kit's small-caps eyebrow voice. */}
            {hasExpandable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded((v) => !v)}
                aria-expanded={isExpanded}
                haptic="none"
                className="-ml-3 mt-1 gap-1 px-2 text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary hover:bg-transparent hover:text-grade-plus"
              >
                {isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                {isExpanded ? 'Show less' : 'Show more'}
              </Button>
            ) : null}

            <AnimatePresence>
              {isExpanded ? (
                <m.div
                  initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 pt-1">
                    {goal.description ? (
                      <p className="font-annual text-body-sm leading-relaxed text-text-secondary">{goal.description}</p>
                    ) : null}
                    {goal.coach_notes ? (
                      <div className="border-l-2 border-grade-plus pl-3">
                        <Eyebrow ink="team">Coach note</Eyebrow>
                        <p className="mt-1 font-annual text-body-sm italic leading-relaxed text-text-secondary">
                          {goal.coach_notes}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </m.div>
              ) : null}
            </AnimatePresence>

            {isCompleted && goal.completed_at ? (
              <p className="mt-2 flex items-center gap-1 text-eyebrow uppercase tracking-[0.14em] text-grade-plus">
                <IconCheck size={12} />
                Completed {new Date(goal.completed_at).toLocaleDateString()}
              </p>
            ) : null}
          </div>
        </div>
      </PaperCard>
    </m.div>
  );
}

// Loading skeleton for dev plan
function DevPlanSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="relative h-40 overflow-hidden rounded-card border border-[color:var(--hairline)]">
        <div className="absolute inset-0 skeleton-shimmer" />
      </div>
      <div className="h-11 w-full max-w-sm overflow-hidden rounded-full">
        <div className="h-full w-full skeleton-shimmer" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative h-24 overflow-hidden rounded-card border border-[color:var(--hairline)]">
            <div className="absolute inset-0 skeleton-shimmer" style={{ animationDelay: `${i * 60}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Goals list component with empty state
function GoalsList({
  goals,
  onComplete,
  onUncomplete,
  isPending,
  emptyMessage,
}: {
  goals: DevPlanGoal[];
  onComplete: (goalId: string) => void;
  onUncomplete: (goalId: string) => void;
  isPending: boolean;
  emptyMessage: string;
}) {
  if (goals.length === 0) {
    return <p className="py-10 text-center font-annual text-body-sm text-text-tertiary">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} onComplete={onComplete} onUncomplete={onUncomplete} isPending={isPending} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function DevPlanClient() {
  const { user, player, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [plan, setPlan] = useState<DevelopmentalPlanWithGoals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
          await completeGoalAsPlayer(plan.id, goalId);
          await fetchPlan();
        } catch {
          showToast('Could not mark goal complete', 'error');
        }
      });
    },
    [plan, fetchPlan, showToast]
  );

  // Handle goal uncomplete
  const handleUncomplete = useCallback(
    (goalId: string) => {
      if (!plan) return;

      startTransition(async () => {
        try {
          await uncompleteGoalAsPlayer(plan.id, goalId);
          await fetchPlan();
        } catch {
          showToast('Could not update goal', 'error');
        }
      });
    },
    [plan, fetchPlan, showToast]
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
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <EditorsLetter ink="team" title="Players only" body="Only players can access this page." />
        </div>
      </div>
    );
  }

  const allDone = activeCount === 0 && upcomingCount === 0 && completedCount > 0;

  return (
    <div className={fairwayScope('min-h-full')}>
      <div className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 lg:py-10">
        <Reveal>
          <SectionMasthead eyebrow="THE PASSPORT · DEVELOPMENT PLAN" title="My Development Plan" ink="team">
            <p className="max-w-prose font-annual text-body-lg leading-relaxed text-text-secondary">
              {plan ? `Assigned by ${plan.coach?.full_name || 'Your Coach'}` : 'Track your progress and complete goals set by your coach.'}
            </p>
          </SectionMasthead>
        </Reveal>

        <div className="mt-8">
          {isLoading ? (
            <DevPlanSkeleton />
          ) : error ? (
            <EditorsLetter
              ink="team"
              title="Development plan unavailable"
              body={error}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsLoading(true);
                    setError(null);
                    void fetchPlan();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : !plan ? (
            <div className="space-y-8">
              <EmptyIssue variant="dev-plan" ink="team" />

              <PaperCard className="p-6">
                <Eyebrow ink="team">How it works</Eyebrow>
                <div className="mt-4 divide-y divide-[color:var(--hairline)]">
                  {HOW_IT_WORKS.map((step, i) => (
                    <div key={step.title} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-grade-plus font-annual text-body-sm text-grade-plus">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-annual text-body text-text-primary">{step.title}</p>
                        <p className="mt-0.5 font-annual text-body-sm leading-relaxed text-text-secondary">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </PaperCard>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Progress overview */}
              <PaperCard registrationTick className="p-6">
                <Eyebrow ink="team">Progress</Eyebrow>
                <div className="mt-3">
                  <RuledStatLine label="Complete" value={completionPercent} unit="%" size="row" ink="team" emphasis={completionPercent >= 100} />
                </div>

                <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
                  <div>
                    <RuledStatLine label="Active" value={activeCount} size="row" ink="team" />
                    {avgProgress > 0 ? (
                      <p className="mt-1.5 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">{avgProgress}% avg progress</p>
                    ) : null}
                  </div>
                  <div>
                    <RuledStatLine label="Upcoming" value={upcomingCount} size="row" ink="team" />
                    <p className="mt-1.5 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">goals queued</p>
                  </div>
                  <div>
                    <RuledStatLine label="Done" value={completedCount} size="row" ink="team" emphasis={completedCount > 0} />
                    <p className="mt-1.5 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">of {totalGoals} goals</p>
                  </div>
                </div>
              </PaperCard>

              {/* Plan header */}
              {plan.description ? (
                <PaperCard className="p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Eyebrow ink="team">{plan.title}</Eyebrow>
                    {plan.status ? (
                      <InkBadge
                        label={plan.status === 'in_progress' ? 'In progress' : 'Sent'}
                        tone="team"
                        variant={plan.status === 'in_progress' ? 'solid' : 'soft'}
                      />
                    ) : null}
                  </div>
                  <p className="mt-2 font-annual text-body leading-relaxed text-text-secondary">{plan.description}</p>
                  {plan.start_date || plan.end_date ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
                      <IconCalendar size={14} className="flex-shrink-0" />
                      {plan.start_date ? <span>Started {new Date(plan.start_date).toLocaleDateString()}</span> : null}
                      {plan.start_date && plan.end_date ? <span aria-hidden>·</span> : null}
                      {plan.end_date ? <span>Ends {new Date(plan.end_date).toLocaleDateString()}</span> : null}
                    </div>
                  ) : null}
                </PaperCard>
              ) : null}

              {/* Goals with Tabs */}
              <Tabs defaultValue="active" value={activeTab} onChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="active" icon={<IconTarget size={16} />} badge={activeCount > 0 ? activeCount : undefined}>
                    Active
                  </TabsTrigger>
                  <TabsTrigger value="upcoming" icon={<IconClock size={16} />} badge={upcomingCount > 0 ? upcomingCount : undefined}>
                    Upcoming
                  </TabsTrigger>
                  <TabsTrigger value="completed" icon={<IconCheck size={16} />} badge={completedCount > 0 ? completedCount : undefined}>
                    Completed
                  </TabsTrigger>
                  <TabsTrigger value="all" icon={<IconList size={16} />} badge={totalGoals}>
                    All
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active">
                  <GoalsList
                    goals={categorizedGoals.active}
                    onComplete={handleComplete}
                    onUncomplete={handleUncomplete}
                    isPending={isPending}
                    emptyMessage="No active goals right now. Check upcoming or completed."
                  />
                </TabsContent>

                <TabsContent value="upcoming">
                  <GoalsList
                    goals={categorizedGoals.upcoming}
                    onComplete={handleComplete}
                    onUncomplete={handleUncomplete}
                    isPending={isPending}
                    emptyMessage="No upcoming goals. All your goals are active or completed."
                  />
                </TabsContent>

                <TabsContent value="completed">
                  <GoalsList
                    goals={categorizedGoals.completed}
                    onComplete={handleComplete}
                    onUncomplete={handleUncomplete}
                    isPending={isPending}
                    emptyMessage="No completed goals yet. Keep working on your active goals."
                  />
                </TabsContent>

                <TabsContent value="all">
                  <GoalsList
                    goals={categorizedGoals.all}
                    onComplete={handleComplete}
                    onUncomplete={handleUncomplete}
                    isPending={isPending}
                    emptyMessage="No goals in your plan yet."
                  />
                </TabsContent>
              </Tabs>

              {/* All goals completed */}
              {allDone ? (
                <Reveal>
                  <EditorsLetter
                    ink="team"
                    title="All goals complete."
                    body="You've completed every goal in this plan. Check back soon for new challenges from your coach."
                  />
                </Reveal>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
