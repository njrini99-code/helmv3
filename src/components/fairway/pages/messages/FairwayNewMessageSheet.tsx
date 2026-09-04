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
 *   with no guard. Here, `handleStartConversation` AWAITS `onCreateConversation`
 *   behind a `creating` pending guard (blocking double-click double-submit)
 *   and only calls `onClose()` once it resolves. Only the presentation moves
 *   onto Fairway primitives:
 *     Sheet (overlays) · SearchField/TextArea (forms) · Button/Avatar/Chip (controls) ·
 *     EmptyState/Skeleton/InlineNotice (feedback) · fw tokens + Fraunces.
 * ========================================================================== */

import { describeError } from '@/lib/utils/describe-error';
import * as React from 'react';
import { Check, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { escapeLikePattern } from '@/lib/utils/escape-like';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { SearchField } from '@/components/fairway/command/search-field';
import { TextArea } from '@/components/fairway/forms';
import { FormField } from '@/components/fairway/forms/FormField';
import { Button } from '@/components/fairway/controls/button';
import { Chip } from '@/components/fairway/controls/badge';
import { PressTarget } from '@/components/fairway/controls/press-target';
import { SelectablePill } from '@/components/fairway/controls/selectable-pill';
import { Avatar } from '@/components/fairway/controls/avatar';
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

export interface SelectedRecipient {
  userId: string;
  name: string;
  avatar: string | null;
}

// P158: a role label (a job title like "Head Coach") is not a name. Some
// coach records were seeded with the title copied into `full_name` (a
// data/labeling collision upstream), which then rendered as this row's NAME
// line — identical to the real title-holder's subtitle line one row over, so
// the list appeared to have two "Head Coach" entries. Detect the collision
// and fall back to an honest, clearly-generic label instead of parroting a
// role string back as if it were a person's name.
export const ROLE_LABEL_PATTERN = /^(head|assistant|associate|interim|volunteer)?\s*coach$/i;

export function resolveCoachName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed || ROLE_LABEL_PATTERN.test(trimmed)) return 'Coaching staff';
  return trimmed;
}

export function canCreateConversation(
  mode: 'direct' | 'group',
  selectedUserIds: string[],
  title: string,
) {
  return mode === 'direct'
    ? selectedUserIds.length === 1
    : selectedUserIds.length >= 2 && title.trim().length > 0;
}

export function updateSelectedRecipients(
  mode: 'direct' | 'group',
  previous: ReadonlyMap<string, SelectedRecipient>,
  recipient: SelectedRecipient,
) {
  if (mode === 'direct') return new Map([[recipient.userId, recipient]]);

  const next = new Map(previous);
  if (next.has(recipient.userId)) {
    next.delete(recipient.userId);
  } else {
    next.set(recipient.userId, recipient);
  }
  return next;
}

export interface SelectedRecipientStripProps {
  recipients: ReadonlyMap<string, SelectedRecipient>;
  onRemove: (userId: string) => void;
}

export function SelectedRecipientStrip({ recipients, onRemove }: SelectedRecipientStripProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Selected recipients">
      {Array.from(recipients.values()).map((recipient) => (
        <Chip
          key={recipient.userId}
          size="sm"
          tone="accent"
          leadingIcon={<Avatar decorative name={recipient.name} src={recipient.avatar} size="xs" />}
          onRemove={() => onRemove(recipient.userId)}
          removeLabel={`Remove ${recipient.name}`}
        >
          {recipient.name}
        </Chip>
      ))}
    </div>
  );
}

export interface FairwayNewMessageSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateConversation: (participantUserIds: string[], title?: string) => Promise<void>;
  currentUserRole: 'coach' | 'player';
  /** CRITICAL: must be passed and valid for the search to run. */
  teamId?: string;
}

export function FairwayNewMessageSheet({
  isOpen,
  onClose,
  onCreateConversation,
  currentUserRole,
  teamId,
}: FairwayNewMessageSheetProps) {
  // Desktop-only autofocus: on touch, focusing search as the sheet opens
  // summons the iOS keyboard over the recipient list the user is about to
  // tap (owner TestFlight report, 2026-08-26). Type-ahead stays on desktop.
  const finePointer = useMediaQuery('(pointer: fine)');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<'direct' | 'group'>('direct');
  // Search results are intentionally ephemeral. This map is the source of
  // truth for selected recipients, so choosing someone from a later search
  // cannot make an earlier avatar disappear from the reviewable group strip.
  const [selectedRecipients, setSelectedRecipients] = React.useState<Map<string, SelectedRecipient>>(new Map());
  const [groupTitle, setGroupTitle] = React.useState('');
  const [noTeamError, setNoTeamError] = React.useState(false);
  // A failed lookup is not "nobody matches". Without this the sheet renders its
  // ordinary empty state, so a coach searching their own full roster is told
  // there is nobody to message — and stops looking.
  const [searchFailed, setSearchFailed] = React.useState(false);
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

      // Escape SQL wildcards AND the escape character itself. Escaping only
      // `%`/`_` left a user-typed backslash in the pattern, where it re-armed
      // the very wildcard it was meant to neutralise (CodeQL
      // js/incomplete-sanitization).
      const escapedQuery = escapeLikePattern(query);
      setSearchFailed(false);

      try {
        if (currentUserRole === 'coach') {
          // Coach searching for players on THEIR team only.
          const { data: teamMembers, error: membersError } = await supabase
            .from('golf_team_members')
            .select('player_id')
            .eq('team_id', teamId);

          if (membersError) {
            console.warn('[new message] roster read failed:', membersError.message);
            setSearchFailed(true);
            setResults([]);
            return;
          }

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

          const { data: team, error: teamError } = await supabase
            .from('golf_teams')
            .select('organization_id')
            .eq('id', teamId)
            .single();

          // Without the org id no coach can be found, so the player is shown a
          // list with no coaches on it — indistinguishable from a team that has
          // none.
          if (teamError) {
            console.warn('[new message] team read failed:', teamError.message);
            setSearchFailed(true);
          }

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
                name: resolveCoachName(c.full_name),
                subtitle: c.title || 'Golf Coach',
                avatar: c.avatar_url,
                type: 'coach' as const,
              }));
          }

          const { data: teamMembers, error: teammatesError } = await supabase
            .from('golf_team_members')
            .select('player_id')
            .eq('team_id', teamId);

          if (teammatesError) {
            console.warn('[new message] teammate read failed:', teammatesError.message);
            setSearchFailed(true);
          }

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

          // Dedupe by userId — belt-and-suspenders against the same person
          // (e.g. a coach who is also a team member) appearing in both lists.
          const combined = [...coachResults, ...teammateResults];
          const seen = new Set<string>();
          const deduped = combined.filter((r) => {
            if (seen.has(r.userId)) return false;
            seen.add(r.userId);
            return true;
          });

          setResults(deduped);
        }
      } catch (error) {
        console.warn('[new message] recipient search failed:', describeError(error));
        setSearchFailed(true);
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
      setMode('direct');
      setSelectedRecipients(new Map());
      setGroupTitle('');
      setNoTeamError(false);
      setCreating(false);
    }
  }, [isOpen]);

  const selectMode = (nextMode: 'direct' | 'group') => {
    setMode(nextMode);
    if (nextMode === 'direct') {
      setSelectedRecipients((previous) => {
        const first = previous.values().next().value;
        return first ? new Map([[first.userId, first]]) : new Map();
      });
    }
  };

  const toggleRecipient = (result: SearchResult) => {
    setSelectedRecipients((previous) =>
      updateSelectedRecipients(mode, previous, {
        userId: result.userId,
        name: result.name,
        avatar: result.avatar,
      }),
    );
  };

  const handleStartConversation = async () => {
    // Guards against double-click double-submit; server dedupe is intentionally not attempted here (client-only fix).
    const participantUserIds = Array.from(selectedRecipients.keys());
    if (creating || !canCreateConversation(mode, participantUserIds, groupTitle)) return;

    setCreating(true);
    try {
      await onCreateConversation(
        participantUserIds,
        mode === 'group' ? groupTitle.trim() : undefined,
      );
      onClose();
    } catch {
      // The parent owns action-specific error messaging. Keep this sheet open
      // so the selected recipients and group title are not lost on a retry.
    } finally {
      setCreating(false);
    }
  };

  const noun = currentUserRole === 'coach' ? 'player' : 'team member';

  // Doctrine rule 4: every input/create flow under `md` is a bottom sheet —
  // never the desktop "docked" side="right" panel (which was rendering
  // centered/clipped on phone: the SIDE_CLASS right-panel math is tuned for
  // wide desktop viewports and collapses badly on a ~390px phone width).
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side={isDesktop ? 'right' : 'bottom'}
      // Search auto-focuses on open (below), so the keyboard shows
      // immediately — open straight to full height instead of the 50% peek
      // detent so the search field + results stay usable with the keyboard up.
      peek={false}
      title={mode === 'group' ? 'New group' : 'New message'}
      description={
        mode === 'group'
          ? 'Choose teammates and a name for this private group.'
          : currentUserRole === 'coach'
            ? 'Select a player to start a conversation.'
            : 'Select a team member to start a conversation.'
      }
    >
      {/* min-h-0 flex-1 (call-site override of Sheet.Body's base flex-auto):
          without an explicit bound here, the nested results pane's own
          min-h-0 flex-1 below has nothing definite to shrink against, and
          silently falls back to natural/unbounded height instead of
          scrolling — see the Results comment below. */}
      <Sheet.Body className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex gap-2" aria-label="Conversation type">
          <SelectablePill
            shape="round"
            selected={mode === 'direct'}
            onClick={() => selectMode('direct')}
          >
            Direct
          </SelectablePill>
          <SelectablePill
            shape="round"
            selected={mode === 'group'}
            onClick={() => selectMode('group')}
          >
            Group
          </SelectablePill>
        </div>

        {mode === 'group' ? (
          <div className="rounded-fw-md bg-surface-sunken p-3">
            <p className="mb-2 font-fw-sans text-caption font-medium text-text-secondary">
              {selectedRecipients.size} selected
            </p>
            {selectedRecipients.size > 0 ? (
              <SelectedRecipientStrip
                recipients={selectedRecipients}
                onRemove={(userId) => {
                  setSelectedRecipients((previous) => {
                    const next = new Map(previous);
                    next.delete(userId);
                    return next;
                  });
                }}
              />
            ) : (
              <p className="font-fw-sans text-caption text-text-tertiary">Select at least two teammates.</p>
            )}
          </div>
        ) : null}

        {mode === 'group' ? (
          <FormField label="Group name" required>
            <TextArea
              value={groupTitle}
              onChange={(event) => setGroupTitle(event.target.value)}
              placeholder="e.g., Practice plans"
              aria-label="Group name"
              rows={1}
            />
          </FormField>
        ) : null}

        {noTeamError ? (
          <InlineNotice tone="warning" title="No team found">
            You need to be assigned to a team before you can message team members.
          </InlineNotice>
        ) : (
          <SearchField
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onClear={() => setSearchQuery('')}
            placeholder={currentUserRole === 'coach' ? 'Search players…' : 'Search team members…'}
            aria-label={`Search ${noun}s`}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={finePointer}
          />
        )}

        {/* Results — the sheet's ONLY scrolling region. Bounded via
            `min-h-0 flex-1` against the Sheet.Body flex column above (the
            search input keeps its natural height and stays pinned instead
            of scrolling away with the list) so an 8+ player roster reaches
            every row on a 390px phone instead of clipping to ~1.5 rows with
            no way to reach the rest. `overscroll-contain` stops list-end
            scroll from chaining into the vaul drag-to-dismiss gesture;
            `touch-pan-y` keeps iOS from routing the vertical touch-move
            into that same drag instead of native list scroll — same idiom
            as the scroll pane in MessageThreadPane.tsx. (This route,
            /dashboard/messages, is on SmoothScrollMount's Lenis
            exclusion list, and Lenis's own `prevent` check already skips
            any overflow-auto/-scroll node regardless — so no
            data-lenis-prevent needed here.) */}
        {noTeamError ? null : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
            {loading ? (
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
                  const isSelected = selectedRecipients.has(result.userId);
                  return (
                    <li key={result.id}>
                      <PressTarget
                        onClick={() => toggleRecipient(result)}
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
                      </PressTarget>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                variant="subtle"
                icon={Users}
                title={
                  // A failed lookup renders here too, and the ordinary copy is
                  // a claim about the team: "No players on your team yet" to a
                  // coach whose roster is full, or "No players found" for a
                  // name that is right there. Both read as an answer, and
                  // neither suggests trying again.
                  searchFailed
                    ? `Couldn't load ${noun}s`
                    : searchQuery.trim()
                      ? `No ${noun}s found`
                      : `No ${noun}s on your team yet`
                }
                description={
                  searchFailed
                    ? 'Something went wrong looking that up. Please try again.'
                    : searchQuery.trim()
                      ? 'Try a different name or clear your search.'
                      : 'Once your team grows, you can start a conversation with anyone here.'
                }
              />
            )}
          </div>
        )}
      </Sheet.Body>

      <Sheet.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleStartConversation}
          disabled={
            !canCreateConversation(mode, Array.from(selectedRecipients.keys()), groupTitle) ||
            noTeamError ||
            creating
          }
          busy={creating}
        >
          {mode === 'group' ? 'Create group' : 'Start message'}
        </Button>
      </Sheet.Footer>
    </Sheet>
  );
}
