'use client';

/**
 * CoachHelm Home: Team intelligence.
 *
 * Filters (round type · window · comparison) → four theme cards (team SG per
 * round, its trend, the last 30 days beside the season, rounds without SG,
 * and the team's strokes available) → for the selected
 * theme, the cause visual and the player spotlight on the left, and who is
 * contributing on the right. Selecting a player filters the cause visual and
 * the spotlight to them.
 *
 * Every figure is read from `TeamIntelligenceData` (stored per-round SG and
 * tracked shots); nothing here is estimated.
 */
import { useMemo, useState } from 'react';
import { Button, EmptyState, InlineNotice, Segmented } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  filterRounds,
  playerThemeSg,
  themeSummary,
  worstFirst,
  type IntelRoundFilter,
  type IntelWindow,
} from '@/lib/golf/team-intelligence/aggregate';
import {
  INTEL_THEMES,
  type IntelStrokesAvailable,
  type IntelTheme,
  type TeamIntelligenceData,
  type TeamIntelligenceResult,
} from '@/lib/golf/team-intelligence/types';
import { ApproachCause } from './causes/ApproachCause';
import { ChipCause } from './causes/ChipCause';
import { PuttCause } from './causes/PuttCause';
import { TeeCause } from './causes/TeeCause';
import { ContributorList, type ContributorRow } from './ContributorList';
import { PlayerSpotlight } from './PlayerSpotlight';
import { Sparkline } from './Sparkline';
import { SG_TONE_TEXT, THEME_LABEL, THEME_PHRASE, THEME_SHORT, formatSg, roundIndexSet, sgTone, type CauseProps } from './shared';
import { formatStrokesPerRound } from './strokes';
import { STAT_LABEL, contributorRead, spotlightTiles } from './theme-stats';

type Compare = 'tour' | 'team';

export interface TeamIntelligenceProps {
  result: TeamIntelligenceResult;
  strokes: Partial<Record<IntelTheme, IntelStrokesAvailable>>;
  /** Link to a player's profile. */
  playerHref: (playerId: string) => string;
  retry?: React.ReactNode;
  className?: string;
}

const CAUSE: Record<IntelTheme, (props: CauseProps) => React.ReactNode> = {
  tee: TeeCause,
  app: ApproachCause,
  atg: ChipCause,
  putt: PuttCause,
};

const ROUND_TYPES: { id: IntelRoundFilter; label: string; dot: string | null }[] = [
  { id: 'all', label: 'All rounds', dot: null },
  { id: 'practice', label: 'Practice', dot: 'var(--fw-color-warm-400)' },
  { id: 'qualifier', label: 'Qualifier', dot: 'var(--fw-color-warning)' },
  { id: 'tournament', label: 'Tournament', dot: 'var(--fw-color-accent-600)' },
];

function Filter<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string; count?: number; dot?: string | null }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <Segmented
        quiet
        aria-label={label}
        value={value}
        onValueChange={onChange}
        options={options.map((o) => ({
          value: o.id,
          label: (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {o.dot ? <span aria-hidden className="size-1.5 rounded-full" style={{ background: o.dot }} /> : null}
              {o.label}
              {o.count != null ? <span className="tabular-nums text-text-tertiary">{o.count}</span> : null}
            </span>
          ),
        }))}
      />
    </div>
  );
}

function ThemeCard({
  theme,
  on,
  sg,
  series,
  change,
  rounds,
  missing,
  recent,
  strokes,
  onSelect,
}: {
  theme: IntelTheme;
  on: boolean;
  sg: number | null;
  series: number[];
  change: number | null;
  rounds: number;
  /** Rounds in the slice with no stored SG for this theme. */
  missing: number;
  /** The last 30 days, shown beside the season; null when the slice is already 30 days. */
  recent: { sg: number | null; rounds: number } | null;
  strokes: IntelStrokesAvailable | undefined;
  onSelect: () => void;
}) {
  const quiet = on ? 'text-nav-text-dim' : 'text-text-tertiary';
  const dir = change == null ? null : change > 0.15 ? 'up' : change < -0.15 ? 'down' : 'flat';
  const line =
    dir === 'up'
      ? on
        ? 'var(--fw-color-nav-accent)'
        : 'var(--fw-viz-div-pos)'
      : dir === 'down'
        ? on
          ? 'var(--fw-color-warning)'
          : 'var(--fw-viz-div-neg)'
        : on
          ? 'var(--fw-color-nav-text-dim)'
          : 'var(--fw-color-warm-400)';
  const dirText = dir === 'up' ? 'Improving' : dir === 'down' ? 'Slipping' : dir === 'flat' ? 'Flat' : null;
  const dirTone = on
    ? dir === 'up'
      ? 'text-nav-accent'
      : dir === 'down'
        ? 'text-fw-warning'
        : 'text-nav-text-dim'
    : dir === 'up'
      ? 'text-accent-ink'
      : dir === 'down'
        ? 'text-fw-warning-text'
        : 'text-text-tertiary';

  return (
    // eslint-disable-next-line helm/no-raw-button -- a whole theme card is the toggle; a <Button> pill can't hold it
    <button
      type="button"
      aria-pressed={on}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col gap-2.5 rounded-card border p-4 text-left transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        on ? 'border-nav-bg bg-nav-bg text-nav-text shadow-soft dark:border-accent-500 dark:ring-1 dark:ring-accent-500' : 'border-border-subtle bg-surface text-text-primary hover:border-border-strong',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-fw-sans text-body-sm font-semibold">
          <span className="[@container(min-width:720px)]:hidden">{THEME_SHORT[theme]}</span>
          <span className="hidden [@container(min-width:720px)]:inline">{THEME_LABEL[theme]}</span>
        </span>
        {dirText ? <span className={cn('shrink-0 font-fw-sans text-caption font-semibold', dirTone)}>{dirText}</span> : null}
      </span>
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            'font-fw-sans text-h1 font-semibold leading-none tabular-nums',
            on ? (sgTone(sg) === 'loss' ? 'text-fw-warning' : 'text-nav-text') : SG_TONE_TEXT[sgTone(sg)],
          )}
        >
          {formatSg(sg)}
        </span>
        {change != null ? (
          <span className={cn('font-fw-sans text-caption font-semibold tabular-nums', dirTone)}>{formatSg(change)}</span>
        ) : null}
      </span>
      <span className="block h-10">
        {series.length > 1 ? (
          <Sparkline
            values={series}
            color={line}
            zeroColor={on ? 'var(--fw-color-nav-text-dim)' : 'var(--fw-color-border-strong)'}
          />
        ) : null}
      </span>
      <span className={cn('font-fw-sans text-caption', quiet)}>
        {rounds === 0 ? 'No rounds with SG in this slice' : `SG / round · ${rounds} round${rounds === 1 ? '' : 's'}`}
        {missing > 0 ? ` · ${missing} without SG` : ''}
      </span>
      {recent ? (
        <span className={cn('font-fw-sans text-caption tabular-nums', quiet)}>
          {recent.rounds === 0
            ? 'Last 30 days: no rounds with SG'
            : `Last 30 days ${formatSg(recent.sg)} · ${recent.rounds} round${recent.rounds === 1 ? '' : 's'}`}
        </span>
      ) : null}
      {strokes ? (
        <span
          className={cn(
            'flex flex-col gap-0.5 rounded-fw-sm px-2 py-1 font-fw-sans text-caption',
            on ? 'bg-nav-surface text-nav-text' : 'bg-accent-wash text-accent-ink',
          )}
        >
          <span className="font-medium">~{formatStrokesPerRound(strokes.perRound)} strokes / round per player available</span>
          <span className={on ? 'text-nav-text-dim' : 'text-text-secondary'}>
            {strokes.playersWithLeak} of {strokes.playersCounted} current players carry a measured leak
          </span>
        </span>
      ) : null}
    </button>
  );
}

function Body({ data, strokes, playerHref }: { data: TeamIntelligenceData; strokes: TeamIntelligenceProps['strokes']; playerHref: (id: string) => string }) {
  const [win, setWin] = useState<IntelWindow>('season');
  const [type, setType] = useState<IntelRoundFilter>('all');
  const [compare, setCompare] = useState<Compare>('tour');
  const [picked, setPicked] = useState<IntelTheme | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const inWindow = useMemo(() => filterRounds(data.rounds, { window: win, type: 'all', today: data.today }), [data, win]);
  const rounds = useMemo(() => (type === 'all' ? inWindow : inWindow.filter((r) => r.type === type)), [inWindow, type]);
  const allowed = useMemo(() => roundIndexSet(data.rounds, rounds), [data.rounds, rounds]);

  const summaries = useMemo(() => {
    const out = {} as Record<IntelTheme, ReturnType<typeof themeSummary>>;
    for (const t of INTEL_THEMES) out[t] = themeSummary(rounds, t);
    return out;
  }, [rounds]);

  // Recent form beside the season: the season mean can hide the last month.
  const recentSummaries = useMemo(() => {
    if (win === '30d') return null;
    const recentRounds = filterRounds(data.rounds, { window: '30d', type, today: data.today });
    const out = {} as Record<IntelTheme, ReturnType<typeof themeSummary>>;
    for (const t of INTEL_THEMES) out[t] = themeSummary(recentRounds, t);
    return out;
  }, [data, win, type]);

  // Smart default: the theme losing the most strokes per round.
  const theme: IntelTheme =
    picked ??
    [...INTEL_THEMES].sort((a, b) => (summaries[a].sg ?? Infinity) - (summaries[b].sg ?? Infinity))[0]!;

  const teamSg = summaries[theme].sg;
  const shift = compare === 'team' && teamSg != null ? teamSg : 0;
  const compareLabel = compare === 'team' ? 'vs team avg' : `vs ${data.baselineLabel}`;

  const rows: ContributorRow[] = useMemo(() => {
    const byId = new Map(data.players.map((p) => [p.id, p]));
    return worstFirst(playerThemeSg(rounds, data.players.map((p) => p.id), theme))
      .filter((r) => r.rounds > 0)
      .map((r) => ({
        player: byId.get(r.playerId)!,
        sg: r.sg == null ? null : r.sg - shift,
        rounds: r.rounds,
        last8: r.last8.map((v) => v - shift),
        read: contributorRead(data, allowed, theme, r.playerId),
      }));
  }, [data, rounds, allowed, theme, shift]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: inWindow.length };
    for (const r of inWindow) counts[r.type] = (counts[r.type] ?? 0) + 1;
    return counts;
  }, [inWindow]);

  const selected = playerId && rows.some((r) => r.player.id === playerId) ? playerId : null;
  const spotRow = rows.find((r) => r.player.id === selected) ?? rows[0] ?? null;
  const Cause = CAUSE[theme];
  const selectedName = selected ? (rows.find((r) => r.player.id === selected)?.player.name ?? null) : null;

  const filters = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Filter
        label="Round type"
        value={type}
        onChange={setType}
        options={ROUND_TYPES.map((o) => ({ ...o, count: typeCounts[o.id] ?? 0 }))}
      />
      <div className="flex max-w-full flex-wrap gap-2">
        <Filter
          label="Window"
          value={win}
          onChange={setWin}
          options={[
            { id: 'season', label: 'Season' },
            { id: '30d', label: 'Last 30 days' },
          ]}
        />
        <Filter
          label="Compare players"
          value={compare}
          onChange={setCompare}
          options={[
            { id: 'tour', label: `vs ${data.baselineLabel}` },
            { id: 'team', label: 'vs Team avg' },
          ]}
        />
      </div>
    </div>
  );

  if (rounds.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {filters}
        <EmptyState
          variant="subtle"
          title={win === '30d' ? 'No rounds in the last 30 days' : 'No rounds in this slice'}
          description={
            win === '30d'
              ? 'Nobody has posted a counted round in the last 30 days. The season view still has every round.'
              : 'No counted rounds match this round type yet. Pick all rounds to see the season.'
          }
          action={
            <Button variant="secondary" size="sm" onClick={() => (win === '30d' ? setWin('season') : setType('all'))}>
              {win === '30d' ? 'Show the season' : 'Show all rounds'}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {filters}

      <div className="grid grid-cols-2 gap-3 [@container(min-width:720px)]:grid-cols-4">
        {INTEL_THEMES.map((t) => (
          <ThemeCard
            key={t}
            theme={t}
            on={t === theme}
            sg={summaries[t].sg}
            series={summaries[t].series}
            change={summaries[t].change}
            rounds={summaries[t].rounds}
            missing={summaries[t].missing}
            recent={recentSummaries ? { sg: recentSummaries[t].sg, rounds: recentSummaries[t].rounds } : null}
            strokes={strokes[t]}
            onSelect={() => setPicked(t)}
          />
        ))}
      </div>
      <p className="-mt-2 font-fw-sans text-caption text-text-tertiary">
        Team strokes gained per round vs {data.baselineLabel}. Trend runs oldest to newest across the slice.
        Strokes available is the average over current players (a round in the last 60 days) of each
        player&apos;s largest measured leak in the theme.
      </p>

      <div className="grid grid-cols-1 items-start gap-4 [@container(min-width:1000px)]:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Cause data={data} allowed={allowed} playerId={selected} playerName={selectedName} />
          {spotRow ? (
            <PlayerSpotlight
              player={spotRow.player}
              selected={selected != null}
              position={rows.indexOf(spotRow) + 1}
              of={rows.length}
              rounds={spotRow.rounds}
              sg={spotRow.sg}
              teamSg={compare === 'team' ? null : teamSg}
              themePhrase={THEME_PHRASE[theme]}
              compareLabel={compareLabel}
              tiles={spotlightTiles(data, allowed, theme, spotRow.player.id)}
              last8={spotRow.last8}
              href={playerHref(spotRow.player.id)}
            />
          ) : null}
        </div>
        <ContributorList
          team={{ sg: teamSg, read: contributorRead(data, allowed, theme, null), rounds: summaries[theme].rounds }}
          rows={rows}
          selectedId={selected}
          onSelect={setPlayerId}
          statLabel={STAT_LABEL[theme]}
          compareLabel={compareLabel}
        />
      </div>
    </div>
  );
}

export function TeamIntelligence({ result, strokes, playerHref, retry, className }: TeamIntelligenceProps) {
  return (
    <section aria-labelledby="team-intel-heading" className={cn('min-w-0 [container-type:inline-size]', className)}>
      <h2 id="team-intel-heading" className="sr-only">
        Team intelligence
      </h2>
      {!result.success ? (
        <InlineNotice tone="danger" title="Couldn't load team intelligence" action={retry}>
          {result.error}
        </InlineNotice>
      ) : result.data.players.length === 0 ? (
        <EmptyState variant="subtle" title="No players on the roster yet" description="Add players to see where the team gains and loses strokes." />
      ) : (
        <Body data={result.data} strokes={strokes} playerHref={playerHref} />
      )}
    </section>
  );
}
