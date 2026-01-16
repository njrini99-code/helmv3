'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { PlanDetail } from '@/components/baseball/dev-plans/PlanDetail';

interface PlanWithPlayer {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  goals: unknown;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    grad_year: number | null;
  } | null;
}

export default function DevPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanWithPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function fetchPlan() {
      if (!params?.id) return;
      setLoading(true);

      const { data, error } = await supabase
        .from('baseball_developmental_plans')
        .select(`
          id,
          title,
          description,
          start_date,
          end_date,
          status,
          goals,
          player:baseball_players (
            id,
            first_name,
            last_name,
            avatar_url,
            primary_position,
            grad_year
          )
        `)
        .eq('id', params.id)
        .single();

      if (!error && data) {
        setPlan(data as PlanWithPlayer);
        setNotFound(false);
      } else {
        setPlan(null);
        setNotFound(true);
      }

      setLoading(false);
    }

    fetchPlan();
  }, [params?.id, supabase]);

  if (loading) {
    return (
      <>
        <Header title="Development Plan" subtitle="Detailed plan view" backHref="/baseball/dashboard/dev-plans" />
        <div className="p-6 lg:p-8">
          <PageLoading />
        </div>
      </>
    );
  }

  if (notFound || !plan) {
    return (
      <>
        <Header title="Development Plan" subtitle="Detailed plan view" backHref="/baseball/dashboard/dev-plans" />
        <div className="p-6 lg:p-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
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
        <PlanDetail plan={plan} />
      </div>
    </>
  );
}
