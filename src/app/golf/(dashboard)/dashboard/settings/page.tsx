'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { m, AnimatePresence } from 'framer-motion';
import { ShineEffect } from '@/components/ui/shine-effect';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  IconSettings,
  IconUser,
  IconBell,
  IconUsers,
  IconLogout,
  IconChevronRight,
  IconChevronDown,
  IconMail,
  IconMapPin,
  IconShield,
  IconPalette,
  IconSparkles,
  IconMenu,
  IconCopy,
  IconRefresh,
  IconCheck,
} from '@/components/icons';
import { useSidebar } from '@/contexts/sidebar-context';
import { useGolfUser } from '@/contexts/golf-user-context';
import { JoinTeamSection } from '@/components/golf/settings/JoinTeamSection';
import { CoachHelmToggle } from '@/components/golf/coachhelm/v2';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/app/actions/notification-preferences';
import {
  BENCHMARK_METADATA,
  BENCHMARK_LEVELS,
  type BenchmarkLevel,
} from '@/lib/golf/sg-benchmarks';

// ============================================================================
// TYPES
// ============================================================================

interface UserProfile {
  userId: string;
  coachId?: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: 'coach' | 'player';
  teamName?: string;
  teamId?: string;
  organizationId?: string;
  // Player-specific
  playerId?: string;
  playerData?: {
    first_name: string | null;
    last_name: string | null;
    handicap: number | null;
    handicap_index: number | null;
    graduation_year: number | null;
    hometown: string | null;
    state: string | null;
    phone: string | null;
  };
  currentTeam?: {
    id: string;
    name: string;
    organization?: { name: string } | null;
  } | null;
}

type ExpandedSection = string | null;

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function GolfSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<ExpandedSection>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { showToast } = useToast();
  const { toggleMobile } = useSidebar();
  const golfUser = useGolfUser();

  const loadProfile = useCallback(async () => {
    const supabase = createClient();

    // Get email from auth (not in context)
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
      setLoading(false);
      return;
    }

    // Player — fetch extra player-specific fields not in context
    if (golfUser.playerId) {
      const [playerResult, teamResult] = await Promise.all([
        supabase
          .from('golf_players')
          .select('first_name, last_name, avatar_url, handicap, handicap_index, graduation_year, hometown, state, phone')
          .eq('id', golfUser.playerId)
          .single(),
        golfUser.teamId
          ? supabase
              .from('golf_teams')
              .select('id, name, organization:golf_organizations(name)')
              .eq('id', golfUser.teamId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const player = playerResult.data;
      const team = teamResult.data;

      let currentTeam: UserProfile['currentTeam'] = null;
      if (team) {
        const org = Array.isArray(team.organization)
          ? team.organization[0]
          : team.organization;
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
        playerData: player ? {
          first_name: player.first_name,
          last_name: player.last_name,
          handicap: player.handicap,
          handicap_index: player.handicap_index,
          graduation_year: player.graduation_year,
          hometown: player.hometown,
          state: player.state,
          phone: player.phone,
        } : undefined,
      });
    }

    setLoading(false);
  }, [golfUser]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  function toggle(section: string) {
    setExpanded(prev => (prev === section ? null : section));
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/golf/login';
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      'This will permanently delete your account and all associated data. This action cannot be undone.'
    );
    if (!confirmed) return;

    setDeletingAccount(true);
    try {
      const response = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        showToast(payload.error || 'Failed to delete account', 'error');
        return;
      }
      showToast('Account deleted successfully', 'success');
      window.location.href = '/';
    } catch {
      showToast('Failed to delete account', 'error');
    } finally {
      setDeletingAccount(false);
    }
  }

  if (loading) {
    return (
      <AnimatedPage className="min-h-full">
        <div className="border-b border-warm-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 md:py-5">
            <div className="h-7 w-32 bg-warm-200 rounded-lg animate-pulse" />
            <div className="h-4 w-56 bg-warm-100 rounded mt-2 animate-pulse" />
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
          <div className="glass-standard rounded-2xl p-5 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-warm-200" />
              <div className="flex-1">
                <div className="h-5 w-40 bg-warm-200 rounded mb-2" />
                <div className="h-4 w-24 bg-warm-100 rounded" />
              </div>
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-standard rounded-2xl p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-warm-200" />
                <div className="flex-1">
                  <div className="h-4 w-36 bg-warm-200 rounded mb-2" />
                  <div className="h-3 w-48 bg-warm-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </AnimatedPage>
    );
  }
  if (!profile) return null;

  return (
    <AnimatedPage className="min-h-full">
      {/* Header */}
      <div className="border-b border-warm-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 md:py-5">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMobile}
              className="lg:hidden p-2 -ml-2 rounded-xl text-warm-500 hover:text-warm-700 hover:bg-warm-100/80 transition-colors active:scale-95"
              aria-label="Open navigation menu"
            >
              <IconMenu size={22} />
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-warm-900">Settings</h1>
              <p className="text-warm-500 mt-0.5 text-sm">Manage your account and preferences</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* Profile Card */}
        <AnimatedItem>
          <div className="relative glass-standard rounded-2xl overflow-hidden p-5">
            <ShineEffect />
            <div className="flex items-center gap-4">
              <Avatar src={profile.avatarUrl} name={profile.name} size="lg" />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-warm-900">{profile.name}</h2>
                <p className="text-sm text-warm-500 flex items-center gap-2">
                  <span className="capitalize">{profile.role}</span>
                  {profile.teamName && (
                    <>
                      <span className="text-warm-300">·</span>
                      <span className="truncate">{profile.teamName}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </AnimatedItem>

        {/* Account */}
        <AnimatedItem>
          <SectionHeader>Account</SectionHeader>
          <div className="glass-standard rounded-2xl overflow-hidden relative">
            <ShineEffect />
            <SettingsExpandableRow
              icon={<IconUser size={18} />}
              label="Personal Information"
              description="Name, profile photo"
              isExpanded={expanded === 'personal'}
              onToggle={() => toggle('personal')}
            >
              <PersonalInfoPanel profile={profile} onUpdate={loadProfile} />
            </SettingsExpandableRow>

            <SettingsExpandableRow
              icon={<IconMail size={18} />}
              label="Email Address"
              description={profile.email}
              isExpanded={expanded === 'email'}
              onToggle={() => toggle('email')}
            >
              <EmailPanel currentEmail={profile.email} onUpdate={loadProfile} />
            </SettingsExpandableRow>

            <SettingsExpandableRow
              icon={<IconShield size={18} />}
              label="Password & Security"
              description="Change your password"
              isExpanded={expanded === 'password'}
              onToggle={() => toggle('password')}
              isLast
            >
              <PasswordPanel />
            </SettingsExpandableRow>
          </div>
        </AnimatedItem>

        {/* Preferences */}
        <AnimatedItem>
          <SectionHeader>Preferences</SectionHeader>
          <div className="glass-standard rounded-2xl overflow-hidden relative">
            <ShineEffect />
            <SettingsExpandableRow
              icon={<IconBell size={18} />}
              label="Notifications"
              description="Email and push preferences"
              isExpanded={expanded === 'notifications'}
              onToggle={() => toggle('notifications')}
            >
              <NotificationsPanel />
            </SettingsExpandableRow>

            <SettingsExpandableRow
              icon={<IconPalette size={18} />}
              label="Appearance"
              description="Display density, date format, animations"
              isExpanded={expanded === 'appearance'}
              onToggle={() => toggle('appearance')}
            >
              <AppearancePanel />
            </SettingsExpandableRow>

            <SettingsExpandableRow
              icon={<IconMapPin size={18} />}
              label="Location Defaults"
              description="Default course and location"
              isExpanded={expanded === 'location'}
              onToggle={() => toggle('location')}
              isLast={profile.role !== 'coach'}
            >
              <LocationPanel />
            </SettingsExpandableRow>

            {profile.role === 'coach' && (
              <SettingsLinkRow
                icon={<IconSparkles size={18} />}
                label="Coaching Philosophy"
                description="CoachHelm AI insights and priorities"
                href="/golf/dashboard/settings/coaching-intelligence"
                isLast
              />
            )}
          </div>
        </AnimatedItem>

        {/* Golf-Specific Settings (Coach) */}
        {profile.role === 'coach' && profile.teamId && (
          <AnimatedItem>
            <SectionHeader>Golf Settings</SectionHeader>
            <div className="glass-standard rounded-2xl overflow-hidden relative">
              <ShineEffect />
              <SettingsExpandableRow
                icon={<IconSettings size={18} />}
                label="Scoring & Format"
                description="Scoring format, handicap system, default tees"
                isExpanded={expanded === 'golf-scoring'}
                onToggle={() => toggle('golf-scoring')}
                isLast
              >
                <GolfScoringPanel teamId={profile.teamId} />
              </SettingsExpandableRow>
            </div>
          </AnimatedItem>
        )}

        {/* Golf-Specific Settings (Player) */}
        {profile.role === 'player' && profile.playerId && (
          <AnimatedItem>
            <SectionHeader>Golf Profile</SectionHeader>
            <div className="glass-standard rounded-2xl overflow-hidden relative">
              <ShineEffect />
              <SettingsExpandableRow
                icon={<IconSettings size={18} />}
                label="Golf Details"
                description="Handicap, graduation year, hometown"
                isExpanded={expanded === 'golf-details'}
                onToggle={() => toggle('golf-details')}
                isLast
              >
                <PlayerGolfDetailsPanel
                  playerId={profile.playerId}
                  playerData={profile.playerData}
                  onUpdate={loadProfile}
                />
              </SettingsExpandableRow>
            </div>
          </AnimatedItem>
        )}

        {/* CoachHelm AI Toggle */}
        {profile.role === 'coach' && profile.coachId && (
          <AnimatedItem>
            <SectionHeader>AI Features</SectionHeader>
            <div className="glass-standard rounded-2xl overflow-hidden p-4 relative">
              <ShineEffect />
              <CoachHelmToggle coachId={profile.coachId} />
            </div>
          </AnimatedItem>
        )}

        {/* Team */}
        <AnimatedItem>
          <SectionHeader>Team</SectionHeader>
          {profile.role === 'coach' && (
            <div className="glass-standard rounded-2xl overflow-hidden relative">
              <ShineEffect />
              <SettingsExpandableRow
                icon={<IconUsers size={18} />}
                label="Team Settings"
                description={profile.teamName || 'Manage team details'}
                isExpanded={expanded === 'team'}
                onToggle={() => toggle('team')}
              >
                <TeamSettingsPanel onUpdate={loadProfile} />
              </SettingsExpandableRow>
              <SettingsExpandableRow
                icon={<IconSettings size={18} />}
                label="Invite Settings"
                description="Team invite code and link"
                isExpanded={expanded === 'invite'}
                onToggle={() => toggle('invite')}
                isLast
              >
                <InviteSettingsPanel />
              </SettingsExpandableRow>
            </div>
          )}
          {profile.role === 'player' && profile.playerId && (
            <JoinTeamSection
              playerId={profile.playerId}
              currentTeam={profile.currentTeam}
            />
          )}
        </AnimatedItem>

        {/* Legal */}
        <AnimatedItem>
          <SectionHeader>Legal</SectionHeader>
          <div className="glass-standard rounded-2xl overflow-hidden relative">
            <ShineEffect />
            <SettingsLinkRow
              icon={<IconShield size={18} />}
              label="Privacy Policy"
              description="How we handle your data"
              href="/privacy"
            />
            <SettingsLinkRow
              icon={<IconSettings size={18} />}
              label="Terms of Service"
              description="Terms for using Helm"
              href="/terms"
              isLast
            />
          </div>
        </AnimatedItem>

        {/* Danger Zone */}
        <AnimatedItem>
          <SectionHeader>Danger Zone</SectionHeader>
          <div className="glass-standard rounded-2xl overflow-hidden p-5 relative">
            <ShineEffect />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="font-medium text-warm-900">Delete account</p>
                <p className="text-sm text-warm-500">
                  Permanently remove your account and all data.
                </p>
              </div>
              <Button variant="danger" isLoading={deletingAccount} onClick={handleDeleteAccount}>
                Delete Account
              </Button>
            </div>
          </div>
        </AnimatedItem>

        {/* Sign Out */}
        <AnimatedItem>
          <button
            onClick={handleSignOut}
            className="relative w-full glass-standard rounded-2xl overflow-hidden p-4 flex items-center gap-3 hover:border-red-200 hover:bg-red-50/50 transition-all group"
          >
            <ShineEffect />
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
              <IconLogout size={18} className="text-red-600" />
            </div>
            <span className="font-medium text-red-600">Sign Out</span>
          </button>
        </AnimatedItem>

        {/* App Info */}
        <AnimatedItem className="text-center text-sm text-warm-400 py-4">
          <p>GolfHelm v1.0.0</p>
          <p className="text-xs mt-1">© 2026 Helm Sports Labs</p>
        </AnimatedItem>
      </div>
    </AnimatedPage>
  );
}

// ============================================================================
// LAYOUT COMPONENTS
// ============================================================================

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-3 px-1">
      {children}
    </h3>
  );
}

function SettingsExpandableRow({
  icon,
  label,
  description,
  isExpanded,
  onToggle,
  isLast = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  isExpanded: boolean;
  onToggle: () => void;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(!isLast && !isExpanded && 'border-b border-warm-100')}>
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-4 p-4 text-left transition-colors',
          isExpanded ? 'bg-warm-50/50' : 'hover:bg-warm-50/50',
        )}
      >
        <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0 text-warm-600">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-warm-900">{label}</p>
          {description && (
            <p className="text-sm text-warm-500 truncate">{description}</p>
          )}
        </div>
        <m.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <IconChevronDown size={18} className="text-warm-300" />
        </m.div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className={cn('px-4 pb-4', !isLast && 'border-b border-warm-100')}>
              <div className="bg-white rounded-xl border border-warm-200 p-4">
                {children}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsLinkRow({
  icon,
  label,
  description,
  href,
  isLast = false,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  href: string;
  isLast?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'w-full flex items-center gap-4 p-4 text-left hover:bg-warm-50/50 transition-colors',
        !isLast && 'border-b border-warm-100'
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0 text-warm-600">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-warm-900">{label}</p>
        {description && (
          <p className="text-sm text-warm-500 truncate">{description}</p>
        )}
      </div>
      <IconChevronRight size={18} className="text-warm-300 flex-shrink-0" />
    </Link>
  );
}

// ============================================================================
// SHARED UI
// ============================================================================

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className="w-full flex items-center justify-between py-2.5 group"
    >
      <div className="text-left flex-1 mr-3">
        <p className="text-sm font-medium text-warm-900">{label}</p>
        {description && <p className="text-xs text-warm-500">{description}</p>}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
          checked ? 'bg-primary-600' : 'bg-warm-200'
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </div>
    </button>
  );
}

function SaveBar({
  onSave,
  onCancel,
  loading,
  label = 'Save Changes',
}: {
  onSave: () => void;
  onCancel?: () => void;
  loading: boolean;
  label?: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-4 border-t border-warm-100 mt-4">
      {onCancel && (
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      )}
      <Button size="sm" onClick={onSave} isLoading={loading}>
        {label}
      </Button>
    </div>
  );
}

// ============================================================================
// PANEL: Personal Info
// ============================================================================

function PersonalInfoPanel({ profile, onUpdate }: { profile: UserProfile; onUpdate: () => void }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState(profile.playerData?.first_name || '');
  const [lastName, setLastName] = useState(profile.playerData?.last_name || '');
  const [fullName, setFullName] = useState(profile.role === 'coach' ? profile.name : '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl || null);

  async function handleSave() {
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

      showToast('Profile updated', 'success');
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-2">Profile Picture</label>
        <AvatarUpload
          currentAvatarUrl={avatarUrl}
          name={profile.role === 'coach' ? fullName : `${firstName} ${lastName}`}
          onUploadComplete={(url) => setAvatarUrl(url)}
          onRemove={() => setAvatarUrl(null)}
        />
      </div>

      {profile.role === 'coach' ? (
        <Input label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Coach Smith" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
          <Input label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
        </div>
      )}

      <SaveBar onSave={handleSave} loading={saving} />
    </div>
  );
}

// ============================================================================
// PANEL: Email
// ============================================================================

function EmailPanel({ currentEmail, onUpdate }: { currentEmail: string; onUpdate: () => void }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  async function handleSave() {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      showToast('Please enter a valid email', 'error');
      return;
    }
    if (newEmail === currentEmail) {
      showToast('Same as current email', 'error');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      showToast('Confirmation email sent. Check your inbox.', 'success');
      setNewEmail('');
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update email', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium text-warm-700 block mb-1">Current Email</label>
        <div className="px-3 py-2 bg-warm-50 border border-warm-200 rounded-lg text-sm text-warm-600">{currentEmail}</div>
      </div>
      <Input label="New Email Address" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" />
      <p className="text-xs text-warm-500">We'll send a confirmation email to verify the change.</p>
      <SaveBar onSave={handleSave} loading={saving} label="Send Confirmation" />
    </div>
  );
}

// ============================================================================
// PANEL: Password
// ============================================================================

function PasswordPanel() {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handleSave() {
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showToast('Password updated', 'success');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update password', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
      <Input label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
      <p className="text-xs text-warm-500">At least 6 characters. Use a unique password.</p>
      <SaveBar onSave={handleSave} loading={saving} label="Update Password" />
    </div>
  );
}

// ============================================================================
// PANEL: Notifications
// ============================================================================

function NotificationsPanel() {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [prefs, setPrefs] = useState({
    email_messages: true,
    email_announcements: true,
    email_event_reminders: true,
    email_task_reminders: true,
    push_messages: false,
    push_events: false,
    push_task_reminders: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const result = await getNotificationPreferences();
        if (result.data) {
          setPrefs({
            email_messages: result.data.email_messages ?? true,
            email_announcements: result.data.email_announcements ?? true,
            email_event_reminders: result.data.email_event_reminders ?? true,
            email_task_reminders: result.data.email_task_reminders ?? true,
            push_messages: result.data.push_messages ?? false,
            push_events: result.data.push_events ?? false,
            push_task_reminders: result.data.push_task_reminders ?? true,
          });
        }
      } catch { /* use defaults */ }
      setLoaded(true);
    })();
  }, []);

  function toggle(key: keyof typeof prefs) {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateNotificationPreferences(prefs);
      if (result.success) {
        showToast('Notification preferences updated', 'success');
      } else {
        showToast(result.error || 'Failed to update', 'error');
      }
    } catch {
      showToast('Failed to update preferences', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="flex justify-center py-4"><div className="space-y-2 w-32"><div className="h-3 w-full bg-warm-200 rounded skeleton-shimmer" /><div className="h-3 w-2/3 bg-warm-200 rounded skeleton-shimmer" /></div></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">Email</p>
        <div className="space-y-1">
          <ToggleSwitch label="Messages" description="Email for new messages" checked={prefs.email_messages} onChange={() => toggle('email_messages')} />
          <ToggleSwitch label="Announcements" description="Team announcements" checked={prefs.email_announcements} onChange={() => toggle('email_announcements')} />
          <ToggleSwitch label="Event Reminders" description="Upcoming events and schedule" checked={prefs.email_event_reminders} onChange={() => toggle('email_event_reminders')} />
          <ToggleSwitch label="Task Reminders" description="Practice tasks and assignments" checked={prefs.email_task_reminders} onChange={() => toggle('email_task_reminders')} />
        </div>
      </div>

      <div className="border-t border-warm-100 pt-4">
        <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">Push</p>
        <div className="space-y-1">
          <ToggleSwitch label="Messages" description="Instant push notifications" checked={prefs.push_messages} onChange={() => toggle('push_messages')} />
          <ToggleSwitch label="Events" description="Event and schedule updates" checked={prefs.push_events} onChange={() => toggle('push_events')} />
          <ToggleSwitch label="Task Reminders" description="Push for tasks and reminders" checked={prefs.push_task_reminders} onChange={() => toggle('push_task_reminders')} />
        </div>
      </div>

      <SaveBar onSave={handleSave} loading={saving} />
    </div>
  );
}

// ============================================================================
// PANEL: Appearance
// ============================================================================

type DisplayDensity = 'comfortable' | 'compact';
type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

function AppearancePanel() {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [density, setDensity] = useState<DisplayDensity>('comfortable');
  const [dateFormat, setDateFormat] = useState<DateFormat>('MM/DD/YYYY');
  const [showAnimations, setShowAnimations] = useState(true);
  const [scoreDisplay, setScoreDisplay] = useState<'to_par' | 'raw'>('to_par');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('golf_appearance_preferences');
      if (stored) {
        const p = JSON.parse(stored);
        setDensity(p.display_density || 'comfortable');
        setDateFormat(p.date_format || 'MM/DD/YYYY');
        setShowAnimations(p.show_animations ?? true);
        setScoreDisplay(p.score_display || 'to_par');
      }
    } catch { /* defaults */ }
  }, []);

  // TODO: These preferences are saved to localStorage but not yet consumed by
  // other components. Planned for a future pass to wire up density, dateFormat,
  // showAnimations, and scoreDisplay across the dashboard.
  function handleSave() {
    setSaving(true);
    try {
      localStorage.setItem('golf_appearance_preferences', JSON.stringify({
        display_density: density,
        date_format: dateFormat,
        show_animations: showAnimations,
        score_display: scoreDisplay,
      }));
      showToast('Appearance updated', 'success');
    } catch {
      showToast('Failed to save preferences', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Density */}
      <div>
        <p className="text-sm font-medium text-warm-700 mb-2">Display Density</p>
        <div className="grid grid-cols-2 gap-2">
          {(['comfortable', 'compact'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setDensity(opt)}
              className={cn(
                'p-3 rounded-lg border-2 text-left transition-all',
                density === opt ? 'border-primary-600 bg-primary-50' : 'border-warm-200 hover:border-warm-300'
              )}
            >
              <p className="text-sm font-medium text-warm-900 capitalize">{opt}</p>
              <p className="text-xs text-warm-500 mt-0.5">{opt === 'comfortable' ? 'More spacing' : 'Denser layout'}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Date format */}
      <div>
        <p className="text-sm font-medium text-warm-700 mb-2">Date Format</p>
        <div className="space-y-1.5">
          {([
            { val: 'MM/DD/YYYY' as const, ex: '01/28/2026' },
            { val: 'DD/MM/YYYY' as const, ex: '28/01/2026' },
            { val: 'YYYY-MM-DD' as const, ex: '2026-01-28' },
          ]).map(({ val, ex }) => (
            <button
              key={val}
              onClick={() => setDateFormat(val)}
              className={cn(
                'w-full p-2.5 rounded-lg border-2 text-left text-sm flex justify-between items-center transition-all',
                dateFormat === val ? 'border-primary-600 bg-primary-50' : 'border-warm-200 hover:border-warm-300'
              )}
            >
              <span className="font-medium text-warm-900">{val}</span>
              <span className="text-warm-500 text-xs">{ex}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Score Display */}
      <div>
        <p className="text-sm font-medium text-warm-700 mb-2">Score Display</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setScoreDisplay('to_par')}
            className={cn(
              'p-3 rounded-lg border-2 text-left transition-all',
              scoreDisplay === 'to_par' ? 'border-primary-600 bg-primary-50' : 'border-warm-200 hover:border-warm-300'
            )}
          >
            <p className="text-sm font-medium text-warm-900">Score to Par</p>
            <p className="text-xs text-warm-500 mt-0.5">E, +2, -1</p>
          </button>
          <button
            onClick={() => setScoreDisplay('raw')}
            className={cn(
              'p-3 rounded-lg border-2 text-left transition-all',
              scoreDisplay === 'raw' ? 'border-primary-600 bg-primary-50' : 'border-warm-200 hover:border-warm-300'
            )}
          >
            <p className="text-sm font-medium text-warm-900">Raw Score</p>
            <p className="text-xs text-warm-500 mt-0.5">72, 74, 71</p>
          </button>
        </div>
      </div>

      {/* Animations */}
      <ToggleSwitch
        label="Animations"
        description="Enable smooth transitions and effects"
        checked={showAnimations}
        onChange={() => setShowAnimations(!showAnimations)}
      />

      <SaveBar onSave={handleSave} loading={saving} />
    </div>
  );
}

// ============================================================================
// PANEL: Location
// ============================================================================

function LocationPanel() {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [defaultCourse, setDefaultCourse] = useState('');
  const [defaultCity, setDefaultCity] = useState('');
  const [defaultState, setDefaultState] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('golf_location_preferences');
      if (stored) {
        const p = JSON.parse(stored);
        setDefaultCourse(p.default_course || '');
        setDefaultCity(p.default_city || '');
        setDefaultState(p.default_state || '');
      }
    } catch { /* defaults */ }
  }, []);

  function handleSave() {
    setSaving(true);
    try {
      localStorage.setItem('golf_location_preferences', JSON.stringify({
        default_course: defaultCourse.trim(),
        default_city: defaultCity.trim(),
        default_state: defaultState.trim(),
      }));
      showToast('Location preferences updated', 'success');
    } catch {
      showToast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input label="Default Course" value={defaultCourse} onChange={(e) => setDefaultCourse(e.target.value)} placeholder="Pebble Beach Golf Links" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="City" value={defaultCity} onChange={(e) => setDefaultCity(e.target.value)} placeholder="Pebble Beach" />
        <Input label="State" value={defaultState} onChange={(e) => setDefaultState(e.target.value)} placeholder="CA" maxLength={2} />
      </div>
      <p className="text-xs text-warm-500">Pre-filled when creating new rounds or tracking shots.</p>
      <SaveBar onSave={handleSave} loading={saving} />
    </div>
  );
}

// ============================================================================
// PANEL: Golf Scoring (Coach Only)
// ============================================================================

function GolfScoringPanel({ teamId }: { teamId: string }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [scoringFormat, setScoringFormat] = useState('stroke_play');
  const [handicapSystem, setHandicapSystem] = useState('usga');
  const [defaultTees, setDefaultTees] = useState('blue');
  const [timezone, setTimezone] = useState('America/New_York');
  const [sgBenchmark, setSgBenchmark] = useState<BenchmarkLevel>('scratch');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      // sg_benchmark_level column was added after type generation
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
  }, [teamId]);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    try {
      // Upsert — create if doesn't exist
      // sg_benchmark_level column was added after type generation
      const { error } = await fromUntyped(supabase, 'golf_team_settings')
        .upsert({
          team_id: teamId,
          scoring_format: scoringFormat,
          handicap_system: handicapSystem,
          default_tees: defaultTees,
          timezone,
          sg_benchmark_level: sgBenchmark,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'team_id' });

      if (error) throw error;
      showToast('Golf settings updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="flex justify-center py-4"><div className="space-y-2 w-32"><div className="h-3 w-full bg-warm-200 rounded skeleton-shimmer" /><div className="h-3 w-2/3 bg-warm-200 rounded skeleton-shimmer" /></div></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-warm-700 block mb-2">Scoring Format</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { val: 'stroke_play', label: 'Stroke Play', desc: 'Total strokes' },
            { val: 'match_play', label: 'Match Play', desc: 'Hole-by-hole' },
          ].map(({ val, label, desc }) => (
            <button
              key={val}
              onClick={() => setScoringFormat(val)}
              className={cn(
                'p-3 rounded-lg border-2 text-left transition-all',
                scoringFormat === val ? 'border-primary-600 bg-primary-50' : 'border-warm-200 hover:border-warm-300'
              )}
            >
              <p className="text-sm font-medium text-warm-900">{label}</p>
              <p className="text-xs text-warm-500">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-warm-700 block mb-2">Handicap System</label>
        <select
          value={handicapSystem}
          onChange={(e) => setHandicapSystem(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-warm-200 text-sm text-warm-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-colors"
        >
          <option value="usga">USGA Handicap</option>
          <option value="world">World Handicap System</option>
          <option value="none">No Handicap</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-warm-700 block mb-2">Default Tees</label>
        <div className="grid grid-cols-4 gap-1.5">
          {['black', 'blue', 'white', 'gold'].map((tee) => (
            <button
              key={tee}
              onClick={() => setDefaultTees(tee)}
              className={cn(
                'px-2 py-2 rounded-lg border-2 text-center text-sm font-medium capitalize transition-all',
                defaultTees === tee ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-warm-200 hover:border-warm-300 text-warm-700'
              )}
            >
              {tee}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-warm-700 block mb-2">Timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-warm-200 text-sm text-warm-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-colors"
        >
          <option value="America/New_York">Eastern (ET)</option>
          <option value="America/Chicago">Central (CT)</option>
          <option value="America/Denver">Mountain (MT)</option>
          <option value="America/Los_Angeles">Pacific (PT)</option>
          <option value="America/Anchorage">Alaska (AKT)</option>
          <option value="Pacific/Honolulu">Hawaii (HT)</option>
        </select>
      </div>

      {/* E-12: Strokes Gained Benchmark Level */}
      <div className="border-t border-warm-100 pt-4">
        <label className="text-sm font-medium text-warm-700 block mb-1">Strokes Gained Benchmark</label>
        <p className="text-xs text-warm-500 mb-3">
          Baseline skill level for SG calculations. Pick the level closest to your team.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BENCHMARK_LEVELS.map((level) => {
            const meta = BENCHMARK_METADATA[level];
            return (
              <button
                key={level}
                onClick={() => setSgBenchmark(level)}
                className={cn(
                  'p-2.5 rounded-lg border-2 text-left transition-all',
                  sgBenchmark === level
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-warm-200 hover:border-warm-300'
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-warm-900">{meta.shortLabel}</p>
                  <span className="text-xs text-warm-400">~{meta.approximateHandicap > 0 ? '+' : ''}{meta.approximateHandicap} hcp</span>
                </div>
                <p className="text-xs text-warm-500 mt-0.5">{meta.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <SaveBar onSave={handleSave} loading={saving} />
    </div>
  );
}

// ============================================================================
// PANEL: Player Golf Details
// ============================================================================

function PlayerGolfDetailsPanel({
  playerId,
  playerData,
  onUpdate,
}: {
  playerId: string;
  playerData?: UserProfile['playerData'];
  onUpdate: () => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [handicap, setHandicap] = useState(playerData?.handicap?.toString() || '');
  const [handicapIndex, setHandicapIndex] = useState(playerData?.handicap_index?.toString() || '');
  const [gradYear, setGradYear] = useState(playerData?.graduation_year?.toString() || '');
  const [hometown, setHometown] = useState(playerData?.hometown || '');
  const [homeState, setHomeState] = useState(playerData?.state || '');
  const [phone, setPhone] = useState(playerData?.phone || '');

  async function handleSave() {
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
      showToast('Golf details updated', 'success');
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Handicap" type="number" value={handicap} onChange={(e) => setHandicap(e.target.value)} placeholder="5.2" />
        <Input label="Handicap Index" type="number" value={handicapIndex} onChange={(e) => setHandicapIndex(e.target.value)} placeholder="4.8" />
      </div>
      <Input label="Graduation Year" type="number" value={gradYear} onChange={(e) => setGradYear(e.target.value)} placeholder="2027" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Hometown" value={hometown} onChange={(e) => setHometown(e.target.value)} placeholder="Austin" />
        <Input label="State" value={homeState} onChange={(e) => setHomeState(e.target.value)} placeholder="TX" maxLength={2} />
      </div>
      <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
      <SaveBar onSave={handleSave} loading={saving} />
    </div>
  );
}

// ============================================================================
// PANEL: Team Settings (Coach)
// ============================================================================

function TeamSettingsPanel({ onUpdate }: { onUpdate: () => void }) {
  const { showToast } = useToast();
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
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!coach?.organization_id) { setLoaded(true); return; }

      const { data: team } = await supabase
        .from('golf_teams')
        .select('id, name, season, organization_id')
        .eq('organization_id', coach.organization_id)
        .single();

      if (team) {
        setTeamId(team.id);
        setTeamName(team.name || '');
        setSeason(team.season || '');
        setOrganizationId(team.organization_id);

        if (team.organization_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: org } = await (supabase as any)
            .from('golf_organizations')
            .select('name, city, state, division, conference')
            .eq('id', team.organization_id)
            .single();
          if (org) {
            setOrgName(org.name || '');
            setCity(org.city || '');
            setState(org.state || '');
            setDivision(org.division || '');
            setConference(org.conference || '');
          }
        }
      }
      setLoaded(true);
    })();
  }, []);

  async function handleSave() {
    if (!teamId || !teamName.trim()) {
      showToast('Team name required', 'error');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    try {
      const { error: teamError } = await supabase
        .from('golf_teams')
        .update({ name: teamName.trim(), season: season.trim() || undefined, updated_at: new Date().toISOString() })
        .eq('id', teamId);
      if (teamError) throw teamError;

      if (organizationId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: orgError } = await (supabase as any)
          .from('golf_organizations')
          .update({
            name: orgName.trim() || undefined,
            city: city.trim() || undefined,
            state: state.trim() || undefined,
            division: division.trim() || undefined,
            conference: conference.trim() || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', organizationId);
        if (orgError) throw orgError;
      }

      showToast('Team settings updated', 'success');
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="flex justify-center py-4"><div className="space-y-2 w-32"><div className="h-3 w-full bg-warm-200 rounded skeleton-shimmer" /><div className="h-3 w-2/3 bg-warm-200 rounded skeleton-shimmer" /></div></div>;
  }

  return (
    <div className="space-y-4">
      <Input label="Team Name" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Men's Golf Team" required />
      <Input label="Season" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025-2026" />

      {organizationId && (
        <>
          <div className="border-t border-warm-100 pt-4">
            <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3">Organization</p>
          </div>
          <Input label="School Name" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="University" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Los Angeles" />
            <Input label="State" value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" maxLength={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Division" value={division} onChange={(e) => setDivision(e.target.value)} placeholder="Division I" />
            <Input label="Conference" value={conference} onChange={(e) => setConference(e.target.value)} placeholder="Pac-12" />
          </div>
        </>
      )}

      <SaveBar onSave={handleSave} loading={saving} />
    </div>
  );
}

// ============================================================================
// PANEL: Invite Settings (Coach)
// ============================================================================

function InviteSettingsPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!coach?.organization_id) { setLoaded(true); return; }

      const { data: team } = await supabase
        .from('golf_teams')
        .select('id, join_code')
        .eq('organization_id', coach.organization_id)
        .single();

      if (team) {
        setTeamId(team.id);
        setInviteCode(team.join_code || '');
      }
      setLoaded(true);
    })();
  }, []);

  async function generateNewCode() {
    if (!teamId) return;
    setLoading(true);
    const supabase = createClient();
    try {
      const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { error } = await supabase
        .from('golf_teams')
        .update({ join_code: newCode, updated_at: new Date().toISOString() })
        .eq('id', teamId);
      if (error) throw error;
      setInviteCode(newCode);
      showToast('New invite code generated', 'success');
    } catch {
      showToast('Failed to generate code', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/golf/join/${inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('Invite link copied', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy', 'error');
    }
  }

  if (!loaded) {
    return <div className="flex justify-center py-4"><div className="space-y-2 w-32"><div className="h-3 w-full bg-warm-200 rounded skeleton-shimmer" /><div className="h-3 w-2/3 bg-warm-200 rounded skeleton-shimmer" /></div></div>;
  }

  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/golf/join/${inviteCode}`;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-warm-700 block mb-2">Invite Code</label>
        <div className="flex gap-2">
          <div className="flex-1 px-3 py-2.5 bg-warm-50 border border-warm-200 rounded-lg font-mono text-lg font-semibold text-warm-900">
            {inviteCode || '—'}
          </div>
          <Button variant="secondary" onClick={generateNewCode} isLoading={loading} className="px-3" aria-label="Regenerate invite code">
            <IconRefresh size={18} />
          </Button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-warm-700 block mb-2">Invite Link</label>
        <div className="flex gap-2">
          <div className="flex-1 px-3 py-2.5 bg-warm-50 border border-warm-200 rounded-lg text-sm text-warm-600 truncate">
            {inviteUrl}
          </div>
          <Button variant="secondary" onClick={copyLink} className="px-3">
            {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
          </Button>
        </div>
      </div>

      <div className="bg-warm-50 border border-warm-100 rounded-lg p-3">
        <ul className="text-xs text-warm-600 space-y-1 ml-3 list-disc">
          <li>Share the code or link with players to join</li>
          <li>Generate a new code to revoke old invites</li>
          <li>Players will need coach approval to join</li>
        </ul>
      </div>
    </div>
  );
}
