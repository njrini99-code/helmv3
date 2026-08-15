'use client';

/**
 * ============================================================================
 * Fairway · pages/announcements · FairwayAnnouncements  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the SHARED coach+player /golf/dashboard/announcements
 * route — the team's "what's new" feed. A presentation rebuild on the warm-matte
 * Fairway design system; the data is reused VERBATIM. The page fetches the SAME
 * `getAnnouncementsWithMeta` list (+ roster + documents for coaches) above its
 * fork and passes it straight in. NO data fetch / server action / mutation is
 * defined or altered here.
 *
 * ── ROLE FORK ───────────────────────────────────────────────────────────────
 *   • Coach  — a feed of expandable coach cards + the create-announcement Sheet
 *     (the ONE primary action in the masthead). Per-card delete + the full
 *     ack/task/recipient detail.
 *   • Player — the player's filtered feed (unread-first), each card with the
 *     acknowledge action + their own interactive tasks. No create / delete.
 *
 * ── HONESTY ──────────────────────────────────────────────────────────────────
 *   Empty feed → EmptyState (role-aware copy). Missing player profile →
 *   InlineNotice. Counts are real (`recentCount` / `announcements.length`) and
 *   only rendered when > 0 — never a fabricated "0".
 *
 * Tokens ONLY. No glass / backdrop-blur / warm-* legacy classes. fairwayToast
 * for feedback (never legacy useToast). Renders inside the `.fairway-ds` scope.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { Bell, AlertTriangle, CheckSquare, ClipboardList, CalendarClock } from 'lucide-react';
import {
  ViewHeader,
  Surface,
  EmptyState,
  InlineNotice,
  Toolbar,
  SearchField,
  FilterPill,
  Button,
} from '@/components/fairway';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { FairwayCoachAnnouncementCard } from './FairwayCoachAnnouncementCard';
import {
  FairwayPlayerAnnouncementCard,
  isUnreadForPlayer,
} from './FairwayPlayerAnnouncementCard';
import { FairwayCreateAnnouncement } from './FairwayCreateAnnouncement';

/* ─── Filter model (shared by both feeds) ─────────────────────────────────────
 * A growing feed must be searchable / filterable to stay usable (P276). The
 * view tab + filter pills + search box all narrow the SAME server list; no data
 * is fetched or mutated here. */
export type FeedView = 'all' | 'unread' | 'action';
const HIGH_URGENCY = new Set(['high', 'urgent']);
const WEEK_MS = 7 * 86400000;

/** Recent = posted within the last 7 days. Time-independent at SSR (nowTs=0 →
 * false), refined after mount; only used by the optional "This week" pill, never
 * by the stable sort, so it can't cause a first-paint reshuffle (P282). */
export function isRecent(ann: GolfAnnouncementMeta, nowTs: number): boolean {
  return nowTs > 0 && !!ann.published_at && nowTs - new Date(ann.published_at).getTime() < WEEK_MS;
}

/** Action-needed = the viewer is asked to acknowledge and hasn't yet. This is
 * ack-state only (time-independent), so it's stable across reloads. */
export function needsAck(ann: GolfAnnouncementMeta): boolean {
  return !!ann.requires_acknowledgement && !ann.has_player_acknowledged;
}

export interface AnnouncementFilterState {
  query: string;
  view: FeedView;
  highOnly: boolean;
  tasksOnly: boolean;
  weekOnly: boolean;
}

/** Pure, deterministic search/filter over the server list (P276). No fetch, no
 * mutation — just narrows the SAME announcements. Exported for unit tests. */
export function filterAnnouncements(
  announcements: GolfAnnouncementMeta[],
  state: AnnouncementFilterState,
  nowTs: number,
): GolfAnnouncementMeta[] {
  const q = state.query.trim().toLowerCase();
  return announcements.filter((ann) => {
    if (q) {
      const haystack = `${ann.title ?? ''} ${ann.body ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (state.highOnly && !HIGH_URGENCY.has((ann.urgency ?? 'normal').toLowerCase())) return false;
    if (state.tasksOnly && !(ann.task_count > 0)) return false;
    if (state.weekOnly && !isRecent(ann, nowTs)) return false;
    if (state.view === 'action' && !needsAck(ann)) return false;
    if (state.view === 'unread' && !isUnreadForPlayer(ann, nowTs)) return false;
    return true;
  });
}

/** Pure, STABLE unread-first ordering for the player feed (P282). Primary key is
 * ack-needed (time-independent → identical at SSR and post-mount); the time-based
 * recency is only a secondary tiebreaker among non-ack items. Given a server list
 * that arrives date-descending, this produces NO post-hydration reshuffle.
 * Exported for unit tests. */
export function sortPlayerFeed(
  announcements: GolfAnnouncementMeta[],
  nowTs: number,
): GolfAnnouncementMeta[] {
  return [...announcements].sort((a, b) => {
    const aAck = needsAck(a);
    const bAck = needsAck(b);
    if (aAck !== bAck) return aAck ? -1 : 1;
    const aTime = !aAck && isUnreadForPlayer(a, nowTs);
    const bTime = !bAck && isUnreadForPlayer(b, nowTs);
    if (aTime !== bTime) return aTime ? -1 : 1;
    return 0; // preserve server order (already date-sorted)
  });
}

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface DocumentLite {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
}

export interface FairwayAnnouncementsProps {
  /** The team's announcements with meta (legacy getAnnouncementsWithMeta verbatim). */
  announcements: GolfAnnouncementMeta[];
  /** Active roster — coach create-flow targeting. */
  players: Player[];
  /** Team documents — coach create-flow attachments. */
  documents: DocumentLite[];
  /** Whether the viewer is a coach (gates create/delete + copy). */
  isCoach: boolean;
  /** The player's id (player view only). Null when missing → honest notice. */
  playerId: string | null;
  /** Count posted within the last 7 days (computed in the route, verbatim). */
  recentCount: number;
}

export function FairwayAnnouncements({
  announcements,
  players,
  documents,
  isCoach,
  playerId,
  recentCount,
}: FairwayAnnouncementsProps) {
  const total = announcements.length;

  // Defer time-dependent state to the client (avoid hydration mismatch). nowTs=0
  // on first paint → time-based predicates read false, then refine after mount.
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => setNowTs(Date.now()), []);

  // ── Triage state (P276) — narrows the SAME server list, never refetches. ────
  const [query, setQuery] = useState('');
  const [view, setView] = useState<FeedView>('all');
  const [highOnly, setHighOnly] = useState(false);
  const [tasksOnly, setTasksOnly] = useState(false);
  const [weekOnly, setWeekOnly] = useState(false);

  const anyFilterActive =
    view !== 'all' || highOnly || tasksOnly || weekOnly || query.trim() !== '';

  const filtered = useMemo(
    () => filterAnnouncements(announcements, { query, view, highOnly, tasksOnly, weekOnly }, nowTs),
    [announcements, query, view, highOnly, tasksOnly, weekOnly, nowTs],
  );

  // Honest tab counts — straight from the array (ack/action are time-independent;
  // "unread" includes the time-based component once mounted).
  const actionCount = useMemo(() => announcements.filter(needsAck).length, [announcements]);
  const unreadCount = useMemo(
    () => announcements.filter((a) => isUnreadForPlayer(a, nowTs)).length,
    [announcements, nowTs],
  );

  function clearFilters() {
    setQuery('');
    setView('all');
    setHighOnly(false);
    setTasksOnly(false);
    setWeekOnly(false);
  }

  // ── Masthead description — static purpose copy (DESIGN-SYSTEM convention:
  // `description` explains what the page IS; `meta` below carries the live
  // counts. Documents/Qualifiers/Roster all follow this split — Announcements
  // previously duplicated the count in both slots ("5 posted." directly above
  // a "5 total" chip). ─────────────────────────────────────────────────────
  const description = isCoach
    ? 'Share schedule changes, news, and important updates with your team.'
    : 'The latest from the coaching staff.';

  // Honest count chips — only when there's something real to show.
  const meta =
    total > 0 ? (
      <>
        {recentCount > 0 && <span className="tabular-nums">{recentCount} this week</span>}
        {recentCount > 0 && <span aria-hidden="true">·</span>}
        <span className="tabular-nums">
          {total} total
        </span>
      </>
    ) : undefined;

  const createCta = isCoach ? (
    <FairwayCreateAnnouncement players={players} documents={documents} />
  ) : undefined;

  // The view tab — player gets All / Unread / Action needed; coach gets
  // All / Action needed (no "unread" concept for the author). Counts are honest.
  const viewOptions = isCoach
    ? ([
        { value: 'all', label: 'All' },
        { value: 'action', label: actionCount > 0 ? `Action needed · ${actionCount}` : 'Action needed' },
      ] as const)
    : ([
        { value: 'all', label: 'All' },
        { value: 'unread', label: unreadCount > 0 ? `Unread · ${unreadCount}` : 'Unread' },
        { value: 'action', label: actionCount > 0 ? `Action needed · ${actionCount}` : 'Action needed' },
      ] as const);

  // Showing the toolbar only matters once there's more than a single card to
  // triage; one card needs no search/filter row.
  const showToolbar = total > 1 && (isCoach || !!playerId);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Announcements"
        title="What's new."
        description={description}
        meta={meta}
        primaryAction={createCta}
      />

      {showToolbar ? (
        <div className="mt-6">
          <Toolbar
            aria-label="Filter announcements"
            search={
              <SearchField
                size="sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClear={() => setQuery('')}
                placeholder="Search announcements"
                aria-label="Search announcements by title or body"
              />
            }
            filters={
              <>
                <FilterPill
                  size="sm"
                  selected={highOnly}
                  showCheck={false}
                  icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => setHighOnly((v) => !v)}
                  aria-pressed={highOnly}
                >
                  Urgent
                </FilterPill>
                <FilterPill
                  size="sm"
                  selected={tasksOnly}
                  showCheck={false}
                  icon={<ClipboardList className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => setTasksOnly((v) => !v)}
                  aria-pressed={tasksOnly}
                >
                  Has tasks
                </FilterPill>
                <FilterPill
                  size="sm"
                  selected={weekOnly}
                  showCheck={false}
                  icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => setWeekOnly((v) => !v)}
                  aria-pressed={weekOnly}
                >
                  This week
                </FilterPill>
              </>
            }
            viewToggle={
              <Toolbar.ViewToggle<FeedView>
                aria-label="Filter by status"
                options={viewOptions}
                value={view}
                onValueChange={setView}
              />
            }
          />
        </div>
      ) : null}

      <div className="mt-8">
        {total === 0 ? (
          <Surface elevation="border" padding="lg">
            <EmptyState
              icon={Bell}
              title="No announcements yet"
              description={
                isCoach
                  ? 'Create announcements to keep your team informed about schedule changes, upcoming events, and important updates.'
                  : 'No announcements have been posted yet. Check back later for team updates.'
              }
              action={createCta}
            />
          </Surface>
        ) : !isCoach && !playerId ? (
          <InlineNotice tone="warning" title="Player profile not found">
            We couldn't load your player profile. Complete onboarding or contact support to see your
            team's announcements.
          </InlineNotice>
        ) : filtered.length === 0 ? (
          <Surface elevation="border" padding="lg">
            <EmptyState
              variant="search"
              icon={CheckSquare}
              title="No matching announcements"
              description="No announcements match the current search and filters."
              action={
                anyFilterActive ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </Surface>
        ) : isCoach ? (
          <CoachFeed announcements={filtered} />
        ) : (
          <PlayerFeed announcements={filtered} playerId={playerId!} nowTs={nowTs} />
        )}
      </div>
    </div>
  );
}

/* ─── Coach feed ───────────────────────────────────────────────────────────── */
function CoachFeed({ announcements }: { announcements: GolfAnnouncementMeta[] }) {
  return (
    <div className="flex flex-col gap-3">
      {announcements.map((ann) => (
        <FairwayCoachAnnouncementCard key={ann.id} announcement={ann} />
      ))}
    </div>
  );
}

/* ─── Player feed (unread-first, STABLE across reloads) ─────────────────────────
 * P282: the unread-first order must NOT reshuffle after hydration. The primary
 * sort key is ack-needed (time-independent → identical at SSR and post-mount),
 * which keeps "action needed" pinned to the top with no first-paint flash. The
 * time-based recency component is folded in only as a SECONDARY tiebreaker among
 * non-ack items, and because the server list already arrives date-descending,
 * adding it does not move any item past the first stable paint. */
function PlayerFeed({
  announcements,
  playerId,
  nowTs,
}: {
  announcements: GolfAnnouncementMeta[];
  playerId: string;
  nowTs: number;
}) {
  const sorted = useMemo(() => sortPlayerFeed(announcements, nowTs), [announcements, nowTs]);

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((ann) => (
        <FairwayPlayerAnnouncementCard
          key={ann.id}
          announcement={ann}
          playerId={playerId}
          nowTs={nowTs}
        />
      ))}
    </div>
  );
}
