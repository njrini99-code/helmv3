'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createTeamJoinRequest, getPlayerJoinRequests, cancelJoinRequest } from '@/app/golf/actions/teams';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconUsers, IconCheck, IconAlertCircle, IconLogout, IconClock, IconX } from '@/components/icons';

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

interface PendingRequest {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  team: {
    id: string;
    name: string;
    organization?: { name: string } | null;
  };
}

export function JoinTeamSection({ playerId, currentTeam }: JoinTeamSectionProps) {
  const router = useRouter();
  const supabase = createClient();
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Fetch pending requests on mount
  useEffect(() => {
    async function fetchRequests() {
      const result = await getPlayerJoinRequests(playerId);
      if (result.success && result.data) {
        setPendingRequests(result.data);
      }
      setLoadingRequests(false);
    }
    fetchRequests();
  }, [playerId]);

  async function handleRequestJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await createTeamJoinRequest(
        inviteCode.trim().toUpperCase(),
        playerId,
        message.trim() || undefined
      );

      if (!result.success) {
        setError(result.error || 'Failed to submit request. Please try again.');
        setLoading(false);
        return;
      }

      setSuccess('Your request has been sent to the coach for approval.');
      setInviteCode('');
      setMessage('');

      // Refresh pending requests
      const requestsResult = await getPlayerJoinRequests(playerId);
      if (requestsResult.success && requestsResult.data) {
        setPendingRequests(requestsResult.data);
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelRequest(requestId: string) {
    setCancellingId(requestId);

    try {
      const result = await cancelJoinRequest(requestId);

      if (!result.success) {
        setError(result.error || 'Failed to cancel request.');
        setCancellingId(null);
        return;
      }

      // Remove from local state
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {
      setError('Failed to cancel request.');
    } finally {
      setCancellingId(null);
    }
  }

  async function handleLeaveTeam() {
    if (!currentTeam) return;

    setLoading(true);
    setError(null);

    try {
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

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="bg-white rounded-2xl border border-warm-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
          <IconUsers size={20} className="text-primary-600" />
        </div>
        <div>
          <h3 className="font-medium text-warm-900">Team Membership</h3>
          <p className="text-sm text-warm-500">Request to join your team</p>
        </div>
      </div>

      {/* Current Team Status */}
      {currentTeam ? (
        <div className="mb-6">
          <div className="flex items-center justify-between p-4 bg-primary-50 border border-primary-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <IconCheck size={20} className="text-white" />
              </div>
              <div>
                <p className="font-medium text-primary-900">{currentTeam.name}</p>
                {currentTeam.organization?.name && (
                  <p className="text-sm text-primary-700">{currentTeam.organization.name}</p>
                )}
              </div>
            </div>
            {!showLeaveConfirm ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLeaveConfirm(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 active:bg-red-100 active:scale-95 transition-colors"
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
                  className="bg-red-600 hover:bg-red-700 active:scale-95 transition-colors"
                >
                  Confirm Leave
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Pending Requests */}
          {!loadingRequests && pendingRequests.length > 0 && (
            <div className="mb-6 space-y-3">
              <label className="block text-sm font-medium text-warm-700">
                Pending Requests
              </label>
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <IconClock size={20} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-amber-900">{request.team.name}</p>
                      <p className="text-sm text-amber-700">
                        {request.team.organization?.name && `${request.team.organization.name} · `}
                        Requested {formatDate(request.created_at)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelRequest(request.id)}
                    disabled={cancellingId === request.id}
                    className="text-amber-700 hover:text-amber-800 hover:bg-amber-100 active:bg-amber-200 active:scale-95 transition-colors"
                  >
                    {cancellingId === request.id ? (
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-amber-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 rounded-full bg-amber-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 rounded-full bg-amber-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                      </span>
                    ) : (
                      <>
                        <IconX size={16} className="mr-1" />
                        Cancel
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Not on a team message */}
          {pendingRequests.length === 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-3 p-4 bg-warm-50 border border-warm-200 rounded-xl">
                <IconAlertCircle size={20} className="text-warm-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-warm-700">Not on a team yet</p>
                  <p className="text-sm text-warm-500">
                    Enter your team's invite code below to request to join.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Request to Join Form */}
      {!currentTeam && (
        <form onSubmit={handleRequestJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Request to Join a Team
            </label>
            <div className="space-y-3">
              <Input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Enter team code (e.g., ABC12345)"
                className="uppercase"
                maxLength={12}
                disabled={loading}
              />
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a message to your coach (optional)"
                maxLength={200}
                disabled={loading}
              />
              <Button
                type="submit"
                disabled={!inviteCode.trim() || loading}
                isLoading={loading}
                className="w-full bg-primary-600 hover:bg-primary-700 active:scale-95 transition-colors"
              >
                Request to Join
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <IconAlertCircle size={16} className="text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-primary-50 border border-primary-200 rounded-lg">
              <IconCheck size={16} className="text-primary-600 flex-shrink-0" />
              <p className="text-sm text-primary-600">{success}</p>
            </div>
          )}
        </form>
      )}

      {/* Help text */}
      <div className="mt-6 pt-4 border-t border-warm-200">
        <p className="text-xs text-warm-500">
          {currentTeam
            ? 'You can only be on one team at a time. Leave your current team to join a different one.'
            : 'Your coach will review your request and approve you to join the team. You\'ll be notified when your request is approved.'}
        </p>
      </div>
    </div>
  );
}
