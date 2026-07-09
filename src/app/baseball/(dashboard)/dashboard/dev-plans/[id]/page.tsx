'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoading } from '@/components/ui/loading';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center gap-3">
          <Link
            href="/baseball/dashboard/dev-plans"
            aria-label="Go back"
            className="rounded-lg p-1.5 text-warm-400 transition-all duration-200 hover:bg-warm-100 hover:text-warm-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-300 active:scale-95 active:bg-warm-200"
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
            className="rounded-lg p-1.5 text-warm-400 transition-all duration-200 hover:bg-warm-100 hover:text-warm-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-300 active:scale-95 active:bg-warm-200"
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

  if (fetchError) {
    return (
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center gap-3">
          <Link
            href="/baseball/dashboard/dev-plans"
            aria-label="Go back"
            className="rounded-lg p-1.5 text-warm-400 transition-all duration-200 hover:bg-warm-100 hover:text-warm-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-300 active:scale-95 active:bg-warm-200"
          >
            <IconChevronLeft size={20} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-h2 font-semibold text-warm-900">Development Plan</h1>
            <p className="mt-1 text-body-sm text-warm-500">Detailed plan view</p>
          </div>
        </div>
        <div className="p-6 lg:p-8">
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
            <p className="font-medium">Couldn&apos;t load this plan</p>
            <p className="mt-1 text-destructive/80">{fetchError}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchPlan()}
              className="mt-4"
            >
              Try again
            </Button>
          </div>
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
            className="rounded-lg p-1.5 text-warm-400 transition-all duration-200 hover:bg-warm-100 hover:text-warm-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-300 active:scale-95 active:bg-warm-200"
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
          className="rounded-lg p-1.5 text-warm-400 transition-all duration-200 hover:bg-warm-100 hover:text-warm-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-300 active:scale-95 active:bg-warm-200"
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
