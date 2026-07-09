'use client';

// =============================================================================
// CampsClient — the shared coach + player camps/showcases surface, migrated
// onto "The Living Annual" kit. This is a recruiting-events surface: the
// coach's view (create/manage/roster) reads in Lane 2 · THE WAR ROOM clay ink;
// the player's own registration view reads in Lane 3 · THE PASSPORT green ink
// — the SAME pattern CollegeInterestClient (coach, clay) / AnalyticsClient
// (player, green) already established for role-branched surfaces.
//
// PRESENTATION ONLY. `loadCamps`/`attachActiveCounts`, the register/unregister/
// delete server-action calls, and the create/edit modal wiring are unchanged
// — only the render moved to the kit (skeleton instead of a spinner, a shared
// `<SectionMasthead>` instead of the bespoke `CampsPageHeader`, `<InkBadge>`
// instead of colored status pills).
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ReadModelStateNotice } from '@/components/baseball/ReadModelStateNotice';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconCalendar, IconMapPin, IconUsers, IconPlus, IconHeart, IconHeartFilled, IconEdit, IconTrash, IconEye } from '@/components/icons';
import { CreateCampModal } from '@/components/coach/CreateCampModal';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import { registerForCamp, unregisterFromCamp, deleteCamp } from '@/app/baseball/actions/camps';
import { activeCampCountsByCamp, formatCampDate } from '@/lib/baseball/camp-utils';
import { cn } from '@/lib/utils';
import { SectionMasthead, PaperCard, InkBadge, EditorsLetter, Reveal } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

interface Camp {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  capacity: number | null;
  status: string | null;
  price_cents: number | null;
  is_free: boolean | null;
  registration_deadline: string | null;
  coach_id: string;
  organization_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  organization: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
  registrations: { count: number }[];
  is_registered?: boolean;
}

type CampSupabase = ReturnType<typeof createClient>;

// Attach an ACTIVE (non-cancelled) registration count to each camp. Cancelled
// rows must not consume capacity, so we can't use the raw embedded count. (#443)
async function attachActiveCounts(supabase: CampSupabase, camps: Camp[]): Promise<Camp[]> {
  const ids = camps.map((c) => c.id);
  if (ids.length === 0) return camps;
  const { data } = await supabase
    .from('baseball_camp_registrations')
    .select('camp_id, status')
    .in('camp_id', ids);
  const counts = activeCampCountsByCamp((data ?? []) as { camp_id: string; status: string | null }[]);
  return camps.map((c) => ({ ...c, registrations: [{ count: counts.get(c.id) ?? 0 }] }));
}

// Single source of truth for loading camps + their active counts, shared by the
// initial load, the error-retry, and the post-create refresh.
async function loadCamps(
  supabase: CampSupabase,
  opts: { coachId: string } | { playerActive: true },
): Promise<Camp[]> {
  const base = supabase
    .from('baseball_camps')
    .select('*, organization:organizations(id, name, logo_url)');
  const filtered =
    'coachId' in opts
      ? base.eq('coach_id', opts.coachId)
      : base.eq('status', 'published').gte('end_date', new Date().toISOString());
  const { data, error } = await filtered.order('start_date', { ascending: true });
  if (error) throw error;
  return attachActiveCounts(supabase, (data as Camp[]) ?? []);
}

function CampCard({
  camp,
  ink,
  isPlayer,
  isCoach,
  isRegistered,
  onRegister,
  onUnregister,
  onEdit,
  onDelete
}: {
  camp: Camp;
  ink: 'team' | 'pursuit';
  isPlayer: boolean;
  isCoach: boolean;
  isRegistered: boolean;
  onRegister: (campId: string) => void;
  onUnregister: (campId: string) => void;
  onEdit: (camp: Camp) => void;
  onDelete: (campId: string) => void;
}) {
  const registrationCount = camp.registrations?.[0]?.count || 0;
  const isFull = camp.capacity ? registrationCount >= camp.capacity : false;
  const inkText = ink === 'team' ? 'text-grade-plus' : 'text-pursuit';

  return (
    <PaperCard className="p-5" data-testid="camp-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 font-annual text-body-lg font-semibold text-text-primary">{camp.name}</h3>
          {camp.organization && (
            <p className="mb-2 font-annual text-body-sm text-text-secondary">{camp.organization.name}</p>
          )}
          <div className="flex flex-col gap-1.5 font-annual text-body-sm text-text-tertiary">
            <div className="flex items-center gap-1.5">
              <IconCalendar size={14} />
              <span>
                {formatCampDate(camp.start_date)}
                {camp.end_date && ` - ${formatCampDate(camp.end_date)}`}
              </span>
            </div>
            {camp.location && (
              <div className="flex items-center gap-1.5">
                <IconMapPin size={14} />
                <span>{camp.location}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <IconUsers size={14} />
              <span>
                {registrationCount}{camp.capacity ? ` / ${camp.capacity}` : ''} registered
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <InkBadge
            label={(camp.status === 'published' ? 'Open' : camp.status || 'Pending').toUpperCase()}
            tone={camp.status === 'published' ? ink : 'neutral'}
            variant={camp.status === 'published' ? 'solid' : 'soft'}
          />
          {camp.price_cents && !camp.is_free && (
            <p className="font-annual text-h3 font-semibold text-text-primary">
              ${(camp.price_cents / 100).toFixed(0)}
            </p>
          )}
          {camp.is_free && (
            <p className={cn('font-annual text-h3 font-semibold', inkText)}>Free</p>
          )}
        </div>
      </div>

      {camp.description && (
        <p className="mt-3 line-clamp-2 font-annual text-body-sm text-text-secondary">{camp.description}</p>
      )}

      {/* Player Actions */}
      {isPlayer && (
        <div className="mt-4 flex justify-end border-t border-[color:var(--hairline)] pt-4">
          {isRegistered ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onUnregister(camp.id)}
            >
              <IconHeartFilled size={16} className={cn('mr-1.5', inkText)} />
              Registered
            </Button>
          ) : isFull ? (
            <Button variant="secondary" size="sm" disabled>
              Camp Full
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onRegister(camp.id)}
            >
              <IconHeart size={16} className="mr-1.5" />
              Register
            </Button>
          )}
        </div>
      )}

      {/* Coach Actions */}
      {isCoach && (
        <div className="mt-4 flex justify-end gap-2 border-t border-[color:var(--hairline)] pt-4">
          <Link href={`/baseball/dashboard/camps/${camp.id}`}>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`View roster for ${camp.name}`}
            >
              <IconEye size={16} className="mr-1.5" />
              Roster
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(camp)}
            aria-label={`Edit ${camp.name}`}
          >
            <IconEdit size={16} className="mr-1.5" />
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDelete(camp.id)}
            aria-label={`Delete ${camp.name}`}
          >
            <IconTrash size={16} className="mr-1.5 text-destructive" />
            Delete
          </Button>
        </div>
      )}
    </PaperCard>
  );
}

function CampsSkeleton({ ink }: { ink: 'team' | 'pursuit' }) {
  return (
    <div className={cn(PAGE_SHELL, 'space-y-8')}>
      <SectionMasthead
        eyebrow={ink === 'pursuit' ? 'THE WAR ROOM · CAMPS & SHOWCASES' : 'THE PASSPORT · CAMPS & SHOWCASES'}
        title="Camps"
        ink={ink}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <PaperCard key={i} className="p-5">
            <Skeleton variant="text" width="70%" height={18} className="mb-2" />
            <Skeleton variant="text" width="50%" height={12} className="mb-3" />
            <Skeleton variant="text" width="60%" height={12} className="mb-1.5" />
            <Skeleton variant="text" width="40%" height={12} />
          </PaperCard>
        ))}
      </div>
    </div>
  );
}

export default function CampsClient() {
  const { user, coach, player } = useAuth();
  const { showToast } = useToast();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [registeredCamps, setRegisteredCamps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCamp, setEditingCamp] = useState<Camp | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const isCoach = user?.role === 'coach';
  const isPlayer = user?.role === 'player';
  // Lane ink follows the viewer's role: the coach's own camp management reads
  // clay (War Room recruiting-events), the player's registration view reads
  // green (Passport) — same dual-ink pattern as CollegeInterestClient/AnalyticsClient.
  const ink: 'team' | 'pursuit' = isCoach ? 'pursuit' : 'team';

  useEffect(() => {
    async function fetchCamps() {
      setLoading(true);
      setLoadError(null);

      try {
      if (isCoach && coach) {
        setCamps(await loadCamps(supabase, { coachId: coach.id }));
      } else if (isPlayer && player) {
        // Fetch player's active registrations (exclude cancelled) for the
        // "Registered" badge, then load the active camps + their live counts.
        const { data: playerRegs } = await supabase
          .from('baseball_camp_registrations')
          .select('camp_id')
          .eq('player_id', player.id)
          .neq('status', 'cancelled');

        if (playerRegs) {
          setRegisteredCamps(new Set(playerRegs.map(r => r.camp_id)));
        }

        setCamps(await loadCamps(supabase, { playerActive: true }));
      }
      } catch {
        setCamps([]);
        setLoadError('Camps could not be loaded.');
      }

      setLoading(false);
    }

    fetchCamps();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is stable across renders (useRef at line 203). Adding it would noise the dep array without changing behavior.
  }, [coach, player, isCoach, isPlayer]);

  const handleRegister = async (campId: string) => {
    if (!player) return;

    // Go through the server action so capacity is enforced atomically in the DB
    // (a raw client insert could overbook a camp). Only update the UI on a
    // confirmed registration; surface the reason (e.g. "This camp is full").
    const result = await registerForCamp(campId);

    if (result.success) {
      setRegisteredCamps(prev => new Set(Array.from(prev).concat(campId)));
      setCamps(prev => prev.map(c =>
        c.id === campId
          ? { ...c, registrations: [{ count: (c.registrations?.[0]?.count || 0) + 1 }] }
          : c
      ));
    } else {
      showToast(result.error || 'Failed to register for camp', 'error');
    }
  };

  const handleUnregister = async (campId: string) => {
    if (!player) return;

    // Go through the audited server-action layer instead of a raw
    // client-side write.
    const result = await unregisterFromCamp(campId);

    if (result.success) {
      setRegisteredCamps(prev => {
        const newSet = new Set(prev);
        newSet.delete(campId);
        return newSet;
      });
      setCamps(prev => prev.map(c =>
        c.id === campId
          ? { ...c, registrations: [{ count: Math.max(0, (c.registrations?.[0]?.count || 0) - 1) }] }
          : c
      ));
    } else {
      showToast(result.error || 'Failed to cancel camp registration', 'error');
    }
  };

  const handleEdit = (camp: Camp) => {
    setEditingCamp(camp);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      // Go through the audited server-action layer (deletes registrations +
      // the camp, with an ownership check) instead of raw client-side deletes.
      const result = await deleteCamp(deleteConfirm);

      if (!result.success) {
        showToast(result.error || 'Failed to delete camp', 'error');
        return;
      }

      // Remove from local state
      setCamps(prev => prev.filter(c => c.id !== deleteConfirm));
      showToast('Camp deleted successfully', 'success');
    } catch {
      showToast('An error occurred while deleting', 'error');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return <CampsSkeleton ink={ink} />;
  }

  if (loadError) {
    return (
      <div className={PAGE_SHELL}>
        <SectionMasthead
          eyebrow={ink === 'pursuit' ? 'THE WAR ROOM · CAMPS & SHOWCASES' : 'THE PASSPORT · CAMPS & SHOWCASES'}
          title="Camps"
          ink={ink}
        />
        <div className="mt-6">
          <ReadModelStateNotice
            state="error"
            title="Camps unavailable"
            onRetry={() => {
              setLoading(true);
              setLoadError(null);
              void (async () => {
                try {
                  if (isCoach && coach) {
                    setCamps(await loadCamps(supabase, { coachId: coach.id }));
                  } else if (isPlayer && player) {
                    setCamps(await loadCamps(supabase, { playerActive: true }));
                  }
                } catch {
                  setLoadError('Camps could not be loaded.');
                } finally {
                  setLoading(false);
                }
              })();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(PAGE_SHELL, 'space-y-8')}>
      <SectionMasthead
        eyebrow={ink === 'pursuit' ? 'THE WAR ROOM · CAMPS & SHOWCASES' : 'THE PASSPORT · CAMPS & SHOWCASES'}
        title={isCoach ? 'My Camps' : 'Camps'}
        ink={ink}
        actions={
          isCoach ? (
            <Button onClick={() => setShowCreateModal(true)}>
              <IconPlus size={18} className="mr-2" />
              Create Camp
            </Button>
          ) : undefined
        }
      >
        <p className="max-w-prose font-annual text-body-sm text-text-secondary">
          {isCoach ? `${camps.length} camps` : `${camps.length} available camps`}
        </p>
      </SectionMasthead>

      {camps.length === 0 ? (
        <EditorsLetter
          ink={ink}
          title={isCoach ? 'No camps yet.' : 'No camps available.'}
          body={
            isCoach
              ? 'Create your first camp to start recruiting players.'
              : 'Check back later for upcoming camps and events.'
          }
          action={
            isCoach ? (
              <Button onClick={() => setShowCreateModal(true)}>
                <IconPlus size={18} className="mr-2" />
                Create Camp
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="camps-grid">
          {camps.map((camp, i) => (
            <Reveal key={camp.id} staggerIndex={Math.min(i, 10)}>
              <CampCard
                camp={camp}
                ink={ink}
                isPlayer={isPlayer}
                isCoach={isCoach}
                isRegistered={registeredCamps.has(camp.id)}
                onRegister={handleRegister}
                onUnregister={handleUnregister}
                onEdit={handleEdit}
                onDelete={(id) => setDeleteConfirm(id)}
              />
            </Reveal>
          ))}
        </div>
      )}

      {/* Create/Edit Camp Modal */}
      <CreateCampModal
        open={showCreateModal || !!editingCamp}
        onClose={() => {
          setShowCreateModal(false);
          setEditingCamp(null);
          // Refresh camps list
          if (isCoach && coach) {
            void loadCamps(supabase, { coachId: coach.id })
              .then(setCamps)
              .catch(() => setLoadError('Camps could not be loaded.'));
          }
        }}
        camp={editingCamp}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Camp"
        message="Are you sure you want to delete this camp? All registrations will also be removed. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
