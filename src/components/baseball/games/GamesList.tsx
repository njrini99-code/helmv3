'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { getBaseballStatsGameCreateHref } from '@/lib/baseball/stats-route-aliases';
import { GameCard } from './GameCard';
import { getTeamGames, getTeamSeasonRecord, deleteGame, type TeamSeasonRecord } from '@/app/baseball/actions/games';
import type { BaseballGame, BaseballGameType } from '@/lib/types';
import { IconPlus, IconRefresh } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/sonner';

interface GamesListProps {
  teamId: string;
  title?: string;
  showAddButton?: boolean;
  limit?: number;
  // Server-fetched initial data (from the parent Server Component). When
  // provided, a change to these props (e.g. a fresh RSC payload delivered by
  // router.refresh() after a box-score save) is synced into client state —
  // see the effect below. Without this, a revalidated payload with unchanged
  // teamId/activeTab/seasonYear/limit would never reach the client, leaving
  // the list showing stale pre-edit data until a hard reload.
  initialGames?: BaseballGame[];
  initialRecord?: TeamSeasonRecord | null;
  // Set by the parent Server Component when its server-side fetch failed
  // (as opposed to genuinely finding zero games) — lets the empty-vs-error
  // states stay distinguishable instead of a failed load rendering as an
  // ordinary "No games yet" empty season.
  initialError?: string | null;
  // Set when the season-record fetch (separate query from games) failed
  // server-side. Rendered as its own small notice near the record line —
  // NOT folded into `initialError`/the full-page "Couldn't load games"
  // banner, since the games list itself may have loaded fine.
  initialRecordError?: string | null;
}

type TabFilter = 'all' | 'game' | 'scrimmage';

const SEASON_YEARS = (() => {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2];
})();

export function GamesList({
  teamId,
  title = 'Games & Scrimmages',
  showAddButton = true,
  limit,
  initialGames,
  initialRecord,
  initialError,
  initialRecordError,
}: GamesListProps) {
  const { showToast } = useToast();
  const [games, setGames] = useState<BaseballGame[]>(initialGames ?? []);
  const [loading, setLoading] = useState(!initialGames);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(
    initialGames !== undefined ? (initialError ?? null) : null,
  );
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Season record is computed over the FULL season (all completed games) via a
  // dedicated selector — never over the possibly limit-truncated display list —
  // so this header matches the Games & Scrimmages page exactly on every surface.
  const [seasonRecord, setSeasonRecord] = useState<TeamSeasonRecord | null>(initialRecord ?? null);
  // Distinct from `error` (which drives the full-page "Couldn't load games"
  // state) — a failed record fetch should surface even when games loaded fine.
  const [recordError, setRecordError] = useState<string | null>(
    initialRecord !== undefined ? (initialRecordError ?? null) : null,
  );

  // Sync client state whenever the parent Server Component delivers a fresh
  // initialGames/initialRecord pair — this is what actually surfaces a
  // revalidated RSC payload (e.g. after a box-score save + router.refresh())
  // when teamId/activeTab/seasonYear/limit haven't changed and the
  // tab/filter fetchGames effect below wouldn't otherwise re-run.
  useEffect(() => {
    if (initialGames !== undefined) {
      setGames(initialGames);
      setLoading(false);
      setError(initialError ?? null);
    }
  }, [initialGames, initialError]);

  useEffect(() => {
    if (initialRecord !== undefined) {
      setSeasonRecord(initialRecord);
      setRecordError(initialRecordError ?? null);
    }
  }, [initialRecord, initialRecordError]);

  const fetchGames = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const gameType = activeTab === 'all' ? undefined : (activeTab as BaseballGameType);
      const [result, recordResult] = await Promise.all([
        getTeamGames(teamId, { gameType, seasonYear, limit }),
        getTeamSeasonRecord(teamId, seasonYear, gameType),
      ]);

      if (result.success) {
        setGames(result.data ?? []);
      } else {
        setError(result.error ?? 'Failed to load games');
      }
      if (recordResult.success) {
        setSeasonRecord(recordResult.data ?? null);
        setRecordError(null);
      } else {
        setSeasonRecord(null);
        setRecordError(recordResult.error ?? 'Failed to load season record');
      }
      setLoading(false);
      setRefreshing(false);
    },
    [teamId, activeTab, seasonYear, limit]
  );

  // Skip the very first client fetch when the parent Server Component
  // already seeded games/record — the sync effects above cover that case.
  // Without this, `fetchGames` (a fresh useCallback on first render) still
  // fires unconditionally on mount, reverting the seeded `loading: false`
  // and re-fetching the exact same data the server already fetched,
  // flashing the skeleton the seeding was meant to eliminate.
  const skippedInitialFetchRef = useRef(initialGames !== undefined);

  useEffect(() => {
    if (skippedInitialFetchRef.current) {
      skippedInitialFetchRef.current = false;
      return;
    }
    fetchGames();
  }, [fetchGames]);

  async function handleDelete(gameId: string) {
    if (!confirm('Delete this game and all its stats? This cannot be undone.')) return;
    setDeletingId(gameId);
    const result = await deleteGame(gameId);
    if (result.success) {
      setGames((prev) => prev.filter((g) => g.id !== gameId));
    } else {
      showToast(result.error ?? 'Failed to delete game', 'error');
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {title ? <h2 className="text-xl font-bold text-warm-900">{title}</h2> : null}
          {seasonRecord && seasonRecord.played > 0 && (
            <p className={`text-sm text-warm-500 ${title ? 'mt-0.5' : ''}`}>
              {seasonRecord.played} played · {seasonRecord.wins}W-{seasonRecord.losses}L
              {seasonRecord.ties > 0 ? `-${seasonRecord.ties}T` : ''}
            </p>
          )}
          {recordError && !seasonRecord && (
            <p className={`text-sm text-red-600/90 ${title ? 'mt-0.5' : ''}`}>
              Season record unavailable
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Season selector */}
          <Select
            options={SEASON_YEARS.map((y) => ({ value: String(y), label: String(y) }))}
            value={String(seasonYear)}
            onChange={(v) => setSeasonYear(Number(v))}
            className="w-28 text-sm"
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchGames(true)}
            disabled={refreshing}
            className="h-8 w-8 p-0"
            aria-label="Refresh games"
          >
            <IconRefresh size={16} className={refreshing ? 'animate-spin' : ''} />
          </Button>

          {showAddButton && (
            <Link
              href={getBaseballStatsGameCreateHref()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <IconPlus size={16} />
              Add Game
            </Link>
          )}
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-1 p-1 bg-warm-100 rounded-xl w-fit">
        {(['all', 'game', 'scrimmage'] as TabFilter[]).map((tab) => (
          <Button variant="ghost"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all capitalize ${
              activeTab === tab
                ? 'bg-cream-50 text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'scrimmage' ? 'Scrimmages' : 'Games'}
          </Button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="relative h-28 glass-standard rounded-2xl overflow-clip"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <p className="text-sm font-medium text-red-700 mb-1">Couldn&apos;t load games</p>
          <p className="text-sm text-red-600/90 mb-4">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => fetchGames()}>
            Try again
          </Button>
        </div>
      ) : games.length === 0 ? (
        <div className="glass-standard rounded-2xl p-10 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center text-primary-600/80 mx-auto mb-5">
            <IconPlus size={28} />
          </div>
          <h3 className="text-body-lg font-semibold text-warm-900 tracking-tight mb-2">No games yet</h3>
          <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto mb-6">
            Add your first game to start tracking box scores and season stats.
          </p>
          {showAddButton && (
            <Link
              href={getBaseballStatsGameCreateHref()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <IconPlus size={16} />
              Add First Game
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((game) => (
            <div key={game.id} className="relative group">
              <GameCard game={game} />
              {deletingId === game.id && (
                <div className="absolute inset-0 bg-cream-100/82 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <span className="text-sm text-warm-500">Deleting...</span>
                </div>
              )}
              {/* Delete action. Desktop (hover-capable pointers): hidden by
                  default and fully non-interactive (pointer-events-none)
                  until the row is hovered or the button receives keyboard
                  focus, so it can never intercept a click meant for
                  GameCard's content underneath. Touch (no hover — e.g.
                  iPad/phone in this Capacitor app): there is no hover to
                  reveal it, so it stays always visible in a muted style and
                  tappable — it must never be invisible-yet-interactive. */}
              <Button variant="danger"
                onClick={() => handleDelete(game.id)}
                disabled={deletingId === game.id}
                className="absolute top-3 right-3 text-xs text-warm-300 hover:text-red-500 transition-all opacity-60 pointer-events-auto [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
                aria-label="Delete game"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
