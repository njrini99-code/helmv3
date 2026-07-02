'use client';

// =============================================================================
// src/components/baseball/staff/StaffSettingsClient.tsx
//
// Wave 11 / packet: decision-room
// MIGRATED to "The Living Annual" kit (design-system-living-annual.md,
// ui-migration-execution-plan.md §3.1 "settings/staff"): the roster header
// becomes a `SectionMasthead` + `KPIContentsStrip`, each staff row is a
// `PaperCard`, status pills become `InkBadge` stamps, and every empty/notice
// state renders through `EditorsLetter`/`EmptyIssue` — never a yellow box.
//
// PRESENTATION ONLY. Same props, same read model, same writes:
// `getStaffSettingsData()` + `inviteStaff`/`revokeStaffInvite`/
// `resendStaffInvite`/`updateStaffCapabilities`/`removeStaff` are untouched.
// `CAPABILITY_DEFS` + `ROLE_PRESETS` are byte-for-byte the same data; only the
// container around the capability-matrix form is reskinned. The `role="switch"`
// / `aria-checked` toggle contract and `<ConfirmDialog>` are preserved verbatim.
//
// Every WRITE is gated client-side by `canManageStaff` (is_head_coach ||
// can_invite_staff) AND server-side by
// withBaseballAction(requiredCapability:'can_invite_staff'). The client gate is
// purely an affordance — the server is the source of truth.
//
// Read-only viewers (staff without can_invite_staff) see the roster + each
// member's capabilities but cannot edit, invite, or remove.
// =============================================================================

import { useState, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { LazyMotion, domAnimation } from 'framer-motion';

import { Button } from '@/components/ui/button';
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
  SectionMasthead,
  KPIContentsStrip,
  PaperCard,
  EditorsLetter,
  EmptyIssue,
  InkBadge,
  HairlineRule,
  Reveal,
} from '@/components/baseball/living-annual';

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
// Capability descriptors (label + helptext for the matrix). UNTOUCHED — the
// exact set of capability keys, labels, and helptext the server understands.
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
  { key: 'can_manage_documents', label: 'Manage documents', help: 'Upload, edit, and delete the team document library.' },
];

const CAP_KEYS = CAPABILITY_DEFS.map((c) => c.key);

function emptyCaps(): Record<string, boolean> {
  return CAP_KEYS.reduce((acc, k) => {
    acc[k] = false;
    return acc;
  }, {} as Record<string, boolean>);
}

// Quick-apply role presets for the invite form. UNTOUCHED.
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
  // Invite handlers — UNTOUCHED write paths.
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
  // Staff edit handlers — UNTOUCHED write paths.
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
  const activeStaffCount = staff.filter((s) => s.status !== 'removed').length;

  return (
    <LazyMotion features={domAnimation}>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Back affordance + masthead */}
        <div className="mb-6">
          <Link
            href="/baseball/dashboard/settings"
            className="mb-3 inline-flex items-center gap-1.5 font-annual text-body-sm text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <IconArrowLeft size={16} />
            Settings
          </Link>
          <SectionMasthead
            eyebrow="THE PRESSBOX · SETTINGS"
            title="Staff & Permissions"
            ink="team"
            actions={
              canManage ? (
                <Button
                  variant="primary"
                  leftIcon={<IconUserPlus size={18} />}
                  onClick={() => setInviteOpen((v) => !v)}
                >
                  Invite staff
                </Button>
              ) : undefined
            }
          >
            <p className="max-w-prose font-annual text-body-lg text-text-secondary">
              Manage your coaching staff and what each coach can access.
            </p>
          </SectionMasthead>
        </div>

        {/* Contents strip — the real counts, on green rules. */}
        <div className="mb-8">
          <KPIContentsStrip
            columns={2}
            items={[
              { label: 'Coaching Staff', value: activeStaffCount },
              { label: 'Pending Invites', value: pendingInvites.length },
            ]}
          />
        </div>

        {!canManage && (
          <div className="mb-6">
            <EditorsLetter
              ink="team"
              title="You have view-only access."
              body={
                <span className="inline-flex items-start gap-2">
                  <IconShield size={16} className="mt-0.5 shrink-0 text-text-tertiary" />
                  <span>
                    You can view the staff roster, but you don&apos;t have permission to
                    invite or edit staff. Ask your head coach for the &ldquo;Invite
                    staff&rdquo; capability.
                  </span>
                </span>
              }
            />
          </div>
        )}

        {/* Invite form */}
        {canManage && inviteOpen && (
          <Reveal className="mb-6">
            <PaperCard className="p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <IconMail size={18} className="text-grade-plus" />
                  <h2 className="font-annual text-h3 text-text-primary">Invite a coach</h2>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setInviteOpen(false)}
                  haptic="none"
                  className="min-h-0 rounded-fw-sm p-1 text-text-tertiary hover:text-text-secondary"
                  aria-label="Close invite form"
                >
                  <IconX size={18} />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="invite-email"
                      className="mb-1.5 block font-annual text-body-sm font-medium text-text-secondary"
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
                      className="mb-1.5 block font-annual text-body-sm font-medium text-text-secondary"
                    >
                      Role / title <span className="text-text-tertiary">(optional)</span>
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
                  <p className="mb-2 font-annual text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                    Quick presets
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ROLE_PRESETS.map((p) => (
                      <Button
                        key={p.label}
                        type="button"
                        variant="ghost"
                        onClick={() => applyPreset(p)}
                        haptic="none"
                        className="min-h-0 rounded-full border border-[color:var(--hairline)] bg-[var(--paper)] px-3 py-1.5 font-annual text-body-sm font-medium text-text-secondary hover:border-grade-plus/40 hover:bg-grade-plus/5 hover:text-grade-plus"
                      >
                        {p.label}
                      </Button>
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
              </div>
            </PaperCard>
          </Reveal>
        )}

        {/* Staff roster */}
        <section className="mb-8">
          <h2 className="mb-3 font-annual text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            Coaching staff
          </h2>
          <div className="space-y-3">
            {staff.length === 0 && <EmptyIssue variant="generic" />}
            {staff.map((member, i) => (
              <Reveal key={member.id} staggerIndex={Math.min(i, 10)}>
                <StaffRow
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
              </Reveal>
            ))}
          </div>
        </section>

        {/* Pending invitations */}
        {canManage && pendingInvites.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-annual text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              Pending invitations
            </h2>
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <PaperCard key={inv.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-annual text-body font-medium text-text-primary">{inv.email}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 font-annual text-body-sm text-text-tertiary">
                        <IconClock size={13} />
                        {inv.isExpired ? (
                          <InkBadge label="Expired" tone="neutral" />
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
                  </div>
                </PaperCard>
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
    <PaperCard className={`p-5 ${isRemoved ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-grade-plus/10 text-grade-plus">
            {isFullAuthority ? <IconStar size={18} /> : <IconShieldCheck size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-annual text-body font-semibold text-text-primary">{member.name}</p>
              {member.isPrimary && <InkBadge label="Primary" tone="team" variant="solid" />}
              {member.isHeadCoach && !member.isPrimary && (
                <InkBadge label="Head coach" tone="team" variant="solid" />
              )}
              {isRemoved && <InkBadge label="Removed" tone="neutral" />}
            </div>
            <p className="truncate font-annual text-body-sm text-text-tertiary">
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
        <p className="mt-3 font-annual text-body-sm text-text-tertiary">
          Full access to every team feature.
        </p>
      ) : isEditing ? (
        <div className="mt-4">
          <HairlineRule ink="hairline" className="mb-4" />
          <div className="mb-3">
            <label
              htmlFor={`role-${member.id}`}
              className="mb-1.5 block font-annual text-body-sm font-medium text-text-secondary"
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
            <span className="font-annual text-body-sm text-text-tertiary">No capabilities granted</span>
          ) : (
            CAPABILITY_DEFS.filter((c) => member.capabilities[c.key]).map((c) => (
              <InkBadge key={c.key} label={c.label} tone="team" />
            ))
          )}
        </div>
      )}
    </PaperCard>
  );
}

// -----------------------------------------------------------------------------
// CapabilityMatrix — toggle grid. Preserves the `role="switch"` / `aria-checked`
// ARIA contract exactly; only the container styling is reskinned to kit tokens.
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
          <Button
            key={cap.key}
            type="button"
            variant="ghost"
            role="switch"
            aria-checked={on}
            disabled={disabled}
            onClick={() => toggle(cap.key)}
            haptic="none"
            className={`min-h-0 h-auto items-start justify-start gap-3 rounded-fw-md border p-3 text-left font-normal ${
              on
                ? 'border-grade-plus/40 bg-grade-plus/5 hover:bg-grade-plus/5'
                : 'border-[color:var(--hairline)] bg-[var(--paper)] hover:border-text-tertiary/40'
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-fw-sm border transition-colors ${
                on ? 'border-grade-plus bg-grade-plus text-white' : 'border-[color:var(--hairline)] bg-[var(--paper)]'
              }`}
            >
              {on && <IconCheck size={13} />}
            </span>
            <span className="min-w-0">
              <span className="block font-annual text-body-sm font-medium text-text-secondary">{cap.label}</span>
              <span className="block font-annual text-body-sm text-text-tertiary">{cap.help}</span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}
