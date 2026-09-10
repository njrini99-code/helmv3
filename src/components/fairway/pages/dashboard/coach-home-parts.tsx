'use client';

/**
 * Coach home parts (LANGUAGE.md): the verdict line, the stage's readouts
 * column, the attention ledger and the recent rounds table. Bare typography
 * on the canvas; the only Surface on the page is the stage in
 * FairwayCoachDashboard.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkline, InlineNotice } from '@/components/fairway';
import type { GoodDirection } from '@/components/fairway/charts/TrendChip';
import type { SeriesTrend } from '@/components/fairway/charts/seriesTrend';
import { IconArrowRight } from '@/components/icons';
import { cn } from '@/lib/utils';
import { formatToPar } from '@/lib/golf/format-to-par';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
import type { CoachDashboardPayload } from '@/app/golf/actions/dashboard-data';
import { shortDay, titleCase, type PlayerRollup, type VerdictPart } from './coach-home-logic';

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

/* ── Verdict ─────────────────────────────────────────────────────────────── */

export function VerdictLine({ parts }: { parts: VerdictPart[] }) {
  return (
    <p data-slot="verdict" className="max-w-[64ch] font-fw-display text-h3 font-normal leading-snug text-text-secondary md:text-h2 md:font-normal">
      {parts.map((part, i) =>
        part.href ? (
          <Link
            key={i}
            href={part.href}
            className="text-text-primary underline decoration-accent-300 decoration-[1.5px] underline-offset-[5px] transition-colors hover:decoration-accent-500"
          >
            {part.text}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

/* ── Section head: title, count, link, green ruling ───────────────────────── */

export function SectionHead({
  title,
  count,
  action,
  className,
}: {
  title: string;
  count?: number | null;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">{title}</h2>
          {count != null ? <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">{count}</span> : null}
        </div>
        {action ? (
          <Link href={action.href} className="-my-3 inline-flex items-center gap-1 py-3 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600">
            {action.label}
            <IconArrowRight size={14} />
          </Link>
        ) : null}
      </div>
      <div aria-hidden="true" className="h-px w-full bg-accent-300" />
    </div>
  );
}

/* ── Readouts column (inside the stage) ───────────────────────────────────── */

export interface ReadoutItem {
  key: string;
  label: string;
  value: string | null;
  unit?: string;
  series?: ReadonlyArray<number>;
  goodDirection?: GoodDirection;
  delta?: SeriesTrend | null;
  /** Free caption when there is no series delta, e.g. "0 this week". */
  note?: string;
}

function deltaText(item: ReadoutItem): { text: string; tone: 'good' | 'bad' | 'flat' } | null {
  if (!item.delta) return null;
  const magnitude = Math.abs(item.delta.value).toFixed(1);
  const span = `last ${item.delta.points} rounds`;
  const unit = item.unit === '%' ? ' pts' : item.unit ?? '';
  if (item.delta.direction === 'improving') return { text: `▲ ${magnitude}${unit} ${span}`, tone: 'good' };
  if (item.delta.direction === 'declining') return { text: `▼ ${magnitude}${unit} ${span}`, tone: 'bad' };
  return { text: `flat over the ${span}`, tone: 'flat' };
}

export function FieldReadouts({ items }: { items: ReadoutItem[] }) {
  return (
    <dl data-slot="field-readouts" className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4 md:gap-x-8 xl:flex xl:h-full xl:grid-cols-none xl:flex-col xl:justify-between xl:gap-y-0 xl:divide-y xl:divide-border-subtle">
      {items.map((item) => {
        const delta = deltaText(item);
        return (
          <div key={item.key} className="flex min-w-0 flex-col gap-1 py-2 xl:py-3.5 xl:first:pt-0 xl:last:pb-0">
            <dt className={OVERLINE}>{item.label}</dt>
            <dd className="flex items-end justify-between gap-3">
              <span className="font-fw-mono text-h2 font-medium leading-none tabular-nums text-text-primary">
                {item.value ?? '–'}
                {item.value != null && item.unit ? <span className="ml-0.5 text-caption font-medium text-text-tertiary">{item.unit}</span> : null}
              </span>
              {item.series && item.series.length >= 2 ? (
                <Sparkline data={item.series} goodDirection={item.goodDirection} width={64} height={20} label={`${item.label} recent rounds`} />
              ) : null}
            </dd>
            <dd
              className={cn(
                'font-fw-sans text-caption',
                delta?.tone === 'good' && 'font-medium text-accent-700',
                delta?.tone === 'bad' && 'font-medium text-fw-warning-ink',
                (!delta || delta.tone === 'flat') && 'text-text-tertiary',
              )}
            >
              {delta?.text ?? item.note ?? ' '}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/* ── Attention ledger ─────────────────────────────────────────────────────── */

function TrendCell({ trend }: { trend: PlayerRollup['trend'] }) {
  if (!trend) return <span className="font-fw-sans text-caption text-text-tertiary">no read</span>;
  const magnitude = Math.abs(trend.delta).toFixed(1);
  if (trend.direction === 'improving') {
    return <span className="font-fw-mono text-caption font-medium tabular-nums text-accent-700">▲ {magnitude}</span>;
  }
  if (trend.direction === 'declining') {
    return <span className="font-fw-mono text-caption font-medium tabular-nums text-fw-warning-ink">▼ {magnitude}</span>;
  }
  return <span className="font-fw-sans text-caption text-text-tertiary">flat</span>;
}

export function AttentionLedger({
  pulse,
  rows,
  unavailable,
}: {
  pulse?: CoachDashboardPayload['teamPulse'] | null;
  rows: PlayerRollup[];
  unavailable: boolean;
}) {
  const improving = pulse?.improving ?? 0;
  const stable = pulse?.stable ?? 0;
  const declining = pulse?.declining ?? 0;
  const tracked = improving + stable + declining;
  const segments = [
    { key: 'improving', label: 'improving', value: improving, className: 'bg-accent-500' },
    { key: 'stable', label: 'flat', value: stable, className: 'bg-warm-300' },
    { key: 'declining', label: 'sliding', value: declining, className: 'bg-fw-warning' },
  ];
  return (
    <section aria-label="Who needs attention" className="flex flex-col gap-3">
      <SectionHead title="Attention" count={declining > 0 ? declining : undefined} action={{ label: 'Roster', href: '/golf/dashboard/roster' }} />
      {unavailable ? (
        <InlineNotice tone="warning" title="Couldn’t load team trends">
          Something went wrong reading this team’s rounds. Refresh to try again.
        </InlineNotice>
      ) : tracked === 0 ? (
        <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
          Trends appear once players have five rounds to compare against five before.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div aria-hidden="true" className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-surface-sunken">
              {segments.filter((s) => s.value > 0).map((s) => (
                <span key={s.key} className={cn('block h-full', s.className)} style={{ width: `${(s.value / tracked) * 100}%` }} />
              ))}
            </div>
            <p className="flex flex-wrap gap-x-3 font-fw-sans text-caption text-text-secondary">
              {segments.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn('inline-block h-1.5 w-1.5 rounded-full', s.className)} />
                  <span className="font-fw-mono tabular-nums text-text-primary">{s.value}</span> {s.label}
                </span>
              ))}
            </p>
          </div>
          <ul className="flex flex-col">
            <li className="flex items-baseline gap-3 pb-1">
              <span className={cn(OVERLINE, 'min-w-0 flex-1')}>Player</span>
              <span className={cn(OVERLINE, 'shrink-0')}>Last</span>
              <span className={cn(OVERLINE, 'w-12 shrink-0 text-right')}>Trend</span>
            </li>
            {rows.map((row) => (
              <li key={row.id} className="flex items-baseline gap-3 border-t border-border-subtle py-2 first:border-t-0">
                <Link href={row.href ?? `/golf/dashboard/roster/${row.id}`} className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700">
                  {row.name}
                </Link>
                <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">
                  {row.lastDate ? shortDay(row.lastDate) : 'no rounds'}
                </span>
                <span className="w-12 shrink-0 text-right"><TrendCell trend={row.trend} /></span>
              </li>
            ))}
          </ul>
          {pulse?.topMover ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              Top mover: <span className="text-text-primary">{pulse.topMover.name}</span>, {pulse.topMover.delta.toFixed(1)} strokes better.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ── Recent rounds table ──────────────────────────────────────────────────── */

const ROUND_TYPE_LABEL: Record<string, string> = {
  qualifier: 'Qualifier',
  tournament: 'Tournament',
  practice: 'Practice',
  casual: 'Casual',
};

function roundTypeLabel(type: string | null): string {
  if (!type) return '';
  return ROUND_TYPE_LABEL[type.toLowerCase()] ?? titleCase(type.replace(/_/g, ' '));
}

const TH = 'py-2 text-left font-fw-sans text-eyebrow font-medium uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'py-2.5 align-middle font-fw-sans text-body-sm text-text-secondary';
const NUM = 'text-right font-fw-mono tabular-nums';

export function RoundsLedgerTable({ rounds }: { rounds: CoachDashboardData['recentRounds'] }) {
  const router = useRouter();
  return (
    <div className="overflow-x-clip">
      <table data-slot="rounds-ledger" className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-strong">
            <th scope="col" className={cn(TH, 'w-16 md:w-20')}>Date</th>
            <th scope="col" className={TH}>Player</th>
            <th scope="col" className={cn(TH, 'hidden md:table-cell')}>Course</th>
            <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Type</th>
            <th scope="col" className={cn(TH, NUM)}>Score</th>
            <th scope="col" className={cn(TH, NUM, 'w-14')}>To par</th>
            <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>Putts</th>
            <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>GIR</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => {
            const href = `/golf/dashboard/rounds/${r.id}`;
            const toParTone = r.total_to_par < 0 ? 'text-accent-700' : r.total_to_par > 0 ? 'text-fw-warning-ink' : 'text-text-secondary';
            return (
              <tr
                key={r.id}
                onClick={() => router.push(href)}
                className="cursor-pointer border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover"
              >
                <td className={cn(TD, 'font-fw-mono tabular-nums text-text-tertiary')}>{shortDay(r.round_date)}</td>
                <td className={cn(TD, 'font-medium text-text-primary')}>
                  <Link href={href} className="hover:text-accent-700">{r.player_name}</Link>
                </td>
                <td className={cn(TD, 'hidden truncate md:table-cell')}>{titleCase(r.course_name)}</td>
                <td className={cn(TD, 'hidden lg:table-cell')}>{roundTypeLabel(r.round_type)}</td>
                <td className={cn(TD, NUM, 'font-medium text-text-primary')}>{r.total_score}</td>
                <td className={cn(TD, NUM, 'font-medium', toParTone)}>{formatToPar(r.total_to_par)}</td>
                <td className={cn(TD, NUM, 'hidden md:table-cell')}>{r.total_putts ?? '–'}</td>
                <td className={cn(TD, NUM, 'hidden md:table-cell')}>
                  {r.total_gir != null && r.total_gir_possible ? `${r.total_gir}/${r.total_gir_possible}` : '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
