'use client';

// =============================================================================
// DevPlanDetailPage — the coach's single development-plan detail view,
// migrated onto "The Living Annual" kit (Lane 1 · THE PRESSBOX, green ink,
// sibling to DevPlansClient). PRESENTATION ONLY: `fetchPlan`/`completeGoal`/
// `uncompleteGoal`, the not-found vs. genuine-error disambiguation, and the
// breadcrumb wiring are unchanged — only the render moved to the kit (a
// shared `<SectionMasthead>` instead of the 5 copy-pasted header blocks, and
// `<EditorsLetter>` instead of the bespoke destructive/warm boxes).
// =============================================================================

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PlanDetail } from '@/components/baseball/dev-plans/PlanDetail';
import { BreadcrumbLabel } from '@/app/baseball/(dashboard)/_components/breadcrumb-label';
import { IconChevronLeft } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import {
  getDevPlanForCoach,
  completeGoal,
  uncompleteGoal,
} from '@/app/baseball/actions/dev-plans';
import type { DevPlanWithPlayer } from '@/lib/baseball/dev-plan-types';
import { cn } from '@/lib/utils';
import { SectionMasthead, PaperCard, EditorsLetter } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

const BACK_ACTION = (
  <Button asChild variant="secondary" size="sm">
    <Link href="/baseball/dashboard/dev-plans">
      <span className="flex-shrink-0 -ml-0.5">
        <IconChevronLeft size={16} />
      </span>
      Back
    </Link>
  </Button>
);

export default function DevPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [plan, setPlan] = useState<DevPlanWithPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingGoalId, setPendingGoalId] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    if (!params?.id) return;
    setLoading(true);

    try {
      const data = await getDevPlanForCoach(params.id);
      setPlan(data);
      setNotFound(false);
      setFetchError(null);
    } catch (error) {
      console.error('Error fetching dev plan:', error);
      setPlan(null);
      const message = error instanceof Error ? error.message : '';
      // getDevPlanForCoach throws either a raw "no rows" Postgrest error (the
      // plan id doesn't exist) or a deliberate "you do not have permission"
      // error for a plan owned by another coach — both render as the same
      // "not found" state (never reveal existence to a coach who can't view
      // it). Anything else — auth failures, network errors, unexpected
      // server errors — is a real failure and must not masquerade as a
      // missing plan.
      const isGenuineNotFound =
        message === 'You do not have permission to view this plan' ||
        /no rows|PGRST116/i.test(message);
      if (isGenuineNotFound) {
        setNotFound(true);
        setFetchError(null);
      } else {
        setNotFound(false);
        setFetchError(message || 'Could not load this plan. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [params?.id]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const handleComplete = useCallback(
    (goalId: string) => {
      if (!plan) return;
      setPendingGoalId(goalId);
      startTransition(async () => {
        try {
          await completeGoal(plan.id, goalId);
          await fetchPlan();
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Could not mark goal complete', 'error');
        } finally {
          setPendingGoalId(null);
        }
      });
    },
    [plan, fetchPlan, showToast]
  );

  const handleUncomplete = useCallback(
    (goalId: string) => {
      if (!plan) return;
      setPendingGoalId(goalId);
      startTransition(async () => {
        try {
          await uncompleteGoal(plan.id, goalId);
          await fetchPlan();
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Could not update goal', 'error');
        } finally {
          setPendingGoalId(null);
        }
      });
    },
    [plan, fetchPlan, showToast]
  );

  if (authLoading || loading) {
    return (
      <div className={cn(PAGE_SHELL, 'space-y-6')}>
        <SectionMasthead eyebrow="THE PRESSBOX · DEVELOPMENT PLANS" title="Development Plan" ink="team" actions={BACK_ACTION} />
        <PaperCard className="p-6">
          <Skeleton variant="text" width="40%" height={18} className="mb-3" />
          <Skeleton variant="text" width="100%" height={40} />
        </PaperCard>
      </div>
    );
  }

  if (user?.role !== 'coach') {
    return (
      <div className={PAGE_SHELL}>
        <SectionMasthead eyebrow="THE PRESSBOX · DEVELOPMENT PLANS" title="Development Plan" ink="team" actions={BACK_ACTION} />
        <div className="mt-6 mx-auto max-w-lg">
          <EditorsLetter ink="team" title="Coaches only" body="Only coaches can access development plans." />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className={PAGE_SHELL}>
        <SectionMasthead eyebrow="THE PRESSBOX · DEVELOPMENT PLANS" title="Development Plan" ink="team" actions={BACK_ACTION} />
        <div className="mt-6">
          <EditorsLetter
            ink="team"
            title="Couldn't load this plan"
            body={fetchError}
            action={
              <Button variant="secondary" size="sm" onClick={() => fetchPlan()}>
                Try again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (notFound || !plan) {
    return (
      <div className={PAGE_SHELL}>
        <SectionMasthead eyebrow="THE PRESSBOX · DEVELOPMENT PLANS" title="Development Plan" ink="team" actions={BACK_ACTION} />
        <div className="mt-6">
          <EditorsLetter ink="team" title="Plan not found." body="This development plan could not be found." />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(PAGE_SHELL, 'space-y-6')}>
      {/* Ruling 4: the shell's breadcrumb has no registry entry for a
          dynamic plan id — this supplies the real plan title so the trail
          never falls back to a raw UUID segment. */}
      <BreadcrumbLabel name={plan.title} />
      <SectionMasthead eyebrow="THE PRESSBOX · DEVELOPMENT PLANS" title="Development Plan" ink="team" actions={BACK_ACTION} />
      <PlanDetail
        plan={plan}
        onComplete={handleComplete}
        onUncomplete={handleUncomplete}
        pendingGoalId={isPending ? pendingGoalId : null}
      />
    </div>
  );
}
