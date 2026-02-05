'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShineEffect } from '@/components/ui/shine-effect';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  IconSettings,
  IconUser,
  IconBell,
  IconUsers,
  IconLogout,
  IconChevronRight,
  IconMail,
  IconMapPin,
  IconShield,
  IconPalette,
  IconSparkles,
  IconMenu
} from '@/components/icons';
import { useSidebar } from '@/contexts/sidebar-context';
import { PersonalInfoModal } from '@/components/golf/settings/PersonalInfoModal';
import { EmailModal } from '@/components/golf/settings/EmailModal';
import { PasswordModal } from '@/components/golf/settings/PasswordModal';
import { NotificationsModal } from '@/components/golf/settings/NotificationsModal';
import { AppearanceModal } from '@/components/golf/settings/AppearanceModal';
import { LocationModal } from '@/components/golf/settings/LocationModal';
import { TeamSettingsModal } from '@/components/golf/settings/TeamSettingsModal';
import { InviteSettingsModal } from '@/components/golf/settings/InviteSettingsModal';
import { JoinTeamSection } from '@/components/golf/settings/JoinTeamSection';
import { CoachHelmToggle } from '@/components/golf/coachhelm/v2';

interface UserProfile {
  userId: string;
  coachId?: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: 'coach' | 'player';
  teamName?: string;
  // Player-specific
  playerId?: string;
  currentTeam?: {
    id: string;
    name: string;
    organization?: {
      name: string;
    } | null;
  } | null;
}

export default function GolfSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const { toggleMobile } = useSidebar();
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Modal state
  const [personalInfoOpen, setPersonalInfoOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [teamSettingsOpen, setTeamSettingsOpen] = useState(false);
  const [inviteSettingsOpen, setInviteSettingsOpen] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    // Check if coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, full_name, organization_id, avatar_url')
      .eq('user_id', user.id)
      .single();

    if (coach) {
      // Get team name if organization_id exists
      let teamName: string | undefined;
      if (coach.organization_id) {
        const { data: team } = await supabase
          .from('golf_teams')
          .select('name')
          .eq('organization_id', coach.organization_id)
          .maybeSingle();
        teamName = team?.name;
      }

      setProfile({
        userId: user.id,
        coachId: coach.id,
        name: coach.full_name || 'Coach',
        email: user.email || '',
        avatarUrl: coach.avatar_url,
        role: 'coach',
        teamName,
      });
      setLoading(false);
      return;
    }

    // Check if player
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url')
      .eq('user_id', user.id)
      .single();

    if (player) {
      // Get team via team_members table (golf_players doesn't have team_id)
      let teamName: string | undefined;
      let currentTeam: UserProfile['currentTeam'] = null;

      const { data: teamMembership } = await supabase
        .from('golf_team_members')
        .select('team:golf_teams(id, name, organization:golf_organizations(name))')
        .eq('player_id', player.id)
        .maybeSingle();

      if (teamMembership?.team) {
        const team = teamMembership.team;
        teamName = team.name;
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
        userId: user.id,
        name: `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Player',
        email: user.email || '',
        avatarUrl: player.avatar_url,
        role: 'player',
        teamName,
        playerId: player.id,
        currentTeam,
      });
    }

    setLoading(false);
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="h-8 w-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <div className="absolute inset-0 h-8 w-8 border-2 border-transparent border-t-primary-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1s' }} />
        </div>
        <p className="text-sm text-slate-500 font-medium">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-5">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger menu */}
            <button
              onClick={toggleMobile}
              className={cn(
                'lg:hidden p-2 -ml-2 rounded-xl',
                'text-slate-500 hover:text-slate-700 hover:bg-slate-100/80',
                'transition-colors duration-150 active:scale-95',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
              )}
              aria-label="Open navigation menu"
            >
              <IconMenu size={22} />
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
              <p className="text-slate-500 mt-0.5">Manage your account and preferences</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* Profile Card */}
        {profile && (
          <div
            className="relative glass-standard rounded-2xl overflow-hidden p-6"
            style={{ animation: 'fadeInUp 0.4s ease-out forwards', opacity: 0 }}
          >
            <ShineEffect />
            <div className="flex items-center gap-4">
              <Avatar src={profile.avatarUrl} name={profile.name} size="lg" />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">{profile.name}</h2>
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <span className="capitalize">{profile.role}</span>
                  {profile.teamName && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span>{profile.teamName}</span>
                    </>
                  )}
                </p>
              </div>
              <button className="px-4 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                Edit Profile
              </button>
            </div>
          </div>
        )}

        {/* Account Section */}
        <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '50ms', opacity: 0 }}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Account</h3>
          <div className="relative glass-standard rounded-2xl overflow-hidden">
            <ShineEffect />
            <SettingsRow
              icon={<IconUser size={18} />}
              label="Personal Information"
              description="Update your name, email and profile picture"
              onClick={() => setPersonalInfoOpen(true)}
            />
            <SettingsRow
              icon={<IconMail size={18} />}
              label="Email Address"
              description={profile?.email || 'Not set'}
              onClick={() => setEmailOpen(true)}
            />
            <SettingsRow
              icon={<IconShield size={18} />}
              label="Password & Security"
              description="Change password and manage security"
              onClick={() => setPasswordOpen(true)}
              isLast
            />
          </div>
        </div>

        {/* Preferences Section */}
        <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '100ms', opacity: 0 }}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Preferences</h3>
          <div className="relative glass-standard rounded-2xl overflow-hidden">
            <ShineEffect />
            <SettingsRow
              icon={<IconBell size={18} />}
              label="Notifications"
              description="Manage email and push notifications"
              onClick={() => setNotificationsOpen(true)}
            />
            <SettingsRow
              icon={<IconPalette size={18} />}
              label="Appearance"
              description="Theme and display preferences"
              onClick={() => setAppearanceOpen(true)}
            />
            <SettingsRow
              icon={<IconMapPin size={18} />}
              label="Location"
              description="Default course and location settings"
              onClick={() => setLocationOpen(true)}
              isLast={profile?.role !== 'coach'}
            />
            {profile?.role === 'coach' && (
              <SettingsRow
                icon={<IconSparkles size={18} />}
                label="Coaching Philosophy"
                description="Configure CoachHelm AI insights and priorities"
                href="/golf/dashboard/settings/coaching-intelligence"
                isLast
              />
            )}
          </div>
        </div>

        {/* CoachHelm AI Section */}
        {profile?.role === 'coach' && profile.coachId && (
          <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '125ms', opacity: 0 }}>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">AI Features</h3>
            <div className="relative glass-standard rounded-2xl overflow-hidden p-4">
              <ShineEffect />
              <CoachHelmToggle coachId={profile.coachId} />
            </div>
          </div>
        )}

        {/* Team Section */}
        <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '150ms', opacity: 0 }}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Team</h3>

          {/* For Coaches: Team Settings */}
          {profile?.role === 'coach' && (
            <div className="relative glass-standard rounded-2xl overflow-hidden">
              <ShineEffect />
              <SettingsRow
                icon={<IconUsers size={18} />}
                label="Team Settings"
                description="Manage team name, logo and details"
                onClick={() => setTeamSettingsOpen(true)}
              />
              <SettingsRow
                icon={<IconSettings size={18} />}
                label="Invite Settings"
                description="Manage team invite codes and access"
                onClick={() => setInviteSettingsOpen(true)}
                isLast
              />
            </div>
          )}

          {/* For Players: Join Team Section */}
          {profile?.role === 'player' && profile.playerId && (
            <JoinTeamSection
              playerId={profile.playerId}
              currentTeam={profile.currentTeam}
            />
          )}
        </div>

        {/* Legal */}
        <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '175ms', opacity: 0 }}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Legal</h3>
          <div className="relative glass-standard rounded-2xl overflow-hidden">
            <ShineEffect />
            <SettingsRow
              icon={<IconShield size={18} />}
              label="Privacy Policy"
              description="Learn how we handle your data"
              href="/privacy"
            />
            <SettingsRow
              icon={<IconSettings size={18} />}
              label="Terms of Service"
              description="Read the terms for using Helm"
              href="/terms"
              isLast
            />
          </div>
        </div>

        {/* Danger Zone */}
        <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '190ms', opacity: 0 }}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Danger Zone</h3>
          <div className="relative glass-standard rounded-2xl overflow-hidden p-5">
            <ShineEffect />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900">Delete account</p>
                <p className="text-sm text-slate-500">
                  Permanently remove your account and all associated data.
                </p>
              </div>
              <Button
                type="button"
                variant="danger"
                isLoading={deletingAccount}
                onClick={handleDeleteAccount}
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>

        {/* Sign Out */}
        <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '210ms', opacity: 0 }}>
          <button
            onClick={handleSignOut}
            className="relative w-full glass-standard rounded-2xl overflow-hidden p-4 flex items-center gap-3 hover:border-red-200 hover:bg-red-50 transition-all group"
          >
            <ShineEffect />
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
              <IconLogout size={18} className="text-red-600" />
            </div>
            <span className="font-medium text-red-600">Sign Out</span>
          </button>
        </div>

        {/* App Info */}
        <div 
          className="text-center text-sm text-slate-400 py-4"
          style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '260ms', opacity: 0 }}
        >
          <p>GolfHelm v1.0.0</p>
          <p className="text-xs mt-1">© 2026 Helm Sports Labs</p>
        </div>
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Modals */}
      {profile && (
        <>
          <PersonalInfoModal
            isOpen={personalInfoOpen}
            onClose={() => setPersonalInfoOpen(false)}
            currentName={profile.name}
            currentAvatarUrl={profile.avatarUrl}
            role={profile.role}
            onUpdate={loadProfile}
          />
          <EmailModal
            isOpen={emailOpen}
            onClose={() => setEmailOpen(false)}
            currentEmail={profile.email}
            onUpdate={loadProfile}
          />
          <PasswordModal
            isOpen={passwordOpen}
            onClose={() => setPasswordOpen(false)}
          />
          <NotificationsModal
            isOpen={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
          />
          <AppearanceModal
            isOpen={appearanceOpen}
            onClose={() => setAppearanceOpen(false)}
          />
          <LocationModal
            isOpen={locationOpen}
            onClose={() => setLocationOpen(false)}
          />
          {profile.role === 'coach' && (
            <>
              <TeamSettingsModal
                isOpen={teamSettingsOpen}
                onClose={() => setTeamSettingsOpen(false)}
                onUpdate={loadProfile}
              />
              <InviteSettingsModal
                isOpen={inviteSettingsOpen}
                onClose={() => setInviteSettingsOpen(false)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function SettingsRow({
  icon,
  label,
  description,
  onClick,
  href,
  isLast = false
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
  href?: string;
  isLast?: boolean;
}) {
  const content = (
    <>
      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-600">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900">{label}</p>
        {description && (
          <p className="text-sm text-slate-500 truncate">{description}</p>
        )}
      </div>
      <IconChevronRight size={18} className="text-slate-300 flex-shrink-0" />
    </>
  );

  const className = cn(
    'w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors',
    !isLast && 'border-b border-slate-100'
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      {content}
    </button>
  );
}
