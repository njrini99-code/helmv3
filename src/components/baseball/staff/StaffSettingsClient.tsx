'use client';

// =============================================================================
// src/components/baseball/staff/StaffSettingsClient.tsx
//
// Wave 11 / packet: decision-room
//
// The Staff Settings surface: roster of coaching staff, a per-staffer capability
// matrix editor, pending invitations, and an invite form. Every WRITE is gated
// client-side by `canManageStaff` (is_head_coach || can_invite_staff) AND server-
// side by withBaseballAction(requiredCapability:'can_invite_staff'). The client
// gate is purely an affordance — the server is the source of truth.
//
// Read-only viewers (staff without can_invite_staff) see the roster + each
// member's capabilities but cannot edit, invite, or remove.
// =============================================================================

import { useState, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/sonner';
import {
  IconArrowLeft,
  IconUserPlus,
  IconShieldCheck,
  IconShield,
  IconTrash,
  IconCopy,
  IconRefresh,
  IconX,
  IconCheck,
  IconStar,
  IconMail,
  IconClock,
} from '@/components/icons';

import {
  inviteStaff,
  revokeStaffInvite,
  resendStaffInvite,
  updateStaffCapabilities,
  removeStaff,
} from '@/app/baseball/actions/staff';
import type {
  StaffSettingsData,
  StaffMemberView,
  StaffInvitationView,
} from '@/app/baseball/actions/decision-room';

// -----------------------------------------------------------------------------
// Capability descriptors (label + helptext for the matrix).
// -----------------------------------------------------------------------------

const CAPABILITY_DEFS: { key: string; label: string; help: string }[] = [
  { key: 'can_manage_roster', label: 'Manage roster', help: 'Add, remove, and edit players.' },
  { key: 'can_manage_practice', label: 'Manage practice', help: 'Create and edit practice plans.' },
  { key: 'can_manage_lifting', label: 'Manage lifting', help: 'Program strength & conditioning.' },
  { key: 'can_manage_stats', label: 'Manage stats', help: 'Enter and edit team statistics.' },
  { key: 'can_manage_imports', label: 'Manage imports', help: 'Run roster/stat data imports.' },
  { key: 'can_manage_calendar', label: 'Manage calendar', help: 'Create and edit team events.' },
  { key: 'can_message_players', label: 'Message players', help: 'Send messages to players.' },
  { key: 'can_view_academics', label: 'View academics', help: 'See player academic records.' },
  { key: 'can_view_medical', label: 'View medical', help: 'See player injury/medical info.' },
  { key: 'can_manage_settings', label: 'Manage settings', help: 'Edit team configuration.' },
  { key: 'can_invite_staff', label: 'Invite staff', help: 'Invite and manage other coaches.' },
  { key: 'can_manage_lineups', label: 'Manage lineups', help: 'Build and publish batting orders and lineups.' },
  { key: 'can_view_readiness', label: 'View readiness', help: 'See player wellness and soreness summaries.' },
  { key: 'can_modify_availability', label: 'Modify availability', help: 'Set player availability status and return-to-play.' },
  { key: 'can_view_private_notes', label: 'View private notes', help: 'Read staff-only private notes.' },
  { key: 'can_export_reports', label: 'Export reports', help: 'Export performance and team reports.' },
];

const CAP_KEYS = CAPABILITY_DEFS.map((c) => c.key);

function emptyCaps(): Record<string, boolean> {
  return CAP_KEYS.reduce((acc, k) => {
    acc[k] = false;
    return acc;
  }, {} as Record<string, boolean>);
}

// Quick-apply role presets for the invite form.
const ROLE_PRESETS: { label: string; role: string; caps: string[] }[] = [
  {
    label: 'Assistant Coach',
    role: 'Assistant Coach',
    caps: ['can_manage_practice', 'can_manage_stats', 'can_manage_calendar', 'can_view_academics'],
  },
  {
    label: 'Strength Coach',
    role: 'Strength & Conditioning',
    caps: ['can_manage_lifting', 'can_view_medical'],
  },
  {
    label: 'Recruiting Coord.',
    role: 'Recruiting Coordinator',
    caps: ['can_view_academics', 'can_message_players'],
  },
  {
    label: 'Full Access',
    role: 'Associate Head Coach',
    caps: CAP_KEYS,
  },
];

interface StaffSettingsClientProps {
  initialData: StaffSettingsData;
}

export function StaffSettingsClient({ initialData }: StaffSettingsClientProps) {
  const { showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();

  const [staff, setStaff] = useState<StaffMemberView[]>(initialData.staff);
  const [invitations, setInvitations] = useState<StaffInvitationView[]>(
    initialData.invitations,
  );
  const canManage = initialData.canManageStaff;

  // --- invite form state -----------------------------------------------------
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteCaps, setInviteCaps] = useState<Record<string, boolean>>(emptyCaps());

  // --- per-staffer edit draft state -----------------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaps, setEditCaps] = useState<Record<string, boolean>>(emptyCaps());
  const [editRole, setEditRole] = useState('');

  // --- confirm dialog state --------------------------------------------------
  const [confirm, setConfirm] = useState<
    | { kind: 'removeStaff'; id: string; name: string }
    | { kind: 'revokeInvite'; id: string; email: string }
    | null
  >(null);

  const copyInviteLink = useCallback(
    (token: string) => {
      const url = `${window.location.origin}/baseball/staff/join/${token}`;
      void navigator.clipboard?.writeText(url).then(
        () => showToast('Invite link copied', 'success'),
        () => showToast('Could not copy link', 'error'),
      );
    },
    [showToast],
  );

  // ---------------------------------------------------------------------------
  // Invite handlers
  // ---------------------------------------------------------------------------

  const applyPreset = (preset: (typeof ROLE_PRESETS)[number]) => {
    setInviteRole(preset.role);
    const next = emptyCaps();
    for (const c of preset.caps) if (c in next) next[c] = true;
    setInviteCaps(next);
  };

  const submitInvite = () => {
    if (!inviteEmail.trim()) {
      showToast('Enter an email address', 'error');
      return;
    }
    startTransition(async () => {
      try {
        const res = await inviteStaff({
          email: inviteEmail.trim(),
          role: inviteRole.trim() || null,
          capabilities: inviteCaps,
        });
        if (!res.success) {
          showToast(res.error ?? 'Could not send invitation', 'error');
          return;
        }
        showToast('Invitation created', 'success');
        if (res.data?.token) copyInviteLink(res.data.token);
        // Optimistic local insert; a router refresh would also pick it up.
        setInvitations((prev) => [
          {
            id: `pending-${Date.now()}`,
            email: inviteEmail.trim().toLowerCase(),
            role: inviteRole.trim() || null,
            status: 'pending',
            token: res.data?.token ?? '',
            invitedByName: null,
            expiresAt: new Date(Date.now() + 14 * 864e5).toISOString(),
            acceptedAt: null,
            createdAt: new Date().toISOString(),
            isExpired: false,
          },
          ...prev,
        ]);
        setInviteOpen(false);
        setInviteEmail('');
        setInviteRole('');
        setInviteCaps(emptyCaps());
      } catch {
        showToast('Something went wrong', 'error');
      }
    });
  };

  const doRevoke = (id: string) => {
    startTransition(async () => {
      try {
        const res = await revokeStaffInvite({ invitationId: id });
        if (!res.success) {
          showToast(res.error ?? 'Could not revoke', 'error');
          return;
        }
        setInvitations((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: 'revoked' } : i)),
        );
        showToast('Invitation revoked', 'success');
      } catch {
        showToast('Something went wrong', 'error');
      } finally {
        setConfirm(null);
      }
    });
  };

  const doResend = (inv: StaffInvitationView) => {
    startTransition(async () => {
      try {
        const res = await resendStaffInvite({ invitationId: inv.id });
        if (!res.success) {
          showToast(res.error ?? 'Could not refresh', 'error');
          return;
        }
        setInvitations((prev) =>
          prev.map((i) =>
            i.id === inv.id
              ? { ...i, isExpired: false, expiresAt: new Date(Date.now() + 14 * 864e5).toISOString() }
              : i,
          ),
        );
        if (res.data?.token) copyInviteLink(res.data.token);
        showToast('Invitation refreshed', 'success');
      } catch {
        showToast('Something went wrong', 'error');
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Staff edit handlers
  // ---------------------------------------------------------------------------

  const beginEdit = (member: StaffMemberView) => {
    const next = emptyCaps();
    for (const k of CAP_KEYS) next[k] = member.capabilities[k] === true;
    setEditCaps(next);
    setEditRole(member.role ?? '');
    setEditingId(member.id);
  };

  const saveEdit = (member: StaffMemberView) => {
    startTransition(async () => {
      try {
        const res = await updateStaffCapabilities({
          staffId: member.id,
          role: editRole.trim() || null,
          capabilities: editCaps,
        });
        if (!res.success) {
          showToast(res.error ?? 'Could not update', 'error');
          return;
        }
        setStaff((prev) =>
          prev.map((s) =>
            s.id === member.id
              ? { ...s, role: editRole.trim() || null, capabilities: { ...editCaps } }
              : s,
          ),
        );
        showToast('Capabilities updated', 'success');
        setEditingId(null);
      } catch {
        showToast('Something went wrong', 'error');
      }
    });
  };

  const doRemove = (id: string) => {
    startTransition(async () => {
      try {
        const res = await removeStaff({ staffId: id });
        if (!res.success) {
          showToast(res.error ?? 'Could not remove', 'error');
          return;
        }
        setStaff((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: 'removed' } : s)),
        );
        showToast('Staff member removed', 'success');
      } catch {
        showToast('Something went wrong', 'error');
      } finally {
        setConfirm(null);
      }
    });
  };

  const pendingInvites = invitations.filter((i) => i.status === 'pending');
  const fadeIn = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <LazyMotion features={domAnimation}>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/baseball/dashboard/settings"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-warm-500 transition-colors hover:text-warm-700"
          >
            <IconArrowLeft size={16} />
            Settings
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-warm-900 sm:text-3xl">
                Staff &amp; Permissions
              </h1>
              <p className="mt-1 text-sm text-warm-500">
                Manage your coaching staff and what each coach can access.
              </p>
            </div>
            {canManage && (
              <Button
                variant="primary"
                leftIcon={<IconUserPlus size={18} />}
                onClick={() => setInviteOpen((v) => !v)}
              >
                Invite staff
              </Button>
            )}
          </div>
        </div>

        {!canManage && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-warm-200 bg-warm-50 p-4 text-sm text-warm-600">
            <IconShield size={18} className="mt-0.5 shrink-0 text-warm-400" />
            <span>
              You can view the staff roster, but you don&apos;t have permission to
              invite or edit staff. Ask your head coach for the &ldquo;Invite
              staff&rdquo; capability.
            </span>
          </div>
        )}

        {/* Invite form */}
        {canManage && inviteOpen && (
          <m.div {...fadeIn} className="mb-6">
            <Card variant="raised" padding="lg">
              <CardHeader className="mb-4 flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <IconMail size={18} className="text-primary-600" />
                  Invite a coach
                </CardTitle>
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="rounded-lg p-1 text-warm-400 hover:bg-warm-100 hover:text-warm-600"
                  aria-label="Close invite form"
                >
                  <IconX size={18} />
                </button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="invite-email"
                      className="mb-1.5 block text-sm font-medium text-warm-700"
                    >
                      Email
                    </label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="coach@school.edu"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="invite-role"
                      className="mb-1.5 block text-sm font-medium text-warm-700"
                    >
                      Role / title <span className="text-warm-400">(optional)</span>
                    </label>
                    <Input
                      id="invite-role"
                      placeholder="Assistant Coach"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                    />
                  </div>
                </div>

                {/* Presets */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-warm-400">
                    Quick presets
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ROLE_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="rounded-full border border-warm-200 bg-cream-50 px-3 py-1.5 text-xs font-medium text-warm-700 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Capability matrix */}
                <CapabilityMatrix
                  value={inviteCaps}
                  onChange={setInviteCaps}
                  disabled={isPending}
                />

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={() => setInviteOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={submitInvite}
                    isLoading={isPending}
                    leftIcon={<IconUserPlus size={16} />}
                  >
                    Create invite
                  </Button>
                </div>
              </CardContent>
            </Card>
          </m.div>
        )}

        {/* Staff roster */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-warm-400">
            Coaching staff
          </h2>
          <div className="space-y-3">
            {staff.length === 0 && (
              <Card variant="flat" padding="lg" className="text-center">
                <p className="text-sm text-warm-500">No staff yet.</p>
              </Card>
            )}
            {staff.map((member) => (
              <StaffRow
                key={member.id}
                member={member}
                canManage={canManage}
                isEditing={editingId === member.id}
                editCaps={editCaps}
                editRole={editRole}
                onEditCaps={setEditCaps}
                onEditRole={setEditRole}
                onBeginEdit={() => beginEdit(member)}
                onCancelEdit={() => setEditingId(null)}
                onSave={() => saveEdit(member)}
                onRemove={() =>
                  setConfirm({ kind: 'removeStaff', id: member.id, name: member.name })
                }
                isPending={isPending}
              />
            ))}
          </div>
        </section>

        {/* Pending invitations */}
        {canManage && pendingInvites.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-warm-400">
              Pending invitations
            </h2>
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <Card
                  key={inv.id}
                  variant="flat"
                  padding="md"
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-warm-900">{inv.email}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-warm-500">
                      <IconClock size={13} />
                      {inv.isExpired ? (
                        <span className="text-amber-600">Expired</span>
                      ) : (
                        <>Expires {new Date(inv.expiresAt).toLocaleDateString()}</>
                      )}
                      {inv.role && <span>· {inv.role}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<IconCopy size={15} />}
                      onClick={() => copyInviteLink(inv.token)}
                      disabled={!inv.token}
                    >
                      Copy link
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<IconRefresh size={15} />}
                      onClick={() => doResend(inv)}
                      disabled={isPending}
                    >
                      Refresh
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<IconX size={15} />}
                      onClick={() =>
                        setConfirm({ kind: 'revokeInvite', id: inv.id, email: inv.email })
                      }
                      disabled={isPending}
                    >
                      Revoke
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        <ConfirmDialog
          open={confirm !== null}
          title={
            confirm?.kind === 'removeStaff'
              ? 'Remove staff member?'
              : 'Revoke invitation?'
          }
          message={
            confirm?.kind === 'removeStaff'
              ? `${confirm.name} will lose access to this team. Their history is kept and they can be re-invited later.`
              : confirm?.kind === 'revokeInvite'
                ? `The invitation to ${confirm.email} will no longer be accepted.`
                : ''
          }
          confirmLabel={confirm?.kind === 'removeStaff' ? 'Remove' : 'Revoke'}
          variant="danger"
          isLoading={isPending}
          onConfirm={() => {
            if (confirm?.kind === 'removeStaff') doRemove(confirm.id);
            else if (confirm?.kind === 'revokeInvite') doRevoke(confirm.id);
          }}
          onCancel={() => setConfirm(null)}
        />
      </div>
    </LazyMotion>
  );
}

// -----------------------------------------------------------------------------
// StaffRow
// -----------------------------------------------------------------------------

interface StaffRowProps {
  member: StaffMemberView;
  canManage: boolean;
  isEditing: boolean;
  editCaps: Record<string, boolean>;
  editRole: string;
  onEditCaps: (v: Record<string, boolean>) => void;
  onEditRole: (v: string) => void;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onRemove: () => void;
  isPending: boolean;
}

function StaffRow({
  member,
  canManage,
  isEditing,
  editCaps,
  editRole,
  onEditCaps,
  onEditRole,
  onBeginEdit,
  onCancelEdit,
  onSave,
  onRemove,
  isPending,
}: StaffRowProps) {
  const isFullAuthority = member.isPrimary || member.isHeadCoach;
  const isRemoved = member.status === 'removed';
  const grantedCount = CAP_KEYS.filter((k) => member.capabilities[k]).length;

  return (
    <Card
      variant="raised"
      padding="md"
      className={isRemoved ? 'opacity-60' : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
            {isFullAuthority ? <IconStar size={18} /> : <IconShieldCheck size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-warm-900">{member.name}</p>
              {member.isPrimary && <Badge variant="primary">Primary</Badge>}
              {member.isHeadCoach && !member.isPrimary && (
                <Badge variant="primary">Head coach</Badge>
              )}
              {isRemoved && <Badge variant="secondary">Removed</Badge>}
            </div>
            <p className="truncate text-xs text-warm-500">
              {member.role ?? member.title ?? 'Coach'}
              {member.email && <span> · {member.email}</span>}
            </p>
          </div>
        </div>

        {canManage && !isFullAuthority && !isRemoved && (
          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancelEdit}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSave}
                  isLoading={isPending}
                  leftIcon={<IconCheck size={15} />}
                >
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={onBeginEdit}>
                  Edit access
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  disabled={isPending}
                  aria-label={`Remove ${member.name}`}
                >
                  <IconTrash size={15} />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Capabilities display / editor */}
      {isFullAuthority ? (
        <p className="mt-3 text-xs text-warm-500">
          Full access to every team feature.
        </p>
      ) : isEditing ? (
        <div className="mt-4">
          <div className="mb-3">
            <label
              htmlFor={`role-${member.id}`}
              className="mb-1.5 block text-xs font-medium text-warm-600"
            >
              Role / title
            </label>
            <Input
              id={`role-${member.id}`}
              value={editRole}
              onChange={(e) => onEditRole(e.target.value)}
              placeholder="Assistant Coach"
            />
          </div>
          <CapabilityMatrix value={editCaps} onChange={onEditCaps} disabled={isPending} />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {grantedCount === 0 ? (
            <span className="text-xs text-warm-400">No capabilities granted</span>
          ) : (
            CAPABILITY_DEFS.filter((c) => member.capabilities[c.key]).map((c) => (
              <Badge key={c.key} variant="secondary">
                {c.label}
              </Badge>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// CapabilityMatrix — toggle grid
// -----------------------------------------------------------------------------

interface CapabilityMatrixProps {
  value: Record<string, boolean>;
  onChange: (v: Record<string, boolean>) => void;
  disabled?: boolean;
}

function CapabilityMatrix({ value, onChange, disabled }: CapabilityMatrixProps) {
  const toggle = (key: string) => {
    if (disabled) return;
    onChange({ ...value, [key]: !value[key] });
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CAPABILITY_DEFS.map((cap) => {
        const on = value[cap.key] === true;
        return (
          <button
            key={cap.key}
            type="button"
            role="switch"
            aria-checked={on}
            disabled={disabled}
            onClick={() => toggle(cap.key)}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              on
                ? 'border-primary-300 bg-primary-50'
                : 'border-warm-200 bg-cream-50 hover:border-warm-300'
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                on ? 'border-primary-600 bg-primary-600 text-white' : 'border-warm-300 bg-cream-50'
              }`}
            >
              {on && <IconCheck size={13} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-warm-800">{cap.label}</span>
              <span className="block text-xs text-warm-500">{cap.help}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

