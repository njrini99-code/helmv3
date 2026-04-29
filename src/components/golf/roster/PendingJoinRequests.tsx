'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getTeamJoinRequests, acceptJoinRequest, rejectJoinRequest } from '@/app/golf/actions/teams';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { IconUser, IconCheck, IconX, IconClock, IconChevronDown, IconChevronUp } from '@/components/icons';

interface JoinRequest {
  id: string;
  team_id: string;
  player_id: string;
  status: 'pending' | 'approved' | 'rejected';
  message: string | null;
  created_at: string;
  player?: {
    id: string;
    first_name: string;
    last_name: string;
    graduation_year: number | null;
    handicap: number | null;
    hometown: string | null;
    state: string | null;
  };
}

export function PendingJoinRequests() {
  const router = useRouter();
  const { addToast } = useToast();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRequests() {
      const result = await getTeamJoinRequests();
      if (result.success && result.data) {
        setRequests(result.data);
      }
      setLoading(false);
    }
    fetchRequests();
  }, []);

  async function handleAccept(requestId: string) {
    setProcessingId(requestId);
    setError(null);

    const request = requests.find(r => r.id === requestId);
    const playerName = request?.player
      ? `${request.player.first_name} ${request.player.last_name}`
      : 'Player';

    const result = await acceptJoinRequest(requestId);

    if (!result.success) {
      const errorMsg = result.error || 'Failed to accept request';
      setError(errorMsg);
      addToast({ type: 'error', title: 'Failed to accept request', description: errorMsg });
      setProcessingId(null);
      return;
    }

    addToast({ type: 'success', title: 'Player accepted', description: `${playerName} has been added to your team.` });

    // Remove from local state
    setRequests(prev => prev.filter(r => r.id !== requestId));
    setProcessingId(null);

    // Refresh to show new player in roster
    router.refresh();
  }

  async function handleReject(requestId: string) {
    setProcessingId(requestId);
    setError(null);

    const request = requests.find(r => r.id === requestId);
    const playerName = request?.player
      ? `${request.player.first_name} ${request.player.last_name}`
      : 'Player';

    const result = await rejectJoinRequest(requestId);

    if (!result.success) {
      const errorMsg = result.error || 'Failed to decline request';
      setError(errorMsg);
      addToast({ type: 'error', title: 'Failed to decline request', description: errorMsg });
      setProcessingId(null);
      return;
    }

    addToast({ type: 'success', title: 'Request declined', description: `${playerName}'s join request has been declined.` });

    // Remove from local state
    setRequests(prev => prev.filter(r => r.id !== requestId));
    setProcessingId(null);
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

  // Don't render if no pending requests
  if (!loading && requests.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl overflow-hidden"
      >
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-amber-100/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-sm">
              <IconUser size={20} className="text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-medium text-amber-900">
                Pending Join Requests
              </h3>
              <p className="text-sm text-amber-700">
                {loading ? (
                  <span className="inline-block h-3 w-40 rounded bg-amber-200/70 animate-pulse" aria-label="Loading" />
                ) : (
                  `${requests.length} ${requests.length === 1 ? 'player' : 'players'} waiting for approval`
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {requests.length > 0 && (
              <span className="w-6 h-6 bg-amber-500 text-white text-[11px] font-medium rounded-full flex items-center justify-center">
                {requests.length}
              </span>
            )}
            {expanded ? (
              <IconChevronUp size={20} className="text-amber-700" />
            ) : (
              <IconChevronDown size={20} className="text-amber-700" />
            )}
          </div>
        </button>

        {/* Requests List */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
              style={{ overflow: 'hidden' }}
            >
              {error && (
                <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {loading ? (
                <div className="p-6 text-center">
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              ) : (
                <div className="px-4 pb-4 space-y-3">
                  {requests.map((request) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="bg-white rounded-xl border border-amber-200/50 p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-4">
                        {/* Player Avatar */}
                        <Avatar
                          name={`${request.player?.first_name || ''} ${request.player?.last_name || ''}`}
                          size="md"
                          className="flex-shrink-0"
                        />

                        {/* Player Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-warm-900 truncate">
                              {request.player?.first_name} {request.player?.last_name}
                            </h4>
                            {request.player?.graduation_year && (
                              <span className="text-xs px-2 py-0.5 bg-warm-100 text-warm-600 rounded-full">
                                Class of {request.player.graduation_year}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-warm-500">
                            {request.player?.hometown && request.player?.state && (
                              <span>{request.player.hometown}, {request.player.state}</span>
                            )}
                            {request.player?.handicap !== null && request.player?.handicap !== undefined && (
                              <span>
                                Handicap: {request.player.handicap > 0 ? `+${request.player.handicap}` : request.player.handicap}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-amber-600">
                              <IconClock size={14} />
                              {formatDate(request.created_at)}
                            </span>
                          </div>

                          {request.message && (
                            <div className="mt-2 p-2 bg-warm-50 rounded-lg border border-warm-100">
                              <p className="text-sm text-warm-600 italic">"{request.message}"</p>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleReject(request.id)}
                            disabled={processingId === request.id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors border-red-200"
                          >
                            {processingId === request.id ? (
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                              </span>
                            ) : (
                              <IconX size={16} />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleAccept(request.id)}
                            disabled={processingId === request.id}
                            className="bg-primary-600 hover:bg-primary-700 transition-colors"
                          >
                            {processingId === request.id ? (
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                              </span>
                            ) : (
                              <>
                                <IconCheck size={16} className="mr-1" />
                                Accept
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
