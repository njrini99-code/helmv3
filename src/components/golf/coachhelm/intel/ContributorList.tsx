'use client';

/**
 * "Who's contributing": the whole team, then every player worst to best in
 * the selected theme. Tapping a row filters the cause visual and the
 * spotlight to that player; tapping it again (or the team row) clears it.
 */
import { cn } from '@/lib/utils';
import type { IntelPlayer } from '@/lib/golf/team-intelligence/types';
import { Sparkline } from './Sparkline';
import { SG_TONE_TEXT, formatSg, initials, sgTone } from './shared';
import type { ContributorRead } from './theme-stats';

export interface ContributorRow {
  player: IntelPlayer;
  /** SG as displayed (already relative to the chosen comparison). */
  sg: number | null;
  rounds: number;
  last8: number[];
  read: ContributorRead;
}

export interface ContributorListProps {
  team: { sg: number | null; read: ContributorRead; rounds: number };
  rows: ContributorRow[];
  selectedId: string | null;
  onSelect: (playerId: string | null) => void;
  statLabel: string;
  compareLabel: string;
  className?: string;
}

/** SG colour for a player's trend line: deeper amber the more strokes lost, green when gaining. */
export function sgRing(v: number | null): string {
  if (v == null) return 'var(--fw-color-border-strong)';
  if (v <= -0.8) return 'var(--fw-viz-div-neg)';
  if (v <= -0.4) return 'color-mix(in oklch, var(--fw-viz-div-neg) 70%, var(--fw-color-surface))';
  if (v < -0.05) return 'color-mix(in oklch, var(--fw-viz-div-neg) 42%, var(--fw-color-surface))';
  if (v < 0.05) return 'var(--fw-color-warm-400)';
  return 'var(--fw-viz-div-pos)';
}

export function PlayerAvatar({
  player,
  badge,
  size = 'md',
  dark = false,
}: {
  player: IntelPlayer;
  badge?: string;
  size?: 'md' | 'lg';
  dark?: boolean;
}) {
  const box = size === 'lg' ? 'size-[76px] text-[24px]' : 'size-12 text-body';
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full font-fw-display font-semibold',
        dark ? 'bg-nav-surface text-nav-text' : 'bg-surface-sunken text-text-secondary',
        box,
      )}
    >
      {player.avatarUrl ? (
        <img src={player.avatarUrl} alt="" className="size-full rounded-full object-cover" />
      ) : (
        <span aria-hidden>{initials(player.name)}</span>
      )}
      {badge ? (
        <span
          className="absolute -bottom-1 -right-2 rounded-full border border-border-subtle bg-surface px-1.5 font-fw-sans text-caption font-semibold leading-[18px] text-text-primary"
        >
          {badge}
        </span>
      ) : null}
    </span>
  );
}

function DivergingBar({ value }: { value: number | null }) {
  const v = value ?? 0;
  const neg = v < 0 ? Math.min(1, -v / 1.5) * 66.6 : 0;
  const pos = v > 0 ? Math.min(1, v / 0.75) * 33.4 : 0;
  return (
    <span aria-hidden className="relative block h-1 w-12 rounded-full bg-surface-sunken">
      <span className="absolute -bottom-[3px] -top-[3px] left-[66.6%] w-px bg-border-strong" />
      <span
        className="absolute inset-y-0 rounded-full"
        style={{ right: '33.4%', width: `${neg}%`, background: 'var(--fw-viz-div-neg)' }}
      />
      <span
        className="absolute inset-y-0 left-[66.6%] rounded-full"
        style={{ width: `${pos}%`, background: 'var(--fw-viz-div-pos)' }}
      />
    </span>
  );
}

function Chip({ children, dark }: { children: string; dark?: boolean }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-fw-sm px-1.5 py-0.5 font-fw-sans text-caption',
        dark ? 'bg-nav-surface text-nav-text-dim' : 'bg-surface-sunken text-text-secondary',
      )}
    >
      {children}
    </span>
  );
}

export function ContributorList({ team, rows, selectedId, onSelect, statLabel, compareLabel, className }: ContributorListProps) {
  const teamOn = selectedId == null;
  return (
    <section
      aria-labelledby="intel-contrib-heading"
      className={cn('flex min-w-0 flex-col gap-3 rounded-card border border-border-subtle bg-surface p-3 sm:p-4', className)}
    >
      <div className="flex items-end justify-between gap-3 px-1 pt-1">
        <div className="min-w-0">
          <h3 id="intel-contrib-heading" className="font-fw-display text-h3 font-semibold text-text-primary">
            Who&apos;s contributing
          </h3>
          <p className="font-fw-sans text-caption text-text-tertiary">Worst to best · tap a player to filter</p>
        </div>
        <div className="grid shrink-0 grid-cols-[3.5rem_3.5rem] gap-2 text-right font-fw-sans text-caption text-text-tertiary">
          <span>{statLabel}</span>
          <span>SG</span>
        </div>
      </div>

      {/* eslint-disable-next-line helm/no-raw-button -- a full list row is the toggle, not a <Button> pill */}
      <button
        type="button"
        aria-pressed={teamOn}
        onClick={() => onSelect(null)}
        className={cn(
          'grid min-h-11 grid-cols-[3rem_minmax(0,1fr)_3.5rem_3.5rem] items-center gap-x-3 rounded-fw-md px-3 py-3 text-left transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          teamOn ? 'bg-nav-bg text-nav-text dark:ring-1 dark:ring-accent-500' : 'bg-surface-sunken text-text-primary hover:bg-canvas',
        )}
      >
        <span
          aria-hidden
          className="inline-flex size-11 items-center justify-center rounded-full bg-accent-fill font-fw-sans text-caption font-bold text-text-on-accent-fill"
        >
          All
        </span>
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="font-fw-sans text-body font-semibold">Whole team</span>
          <span className="flex flex-wrap gap-1">
            {team.read.chips.map((c) => (
              <Chip key={c} dark={teamOn}>
                {c}
              </Chip>
            ))}
          </span>
        </span>
        <span className="text-right font-fw-sans text-body font-semibold tabular-nums">{team.read.stat}</span>
        <span
          className={cn(
            'text-right font-fw-sans text-body font-semibold tabular-nums',
            teamOn ? (sgTone(team.sg) === 'loss' ? 'text-fw-warning' : 'text-nav-accent') : SG_TONE_TEXT[sgTone(team.sg)],
          )}
        >
          {formatSg(team.sg)}
        </span>
      </button>

      <ol className="flex flex-col" aria-label={`Players, worst to best, SG ${compareLabel}`}>
        {rows.map((row, i) => {
          const on = row.player.id === selectedId;
          const ring = sgRing(row.sg);
          return (
            <li key={row.player.id} className={cn(i > 0 && !on && 'border-t border-border-subtle')}>
              {/* eslint-disable-next-line helm/no-raw-button -- a full list row is the toggle, not a <Button> pill */}
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(on ? null : row.player.id)}
                className={cn(
                  'grid w-full grid-cols-[1rem_3rem_minmax(0,1fr)_3.5rem_3.5rem] items-center gap-x-3 gap-y-1 rounded-fw-md px-2 py-2.5 text-left transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                  on ? 'bg-surface-sunken' : 'hover:bg-canvas',
                )}
              >
                <span className="row-span-3 text-right font-fw-sans text-caption tabular-nums text-text-tertiary">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-span-3">
                  <PlayerAvatar player={row.player} badge={row.sg == null ? undefined : formatSg(row.sg)} />
                </span>
                <span className="col-start-3 truncate font-fw-sans text-body-sm font-semibold text-text-primary">
                  {row.player.name}
                </span>
                <span className="col-start-4 text-right font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
                  {row.read.stat}
                </span>
                <span
                  className={cn(
                    'col-start-5 text-right font-fw-sans text-body-sm font-semibold tabular-nums',
                    SG_TONE_TEXT[sgTone(row.sg)],
                  )}
                >
                  {formatSg(row.sg)}
                </span>
                <span className="col-span-2 col-start-3 flex min-w-0 flex-wrap gap-1">
                  {row.read.chips.map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </span>
                <span className="col-start-5 flex justify-end">
                  <DivergingBar value={row.sg} />
                </span>
                <span className="col-span-2 col-start-3 h-5">
                  {row.last8.length > 1 ? <Sparkline values={row.last8} color={ring} area={false} /> : null}
                </span>
                <span className="col-start-5 text-right font-fw-sans text-caption text-text-tertiary">
                  {row.rounds} rd{row.rounds === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
