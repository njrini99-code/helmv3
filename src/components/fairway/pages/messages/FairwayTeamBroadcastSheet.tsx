'use client';

/**
 * ============================================================================
 * Fairway · Messages · FairwayTeamBroadcastSheet (P256)
 * ----------------------------------------------------------------------------
 * The Fairway-tokenized coach-only "New team message" broadcast composer. It
 * lives inside the FairwayMessages inbox, so it must read as the same finished
 * product — not the legacy GolfTeamBroadcastModal (bg-red-50 error box, bg-warm-50
 * preview, bg-white rounded-full chips, bg-primary-100 suggestion pills, a
 * w-1.5/bg-white skeleton-shimmer spinner, and a square `Drawer` in a non-fw
 * font under a .fairway-ds bg-canvas page).
 *
 * ── PRESERVE LOGIC (copied VERBATIM from GolfTeamBroadcastModal) ─────────────
 *   The two-step recipients→details flow, the all-players pre-select, the
 *   select-all toggle, the per-player toggle, the title-required guard, the
 *   getGolfTeamPlayersForBroadcast/createGolfTeamBroadcast server actions, and
 *   the onSuccess(conversationId) → onClose() contract are byte-for-byte the
 *   same. Only the presentation moves onto Fairway primitives:
 *     Sheet (overlays) · Input/FormField (forms) · Button/Avatar (controls) ·
 *     EmptyState/Skeleton/InlineNotice/fairwayToast (feedback) · fw tokens +
 *     Fraunces. Mirrors the sibling FairwayNewMessageSheet so the broadcast
 *     composer matches the inbox it lives in.
 * ========================================================================== */

import * as React from 'react';
import { Check, Users, Search, Mail } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Input } from '@/components/fairway/forms/Input';
import { FormField } from '@/components/fairway/forms/FormField';
import { Button } from '@/components/fairway/controls/button';
import { Avatar } from '@/components/fairway/controls/avatar';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import {
  getGolfTeamPlayersForBroadcast,
  createGolfTeamBroadcast,
} from '@/app/golf/actions/messages';

interface Player {
  id: string;
  userId: string;
  name: string;
  gradYear: number | null;
  avatarUrl: string | null;
}

export interface FairwayTeamBroadcastSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conversationId: string) => void;
  teamId: string;
}

const TITLE_SUGGESTIONS = ['Team Updates', 'Practice', 'Travel Info', 'Competition'];

export function FairwayTeamBroadcastSheet({
  isOpen,
  onClose,
  onSuccess,
  teamId,
}: FairwayTeamBroadcastSheetProps) {
  const [step, setStep] = React.useState<'recipients' | 'details'>('recipients');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [players, setPlayers] = React.useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [broadcastTitle, setBroadcastTitle] = React.useState('');

  // ── fetch players — VERBATIM logic from GolfTeamBroadcastModal ──────────────
  const fetchPlayers = React.useCallback(async () => {
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
      // Pre-select all players by default.
      setSelectedPlayerIds(new Set(result.players.map((p) => p.id)));
    }

    setLoading(false);
  }, [teamId]);

  React.useEffect(() => {
    if (isOpen) {
      void fetchPlayers();
    }
  }, [isOpen, fetchPlayers]);

  // Reset state when the sheet closes.
  React.useEffect(() => {
    if (!isOpen) {
      setStep('recipients');
      setSearchQuery('');
      setSelectedPlayerIds(new Set());
      setBroadcastTitle('');
      setError(null);
    }
  }, [isOpen]);

  const filteredPlayers = players.filter((player) =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const togglePlayer = (playerId: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPlayerIds.size === filteredPlayers.length) {
      setSelectedPlayerIds(new Set());
    } else {
      setSelectedPlayerIds(new Set(filteredPlayers.map((p) => p.id)));
    }
  };

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
      fairwayToast.success('Group created', {
        description: `"${broadcastTitle.trim()}" is ready for ${selectedPlayerIds.size} recipient${
          selectedPlayerIds.size === 1 ? '' : 's'
        }.`,
      });
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

  const allSelected =
    selectedPlayerIds.size === filteredPlayers.length && filteredPlayers.length > 0;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="right"
      title={step === 'recipients' ? 'New team message' : 'Group details'}
      description={
        step === 'recipients'
          ? 'Select players to include in this group conversation.'
          : 'Name your group conversation.'
      }
    >
      <Sheet.Body className="flex flex-col gap-4">
        {error ? (
          <InlineNotice tone="danger" title="Something needs your attention">
            {error}
          </InlineNotice>
        ) : null}

        {step === 'recipients' ? (
          <>
            {/* Search + select-all row */}
            <div className="flex items-center gap-3">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players…"
                leading={<Search aria-hidden />}
                aria-label="Search players"
                className="flex-1"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleSelectAll}
                className="whitespace-nowrap"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </Button>
            </div>

            {/* Selection summary */}
            <p className="flex items-center gap-2 font-fw-sans text-body-sm text-text-secondary">
              <Users className="h-4 w-4 text-text-tertiary" aria-hidden />
              {selectedPlayerIds.size} of {players.length} players selected
            </p>

            {/* Player list */}
            {loading ? (
              <div
                className="flex flex-col gap-2"
                role="status"
                aria-busy="true"
                aria-live="polite"
              >
                <span className="sr-only">Loading players…</span>
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
            ) : filteredPlayers.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {filteredPlayers.map((player) => {
                  const isSelected = selectedPlayerIds.has(player.id);
                  return (
                    <li key={player.id}>
                      {/* Intentional raw <button>: a multi-select recipient row
                          with a checkbox + avatar + stacked name/grad-year that
                          the <Button> primitive can't express. The full
                          interactive-state contract (hover/focus-visible) is
                          inline. */}
                      {/* eslint-disable-next-line helm/no-raw-button */}
                      <button
                        type="button"
                        onClick={() => togglePlayer(player.id)}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-fw-md px-3 py-2.5 text-left',
                          'transition-colors [transition-duration:var(--fw-dur-fast)]',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                          isSelected
                            ? 'bg-accent-50 ring-1 ring-inset ring-accent-200'
                            : 'hover:bg-surface-sunken',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'grid h-5 w-5 shrink-0 place-items-center rounded-fw-sm border-2',
                            'transition-colors [transition-duration:var(--fw-dur-fast)]',
                            isSelected
                              ? 'border-accent-600 bg-accent-600 text-text-on-accent'
                              : 'border-border-strong',
                          )}
                        >
                          {isSelected ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <Avatar name={player.name} src={player.avatarUrl} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
                            {player.name}
                          </span>
                          {player.gradYear ? (
                            <span className="block truncate font-fw-sans text-caption text-text-tertiary">
                              Class of {player.gradYear}
                            </span>
                          ) : null}
                        </span>
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
                    ? 'No players match your search'
                    : 'No players on your team yet'
                }
                description={
                  searchQuery.trim()
                    ? 'Try a different name or clear your search.'
                    : 'Invite players to your roster to broadcast updates.'
                }
              />
            )}
          </>
        ) : (
          <>
            {/* Group name */}
            <FormField
              label="Group name"
              help="Choose a name that describes the purpose of this group."
            >
              <Input
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="e.g., Team Updates, Practice Reminders"
                enterKeyHint="done"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </FormField>

            {/* Selected recipients preview */}
            <div className="rounded-fw-md bg-surface-sunken p-4">
              <p className="mb-3 flex items-center gap-2 font-fw-sans text-body-sm font-medium text-text-secondary">
                <Users className="h-4 w-4 text-text-tertiary" aria-hidden />
                {selectedPlayerIds.size} recipient{selectedPlayerIds.size === 1 ? '' : 's'}
              </p>
              <div className="flex flex-wrap gap-2">
                {players
                  .filter((p) => selectedPlayerIds.has(p.id))
                  .slice(0, 8)
                  .map((player) => (
                    <span
                      key={player.id}
                      className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface px-2.5 py-1.5"
                    >
                      <Avatar name={player.name} src={player.avatarUrl} size="xs" />
                      <span className="font-fw-sans text-caption font-medium text-text-secondary">
                        {player.name.split(' ')[0]}
                      </span>
                    </span>
                  ))}
                {selectedPlayerIds.size > 8 ? (
                  <span className="flex items-center rounded-full bg-surface-sunken px-2.5 py-1.5">
                    <span className="font-fw-sans text-caption font-medium text-text-tertiary">
                      +{selectedPlayerIds.size - 8} more
                    </span>
                  </span>
                ) : null}
              </div>
            </div>

            {/* Quick title suggestions */}
            <div>
              <p className="mb-2 font-fw-sans text-caption font-medium text-text-tertiary">
                Quick suggestions
              </p>
              <div className="flex flex-wrap gap-2">
                {TITLE_SUGGESTIONS.map((suggestion) => {
                  const isActive = broadcastTitle === suggestion;
                  return (
                    <Button
                      key={suggestion}
                      variant={isActive ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setBroadcastTitle(suggestion)}
                      className="rounded-full"
                      aria-pressed={isActive}
                    >
                      {suggestion}
                    </Button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </Sheet.Body>

      <Sheet.Footer>
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
            <Button variant="secondary" onClick={handleBack} disabled={creating}>
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!broadcastTitle.trim() || creating}
              busy={creating}
              leftIcon={<Mail className="h-4 w-4" aria-hidden />}
            >
              {creating ? 'Creating…' : 'Create group'}
            </Button>
          </>
        )}
      </Sheet.Footer>
    </Sheet>
  );
}

export default FairwayTeamBroadcastSheet;
