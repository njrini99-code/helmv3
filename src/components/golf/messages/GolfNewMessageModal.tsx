'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { SearchBar } from '@/components/ui/search-bar';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconCheck, IconUsers, IconAlertCircle } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';

interface SearchResult {
  id: string;
  userId: string;
  name: string;
  subtitle: string;
  avatar: string | null;
  type: 'coach' | 'player';
}

interface GolfNewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (userId: string) => void;
  currentUserRole: 'coach' | 'player';
  teamId?: string;  // CRITICAL: This must be passed and valid
}

export function GolfNewMessageModal({
  isOpen,
  onClose,
  onSelect,
  currentUserRole,
  teamId,
}: GolfNewMessageModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noTeamError, setNoTeamError] = useState(false);

  // Search for users - FIXED to require team_id
  const searchUsers = useCallback(async (query: string) => {
    // CRITICAL: Do not search without a valid teamId
    if (!teamId) {
      setNoTeamError(true);
      setResults([]);
      return;
    }

    setNoTeamError(false);
    setLoading(true);
    const supabase = createClient();

    try {

      if (currentUserRole === 'coach') {
        // Coach searching for players on THEIR team only
        let playerQuery = supabase
          .from('golf_players')
          .select('id, user_id, first_name, last_name, year, avatar_url')
          .eq('team_id', teamId);  // ENFORCED team filter

        if (query.trim()) {
          playerQuery = playerQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`);
        }

        const { data: players, error } = await playerQuery.limit(20);

        if (error) {
          setResults([]);
          return;
        }

        const playerResults: SearchResult[] = (players || [])
          .filter(p => p.user_id) // Must have a user_id to message
          .map(p => ({
            id: p.id,
            userId: p.user_id!,
            name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown Player',
            subtitle: p.year ? `${p.year.charAt(0).toUpperCase()}${p.year.slice(1)}` : 'Player',
            avatar: p.avatar_url,
            type: 'player' as const,
          }));

        setResults(playerResults);
      } else {
        // Player searching for coaches on THEIR team only
        let coachQuery = supabase
          .from('golf_coaches')
          .select('id, user_id, full_name, title, avatar_url')
          .eq('team_id', teamId);  // ENFORCED team filter

        if (query.trim()) {
          coachQuery = coachQuery.ilike('full_name', `%${query}%`);
        }

        const { data: coaches, error } = await coachQuery.limit(20);

        if (error) {
          setResults([]);
          return;
        }

        const coachResults: SearchResult[] = (coaches || [])
          .filter(c => c.user_id)
          .map(c => ({
            id: c.id,
            userId: c.user_id,
            name: c.full_name || 'Coach',
            subtitle: c.title || 'Golf Coach',
            avatar: c.avatar_url,
            type: 'coach' as const,
          }));

        setResults(coachResults);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserRole, teamId]);

  // Initial load and search
  useEffect(() => {
    if (isOpen) {
      searchUsers(searchQuery);
    }
  }, [isOpen, searchQuery, searchUsers]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setResults([]);
      setSelectedId(null);
      setNoTeamError(false);
    }
  }, [isOpen]);

  const handleSelect = (result: SearchResult) => {
    setSelectedId(result.userId);
  };

  const handleStartConversation = () => {
    if (selectedId) {
      onSelect(selectedId);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Message"
      description={`Select a ${currentUserRole === 'coach' ? 'player' : 'coach'} to start a conversation`}
      size="md"
     
    >
      <div className="space-y-4">
        {/* No Team Error */}
        {noTeamError && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <IconAlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">No Team Found</p>
              <p className="text-xs text-amber-600 mt-0.5">
                You need to be assigned to a team before you can message team members.
              </p>
            </div>
          </div>
        )}

        {/* Search Input */}
        {!noTeamError && (
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={`Search ${currentUserRole === 'coach' ? 'players' : 'coaches'}...`}
            className="w-full"
            autoFocus
          />
        )}

        {/* Results */}
        <div className="min-h-[300px] max-h-[400px] overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full" />
            </div>
          ) : noTeamError ? null : results.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {results.map(result => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  className={cn(
                    'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors',
                    'hover:bg-slate-50 rounded-lg -mx-4',
                    selectedId === result.userId && 'bg-green-50 hover:bg-green-50'
                  )}
                >
                  <Avatar name={result.name} src={result.avatar} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{result.name}</p>
                    {result.subtitle && (
                      <p className="text-sm text-slate-500 truncate">{result.subtitle}</p>
                    )}
                  </div>
                  {selectedId === result.userId && (
                    <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center">
                      <IconCheck size={14} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <IconUsers size={20} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">
                {searchQuery.trim() 
                  ? `No ${currentUserRole === 'coach' ? 'players' : 'coaches'} found`
                  : `No ${currentUserRole === 'coach' ? 'players' : 'coaches'} on your team yet`
                }
              </p>
            </div>
          )}
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleStartConversation}
          disabled={!selectedId || noTeamError}
        >
          Start Conversation
        </Button>
      </ModalFooter>
    </Modal>
  );
}
