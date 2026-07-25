'use client';

import { useState, useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';
import { createTeamJoinRequest, getPlayerJoinRequests, cancelJoinRequest } from '@/app/golf/actions/teams';
import { createClient } from '@/lib/supabase/client';
import { Surface, Button, Input } from '@/components/fairway';
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
  const uid = useId();
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
  const [now, setNow] = useState<Date | null>(null);

  // Initialize `now` on the client to avoid SSR/CSR mismatch in the
  // "Requested Xm/h/d ago" relative time labels.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
    if (!now) {
      // Pre-hydration: render absolute date so SSR + first paint match.
      return date.toLocaleDateString();
    }
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
    <Surface elevation="border" padding="lg">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-fw-sm bg-surface-sunken text-text-secondary">
          <IconUsers size={20} aria-hidden />
        </span>
        <div>
          <h3 className="font-fw-display text-h2 text-text-primary">Team Membership</h3>
          <p className="font-fw-sans text-body-sm text-text-secondary">Request to join your team</p>
        </div>
      </div>

      {/* Current Team Status */}
      {currentTeam ? (
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 rounded-fw-md border border-accent-500/40 bg-accent-50 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-fw-sm bg-accent-700 text-text-on-accent">
                <IconCheck size={20} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate font-fw-sans text-body font-medium text-text-primary">{currentTeam.name}</p>
                {currentTeam.organization?.name && (
                  <p className="truncate font-fw-sans text-body-sm text-text-secondary">{currentTeam.organization.name}</p>
                )}
              </div>
            </div>
            {!showLeaveConfirm ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowLeaveConfirm(true)}
                leftIcon={<IconLogout size={16} aria-hidden />}
              >
                Leave
              </Button>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowLeaveConfirm(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleLeaveTeam}
                  busy={loading}
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
              <p className="block font-fw-sans text-body-sm font-medium text-text-secondary">
                Pending Requests
              </p>
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between gap-3 rounded-fw-md border border-border-subtle bg-surface-sunken p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-fw-sm bg-fw-warning-bg text-fw-warning-ink">
                      <IconClock size={20} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-fw-sans text-body font-medium text-text-primary">{request.team.name}</p>
                      <p className="truncate font-fw-sans text-body-sm text-text-secondary" suppressHydrationWarning>
                        {request.team.organization?.name && `${request.team.organization.name} · `}
                        Requested {formatDate(request.created_at)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelRequest(request.id)}
                    busy={cancellingId === request.id}
                    leftIcon={<IconX size={16} aria-hidden />}
                  >
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Not on a team message */}
          {pendingRequests.length === 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-3 rounded-fw-md border border-border-subtle bg-surface-sunken p-4">
                <IconAlertCircle size={20} className="shrink-0 text-text-tertiary" aria-hidden />
                <div>
                  <p className="font-fw-sans text-body font-medium text-text-primary">Not on a team yet</p>
                  <p className="font-fw-sans text-body-sm text-text-secondary">
                    Enter your team&rsquo;s invite code below to request to join.
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
            <label htmlFor={`${uid}-invite-code`} className="mb-2 block font-fw-sans text-body-sm font-medium text-text-secondary">
              Request to Join a Team
            </label>
            <div className="space-y-3">
              <Input
                id={`${uid}-invite-code`}
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
                variant="primary"
                fullWidth
                disabled={!inviteCode.trim() || loading}
                busy={loading}
              >
                Request to Join
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-fw-sm border border-fw-danger/30 bg-fw-danger-bg p-3">
              <IconAlertCircle size={16} className="shrink-0 text-fw-danger-ink" aria-hidden />
              <p className="font-fw-sans text-body-sm text-fw-danger-ink">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-fw-sm border border-accent-500/40 bg-accent-50 p-3">
              <IconCheck size={16} className="shrink-0 text-accent-700" aria-hidden />
              <p className="font-fw-sans text-body-sm text-accent-700">{success}</p>
            </div>
          )}
        </form>
      )}

      {/* Help text */}
      <div className="mt-6 border-t border-border-subtle pt-4">
        <p className="font-fw-sans text-caption text-text-tertiary">
          {currentTeam
            ? 'You can only be on one team at a time. Leave your current team to join a different one.'
            : 'Your coach will review your request and approve you to join the team. You\'ll be notified when your request is approved.'}
        </p>
      </div>
    </Surface>
  );
}
