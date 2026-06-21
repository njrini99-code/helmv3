'use client';

/**
 * ============================================================================
 * Fairway · Settings · FairwaySettingsGeneral  (COACH + PLAYER · ADDITIVE · GATED)
 * ----------------------------------------------------------------------------
 * Flag-on redesign of the main /golf/dashboard/settings screen (the legacy
 * default-export client page `GolfSettingsPage`). PRESENTATION-ONLY.
 *
 * There is NO server loader for this route — the legacy page fetches everything
 * client-side from the `useGolfUser()` context + the supabase client. This
 * component reuses the SAME plumbing VERBATIM (same context, same supabase
 * client, same `.update()/.upsert()` mutations — never delete-then-insert, same
 * shared widgets and hooks):
 *
 *   • useGolfUser()                       — '@/contexts/golf-user-context'
 *   • useAppearancePreferences()          — '@/hooks/golf/use-appearance-preferences'
 *   • fromUntyped                         — '@/lib/supabase/untyped'
 *     (team panels bind to useGolfUser().teamId — the cookie-aware ACTIVE team)
 *   • BENCHMARK_* (sg benchmark)          — '@/lib/golf/sg-benchmarks'
 *   • AvatarUpload / ConfirmDialog        — '@/components/ui/*'
 *   • JoinTeamSection / CoachHelmToggle   — '@/components/golf/*'
 *   • account delete  → DELETE /api/account/delete   (identical to legacy)
 *
 * Honest empties: unset fields render as empty inputs / em-dash, never faked.
 * Toasts via `fairwayToast`. Tokens / primitives ONLY for chrome — no legacy
 * warm or primary classes, no glass on content.
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field } from '@base-ui-components/react/field';

import { createClient } from '@/lib/supabase/client';
import { clearActiveTeam } from '@/app/golf/actions/team-switcher';
import { fromUntyped } from '@/lib/supabase/untyped';
import { cn } from '@/lib/utils';
import { useGolfUser } from '@/contexts/golf-user-context';
import { triggerHaptic, isNativeApp } from '@/lib/utils/capacitor';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import type { DistancePreference } from '@/lib/golf/distance-units';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/app/actions/notification-preferences';
import {
  DELIVERY_NOTIFICATION_GROUPS,
  type DeliveryNotificationKey,
  type DeliveryNotificationPreferences,
} from '@/lib/coachhelm/v3/notifications/types';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { JoinTeamSection } from '@/components/golf/settings/JoinTeamSection';
import { CoachHelmToggle } from '@/components/golf/coachhelm/v2';
import {
  BENCHMARK_METADATA,
  BENCHMARK_LEVELS,
  type BenchmarkLevel,
} from '@/lib/golf/sg-benchmarks';
import {
  IconUser,
  IconMail,
  IconShield,
  IconBell,
  IconChevronRight,
  IconLogout,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconRuler,
} from '@/components/icons';

import {
  ViewHeader,
  Surface,
  Button,
  Input,
  Select,
  Switch,
  Avatar,
  fairwayToast,
} from '@/components/fairway';

const EM_DASH = '—';

interface PlayerData {
  first_name: string | null;
  last_name: string | null;
  handicap: number | null;
  handicap_index: number | null;
  graduation_year: number | null;
  hometown: string | null;
  state: string | null;
  phone: string | null;
}

interface SettingsProfile {
  userId: string;
  coachId?: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: 'coach' | 'player';
  teamName?: string;
  teamId?: string;
  organizationId?: string;
  playerId?: string;
  playerData?: PlayerData;
  currentTeam?: {
    id: string;
    name: string;
    organization?: { name: string } | null;
  } | null;
}

/* ── shared section card ──────────────────────────────────────────────────── */

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Surface elevation="border" padding="lg">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-sm bg-surface-sunken text-text-secondary">
          {icon}
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="font-fw-display text-h2 text-text-primary">{title}</h2>
          {description ? (
            <p className="font-fw-sans text-body-sm text-text-secondary">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </Surface>
  );
}

/** Shared visual recipe for every field label (input-bound or group/display). */
const FIELD_LABEL_CLASS =
  'mb-1.5 block font-fw-sans text-body-sm font-medium text-text-secondary';

/**
 * Visual-only label for non-control rows — button groups (display density, tees,
 * benchmark…) and read-only display values (current email, invite code/link).
 * These have no single focusable control to associate, so a plain <span> is the
 * correct, honest markup. For real text inputs use `LabeledField` instead.
 */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className={FIELD_LABEL_CLASS}>{children}</span>;
}

/**
 * A11y (P372): label↔control association for every text input. Wraps the control
 * in Base UI's `Field` so the rendered <label> auto-wires `htmlFor` to the
 * control's generated `id` (WCAG 1.3.1/3.3.2/4.1.2) — screen readers, voice
 * control and click-to-focus all work, with no manual id bookkeeping. The
 * Fairway `Input` registers itself as the field control when nested here.
 */
function LabeledField({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Field.Root className={className}>
      <Field.Label className={FIELD_LABEL_CLASS}>{label}</Field.Label>
      {children}
    </Field.Root>
  );
}

function SaveRow({
  onSave,
  busy,
  label = 'Save changes',
}: {
  onSave: () => void;
  busy: boolean;
  label?: string;
}) {
  return (
    <div className="mt-5 flex justify-end border-t border-border-subtle pt-4">
      <Button variant="primary" size="sm" busy={busy} onClick={onSave}>
        {label}
      </Button>
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */

export function FairwaySettingsGeneral() {
  const golfUser = useGolfUser();
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    // B16: a failed fetch must NOT leave the page stuck on an infinite skeleton.
    // Reset the error flag, then surface a retryable error card on throw.
    setLoadError(false);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';

      if (golfUser.role === 'coach') {
        setProfile({
          userId: golfUser.userId,
          coachId: golfUser.coachId,
          name: golfUser.name,
          email,
          avatarUrl: golfUser.avatarUrl || null,
          role: 'coach',
          teamName: golfUser.teamName,
          teamId: golfUser.teamId,
          organizationId: golfUser.organizationId,
        });
        return;
      }

      if (golfUser.playerId) {
        const [playerResult, teamResult] = await Promise.all([
          supabase
            .from('golf_players')
            .select('first_name, last_name, avatar_url, handicap, handicap_index, graduation_year, hometown, state, phone')
            .eq('id', golfUser.playerId)
            .maybeSingle(),
          golfUser.teamId
            ? supabase
                .from('golf_teams')
                .select('id, name, organization:organizations(name)')
                .eq('id', golfUser.teamId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const player = playerResult.data;
        const team = teamResult.data;

        let currentTeam: SettingsProfile['currentTeam'] = null;
        if (team) {
          const org = Array.isArray(team.organization) ? team.organization[0] : team.organization;
          currentTeam = {
            id: team.id,
            name: team.name,
            organization: org ? { name: org.name } : null,
          };
        }

        setProfile({
          userId: golfUser.userId,
          name: golfUser.name,
          email,
          avatarUrl: player?.avatar_url ?? golfUser.avatarUrl ?? null,
          role: 'player',
          teamName: golfUser.teamName,
          playerId: golfUser.playerId,
          currentTeam,
          playerData: player
            ? {
                first_name: player.first_name,
                last_name: player.last_name,
                handicap: player.handicap,
                handicap_index: player.handicap_index,
                graduation_year: player.graduation_year,
                hometown: player.hometown,
                state: player.state,
                phone: player.phone,
              }
            : undefined,
        });
      }
    } catch {
      setLoadError(true);
    }
  }, [golfUser]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSignOut = async () => {
    void triggerHaptic('heavy');
    const supabase = createClient();
    await clearActiveTeam();
    await supabase.auth.signOut();
    window.location.href = '/golf/login';
  };

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const response = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        void triggerHaptic('error');
        fairwayToast.error(payload.error || 'Failed to delete account');
        return;
      }
      void triggerHaptic('success');
      fairwayToast.success('Account deleted successfully');
      window.location.href = isNativeApp() ? '/golf/login' : '/';
    } catch {
      void triggerHaptic('error');
      fairwayToast.error('Failed to delete account');
    } finally {
      setDeletingAccount(false);
      setDeleteConfirmOpen(false);
    }
  };

  if (loadError && !profile) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
        <ViewHeader eyebrow="Settings" title="Settings" />
        <Surface elevation="border" padding="lg" className="mt-8 flex flex-col items-start gap-3">
          <h2 className="font-fw-display text-h2 text-text-primary">Couldn&rsquo;t load settings</h2>
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Something went wrong loading your account. Please try again.
          </p>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<IconRefresh size={16} aria-hidden />}
            onClick={() => void loadProfile()}
          >
            Retry
          </Button>
        </Surface>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
        <ViewHeader eyebrow="Settings" title="Settings" />
        <div className="mt-8 space-y-6">
          {[1, 2, 3].map((i) => (
            <Surface key={i} elevation="border" padding="lg">
              <div className="h-5 w-40 rounded bg-surface-sunken" />
              <div className="mt-3 h-3 w-64 rounded bg-surface-sunken" />
            </Surface>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Settings"
        title="Settings"
        description="Manage your account and preferences."
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span className="capitalize">{profile.role}</span>
            {profile.teamName ? (
              <>
                <span aria-hidden>·</span>
                <span>{profile.teamName}</span>
              </>
            ) : null}
          </span>
        }
      />

      <div className="mt-8 space-y-6">
        {/* Identity card */}
        <Surface elevation="border" padding="md" className="flex items-center gap-4">
          <Avatar src={profile.avatarUrl ?? undefined} name={profile.name} size="lg" />
          <div className="min-w-0">
            <p className="font-fw-sans text-body-lg font-medium text-text-primary">
              {profile.name || EM_DASH}
            </p>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              {profile.email || EM_DASH}
            </p>
          </div>
        </Surface>

        {/* Account */}
        <PersonalInfoPanel profile={profile} onUpdate={loadProfile} />
        <EmailPanel currentEmail={profile.email} />
        <PasswordPanel />

        {/* Preferences */}
        <AppearancePanel />
        <DistanceUnitsPanel />
        {/* Notifications — coach + player. Writes users.notification_preferences,
            the column the email/push delivery gate actually reads. */}
        <NotificationsPanel />
        {profile.role === 'player' ? (
          <Surface elevation="border" padding="none">
            <Link
              href="/golf/dashboard/settings/notifications"
              className="flex items-center gap-3 p-5 outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-sm bg-surface-sunken text-text-secondary">
                <IconBell size={18} aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-fw-sans text-body font-medium text-text-primary">
                  Per-category notifications
                </span>
                <span className="block font-fw-sans text-body-sm text-text-secondary">
                  Fine-grained AI insight & goal channels.
                </span>
              </span>
              <IconChevronRight size={18} className="shrink-0 text-text-tertiary" aria-hidden />
            </Link>
          </Surface>
        ) : null}
        {profile.role === 'coach' ? (
          <Surface elevation="border" padding="none">
            <Link
              href="/golf/dashboard/settings/coaching-intelligence"
              className="flex items-center gap-3 p-5 outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-sm bg-surface-sunken text-text-secondary">
                <IconShield size={18} aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-fw-sans text-body font-medium text-text-primary">
                  Coaching Intelligence
                </span>
                <span className="block font-fw-sans text-body-sm text-text-secondary">
                  CoachHelm AI insights, priorities and alerts.
                </span>
              </span>
              <IconChevronRight size={18} className="shrink-0 text-text-tertiary" aria-hidden />
            </Link>
          </Surface>
        ) : null}

        {/* Golf settings */}
        {profile.role === 'coach' && profile.teamId ? (
          <GolfScoringPanel teamId={profile.teamId} />
        ) : null}
        {profile.role === 'player' && profile.playerId ? (
          <PlayerGolfDetailsPanel
            playerId={profile.playerId}
            playerData={profile.playerData}
            onUpdate={loadProfile}
          />
        ) : null}

        {/* AI features (coach) */}
        {profile.role === 'coach' && profile.coachId ? (
          <SectionCard
            icon={<IconShield size={18} aria-hidden />}
            title="AI Features"
            description="Enable or disable CoachHelm for your own dashboards."
          >
            <CoachHelmToggle coachId={profile.coachId} />
          </SectionCard>
        ) : null}

        {/* Team */}
        {profile.role === 'coach' ? (
          <TeamSettingsPanel onUpdate={loadProfile} />
        ) : null}
        {profile.role === 'coach' ? <InviteSettingsPanel /> : null}
        {profile.role === 'player' && profile.playerId ? (
          <JoinTeamSection playerId={profile.playerId} currentTeam={profile.currentTeam} />
        ) : null}

        {/* Legal */}
        <Surface elevation="border" padding="none">
          <Link
            href="/privacy"
            className="flex items-center gap-3 border-b border-border-subtle p-5 outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
          >
            <span className="flex-1 font-fw-sans text-body font-medium text-text-primary">
              Privacy Policy
            </span>
            <IconChevronRight size={18} className="shrink-0 text-text-tertiary" aria-hidden />
          </Link>
          <Link
            href="/terms"
            className="flex items-center gap-3 p-5 outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
          >
            <span className="flex-1 font-fw-sans text-body font-medium text-text-primary">
              Terms of Service
            </span>
            <IconChevronRight size={18} className="shrink-0 text-text-tertiary" aria-hidden />
          </Link>
        </Surface>

        {/* Danger zone */}
        <Surface elevation="border" padding="lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-fw-sans text-body font-medium text-text-primary">
                Delete account
              </p>
              <p className="font-fw-sans text-body-sm text-text-secondary">
                Permanently remove your account and all data.
              </p>
            </div>
            <Button
              variant="danger"
              busy={deletingAccount}
              onClick={() => {
                void triggerHaptic('warning');
                setDeleteConfirmOpen(true);
              }}
            >
              Delete account
            </Button>
          </div>
        </Surface>

        {/* Sign out */}
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<IconLogout size={16} aria-hidden />}
          onClick={() => void handleSignOut()}
        >
          Sign out
        </Button>

        <p className="py-2 text-center font-fw-sans text-caption text-text-tertiary">
          GolfHelm · © 2026 Helm Sports Labs
        </p>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete account?"
        message="This will permanently delete your account and all associated data. This action cannot be undone."
        confirmLabel="Delete Account"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingAccount}
        onConfirm={confirmDeleteAccount}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}

/* ── Personal info ────────────────────────────────────────────────────────── */

function PersonalInfoPanel({
  profile,
  onUpdate,
}: {
  profile: SettingsProfile;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState(profile.playerData?.first_name || '');
  const [lastName, setLastName] = useState(profile.playerData?.last_name || '');
  const [fullName, setFullName] = useState(profile.role === 'coach' ? profile.name : '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl || null);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (profile.role === 'coach') {
        const { error } = await supabase
          .from('golf_coaches')
          .update({ full_name: fullName.trim(), avatar_url: avatarUrl })
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('golf_players')
          .update({ first_name: firstName.trim(), last_name: lastName.trim(), avatar_url: avatarUrl })
          .eq('user_id', user.id);
        if (error) throw error;
      }

      fairwayToast.success('Profile updated');
      onUpdate();
      router.refresh();
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard icon={<IconUser size={18} aria-hidden />} title="Personal information">
      <div className="space-y-4">
        <div>
          <FieldLabel>Profile picture</FieldLabel>
          <AvatarUpload
            currentAvatarUrl={avatarUrl}
            name={profile.role === 'coach' ? fullName : `${firstName} ${lastName}`}
            onUploadComplete={(url) => setAvatarUrl(url)}
            onRemove={() => setAvatarUrl(null)}
          />
        </div>

        {profile.role === 'coach' ? (
          <LabeledField label="Full name">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Coach Smith"
            />
          </LabeledField>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="First name">
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
              />
            </LabeledField>
            <LabeledField label="Last name">
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
              />
            </LabeledField>
          </div>
        )}
      </div>
      <SaveRow onSave={handleSave} busy={saving} />
    </SectionCard>
  );
}

/* ── Email ────────────────────────────────────────────────────────────────── */

function EmailPanel({ currentEmail }: { currentEmail: string }) {
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  const handleSave = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      fairwayToast.error('Please enter a valid email');
      return;
    }
    if (newEmail === currentEmail) {
      fairwayToast.error('Same as current email');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      fairwayToast.success('Confirmation email sent. Check your inbox.');
      setNewEmail('');
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to update email');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard icon={<IconMail size={18} aria-hidden />} title="Email address">
      <div className="space-y-3">
        <div>
          <FieldLabel>Current email</FieldLabel>
          <div className="rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2 font-fw-sans text-body-sm text-text-secondary">
            {currentEmail || EM_DASH}
          </div>
        </div>
        <LabeledField label="New email address">
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
          />
        </LabeledField>
        <p className="font-fw-sans text-caption text-text-tertiary">
          We&rsquo;ll send a confirmation email to verify the change.
        </p>
      </div>
      <SaveRow onSave={handleSave} busy={saving} label="Send confirmation" />
    </SectionCard>
  );
}

/* ── Password ─────────────────────────────────────────────────────────────── */

function PasswordPanel() {
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSave = async () => {
    if (newPassword.length < 8) {
      fairwayToast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      fairwayToast.error('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      fairwayToast.success('Password updated');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard icon={<IconShield size={18} aria-hidden />} title="Password & security">
      <div className="space-y-3">
        <LabeledField label="New password">
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
          />
        </LabeledField>
        <LabeledField label="Confirm password">
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </LabeledField>
        <p className="font-fw-sans text-caption text-text-tertiary">
          At least 8 characters. Use a unique password.
        </p>
      </div>
      <SaveRow onSave={handleSave} busy={saving} label="Update password" />
    </SectionCard>
  );
}

/* ── Appearance ───────────────────────────────────────────────────────────── */

function OptionTile({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-[48px] rounded-fw-sm border p-3 text-left transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
        active
          ? 'border-accent-500 bg-accent-50'
          : 'border-border-subtle hover:border-border-strong',
      )}
    >
      <p className="font-fw-sans text-body-sm font-medium text-text-primary">{title}</p>
      {hint ? <p className="font-fw-sans text-caption text-text-tertiary">{hint}</p> : null}
    </button>
  );
}

function AppearancePanel() {
  const { displayDensity, dateFormat, showAnimations, scoreDisplay, updatePreferences } =
    useAppearancePreferences();

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Appearance"
      description="Changes apply instantly across the app."
    >
      <div className="space-y-5">
        <div>
          <FieldLabel>Display density</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {(['comfortable', 'compact'] as const).map((opt) => (
              <OptionTile
                key={opt}
                active={displayDensity === opt}
                onClick={() => updatePreferences({ displayDensity: opt })}
                title={opt.charAt(0).toUpperCase() + opt.slice(1)}
                hint={opt === 'comfortable' ? 'More spacing' : 'Denser layout'}
              />
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Date format</FieldLabel>
          <div className="grid gap-2">
            {([
              { val: 'MM/DD/YYYY' as const, ex: '01/28/2026' },
              { val: 'DD/MM/YYYY' as const, ex: '28/01/2026' },
              { val: 'YYYY-MM-DD' as const, ex: '2026-01-28' },
            ]).map(({ val, ex }) => (
              <button
                key={val}
                type="button"
                aria-pressed={dateFormat === val}
                onClick={() => updatePreferences({ dateFormat: val })}
                className={cn(
                  'flex min-h-[48px] items-center justify-between rounded-fw-sm border px-3 py-2.5 text-left transition-colors',
                  'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                  dateFormat === val
                    ? 'border-accent-500 bg-accent-50'
                    : 'border-border-subtle hover:border-border-strong',
                )}
              >
                <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                  {val}
                </span>
                <span className="font-fw-sans text-caption text-text-tertiary">{ex}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Score display</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <OptionTile
              active={scoreDisplay === 'to_par'}
              onClick={() => updatePreferences({ scoreDisplay: 'to_par' })}
              title="Score to par"
              hint="E, +2, -1"
            />
            <OptionTile
              active={scoreDisplay === 'raw'}
              onClick={() => updatePreferences({ scoreDisplay: 'raw' })}
              title="Raw score"
              hint="72, 74, 71"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-fw-sans text-body-sm font-medium text-text-primary">Animations</p>
            <p className="font-fw-sans text-caption text-text-tertiary">
              Enable smooth transitions and effects.
            </p>
          </div>
          <Switch
            checked={showAnimations}
            onCheckedChange={() => updatePreferences({ showAnimations: !showAnimations })}
            aria-label="Animations"
          />
        </div>
      </div>
    </SectionCard>
  );
}

/* ── Distance units ───────────────────────────────────────────────────────── */

/** Restores the legacy yd/m display preference (localStorage-backed). */
function DistanceUnitsPanel() {
  const { distancePref, setDistancePref } = useDistanceUnits();

  const options: Array<{
    value: DistancePreference;
    label: string;
    desc: string;
    example: string;
  }> = [
    { value: 'yards', label: 'Yards', desc: 'Standard US / golf measurement', example: '150 yds · 10 ft putts' },
    { value: 'meters', label: 'Meters', desc: 'International metric system', example: '137 m · 3 m putts' },
  ];

  return (
    <SectionCard
      icon={<IconRuler size={18} aria-hidden />}
      title="Distance units"
      description="Only affects display — all data is stored in yards and feet."
    >
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ value, label, desc, example }) => (
          <OptionTile
            key={value}
            active={distancePref === value}
            onClick={() => {
              void triggerHaptic('light');
              setDistancePref(value);
            }}
            title={label}
            hint={`${desc} · ${example}`}
          />
        ))}
      </div>
    </SectionCard>
  );
}

/* ── Notifications (coach + player) ────────────────────────────────────────── */

/**
 * Writes users.notification_preferences — the JSONB column the email/push
 * delivery gate (getUserNotificationPreferences → shouldSendEmail) actually
 * reads. Each row gates an email and (where the channel exists) a push channel;
 * quiet mode silences everything except the quiet-exempt rows. Available to
 * BOTH coaches and players (the live shell previously gave coaches no UI here).
 */
function NotificationsPanel() {
  const [prefs, setPrefs] = useState<DeliveryNotificationPreferences | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    const res = await getNotificationPreferences();
    if (res.error || !res.data) {
      setLoadFailed(true);
      return;
    }
    setPrefs(res.data as DeliveryNotificationPreferences);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Optimistic single-key toggle: flip locally, persist, roll back on failure.
  const toggle = useCallback(
    async (key: DeliveryNotificationKey | 'quiet_mode', next: boolean) => {
      if (!prefs) return;
      const previous = prefs;
      const optimistic = { ...prefs, [key]: next };
      setPrefs(optimistic);
      setSaving(true);
      const res = await updateNotificationPreferences({ [key]: next });
      setSaving(false);
      if (!res.success) {
        setPrefs(previous);
        void triggerHaptic('error');
        fairwayToast.error(res.error || 'Failed to save preference');
      } else {
        void triggerHaptic('light');
      }
    },
    [prefs],
  );

  if (loadFailed && !prefs) {
    return (
      <SectionCard icon={<IconBell size={18} aria-hidden />} title="Notifications">
        <div className="flex flex-col items-start gap-3">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Couldn&rsquo;t load your notification preferences.
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<IconRefresh size={16} aria-hidden />}
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      </SectionCard>
    );
  }

  if (!prefs) {
    return (
      <SectionCard icon={<IconBell size={18} aria-hidden />} title="Notifications">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 w-full rounded-fw-sm bg-surface-sunken" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<IconBell size={18} aria-hidden />}
      title="Notifications"
      description="Choose how each kind of update reaches you."
    >
      <div className="space-y-1">
        {/* Quiet mode */}
        <div className="flex items-center justify-between gap-3 rounded-fw-sm bg-surface-sunken p-3">
          <div className="min-w-0">
            <p className="font-fw-sans text-body-sm font-medium text-text-primary">Quiet mode</p>
            <p className="font-fw-sans text-caption text-text-tertiary">
              Silences everything except messages.
            </p>
          </div>
          <Switch
            checked={prefs.quiet_mode}
            onCheckedChange={(v) => void toggle('quiet_mode', v)}
            disabled={saving}
            aria-label="Quiet mode"
          />
        </div>

        {/* Column legend */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-1 pt-3 pb-1">
          <span />
          <span className="w-14 text-center font-fw-sans text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
            Email
          </span>
          <span className="w-14 text-center font-fw-sans text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
            Push
          </span>
        </div>

        {/* Per-category rows */}
        <ul className="divide-y divide-border-subtle">
          {DELIVERY_NOTIFICATION_GROUPS.map((group) => {
            const silenced = prefs.quiet_mode && !group.quietExempt;
            return (
              <li
                key={group.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-fw-sans text-body-sm font-medium text-text-primary">
                    {group.label}
                  </p>
                  <p className="font-fw-sans text-caption text-text-tertiary">
                    {silenced ? 'Silenced by quiet mode' : group.description}
                  </p>
                </div>
                <div className="flex w-14 justify-center">
                  <Switch
                    checked={prefs[group.emailKey]}
                    onCheckedChange={(v) => void toggle(group.emailKey, v)}
                    disabled={saving || silenced}
                    aria-label={`${group.label} email`}
                  />
                </div>
                <div className="flex w-14 justify-center">
                  {group.pushKey ? (
                    <Switch
                      checked={prefs[group.pushKey]}
                      onCheckedChange={(v) => void toggle(group.pushKey!, v)}
                      disabled={saving || silenced}
                      aria-label={`${group.label} push`}
                    />
                  ) : (
                    <span className="font-fw-sans text-caption text-text-tertiary" aria-hidden>
                      {EM_DASH}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
}

/* ── Golf scoring (coach) ─────────────────────────────────────────────────── */

function GolfScoringPanel({ teamId }: { teamId: string }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [scoringFormat, setScoringFormat] = useState('stroke_play');
  const [handicapSystem, setHandicapSystem] = useState('usga');
  const [defaultTees, setDefaultTees] = useState('blue');
  const [timezone, setTimezone] = useState('America/New_York');
  const [sgBenchmark, setSgBenchmark] = useState<BenchmarkLevel>('scratch');

  useEffect(() => {
    (async () => {
      const { data } = await fromUntyped(supabase, 'golf_team_settings')
        .select('scoring_format, handicap_system, default_tees, timezone, sg_benchmark_level')
        .eq('team_id', teamId)
        .maybeSingle();

      if (data) {
        setScoringFormat(data.scoring_format || 'stroke_play');
        setHandicapSystem(data.handicap_system || 'usga');
        setDefaultTees(data.default_tees || 'blue');
        setTimezone(data.timezone || 'America/New_York');
        setSgBenchmark((data.sg_benchmark_level as BenchmarkLevel) || 'scratch');
      }
      setLoaded(true);
    })();
  }, [teamId, supabase]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await fromUntyped(supabase, 'golf_team_settings').upsert(
        {
          team_id: teamId,
          scoring_format: scoringFormat,
          handicap_system: handicapSystem,
          default_tees: defaultTees,
          timezone,
          sg_benchmark_level: sgBenchmark,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'team_id' },
      );
      if (error) throw error;
      fairwayToast.success('Golf settings updated');
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <SectionCard icon={<IconUser size={18} aria-hidden />} title="Scoring & format">
        <div className="h-8 w-full rounded-fw-sm bg-surface-sunken" />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Scoring & format"
      description="Scoring format, handicap system, default tees and benchmark."
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Scoring format</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: 'stroke_play', label: 'Stroke Play', desc: 'Total strokes' },
              { val: 'match_play', label: 'Match Play', desc: 'Hole-by-hole' },
            ].map(({ val, label, desc }) => (
              <OptionTile
                key={val}
                active={scoringFormat === val}
                onClick={() => setScoringFormat(val)}
                title={label}
                hint={desc}
              />
            ))}
          </div>
        </div>

        <LabeledField label="Handicap system">
          <Select value={handicapSystem} onValueChange={(v) => setHandicapSystem(v as string)}>
            <Select.Item value="usga">USGA Handicap</Select.Item>
            <Select.Item value="world">World Handicap System</Select.Item>
            <Select.Item value="none">No Handicap</Select.Item>
          </Select>
        </LabeledField>

        <div>
          <FieldLabel>Default tees</FieldLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {['black', 'blue', 'white', 'gold'].map((tee) => (
              <button
                key={tee}
                type="button"
                aria-pressed={defaultTees === tee}
                onClick={() => setDefaultTees(tee)}
                className={cn(
                  'rounded-fw-sm border px-2 py-2 text-center font-fw-sans text-body-sm font-medium capitalize transition-colors',
                  'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                  defaultTees === tee
                    ? 'border-accent-500 bg-accent-50 text-accent-700'
                    : 'border-border-subtle text-text-secondary hover:border-border-strong',
                )}
              >
                {tee}
              </button>
            ))}
          </div>
        </div>

        <LabeledField label="Timezone">
          <Select value={timezone} onValueChange={(v) => setTimezone(v as string)}>
            <Select.Item value="America/New_York">Eastern (ET)</Select.Item>
            <Select.Item value="America/Chicago">Central (CT)</Select.Item>
            <Select.Item value="America/Denver">Mountain (MT)</Select.Item>
            <Select.Item value="America/Los_Angeles">Pacific (PT)</Select.Item>
            <Select.Item value="America/Anchorage">Alaska (AKT)</Select.Item>
            <Select.Item value="Pacific/Honolulu">Hawaii (HT)</Select.Item>
          </Select>
        </LabeledField>

        <div className="border-t border-border-subtle pt-4">
          <FieldLabel>Strokes gained benchmark</FieldLabel>
          <p className="mb-3 font-fw-sans text-caption text-text-tertiary">
            Baseline skill level for SG calculations. Pick the level closest to your team.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {BENCHMARK_LEVELS.map((level) => {
              const meta = BENCHMARK_METADATA[level];
              const active = sgBenchmark === level;
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSgBenchmark(level)}
                  className={cn(
                    'rounded-fw-sm border p-2.5 text-left transition-colors',
                    'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                    active
                      ? 'border-accent-500 bg-accent-50'
                      : 'border-border-subtle hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-fw-sans text-body-sm font-medium text-text-primary">
                      {meta.shortLabel}
                    </p>
                    <span className="font-fw-sans text-caption text-text-tertiary">
                      ~{meta.approximateHandicap < 0 ? '+' : ''}
                      {Math.abs(meta.approximateHandicap)} hcp
                    </span>
                  </div>
                  <p className="font-fw-sans text-caption text-text-tertiary">{meta.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <SaveRow onSave={handleSave} busy={saving} />
    </SectionCard>
  );
}

/* ── Player golf details ──────────────────────────────────────────────────── */

function PlayerGolfDetailsPanel({
  playerId,
  playerData,
  onUpdate,
}: {
  playerId: string;
  playerData?: PlayerData;
  onUpdate: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [handicap, setHandicap] = useState(playerData?.handicap?.toString() || '');
  const [handicapIndex, setHandicapIndex] = useState(playerData?.handicap_index?.toString() || '');
  const [gradYear, setGradYear] = useState(playerData?.graduation_year?.toString() || '');
  const [hometown, setHometown] = useState(playerData?.hometown || '');
  const [homeState, setHomeState] = useState(playerData?.state || '');
  const [phone, setPhone] = useState(playerData?.phone || '');

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('golf_players')
        .update({
          handicap: handicap ? parseFloat(handicap) : null,
          handicap_index: handicapIndex ? parseFloat(handicapIndex) : null,
          graduation_year: gradYear ? parseInt(gradYear) : null,
          hometown: hometown.trim() || null,
          state: homeState.trim() || null,
          phone: phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', playerId);

      if (error) throw error;
      fairwayToast.success('Golf details updated');
      onUpdate();
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Golf details"
      description="Handicap, graduation year and hometown."
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <LabeledField label="Handicap">
            <Input type="number" value={handicap} onChange={(e) => setHandicap(e.target.value)} placeholder="5.2" />
          </LabeledField>
          <LabeledField label="Handicap index">
            <Input
              type="number"
              value={handicapIndex}
              onChange={(e) => setHandicapIndex(e.target.value)}
              placeholder="4.8"
            />
          </LabeledField>
        </div>
        <LabeledField label="Graduation year">
          <Input type="number" value={gradYear} onChange={(e) => setGradYear(e.target.value)} placeholder="2027" />
        </LabeledField>
        <div className="grid grid-cols-2 gap-3">
          <LabeledField label="Hometown">
            <Input value={hometown} onChange={(e) => setHometown(e.target.value)} placeholder="Austin" />
          </LabeledField>
          <LabeledField label="State">
            <Input value={homeState} onChange={(e) => setHomeState(e.target.value)} placeholder="TX" maxLength={2} />
          </LabeledField>
        </div>
        <LabeledField label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </LabeledField>
      </div>
      <SaveRow onSave={handleSave} busy={saving} />
    </SectionCard>
  );
}

/* ── Team settings (coach) ────────────────────────────────────────────────── */

/** Exported for tests — must follow the program head's ACTIVE team toggle. */
export function TeamSettingsPanel({ onUpdate }: { onUpdate: () => void }) {
  const supabase = createClient();
  const golfUser = useGolfUser();
  // ACTIVE team from the layout-resolved context (cookie-aware) — the panel
  // must show and EDIT the same team every server page renders, so a program
  // head toggled to Women's edits the women's team here, never the default.
  const activeTeamId = golfUser.teamId ?? null;
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [season, setSeason] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [division, setDivision] = useState('');
  const [conference, setConference] = useState('');

  useEffect(() => {
    (async () => {
      if (!activeTeamId) {
        setLoaded(true);
        return;
      }

      const { data: team } = await supabase
        .from('golf_teams')
        .select('id, name, season, organization_id')
        .eq('id', activeTeamId)
        .maybeSingle();

      if (team) {
        setTeamId(team.id);
        setTeamName(team.name || '');
        setSeason(team.season || '');
        setOrganizationId(team.organization_id);

        if (team.organization_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: org } = await (supabase as any)
            .from('organizations')
            .select('name, location_city, location_state, division, conference')
            .eq('id', team.organization_id)
            .maybeSingle();
          if (org) {
            setOrgName(org.name || '');
            setCity(org.location_city || '');
            setState(org.location_state || '');
            setDivision(org.division || '');
            setConference(org.conference || '');
          }
        }
      }
      setLoaded(true);
    })();
  }, [supabase, activeTeamId]);

  const handleSave = async () => {
    if (!teamId || !teamName.trim()) {
      fairwayToast.error('Team name required');
      return;
    }
    setSaving(true);
    try {
      // B16/F150: the org update spans a DIFFERENT table (organizations, shared
      // across both gendered teams) than the team row. Run the cross-org write
      // FIRST and bail before touching golf_teams if it fails, so an org failure
      // can't leave the team renamed against stale org fields (half-applied save).
      if (organizationId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: orgError } = await (supabase as any)
          .from('organizations')
          .update({
            name: orgName.trim() || undefined,
            location_city: city.trim() || undefined,
            location_state: state.trim() || undefined,
            division: division.trim() || undefined,
            conference: conference.trim() || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', organizationId);
        if (orgError) throw orgError;
      }

      const { error: teamError } = await supabase
        .from('golf_teams')
        .update({ name: teamName.trim(), season: season.trim() || undefined, updated_at: new Date().toISOString() })
        .eq('id', teamId);
      if (teamError) throw teamError;

      fairwayToast.success('Team settings updated');
      onUpdate();
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <SectionCard icon={<IconUser size={18} aria-hidden />} title="Team settings">
        <div className="h-8 w-full rounded-fw-sm bg-surface-sunken" />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Team settings"
      description="Program name, season and organization details."
    >
      <div className="space-y-4">
        <LabeledField label="Team name">
          <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Men's Golf Team" />
        </LabeledField>
        <LabeledField label="Season">
          <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025-2026" />
        </LabeledField>

        {organizationId ? (
          <div className="space-y-4 border-t border-border-subtle pt-4">
            <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Organization
            </p>
            <LabeledField label="School name">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="University" />
            </LabeledField>
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label="City">
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Los Angeles" />
              </LabeledField>
              <LabeledField label="State">
                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" maxLength={2} />
              </LabeledField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label="Division">
                <Input value={division} onChange={(e) => setDivision(e.target.value)} placeholder="Division I" />
              </LabeledField>
              <LabeledField label="Conference">
                <Input value={conference} onChange={(e) => setConference(e.target.value)} placeholder="Pac-12" />
              </LabeledField>
            </div>
          </div>
        ) : null}
      </div>
      <SaveRow onSave={handleSave} busy={saving} />
    </SectionCard>
  );
}

/* ── Invite settings (coach) ──────────────────────────────────────────────── */

/** Exported for tests — must follow the program head's ACTIVE team toggle. */
export function InviteSettingsPanel() {
  const supabase = createClient();
  const golfUser = useGolfUser();
  // ACTIVE team from the layout-resolved context (cookie-aware) — invite codes
  // must be generated for the team the program head is currently viewing.
  const activeTeamId = golfUser.teamId ?? null;
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      if (!activeTeamId) {
        setLoaded(true);
        return;
      }

      const { data: team } = await supabase
        .from('golf_teams')
        .select('id, join_code')
        .eq('id', activeTeamId)
        .maybeSingle();

      if (team) {
        setTeamId(team.id);
        setInviteCode(team.join_code || '');
      }
      setLoaded(true);
    })();
  }, [supabase, activeTeamId]);

  const generateNewCode = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { error } = await supabase
        .from('golf_teams')
        .update({ join_code: newCode, updated_at: new Date().toISOString() })
        .eq('id', teamId);
      if (error) throw error;
      setInviteCode(newCode);
      fairwayToast.success('New invite code generated');
    } catch {
      fairwayToast.error('Failed to generate code');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/golf/join/${inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      fairwayToast.success('Invite link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      fairwayToast.error('Failed to copy');
    }
  };

  if (!loaded) {
    return (
      <SectionCard icon={<IconUser size={18} aria-hidden />} title="Invite settings">
        <div className="h-8 w-full rounded-fw-sm bg-surface-sunken" />
      </SectionCard>
    );
  }

  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/golf/join/${inviteCode}`;

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Invite settings"
      description="Share the code or link with players to join your team."
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Invite code</FieldLabel>
          <div className="flex gap-2">
            <div className="flex-1 rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-fw-mono text-body-lg font-medium text-text-primary">
              {inviteCode || EM_DASH}
            </div>
            <Button
              variant="secondary"
              busy={loading}
              onClick={() => void generateNewCode()}
              aria-label="Regenerate invite code"
            >
              <IconRefresh size={18} aria-hidden />
            </Button>
          </div>
        </div>

        <div>
          <FieldLabel>Invite link</FieldLabel>
          <div className="flex gap-2">
            <div className="flex-1 truncate rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-fw-sans text-body-sm text-text-secondary">
              {inviteCode ? inviteUrl : EM_DASH}
            </div>
            <Button
              variant="secondary"
              onClick={() => void copyLink()}
              aria-label={copied ? 'Invite link copied' : 'Copy invite link'}
            >
              {copied ? <IconCheck size={18} aria-hidden /> : <IconCopy size={18} aria-hidden />}
            </Button>
          </div>
        </div>

        <ul className="list-disc space-y-1 rounded-fw-sm bg-surface-sunken p-3 pl-7 font-fw-sans text-caption text-text-secondary">
          <li>Share the code or link with players to join.</li>
          <li>Generate a new code to revoke old invites.</li>
          <li>Players will need coach approval to join.</li>
        </ul>
      </div>
    </SectionCard>
  );
}

export default FairwaySettingsGeneral;
