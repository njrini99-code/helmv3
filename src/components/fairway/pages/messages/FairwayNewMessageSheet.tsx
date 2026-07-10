'use client';

/**
 * ============================================================================
 * Fairway · Messages · FairwayNewMessageSheet (P255)
 * ----------------------------------------------------------------------------
 * The Fairway-tokenized "New message" recipient picker. It is the front door to
 * the whole messaging feature, so it must read as one finished product — not a
 * redesigned shell (FairwayMessages) wrapping the legacy GolfNewMessageModal
 * (which used amber/warm/primary legacy colors + a square Drawer in a non-fw
 * font under a .fairway-ds bg-canvas page).
 *
 * ── PRESERVE LOGIC (copied VERBATIM from GolfNewMessageModal) ────────────────
 *   The recipient search (coach → players on their team; player → coaches +
 *   teammates), the `teamId`-required guard, and the SQL-wildcard escaping are
 *   byte-for-byte the same. The onSelect → onClose contract is NOT identical:
 *   GolfNewMessageModal fires `onSelect(selectedId); onClose();` synchronously
 *   with no guard. Here, `handleStartConversation` AWAITS `onSelect(selectedId)`
 *   behind a `creating` pending guard (blocking double-click double-submit)
 *   and only calls `onClose()` once it resolves. Only the presentation moves
 *   onto Fairway primitives:
 *     Sheet (overlays) · Input (forms) · Button/Avatar/Chip (controls) ·
 *     EmptyState/Skeleton/InlineNotice (feedback) · fw tokens + Fraunces.
 * ========================================================================== */

import * as React from 'react';
import { Check, Users, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Input } from '@/components/fairway/forms/Input';
import { Button } from '@/components/fairway/controls/button';
import { PlayerIdentity } from '@/components/fairway/controls/PlayerIdentity';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

interface SearchResult {
  id: string;
  userId: string;
  name: string;
  subtitle: string;
  avatar: string | null;
  type: 'coach' | 'player';
}

export interface FairwayNewMessageSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (userId: string) => void;
  currentUserRole: 'coach' | 'player';
  /** CRITICAL: must be passed and valid for the search to run. */
  teamId?: string;
}

export function FairwayNewMessageSheet({
  isOpen,
  onClose,
  onSelect,
  currentUserRole,
  teamId,
}: FairwayNewMessageSheetProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [noTeamError, setNoTeamError] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // ── recipient search — VERBATIM logic from GolfNewMessageModal ──────────────
  const searchUsers = React.useCallback(
    async (query: string) => {
      // Do not search without a valid teamId.
      if (!teamId) {
        setNoTeamError(true);
        setResults([]);
        return;
      }

      setNoTeamError(false);
      setLoading(true);
      const supabase = createClient();

      // Escape SQL wildcards in user input to prevent unexpected matches.
      const escapedQuery = query.replace(/%/g, '\\%').replace(/_/g, '\\_');

      try {
        if (currentUserRole === 'coach') {
          // Coach searching for players on THEIR team only.
          const { data: teamMembers } = await supabase
            .from('golf_team_members')
            .select('player_id')
            .eq('team_id', teamId);

          const playerIds = teamMembers?.map((m) => m.player_id) ?? [];

          if (playerIds.length === 0) {
            setResults([]);
            return;
          }

          let playerQuery = supabase
            .from('golf_players')
            .select('id, user_id, first_name, last_name, graduation_year, avatar_url')
            .in('id', playerIds);

          if (query.trim()) {
            playerQuery = playerQuery.or(
              `first_name.ilike.%${escapedQuery}%,last_name.ilike.%${escapedQuery}%`,
            );
          }

          const { data: players, error } = await playerQuery.limit(20);

          if (error) {
            setResults([]);
            return;
          }

          const playerResults: SearchResult[] = (players || [])
            .filter((p) => p.user_id)
            .map((p) => ({
              id: p.id,
              userId: p.user_id!,
              name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown Player',
              subtitle: p.graduation_year ? `Class of ${p.graduation_year}` : 'Player',
              avatar: p.avatar_url,
              type: 'player' as const,
            }));

          setResults(playerResults);
        } else {
          // Player searching for coaches AND teammates on THEIR team.
          const {
            data: { user: currentUser },
          } = await supabase.auth.getUser();

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
              .filter((c) => c.user_id)
              .map((c) => ({
                id: c.id,
                userId: c.user_id,
                name: c.full_name || 'Coach',
                subtitle: c.title || 'Golf Coach',
                avatar: c.avatar_url,
                type: 'coach' as const,
              }));
          }

          const { data: teamMembers } = await supabase
            .from('golf_team_members')
            .select('player_id')
            .eq('team_id', teamId);

          const playerIds = (teamMembers ?? []).map((m) => m.player_id);
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
              playerQuery = playerQuery.or(
                `first_name.ilike.%${escapedQuery}%,last_name.ilike.%${escapedQuery}%`,
              );
            }

            const { data: teammates } = await playerQuery.limit(20);

            teammateResults = (teammates || [])
              .filter((p) => p.user_id)
              .map((p) => ({
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
    },
    [currentUserRole, teamId],
  );

  // Initial load + live search.
  React.useEffect(() => {
    if (isOpen) {
      void searchUsers(searchQuery);
    }
  }, [isOpen, searchQuery, searchUsers]);

  // Reset state when the sheet closes.
  React.useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setResults([]);
      setSelectedId(null);
      setNoTeamError(false);
      setCreating(false);
    }
  }, [isOpen]);

  const handleStartConversation = async () => {
    // Guards against double-click double-submit; server dedupe is intentionally not attempted here (client-only fix).
    if (creating || !selectedId) return;

    setCreating(true);
    try {
      await onSelect(selectedId);
    } finally {
      setCreating(false);
    }
    onClose();
  };

  const noun = currentUserRole === 'coach' ? 'player' : 'team member';

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="right"
      title="New message"
      description={
        currentUserRole === 'coach'
          ? 'Select a player to start a conversation.'
          : 'Select a team member to start a conversation.'
      }
    >
      <Sheet.Body className="flex flex-col gap-4">
        {noTeamError ? (
          <InlineNotice tone="warning" title="No team found">
            You need to be assigned to a team before you can message team members.
          </InlineNotice>
        ) : (
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={currentUserRole === 'coach' ? 'Search players…' : 'Search team members…'}
            leading={<Search aria-hidden />}
            aria-label={`Search ${noun}s`}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        )}

        {/* Results */}
        {noTeamError ? null : loading ? (
          <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading…</span>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-fw-md px-3 py-2.5">
                <Skeleton circle className="h-10 w-10" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {results.map((result) => {
              const isSelected = selectedId === result.userId;
              return (
                <li key={result.id}>
                  {/* Intentional raw <button>: a single-select recipient row
                      with an avatar + stacked name/subtitle + selected check that
                      the <Button> primitive can't express. The full interactive
                      -state contract (hover/focus-visible, §7.1) is inline. */}
                  {/* eslint-disable-next-line helm/no-raw-button */}
                  <button
                    type="button"
                    onClick={() => setSelectedId(result.userId)}
                    aria-pressed={isSelected}
                    className={cn(
                      'block w-full rounded-fw-md px-3 py-2.5 text-left',
                      'transition-colors [transition-duration:var(--fw-dur-fast)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                      isSelected
                        ? 'bg-accent-50 ring-1 ring-inset ring-accent-200'
                        : 'hover:bg-surface-sunken',
                    )}
                  >
                    {/* Shared identity (avatar + name + subtitle); the selection
                        check is this surface's trailing affordance. The button
                        wrapper keeps the transparent-rest / tinted-hover-selected
                        contract intact. */}
                    <PlayerIdentity
                      name={result.name}
                      avatarUrl={result.avatar}
                      size="md"
                      meta={result.subtitle || undefined}
                      trailing={
                        isSelected ? (
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-600 text-text-on-accent">
                            <Check className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        ) : undefined
                      }
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            variant="subtle"
            icon={Users}
            title={
              searchQuery.trim()
                ? `No ${noun}s found`
                : `No ${noun}s on your team yet`
            }
            description={
              searchQuery.trim()
                ? 'Try a different name or clear your search.'
                : 'Once your team grows, you can start a conversation with anyone here.'
            }
          />
        )}
      </Sheet.Body>

      <Sheet.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleStartConversation}
          disabled={!selectedId || noTeamError || creating}
          busy={creating}
        >
          Start conversation
        </Button>
      </Sheet.Footer>
    </Sheet>
  );
}

export default FairwayNewMessageSheet;
