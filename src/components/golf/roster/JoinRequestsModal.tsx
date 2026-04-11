'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getTeamJoinRequests, acceptJoinRequest, rejectJoinRequest } from '@/app/golf/actions/teams';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { IconUsers, IconCheck, IconX, IconClock } from '@/components/icons';
import { useFocusTrap } from '@/hooks/use-focus-trap';

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

interface JoinRequestsModalProps {
  onClose: () => void;
}

/**
 * Modal that pops up on roster page showing pending join requests
 */
export function JoinRequestsModal({ onClose }: JoinRequestsModalProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { modalRef } = useFocusTrap(true, onClose); // Always open when rendered

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
    setRequests(prev => prev.filter(r => r.id !== requestId));
    setProcessingId(null);
    router.refresh();

    // Close modal if no more requests
    if (requests.length === 1) {
      onClose();
    }
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
    setRequests(prev => prev.filter(r => r.id !== requestId));
    setProcessingId(null);

    // Close modal if no more requests
    if (requests.length === 1) {
      onClose();
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

  // Don't show modal if no requests after loading
  if (!loading && requests.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-warm-900/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-requests-modal-title"
          className="bg-white rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <IconUsers size={20} className="text-white" />
                </div>
                <div>
                  <h2 id="join-requests-modal-title" className="text-xl font-bold text-white">Join Requests</h2>
                  <p className="text-white/80 text-sm">
                    {loading ? (
                      <span className="inline-block h-3 w-24 rounded bg-white/20 animate-pulse" aria-label="Loading" />
                    ) : (
                      `${requests.length} player${requests.length !== 1 ? 's' : ''} waiting`
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <IconX size={20} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto">
            {error && (
              <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="p-8 text-center">
                <div className="space-y-3 w-32 mx-auto">
                  <div className="h-3 w-full bg-warm-200 rounded skeleton-shimmer" />
                  <div className="h-3 w-2/3 bg-warm-200 rounded skeleton-shimmer" />
                </div>
                <p className="text-warm-500 mt-3">Loading requests...</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {requests.map((request) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    layout
                    className="bg-warm-50 rounded-xl border border-warm-200 p-4"
                  >
                    <div className="flex items-start gap-4">
                      {/* Player Avatar */}
                      <Avatar
                        name={`${request.player?.first_name || ''} ${request.player?.last_name || ''}`}
                        size="lg"
                        className="flex-shrink-0"
                      />

                      {/* Player Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-warm-900 truncate text-lg">
                            {request.player?.first_name || 'Unknown'} {request.player?.last_name || 'Player'}
                          </h4>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-warm-500 mb-2">
                          {request.player?.graduation_year && (
                            <span className="px-2 py-0.5 bg-warm-200 text-warm-600 rounded-full text-xs font-medium">
                              Class of {request.player.graduation_year}
                            </span>
                          )}
                          {request.player?.hometown && request.player?.state && (
                            <span>{request.player.hometown}, {request.player.state}</span>
                          )}
                          {request.player?.handicap !== null && request.player?.handicap !== undefined && (
                            <span>
                              HCP: {request.player.handicap > 0 ? `+${request.player.handicap}` : request.player.handicap}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-xs text-amber-600 mb-3">
                          <IconClock size={12} />
                          Requested {formatDate(request.created_at)}
                        </div>

                        {request.message && (
                          <div className="p-3 bg-white rounded-lg border border-warm-200 mb-3">
                            <p className="text-sm text-warm-600 italic">"{request.message}"</p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAccept(request.id)}
                            disabled={processingId === request.id}
                            className="flex-1 bg-primary-600 hover:bg-primary-700 transition-colors"
                          >
                            {processingId === request.id ? (
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                              </span>
                            ) : (
                              <>
                                <IconCheck size={16} className="mr-1.5" />
                                Accept
                              </>
                            )}
                          </Button>
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
                              <>
                                <IconX size={16} className="mr-1.5" />
                                Decline
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-warm-200 px-4 py-3 bg-warm-50">
            <button
              onClick={onClose}
              className="w-full py-2 text-sm text-warm-500 hover:text-warm-700 transition-colors"
            >
              Review later
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
