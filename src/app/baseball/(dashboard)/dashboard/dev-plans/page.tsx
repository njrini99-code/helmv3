'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { PageLoading } from '@/components/ui/loading';
import { IconNote, IconPlus, IconUsers, IconTarget, IconCheck, IconClock } from '@/components/icons';
import { CreateDevPlanModal } from '@/components/coach/CreateDevPlanModal';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { getFullName } from '@/lib/utils';

interface DevPlan {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  goals: any;
  created_at: string;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    grad_year: number | null;
  };
}

export default function DevPlansPage() {
  const router = useRouter();
  const { user, coach, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<DevPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (coach?.id) {
      fetchCoachTeam();
    }
  }, [coach?.id]);

  useEffect(() => {
    if (teamId) {
      fetchPlans();
    }
  }, [teamId, filter]);

  async function fetchCoachTeam() {
    if (!coach?.id) return;

    const supabase = createClient();
    const { data } = await supabase
      .from('team_coach_staff')
      .select('team_id')
      .eq('coach_id', coach.id)
      .single();

    if (data?.team_id) {
      setTeamId(data.team_id);
    }
  }

  async function fetchPlans() {
    if (!coach?.id) return;

    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('developmental_plans')
      .select(`
        id,
        title,
        description,
        status,
        start_date,
        end_date,
        goals,
        created_at,
        player:players (
          id,
          first_name,
          last_name,
          avatar_url,
          primary_position,
          grad_year
        )
      `)
      .eq('coach_id', coach.id)
      .order('created_at', { ascending: false });

    // Apply filter
    if (filter === 'active') {
      query = query.in('status', ['sent', 'in_progress']);
    } else if (filter === 'completed') {
      query = query.eq('status', 'completed');
    }

    const { data, error } = await query;

    if (error) {
    } else {
      setPlans(data || []);
    }

    setLoading(false);
  }

  if (authLoading) return <PageLoading />;

  if (user?.role !== 'coach') {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">Only coaches can access development plans.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string | null) => {
    if (!status) return 'secondary';
    const variants = {
      draft: 'secondary',
      sent: 'default',
      in_progress: 'default',
      completed: 'success',
      archived: 'secondary',
    };
    return variants[status as keyof typeof variants] || 'secondary';
  };

  const getStatusLabel = (status: string | null) => {
    if (!status) return 'Unknown';
    const labels = {
      draft: 'Draft',
      sent: 'Sent',
      in_progress: 'In Progress',
      completed: 'Completed',
      archived: 'Archived',
    };
    return labels[status as keyof typeof labels] || status;
  };

  const stats = {
    activePlans: plans.filter(p => p.status && ['sent', 'in_progress'].includes(p.status)).length,
    playersEnrolled: new Set(plans.map(p => p.player?.id).filter(Boolean)).size,
    totalGoals: plans.reduce((sum, p) => sum + (Array.isArray(p.goals) ? p.goals.length : 0), 0),
    completed: plans.filter(p => p.status === 'completed').length,
  };

  return (
    <>
      <Header
        title="Development Plans"
        subtitle="Create and track player development"
      >
        <Button onClick={() => setShowCreateModal(true)}>
          <IconPlus size={16} className="mr-2" />
          Create Plan
        </Button>
      </Header>
      <div className="p-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Active Plans</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.activePlans}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                  <IconNote size={24} className="text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Players Enrolled</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.playersEnrolled}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <IconUsers size={24} className="text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Goals</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.totalGoals}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center">
                  <IconTarget size={24} className="text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Completed</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.completed}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                  <IconCheck size={24} className="text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plans List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Development Plans</h2>
                <p className="text-sm text-slate-500 mt-1">Create personalized plans for your players</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={filter === 'all' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter('all')}
                >
                  All Plans
                </Button>
                <Button
                  variant={filter === 'active' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter('active')}
                >
                  Active
                </Button>
                <Button
                  variant={filter === 'completed' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter('completed')}
                >
                  Completed
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : plans.length === 0 ? (
              /* Empty State */
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <IconNote size={32} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">No development plans yet</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                  Create personalized development plans to help your players improve their skills and reach their goals.
                </p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <IconPlus size={16} className="mr-2" />
                  Create Your First Plan
                </Button>
              </div>
            ) : (
              /* Plans List */
              <div className="space-y-4">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <Avatar
                          name={getFullName(plan.player?.first_name, plan.player?.last_name)}
                          src={plan.player?.avatar_url || undefined}
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-900">{plan.title}</h3>
                            <Badge variant={getStatusBadge(plan.status) as any}>
                              {getStatusLabel(plan.status)}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600 mb-2">
                            {getFullName(plan.player?.first_name, plan.player?.last_name)} •{' '}
                            {plan.player?.primary_position} • {plan.player?.grad_year}
                          </p>
                          {plan.description && (
                            <p className="text-sm text-slate-500 line-clamp-2 mb-2">{plan.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            {Array.isArray(plan.goals) && plan.goals.length > 0 && (
                              <span className="flex items-center gap-1">
                                <IconTarget size={14} />
                                {plan.goals.length} {plan.goals.length === 1 ? 'goal' : 'goals'}
                              </span>
                            )}
                            {plan.start_date && plan.end_date && (
                              <span className="flex items-center gap-1">
                                <IconClock size={14} />
                                {new Date(plan.start_date).toLocaleDateString()} - {new Date(plan.end_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button variant="secondary" size="sm">
                        View Plan
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Cards */}
        <div className="grid grid-cols-2 gap-6 mt-6">
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">What are Development Plans?</h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Development plans help you create structured improvement programs for your players. Each plan includes:
              </p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Specific, measurable goals with target dates</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Customized drills and practice routines</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Progress tracking and completion status</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Video references and instructional content</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Best Practices</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                    1
                  </span>
                  <div>
                    <span className="font-medium text-slate-900">Set realistic timelines</span>
                    <p className="text-slate-500 mt-0.5">Give players adequate time to achieve each goal</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                    2
                  </span>
                  <div>
                    <span className="font-medium text-slate-900">Focus on fundamentals</span>
                    <p className="text-slate-500 mt-0.5">Build strong foundations before advanced skills</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                    3
                  </span>
                  <div>
                    <span className="font-medium text-slate-900">Review progress regularly</span>
                    <p className="text-slate-500 mt-0.5">Check in with players and adjust plans as needed</p>
                  </div>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateDevPlanModal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          router.refresh();
        }}
        teamId={teamId}
      />
    </>
  );
}
