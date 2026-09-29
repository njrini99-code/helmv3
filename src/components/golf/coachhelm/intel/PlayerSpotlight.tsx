'use client';

/**
 * The spotlight: the selected player (or, with none selected, the player
 * losing the most in this theme). Six player-vs-team tiles, each with a rail
 * that places the player (dot) against the team (tick), and the player's
 * last eight rounds against the team line.
 */
import Link from 'next/link';
import { Button } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { IntelPlayer } from '@/lib/golf/team-intelligence/types';
import { PlayerAvatar, sgRing } from './ContributorList';
import { Sparkline } from './Sparkline';
import { SG_TONE_TEXT, formatSg, sgTone } from './shared';
import { LOW_SAMPLE, tileVerdict, type StatTile } from './theme-stats';

export interface PlayerSpotlightProps {
  player: IntelPlayer;
  selected: boolean;
  /** 1 = losing the most in this theme. */
  position: number;
  of: number;
  rounds: number;
  sg: number | null;
  teamSg: number | null;
  themePhrase: string;
  compareLabel: string;
  tiles: StatTile[];
  last8: number[];
  href: string;
  className?: string;
}

function Rail({ tile }: { tile: StatTile }) {
  if (tile.player == null) return <span className="block h-1 rounded-full bg-surface-sunken" aria-hidden />;
  const values = [tile.player, tile.team].filter((v): v is number => v != null);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.45, Math.abs(hi) * 0.15, 0.5);
  lo -= pad;
  hi += pad;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const verdict = tileVerdict(tile);
  const dot =
    verdict === 'worse'
      ? 'var(--fw-viz-div-neg)'
      : verdict === 'better'
        ? 'var(--fw-viz-div-pos)'
        : 'var(--fw-color-warm-700)';
  return (
    <span aria-hidden className="relative my-1 block h-1 rounded-full bg-border-subtle">
      {tile.team != null ? (
        <span className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 bg-text-tertiary" style={{ left: at(tile.team) }} />
      ) : null}
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: at(tile.player), background: dot, boxShadow: '0 0 0 2px var(--fw-color-surface)' }}
      />
    </span>
  );
}

function Tile({ tile }: { tile: StatTile }) {
  const verdict = tileVerdict(tile);
  const thin = verdict === 'thin';
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-fw-md border p-3',
        verdict === 'worse' && 'border-fw-warning-ring bg-fw-warning-bg',
        verdict === 'better' && 'border-border-subtle bg-accent-wash',
        (verdict === 'even' || thin) && 'border-border-subtle bg-surface-sunken',
      )}
    >
      <span className="truncate font-fw-sans text-caption font-medium text-text-secondary">{tile.label}</span>
      <span
        className={cn(
          'font-fw-sans text-h3 font-semibold tabular-nums',
          thin ? 'text-text-tertiary' : verdict === 'worse' ? 'text-fw-warning-text' : 'text-text-primary',
        )}
      >
        {tile.player == null ? '—' : tile.format(tile.player)}
      </span>
      <Rail tile={tile} />
      <span className="truncate font-fw-sans text-caption tabular-nums text-text-tertiary">
        {tile.player == null
          ? 'No data'
          : tile.n < LOW_SAMPLE
            ? `${tile.n} shot${tile.n === 1 ? '' : 's'} · low sample`
            : `Team ${tile.team == null ? '—' : tile.format(tile.team)}`}
      </span>
    </div>
  );
}

export function PlayerSpotlight({
  player,
  selected,
  position,
  of,
  rounds,
  sg,
  teamSg,
  themePhrase,
  compareLabel,
  tiles,
  last8,
  href,
  className,
}: PlayerSpotlightProps) {
  const ring = sgRing(sg);
  const change = last8.length > 1 ? last8[last8.length - 1]! - last8[0]! : null;
  const trend = change == null ? null : change > 0.15 ? 'Improving' : change < -0.15 ? 'Slipping' : 'Flat';
  const worst = tiles
    .filter((t) => tileVerdict(t) === 'worse')
    .map((t) => t.label.toLowerCase());

  return (
    <section
      aria-label={`${player.name}, ${themePhrase}`}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <PlayerAvatar player={player} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-fw-sans text-caption font-medium text-text-tertiary">
            {selected ? 'Selected player' : 'Losing the most here'}
          </span>
          <span className="truncate font-fw-display text-h2 font-semibold leading-tight text-text-primary">{player.name}</span>
          <span className="font-fw-sans text-caption text-text-secondary">
            {rounds} round{rounds === 1 ? '' : 's'} · {position} of {of}, worst first
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className={cn('font-fw-sans text-h2 font-semibold tabular-nums', SG_TONE_TEXT[sgTone(sg)])}>{formatSg(sg)}</span>
          <span className="font-fw-sans text-caption text-text-tertiary">SG / rd {compareLabel}</span>
        </div>
      </div>

      {worst.length ? (
        <div className="flex flex-wrap gap-1.5">
          {worst.slice(0, 3).map((w, i) => (
            <span
              key={w}
              className={cn(
                'rounded-full px-2.5 py-1 font-fw-sans text-caption font-medium',
                i === 0 ? 'bg-nav-bg text-nav-text' : 'bg-surface-sunken text-text-secondary',
              )}
            >
              {i === 0 ? `Worse than team: ${w}` : w}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 [@container(min-width:420px)]:grid-cols-3">
        {tiles.map((t) => (
          <Tile key={t.label} tile={t} />
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-fw-md border border-border-subtle bg-surface-sunken px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-fw-sans text-caption font-semibold text-text-primary">Last 8 rounds · SG {themePhrase}</span>
          {trend ? (
            <span
              className={cn(
                'font-fw-sans text-caption font-semibold tabular-nums',
                trend === 'Improving' ? 'text-accent-ink' : trend === 'Slipping' ? 'text-fw-warning-text' : 'text-text-tertiary',
              )}
            >
              {trend} {formatSg(change)}
            </span>
          ) : null}
        </div>
        <div className="h-16">
          {last8.length ? (
            <Sparkline
              values={last8}
              color={ring}
              reference={teamSg}
              label={`${player.name}'s last ${last8.length} rounds, SG ${themePhrase}: ${last8.map((v) => formatSg(v)).join(', ')}`}
            />
          ) : (
            <p className="font-fw-sans text-caption text-text-tertiary">No rounds with this stat in the slice.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-caption text-text-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: ring }} />
            {player.name.split(' ')[0]}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3" style={{ background: 'var(--fw-color-warm-400)' }} />
            Team
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-3 border-t border-dashed border-border-strong" />
            Zero ({compareLabel.replace(/^vs /, '')})
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button asChild variant="secondary" size="sm">
          <Link href={href}>Open profile</Link>
        </Button>
      </div>
    </section>
  );
}
