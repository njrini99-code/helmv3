'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconCalendar, IconMapPin, IconUsers, IconPlus, IconHeart, IconHeartFilled, IconEdit, IconTrash } from '@/components/icons';
import { CreateCampModal } from '@/components/coach/CreateCampModal';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';

interface Camp {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  location: string | null;
  capacity: number | null;
  status: string | null;
  price: number | null;
  organization: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
  registrations: { count: number }[];
  is_registered?: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function CampCard({
  camp,
  isPlayer,
  isCoach,
  isRegistered,
  onRegister,
  onUnregister,
  onEdit,
  onDelete
}: {
  camp: Camp;
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

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 mb-1">{camp.name}</h3>
            {camp.organization && (
              <p className="text-sm text-slate-600 mb-2">{camp.organization.name}</p>
            )}
            <div className="flex flex-col gap-1.5 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <IconCalendar size={14} />
                <span>
                  {formatDate(camp.start_date)}
                  {camp.end_date && ` - ${formatDate(camp.end_date)}`}
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
            <Badge
              variant={camp.status === 'active' ? 'success' : 'secondary'}
            >
              {camp.status === 'active' ? 'Open' : camp.status || 'Pending'}
            </Badge>
            {camp.price && (
              <p className="text-lg font-semibold text-slate-900">
                ${camp.price}
              </p>
            )}
          </div>
        </div>

        {camp.description && (
          <p className="text-sm text-slate-600 mt-3 line-clamp-2">{camp.description}</p>
        )}

        {/* Player Actions */}
        {isPlayer && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
            {isRegistered ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onUnregister(camp.id)}
              >
                <IconHeartFilled size={16} className="mr-1.5 text-red-500" />
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
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-2">
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
              <IconTrash size={16} className="mr-1.5 text-red-500" />
              Delete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CampsPage() {
  const { user, coach, player } = useAuth();
  const { showToast } = useToast();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [registeredCamps, setRegisteredCamps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCamp, setEditingCamp] = useState<Camp | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const supabase = createClient();

  const isCoach = user?.role === 'coach';
  const isPlayer = user?.role === 'player';

  useEffect(() => {
    async function fetchCamps() {
      setLoading(true);

      if (isCoach && coach) {
        // Fetch coach's own camps
        const { data } = await supabase
          .from('camps')
          .select(`
            *,
            organization:organizations(id, name, logo_url),
            registrations:camp_registrations(count)
          `)
          .eq('coach_id', coach.id)
          .order('start_date', { ascending: true });

        setCamps(data || []);
      } else if (isPlayer && player) {
        // Fetch all active camps for players
        const { data } = await supabase
          .from('camps')
          .select(`
            *,
            organization:organizations(id, name, logo_url),
            registrations:camp_registrations(count)
          `)
          .eq('status', 'active')
          .gte('end_date', new Date().toISOString())
          .order('start_date', { ascending: true });

        // Fetch player's registrations
        const { data: playerRegs } = await supabase
          .from('camp_registrations')
          .select('camp_id')
          .eq('player_id', player.id)
          .is('cancelled_at', null);

        if (playerRegs) {
          setRegisteredCamps(new Set(playerRegs.map(r => r.camp_id)));
        }

        setCamps(data || []);
      }

      setLoading(false);
    }

    fetchCamps();
  }, [coach, player, isCoach, isPlayer]);

  const handleRegister = async (campId: string) => {
    if (!player) return;

    const { error } = await supabase
      .from('camp_registrations')
      .insert({
        camp_id: campId,
        player_id: player.id,
        status: 'registered',
        created_at: new Date().toISOString(),
      });

    if (!error) {
      setRegisteredCamps(prev => new Set(Array.from(prev).concat(campId)));
      // Update registration count
      setCamps(prev => prev.map(c =>
        c.id === campId
          ? { ...c, registrations: [{ count: (c.registrations?.[0]?.count || 0) + 1 }] }
          : c
      ));
    }
  };

  const handleUnregister = async (campId: string) => {
    if (!player) return;

    const { error } = await supabase
      .from('camp_registrations')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('camp_id', campId)
      .eq('player_id', player.id);

    if (!error) {
      setRegisteredCamps(prev => {
        const newSet = new Set(prev);
        newSet.delete(campId);
        return newSet;
      });
      // Update registration count
      setCamps(prev => prev.map(c =>
        c.id === campId
          ? { ...c, registrations: [{ count: Math.max(0, (c.registrations?.[0]?.count || 0) - 1) }] }
          : c
      ));
    }
  };

  const handleEdit = (camp: Camp) => {
    setEditingCamp(camp);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      // First delete all registrations for this camp
      await supabase
        .from('camp_registrations')
        .delete()
        .eq('camp_id', deleteConfirm);

      // Then delete the camp
      const { error } = await supabase
        .from('camps')
        .delete()
        .eq('id', deleteConfirm);

      if (error) {
        showToast('Failed to delete camp', 'error');
        return;
      }

      // Remove from local state
      setCamps(prev => prev.filter(c => c.id !== deleteConfirm));
      showToast('Camp deleted successfully', 'success');
    } catch (error) {
      showToast('An error occurred while deleting', 'error');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return (
      <>
        <Header
          title={isCoach ? 'My Camps' : 'Camps'}
          subtitle={isCoach ? 'Manage your camps and events' : 'Browse and register for camps'}
        />
        <PageLoading />
      </>
    );
  }

  return (
    <>
      <Header
        title={isCoach ? 'My Camps' : 'Camps'}
        subtitle={isCoach ? `${camps.length} camps` : `${camps.length} available camps`}
      >
        {isCoach && (
          <Button onClick={() => setShowCreateModal(true)}>
            <IconPlus size={18} className="mr-2" />
            Create Camp
          </Button>
        )}
      </Header>
      <div className="p-8">
        {camps.length === 0 ? (
          <EmptyState
            icon={<IconCalendar size={24} />}
            title={isCoach ? 'No camps yet' : 'No camps available'}
            description={
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {camps.map(camp => (
              <CampCard
                key={camp.id}
                camp={camp}
                isPlayer={isPlayer}
                isCoach={isCoach}
                isRegistered={registeredCamps.has(camp.id)}
                onRegister={handleRegister}
                onUnregister={handleUnregister}
                onEdit={handleEdit}
                onDelete={(id) => setDeleteConfirm(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Camp Modal */}
      <CreateCampModal
        open={showCreateModal || !!editingCamp}
        onClose={() => {
          setShowCreateModal(false);
          setEditingCamp(null);
          // Refresh camps list
          if (isCoach && coach) {
            supabase
              .from('camps')
              .select(`
                *,
                organization:organizations(id, name, logo_url),
                registrations:camp_registrations(count)
              `)
              .eq('coach_id', coach.id)
              .order('start_date', { ascending: true })
              .then(({ data }) => {
                setCamps(data || []);
              });
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
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </>
  );
}
