'use client';

/**
 * ============================================================================
 * rounds-library-parts — presentational pieces for the coach Rounds Library
 * (docs/design/fairway-facelift/screens/rounds-library.v3.md)
 * ----------------------------------------------------------------------------
 * The verdict line, the stage's readouts column, the ledger row's Leaders and
 * Score bands columns, and the dense rounds table. Bare typography on the
 * canvas outside the stage's own Surface, per LANGUAGE.md — the ledger table
 * is bare too, no Surface of its own (see the spec's "The table" → "Bare on
 * the canvas, no Surface" and this screen's `## Result` notes).
 *
 * The `SectionHead` heading + green-rule primitive is reused verbatim from
 * the coach home build rather than duplicated here, per the spec.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Avatar, Button, RankCell } from '@/components/fairway';
import { SectionHead } from '@/components/fairway/pages/dashboard/coach-home-parts';
import { cleanCourseName } from '@/lib/golf/course-name';
import { formatToPar, getRoundTypeLabel } from './FairwayRoundCard';
import type { BandHistogramBand } from '@/components/fairway/charts/BandHistogram';
import type { RoundLibraryRound } from './FairwayRoundsLibrary';
import { dateParts, formatSignedDecimal, playerName, type PlayerSeasonEntry, type RoundsVerdictPart } from './rounds-library-logic';

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

/* ── Verdict ─────────────────────────────────────────────────────────────── */

/** The masthead's verdict sentence — same slot/typography as `VerdictLine`
 *  (coach-home-parts.tsx), but a name/number renders `font-fw-mono` instead
 *  of as a link: `player.id` doesn't exist on this data yet (see Risks). */
export function RoundsVerdictLine({ parts }: { parts: RoundsVerdictPart[] }) {
  return (
    <p className="max-w-[64ch] font-fw-display text-h3 font-normal leading-snug text-text-secondary md:text-h2 md:font-normal">
      {parts.map((part, i) =>
        part.mono ? (
          <span key={i} className="font-fw-mono tabular-nums text-text-primary">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

/* ── Readouts column (inside the stage) ───────────────────────────────────── */

export interface RoundsReadoutItem {
  key: string;
  label: string;
  value: string | null;
  unit?: string;
  delta?: { text: string; tone: 'good' | 'bad' | 'flat' } | null;
  /** Free caption when there is no delta, e.g. "since Jan 2026" / "12 of 40". */
  caption?: React.ReactNode;
}

export function RoundsReadouts({ items }: { items: RoundsReadoutItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4 md:gap-x-8 xl:flex xl:h-full xl:grid-cols-none xl:flex-col xl:justify-between xl:gap-y-0 xl:divide-y xl:divide-border-subtle">
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 flex-col gap-1 py-2 xl:py-3.5 xl:first:pt-0 xl:last:pb-0">
          <dt className={OVERLINE}>{item.label}</dt>
          <dd className="font-fw-mono text-h2 font-medium leading-none tabular-nums text-text-primary">
            {item.value ?? '—'}
            {item.value != null && item.unit ? <span className="ml-0.5 text-caption font-medium text-text-tertiary">{item.unit}</span> : null}
          </dd>
          <dd className={cn('font-fw-sans text-caption', item.delta?.tone === 'good' && 'font-medium text-accent-700', item.delta?.tone === 'bad' && 'font-medium text-fw-warning-ink', (!item.delta || item.delta.tone === 'flat') && 'text-text-tertiary')}>{item.delta?.text ?? item.caption ?? ' '}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Ledger row: Leaders column ───────────────────────────────────────────── */

export function RoundsLeadersColumn({ leaders, selectedPlayer, onSelectPlayer }: { leaders: ReadonlyArray<readonly [string, PlayerSeasonEntry]>; selectedPlayer: string; onSelectPlayer: (name: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHead title="Leaders" />
      {leaders.length === 0 ? (
        <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">Leaders appear once two players each have two scored rounds.</p>
      ) : (
        <ul className="flex flex-col">
          {leaders.map(([name, entry], i) => {
            const selected = selectedPlayer === name;
            return (
              <li key={name} className="border-t border-border-subtle first:border-t-0">
                <Button variant="ghost" size="sm" fullWidth haptic="none" onClick={() => onSelectPlayer(selected ? 'all' : name)} className={cn('h-auto justify-start rounded-fw-sm px-1 py-2 text-left [&>span]:min-w-0 [&>span]:flex-1', selected && 'bg-surface-hover')}>
                  <span className="flex w-full items-center gap-3">
                    <RankCell rank={i + 1} of={leaders.length} />
                    <Avatar src={entry.avatarUrl} name={name} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">{name}</span>
                    <span className="font-fw-mono text-body-sm tabular-nums text-text-primary">{formatSignedDecimal(entry.avgToPar)}</span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── Ledger row: Score bands column ───────────────────────────────────────── */

function ScoreBandRow({ band, selected, onClick }: { band: BandHistogramBand; selected: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" fullWidth haptic="none" onClick={onClick} className={cn('h-auto justify-start rounded-fw-sm px-1 py-1.5 text-left [&>span]:min-w-0 [&>span]:flex-1', selected && 'bg-surface-hover')}>
      {/* Button (fullWidth) wraps this in a bare, un-styled `<span>{children}</span>`
          (its CHILDREN CONTRACT) that flex-item-sizes to CONTENT, not to the
          button's own full width — so our `w-full` grid below was resolving
          against a ~172px shrink-wrapped span instead of the real row, and
          the 1fr track collapsed to 0px. `[&>span]:flex-1` on Button's own
          className (below) reaches through to that one child and makes it
          actually grow to fill the button. RoundsLeadersColumn's Button
          above has the identical fix applied for the identical reason. */}
      <span className="grid w-full items-center gap-2.5" style={{ gridTemplateColumns: '92px 1fr minmax(60px, max-content)' }}>
        <span className="truncate font-fw-sans text-caption text-text-tertiary">{band.label}</span>
        <span className="relative h-[9px] rounded-full bg-surface-sunken">
          <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 rounded-full', selected ? 'bg-accent-500' : 'bg-accent-300')} style={{ width: `${Math.min(100, Math.max(0, band.pct ?? 0))}%` }} />
        </span>
        <span className="whitespace-nowrap text-right font-fw-mono text-caption tabular-nums text-text-primary">
          {band.n ?? 0} ({band.pct ?? 0}%)
        </span>
      </span>
    </Button>
  );
}

export function RoundsScoreBandsColumn({ bands, selectedBand, onSelectBand }: { bands: ReadonlyArray<BandHistogramBand>; selectedBand: number | null; onSelectBand: (index: number) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHead title="Score bands" />
      {bands.length === 0 ? (
        <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">No scored rounds in this view.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {bands.map((band, i) => (
            <ScoreBandRow key={band.label} band={band} selected={selectedBand === i} onClick={() => onSelectBand(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── The dense rounds table ────────────────────────────────────────────────── */

export interface RoundsTableGroup {
  key: string;
  label: string;
  scoredCount: number;
  spark: number[];
  puttsSpark: number[];
  girSpark: number[];
  avg: number | null;
  best: number | null;
  /**
   * `bestId`/`hasMultiple` exist only for the player branch's pre-facelift
   * `FairwayRoundRow` ("Best" badge, `isBestOfPeriod`); this coach table
   * ignores both (v3 drops the header's avg/best/best-badge — the stage's
   * own readouts own those numbers now, see rounds-library.v3.md "Grouping
   * stays"). Kept on the one shared group shape rather than forked into a
   * second grouping pass — see this screen's `## Result`.
   */
  bestId: string | null;
  hasMultiple: boolean;
  rows: RoundLibraryRound[];
}

const TH = 'py-2 text-left font-fw-sans text-eyebrow font-medium uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'py-2.5 align-middle font-fw-sans text-body-sm text-text-secondary';
const NUM = 'text-right font-fw-mono tabular-nums';
// This `top` resolves against the nearest ancestor that establishes a scroll
// container (any `overflow` other than `visible`/`clip`), not the viewport —
// see rounds-library.v3.md "## Result" for the regression this caused and
// fixed (an `overflow-x-auto` wrapper around this table was silently acting
// as that container instead of the page). Keep this `<table>` free of any
// scrolling ancestor so `top` keeps resolving against the real fixed chrome
// (navbar + tabs bar) the calc() below accounts for.
const STICKY_TD = 'sticky top-[calc(var(--golf-mobile-header-offset)+var(--fw-hub-subnav-offset,0px))] z-10 border-b border-border-subtle bg-surface px-4 py-3';
const GROUP_LABEL = 'whitespace-nowrap font-fw-display text-body-lg font-semibold tracking-[-0.01em] text-text-primary';

function RoundsTableRow({ round, onNavigate }: { round: RoundLibraryRound; onNavigate: (id: string) => void }) {
  const href = `/golf/dashboard/rounds/${round.id}`;
  const { weekday, md } = dateParts(round.round_date);
  const name = playerName(round);
  const toParTone = round.score_to_par === null ? 'text-text-secondary' : round.score_to_par < 0 ? 'text-accent-700' : round.score_to_par > 0 ? 'text-fw-warning-ink' : 'text-text-secondary';
  return (
    <tr onClick={() => onNavigate(round.id)} className="cursor-pointer border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover">
      <td className={cn(TD, 'font-fw-mono tabular-nums text-text-tertiary')}>
        <div className="leading-tight">
          <div className="text-eyebrow uppercase tracking-[0.06em]">{weekday}</div>
          <div>{md}</div>
        </div>
      </td>
      <td className={cn(TD, 'font-medium text-text-primary')}>
        <Link href={href} className="flex min-w-0 items-center gap-2 hover:text-accent-700">
          <Avatar src={round.player?.avatar_url} name={name} size="xs" className="shrink-0" />
          <span className="truncate">{name ?? '—'}</span>
        </Link>
      </td>
      <td className={cn(TD, 'hidden truncate md:table-cell')}>{cleanCourseName(round.course_name) || 'Unknown course'}</td>
      <td className={cn(TD, 'hidden lg:table-cell')}>{getRoundTypeLabel(round.round_type)}</td>
      <td className={cn(TD, NUM, 'text-text-primary')}>{round.total_score ?? '—'}</td>
      <td className={cn(TD, NUM, 'font-medium', toParTone)}>{formatToPar(round.score_to_par)}</td>
      <td className={cn(TD, NUM, 'hidden md:table-cell')}>{round.total_putts ?? '—'}</td>
      <td className={cn(TD, NUM, 'hidden md:table-cell')}>{round.total_gir !== null && round.total_gir_possible ? `${round.total_gir}/${round.total_gir_possible}` : '—'}</td>
    </tr>
  );
}

// COACH ONLY. The player branch keeps its own pre-facelift markup — a
// `Surface`-wrapped `<div>` seam header (avg/best + the Score/Putts/GIR
// `SeamSpark` triple) over `FairwayRoundRow` cards, rendered directly in
// FairwayRoundsLibrary.tsx — per this screen's `## Result`: the ledger stays
// byte-identical for players, this dense `<table>` is v3's coach-only
// replacement for it. Do not add a `userRole` branch back into this
// component; if the two ever need to share more than `RoundsTableGroup`,
// extract a helper instead of reintroducing a role fork here.
export function RoundsTable({ groups, onNavigate }: { groups: ReadonlyArray<RoundsTableGroup>; onNavigate: (id: string) => void }) {
  return (
    // `overflow-x-clip` (not `-auto`): clips without becoming a scroll
    // container in either axis (verified: `overflow-x:clip` does NOT trigger
    // the CSS Overflow spec's visible→auto coupling on the other axis the
    // way `hidden`/`scroll`/`auto` would) — an `-auto` wrapper here once
    // made `position: sticky`'s `top` resolve against this div's own top
    // instead of the viewport, see rounds-library.v3.md "## Result".
    <div className="overflow-x-clip">
      <table data-slot="rounds-table" className="w-full border-separate border-spacing-0">
        <thead>
          <tr className="border-b border-border-strong">
            <th scope="col" className={cn(TH, 'w-16 md:w-20')}>
              Date
            </th>
            <th scope="col" className={TH}>
              Player
            </th>
            <th scope="col" className={cn(TH, 'hidden md:table-cell')}>
              Course
            </th>
            <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>
              Type
            </th>
            <th scope="col" className={cn(TH, NUM)}>
              Score
            </th>
            <th scope="col" className={cn(TH, NUM, 'w-14')}>
              To par
            </th>
            <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>
              Putts
            </th>
            <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>
              GIR
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <React.Fragment key={group.key}>
              <tr>
                <td colSpan={8} className={STICKY_TD}>
                  {/* v3 drops avg/best (and any spark) from this header on
                      purpose — the stage's own Avg/Best readouts already own
                      those two numbers at the scope level; printing them a
                      third time here is the "one instrument owns a number"
                      violation this spec elsewhere exists to prevent. See
                      rounds-library.v3.md "Grouping stays". */}
                  <div className="flex items-baseline gap-3">
                    <h3 className={GROUP_LABEL}>{group.label}</h3>
                    <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                      {group.scoredCount} round{group.scoredCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </td>
              </tr>
              {group.rows.map((round) => (
                <RoundsTableRow key={round.id} round={round} onNavigate={onNavigate} />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
