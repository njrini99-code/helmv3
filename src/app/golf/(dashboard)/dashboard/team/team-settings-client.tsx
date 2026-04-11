'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconCopy, IconCheck, IconRefresh } from '@/components/icons';
import { useToast } from '@/components/ui/toast';
import {
  createTeam,
  updateTeam,
  regenerateJoinCode,
} from '@/app/golf/actions/teams';
import { triggerHaptic } from '@/lib/utils/capacitor';

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
    join_code: string | null;
    created_at: string;
  } | null;
}

export function TeamSettingsClient({ team }: TeamSettingsClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Form state for creating/editing team
  const [teamName, setTeamName] = useState(team?.name || '');
  const [season, setSeason] = useState(() => {
    if (team?.season) return team.season;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const seasonStart = month >= 7 ? year : year - 1;
    return `${seasonStart}-${seasonStart + 1}`;
  });

  const handleCreateTeam = () => {
    if (!teamName.trim()) {
      showToast('Please enter a team name', 'error');
      return;
    }

    startTransition(async () => {
      const result = await createTeam(teamName, season);

      if (result.success) {
        void triggerHaptic('success');
        showToast('Team created successfully!', 'success');
        router.refresh();
      } else {
        void triggerHaptic('error');
        showToast(result.error || 'Failed to create team', 'error');
      }
    });
  };

  const handleUpdateTeam = () => {
    if (!team) return;

    startTransition(async () => {
      const result = await updateTeam(team.id, {
        name: teamName.trim(),
        season: season,
      });

      if (result.success) {
        void triggerHaptic('success');
        showToast('Team updated successfully!', 'success');
        router.refresh();
      } else {
        void triggerHaptic('error');
        showToast(result.error || 'Failed to update team', 'error');
      }
    });
  };

  const handleCopyInviteCode = async () => {
    if (!team?.join_code) return;

    const inviteUrl = `${window.location.origin}/golf/join/${team.join_code}`;
    await navigator.clipboard.writeText(inviteUrl);
    void triggerHaptic('light');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateInviteCode = () => {
    if (!team) return;
    void triggerHaptic('warning');

    startTransition(async () => {
      const result = await regenerateJoinCode(team.id);

      if (result.success) {
        void triggerHaptic('success');
        showToast('Invite code regenerated', 'success');
        router.refresh();
      } else {
        void triggerHaptic('error');
        showToast(result.error || 'Failed to regenerate invite code', 'error');
      }
    });
  };

  // No team - show create form
  if (!team) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-warm-900">Create Your Team</h1>
          <p className="text-warm-500 mt-1">
            Set up your team to start adding players and creating events.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-warm-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Team Name
            </label>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g., University Golf Team"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Season
            </label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="e.g., 2024-2025"
              disabled={isPending}
            />
          </div>

          <Button
            onClick={handleCreateTeam}
            disabled={isPending || !teamName.trim()}
            className="w-full"
          >
            {isPending ? 'Creating...' : 'Create Team'}
          </Button>
        </div>
      </div>
    );
  }

  // Has team - show settings
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-warm-900">Team Settings</h1>
        <p className="text-warm-500 mt-1">
          Manage your team details and invite players.
        </p>
      </div>

      {/* Team Info */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 space-y-6 mb-6">
        <h2 className="text-lg font-semibold text-warm-900">Team Information</h2>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-2">
            Team Name
          </label>
          <Input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name"
            disabled={isPending}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-2">
            Season
          </label>
          <Input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="Season"
            disabled={isPending}
          />
        </div>

        <Button
          onClick={handleUpdateTeam}
          disabled={isPending}
          variant="secondary"
          className="gap-2"
        >
          <IconCheck size={16} />
          {isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Invite Code */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 space-y-4">
        <h2 className="text-lg font-semibold text-warm-900">Player Invitations</h2>
        <p className="text-sm text-warm-500">
          Share this link with players to invite them to join your team.
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 px-4 py-3 bg-warm-50 rounded-lg font-mono text-sm text-warm-700 truncate">
            {`${typeof window !== 'undefined' ? window.location.origin : ''}/golf/join/${team.join_code}`}
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
          disabled={isPending}
          className="gap-2"
        >
          <IconRefresh size={16} />
          {isPending ? 'Regenerating...' : 'Regenerate Invite Code'}
        </Button>

        <p className="text-xs text-warm-400">
          Regenerating will invalidate the old invite link.
        </p>
      </div>
    </div>
  );
}
