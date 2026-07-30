'use client';

// =============================================================================
// DevPlansClient — the coach's player-development plans list, migrated onto
// "The Living Annual" kit (Lane 1 · THE PRESSBOX, green ink —
// ui-migration-map.md `dev-plan` row). PRESENTATION ONLY: `fetchPlans` (the
// filtered query) and the create-modal wiring are unchanged — only the render
// moved to the kit (skeleton instead of shimmer divs, `<KPIContentsStrip>`
// instead of the four stat cards, `<InkBadge>` instead of the status Badge map,
// `<EmptyIssue variant="dev-plan">` instead of the bespoke "No development
// plans yet" empty state).
// =============================================================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { IconPlus, IconTarget, IconCheck, IconClock } from '@/components/icons';
import { CreateDevPlanModal } from '@/components/coach/CreateDevPlanModal';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { cn, getFullName } from '@/lib/utils';
import {
  SectionMasthead,
  PaperCard,
  Eyebrow,
  KPIContentsStrip,
  InkBadge,
  EmptyIssue,
  EditorsLetter,
  Reveal,
} from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

interface DevPlan {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  goals: Record<string, unknown> | null;
  created_at: string | null;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    grad_year: number | null;
  } | null;
}

const STATUS_BADGE: Record<string, { tone: 'team' | 'neutral'; variant: 'soft' | 'solid' }> = {
  draft: { tone: 'neutral', variant: 'soft' },
  sent: { tone: 'team', variant: 'soft' },
  in_progress: { tone: 'team', variant: 'soft' },
  completed: { tone: 'team', variant: 'solid' },
  archived: { tone: 'neutral', variant: 'soft' },
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
};

type FilterValue = 'all' | 'active' | 'completed';

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: 'All Plans' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

// Segmented filter control — the same clay/green `<Button variant="ghost">`
// pattern used across the kit's other list surfaces (spec §7.1).
function PlanFilterControl({ value, onChange }: { value: FilterValue; onChange: (v: FilterValue) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Plan filter"
      className="inline-flex flex-wrap gap-1 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-1"
    >
      {FILTERS.map((f) => {
        const active = f.value === value;
        return (
          <Button
            key={f.value}
            type="button"
            variant="ghost"
            role="radio"
            aria-checked={active}
            haptic="none"
            onClick={() => onChange(f.value)}
            className={cn(
              'min-h-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
              active
                ? 'bg-grade-plus text-white shadow-sm hover:bg-grade-plus'
                : 'text-text-secondary hover:bg-[color:var(--paper-canvas)]',
            )}
          >
            {f.label}
          </Button>
        );
      })}
    </div>
  );
}

function PlansListSkeleton() {
  return (
    <div className="space-y-4 py-2">
      {[0, 1, 2].map((i) => (
        <PaperCard key={i} className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="40%" height={16} />
              <Skeleton variant="text" width="60%" height={12} />
            </div>
            <Skeleton variant="text" width={64} height={20} />
          </div>
        </PaperCard>
      ))}
    </div>
  );
}

export default function DevPlansClient() {
  const router = useRouter();
  const { user, coach, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();
  const [plans, setPlans] = useState<DevPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (selectedTeamId) {
      fetchPlans();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPlans depends on coach.id and filter; selectedTeamId and filter are already in deps
  }, [selectedTeamId, filter]);

  async function fetchPlans() {
    if (!coach?.id) return;

    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('baseball_developmental_plans')
      .select(`
        id,
        title,
        description,
        status,
        start_date,
        end_date,
        goals,
        created_at,
        player:baseball_players (
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

    if (!error && data) {
      // Transform data to match DevPlan interface
      const transformedPlans: DevPlan[] = data.map(plan => ({
        id: plan.id,
        title: plan.title,
        description: plan.description,
        status: plan.status,
        start_date: plan.start_date,
        end_date: plan.end_date,
        goals: plan.goals as Record<string, unknown> | null,
        created_at: plan.created_at,
        player: plan.player as DevPlan['player'],
      }));
      setPlans(transformedPlans);
    }

    setLoading(false);
  }

  if (authLoading) return <PlansListSkeleton />;

  if (user?.role !== 'coach') {
    return (
      <div className={PAGE_SHELL}>
        <SectionMasthead eyebrow="THE PRESSBOX · DEVELOPMENT PLANS" title="Development Plans" ink="team" />
        <div className="mt-6 mx-auto max-w-lg">
          <EditorsLetter ink="team" title="Coaches only" body="Only coaches can access development plans." />
        </div>
      </div>
    );
  }

  const stats = {
    activePlans: plans.filter(p => p.status && ['sent', 'in_progress'].includes(p.status)).length,
    playersEnrolled: new Set(plans.map(p => p.player?.id).filter(Boolean)).size,
    totalGoals: plans.reduce((sum, p) => sum + (Array.isArray(p.goals) ? p.goals.length : 0), 0),
    completed: plans.filter(p => p.status === 'completed').length,
  };

  return (
    <div className={cn(PAGE_SHELL, 'space-y-8')}>
      <SectionMasthead
        eyebrow="THE PRESSBOX · DEVELOPMENT PLANS"
        title="Development Plans"
        ink="team"
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <IconPlus size={16} className="mr-2" />
            Create Plan
          </Button>
        }
      >
        <p className="max-w-prose font-annual text-body-sm text-text-secondary">
          Create and track player development.
        </p>
      </SectionMasthead>

      <KPIContentsStrip
        columns={4}
        items={[
          { label: 'Active Plans', value: stats.activePlans },
          { label: 'Players Enrolled', value: stats.playersEnrolled },
          { label: 'Total Goals', value: stats.totalGoals },
          { label: 'Completed', value: stats.completed, leader: stats.completed > 0 },
        ]}
      />

      {/* Plans List */}
      <div className="border-t border-[color:var(--hairline)] pt-6">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow as="h2" ink="team">Development Plans</Eyebrow>
            <p className="mt-1 font-annual text-body-sm text-text-secondary">Create personalized plans for your players.</p>
          </div>
          <PlanFilterControl value={filter} onChange={setFilter} />
        </div>

        {loading ? (
          <PlansListSkeleton />
        ) : plans.length === 0 ? (
          <EmptyIssue
            variant="dev-plan"
            ink="team"
            action={
              <Button onClick={() => setShowCreateModal(true)}>
                <IconPlus size={16} className="mr-2" />
                Create Your First Plan
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {plans.map((plan, i) => {
              const badge = STATUS_BADGE[plan.status ?? 'draft'] ?? { tone: 'neutral' as const, variant: 'soft' as const };
              return (
                <Reveal key={plan.id} staggerIndex={Math.min(i, 10)}>
                  <PaperCard className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-1 items-start gap-3">
                        <Avatar
                          name={getFullName(plan.player?.first_name, plan.player?.last_name)}
                          src={plan.player?.avatar_url || undefined}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          {/* items-start (not items-center): a long title can wrap to
                              several lines on a narrow viewport, and centering the badge
                              against the whole multi-line block made it visually land
                              beside a middle line instead of labeling the card — see
                              visual-audit coach-devplans-performance-videos.md [DESIGN].
                              Top-aligning keeps the badge next to the title's first line
                              no matter how many lines it wraps to. */}
                          <div className="mb-1 flex items-start gap-2">
                            <h3 className="font-annual text-body-lg font-semibold text-text-primary">{plan.title}</h3>
                            <InkBadge label={(STATUS_LABEL[plan.status ?? 'draft'] ?? plan.status ?? 'Unknown').toUpperCase()} tone={badge.tone} variant={badge.variant} />
                          </div>
                          <p className="mb-2 font-annual text-body-sm text-text-secondary">
                            {getFullName(plan.player?.first_name, plan.player?.last_name)} •{' '}
                            {plan.player?.primary_position} • {plan.player?.grad_year}
                          </p>
                          {plan.description && (
                            <p className="mb-2 line-clamp-2 font-annual text-body-sm text-text-tertiary">{plan.description}</p>
                          )}
                          <div className="flex items-center gap-4 font-annual text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
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
                      {/* shrink-0: without it, a long title + two-word badge in the
                          sibling column left too little row width and this shrank
                          BELOW its own "View Plan" text's intrinsic width — Button's
                          base classes are whitespace-nowrap + overflow-hidden, so the
                          shrunken box hard-clipped the label to "View" with no
                          ellipsis. shrink-0 forces the title column to wrap/give up
                          width first instead. */}
                      <Button asChild variant="secondary" size="sm" className="shrink-0">
                        <Link href={`/baseball/dashboard/dev-plans/${plan.id}`}>
                          View Plan
                        </Link>
                      </Button>
                    </div>
                  </PaperCard>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 gap-6 border-t border-[color:var(--hairline)] pt-6 md:grid-cols-2">
        <PaperCard className="p-5">
          <Eyebrow as="h2" ink="team">What are Development Plans?</Eyebrow>
          <p className="mb-4 mt-3 font-annual text-body-sm text-text-secondary">
            Development plans help you create structured improvement programs for your players. Each plan includes:
          </p>
          <ul className="space-y-2 font-annual text-body-sm text-text-secondary">
            <li className="flex items-start gap-2">
              <IconCheck size={16} className="mt-0.5 flex-shrink-0 text-grade-plus" />
              <span>Specific, measurable goals with target dates</span>
            </li>
            <li className="flex items-start gap-2">
              <IconCheck size={16} className="mt-0.5 flex-shrink-0 text-grade-plus" />
              <span>Customized drills and practice routines</span>
            </li>
            <li className="flex items-start gap-2">
              <IconCheck size={16} className="mt-0.5 flex-shrink-0 text-grade-plus" />
              <span>Progress tracking and completion status</span>
            </li>
            <li className="flex items-start gap-2">
              <IconCheck size={16} className="mt-0.5 flex-shrink-0 text-grade-plus" />
              <span>Video references and instructional content</span>
            </li>
          </ul>
        </PaperCard>

        <PaperCard className="p-5">
          <Eyebrow as="h2" ink="team">Best Practices</Eyebrow>
          <ul className="mt-3 space-y-3 font-annual text-body-sm text-text-secondary">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[color:var(--hairline)] text-xs font-medium text-text-secondary">
                1
              </span>
              <div>
                <span className="font-medium text-text-primary">Set realistic timelines</span>
                <p className="mt-0.5 text-text-tertiary">Give players adequate time to achieve each goal</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[color:var(--hairline)] text-xs font-medium text-text-secondary">
                2
              </span>
              <div>
                <span className="font-medium text-text-primary">Focus on fundamentals</span>
                <p className="mt-0.5 text-text-tertiary">Build strong foundations before advanced skills</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[color:var(--hairline)] text-xs font-medium text-text-secondary">
                3
              </span>
              <div>
                <span className="font-medium text-text-primary">Review progress regularly</span>
                <p className="mt-0.5 text-text-tertiary">Check in with players and adjust plans as needed</p>
              </div>
            </li>
          </ul>
        </PaperCard>
      </div>

      <CreateDevPlanModal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          router.refresh();
        }}
        teamId={selectedTeamId}
      />
    </div>
  );
}
