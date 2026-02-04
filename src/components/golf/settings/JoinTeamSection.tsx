'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { processGolfTeamInvitation } from '@/app/golf/actions/teams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconUsers, IconCheck, IconAlertCircle, IconLogout } from '@/components/icons';

interface JoinTeamSectionProps {
  playerId: string;
  currentTeam?: {
    id: string;
    name: string;
    organization?: {
      name: string;
    } | null;
  } | null;
}

export function JoinTeamSection({ playerId, currentTeam }: JoinTeamSectionProps) {
  const router = useRouter();
  const supabase = createClient();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  async function handleJoinTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Look up team by join code
      const { data: team, error: teamError } = await supabase
        .from('golf_teams')
        .select('id, name, join_code, organization_id')
        .eq('join_code', inviteCode.trim().toUpperCase())
        .single();

      if (teamError || !team) {
        setError('Invalid invite code. Please check and try again.');
        setLoading(false);
        return;
      }

      // Get organization name separately
      let orgName: string | null = null;
      if (team.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', team.organization_id)
          .single();
        orgName = org?.name ?? null;
      }

      // Check if already on this team
      if (currentTeam?.id === team.id) {
        setError('You are already on this team.');
        setLoading(false);
        return;
      }

      // If on another team, need to leave first
      if (currentTeam) {
        setError(`You must leave ${currentTeam.name} before joining a new team.`);
        setLoading(false);
        return;
      }

      // Join via server action to ensure status is set correctly
      const joinResult = await processGolfTeamInvitation(inviteCode.trim().toUpperCase(), playerId);
      if (!joinResult.success) {
        setError(joinResult.error || 'Failed to join team. Please try again.');
        setLoading(false);
        return;
      }

      setSuccess(`Successfully joined ${team.name}${orgName ? ` (${orgName})` : ''}!`);
      setInviteCode('');

      // Refresh the page after a moment
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLeaveTeam() {
    if (!currentTeam) return;

    setLoading(true);
    setError(null);

    try {
      // Leave team by removing from golf_team_members
      // Filter by both player_id AND team_id for safety
      const { error: deleteError } = await supabase
        .from('golf_team_members')
        .delete()
        .eq('player_id', playerId)
        .eq('team_id', currentTeam.id);

      if (deleteError) {
        setError('Failed to leave team. Please try again.');
        setLoading(false);
        return;
      }

      setSuccess('You have left the team.');
      setShowLeaveConfirm(false);

      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <IconUsers size={20} className="text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Team Membership</h3>
          <p className="text-sm text-slate-500">Manage your team affiliation</p>
        </div>
      </div>

      {/* Current Team Status */}
      {currentTeam ? (
        <div className="mb-6">
          <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <IconCheck size={20} className="text-white" />
              </div>
              <div>
                <p className="font-medium text-green-900">{currentTeam.name}</p>
                {currentTeam.organization?.name && (
                  <p className="text-sm text-green-700">{currentTeam.organization.name}</p>
                )}
              </div>
            </div>
            {!showLeaveConfirm ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLeaveConfirm(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <IconLogout size={16} className="mr-1" />
                Leave
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowLeaveConfirm(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleLeaveTeam}
                  isLoading={loading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Confirm Leave
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <IconAlertCircle size={20} className="text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-900">Not on a team</p>
              <p className="text-sm text-amber-700">
                Enter an invite code from your coach to join a team.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Join Team Form */}
      <form onSubmit={handleJoinTeam} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {currentTeam ? 'Join a Different Team' : 'Join a Team'}
          </label>
          <div className="flex gap-3">
            <Input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="Enter invite code (e.g., ABC12345)"
              className="flex-1 uppercase"
              maxLength={12}
              disabled={loading || !!currentTeam}
            />
            <Button
              type="submit"
              disabled={!inviteCode.trim() || loading || !!currentTeam}
              isLoading={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              Join Team
            </Button>
          </div>
          {currentTeam && (
            <p className="text-xs text-slate-500 mt-2">
              You must leave your current team before joining a new one.
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <IconAlertCircle size={16} className="text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <IconCheck size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}
      </form>

      {/* Help text */}
      <div className="mt-6 pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-500">
          Your coach will provide you with a team invite code. Once you join, you'll have access
          to team schedules, rounds, messages, and other team features.
        </p>
      </div>
    </div>
  );
}
