'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoading } from '@/components/ui/loading';
import { Card, CardContent } from '@/components/ui/card';
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

export default function DevPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [plan, setPlan] = useState<DevPlanWithPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingGoalId, setPendingGoalId] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    if (!params?.id) return;
    setLoading(true);

    try {
      const data = await getDevPlanForCoach(params.id);
      setPlan(data);
      setNotFound(false);
    } catch (error) {
      console.error('Error fetching dev plan:', error);
      setPlan(null);
      setNotFound(true);
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
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center gap-3">
          <Link
            href="/baseball/dashboard/dev-plans"
            aria-label="Go back"
            className="rounded-lg p-1.5 text-warm-400 transition-all duration-200 hover:bg-warm-100 hover:text-warm-600 active:scale-95 active:bg-warm-200"
          >
            <IconChevronLeft size={20} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-h2 font-semibold text-warm-900">Development Plan</h1>
            <p className="mt-1 text-body-sm text-warm-500">Detailed plan view</p>
          </div>
        </div>
        <div className="p-6 lg:p-8">
          <PageLoading />
        </div>
      </>
    );
  }

  if (user?.role !== 'coach') {
    return (
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center gap-3">
          <Link
            href="/baseball/dashboard/dev-plans"
            aria-label="Go back"
            className="rounded-lg p-1.5 text-warm-400 transition-all duration-200 hover:bg-warm-100 hover:text-warm-600 active:scale-95 active:bg-warm-200"
          >
            <IconChevronLeft size={20} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-h2 font-semibold text-warm-900">Development Plan</h1>
            <p className="mt-1 text-body-sm text-warm-500">Detailed plan view</p>
          </div>
        </div>
        <div className="p-6 lg:p-8">
          <Card variant="glass">
            <CardContent className="p-12 text-center">
              <p className="text-warm-500">Only coaches can access development plans.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (notFound || !plan) {
    return (
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center gap-3">
          <Link
            href="/baseball/dashboard/dev-plans"
            aria-label="Go back"
            className="rounded-lg p-1.5 text-warm-400 transition-all duration-200 hover:bg-warm-100 hover:text-warm-600 active:scale-95 active:bg-warm-200"
          >
            <IconChevronLeft size={20} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-h2 font-semibold text-warm-900">Development Plan</h1>
            <p className="mt-1 text-body-sm text-warm-500">Detailed plan view</p>
          </div>
        </div>
        <div className="p-6 lg:p-8">
          <div className="rounded-xl border border-warm-200 bg-cream-50 p-6 text-sm text-warm-600">
            This development plan could not be found.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Ruling 4: the shell's breadcrumb has no registry entry for a
          dynamic plan id — this supplies the real plan title so the trail
          never falls back to a raw UUID segment. */}
      <BreadcrumbLabel name={plan.title} />
      <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center gap-3">
        <Link
          href="/baseball/dashboard/dev-plans"
          aria-label="Go back"
          className="rounded-lg p-1.5 text-warm-400 transition-all duration-200 hover:bg-warm-100 hover:text-warm-600 active:scale-95 active:bg-warm-200"
        >
          <IconChevronLeft size={20} aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-h2 font-semibold text-warm-900">Development Plan</h1>
          <p className="mt-1 text-body-sm text-warm-500">Detailed plan view</p>
        </div>
      </div>
      <div className="p-6 lg:p-8">
        <PlanDetail
          plan={plan}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          pendingGoalId={isPending ? pendingGoalId : null}
        />
      </div>
    </>
  );
}
