'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayCoachRoster (C2/C3/C4/C5/C9/C10) — coach roster
 * board (facelift — docs/design/fairway-facelift/screens/roster.md)
 * ----------------------------------------------------------------------------
 * Replaces the eight-card player gallery + two health cards + loose
 * search/sort/export row with ONE instrument: a header Surface (StatMatrix +
 * a "who needs your attention" seam list), a Toolbar, and a MatrixBoard with
 * one row per player. A row expands an inline detail band (goals, intent,
 * message via the actions menu, "Open profile") in place — no navigation for
 * a coach's daily scan, no per-card "View player" button.
 *
 * `computeRosterHealth`/`computeNeedsAttention` (RosterHealthHeader.tsx) are
 * reused VERBATIM — this file composes NEW header JSX from their data, but
 * never re-derives the coverage/priority math itself, and never edits or
 * re-renders `RosterHealthHeader`'s own JSX (still used unmodified by
 * CoachHelm elsewhere).
 *
 * Deviations from the literal screen spec (reported to team-lead, see PR/task
 * notes): the MatrixBoard column-key reuse in COLUMNS below (a pure wiring
 * detail, never visible text). The per-row overflow menu now lives in
 * `MatrixBoardRow.actions` (a real sibling control, not nested inside the
 * row's own button) and the desktop-inline / phone-Sheet expand split is
 * driven from this file via MatrixBoard's `expandedRowId`/
 * `onExpandedRowChange`, once `primitives` added both to MatrixBoard.tsx.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpDown, Check, Download } from 'lucide-react';

import { cn, pluralize } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { Chip } from '@/components/fairway/controls/badge';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { SearchField } from '@/components/fairway/command/search-field';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { InsetGroup } from '@/components/fairway/surfaces';
import { fwHaptic } from '@/lib/fairway/haptics';
import { Toolbar } from '@/components/fairway/controls/Toolbar';
import { PlayerIdentity } from '@/components/fairway/controls/PlayerIdentity';
import { StatMatrix } from '@/components/fairway/modules/StatMatrix';
import { SignalChip } from '@/components/fairway/modules/SignalChip';
import { MatrixBoard } from '@/components/fairway/modules/MatrixBoard';
import type { MatrixColumn, MatrixBoardRow, SignalTone } from '@/components/fairway/modules/types';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { TrendGlyph } from '@/components/fairway/charts/TrendChip';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import type { TrendVerdict } from '@/lib/coachhelm/trend';
import type { JoinRequestData } from '@/app/golf/actions/teams';
import { exportRosterCSV } from '@/components/golf/roster/RosterToolbar';
import type { PlayersGridFocusArea, PlayersGridStats, RosterRow } from '@/components/fairway/pages/coachhelm/PlayersGridView';
import { computeRosterHealth, computeNeedsAttention } from '@/components/fairway/pages/coachhelm/RosterHealthHeader';
// FairwayPlayerCard.tsx is no longer RENDERED on this page (roster.md: "stop
// using it here") — the component itself still ships (other importers keep
// working; see FairwayPlayerCard.test.tsx / sentry-replay-privacy.test.ts).
// Only its `RosterPlayer` type and its two pure SG:Total helpers are reused
// here, so the board's SG:Total column formats/tones the SAME number the
// same way instead of forking that math.
import type { RosterPlayer } from './FairwayPlayerCard';
import { formatSgTotal, sgTone } from './FairwayPlayerCard';
import { FairwayInvitePlayerButton } from './FairwayInvitePlayerButton';
import { FairwayJoinRequests } from './FairwayJoinRequests';
import { FairwayYearBadge } from './FairwayYearBadge';
import { FairwayIntentControl } from './FairwayIntentControl';
import { FairwayPlayerActionsMenu } from './FairwayPlayerActionsMenu';
import { isUserOnline } from './roster-helpers';

export interface FairwayCoachRosterProps {
  players: RosterPlayer[];
  teamName: string;
  inviteCode: string | null;
  intents: Record<string, CoachPlayerIntent>;
  joinRequests: JoinRequestData[];
  /**
   * Minimal PlayersGridFocusArea-shaped rows (status + outcome_status) for
   * the roster-health header — id/area_type/title are honest placeholders
   * unused by that math. See roster/page.tsx.
   */
  focusAreas: PlayersGridFocusArea[];
}

type SortField = 'name' | 'avg' | 'handicap' | 'rounds';
const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'avg', label: 'Avg score' },
  { value: 'handicap', label: 'Handicap' },
  { value: 'rounds', label: 'Rounds' },
] as const;

/** Matches Tailwind's `sm` (640px) — same threshold FairwayTasks.tsx's own
 *  `DESKTOP_QUERY` uses for an identical inline-vs-Sheet split. Below this,
 *  a row tap opens a Sheet instead of MatrixBoard's inline expand band. */
const DESKTOP_QUERY = '(min-width: 640px)';

/** The trend cell's desktop Sparkline is drawn at the SAME width MatrixBoard
 *  would have given the literal 'trend' column key (`trackFor()`'s 96px
 *  track) — this file can't use that key (see COLUMNS below), so the width
 *  is pinned here explicitly instead of trusting the Sparkline's own
 *  smaller default to happen to match. */
const TREND_SPARKLINE_WIDTH = 96;

/** Up to this many "needs a look" rows show as seams in the header; the rest
 *  collapse into a "+N more" control that filters the board instead. */
const ATTENTION_ROWS_CAP = 3;

/** The Sparkline/TrendGlyph trend cell needs at least this many normalized
 *  rounds before it draws a real line/verdict — STRICTER than Sparkline's own
 *  built-in <2-point honesty gate, per the roster board spec (an honest
 *  em-dash for a 2- or 3-round sample is still misleadingly confident here). */
const TREND_MIN_POINTS = 4;

/** Verdict word read to screen readers behind the phone row's arrow-only trend. */
const VERDICT_WORD: Record<string, string> = { improving: 'Improving', stable: 'Steady', declining: 'Declining' };

function playerName(p: Pick<RosterPlayer, 'first_name' | 'last_name'>): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
}

/**
 * Row signal — trending down / no intent set / on track. Presentation-only
 * derivation for the MatrixBoard's Signal column; distinct from (and doesn't
 * fork) the roster-health "needs attention" priority math above, which
 * drives the header list, not this per-row chip.
 */
function deriveSignal(
  trend: TrendVerdict | null | undefined,
  hasIntent: boolean,
): { tone: SignalTone; full: string; compact: string } {
  if (trend === 'declining') return { tone: 'watch', full: 'Trending down', compact: 'Down' };
  if (!hasIntent) return { tone: 'watch', full: 'No intent', compact: 'No plan' };
  return { tone: 'quiet', full: 'On track', compact: 'OK' };
}

/*
 * ── MatrixBoard column keys ──────────────────────────────────────────────────
 * MatrixBoard.tsx (not editable here) hides columns keyed literally 'scor' /
 * 'composite' / 'trend' / 'signal' below its 940px breakpoint (HIDE_ON_MOBILE)
 * and gives ONLY the literal 'trend' / 'signal' keys a wider custom track.
 * SG:Total and Focus reuse 'scor' / 'composite' to be hidden on phone. Trend
 * uses the literal 'trend' key on purpose (roster.mobile.md): desktop gets
 * the 96px sparkline track (the width this file already drew the sparkline
 * at), and below 940px the column is hidden while the trend ARROW rides
 * inside the Avg cell instead — a phone row is identity · avg+arrow · signal
 * plus the overflow menu, which is what fits in 289px without truncating a
 * name to nine characters. Signal keeps a non-matching key ('sig') so it
 * stays visible on phone. No column key ever renders as text.
 */
const COLUMNS: MatrixColumn[] = [
  { key: 'player', label: 'Player' },
  { key: 'avg', label: 'Avg', align: 'center' },
  { key: 'trend', label: 'Trend', align: 'center' },
  { key: 'scor', label: 'SG:Total', align: 'center' },
  { key: 'composite', label: 'Focus' },
  { key: 'sig', label: 'Signal' },
];

export function FairwayCoachRoster({ players, teamName, inviteCode, intents, joinRequests, focusAreas }: FairwayCoachRosterProps) {
  const router = useRouter();
  const [sort, setSort] = React.useState<SortField>('name');
  const [query, setQuery] = React.useState('');
  const [attentionFilter, setAttentionFilter] = React.useState(false);

  // Presence dots read `Date.now()` (roster-helpers.ts `isUserOnline`) —
  // deferring that read to after mount (instead of during the SSR render
  // MatrixBoard now runs once per row) avoids a server/client online-status
  // hydration mismatch, mirroring FairwayJoinRequests' own
  // `formatDate(dateStr, now)` client-only-clock pattern in this directory.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Desktop keeps MatrixBoard's inline expand band; below `sm` a row tap
  // opens a Sheet with the same RowDetail body instead (roster.md's phone
  // reading). `isDesktop` is SSR-safe/false-on-server via useMediaQuery, so
  // the very first paint (before hydration) never shows a phantom inline
  // expand on what turns out to be a phone.
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [expandedRowId, setExpandedRowId] = React.useState<string | null>(null);
  const [sheetPlayerId, setSheetPlayerId] = React.useState<string | null>(null);
  // Phone: the sort Segmented + Export live in a Sheet behind one "Sort" control.
  const [sortSheetOpen, setSortSheetOpen] = React.useState(false);
  const handleExpandedRowChange = React.useCallback(
    (candidate: string | null) => {
      if (isDesktop) {
        setExpandedRowId(candidate);
      } else if (candidate !== null) {
        setSheetPlayerId(candidate);
      }
    },
    [isDesktop],
  );

  // P253 — name search/filter. A roster is a list surface, so a coach overseeing
  // a large dev squad needs a way to find a player beyond scrolling (Nielsen
  // #6/#7). Case-insensitive match across first + last name.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => playerName(p).toLowerCase().includes(q));
  }, [players, query]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sort) {
        case 'avg':
          return (a.avg_score || Infinity) - (b.avg_score || Infinity);
        case 'handicap':
          return (a.handicap ?? Infinity) - (b.handicap ?? Infinity);
        case 'rounds':
          return (b.rounds_count ?? 0) - (a.rounds_count ?? 0);
        default:
          return `${a.last_name ?? ''}`.localeCompare(`${b.last_name ?? ''}`);
      }
    });
    return arr;
  }, [filtered, sort]);

  const activeCount = players.filter((p) => p.status === 'active' || p.status === null).length;
  const empty = players.length === 0;

  // ── "Who needs your attention" header data — SAME pure computations
  // RosterHealthHeader.tsx exports (do not fork this math). RosterPlayer
  // already carries every field PlayersGridPlayer requires, so no remapping
  // is needed. ────────────────────────────────────────────────────────────
  const playerStatsForHealth = React.useMemo(() => {
    const rec: Record<string, PlayersGridStats> = {};
    for (const p of players) {
      rec[p.id] = {
        rounds_played: p.rounds_count ?? 0,
        avg_score: p.avg_score ?? null,
        avg_putts: null,
        fairway_pct: null,
        gir_pct: null,
        best_score: null,
        recent_trend: p.recent_trend ?? null,
      };
    }
    return rec;
  }, [players]);

  const rosterRowsForHealth: RosterRow[] = React.useMemo(
    () =>
      players.map((p) => ({
        player: p,
        stats: playerStatsForHealth[p.id],
        activeCount: p.active_focus_areas ?? 0,
        completedCount: 0,
      })),
    [players, playerStatsForHealth],
  );

  const rosterHealth = React.useMemo(
    () => computeRosterHealth(players, focusAreas, playerStatsForHealth),
    [players, focusAreas, playerStatsForHealth],
  );
  const needsAttention = React.useMemo(
    () => computeNeedsAttention(rosterRowsForHealth),
    [rosterRowsForHealth],
  );
  const attentionIds = React.useMemo(
    () => new Set(needsAttention.map((n) => n.row.player.id)),
    [needsAttention],
  );

  const board = React.useMemo(
    () => (attentionFilter ? sorted.filter((p) => attentionIds.has(p.id)) : sorted),
    [sorted, attentionFilter, attentionIds],
  );

  // The player behind the phone Sheet, looked up from `board` (the same
  // list the visible rows come from) rather than the full `players` array,
  // since `sheetPlayerId` can only ever be set from a row that's currently
  // rendered.
  const sheetPlayer = React.useMemo(
    () => board.find((p) => p.id === sheetPlayerId) ?? null,
    [board, sheetPlayerId],
  );

  const handleAddFocusArea = React.useCallback(
    (playerId?: string) => {
      router.push(`/golf/dashboard/intelligence?view=players${playerId ? `&player=${playerId}` : ''}&playersTab=areas`);
    },
    [router],
  );

  const handleExport = React.useCallback(() => {
    exportRosterCSV(sorted as unknown as Parameters<typeof exportRosterCSV>[0]);
  }, [sorted]);

  const rows: MatrixBoardRow[] = React.useMemo(
    () =>
      board.map((p) => {
        const name = playerName(p);
        const scores = p.recent_scores ?? [];
        const hasTrendSignal = scores.length >= TREND_MIN_POINTS;
        const hasScore = Boolean(p.avg_score && p.avg_score > 0);
        const online = mounted ? isUserOnline(p.last_seen) : undefined;
        const signal = deriveSignal(p.recent_trend, Boolean(intents[p.id]));

        return {
          id: p.id,
          ariaLabel: `${name}, expandable row`,
          cells: [
            <div key="player" data-sentry-mask="" className="min-w-0">
              <PlayerIdentity
                name={name}
                avatarUrl={p.avatar_url}
                size="sm"
                status={online === undefined ? undefined : online ? 'online' : 'offline'}
                nameAddon={<FairwayYearBadge year={p.graduation_year} />}
                meta={pluralize(p.rounds_count ?? 0, 'round')}
              />
            </div>,
            <span
              key="avg"
              className={cn(
                'inline-flex items-center gap-1 font-fw-mono text-body-sm tabular-nums',
                hasScore ? 'text-text-primary' : 'text-text-tertiary',
              )}
            >
              {hasScore ? (p.avg_score ?? 0).toFixed(1) : '—'}
              {/* Phone: the trend arrow rides beside the average (the Trend
                  column is hidden below 940px); the verdict word is read,
                  not shown. */}
              {hasTrendSignal && p.recent_trend ? (
                <TrendGlyph
                  direction={p.recent_trend}
                  label={<span className="sr-only">{VERDICT_WORD[p.recent_trend] ?? p.recent_trend}</span>}
                  className="text-caption min-[940px]:hidden"
                />
              ) : null}
            </span>,
            <div key="trend">
              {hasTrendSignal ? (
                <Sparkline
                  data={scores}
                  goodDirection="down"
                  label={`${name} scoring trend`}
                  width={TREND_SPARKLINE_WIDTH}
                />
              ) : (
                <span className="font-fw-mono text-body-sm text-text-tertiary">—</span>
              )}
            </div>,
            <span
              key="scor"
              className={cn(
                'font-fw-mono text-body-sm font-semibold tabular-nums',
                p.sg_total != null ? sgTone(p.sg_total) : 'text-text-tertiary',
              )}
            >
              {p.sg_total != null ? formatSgTotal(p.sg_total) : '—'}
            </span>,
            <span key="composite" className="font-fw-mono text-body-sm tabular-nums text-text-primary">
              {p.active_focus_areas ? p.active_focus_areas : '—'}
            </span>,
            <SignalChip key="sig" tone={signal.tone}>
              <span className="hidden whitespace-nowrap min-[940px]:inline">{signal.full}</span>
              <span className="whitespace-nowrap min-[940px]:hidden">{signal.compact}</span>
            </SignalChip>,
          ],
          expand: (
            <RowDetail
              player={p}
              name={name}
              intent={intents[p.id] ?? null}
              onIntentSaved={() => router.refresh()}
            />
          ),
          // A real sibling control (MatrixBoard renders `actions` outside
          // the row's own press-target button), always visible at every
          // width — not gated behind the expand band, so the menu's own
          // "Message" item is reachable without opening the row first.
          actions: (
            <FairwayPlayerActionsMenu playerId={p.id} playerName={name} currentStatus={p.status} />
          ),
        };
      }),
    [board, mounted, intents, router],
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      {/* Masthead — the one canonical ViewHeader primitive. Invite stays the
          ONE primary action on this screen (brief §12). */}
      <ViewHeader
        className="mb-6"
        eyebrow="Roster"
        title="Your players."
        description={
          empty
            ? `Build your roster on ${teamName} by inviting players to join.`
            : `${players.length} ${players.length === 1 ? 'player' : 'players'}${activeCount !== players.length ? ` · ${activeCount} active` : ''} on ${teamName}.`
        }
        primaryAction={<FairwayInvitePlayerButton teamName={teamName} joinCode={inviteCode} />}
      />

      {/* Join requests — a quiet row above the board, only when > 0. */}
      <FairwayJoinRequests requests={joinRequests} />

      {empty ? (
        <EmptyState
          variant="default"
          title="Build your team"
          description={`Invite players to join ${teamName}. Share the code below or send a join link.`}
          action={
            // The header above already carries the primary "Invite player" CTA —
            // this card repeats the affordance for a reader who lands mid-page,
            // so it renders ghost to avoid two competing primary buttons on one
            // empty state.
            <FairwayInvitePlayerButton teamName={teamName} joinCode={inviteCode} variant="ghost" />
          }
          secondaryAction={inviteCode ? <Chip tone="neutral">Join code · {inviteCode}</Chip> : undefined}
          className="mt-2"
        />
      ) : (
        <>
          {/* Header Surface — StatMatrix (Players · Active focus · Completed ·
              With recent rounds) left, "who needs your attention" seam rows
              right. Replaces the old two health cards + 4-number block
              (roster.md CONTAINERS TO REMOVE #2). The "Did the coaching
              land?" outcome-mix band is intentionally NOT ported here — it's
              dropped from this page per that same spec item; it still lives
              on CoachHelm via RosterHealthHeader, unmodified. */}
          <Surface elevation="border" padding="none" className="mb-6 overflow-hidden">
            {/* `minmax(0,1fr)` at EVERY width: a plain auto track sizes to
                its content's min-content, and the attention rows' nowrap
                meta lines made it wider than a phone — the whole panel
                clipped at the right edge (roster.mobile.md #1). */}
            <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div className="p-5 md:p-6">
                {/* No `label`: the ViewHeader eyebrow above already says
                    Roster (REVIEW.md: one eyebrow per screen). */}
                <StatMatrix
                  variant="plain"
                  columns={4}
                  items={[
                    { label: 'Players', value: rosterHealth.totalPlayers },
                    { label: 'Active focus', value: rosterHealth.activeAreas },
                    { label: 'Completed', value: rosterHealth.completedAreas },
                    { label: 'With recent rounds', value: rosterHealth.playersWithRounds },
                  ]}
                />
              </div>
              <AttentionPanel
                health={rosterHealth}
                needs={needsAttention}
                onAdd={handleAddFocusArea}
                onShowMore={() => setAttentionFilter(true)}
              />
            </div>
          </Surface>

          {/* Toolbar — search · sort · "Needs attention" filter · export.
              `sticky`: matte at rest, earns the shared cream glass once
              stuck (roster.md's parenthetical). `stickyTop` now accepts a
              CSS string (primitives, 2026-09-10) so this pins below
              FairwayTopBar's `sticky top-0` bar using the SAME calc every
              other sticky-under-the-top-bar strip in this app uses — see
              FairwayHubSubNav / FairwayCalendarHero / FairwayRoundsLibrary's
              seam headers. */}
          <Toolbar
            className="mb-4"
            sticky
            stickyTop="calc(var(--golf-mobile-header-offset) + var(--fw-hub-subnav-offset, 0px))"
            aria-label="Roster filters and actions"
            search={
              <SearchField
                size="sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClear={() => setQuery('')}
                placeholder="Search players by name"
                aria-label="Search players"
              />
            }
            viewToggle={
              <div className="hidden sm:contents">
                <Toolbar.ViewToggle<SortField>
                  aria-label="Sort players"
                  value={sort}
                  onValueChange={setSort}
                  options={SORT_OPTIONS as unknown as { value: SortField; label: string }[]}
                />
              </div>
            }
            filters={
              <>
                <FilterPill
                  selected={attentionFilter}
                  count={needsAttention.length > 0 ? needsAttention.length : undefined}
                  onClick={() => setAttentionFilter((v) => !v)}
                >
                  Needs attention
                </FilterPill>
                {/* Phone: one control opens the sort Sheet (the Segmented
                    and Export below are desktop-only). */}
                <Button
                  variant="secondary"
                  size="sm"
                  className="sm:hidden"
                  leftIcon={<ArrowUpDown className="h-4 w-4" aria-hidden />}
                  aria-haspopup="dialog"
                  aria-expanded={sortSheetOpen}
                  onClick={() => setSortSheetOpen(true)}
                >
                  Sort · {SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Name'}
                </Button>
              </>
            }
            primaryAction={
              <div className="hidden sm:contents">
                <IconButton
                  variant="secondary"
                  size="md"
                  aria-label="Export roster as CSV"
                  onClick={handleExport}
                  disabled={sorted.length === 0}
                >
                  <Download className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
            }
          />

          {/* Board */}
          {board.length === 0 ? (
            <EmptyState
              variant="search"
              title={attentionFilter && !query.trim() ? 'Nobody needs a look right now' : 'No players match your search'}
              description={
                attentionFilter && !query.trim()
                  ? 'Every player either has a focus area or is trending fine.'
                  : `No players on ${teamName} match “${query.trim()}”.`
              }
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setAttentionFilter(false);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <MatrixBoard
              kpis={[]}
              columns={COLUMNS}
              rows={rows}
              // Clamped to `null` when not desktop even though this file
              // never SETS it off-desktop, so a live resize from desktop
              // (with a row already expanded) down to phone can't leave a
              // stale inline expand band open underneath the Sheet flow.
              expandedRowId={isDesktop ? expandedRowId : null}
              onExpandedRowChange={handleExpandedRowChange}
            />
          )}
        </>
      )}

      {/* Phone reading of a row's detail: MatrixBoard's own inline expand
          only engages at/above `sm` (see `isDesktop` above) — below it, a
          row tap opens this Sheet with the SAME RowDetail body instead,
          per roster.md's phone spec ("Sheet, matte, side bottom"). */}
      <Sheet
        open={sheetPlayer != null}
        onOpenChange={(open) => {
          if (!open) setSheetPlayerId(null);
        }}
        title={sheetPlayer ? playerName(sheetPlayer) : 'Player'}
      >
        <Sheet.Body className="px-4 pb-4">
          {sheetPlayer ? (
            <RowDetail
              player={sheetPlayer}
              name={playerName(sheetPlayer)}
              intent={intents[sheetPlayer.id] ?? null}
              onIntentSaved={() => router.refresh()}
              host="sheet"
            />
          ) : null}
        </Sheet.Body>
        {/* The ONE primary action of the phone sheet, pinned above the safe
            area (the inline desktop band keeps it in its own row). */}
        {sheetPlayer ? (
          <Sheet.Footer>
            <Button asChild variant="primary" size="lg" shape="block" fullWidth>
              <Link href={`/golf/dashboard/roster/${sheetPlayer.id}`}>Open profile</Link>
            </Button>
          </Sheet.Footer>
        ) : null}
      </Sheet>

      {/* Phone sort Sheet — the Segmented's four options as seam rows, then
          Export. Matte (a docked utility sheet, not a floating one). */}
      <Sheet open={sortSheetOpen} onOpenChange={setSortSheetOpen} title="Sort players">
        <Sheet.Body className="px-4 pb-4">
          <InsetGroup variant="matte" aria-label="Sort players by">
            {SORT_OPTIONS.map((opt) => {
              const selected = sort === opt.value;
              return (
                <InsetGroup.Row
                  key={opt.value}
                  as="button"
                  aria-pressed={selected}
                  trailing={selected ? <Check className="text-accent-700" aria-hidden /> : undefined}
                  onClick={() => {
                    if (!selected) fwHaptic('selection');
                    setSort(opt.value);
                    setSortSheetOpen(false);
                  }}
                >
                  <span className={cn('font-fw-sans text-body-sm', selected ? 'font-semibold text-text-primary' : 'text-text-secondary')}>
                    {opt.label}
                  </span>
                </InsetGroup.Row>
              );
            })}
          </InsetGroup>
          <InsetGroup variant="matte" className="mt-4">
            <InsetGroup.Row
              as="button"
              icon={<Download aria-hidden />}
              onClick={() => {
                handleExport();
                setSortSheetOpen(false);
              }}
              aria-disabled={sorted.length === 0 || undefined}
              className={cn(sorted.length === 0 && 'pointer-events-none opacity-50')}
            >
              <span className="font-fw-sans text-body-sm text-text-primary">Export roster as CSV</span>
            </InsetGroup.Row>
          </InsetGroup>
        </Sheet.Body>
      </Sheet>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * AttentionPanel — the header Surface's right half. Honest copy branches
 * (no roster / no rounds / genuinely covered) are ported VERBATIM from
 * RosterHealthHeader.tsx so this page can't reintroduce the two production
 * incidents that copy's comments document (a vacuously-true all-clear on a
 * zero-round roster; every real player flagged on a program with no focus
 * areas yet). Only the presentation differs (seam rows in a Surface half
 * instead of an InstrumentCluster panel).
 * ------------------------------------------------------------------------- */
function AttentionPanel({
  health,
  needs,
  onAdd,
  onShowMore,
}: {
  health: ReturnType<typeof computeRosterHealth>;
  needs: ReturnType<typeof computeNeedsAttention>;
  onAdd: (playerId?: string) => void;
  onShowMore: () => void;
}) {
  const { totalPlayers, playersWithActive, activeAreas, completedAreas, playersWithRounds } = health;
  const areasPrescribed = activeAreas + completedAreas;
  const noAreasYet = areasPrescribed === 0;
  const coveredText =
    totalPlayers > 0
      ? `${playersWithActive} of ${totalPlayers} player${totalPlayers === 1 ? '' : 's'} have an active focus area`
      : 'No players on the roster yet';
  const shown = needs.slice(0, ATTENTION_ROWS_CAP);
  const remaining = needs.length - shown.length;

  return (
    <div className="border-t border-border-subtle p-5 lg:border-l lg:border-t-0 md:p-6">
      <h3 className="mb-3 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.08em] text-text-tertiary">
        Who needs your attention
      </h3>

      {needs.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="font-fw-mono text-stat-lg font-semibold leading-none tabular-nums text-text-primary">
              {needs.length}
            </span>
            <span className="mb-1 font-fw-sans text-body-sm text-text-secondary">
              {noAreasYet
                ? `ready for a focus area — none set on this roster yet.`
                : `to look at — trending down or without a focus area.`}
            </span>
          </div>
          <ul className="flex flex-col">
            {shown.map(({ row, reason }) => (
              <li key={row.player.id} className="border-t border-border-subtle py-2.5 first:border-t-0">
                <div data-sentry-mask="">
                  <PlayerIdentity
                    name={playerName(row.player)}
                    avatarUrl={row.player.avatar_url}
                    size="sm"
                    meta={<span className="font-fw-sans text-caption font-medium text-fw-warning-ink">{reason}</span>}
                    trailing={
                      <Button variant="ghost" size="sm" onClick={() => onAdd(row.player.id)}>
                        Add focus area
                      </Button>
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
          {remaining > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowMore}
              className="mt-1 h-auto justify-start px-0 py-0 font-fw-sans text-caption font-medium text-accent-700 hover:underline"
            >
              +{remaining} more player{remaining === 1 ? '' : 's'} — filter the board
            </Button>
          ) : null}
          <p className="mt-3 font-fw-sans text-caption text-text-tertiary">{coveredText}.</p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="font-fw-mono text-stat-lg font-semibold leading-none tabular-nums text-text-primary">
            {totalPlayers > 0 && playersWithRounds > 0 ? '0' : '—'}
          </span>
          <span className="font-fw-sans text-body-sm text-text-secondary">
            {totalPlayers === 0
              ? 'Awaiting roster — add players to start tracking who needs attention.'
              : playersWithRounds === 0
                ? 'Nothing to assess yet — attention flags appear once players start logging rounds.'
                : 'Roster’s covered — everyone with rounds has a focus area and no one’s trending down.'}
          </span>
          <span className="font-fw-sans text-caption text-text-tertiary">{coveredText}.</span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * RowDetail — a board row's detail content. Rendered as MatrixBoard's inline
 * expand band at/above `sm` (desktop keeps the drill-in-place reading) and
 * as this same body inside the phone Sheet below `sm` (see `isDesktop` /
 * `sheetPlayer` in FairwayCoachRoster) — ONE content component, two hosts.
 *
 * Not wrapped in <DrillPanel>: that component's `onBack`/`backLabel` imply a
 * real close affordance. MatrixBoard's inline expand band has no such
 * affordance of its own (closing means re-tapping the row), and the phone
 * Sheet already supplies its own close control — a DrillPanel back-chip in
 * either host would be a non-functional, dishonest affordance. Plain JSX
 * instead, following TeamStatsBoard's `ExpandBand` precedent (the only other
 * real MatrixBoard consumer in the codebase).
 *
 * The overflow menu (FairwayPlayerActionsMenu) is NOT rendered here — it
 * lives in the row's own `MatrixBoardRow.actions` slot instead (see the
 * `rows` memo above), a real sibling of the row's press-target button, so
 * it's reachable at every width without opening this detail band first.
 * ------------------------------------------------------------------------- */
function RowDetail({
  player,
  name,
  intent,
  onIntentSaved,
  host = 'band',
}: {
  player: RosterPlayer;
  name: string;
  intent: CoachPlayerIntent | null;
  onIntentSaved: () => void;
  /** 'band' = MatrixBoard's inline expand (CTA inline, right); 'sheet' =
   *  the phone Sheet, whose Footer owns the CTA (none rendered here). */
  host?: 'band' | 'sheet';
}) {
  return (
    <div data-sentry-mask="" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">Goals</p>
          <p className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">
            {player.active_goals ? `${player.active_goals} active` : 'None yet'}
          </p>
        </div>
        <FairwayIntentControl
          playerId={player.id}
          playerName={name}
          current={intent}
          size="sm"
          onSaved={onIntentSaved}
        />
      </div>
      {host === 'band' ? (
        <Button asChild variant="secondary" size="sm" shape="block" fullWidth className="sm:w-auto">
          <Link href={`/golf/dashboard/roster/${player.id}`}>Open profile</Link>
        </Button>
      ) : null}
    </div>
  );
}
