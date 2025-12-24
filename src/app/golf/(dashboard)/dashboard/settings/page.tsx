'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
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
  IconPalette
} from '@/components/icons';

interface UserProfile {
  name: string;
  email: string;
  role: 'coach' | 'player';
  teamName?: string;
}

export default function GolfSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

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
      .select('full_name, team:golf_teams(name)')
      .eq('user_id', user.id)
      .single();

    if (coach) {
      setProfile({
        name: coach.full_name || 'Coach',
        email: user.email || '',
        role: 'coach',
        teamName: typeof coach.team === 'object' && coach.team ? coach.team.name : undefined,
      });
      setLoading(false);
      return;
    }

    // Check if player
    const { data: player } = await supabase
      .from('golf_players')
      .select('first_name, last_name, team:golf_teams(name)')
      .eq('user_id', user.id)
      .single();

    if (player) {
      setProfile({
        name: `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Player',
        email: user.email || '',
        role: 'player',
        teamName: typeof player.team === 'object' && player.team ? player.team.name : undefined,
      });
    }

    setLoading(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/golf/login';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
          <p className="text-slate-500 mt-0.5">Manage your account and preferences</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Profile Card */}
        {profile && (
          <div 
            className="bg-white rounded-2xl border border-slate-200/60 p-6"
            style={{ animation: 'fadeInUp 0.4s ease-out forwards', opacity: 0 }}
          >
            <div className="flex items-center gap-4">
              <Avatar name={profile.name} size="lg" />
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
              <button className="px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
                Edit Profile
              </button>
            </div>
          </div>
        )}

        {/* Account Section */}
        <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '50ms', opacity: 0 }}>
          <h3 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Account</h3>
          <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
            <SettingsRow
              icon={<IconUser size={18} />}
              label="Personal Information"
              description="Update your name, email and profile picture"
              comingSoon
            />
            <SettingsRow
              icon={<IconMail size={18} />}
              label="Email Address"
              description={profile?.email || 'Not set'}
              comingSoon
            />
            <SettingsRow
              icon={<IconShield size={18} />}
              label="Password & Security"
              description="Change password and manage security"
              comingSoon
              isLast
            />
          </div>
        </div>

        {/* Preferences Section */}
        <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '100ms', opacity: 0 }}>
          <h3 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Preferences</h3>
          <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
            <SettingsRow
              icon={<IconBell size={18} />}
              label="Notifications"
              description="Manage email and push notifications"
              comingSoon
            />
            <SettingsRow
              icon={<IconPalette size={18} />}
              label="Appearance"
              description="Theme and display preferences"
              comingSoon
            />
            <SettingsRow
              icon={<IconMapPin size={18} />}
              label="Location"
              description="Default course and location settings"
              comingSoon
              isLast
            />
          </div>
        </div>

        {/* Team Section (for coaches) */}
        {profile?.role === 'coach' && (
          <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '150ms', opacity: 0 }}>
            <h3 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Team</h3>
            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
              <SettingsRow
                icon={<IconUsers size={18} />}
                label="Team Settings"
                description="Manage team name, logo and details"
                comingSoon
              />
              <SettingsRow
                icon={<IconSettings size={18} />}
                label="Invite Settings"
                description="Manage team invite codes and access"
                comingSoon
                isLast
              />
            </div>
          </div>
        )}

        {/* Sign Out */}
        <div style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '200ms', opacity: 0 }}>
          <button
            onClick={handleSignOut}
            className="w-full bg-white rounded-2xl border border-slate-200/60 p-4 flex items-center gap-3 hover:border-red-200 hover:bg-red-50 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
              <IconLogout size={18} className="text-red-600" />
            </div>
            <span className="font-medium text-red-600">Sign Out</span>
          </button>
        </div>

        {/* App Info */}
        <div 
          className="text-center text-sm text-slate-400 py-4"
          style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '250ms', opacity: 0 }}
        >
          <p>GolfHelm v1.0.0</p>
          <p className="text-xs mt-1">© 2024 Helm Sports Labs</p>
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
    </div>
  );
}

function SettingsRow({ 
  icon, 
  label, 
  description, 
  onClick,
  comingSoon = false,
  isLast = false
}: { 
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
  comingSoon?: boolean;
  isLast?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      className={cn(
        'w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors',
        !isLast && 'border-b border-slate-100',
        comingSoon && 'cursor-not-allowed opacity-70'
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-600">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-900">{label}</p>
          {comingSoon && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-500">
              Soon
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-slate-500 truncate">{description}</p>
        )}
      </div>
      {!comingSoon && (
        <IconChevronRight size={18} className="text-slate-300 flex-shrink-0" />
      )}
    </button>
  );
}
