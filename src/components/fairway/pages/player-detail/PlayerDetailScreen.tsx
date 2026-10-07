'use client';

/**
 * ============================================================================
 * Player detail: coach /golf/dashboard/roster/[id]
 * ----------------------------------------------------------------------------
 * The hub a coach opens from the roster. Top to bottom:
 *
 *   1. Masthead: avatar (initials on a tint when there is no photo), name,
 *      class year, "Last round Aug 2 · 74 (+2)", one primary (Message) and a
 *      context menu for everything else.
 *   2. Verdict: one sentence.
 *   3. Stage: the round strip (every countable round on a to-par axis) with a
 *      Last 5 / Last 10 / Season switch.
 *   4. Key stats: a hairline ledger for the same window, each with its sample.
 *   5. Entry rows to Scouting, Fingerprint and Genome with live previews.
 *   6. Focus areas and goals.
 *
 * Identity renders immediately; everything that needs the rounds streams in
 * from one server-side parallel batch (`detail` is a promise created in
 * page.tsx and read here with `use`). No client fetch on load.
 * ========================================================================== */

import * as React from 'react';
import { Suspense, use, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/fairway/controls/avatar';
import { Button } from '@/components/fairway/controls/button';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { IconChevronLeft, IconChevronRight, IconMessage } from '@/components/icons';
import { PlayerActionsMenu } from './PlayerActionsMenu';
import { RoundStrip } from './RoundStrip';
import { RoundSummarySheet } from './RoundSummarySheet';
import { MiniStrand, MiniWaterfall } from './MiniPreviews';
import { PlayerDetailBodySkeleton } from './PlayerDetailSkeleton';
import { formatSigned, formatRoundToPar } from './buildPlayerDetailModel';
import type { LedgerStat, PlanItem, PlayerDetailModel, PlayerIdentity, RoundPoint, ScopeKey } from './types';

// The full stats surface (leak maps, drills, standings) stays reachable, but
// it is only mounted, and only fetches, when the coach asks for it.
const StatsSpineStage = dynamic(
  () => import('@/components/golf/stats/spine-stage/StatsSpineStage').then((m) => m.StatsSpineStage),
  { ssr: false, loading: () => <Skeleton className="h-[480px] rounded-fw-lg" /> },
);

export interface PlayerDetailScreenProps {
  player: PlayerIdentity;
  detail: Promise<PlayerDetailModel>;
}

const ROW_PRESS = 'transition-colors duration-150 active:bg-surface-sunken [@media(hover:hover)]:hover:bg-surface-sunken/60';
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-600';

export function PlayerDetailScreen({ player, detail }: PlayerDetailScreenProps) {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-2 md:px-8 md:pt-6">
      <Link
        href="/golf/dashboard/roster"
        className={cn(
          '-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-fw-sm pl-1 pr-2 font-fw-sans text-body text-accent-700',
          ROW_PRESS,
          FOCUS,
        )}
      >
        <IconChevronLeft size={20} />
        Roster
      </Link>

      <header className="mt-2">
        <div className="flex items-start justify-between gap-3">
          <Avatar
            src={player.avatarUrl}
            name={player.fullName}
            size="xl"
            tone="accent"
            decorative
            className="h-16 w-16 text-h3 md:h-20 md:w-20 md:text-h2"
          />
          <div className="flex items-center gap-1">
            <Suspense fallback={<Skeleton className="h-11 w-[116px] rounded-full" />}>
              <PrimaryAction player={player} detail={detail} />
            </Suspense>
            <PlayerActionsMenu player={player} />
          </div>
        </div>

        <h1 className="mt-4 break-words font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary md:text-display">
          {player.fullName}
        </h1>
        <p className="mt-1 font-fw-sans text-body text-text-secondary">
          {[
            player.graduationYear ? `Class of ${player.graduationYear}` : null,
            player.membershipStatus === 'inactive' ? 'Inactive' : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Class year not set'}
        </p>
        <Suspense fallback={<Skeleton className="mt-1 h-5 w-52" />}>
          <StatusLine detail={detail} />
        </Suspense>
      </header>

      <Suspense fallback={<PlayerDetailBodySkeleton />}>
        <Body player={player} detail={detail} />
      </Suspense>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function PrimaryAction({ player, detail }: PlayerDetailScreenProps) {
  const model = use(detail);
  // A 0-round player gets their one action from the empty state instead.
  if (model.roundsState === 'empty') return null;
  return (
    <Button asChild variant="primary" size="md" leftIcon={<IconMessage size={17} />} className="min-h-11 rounded-full">
      <Link href={`/golf/dashboard/messages?player=${player.id}`}>Message</Link>
    </Button>
  );
}

function StatusLine({ detail }: { detail: Promise<PlayerDetailModel> }) {
  const model = use(detail);
  if (!model.statusLine && !model.statusNote) return null;
  return (
    <p className="mt-0.5 font-fw-sans text-body tabular-nums text-text-secondary">
      {model.statusLine}
      {model.statusNote ? (
        <span className="text-text-tertiary">
          {model.statusLine ? ' · ' : ''}
          {model.statusNote}
        </span>
      ) : null}
    </p>
  );
}

/* ------------------------------------------------------------------------ */

function Body({ player, detail }: PlayerDetailScreenProps) {
  const model = use(detail);
  const [scope, setScope] = useState<ScopeKey>(model.defaultScope);
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  const roundById = useMemo(() => new Map(model.allRounds.map((r) => [r.id, r])), [model.allRounds]);
  const view = model.scopes.find((s) => s.key === scope) ?? model.scopes[0];
  const hasCountable = model.allRounds.length > 0;

  return (
    <>
      {model.verdict ? (
        <p className="mt-5 max-w-[60ch] font-fw-sans text-body-lg text-text-primary">{model.verdict}</p>
      ) : null}

      {model.roundsState === 'unavailable' ? (
        <InlineNotice tone="warning" title="Couldn't load rounds" className="mt-8">
          Scores, the round strip and key stats need the round history. Reload to try again.
        </InlineNotice>
      ) : model.roundsState === 'empty' ? (
        <EmptyState
          variant="subtle"
          icon={null}
          className="mt-8"
          title="No rounds yet"
          description={`Nudge ${player.firstName} to log their first round.`}
          action={
            <Button asChild variant="primary" leftIcon={<IconMessage size={17} />}>
              <Link href={`/golf/dashboard/messages?player=${player.id}`}>Message {player.firstName}</Link>
            </Button>
          }
        />
      ) : !hasCountable ? (
        <EmptyState
          variant="subtle"
          icon={null}
          className="mt-8"
          title="No countable rounds yet"
          description={`${model.completedRounds} completed ${model.completedRounds === 1 ? 'round is' : 'rounds are'} partial or implausible, so ${model.completedRounds === 1 ? 'it is' : 'they are'} left out of every number.`}
        />
      ) : view ? (
        <div className="mt-8 md:grid md:grid-cols-12 md:gap-x-10">
          {/* Stage */}
          <Surface elevation="border" padding="none" className="px-4 pb-4 pt-3 md:col-span-7 md:px-5 md:pb-5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 className="font-fw-sans text-body-lg font-semibold text-text-primary">Scores to par</h2>
              <Segmented
                aria-label="Window"
                size="sm"
                value={scope}
                onValueChange={(v) => setScope(v)}
                options={model.scopes.map((s) => ({ value: s.key, label: s.label }))}
              />
            </div>
            {view.rounds.length > 0 ? (
              <RoundStrip className="mt-3" rounds={view.rounds} onSelect={setOpenRoundId} />
            ) : (
              <p className="mt-6 pb-4 font-fw-sans text-body text-text-secondary">
                No 18-hole rounds in the {view.windowLabel.toLowerCase()} yet.
              </p>
            )}
            <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
              {view.windowLabel} · 18 holes
              {view.nineHoleRounds > 0
                ? ` · ${view.nineHoleRounds} nine-hole ${view.nineHoleRounds === 1 ? 'round' : 'rounds'} not plotted`
                : ''}
              {model.excludedRounds > 0
                ? ` · ${model.excludedRounds} ${model.excludedRounds === 1 ? 'round' : 'rounds'} left out as partial or implausible`
                : ''}
            </p>
            <RoundTable rounds={view.rounds} />
          </Surface>

          {/* Key stats */}
          <section aria-labelledby="pd-stats" className="mt-10 md:col-span-5 md:mt-0">
            <SectionHead id="pd-stats" title="Key stats" meta={view.windowLabel} />
            <dl>
              {view.ledger.map((s) => (
                <LedgerRow key={s.key} stat={s} />
              ))}
            </dl>
          </section>
        </div>
      ) : null}

      {/* Entry rows + plan */}
      <div className="mt-10 md:grid md:grid-cols-12 md:gap-x-10">
        <nav aria-labelledby="pd-deeper" className="md:col-span-7">
          <SectionHead id="pd-deeper" title="Go deeper" />
          <ul>
            <EntryRow
              href={`/golf/dashboard/players/${player.id}/game?tab=scouting`}
              title="Scouting report"
              reading={
                model.scouting.state === 'ready'
                  ? model.scouting.headline!
                  : model.scouting.state === 'unavailable'
                    ? "Couldn't load CoachHelm's reads"
                    : 'No open reads from CoachHelm yet'
              }
              meta={
                model.scouting.state === 'ready'
                  ? `${model.scouting.openReads}${model.scouting.openReads >= 20 ? '+' : ''} open ${model.scouting.openReads === 1 ? 'read' : 'reads'}`
                  : null
              }
              quote={model.scouting.state === 'ready'}
            />
            <EntryRow
              href={`/golf/dashboard/players/${player.id}/game`}
              title="Game fingerprint"
              reading={waterfallReading(model)}
              meta={model.waterfall.state === 'ready' ? `Strokes gained per round · ${model.waterfall.rounds} ${model.waterfall.rounds === 1 ? 'round' : 'rounds'}` : null}
              preview={<MiniWaterfall data={model.waterfall} />}
            />
            <EntryRow
              href={`/golf/dashboard/players/${player.id}/genome`}
              title="Genome"
              reading={strandReading(model)}
              meta={model.strand.state === 'ready' ? `${model.strand.roundsBasis} rounds · last 90 days` : null}
              preview={<MiniStrand data={model.strand} />}
            />
          </ul>
        </nav>

        <section aria-labelledby="pd-plan" className="mt-10 md:col-span-5 md:mt-0">
          <SectionHead id="pd-plan" title="Focus areas and goals" />
          {model.planState === 'ready' ? (
            <ul>
              {model.plan.map((item) => (
                <PlanRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <p className="border-t border-border-subtle py-3 font-fw-sans text-body text-text-secondary">
              {model.planState === 'unavailable'
                ? "Couldn't load focus areas and goals."
                : `Nothing active for ${player.firstName} yet.`}
            </p>
          )}
        </section>
      </div>

      {hasCountable ? <AllStats player={player} /> : null}

      <RoundSummarySheet
        round={openRoundId ? roundById.get(openRoundId) ?? null : null}
        onOpenChange={(o) => {
          if (!o) setOpenRoundId(null);
        }}
      />
    </>
  );
}

function waterfallReading(model: PlayerDetailModel): string {
  const w = model.waterfall;
  if (w.state === 'unavailable') return "Couldn't load strokes gained";
  if (w.state !== 'ready') return 'Fills in once rounds are shot-tracked';
  const measured = w.steps.filter((s): s is typeof s & { value: number } => s.value != null);
  if (measured.length === 0) return `${formatSigned(w.total ?? 0)} strokes gained per round`;
  const top = measured.reduce((a, b) => (b.value > a.value ? b : a));
  const low = measured.reduce((a, b) => (b.value < a.value ? b : a));
  if (top.key === low.key) return `${top.label} ${formatSigned(top.value)} per round`;
  // Never say "gains" about a negative number: when every area loses, the
  // honest phrasing is which one loses least.
  const lead = top.value > 0 ? `Gains most ${sgPhrase(top.key)}` : `Loses least ${sgPhrase(top.key)}`;
  return `${lead} (${formatSigned(top.value)}), loses most ${sgPhrase(low.key)} (${formatSigned(low.value)})`;
}

function sgPhrase(key: string): string {
  return key === 'tee' ? 'off the tee' : key === 'approach' ? 'on approach' : key === 'aroundGreen' ? 'around the green' : 'putting';
}

function strandReading(model: PlayerDetailModel): string {
  const s = model.strand;
  if (s.state === 'unavailable') return "Couldn't load the genome";
  if (s.state !== 'ready') return 'Not computed yet';
  const live = s.dims.filter((d): d is typeof d & { norm: number } => d.norm != null);
  const top = live.reduce((a, b) => (b.norm > a.norm ? b : a));
  const low = live.reduce((a, b) => (b.norm < a.norm ? b : a));
  const lead = top.norm >= 0.6 ? `Strongest: ${top.label.toLowerCase()}` : null;
  const watch = low.norm <= 0.4 && low.id !== top.id ? `watch ${low.label.toLowerCase()}` : null;
  const head = [lead, watch].filter(Boolean).join('; ');
  const count = `${s.live} of ${s.dims.length} traits read`;
  return head ? `${head.charAt(0).toUpperCase()}${head.slice(1)} · ${count}` : count;
}

/* ------------------------------------------------------------------------ */

function SectionHead({ id, title, meta }: { id: string; title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-2">
      <h2 id={id} className="font-fw-sans text-body-lg font-semibold text-text-primary">
        {title}
      </h2>
      {meta ? <span className="font-fw-sans text-caption text-text-tertiary">{meta}</span> : null}
    </div>
  );
}

function LedgerRow({ stat }: { stat: LedgerStat }) {
  const ink =
    stat.value == null || stat.thin
      ? 'text-text-tertiary'
      : stat.tone === 'good'
        ? 'text-accent-700'
        : stat.tone === 'bad'
          ? 'text-fw-warning-ink'
          : 'text-text-primary';
  return (
    <div data-slot="ledger-row" className="flex min-h-11 items-baseline justify-between gap-4 border-t border-border-subtle py-2.5">
      <dt className="min-w-0">
        <span className="block font-fw-sans text-body text-text-primary">{stat.label}</span>
        <span className="block font-fw-sans text-caption text-text-tertiary">
          {stat.thin ? `Early read · ${stat.sample}` : stat.sample}
        </span>
      </dt>
      <dd className="flex-shrink-0 text-right">
        <span className={cn('font-fw-sans text-body-lg font-semibold tabular-nums', ink)}>
          {stat.value ?? '—'}
        </span>
        {stat.aside && stat.value != null ? (
          <span className="ml-1.5 font-fw-sans text-caption tabular-nums text-text-tertiary">{stat.aside}</span>
        ) : null}
      </dd>
    </div>
  );
}

function EntryRow({
  href,
  title,
  reading,
  meta,
  preview,
  quote,
}: {
  href: string;
  title: string;
  reading: string;
  meta: string | null;
  preview?: React.ReactNode;
  quote?: boolean;
}) {
  return (
    <li className="border-t border-border-subtle">
      <Link
        href={href}
        className={cn('-mx-2 flex min-h-[72px] items-center gap-3 rounded-fw-md px-2 py-3', ROW_PRESS, FOCUS)}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-fw-sans text-body font-semibold text-text-primary">{title}</span>
          <span className={cn('mt-0.5 block font-fw-sans text-body-sm text-text-secondary', quote && 'line-clamp-2')}>
            {quote ? <>&ldquo;{reading}&rdquo;</> : reading}
          </span>
          {meta ? <span className="mt-0.5 block font-fw-sans text-caption text-text-tertiary">{meta}</span> : null}
        </span>
        {preview ? <span className="hidden min-[360px]:block">{preview}</span> : null}
        <IconChevronRight size={18} className="flex-shrink-0 text-text-tertiary" />
      </Link>
    </li>
  );
}

function PlanRow({ item }: { item: PlanItem }) {
  const pct = item.progress == null ? null : Math.round(item.progress * 100);
  return (
    <li className="border-t border-border-subtle py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-fw-sans text-body text-text-primary">{item.title}</span>
        <span className="flex-shrink-0 font-fw-sans text-caption text-text-tertiary">
          {item.kind === 'focus' ? 'Focus' : 'Goal'}
          {pct != null ? <span className="tabular-nums text-text-secondary"> · {pct}%</span> : null}
        </span>
      </div>
      {pct != null ? (
        <div
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`${item.title} progress`}
        >
          <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      ) : null}
      {item.detail ? (
        <p className="mt-1.5 font-fw-sans text-caption tabular-nums text-text-tertiary">{item.detail}</p>
      ) : null}
    </li>
  );
}

/** The accessible form of the strip, and the 44pt-row way to open a round. */
function RoundTable({ rounds }: { rounds: RoundPoint[] }) {
  if (rounds.length === 0) return null;
  return (
    <details className="group mt-3 border-t border-border-subtle">
      <summary
        className={cn(
          '-mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between rounded-fw-sm px-2 font-fw-sans text-body-sm text-text-secondary [&::-webkit-details-marker]:hidden',
          ROW_PRESS,
          FOCUS,
        )}
      >
        <span>Every round in this window</span>
        <IconChevronRight size={16} className="text-text-tertiary transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
      </summary>
      <table className="w-full font-fw-sans text-body-sm">
        <caption className="sr-only">Rounds in this window, newest first</caption>
        <thead>
          <tr className="text-left text-caption text-text-tertiary">
            <th scope="col" className="py-1.5 font-normal">Date</th>
            <th scope="col" className="py-1.5 font-normal">Course</th>
            <th scope="col" className="py-1.5 text-right font-normal">Score</th>
            <th scope="col" className="py-1.5 text-right font-normal">To par</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => (
            <tr key={r.id} className="border-t border-border-subtle">
              <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-text-secondary">{r.dateLabel}</td>
              <td className="py-2.5 pr-3 text-text-primary">{r.course}</td>
              <td className="py-2.5 text-right tabular-nums text-text-primary">{r.score}</td>
              <td
                className={cn(
                  'py-2.5 pl-3 text-right tabular-nums',
                  r.toPar == null ? 'text-text-tertiary' : r.toPar > 0 ? 'text-fw-warning-ink' : r.toPar < 0 ? 'text-accent-700' : 'text-text-secondary',
                )}
              >
                {r.toPar == null ? '—' : formatRoundToPar(r.toPar)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** The full stats surface, mounted only on request. */
function AllStats({ player }: { player: PlayerIdentity }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-10 border-t border-border-subtle">
      {/* eslint-disable-next-line helm/no-raw-button -- a disclosure row, not a button-styled control */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn('-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-fw-md px-2 text-left', ROW_PRESS, FOCUS)}
      >
        <span>
          <span className="block font-fw-sans text-body font-semibold text-text-primary">All stats</span>
          <span className="block font-fw-sans text-caption text-text-tertiary">Leak maps, drills and standings</span>
        </span>
        <IconChevronRight size={18} className={cn('text-text-tertiary transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-90')} />
      </button>
      {open ? (
        <div className="mt-4">
          <StatsSpineStage playerId={player.id} isOwnStats={false} playerName={player.fullName} />
        </div>
      ) : null}
    </section>
  );
}
