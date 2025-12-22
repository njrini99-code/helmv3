'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { PageLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { PlayerComparison } from '@/components/features/player-comparison';
import { IconSearch, IconPlus, IconX, IconTarget, IconUsers } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { getFullName } from '@/lib/utils';
import { useRecruitingRouteProtection } from '@/hooks/use-route-protection';
import type { Player } from '@/lib/types';

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAllowed, isLoading: routeLoading } = useRecruitingRouteProtection();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const supabase = createClient();

  // Get player IDs from URL
  const playerIds = searchParams.get('players')?.split(',').filter(Boolean) || [];

  useEffect(() => {
    async function fetchPlayers() {
      if (playerIds.length === 0) {
        setPlayers([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data } = await supabase
        .from('players')
        .select('*')
        .in('id', playerIds);

      setPlayers(data || []);
      setLoading(false);
    }

    fetchPlayers();
  }, [searchParams]);

  const MAX_PLAYERS = 4;
  const canAddMore = playerIds.length < MAX_PLAYERS;

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    if (!canAddMore) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    let queryBuilder = supabase
      .from('players')
      .select('*')
      .eq('recruiting_activated', true)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,high_school_name.ilike.%${query}%`)
      .limit(10);

    // Only add NOT IN filter if there are playerIds
    if (playerIds.length > 0) {
      queryBuilder = queryBuilder.not('id', 'in', `(${playerIds.join(',')})`);
    }

    const { data } = await queryBuilder;

    setSearchResults(data || []);
    setSearching(false);
  };

  const addPlayer = (player: Player) => {
    const newIds = [...playerIds, player.id];
    router.push(`/baseball/dashboard/compare?players=${newIds.join(',')}`);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removePlayer = (playerId: string) => {
    const newIds = playerIds.filter(id => id !== playerId);
    if (newIds.length > 0) {
      router.push(`/baseball/dashboard/compare?players=${newIds.join(',')}`);
    } else {
      router.push('/baseball/dashboard/compare');
    }
  };

  // Route protection - show loading while checking or redirecting
  if (routeLoading || !isAllowed) {
    return <PageLoading />;
  }

  if (loading && playerIds.length > 0) {
    return (
      <>
        <Header title="Compare Players" subtitle="Side-by-side player comparison" />
        <PageLoading />
      </>
    );
  }

  return (
    <>
      <Header
        title="Compare Players"
        subtitle={players.length > 0 ? `Comparing ${players.length} players` : 'Select players to compare'}
      />
      <div className="p-8 space-y-6">
        {/* Add Players Section */}
        <Card glass>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-slate-700">Add Players to Compare</h3>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    playerIds.length >= MAX_PLAYERS
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {playerIds.length} / {MAX_PLAYERS} players
                  </span>
                </div>
                <div className="relative">
                  <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder={canAddMore ? "Search players by name or school..." : "Maximum 4 players reached"}
                    className="pl-9"
                    disabled={!canAddMore}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                </div>
                {!canAddMore && (
                  <p className="text-xs text-amber-600 mt-2">
                    Remove a player to add another. Maximum of 4 players can be compared at once.
                  </p>
                )}

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {searchResults.map((player) => {
                      const name = getFullName(player.first_name, player.last_name);
                      return (
                        <button
                          key={player.id}
                          onClick={() => addPlayer(player)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
                        >
                          <Avatar name={name} src={player.avatar_url} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {player.primary_position} • {player.grad_year} • {player.high_school_name}
                            </p>
                          </div>
                          <IconPlus size={16} className="text-green-600" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {searching && (
                  <p className="text-sm leading-relaxed text-slate-500 mt-2">Searching...</p>
                )}
              </div>

              {/* Selected Players */}
              <div className="flex gap-2 flex-wrap">
                {players.map((player) => {
                  const name = getFullName(player.first_name, player.last_name);
                  return (
                    <div
                      key={player.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full"
                    >
                      <Avatar name={name} src={player.avatar_url} size="xs" />
                      <span className="text-sm font-medium text-slate-700">{name}</span>
                      <button
                        onClick={() => removePlayer(player.id)}
                        className="p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                        aria-label={`Remove ${name} from comparison`}
                      >
                        <IconX size={14} className="text-slate-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Comparison Table */}
        {players.length < 2 ? (
          <Card glass>
            <CardContent className="p-8 text-center">
              <div className="max-w-lg mx-auto">
                <IconTarget size={40} className="mx-auto mb-4 text-slate-400" />
                <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
                  {players.length === 0 ? 'No players selected' : 'Add one more player'}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600 mb-6">
                  {players.length === 0
                    ? 'Search and add at least 2 players above to start comparing them side by side.'
                    : 'Add at least one more player to start comparing.'}
                </p>
                {players.length === 0 && (
                  <Button onClick={() => router.push('/baseball/dashboard/discover')}>
                    <IconUsers size={18} className="mr-2" />
                    Browse Players
                  </Button>
                )}

                {/* Visual Preview - Empty Comparison Slots */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 opacity-40">
                  {[1, 2, 3, 4].map((slot) => (
                    <div key={slot} className="border-2 border-dashed border-slate-300 rounded-xl p-6">
                      <div className="w-16 h-16 rounded-full bg-slate-200 mx-auto mb-3" />
                      <div className="h-3 bg-slate-200 rounded mb-2" />
                      <div className="h-2 bg-slate-200 rounded w-2/3 mx-auto" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <PlayerComparison
            players={players}
            onRemovePlayer={removePlayer}
          />
        )}
      </div>
    </>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<><Header title="Compare Players" subtitle="Side-by-side player comparison" /><PageLoading /></>}>
      <CompareContent />
    </Suspense>
  );
}
