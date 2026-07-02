'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { Card, CardContent } from '@/components/ui/card';
import { PlanDetail } from '@/components/baseball/dev-plans/PlanDetail';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import {
  getDevPlanById,
  completeGoal,
  uncompleteGoal,
  type DevelopmentalPlanWithGoals,
} from '@/app/baseball/actions/dev-plans';

export default function DevPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [plan, setPlan] = useState<DevelopmentalPlanWithGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchPlan = useCallback(async () => {
    if (!params?.id) return;

    try {
      const data = await getDevPlanById(params.id);
      if (data) {
        setPlan(data);
        setNotFound(false);
      } else {
        setPlan(null);
        setNotFound(true);
      }
    } catch {
      setPlan(null);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [params?.id]);

  useEffect(() => {
    setLoading(true);
    fetchPlan();
  }, [fetchPlan]);

  const handleComplete = useCallback(
    (goalId: string) => {
      if (!plan) return;

      startTransition(async () => {
        try {
          await completeGoal(plan.id, goalId);
          await fetchPlan();
        } catch {
          showToast('Could not mark goal complete', 'error');
        }
      });
    },
    [plan, fetchPlan, showToast]
  );

  const handleUncomplete = useCallback(
    (goalId: string) => {
      if (!plan) return;

      startTransition(async () => {
        try {
          await uncompleteGoal(plan.id, goalId);
          await fetchPlan();
        } catch {
          showToast('Could not update goal', 'error');
        }
      });
    },
    [plan, fetchPlan, showToast]
  );

  if (authLoading || loading) {
    return (
      <>
        <Header title="Development Plan" subtitle="Detailed plan view" backHref="/baseball/dashboard/dev-plans" />
        <div className="p-6 lg:p-8">
          <PageLoading />
        </div>
      </>
    );
  }

  if (user?.role !== 'coach') {
    return (
      <>
        <Header title="Development Plan" subtitle="Detailed plan view" backHref="/baseball/dashboard/dev-plans" />
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
        <Header title="Development Plan" subtitle="Detailed plan view" backHref="/baseball/dashboard/dev-plans" />
        <div className="p-6 lg:p-8">
          <div className="rounded-xl border border-warm-200 bg-white p-6 text-sm text-warm-600">
            This development plan could not be found.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Development Plan" subtitle="Detailed plan view" backHref="/baseball/dashboard/dev-plans" />
      <div className="p-6 lg:p-8">
        <PlanDetail
          plan={plan}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          isPending={isPending}
        />
      </div>
    </>
  );
}
