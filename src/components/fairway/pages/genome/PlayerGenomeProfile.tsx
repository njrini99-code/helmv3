/**
 * The player's own Genome (ProfileDrill → Genome tab).
 *
 * Replaces the radar + score tiles. The player sees their shape in words: the
 * course-profile sentence as the verdict, what stands out (strengths and
 * watch-outs as hairline rows, not chips), then every dimension ranked with a
 * neutral bar. No composite and no 0–100 numbers: those were radar-normalised
 * scores with no baseline behind them, so they read as grades they are not.
 *
 * Takes ProfileDrill's existing props unchanged. Server-safe (no hooks).
 */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { readWord } from './strand-model';

export interface PlayerGenomeDimension {
  id: string;
  label: string;
  /** Radar-normalised 0–100, or null when locked. Drawn, never printed. */
  score: number | null;
  qualitative: string | null;
}

export interface PlayerGenomeEntry {
  id: string;
  label: string;
  qualitative: string | null;
}

export interface PlayerGenomeProfileProps {
  dimensions: readonly PlayerGenomeDimension[];
  strengths: readonly PlayerGenomeEntry[];
  watchouts: readonly PlayerGenomeEntry[];
  courseProfile: string | null;
  roundsBasis: number | null;
  /** Rounds needed before the genome computes. */
  roundFloor: number;
}

export function PlayerGenomeProfile({
  dimensions,
  strengths,
  watchouts,
  courseProfile,
  roundsBasis,
  roundFloor,
}: PlayerGenomeProfileProps) {
  const live = dimensions
    .filter((d): d is PlayerGenomeDimension & { score: number } => d.score != null && Number.isFinite(d.score))
    .sort((a, b) => b.score - a.score);
  const locked = dimensions.filter((d) => d.score == null || !Number.isFinite(d.score));

  if (live.length === 0) {
    const have = roundsBasis ?? 0;
    return (
      <section aria-labelledby="player-genome-empty" data-slot="player-genome" className="flex flex-col gap-3">
        <h2 id="player-genome-empty" className="font-fw-sans text-h3 text-text-primary">
          Your genome starts with logged rounds
        </h2>
        <p className="max-w-[52ch] font-fw-sans text-body text-text-secondary">
          It reads how you play once you have {roundFloor} completed rounds in the last 90 days.
          You have <span className="tabular-nums">{have}</span>. Nothing here is estimated until then.
        </p>
        <div aria-hidden className="mt-1 h-1.5 w-full max-w-[320px] overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-accent-600"
            style={{ width: `${Math.min(100, Math.round((have / Math.max(1, roundFloor)) * 100))}%` }}
          />
        </div>
        <Link
          href="/golf/dashboard/rounds/new"
          className="mt-2 inline-flex h-11 w-fit items-center justify-center rounded-fw-md bg-accent-fill px-5 font-fw-sans text-body font-semibold text-text-on-accent-fill transition-[background-color,transform] duration-150 active:scale-[0.97] active:bg-accent-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2"
        >
          Log a round
        </Link>
      </section>
    );
  }

  return (
    <div data-slot="player-genome" className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h2 className="font-fw-sans text-h3 text-text-primary">Your genome</h2>
        {courseProfile ? (
          <p className="max-w-[60ch] font-fw-sans text-body-lg text-text-primary">{courseProfile}</p>
        ) : null}
        <p className="font-fw-sans text-caption tabular-nums text-text-tertiary">
          Last 90 days
          {roundsBasis != null ? ` · ${roundsBasis} ${roundsBasis === 1 ? 'round' : 'rounds'} · ${readWord(roundsBasis)}` : ''}
        </p>
      </header>

      {strengths.length > 0 || watchouts.length > 0 ? (
        <section aria-labelledby="player-genome-standout" className="flex flex-col gap-3">
          <h3 id="player-genome-standout" className="font-fw-sans text-body font-semibold text-text-primary">
            What stands out
          </h3>
          <ul className="border-t border-border-strong">
            {strengths.map((s) => (
              <StandoutRow key={`s-${s.id}`} entry={s} tone="ahead" />
            ))}
            {watchouts.map((w) => (
              <StandoutRow key={`w-${w.id}`} entry={w} tone="behind" />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="player-genome-all" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="player-genome-all" className="font-fw-sans text-body font-semibold text-text-primary">
            How you play, strongest first
          </h3>
          <p className="font-fw-sans text-caption text-text-tertiary">Bar length is the strength of the read</p>
        </div>
        <ol className="border-t border-border-strong">
          {live.map((d) => (
            <li
              key={d.id}
              className="grid min-h-12 grid-cols-[minmax(0,1fr)_minmax(72px,34%)] items-center gap-4 border-b border-border-subtle py-2.5"
            >
              <span className="min-w-0">
                <span className="block font-fw-sans text-body text-text-primary">{d.label}</span>
                {d.qualitative ? (
                  <span className="block font-fw-sans text-caption text-text-tertiary">{d.qualitative}</span>
                ) : null}
              </span>
              <span aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className="block h-full rounded-full bg-text-secondary"
                  style={{ width: `${Math.max(4, Math.min(100, d.score))}%` }}
                />
              </span>
            </li>
          ))}
        </ol>
        {locked.length > 0 ? (
          <p className="font-fw-sans text-caption text-text-tertiary">
            Needs more rounds: {locked.map((d) => d.label).join(', ')}.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function StandoutRow({ entry, tone }: { entry: PlayerGenomeEntry; tone: 'ahead' | 'behind' }) {
  return (
    <li className="flex min-h-12 items-center gap-3 border-b border-border-subtle py-2.5">
      <span
        aria-hidden
        className={cn('h-2 w-2 shrink-0 rounded-full', tone === 'ahead' ? 'bg-accent-600' : 'bg-fw-warning')}
      />
      <span className="min-w-0 flex-1 font-fw-sans text-body text-text-primary">{entry.label}</span>
      <span className="shrink-0 font-fw-sans text-body-sm text-text-secondary">
        <span className="sr-only">{tone === 'ahead' ? 'Strength: ' : 'Watch-out: '}</span>
        {entry.qualitative ?? (tone === 'ahead' ? 'Strength' : 'Watch-out')}
      </span>
    </li>
  );
}
