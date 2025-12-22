'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { SearchBar } from '@/components/ui/search-bar';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconCheck, IconSearch, IconUsers } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';

interface SearchResult {
  id: string;
  userId: string;
  name: string;
  subtitle: string;
  avatar: string | null;
  type: 'coach' | 'player';
}

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (userId: string) => void;
  currentUserRole: 'coach' | 'player';
}

export function NewMessageModal({
  isOpen,
  onClose,
  onSelect,
  currentUserRole,
}: NewMessageModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Search for users
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      // If current user is a coach, search for players
      // If current user is a player, search for coaches
      if (currentUserRole === 'coach') {
        const { data: players } = await supabase
          .from('players')
          .select('id, user_id, first_name, last_name, primary_position, grad_year, avatar_url, recruiting_activated')
          .eq('recruiting_activated', true)
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
          .limit(20);

        const playerResults: SearchResult[] = (players || []).map(p => ({
          id: p.id,
          userId: p.user_id!,
          name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown Player',
          subtitle: [p.primary_position, p.grad_year ? `Class of ${p.grad_year}` : null].filter(Boolean).join(' • '),
          avatar: p.avatar_url,
          type: 'player',
        }));

        setResults(playerResults);
      } else {
        // Player searching for coaches
        const { data: coaches } = await supabase
          .from('coaches')
          .select('id, user_id, full_name, school_name, program_division, avatar_url')
          .or(`full_name.ilike.%${query}%,school_name.ilike.%${query}%`)
          .limit(20);

        const coachResults: SearchResult[] = (coaches || []).map(c => ({
          id: c.id,
          userId: c.user_id,
          name: c.full_name || c.school_name || 'Coach',
          subtitle: [c.school_name, c.program_division].filter(Boolean).join(' • '),
          avatar: c.avatar_url,
          type: 'coach',
        }));

        setResults(coachResults);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserRole]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setResults([]);
      setSelectedId(null);
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
      description={`Search for a ${currentUserRole === 'coach' ? 'player' : 'coach'} to start a conversation`}
      size="md"
    >
      <div className="space-y-4">
        {/* Search Input */}
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={`Search ${currentUserRole === 'coach' ? 'players' : 'coaches'}...`}
          className="w-full"
          autoFocus
        />

        {/* Results */}
        <div className="min-h-[300px] max-h-[400px] overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full" />
            </div>
          ) : results.length > 0 ? (
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
                      <p className="text-sm leading-relaxed text-slate-500 truncate">{result.subtitle}</p>
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
          ) : searchQuery.trim() ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <IconSearch size={20} className="text-slate-400" />
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                No {currentUserRole === 'coach' ? 'players' : 'coaches'} found
              </p>
              <p className="text-xs text-slate-400 mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <IconUsers size={20} className="text-slate-400" />
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                Start typing to search
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Search by name{currentUserRole === 'player' ? ' or school' : ''}
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
          disabled={!selectedId}
        >
          Start Conversation
        </Button>
      </ModalFooter>
    </Modal>
  );
}
