'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  completeLiftingCoachOnboarding,
  type CompleteLiftingCoachOnboardingArgs,
} from '@/app/lifting/actions/onboarding';
import { assignLiftingTeam, syncOrgAthletes } from '@/app/lifting/actions/assignments';
import {
  inviteLiftingCoach,
  revokeLiftingInvite,
  resendLiftingInvite,
} from '@/app/lifting/actions/invites';
import { getOrgTeamsForLifting, type OrgTeamOption } from './actions';
import type {
  HelmLiftingCoachRow,
  HelmLiftingCoachAssignmentRow,
  HelmLiftingCoachInviteRow,
  HelmLiftingOrgViewerRow,
  HelmLiftingSport,
} from '@/lib/types/helm-lifting';

// ─── Shared primitives ────────────────────────────────────────────────────────

interface OrgInfo {
  id: string;
  name: string;
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-8 h-8 bg-primary-50 rounded-xl flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary-600" />
        </div>
        <h2 className="text-base font-bold text-warm-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function AlertBanner({
  type,
  children,
}: {
  type: 'error' | 'success' | 'info';
  children: React.ReactNode;
}) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-700',
    success: 'bg-primary-50 border-primary-200 text-primary-700',
    info: 'bg-amber-50 border-amber-200 text-amber-700',
  };
  const Icon = type === 'error' ? AlertCircle : type === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-2.5 px-4 py-3 border rounded-xl text-sm ${styles[type]}`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </motion.div>
  );
}

// ─── Team-picker combobox (W8e) ───────────────────────────────────────────────

interface TeamPickerProps {
  orgId: string;
  value: OrgTeamOption | null;
  onChange: (team: OrgTeamOption | null) => void;
  disabled?: boolean;
}

function TeamPicker({ orgId, value, onChange, disabled }: TeamPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [teams, setTeams] = useState<OrgTeamOption[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load teams once (re-fetch if orgId changes)
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    getOrgTeamsForLifting(orgId)
      .then((data) => {
        if (!cancelled) setTeams(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = teams.filter(
    (t) =>
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.sport.toLowerCase().includes(query.toLowerCase()),
  );

  const sportEmoji = (sport: string) => (sport === 'baseball' ? '⚾' : '⛳');

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-warm-200 bg-white/80 text-sm text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-warm-400 flex-shrink-0" />
        ) : (
          <Search className="w-4 h-4 text-warm-400 flex-shrink-0" />
        )}
        <span className={`flex-1 text-left truncate ${value ? 'text-warm-900' : 'text-warm-400'}`}>
          {value ? `${sportEmoji(value.sport)} ${value.name}` : 'Search teams…'}
        </span>
        {value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              setQuery('');
            }}
            aria-label="Clear selection"
            className="w-4 h-4 text-warm-400 hover:text-warm-700 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronDown
            className={`w-4 h-4 text-warm-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 top-full mt-1.5 left-0 right-0 bg-white/95 backdrop-blur-xl border border-white/30 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden"
          >
            {/* Search input */}
            <div className="px-3 pt-2.5 pb-1.5 border-b border-warm-100">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter teams…"
                autoFocus
                className="w-full text-sm text-warm-900 bg-transparent placeholder-warm-400 focus:outline-none"
              />
            </div>

            {/* Options */}
            <ul role="listbox" className="max-h-48 overflow-y-auto py-1.5">
              {teams.length === 0 && !loading ? (
                <li className="px-4 py-2 text-sm text-warm-500 text-center">No teams found</li>
              ) : filtered.length === 0 ? (
                <li className="px-4 py-2 text-sm text-warm-500 text-center">No match</li>
              ) : (
                filtered.map((t) => (
                  <li
                    key={t.id}
                    role="option"
                    aria-selected={value?.id === t.id}
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                      setQuery('');
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-primary-50 transition-colors"
                  >
                    <span className="text-base flex-shrink-0" aria-hidden="true">
                      {sportEmoji(t.sport)}
                    </span>
                    <span className="flex-1 font-medium text-warm-900 truncate">{t.name}</span>
                    <span className="text-xs text-warm-400 capitalize flex-shrink-0">{t.sport}</span>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Invite card (W8b) ────────────────────────────────────────────────────────

interface InviteCardProps {
  invite: HelmLiftingCoachInviteRow;
  orgId: string;
  onRevoked: () => void;
  onResent: () => void;
}

function InviteCard({ invite, onRevoked, onResent }: InviteCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const expiresDate = invite.expires_at ? new Date(invite.expires_at) : null;
  const isExpired = expiresDate ? expiresDate < new Date() : false;

  function handleRevoke() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const result = await revokeLiftingInvite(invite.id);
      if (result.success) {
        onRevoked();
      } else {
        setError(result.error ?? 'Could not revoke.');
      }
    });
  }

  function handleResend() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const result = await resendLiftingInvite(invite.id);
      if (result.success) {
        setMsg('Invite resent successfully.');
        onResent();
      } else {
        setError(result.error ?? 'Could not resend.');
      }
    });
  }

  return (
    <div className="bg-white/50 border border-white/20 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-warm-900 truncate">{invite.email}</p>
          {invite.role_title && (
            <p className="text-xs text-warm-500">{invite.role_title}</p>
          )}
          <p className="text-xs text-warm-400">
            {isExpired ? (
              <span className="text-red-500">Expired</span>
            ) : expiresDate ? (
              <>Expires {expiresDate.toLocaleDateString()}</>
            ) : null}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
            invite.status === 'pending'
              ? isExpired
                ? 'bg-red-50 text-red-600'
                : 'bg-amber-50 text-amber-700'
              : 'bg-warm-100 text-warm-500'
          }`}
        >
          {isExpired ? 'Expired' : invite.status}
        </span>
      </div>

      {error && <AlertBanner type="error">{error}</AlertBanner>}
      {msg && <AlertBanner type="success">{msg}</AlertBanner>}

      {invite.status === 'pending' && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={handleResend}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 h-auto text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg border border-primary-200 transition-all"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Resend
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={handleRevoke}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 h-auto text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition-all"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
            Revoke
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Invite management section (W8b) ─────────────────────────────────────────

interface InviteSectionProps {
  orgId: string;
  initialInvites: HelmLiftingCoachInviteRow[];
}

function InviteSection({ orgId, initialInvites }: InviteSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const invites = initialInvites;
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTitle, setInviteTitle] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    startTransition(async () => {
      const result = await inviteLiftingCoach({
        email: inviteEmail,
        orgId,
        roleTitle: inviteTitle || null,
      });
      if (result.success) {
        setInviteSuccess(`Invitation sent to ${inviteEmail}.`);
        setInviteEmail('');
        setInviteTitle('');
        router.refresh();
        setTimeout(() => setInviteSuccess(null), 5000);
      } else {
        setInviteError(result.error ?? 'Could not send invitation.');
      }
    });
  }

  const handleRevoked = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleResent = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <Section title="Lift Lab coach" icon={Mail}>
      <div className="space-y-4">
        {/* Existing pending invites */}
        {invites.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-warm-600 uppercase tracking-wide">
              Current invite
            </p>
            {invites.map((inv) => (
              <InviteCard
                key={inv.id}
                invite={inv}
                orgId={orgId}
                onRevoked={handleRevoked}
                onResent={handleResent}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <Mail className="w-8 h-8 text-warm-200 mx-auto mb-2" />
            <p className="text-sm text-warm-600 font-medium">No pending invite</p>
            <p className="text-xs text-warm-400 mt-1">
              Send an invitation to bring a strength &amp; conditioning coach into the Lab.
            </p>
          </div>
        )}

        {/* Send invite form */}
        <form
          onSubmit={handleSendInvite}
          className="space-y-3 pt-2 border-t border-white/20"
        >
          <p className="text-xs font-semibold text-warm-600 uppercase tracking-wide">
            {invites.length > 0 ? 'Replace invite' : 'Invite a lifting coach'}
          </p>

          {inviteError && <AlertBanner type="error">{inviteError}</AlertBanner>}
          {inviteSuccess && <AlertBanner type="success">{inviteSuccess}</AlertBanner>}

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="invite-email" className="text-xs font-medium text-warm-700">
                Email <span className="text-red-500">*</span>
              </label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="coach@university.edu"
                required
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="invite-title" className="text-xs font-medium text-warm-700">
                Title{' '}
                <span className="text-warm-400 font-normal">(optional)</span>
              </label>
              <Input
                id="invite-title"
                type="text"
                value={inviteTitle}
                onChange={(e) => setInviteTitle(e.target.value)}
                placeholder="e.g. S&C Coach"
                className="w-full"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={isPending || !inviteEmail}
              className="bg-primary-600 text-white font-semibold rounded-xl px-5 hover:bg-primary-700 active:scale-[0.97] transition-all shadow-sm shadow-primary-600/20 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  <span>Send invite</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </Section>
  );
}

// ─── ViewerSettingsPanel (W8c) ────────────────────────────────────────────────

interface ViewerSettingsPanelProps {
  viewerRow: HelmLiftingOrgViewerRow;
  org: OrgInfo | null;
  pendingInvites: HelmLiftingCoachInviteRow[];
}

export function ViewerSettingsPanel({
  viewerRow,
  org,
  pendingInvites,
}: ViewerSettingsPanelProps) {
  const modeLabel = viewerRow.can_edit ? 'Active program (no dedicated coach)' : 'View-only';
  const sportLabel = viewerRow.sport === 'baseball' ? '⚾ Baseball' : '⛳ Golf';

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-warm-900 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-warm-400" />
          Lifting Lab Settings
        </h1>
        <p className="text-warm-500 text-sm mt-1">
          Manage your Lifting Lab access and invite a dedicated lifting coach
        </p>
      </div>

      {/* Access mode card */}
      <Section title="Your access" icon={Shield}>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-warm-50 border border-warm-200 rounded-xl p-4 space-y-1">
              <p className="text-xs text-warm-500 uppercase tracking-wide font-semibold">
                Organization
              </p>
              <p className="text-sm font-semibold text-warm-900">
                {org?.name ?? 'Unknown organization'}
              </p>
            </div>
            <div className="bg-warm-50 border border-warm-200 rounded-xl p-4 space-y-1">
              <p className="text-xs text-warm-500 uppercase tracking-wide font-semibold">Sport</p>
              <p className="text-sm font-semibold text-warm-900">{sportLabel}</p>
            </div>
            <div className="bg-warm-50 border border-warm-200 rounded-xl p-4 space-y-1 sm:col-span-2">
              <p className="text-xs text-warm-500 uppercase tracking-wide font-semibold">Mode</p>
              <p className="text-sm font-semibold text-warm-900">{modeLabel}</p>
              <p className="text-xs text-warm-400">
                {viewerRow.can_edit
                  ? 'You have full edit access while no dedicated lifting coach is assigned.'
                  : 'You can view all lifting data. A dedicated lifting coach manages edits.'}
              </p>
            </div>
          </div>

          {viewerRow.can_edit && (
            <div className="flex items-start gap-3 px-4 py-3.5 bg-primary-50 border border-primary-200 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary-800">
                  Active program mode
                </p>
                <p className="text-xs text-primary-600 mt-0.5">
                  Invite a dedicated lifting coach to hand off management. Your access
                  will shift to view-only once they accept.
                </p>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Invite a dedicated coach */}
      {org && (
        <InviteSection orgId={org.id} initialInvites={pendingInvites} />
      )}
    </div>
  );
}

// ─── LiftingSettingsClient (full coach view) ──────────────────────────────────

interface Props {
  coachRow: HelmLiftingCoachRow;
  assignments: HelmLiftingCoachAssignmentRow[];
  org: OrgInfo | null;
  canEdit: boolean;
  pendingInvites: HelmLiftingCoachInviteRow[];
}

export function LiftingSettingsClient({
  coachRow,
  assignments,
  org,
  canEdit,
  pendingInvites,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(coachRow.full_name ?? '');
  const [title, setTitle] = useState(coachRow.title ?? '');
  const [phone, setPhone] = useState(coachRow.phone ?? '');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Team assignment state
  const [selectedTeam, setSelectedTeam] = useState<OrgTeamOption | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [syncingTeamId, setSyncingTeamId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);

    startTransition(async () => {
      const args: CompleteLiftingCoachOnboardingArgs = {
        fullName,
        title: title || null,
        organizationId: coachRow.organization_id,
      };
      const result = await completeLiftingCoachOnboarding(args);
      if (result.success) {
        setProfileSuccess(true);
        router.refresh();
        setTimeout(() => setProfileSuccess(false), 3000);
      } else {
        setProfileError(result.error ?? 'Failed to save. Please try again.');
      }
    });
  }

  const sportEmoji = (sport: string) => (sport === 'baseball' ? '⚾' : '⛳');

  async function handleAddTeam(e: React.FormEvent) {
    e.preventDefault();
    setAssignError(null);
    setAssignSuccess(null);
    if (!selectedTeam) {
      setAssignError('Select a team to assign.');
      return;
    }
    startTransition(async () => {
      const result = await assignLiftingTeam({
        orgId: coachRow.organization_id,
        sport: selectedTeam.sport,
        teamId: selectedTeam.id,
        teamNameSnapshot: selectedTeam.name,
      });
      if (result.success) {
        setAssignSuccess(`${selectedTeam.name} assigned successfully.`);
        setSelectedTeam(null);
        router.refresh();
        setTimeout(() => setAssignSuccess(null), 3000);
      } else {
        setAssignError(result.error ?? 'Could not assign team. Please try again.');
      }
    });
  }

  async function handleSyncAthletes(teamId: string | null, sport: HelmLiftingSport) {
    setSyncError(null);
    setSyncSuccess(null);
    setSyncingTeamId(teamId ?? sport);
    startTransition(async () => {
      const result = await syncOrgAthletes({
        orgId: coachRow.organization_id,
        sport,
      });
      setSyncingTeamId(null);
      if (result.success) {
        setSyncSuccess(`Synced ${result.athleteCount ?? 0} athletes.`);
        router.refresh();
        setTimeout(() => setSyncSuccess(null), 3000);
      } else {
        setSyncError(result.error ?? 'Could not sync athletes. Please try again.');
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-warm-900 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-warm-400" />
          Settings
        </h1>
        <p className="text-warm-500 text-sm mt-1">
          Manage your Lifting Lab profile and team assignments
        </p>
      </div>

      {/* Profile section */}
      <Section title="Coach profile" icon={User}>
        <form onSubmit={handleProfileSave} className="space-y-5">
          {profileError && <AlertBanner type="error">{profileError}</AlertBanner>}
          {profileSuccess && <AlertBanner type="success">Profile saved.</AlertBanner>}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="settings-name" className="text-sm font-medium text-warm-700">
                Full name <span className="text-red-500">*</span>
              </label>
              <Input
                id="settings-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={!canEdit}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-title" className="text-sm font-medium text-warm-700">
                Title <span className="text-warm-400 font-normal">(optional)</span>
              </label>
              <Input
                id="settings-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Strength & Conditioning Coach"
                disabled={!canEdit}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-email" className="text-sm font-medium text-warm-700">
                Email
              </label>
              <Input
                id="settings-email"
                type="email"
                value={coachRow.email ?? ''}
                disabled
                className="w-full opacity-60 cursor-not-allowed"
              />
              <p className="text-xs text-warm-400">Email is managed through your account settings</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-phone" className="text-sm font-medium text-warm-700">
                Phone <span className="text-warm-400 font-normal">(optional)</span>
              </label>
              <Input
                id="settings-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                disabled={!canEdit}
                className="w-full"
              />
            </div>
          </div>

          {/* Organization (read-only) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-warm-700">Organization</label>
            <div className="px-4 py-3 bg-warm-50 border border-warm-200 rounded-xl text-sm text-warm-700">
              {org?.name ?? 'Unknown organization'}
            </div>
            <p className="text-xs text-warm-400">Contact support to change your organization</p>
          </div>

          {canEdit && (
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                type="submit"
                disabled={isPending}
                className="bg-primary-600 text-white font-semibold rounded-xl px-6 hover:bg-primary-700 active:scale-[0.97] transition-all shadow-sm shadow-primary-600/20 flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  'Save profile'
                )}
              </Button>
            </div>
          )}
        </form>
      </Section>

      {/* Team assignments */}
      <Section title="Team assignments" icon={Users}>
        <div className="space-y-4">
          {/* Sync feedback */}
          {syncError && <AlertBanner type="error">{syncError}</AlertBanner>}
          {syncSuccess && <AlertBanner type="success">{syncSuccess}</AlertBanner>}

          {/* Assignment list */}
          {assignments.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-warm-200 mx-auto mb-3" />
              <p className="text-sm text-warm-600 font-medium">No teams assigned yet</p>
              {!canEdit && (
                <p className="text-xs text-warm-400 mt-1">
                  Ask your head coach to link your lifting program to their team from their
                  dashboard.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-3 bg-white/50 rounded-xl border border-white/20"
                >
                  <span className="text-lg flex-shrink-0" aria-hidden="true">
                    {sportEmoji(a.sport)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-warm-900 truncate">
                      {a.team_name_snapshot ?? 'Team'}
                    </p>
                    <p className="text-xs text-warm-500 capitalize">{a.sport}</p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      a.is_active
                        ? 'bg-primary-50 text-primary-700'
                        : 'bg-warm-100 text-warm-500'
                    }`}
                  >
                    {a.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isPending && syncingTeamId === (a.team_id ?? a.sport)}
                      onClick={() => handleSyncAthletes(a.team_id, a.sport)}
                      className="text-warm-500 hover:text-primary-600 flex items-center gap-1.5 text-xs px-2 py-1 h-auto"
                      aria-label={`Sync athletes for ${a.team_name_snapshot ?? a.sport}`}
                    >
                      {isPending && syncingTeamId === (a.team_id ?? a.sport) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Sync
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add team form (canEdit only) — W8e: team picker combobox */}
          {canEdit && (
            <form onSubmit={handleAddTeam} className="space-y-3 pt-2 border-t border-white/20">
              <p className="text-xs font-semibold text-warm-600 uppercase tracking-wide">
                Add team
              </p>

              {assignError && <AlertBanner type="error">{assignError}</AlertBanner>}
              {assignSuccess && <AlertBanner type="success">{assignSuccess}</AlertBanner>}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-warm-700">
                  Team <span className="text-red-500">*</span>
                </label>
                {org ? (
                  <TeamPicker
                    orgId={org.id}
                    value={selectedTeam}
                    onChange={setSelectedTeam}
                    disabled={isPending}
                  />
                ) : (
                  <div className="px-3 py-2.5 rounded-xl border border-warm-200 bg-warm-50 text-sm text-warm-500">
                    Organization not found
                  </div>
                )}
                <p className="text-xs text-warm-400">
                  Select a baseball or golf team from your organization.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isPending || !selectedTeam}
                  className="bg-primary-600 text-white font-semibold rounded-xl px-5 hover:bg-primary-700 active:scale-[0.97] transition-all shadow-sm shadow-primary-600/20 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Adding…</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Add team</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Section>

      {/* Invite management (W8b) — only coaches who can invite see this */}
      {canEdit && org && (
        <InviteSection orgId={org.id} initialInvites={pendingInvites} />
      )}
    </div>
  );
}
