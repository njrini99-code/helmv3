'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageLoading } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/use-auth';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import Image from 'next/image';
import {
  IconPlus,
  IconUsers,
  IconCalendar,
  IconVideo,
  IconCopy,
  IconCheck,
  IconEdit,
  IconTrash,
  IconLogOut,
  IconX,
  IconWarning,
} from '@/components/icons';
import { createTeam, updateTeam, deleteTeam, leaveTeamAsCoach, createTeamInvitation, revokeTeamInvitation } from '@/app/baseball/actions/teams';
import { SectionMasthead, EditorsLetter } from '@/components/baseball/living-annual';

interface Team {
  id: string;
  name: string;
  team_type: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  description: string | null;
  join_code: string;
  organization_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  member_count?: number;
}

interface TeamInvite {
  id: string;
  team_id: string;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number | null;
  is_active: boolean | null;
  created_by_coach_id: string;
  created_at: string | null;
  updated_at: string | null;
}

interface TeamFormState {
  name: string;
  description: string;
  primary_color: string;
  secondary_color: string;
}

const EMPTY_FORM: TeamFormState = {
  name: '',
  description: '',
  primary_color: '#16A34A',
  secondary_color: '#FFFFFF',
};

/** Native color swatch + hex text field, defined once and shared by both the
 * create and edit team forms. */
function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-warm-700 mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 min-h-0 p-0 rounded-lg border border-warm-200 cursor-pointer"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1" />
      </div>
    </div>
  );
}

/** Shared Create/Edit team modal — one implementation backs both flows so the
 * form markup (and its design-token compliance) only has to be right once. */
function TeamFormModal({
  title,
  submitLabel,
  isSubmitting,
  form,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  isSubmitting: boolean;
  form: TeamFormState;
  onChange: (form: TeamFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <Button
        type="button"
        variant="ghost"
        aria-label="Close modal"
        haptic="none"
        className="min-h-0 absolute inset-0 block w-full h-full rounded-none bg-warm-900/50 backdrop-blur-sm cursor-default hover:bg-warm-900/50"
        onClick={onCancel}
      >
        {''}
      </Button>
      <div className="relative bg-cream-50 rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-warm-100">
          <h2 className="text-lg font-semibold tracking-tight text-warm-900">{title}</h2>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <Input
            label="Team Name"
            placeholder="e.g., Texas Elite 18U"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            required
          />
          <Textarea
            id="team-form-description"
            label="Description"
            placeholder="Brief description of your team..."
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            rows={3}
          />
          <div className="grid grid-cols-2 gap-4">
            <ColorField
              id="team-form-primary-color"
              label="Primary Color"
              value={form.primary_color}
              onChange={(value) => onChange({ ...form, primary_color: value })}
            />
            <ColorField
              id="team-form-secondary-color"
              label="Secondary Color"
              value={form.secondary_color}
              onChange={(value) => onChange({ ...form, secondary_color: value })}
            />
          </div>
          <div className="flex items-center gap-3 pt-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={isSubmitting}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Delete-team confirmation. Deliberately NOT the generic ConfirmDialog:
 * baseball_teams.id CASCADE-deletes into ~15 dependent tables (games, box
 * scores, player/season stats, documents, tasks, lineups, travel
 * itineraries, invites, staff), so this is a much higher-stakes destructive
 * action than "delete this record." The server already blocks the delete
 * outright when any of that history exists (see deleteTeam in
 * actions/teams.ts) — this dialog's type-the-team-name requirement is
 * defense in depth against a fat-fingered click, and its copy is explicit
 * about the full blast radius rather than just "the roster." */
function DeleteTeamDialog({
  team,
  isLoading,
  onConfirm,
  onCancel,
}: {
  team: Team;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const { modalRef } = useFocusTrap(true, onCancel);
  const canConfirm = confirmText.trim().length > 0 && confirmText.trim() === team.name;

  return (
    <div
      role="presentation"
      className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- stopPropagation prevents backdrop click from closing dialog */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Delete ${team.name}`}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-cream-50 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-warm-100 px-6 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <IconWarning size={20} aria-hidden />
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-warm-900">Delete {team.name}?</h2>
        </div>

        <div className="space-y-3 px-6 py-4">
          <p className="text-sm leading-relaxed text-warm-600">
            This permanently deletes <strong className="text-warm-900">{team.name}</strong> and
            everything attached to it — games, box scores, player and season stats, documents,
            tasks, lineups, travel itineraries, invite links, and coaching staff access. This
            can&apos;t be undone.
          </p>
          <p className="text-sm leading-relaxed text-warm-600">
            Deletion is blocked while the team has an active roster or any recorded history
            (games, stats, uploads, etc.) — this dialog only appears once that history has been
            cleared.
          </p>
          <Input
            id="delete-team-confirm"
            label={`Type "${team.name}" to confirm`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={team.name}
            autoComplete="off"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-warm-100 px-6 py-4">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={isLoading || !canConfirm}
            isLoading={isLoading}
            haptic="heavy"
          >
            Delete Team
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const router = useRouter();
  const { coach, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Map<string, TeamInvite>>(new Map());
  const [primaryByTeam, setPrimaryByTeam] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create team form state
  const [newTeam, setNewTeam] = useState<TeamFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  // Edit team modal state
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editForm, setEditForm] = useState<TeamFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirm state
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);

  // Leave confirm state
  const [leavingTeam, setLeavingTeam] = useState<Team | null>(null);

  // Per-team busy state for invite generate/revoke
  const [inviteBusyTeamId, setInviteBusyTeamId] = useState<string | null>(null);

  async function fetchTeams() {
    if (authLoading || !coach?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // baseball_teams does not have head_coach_id — use baseball_team_coach_staff for lookups
    const { data: staffData, error: staffError } = await supabase
      .from('baseball_team_coach_staff')
      .select('team_id, is_primary')
      .eq('coach_id', coach.id);

    if (staffError) {
      showToast("Couldn't load your teams. Please refresh.", 'error');
      setLoading(false);
      return;
    }

    const coachTeamIds = (staffData || []).map((s) => s.team_id);
    const primaryMap = new Map<string, boolean>();
    (staffData || []).forEach((s) => {
      primaryMap.set(s.team_id, s.is_primary === true);
    });
    setPrimaryByTeam(primaryMap);

    let teamsData: Team[] = [];
    if (coachTeamIds.length > 0) {
      const { data: fetchedTeams, error: teamsError } = await supabase
        .from('baseball_teams')
        .select('*')
        .in('id', coachTeamIds)
        .order('created_at', { ascending: false });

      if (teamsError) {
        showToast("Couldn't load your teams. Please refresh.", 'error');
        setLoading(false);
        return;
      }
      teamsData = (fetchedTeams || []) as Team[];
    }

    // Get member counts
    const teamIds = teamsData?.map((t) => t.id) || [];
    if (teamIds.length > 0) {
      const { data: members } = await supabase
        .from('baseball_team_members')
        .select('team_id')
        .in('team_id', teamIds)
        .eq('status', 'active');

      const counts = new Map<string, number>();
      (members || []).forEach((m) => {
        counts.set(m.team_id, (counts.get(m.team_id) || 0) + 1);
      });

      const teamsWithCounts = (teamsData || []).map((t) => ({
        ...t,
        member_count: counts.get(t.id) || 0,
      }));
      setTeams(teamsWithCounts);

      // Get active invites for each team
      const { data: invitesData } = await supabase
        .from('baseball_team_invitations')
        .select('*')
        .in('team_id', teamIds)
        .eq('is_active', true);

      const inviteMap = new Map<string, TeamInvite>();
      (invitesData || []).forEach((inv) => {
        inviteMap.set(inv.team_id, inv as TeamInvite);
      });
      setInvites(inviteMap);
    } else {
      setTeams([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, coach?.id]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach?.id || !newTeam.name.trim()) return;

    setCreating(true);
    try {
      const result = await createTeam({
        name: newTeam.name.trim(),
        description: newTeam.description || null,
        primary_color: newTeam.primary_color,
        secondary_color: newTeam.secondary_color || null,
      });

      if (!result.success || !result.data) {
        showToast(result.error ?? 'Failed to create team. Please try again.', 'error');
        return;
      }

      const created = result.data;
      setTeams((prev) => [{ ...created, member_count: 0 }, ...prev]);
      setPrimaryByTeam((prev) => new Map(prev).set(created.id, true));
      setShowCreateModal(false);
      setNewTeam(EMPTY_FORM);
      showToast('Team created', 'success');
    } catch {
      showToast('Something went wrong creating this team. Please try again.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (team: Team) => {
    setEditingTeam(team);
    setEditForm({
      name: team.name,
      description: team.description || '',
      primary_color: team.primary_color || '#16A34A',
      secondary_color: team.secondary_color || '#FFFFFF',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam || !editForm.name.trim()) return;

    setSaving(true);
    try {
      const result = await updateTeam({
        team_id: editingTeam.id,
        name: editForm.name.trim(),
        description: editForm.description || null,
        primary_color: editForm.primary_color,
        secondary_color: editForm.secondary_color || null,
      });

      if (!result.success || !result.data) {
        showToast(result.error ?? 'Failed to update team. Please try again.', 'error');
        return;
      }

      const updated = result.data;
      setTeams((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
      setEditingTeam(null);
      showToast('Team updated', 'success');
    } catch {
      showToast('Something went wrong updating this team. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!deletingTeam) return;
    const team = deletingTeam;
    startTransition(async () => {
      try {
        const result = await deleteTeam(team.id);
        if (!result.success) {
          showToast(result.error ?? 'Failed to delete team. Please try again.', 'error');
          return;
        }
        setTeams((prev) => prev.filter((t) => t.id !== team.id));
        setInvites((prev) => {
          const next = new Map(prev);
          next.delete(team.id);
          return next;
        });
        showToast('Team deleted', 'success');
      } catch {
        showToast('Something went wrong deleting this team. Please try again.', 'error');
      } finally {
        setDeletingTeam(null);
      }
    });
  };

  const handleConfirmLeave = () => {
    if (!leavingTeam) return;
    const team = leavingTeam;
    startTransition(async () => {
      try {
        const result = await leaveTeamAsCoach(team.id);
        if (!result.success) {
          showToast(result.error ?? 'Failed to leave team. Please try again.', 'error');
          return;
        }
        setTeams((prev) => prev.filter((t) => t.id !== team.id));
        showToast(`You left ${team.name}`, 'success');
      } catch {
        showToast('Something went wrong leaving this team. Please try again.', 'error');
      } finally {
        setLeavingTeam(null);
      }
    });
  };

  const handleGenerateInvite = async (teamId: string) => {
    if (!coach?.id) return;
    setInviteBusyTeamId(teamId);
    try {
      const result = await createTeamInvitation(teamId);
      if (!result.success || !result.data) {
        showToast(result.error ?? 'Failed to generate invite. Please try again.', 'error');
        return;
      }
      setInvites((prev) => new Map(prev).set(teamId, result.data as TeamInvite));
    } catch {
      showToast('Something went wrong generating the invite. Please try again.', 'error');
    } finally {
      setInviteBusyTeamId(null);
    }
  };

  const handleRevokeInvite = async (teamId: string, invite: TeamInvite) => {
    setInviteBusyTeamId(teamId);
    try {
      const result = await revokeTeamInvitation(invite.id);
      if (!result.success) {
        showToast(result.error ?? 'Failed to revoke invite. Please try again.', 'error');
        return;
      }
      setInvites((prev) => {
        const next = new Map(prev);
        next.delete(teamId);
        return next;
      });
      showToast('Invite revoked', 'success');
    } catch {
      showToast('Something went wrong revoking the invite. Please try again.', 'error');
    } finally {
      setInviteBusyTeamId(null);
    }
  };

  const handleCopyInvite = (code: string) => {
    const url = `${window.location.origin}/baseball/join/${code}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
      },
      () => {
        showToast('Could not copy the invite link. Copy it manually.', 'error');
      },
    );
  };

  if (authLoading || loading) {
    return <PageLoading />;
  }

  if (!coach) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <SectionMasthead eyebrow="THE PRESSBOX · TEAMS" title="Teams" ink="team">
          <p className="font-annual text-body-sm text-text-secondary">Showcase coach access required</p>
        </SectionMasthead>
        <EditorsLetter
          ink="team"
          title="Coaches only."
          body="Please log in as a showcase coach to manage teams."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <SectionMasthead
        eyebrow="THE PRESSBOX · TEAMS"
        title="Teams"
        ink="team"
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <IconPlus size={16} />
            New Team
          </Button>
        }
      >
        <p className="font-annual text-body-sm text-text-secondary">{`Manage your ${teams.length} team${teams.length !== 1 ? 's' : ''}`}</p>
      </SectionMasthead>

      <div>
        {teams.length === 0 ? (
          <EditorsLetter
            ink="team"
            title="No teams yet."
            body="Create your first team to start managing rosters, videos, and development plans."
            action={
              <Button onClick={() => setShowCreateModal(true)}>
                <IconPlus size={16} />
                Create Your First Team
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => {
              const invite = invites.get(team.id);
              const isPrimary = primaryByTeam.get(team.id) === true;
              const inviteBusy = inviteBusyTeamId === team.id;
              return (
                <div
                  key={team.id}
                  className="bg-cream-50 rounded-2xl border border-warm-200 overflow-hidden hover:border-warm-300 hover:shadow-md transition-all"
                >
                  {/* Team Header */}
                  <div
                    className="h-20 relative"
                    style={{ backgroundColor: team.primary_color || '#16A34A' }}
                  >
                    <div className="absolute -bottom-8 left-4">
                      {team.logo_url ? (
                        <Image
                          src={team.logo_url}
                          alt={team.name}
                          width={64}
                          height={64}
                          className="w-16 h-16 rounded-xl border-4 border-white object-cover"
                          unoptimized
                        />
                      ) : (
                        <div
                          className="w-16 h-16 rounded-xl border-4 border-white flex items-center justify-center text-white text-xl font-bold"
                          style={{ backgroundColor: team.primary_color || '#16A34A' }}
                        >
                          {team.name.charAt(0)}
                        </div>
                      )}
                    </div>

                    {/* Edit / Delete / Leave — dark scrim overlay (readable on any team color) */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        haptic="light"
                        onClick={() => openEditModal(team)}
                        className="min-w-[36px] min-h-[36px] p-2 rounded-lg bg-black/20 hover:bg-black/30 text-white"
                        title="Edit team"
                        aria-label={`Edit ${team.name}`}
                      >
                        <IconEdit size={14} />
                      </Button>
                      {isPrimary ? (
                        <Button
                          variant="ghost"
                          haptic="light"
                          onClick={() => setDeletingTeam(team)}
                          className="min-w-[36px] min-h-[36px] p-2 rounded-lg bg-black/20 hover:bg-black/30 text-white"
                          title="Delete team"
                          aria-label={`Delete ${team.name}`}
                        >
                          <IconTrash size={14} />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          haptic="light"
                          onClick={() => setLeavingTeam(team)}
                          className="min-w-[36px] min-h-[36px] p-2 rounded-lg bg-black/20 hover:bg-black/30 text-white"
                          title="Leave team"
                          aria-label={`Leave ${team.name}`}
                        >
                          <IconLogOut size={14} />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Team Info */}
                  <div className="pt-10 px-4 pb-4">
                    <h3 className="text-lg font-semibold tracking-tight text-warm-900">{team.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-sm text-warm-500">
                      <Badge variant="secondary">{team.team_type}</Badge>
                      {isPrimary && <Badge variant="secondary">Primary coach</Badge>}
                      {team.description && (
                        <span className="truncate max-w-[200px]">
                          {team.description}
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-4 py-3 border-t border-warm-100">
                      <div className="flex items-center gap-1.5 text-sm text-warm-600">
                        <IconUsers size={16} className="text-warm-400" />
                        <span>{team.member_count || 0} players</span>
                      </div>
                      {team.join_code && (
                        <div className="flex items-center gap-1.5 text-sm text-warm-600">
                          <IconCalendar size={16} className="text-warm-400" />
                          <span>Code: {team.join_code}</span>
                        </div>
                      )}
                    </div>

                    {/* Invite Link */}
                    <div className="mt-3 p-3 rounded-xl bg-warm-50">
                      <p className="text-xs font-medium text-warm-500 mb-2">Invite Link</p>
                      {invite ? (
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-sm font-mono text-warm-700 truncate">
                            {invite.code}
                          </code>
                          <Button variant="ghost"
                            onClick={() => handleCopyInvite(invite.code)}
                            className="min-w-[44px] min-h-[44px] p-2.5 rounded-lg hover:bg-warm-200 active:bg-warm-300 transition-colors flex items-center justify-center"
                            title="Copy invite link"
                          >
                            {copiedCode === invite.code ? (
                              <IconCheck size={16} className="text-primary-600" />
                            ) : (
                              <IconCopy size={16} className="text-warm-500" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={inviteBusy}
                            isLoading={inviteBusy}
                            onClick={() => handleRevokeInvite(team.id, invite)}
                            className="min-w-[44px] min-h-[44px] p-2.5 rounded-lg hover:bg-destructive/10 active:bg-destructive/20 transition-colors flex items-center justify-center text-warm-500 hover:text-destructive"
                            title="Revoke invite link"
                          >
                            <IconX size={16} />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          disabled={inviteBusy}
                          isLoading={inviteBusy}
                          onClick={() => handleGenerateInvite(team.id)}
                        >
                          Generate Invite Link
                        </Button>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-4">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => router.push(`/baseball/dashboard/roster?team=${team.id}`)}
                      >
                        <IconUsers size={14} />
                        Roster
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => router.push(`/baseball/dashboard/videos?team=${team.id}`)}
                      >
                        <IconVideo size={14} />
                        Videos
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <TeamFormModal
          title="Create New Team"
          submitLabel="Create Team"
          isSubmitting={creating}
          form={newTeam}
          onChange={setNewTeam}
          onSubmit={handleCreateTeam}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {editingTeam && (
        <TeamFormModal
          title={`Edit ${editingTeam.name}`}
          submitLabel="Save Changes"
          isSubmitting={saving}
          form={editForm}
          onChange={setEditForm}
          onSubmit={handleSaveEdit}
          onCancel={() => setEditingTeam(null)}
        />
      )}

      {/* Delete confirm — type-the-team-name gate + explicit cascade warning
          (dedicated dialog, not the generic ConfirmDialog; see
          DeleteTeamDialog above for why). */}
      {deletingTeam && (
        <DeleteTeamDialog
          team={deletingTeam}
          isLoading={isPending}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingTeam(null)}
        />
      )}

      {/* Leave confirm */}
      <ConfirmDialog
        open={!!leavingTeam}
        title="Leave team?"
        message={
          leavingTeam
            ? `You'll lose coaching access to ${leavingTeam.name}. You can be re-invited later by the primary coach.`
            : ''
        }
        confirmLabel="Leave Team"
        variant="warning"
        isLoading={isPending}
        onConfirm={handleConfirmLeave}
        onCancel={() => setLeavingTeam(null)}
      />
    </div>
  );
}
