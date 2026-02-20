'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { cn } from '@/lib/utils';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { SearchBar } from '@/components/ui/search-bar';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconCheck, IconUsers, IconAlertCircle, IconMail } from '@/components/icons';
import { getGolfTeamPlayersForBroadcast, createGolfTeamBroadcast } from '@/app/golf/actions/messages';

interface Player {
  id: string;
  userId: string;
  name: string;
  gradYear: number | null;
  avatarUrl: string | null;
}

interface GolfTeamBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conversationId: string) => void;
  teamId: string;
}

export function GolfTeamBroadcastModal({
  isOpen,
  onClose,
  onSuccess,
  teamId,
}: GolfTeamBroadcastModalProps) {
  const { modalRef } = useFocusTrap(isOpen, onClose);
  const [step, setStep] = useState<'recipients' | 'details'>('recipients');
  const [searchQuery, setSearchQuery] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastTitle, setBroadcastTitle] = useState('');

  // Fetch players when modal opens
  const fetchPlayers = useCallback(async () => {
    if (!teamId) {
      setError('No team selected');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await getGolfTeamPlayersForBroadcast(teamId);

    if ('error' in result) {
      setError(result.error);
      setPlayers([]);
    } else {
      setPlayers(result.players);
      // Pre-select all players by default
      setSelectedPlayerIds(new Set(result.players.map(p => p.id)));
    }

    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    if (isOpen) {
      fetchPlayers();
    }
  }, [isOpen, fetchPlayers]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('recipients');
      setSearchQuery('');
      setSelectedPlayerIds(new Set());
      setBroadcastTitle('');
      setError(null);
    }
  }, [isOpen]);

  // Filter players by search query
  const filteredPlayers = players.filter(player =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Toggle player selection
  const togglePlayer = (playerId: string) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  // Select/Deselect all
  const toggleSelectAll = () => {
    if (selectedPlayerIds.size === filteredPlayers.length) {
      setSelectedPlayerIds(new Set());
    } else {
      setSelectedPlayerIds(new Set(filteredPlayers.map(p => p.id)));
    }
  };

  // Create the broadcast conversation
  const handleCreate = async () => {
    if (selectedPlayerIds.size === 0) {
      setError('Please select at least one player');
      return;
    }

    if (!broadcastTitle.trim()) {
      setError('Please enter a group name');
      return;
    }

    setCreating(true);
    setError(null);

    const result = await createGolfTeamBroadcast({
      teamId,
      title: broadcastTitle.trim(),
      selectedPlayerIds: Array.from(selectedPlayerIds),
    });

    if ('error' in result) {
      setError(result.error);
      setCreating(false);
    } else {
      onSuccess(result.conversationId);
      onClose();
    }
  };

  const handleNext = () => {
    if (selectedPlayerIds.size === 0) {
      setError('Please select at least one player');
      return;
    }
    setError(null);
    setStep('details');
  };

  const handleBack = () => {
    setStep('recipients');
    setError(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 'recipients' ? 'New Team Message' : 'Group Details'}
      description={
        step === 'recipients'
          ? 'Select players to include in this group conversation'
          : 'Name your group conversation'
      }
      size="md"
    >
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      {step === 'recipients' ? (
        <div className="space-y-4">
          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <IconAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Search & Select All Row */}
          <div className="flex items-center gap-3">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search players..."
              className="flex-1"
              autoFocus
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleSelectAll}
              className="whitespace-nowrap"
            >
              {selectedPlayerIds.size === filteredPlayers.length && filteredPlayers.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </Button>
          </div>

          {/* Selection Summary */}
          <div className="flex items-center gap-2 px-1">
            <IconUsers size={16} className="text-warm-400" />
            <span className="text-sm text-warm-600">
              {selectedPlayerIds.size} of {players.length} players selected
            </span>
          </div>

          {/* Player List */}
          <div className="min-h-[250px] max-h-[350px] overflow-y-auto -mx-6 px-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            ) : filteredPlayers.length > 0 ? (
              <div className="divide-y divide-warm-100">
                {filteredPlayers.map(player => {
                  const isSelected = selectedPlayerIds.has(player.id);
                  return (
                    <button
                      key={player.id}
                      onClick={() => togglePlayer(player.id)}
                      className={cn(
                        'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors',
                        'hover:bg-warm-50 active:bg-warm-100 rounded-lg -mx-4',
                        isSelected && 'bg-primary-50 hover:bg-primary-50 active:bg-primary-100'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                        isSelected
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-warm-300'
                      )}>
                        {isSelected && <IconCheck size={12} className="text-white" />}
                      </div>
                      <Avatar name={player.name} src={player.avatarUrl} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-warm-900 truncate">{player.name}</p>
                        {player.gradYear && (
                          <p className="text-sm text-warm-500 truncate">
                            Class of {player.gradYear}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mb-3">
                  <IconUsers size={20} className="text-warm-400" />
                </div>
                <p className="text-sm text-warm-500">
                  {searchQuery.trim()
                    ? 'No players match your search'
                    : 'No players on your team yet'}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <IconAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Group Name Input */}
          <div>
            <label htmlFor="broadcast-title" className="block text-sm font-medium text-warm-700 mb-1.5">
              Group Name
            </label>
            <input
              id="broadcast-title"
              type="text"
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              placeholder="e.g., Team Updates, Practice Reminders"
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border border-warm-200',
                'focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
                'text-warm-900 placeholder:text-warm-400 transition-colors'
              )}
              autoFocus
            />
            <p className="text-xs text-warm-500 mt-1.5">
              Choose a name that describes the purpose of this group
            </p>
          </div>

          {/* Selected Players Preview */}
          <div className="p-4 bg-warm-50 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <IconUsers size={16} className="text-warm-500" />
              <span className="text-sm font-medium text-warm-700">
                {selectedPlayerIds.size} recipients
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {players
                .filter(p => selectedPlayerIds.has(p.id))
                .slice(0, 8)
                .map(player => (
                  <div
                    key={player.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-full border border-warm-200"
                  >
                    <Avatar name={player.name} src={player.avatarUrl} size="xs" />
                    <span className="text-xs font-medium text-warm-700">{player.name.split(' ')[0]}</span>
                  </div>
                ))}
              {selectedPlayerIds.size > 8 && (
                <div className="flex items-center px-2.5 py-1.5 bg-warm-100 rounded-full">
                  <span className="text-xs font-medium text-warm-500">
                    +{selectedPlayerIds.size - 8} more
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Title Suggestions */}
          <div>
            <p className="text-xs font-medium text-warm-500 mb-2">Quick suggestions</p>
            <div className="flex flex-wrap gap-2">
              {['Team Updates', 'Practice', 'Travel Info', 'Competition'].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => setBroadcastTitle(suggestion)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                    broadcastTitle === suggestion
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ModalFooter>
        {step === 'recipients' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleNext}
              disabled={selectedPlayerIds.size === 0}
            >
              Next
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={handleBack}>
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!broadcastTitle.trim() || creating}
              className="gap-2"
            >
              {creating ? (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                  </span>
                  Creating...
                </>
              ) : (
                <>
                  <IconMail size={16} />
                  Create Group
                </>
              )}
            </Button>
          </>
        )}
      </ModalFooter>
      </div>
    </Modal>
  );
}
