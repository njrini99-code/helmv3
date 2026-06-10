'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { SearchBar } from '@/components/ui/search-bar';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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

    // Escape SQL wildcards in user input to prevent unexpected matches
    const escapedQuery = query.replace(/%/g, '\\%').replace(/_/g, '\\_');

    try {

      if (currentUserRole === 'coach') {
        // Coach searching for players on THEIR team only
        // First get player IDs from golf_team_members
        const { data: teamMembers } = await supabase
          .from('golf_team_members')
          .select('player_id')
          .eq('team_id', teamId);

        const playerIds = teamMembers?.map(m => m.player_id) ?? [];

        if (playerIds.length === 0) {
          setResults([]);
          return;
        }

        let playerQuery = supabase
          .from('golf_players')
          .select('id, user_id, first_name, last_name, graduation_year, avatar_url')
          .in('id', playerIds);  // ENFORCED team filter via join table

        if (query.trim()) {
          playerQuery = playerQuery.or(`first_name.ilike.%${escapedQuery}%,last_name.ilike.%${escapedQuery}%`);
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
            subtitle: p.graduation_year ? `Class of ${p.graduation_year}` : 'Player',
            avatar: p.avatar_url,
            type: 'player' as const,
          }));

        setResults(playerResults);
      } else {
        // Player searching for coaches AND teammates on THEIR team
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        // First get the team's organization_id for coach lookup
        const { data: team } = await supabase
          .from('golf_teams')
          .select('organization_id')
          .eq('id', teamId)
          .single();

        let coachResults: SearchResult[] = [];

        if (team?.organization_id) {
          let coachQuery = supabase
            .from('golf_coaches')
            .select('id, user_id, full_name, title, avatar_url')
            .eq('organization_id', team.organization_id);

          if (query.trim()) {
            coachQuery = coachQuery.ilike('full_name', `%${escapedQuery}%`);
          }

          const { data: coaches } = await coachQuery.limit(10);

          coachResults = (coaches || [])
            .filter(c => c.user_id)
            .map(c => ({
              id: c.id,
              userId: c.user_id,
              name: c.full_name || 'Coach',
              subtitle: c.title || 'Golf Coach',
              avatar: c.avatar_url,
              type: 'coach' as const,
            }));
        }

        // Also search teammates (players on same team, excluding self)
        const { data: teamMembers } = await supabase
          .from('golf_team_members')
          .select('player_id')
          .eq('team_id', teamId);

        const playerIds = (teamMembers ?? []).map(m => m.player_id);
        let teammateResults: SearchResult[] = [];

        if (playerIds.length > 0) {
          let playerQuery = supabase
            .from('golf_players')
            .select('id, user_id, first_name, last_name, graduation_year, avatar_url')
            .in('id', playerIds);

          if (currentUser) {
            playerQuery = playerQuery.neq('user_id', currentUser.id);
          }

          if (query.trim()) {
            playerQuery = playerQuery.or(`first_name.ilike.%${escapedQuery}%,last_name.ilike.%${escapedQuery}%`);
          }

          const { data: teammates } = await playerQuery.limit(20);

          teammateResults = (teammates || [])
            .filter(p => p.user_id)
            .map(p => ({
              id: p.id,
              userId: p.user_id!,
              name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Teammate',
              subtitle: p.graduation_year ? `Class of ${p.graduation_year}` : 'Teammate',
              avatar: p.avatar_url,
              type: 'player' as const,
            }));
        }

        setResults([...coachResults, ...teammateResults]);
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

  const footer = (
    <div className="flex items-center justify-end gap-3">
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
    </div>
  );

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>New Message</DrawerTitle>
          <DrawerDescription>
            {currentUserRole === 'coach'
              ? 'Select a player to start a conversation'
              : 'Select a team member to start a conversation'}
          </DrawerDescription>
        </DrawerHeader>
      <div
        className="space-y-4 px-6 overflow-y-auto overscroll-contain"
      >
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
            placeholder={currentUserRole === 'coach' ? 'Search players...' : 'Search team members...'}
            className="w-full"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        )}

        {/* Results */}
        <div className="min-h-[300px] max-h-[400px] overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          ) : noTeamError ? null : results.length > 0 ? (
            <div className="divide-y divide-warm-100">
              {results.map(result => (
                <Button variant="primary"
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  className={cn(
                    'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors',
                    'hover:bg-warm-50 active:bg-warm-100 rounded-lg -mx-4',
                    selectedId === result.userId && 'bg-primary-50 hover:bg-primary-50 active:bg-primary-100'
                  )}
                >
                  <Avatar name={result.name} src={result.avatar} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-warm-900 truncate">{result.name}</p>
                    {result.subtitle && (
                      <p className="text-sm text-warm-500 truncate">{result.subtitle}</p>
                    )}
                  </div>
                  {selectedId === result.userId && (
                    <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center">
                      <IconCheck size={14} className="text-white" />
                    </div>
                  )}
                </Button>
              ))}
            </div>
          ) : (
            <EmptyState
              variant="compact"
              icon={<IconUsers size={28} />}
              title={searchQuery.trim()
                ? `No ${currentUserRole === 'coach' ? 'players' : 'team members'} found`
                : `No ${currentUserRole === 'coach' ? 'players' : 'team members'} on your team yet`}
              description={searchQuery.trim()
                ? 'Try a different name or clear your search.'
                : 'Once your team grows, you can start a conversation with anyone here.'}
            />
          )}
        </div>
      </div>

      <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
