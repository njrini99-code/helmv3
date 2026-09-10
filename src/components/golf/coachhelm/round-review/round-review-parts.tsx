'use client';

/**
 * ============================================================================
 * Round review parts (round-review.v3.md) — the typeset regions around the
 * stage: the verdict, the readouts column, the three ledger columns and the
 * hole-by-hole table.
 * ----------------------------------------------------------------------------
 * Bare type on the canvas, ruled with hairlines. The only `Surface` on the
 * page is the stage itself, composed in `RoundReviewFieldSheet`; nothing in
 * here draws a box of its own.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { MicroBar } from '@/components/fairway/modules';
import { PressTarget } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { formatToPar } from '@/lib/golf/format-to-par';
import { synthesizeHoleNote } from './buildReviewViewModel';
import type { LeakRow, Readout, VerdictPart } from './round-shape';
import { humanizeClub, missSide } from './round-shape';
import type { HoleBreakdown } from '@/app/golf/actions/round-review-system';

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

/* ── The verdict ─────────────────────────────────────────────────────────── */

export function VerdictLine({ parts }: { parts: VerdictPart[] }) {
  return (
    <p
      data-slot="verdict"
      className="max-w-[64ch] font-fw-display text-h3 font-normal leading-snug text-text-secondary md:text-h2 md:font-normal"
    >
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

/* ── A ledger column's head: title over the green ruling ─────────────────── */

export function LedgerHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">{title}</h2>
        {note ? <span className={cn(OVERLINE, 'shrink-0')}>{note}</span> : null}
      </div>
      <div aria-hidden="true" className="h-px w-full bg-accent-300" />
    </div>
  );
}

/* ── The stage's readouts column ─────────────────────────────────────────── */

export function StageReadouts({ items }: { items: Readout[] }) {
  return (
    <dl
      data-slot="stage-readouts"
      className="grid grid-cols-2 gap-x-6 lg:flex lg:h-full lg:flex-col lg:justify-between lg:divide-y lg:divide-border-subtle"
    >
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 flex-col gap-1 py-2 lg:py-3.5 lg:first:pt-0 lg:last:pb-0">
          <dt className={OVERLINE}>{item.label}</dt>
          <dd className="flex items-baseline gap-2">
            <span className="font-fw-mono text-h2 font-medium leading-none tabular-nums text-text-primary">
              {item.value ?? '–'}
            </span>
            {item.caption ? (
              <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">{item.caption}</span>
            ) : null}
          </dd>
          <dd
            className={cn(
              'font-fw-sans text-caption',
              item.delta?.tone === 'good' && 'font-medium text-accent-700',
              item.delta?.tone === 'bad' && 'font-medium text-fw-warning-ink',
              (!item.delta || item.delta.tone === 'flat') && 'text-text-tertiary',
            )}
          >
            {item.delta?.text ?? (item.value == null ? 'not logged' : ' ')}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Ledger column 2: where it went ──────────────────────────────────────── */

export function LeakLedger({ rows, empty }: { rows: LeakRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="font-fw-sans text-body-sm text-text-tertiary">{empty}</p>;
  }
  const domain = rows[0]!.strokes;
  return (
    <ul data-slot="leak-ledger" className="flex flex-col">
      <li className="flex items-baseline gap-3 pb-1">
        <span className={cn(OVERLINE, 'min-w-0 flex-1')}>Category</span>
        <span className={cn(OVERLINE, 'w-16 shrink-0 text-right')}>Strokes</span>
      </li>
      {rows.map((row) => (
        <li key={row.category} className="flex flex-col gap-1 border-t border-border-subtle py-2.5">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
              {row.category}
            </span>
            <MicroBar
              value={row.strokes}
              domain={domain}
              goodDirection="low"
              width={72}
              height={6}
              label={`${row.strokes.toFixed(1)} strokes to gain in ${row.category.toLowerCase()}`}
            />
            <span className="w-10 shrink-0 text-right font-fw-mono text-body-sm font-medium tabular-nums text-fw-warning-ink">
              {row.strokes.toFixed(1)}
            </span>
          </div>
          {row.description ? (
            <p className="font-fw-sans text-caption text-text-tertiary">{row.description}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ── Ledger column 3: against the field ──────────────────────────────────── */

export function FieldLedger({
  rows,
  fallback,
}: {
  rows: Array<{ id: string; node: ReactNode }>;
  fallback: string;
}) {
  if (rows.length === 0) {
    return <p className="font-fw-sans text-body-sm text-text-tertiary">{fallback}</p>;
  }
  return (
    <div data-slot="field-ledger" className="flex flex-col divide-y divide-border-subtle">
      {rows.map((row) => (
        <div key={row.id} className="py-3 first:pt-0 last:pb-0">
          {row.node}
        </div>
      ))}
    </div>
  );
}

/* ── The table ───────────────────────────────────────────────────────────── */

const TH = 'py-2 text-left font-fw-sans text-eyebrow font-medium uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'py-2 align-middle font-fw-sans text-body-sm text-text-secondary';
const NUM = 'pr-3 text-right font-fw-mono tabular-nums';

function fairwayCell(hole: HoleBreakdown): string {
  if (hole.fairwayHit === null) return '–';
  if (hole.fairwayHit) return 'Hit';
  const side = missSide(hole.driveMiss);
  return side === 'left' ? 'Miss L' : side === 'right' ? 'Miss R' : 'Miss';
}

function clubDistance(club: string | null, distance: number | null): string {
  const label = humanizeClub(club);
  if (label && distance != null) return `${label} ${Math.round(distance)}`;
  if (label) return label;
  if (distance != null) return `${Math.round(distance)}`;
  return '–';
}

export function HoleTable({
  holes,
  selectedHole,
  onSelect,
}: {
  holes: HoleBreakdown[];
  selectedHole: number | null;
  onSelect: (hole: number) => void;
}) {
  return (
    <div className="overflow-x-clip">
      <table data-slot="hole-ledger" className="w-full border-collapse">
        <caption className="sr-only">Hole by hole for this round</caption>
        <thead>
          <tr className="border-b border-border-strong">
            <th scope="col" className={cn(TH, 'w-12')}>Hole</th>
            <th scope="col" className={cn(TH, NUM, 'hidden w-12 md:table-cell')}>Par</th>
            <th scope="col" className={cn(TH, NUM, 'w-14')}>Score</th>
            <th scope="col" className={cn(TH, NUM, 'w-16')}>To par</th>
            <th scope="col" className={cn(TH, NUM, 'w-14')}>Putts</th>
            <th scope="col" className={cn(TH, 'hidden w-20 md:table-cell')}>Fairway</th>
            <th scope="col" className={cn(TH, 'hidden w-14 md:table-cell')}>GIR</th>
            <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Drive</th>
            <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Approach</th>
            <th scope="col" className={cn(TH, 'hidden md:table-cell')}>Note</th>
          </tr>
        </thead>
        <tbody>
          {holes.map((hole) => {
            const selected = selectedHole === hole.hole;
            const toParTone =
              hole.scoreToPar < 0 ? 'text-accent-700' : hole.scoreToPar > 0 ? 'text-fw-warning-ink' : 'text-text-secondary';
            return (
              <tr
                key={hole.hole}
                onClick={() => onSelect(hole.hole)}
                aria-selected={selected}
                className={cn(
                  'cursor-pointer border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover',
                  selected && 'bg-surface-hover',
                )}
              >
                <td className={cn(TD, 'p-0')}>
                  <PressTarget
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(hole.hole);
                    }}
                    aria-label={`Hole ${hole.hole}, par ${hole.par}, scored ${hole.score}`}
                    aria-pressed={selected}
                    className="flex h-11 w-full items-center rounded-fw-sm font-fw-mono text-body-sm font-medium tabular-nums text-text-primary"
                  >
                    {hole.hole}
                  </PressTarget>
                </td>
                <td className={cn(TD, NUM, 'hidden md:table-cell')}>{hole.par}</td>
                <td className={cn(TD, NUM, 'font-medium text-text-primary')}>{hole.score}</td>
                <td className={cn(TD, NUM, 'font-medium', toParTone)}>{formatToPar(hole.scoreToPar)}</td>
                <td className={cn(TD, NUM)}>{hole.putts > 0 ? hole.putts : '–'}</td>
                <td className={cn(TD, 'hidden md:table-cell')}>{fairwayCell(hole)}</td>
                <td className={cn(TD, 'hidden md:table-cell')}>{hole.gir ? 'Yes' : 'No'}</td>
                <td className={cn(TD, 'hidden lg:table-cell')}>{clubDistance(hole.driveClub, hole.driveDist)}</td>
                <td className={cn(TD, 'hidden lg:table-cell')}>{clubDistance(hole.approachClub, hole.approachDist)}</td>
                <td className={cn(TD, 'hidden truncate md:table-cell')}>{synthesizeHoleNote(hole) ?? '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
