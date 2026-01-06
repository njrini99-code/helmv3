'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconCopy, IconCheck, IconRefresh } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';

interface TeamSettingsClientProps {
  coach: {
    id: string;
    team_id: string | null;
    full_name: string | null;
  };
  team: {
    id: string;
    name: string;
    season: string | null;
    invite_code: string | null;
    created_at: string;
  } | null;
}

export function TeamSettingsClient({ coach, team }: TeamSettingsClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form state for creating/editing team
  const [teamName, setTeamName] = useState(team?.name || '');
  const [season, setSeason] = useState(team?.season || '2024-2025');

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      showToast('Please enter a team name', 'error');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      // 1. Create the team
      const { data: newTeam, error: teamError } = await supabase
        .from('golf_teams')
        .insert({
          name: teamName.trim(),
          season: season,
          invite_code: generateInviteCode(),
        })
        .select()
        .single();

      if (teamError) throw teamError;

      // 2. Update coach's team_id
      const { error: coachError } = await supabase
        .from('golf_coaches')
        .update({ team_id: newTeam.id })
        .eq('id', coach.id);

      if (coachError) throw coachError;

      showToast('Team created successfully!', 'success');
      router.refresh();
    } catch {
      showToast('Failed to create team', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTeam = async () => {
    if (!team) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('golf_teams')
        .update({
          name: teamName.trim(),
          season: season,
        })
        .eq('id', team.id);

      if (error) throw error;

      showToast('Team updated successfully!', 'success');
      router.refresh();
    } catch {
      showToast('Failed to update team', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInviteCode = async () => {
    if (!team?.invite_code) return;

    const inviteUrl = `${window.location.origin}/golf/join/${team.invite_code}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateInviteCode = async () => {
    if (!team) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('golf_teams')
        .update({ invite_code: generateInviteCode() })
        .eq('id', team.id);

      if (error) throw error;

      showToast('Invite code regenerated', 'success');
      router.refresh();
    } catch {
      showToast('Failed to regenerate invite code', 'error');
    } finally {
      setLoading(false);
    }
  };

  // No team - show create form
  if (!team) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Create Your Team</h1>
          <p className="text-slate-500 mt-1">
            Set up your team to start adding players and creating events.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Team Name
            </label>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g., University Golf Team"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Season
            </label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="e.g., 2024-2025"
            />
          </div>

          <Button
            onClick={handleCreateTeam}
            disabled={loading || !teamName.trim()}
            className="w-full"
          >
            {loading ? 'Creating...' : 'Create Team'}
          </Button>
        </div>
      </div>
    );
  }

  // Has team - show settings
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Team Settings</h1>
        <p className="text-slate-500 mt-1">
          Manage your team details and invite players.
        </p>
      </div>

      {/* Team Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-900">Team Information</h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Team Name
          </label>
          <Input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Season
          </label>
          <Input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="Season"
          />
        </div>

        <Button
          onClick={handleUpdateTeam}
          disabled={loading}
          variant="secondary"
          className="gap-2"
        >
          <IconCheck size={16} />
          Save Changes
        </Button>
      </div>

      {/* Invite Code */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Player Invitations</h2>
        <p className="text-sm text-slate-500">
          Share this link with players to invite them to join your team.
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 px-4 py-3 bg-slate-50 rounded-lg font-mono text-sm text-slate-700 truncate">
            {`${typeof window !== 'undefined' ? window.location.origin : ''}/golf/join/${team.invite_code}`}
          </div>
          <Button
            variant={copied ? 'secondary' : 'primary'}
            onClick={handleCopyInviteCode}
            className="gap-2"
          >
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>

        <Button
          variant="secondary"
          onClick={handleRegenerateInviteCode}
          disabled={loading}
          className="gap-2"
        >
          <IconRefresh size={16} />
          Regenerate Invite Code
        </Button>

        <p className="text-xs text-slate-400">
          Regenerating will invalidate the old invite link.
        </p>
      </div>
    </div>
  );
}

// Helper to generate random invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
