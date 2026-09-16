'use client';

/**
 * ============================================================================
 * FairwayCoachRoster: the coach roster as a field sheet
 * ----------------------------------------------------------------------------
 * Composition per docs/design/fairway-facelift/LANGUAGE.md and its own
 * per-page row in that doc's stage table (screens/roster.v3.md):
 *   1. Masthead, bare: team eyebrow with actions, "Your players.", the
 *      verdict sentence built from the roster, a facts line.
 *   2. The stage, the one Surface: ScoreField (every player's rounds on a
 *      shared date axis, sorted by trend — decliners first) with the
 *      window control in its header and the roster readouts (headcount,
 *      needs attention, focus coverage, rounds coverage) in a right column.
 *   3. The ledger row, two bare columns: Attention, Focus outcomes.
 *   4. Players as a dense, sortable, full-width table — every player, no
 *      cap (a roster is a bounded list, not a feed).
 * No hero metric tiles, no chart in a card, no client-only breakpoint
 * branch (phone layouts are CSS gated). Replaces the previous MatrixBoard +
 * header-Surface composition (roster.v3.md's "What this deletes").
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, Download, Flag as LucideFlag } from 'lucide-react';

import {
  Button,
  IconButton,
  Menu,
  Segmented,
  Surface,
  InlineNotice,
  EmptyState,
  ViewHeader,
} from '@/components/fairway';
import { Chip } from '@/components/fairway/controls/badge';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { SearchField } from '@/components/fairway/command/search-field';
import { Toolbar } from '@/components/fairway/controls/Toolbar';
import { ScoreField, scoreFieldCap } from '@/components/fairway/modules';
import { IconMoreHorizontal } from '@/components/icons';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import type { JoinRequestData } from '@/app/golf/actions/teams';
import { VerdictLine, FieldReadouts } from '@/components/fairway/pages/dashboard/coach-home-parts';
import type { PlayersGridFocusArea } from '@/components/fairway/pages/coachhelm/PlayersGridView';
import { computeRosterHealth, computeNeedsAttention } from '@/components/fairway/pages/coachhelm/roster-health';
import type { RosterPlayer } from './FairwayPlayerCard';
import { FairwayInvitePlayerButton } from './FairwayInvitePlayerButton';
import { FairwayJoinRequests } from './FairwayJoinRequests';
import { exportRosterCSV } from '@/components/golf/roster/RosterToolbar';
import { RosterAttentionColumn, RosterFocusOutcomesColumn, RosterTable } from './roster-parts';
import {
  buildFocusOutcomes,
  buildRosterReadouts,
  buildRosterVerdict,
  buildScoreFieldRows,
  fieldDomain,
  filterRosterByQuery,
  rosterHealthInputs,
  sortByTrend,
  sortRosterTable,
  windowStartFor,
  type RosterSortField,
  type RosterWindow,
} from './roster-logic';

export interface FairwayCoachRosterProps {
  players: RosterPlayer[];
  teamName: string;
  inviteCode: string | null;
  intents: Record<string, CoachPlayerIntent>;
  joinRequests: JoinRequestData[];
  /**
   * Minimal PlayersGridFocusArea-shaped rows (status + outcome_status) for
   * the roster-health computations and the ledger's Focus-outcomes column.
   * See roster/page.tsx.
   */
  focusAreas: PlayersGridFocusArea[];
  /** Server "today" (`YYYY-MM-DD`) — the stage's shared date axis needs a
   *  fixed end date; reading `Date.now()`/`new Date()` here would let the
   *  server and client renders disagree. */
  today: string;
  /** True when the rounds read failed server-side — the stage must say so,
   *  never render the honest-looking "No rounds logged yet" empty state
   *  for a roster that actually has rounds the read just couldn't reach. */
  roundsUnavailable: boolean;
}

const SORT_OPTIONS: { value: RosterSortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'avg', label: 'Avg score' },
  { value: 'handicap', label: 'Handicap' },
  { value: 'rounds', label: 'Rounds' },
];

const WINDOW_OPTIONS: { value: RosterWindow; label: string }[] = [
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'all', label: 'All' },
];

/**
 * Default `90D`, not `All` (roster.v3.md Risks, "All-window density"): a
 * multi-season player's full round history packed into one fixed-height
 * ScoreField row at only a few pixels per bar is unreadable past a few
 * dozen rounds. `All` stays one click away as an explicit opt-in.
 */
const DEFAULT_WINDOW: RosterWindow = '90d';

const WINDOW_SENTENCE: Record<RosterWindow, string> = {
  '30d': 'the last 30 days',
  '90d': 'the last 90 days',
  all: 'all time',
};

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

export function FairwayCoachRoster({
  players,
  teamName,
  inviteCode,
  intents,
  joinRequests,
  focusAreas,
  today,
  roundsUnavailable,
}: FairwayCoachRosterProps) {
  const router = useRouter();
  const [sort, setSort] = React.useState<RosterSortField>('name');
  const [query, setQuery] = React.useState('');
  const [attentionFilter, setAttentionFilter] = React.useState(false);
  const [scoreWindow, setScoreWindow] = React.useState<RosterWindow>(DEFAULT_WINDOW);

  const empty = players.length === 0;
  const activeCount = players.filter((p) => p.status === 'active' || p.status === null).length;
  const inactiveCount = players.length - activeCount;

  // ── Roster health / needs-attention — SAME pure computations
  // roster-health.ts exports (do not fork this math). Feeds the readouts,
  // the ledger's Attention column, and the masthead verdict. ──────────────
  const { statsByPlayer, rows: rosterRowsForHealth } = React.useMemo(() => rosterHealthInputs(players), [players]);
  const rosterHealth = React.useMemo(
    () => computeRosterHealth(players, focusAreas, statsByPlayer),
    [players, focusAreas, statsByPlayer],
  );
  const needsAttention = React.useMemo(() => computeNeedsAttention(rosterRowsForHealth), [rosterRowsForHealth]);
  const attentionIds = React.useMemo(() => new Set(needsAttention.map((n) => n.row.player.id)), [needsAttention]);

  const verdictParts = React.useMemo(
    () => buildRosterVerdict(players, teamName, needsAttention, rosterHealth.playersWithRounds),
    [players, teamName, needsAttention, rosterHealth.playersWithRounds],
  );
  const readouts = React.useMemo(
    () => buildRosterReadouts(rosterHealth, needsAttention, activeCount),
    [rosterHealth, needsAttention, activeCount],
  );
  const focusOutcomes = React.useMemo(() => buildFocusOutcomes(focusAreas, players), [focusAreas, players]);

  // ── Stage — ScoreField, sorted by trend, window-filtered. ───────────────
  const windowStart = React.useMemo(() => windowStartFor(scoreWindow, today), [scoreWindow, today]);
  const fieldRows = React.useMemo(
    () => sortByTrend(buildScoreFieldRows(players, windowStart)),
    [players, windowStart],
  );
  const cap = React.useMemo(() => scoreFieldCap(fieldRows), [fieldRows]);
  const domain = React.useMemo(() => fieldDomain(fieldRows, windowStart, today), [fieldRows, windowStart, today]);
  const roundsInWindow = React.useMemo(() => fieldRows.reduce((sum, r) => sum + r.rounds.length, 0), [fieldRows]);
  const windowLabel = WINDOW_OPTIONS.find((o) => o.value === scoreWindow)?.label ?? '';

  // ── The table — search, "needs attention" filter, sort. ─────────────────
  const filtered = React.useMemo(() => filterRosterByQuery(players, query), [players, query]);
  const board = React.useMemo(
    () => (attentionFilter ? filtered.filter((p) => attentionIds.has(p.id)) : filtered),
    [filtered, attentionFilter, attentionIds],
  );
  const sorted = React.useMemo(() => sortRosterTable(board, sort), [board, sort]);
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Name';

  const handleAddFocusArea = React.useCallback(
    (playerId?: string) => {
      router.push(`/golf/dashboard/intelligence?view=players${playerId ? `&player=${playerId}` : ''}&playersTab=areas`);
    },
    [router],
  );

  const handleExport = React.useCallback(() => {
    exportRosterCSV(sorted as unknown as Parameters<typeof exportRosterCSV>[0]);
  }, [sorted]);

  const handleIntentSaved = React.useCallback(() => router.refresh(), [router]);

  if (empty) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
        <ViewHeader
          className="mb-6"
          eyebrow="Roster"
          title="Your players."
          description={`Build your roster on ${teamName} by inviting players to join.`}
          primaryAction={<FairwayInvitePlayerButton teamName={teamName} joinCode={inviteCode} />}
        />
        <FairwayJoinRequests requests={joinRequests} />
        <EmptyState
          variant="default"
          title="Build your team"
          description={`Invite players to join ${teamName}. Share the code below or send a join link.`}
          action={<FairwayInvitePlayerButton teamName={teamName} joinCode={inviteCode} variant="ghost" />}
          secondaryAction={inviteCode ? <Chip tone="neutral">Join code · {inviteCode}</Chip> : undefined}
          className="mt-2"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col overflow-x-clip px-5 pt-6 pb-10 md:px-8 md:pt-8 md:pb-28">
      {/* ── 1 · Masthead ─────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className={OVERLINE}>{teamName}</p>
          <div className="flex items-center gap-2">
            <Menu
              ariaLabel="Roster actions"
              align="end"
              trigger={
                <IconButton variant="secondary" size="md" aria-label="More actions">
                  <IconMoreHorizontal size={18} />
                </IconButton>
              }
            >
              <Menu.Item icon={<Download className="h-4 w-4" aria-hidden />} onSelect={handleExport}>
                Export roster as CSV
              </Menu.Item>
            </Menu>
            <FairwayInvitePlayerButton teamName={teamName} joinCode={inviteCode} />
          </div>
        </div>
        <h1 className="font-fw-display text-h1 text-text-primary md:text-display">Your players.</h1>
        <VerdictLine parts={verdictParts} />
        <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1 font-fw-mono text-caption tabular-nums text-text-tertiary">
          <span>{activeCount} active</span>
          {inactiveCount > 0 ? (
            <span>
              <span aria-hidden="true" className="mr-3">·</span>
              {inactiveCount} inactive
            </span>
          ) : null}
        </p>
      </header>

      <FairwayJoinRequests requests={joinRequests} />

      {/* ── 2 · The stage ─────────────────────────────────────────────────── */}
      <Surface as="section" aria-label="Score field" elevation="border" padding="none" className="mt-10 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border-subtle px-5 py-4 md:px-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className={OVERLINE}>Roster <span aria-hidden="true">·</span> {WINDOW_SENTENCE[scoreWindow]}</p>
            <h2 className="font-fw-display text-h2 text-text-primary">Score field</h2>
            <p className="max-w-[68ch] font-fw-sans text-caption text-text-tertiary">
              Every round in the window, sorted by trend — decliners first. Bars rise over par in amber and drop under par in green; par is the line, scale ±{cap}. Avg is the window’s average; trend is each player’s overall read, the same one behind Attention and the table below.
            </p>
          </div>
          <div className="hidden md:flex">
            <Segmented value={scoreWindow} onValueChange={(v) => setScoreWindow(v as RosterWindow)} options={WINDOW_OPTIONS} aria-label="Performance window" size="sm" />
          </div>
          <div className="flex md:hidden">
            <Menu
              ariaLabel="Performance window"
              align="end"
              trigger={
                <Button variant="secondary" size="sm">
                  <span>Window · {windowLabel}</span>
                </Button>
              }
            >
              {WINDOW_OPTIONS.map((option) => (
                <Menu.Item key={option.value} onSelect={() => setScoreWindow(option.value)}>
                  {option.label}
                </Menu.Item>
              ))}
            </Menu>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
          <div className="order-2 min-w-0 px-5 py-4 md:px-6 md:py-5 xl:order-1">
            {roundsUnavailable ? (
              <InlineNotice tone="warning" title="Couldn’t load the team’s rounds">
                Something went wrong reading this team’s rounds. Refresh to try again; nothing has been lost.
              </InlineNotice>
            ) : roundsInWindow === 0 ? (
              <EmptyState
                variant="subtle"
                icon={LucideFlag}
                title={scoreWindow !== 'all' ? 'No rounds in this window' : 'No rounds logged yet'}
                description={scoreWindow !== 'all' ? 'Try a wider window.' : 'Players submit rounds from their dashboard and they land here.'}
                action={
                  scoreWindow !== 'all' ? (
                    <Button variant="secondary" size="sm" onClick={() => setScoreWindow('all')}>
                      Show all time
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ScoreField rows={fieldRows} domain={domain} cap={cap} rowsLabel="Player" ariaLabel="Rounds by player over the window, sorted by trend" />
            )}
          </div>
          <div className="order-1 border-b border-border-subtle px-5 py-4 md:px-6 md:py-5 xl:order-2 xl:border-b-0">
            <FieldReadouts items={readouts} />
          </div>
        </div>
      </Surface>

      {/* ── 3 · The ledger row ────────────────────────────────────────────── */}
      <div className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
        <div className="xl:col-span-7 xl:pr-8">
          <RosterAttentionColumn
            needs={needsAttention}
            playersWithRounds={rosterHealth.playersWithRounds}
            onAdd={handleAddFocusArea}
            onShowMore={() => setAttentionFilter(true)}
          />
        </div>
        <div className="border-t border-border-subtle pt-8 md:border-t-0 md:pt-0 xl:col-span-5 xl:pl-8">
          <RosterFocusOutcomesColumn outcomes={focusOutcomes} />
        </div>
      </div>

      {/* ── 4 · The table ─────────────────────────────────────────────────── */}
      <section aria-label="Players" className="mt-12 flex flex-col gap-3">
        <Toolbar
          className="mb-1"
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
            <>
              <div className="hidden md:flex">
                <Segmented aria-label="Sort players" value={sort} onValueChange={(v) => setSort(v as RosterSortField)} options={SORT_OPTIONS} size="sm" />
              </div>
              <div className="flex md:hidden">
                <Menu
                  ariaLabel="Sort players"
                  align="end"
                  trigger={
                    <Button variant="secondary" size="sm" leftIcon={<ArrowUpDown className="h-4 w-4" aria-hidden />}>
                      Sort · {sortLabel}
                    </Button>
                  }
                >
                  {SORT_OPTIONS.map((option) => (
                    <Menu.Item key={option.value} onSelect={() => setSort(option.value)}>
                      {option.label}
                    </Menu.Item>
                  ))}
                </Menu>
              </div>
            </>
          }
          filters={
            <FilterPill selected={attentionFilter} count={needsAttention.length > 0 ? needsAttention.length : undefined} onClick={() => setAttentionFilter((v) => !v)}>
              Needs attention
            </FilterPill>
          }
          primaryAction={
            <IconButton variant="secondary" size="md" aria-label="Export roster as CSV" onClick={handleExport} disabled={sorted.length === 0}>
              <Download className="h-4 w-4" aria-hidden />
            </IconButton>
          }
        />
        {sorted.length === 0 ? (
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
          <RosterTable players={sorted} intents={intents} onIntentSaved={handleIntentSaved} />
        )}
      </section>
    </div>
  );
}
