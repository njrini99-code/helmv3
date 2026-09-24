'use client';

/**
 * Genome compare: /golf/dashboard/coachhelm/genome/compare?p1=&p2=.
 *
 * Two strands against the same baseline, stacked so every skill lines up
 * column for column. Between them, a margin strip marks who leads each skill
 * and by how much; the three widest splits are emphasised on both strands.
 * Players are chosen from a roster sheet, not a tile grid.
 *
 * Green and amber keep their one meaning (better / worse than the baseline)
 * on each strand. The margin strip is neutral ink, because "Owen leads" is
 * not "good" or "bad".
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { GENOME_WINDOW_DAYS } from '@/lib/coachhelm/v3/genome/types';
import { BaselineSwitch } from './BaselineSwitch';
import { StrandBand, StrandTable, useStrandSelection, formatBaselineValue } from './GenomeStrand';
import { PlayerPickerSheet, type PickerPlayer } from './PlayerPickerSheet';
import {
  type Baseline,
  type StrandTrait,
  type HeadToHead,
  advantageUnit,
  formatAdvantage,
  groupByFamily,
  headToHead,
  readWord,
} from './strand-model';
import { fwPress } from '@/components/fairway/controls';

export interface CompareSide {
  playerId: string;
  name: string;
  traits: StrandTrait[];
  roundsOnFile: number | null;
  /** Genome provenance, printed per player (never dropped). Formatted on the
   *  server ("3 days ago") so render never reads the clock. */
  genomeRefreshed: string | null;
  genomeRoundsBasis: number | null;
}

export interface GenomeCompareStrandsProps {
  roster: PickerPlayer[];
  a: CompareSide | null;
  b: CompareSide | null;
}

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}

export function GenomeCompareStrands({ roster, a, b }: GenomeCompareStrandsProps) {
  const router = useRouter();
  const [baseline, setBaseline] = React.useState<Baseline>('team');
  const [picking, setPicking] = React.useState<'a' | 'b' | null>(null);
  const [pickerSlot, setPickerSlot] = React.useState<'a' | 'b'>('a');

  const h2h = React.useMemo(() => (a && b ? headToHead(a.traits, b.traits) : []), [a, b]);
  const top = React.useMemo(() => new Set(h2h.slice(0, 3).map((h) => h.id as string)), [h2h]);
  const initial = h2h[0]?.id ?? a?.traits.find((t) => t.value != null)?.id ?? null;
  const { selectedId, select } = useStrandSelection(initial);

  const tourLabel = [a, b].some((s) => s?.traits.some((t) => t.tourLabel === 'LPGA')) ? 'LPGA' : 'Tour';

  function openPicker(slot: 'a' | 'b') {
    setPickerSlot(slot);
    setPicking(slot);
  }

  function pick(id: string) {
    const p1 = pickerSlot === 'a' ? id : (a?.playerId ?? null);
    const p2 = pickerSlot === 'b' ? id : (b?.playerId ?? null);
    const qs = new URLSearchParams();
    if (p1) qs.set('p1', p1);
    if (p2) qs.set('p2', p2);
    setPicking(null);
    router.push(`/golf/dashboard/coachhelm/genome/compare?${qs.toString()}`);
  }

  function swap() {
    if (!a || !b) return;
    router.push(`/golf/dashboard/coachhelm/genome/compare?p1=${b.playerId}&p2=${a.playerId}`);
  }

  const verdict = a && b ? compareVerdict(a, b, h2h) : null;

  return (
    <div data-slot="genome-compare" className="mx-auto flex w-full max-w-[1120px] flex-col px-4 pb-16 pt-4 md:px-8 md:pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-fw-display text-h1 text-text-primary md:text-display">Compare</h1>
        {verdict ? <p className="max-w-[60ch] font-fw-sans text-body-lg text-text-primary">{verdict}</p> : (
          <p className="max-w-[60ch] font-fw-sans text-body-lg text-text-secondary">
            {a || b ? 'Pick a second player to line the two strands up skill by skill.' : 'Pick two players to line their strands up skill by skill.'}
          </p>
        )}
      </header>

      {/* Slots: the picker, not a tile grid. */}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <SlotButton label="Player 1" side={a} marker="a" onClick={() => openPicker('a')} />
        <Button variant="ghost" size="sm" className="shrink-0 self-center text-accent-700" onClick={swap} disabled={!a || !b} aria-label="Swap players">
          Swap
        </Button>
        <SlotButton label="Player 2" side={b} marker="b" onClick={() => openPicker('b')} />
      </div>

      {a && b ? (
        <>
          <section
            aria-labelledby="compare-stage-title"
            data-slot="genome-strand"
            className="mt-8 rounded-card border border-border-subtle bg-surface px-4 pb-4 pt-4 md:px-6 md:pb-6 md:pt-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="compare-stage-title" className="font-fw-sans text-h3 text-text-primary">
                  Two strands
                </h2>
                <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
                  Each against the {baseline === 'team' ? 'team average' : tourLabel}. Widest splits are marked.
                </p>
              </div>
              <BaselineSwitch value={baseline} onChange={setBaseline} tourLabel={tourLabel} />
            </div>

            <StrandLabel side={a} marker="a" className="mt-5" />
            <StrandBand
              traits={a.traits}
              baseline={baseline}
              selectedId={selectedId}
              onSelect={select}
              emphasis={top}
              directLabels={false}
              size="md"
              ariaLabel={`${a.name}'s skills`}
            />
            <MarginStrip a={a} b={b} h2h={h2h} top={top} selectedId={selectedId} />
            <StrandLabel side={b} marker="b" />
            <StrandBand
              traits={b.traits}
              baseline={baseline}
              selectedId={selectedId}
              onSelect={select}
              emphasis={top}
              directLabels={false}
              size="md"
              ariaLabel={`${b.name}'s skills`}
            />

            <CompareReadout a={a} b={b} h2h={h2h} id={selectedId} />
            <StrandTable traits={a.traits} caption={`${a.name}: skills against team and ${tourLabel}`} />
            <StrandTable traits={b.traits} caption={`${b.name}: skills against team and ${tourLabel}`} />
          </section>

          <section aria-labelledby="compare-ledger" className="mt-12 flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="compare-ledger" className="font-fw-sans text-h3 text-text-primary">
                Where they differ most
              </h2>
              <p className="font-fw-sans text-caption text-text-tertiary">{h2h.length} skills both players have</p>
            </div>
            <ol className="border-t border-border-strong">
              {h2h.map((h) => (
                <li key={h.id} className="border-b border-border-subtle">
                  {/* eslint-disable-next-line helm/no-raw-button -- a full-width ledger row (label + leader), not a button-shaped control */}
                  <button
                    type="button"
                    onClick={() => select(h.id, 'tap')}
                    aria-pressed={selectedId === h.id}
                    className={cn(
                      'grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left transition-colors duration-150 active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
                      selectedId === h.id && 'bg-surface-sunken/60',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-fw-sans text-body text-text-primary">{h.label}</span>
                      <span className="block font-fw-sans text-caption tabular-nums text-text-tertiary">
                        {firstName(a.name)} {valueOf(a, h.id)} · {firstName(b.name)} {valueOf(b, h.id)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-fw-sans text-body font-semibold text-text-primary">
                        {h.margin === 0 ? 'Level' : firstName(h.margin > 0 ? a.name : b.name)}
                      </span>
                      {h.margin !== 0 ? (
                        <span className="block font-fw-sans text-caption tabular-nums text-text-tertiary">
                          by {formatAdvantage(h.unit, Math.abs(h.margin)).replace('+', '')} {advantageUnit(h.unit)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="compare-basis" className="mt-12 flex flex-col gap-3">
            <h2 id="compare-basis" className="font-fw-sans text-h3 text-text-primary">
              Basis
            </h2>
            <dl className="divide-y divide-border-subtle border-y border-border-strong">
              {[a, b].map((s) => (
                <div key={s.playerId} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                  <dt className="font-fw-sans text-body text-text-primary">{s.name}</dt>
                  <dd className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                    {s.roundsOnFile != null ? `${s.roundsOnFile} rounds on file · ${readWord(s.roundsOnFile)}` : 'No rounds on file'}
                    {s.genomeRoundsBasis != null ? ` · tendencies from ${s.genomeRoundsBasis} rounds, last ${GENOME_WINDOW_DAYS} days` : ''}
                    {s.genomeRefreshed ? ` · refreshed ${s.genomeRefreshed}` : ''}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="font-fw-sans text-caption text-text-tertiary">
              Open a player&rsquo;s own Genome for evidence:{' '}
              <Link className="font-medium text-accent-700" href={`/golf/dashboard/players/${a.playerId}/genome`}>{a.name}</Link>
              {' · '}
              <Link className="font-medium text-accent-700" href={`/golf/dashboard/players/${b.playerId}/genome`}>{b.name}</Link>
            </p>
          </section>
        </>
      ) : null}

      <PlayerPickerSheet
        open={picking != null}
        onOpenChange={(o) => setPicking(o ? pickerSlot : null)}
        title={pickerSlot === 'a' ? 'Player 1' : 'Player 2'}
        roster={roster}
        selectedId={pickerSlot === 'a' ? (a?.playerId ?? null) : (b?.playerId ?? null)}
        takenId={pickerSlot === 'a' ? (b?.playerId ?? null) : (a?.playerId ?? null)}
        onPick={pick}
      />
    </div>
  );
}

function valueOf(side: CompareSide, id: string): string {
  return side.traits.find((t) => t.id === id)?.valueText ?? 'not measured';
}

function compareVerdict(a: CompareSide, b: CompareSide, h2h: HeadToHead[]): string | null {
  const widest = h2h[0];
  if (!widest) return null;
  const aLeads = h2h.filter((h) => h.margin > 0).length;
  const bLeads = h2h.filter((h) => h.margin < 0).length;
  const who = widest.margin > 0 ? firstName(a.name) : firstName(b.name);
  const leader = aLeads === bLeads ? null : aLeads > bLeads ? a : b;
  const head = leader
    ? `${firstName(leader.name)} leads on ${Math.max(aLeads, bLeads)} of ${h2h.length} skills they share`
    : `They split ${aLeads} and ${bLeads} across ${h2h.length} shared skills`;
  return `${head}; the widest split is ${widest.label.toLowerCase()}, ${who} by ${formatAdvantage(widest.unit, Math.abs(widest.margin)).replace('+', '')} ${advantageUnit(widest.unit)}.`;
}

function Marker({ marker }: { marker: 'a' | 'b' }) {
  // Two shapes, not two colours: green and amber are reserved for better/worse.
  return marker === 'a' ? (
    <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-text-primary" />
  ) : (
    <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-text-primary" />
  );
}

function SlotButton({ label, side, marker, onClick }: { label: string; side: CompareSide | null; marker: 'a' | 'b'; onClick: () => void }) {
  return (
    // eslint-disable-next-line helm/no-raw-button -- a player slot is a two-line field that opens the picker sheet, not a pill action
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={`flex min-h-14 flex-1 items-center justify-between gap-3 rounded-fw-md border border-border-subtle bg-surface px-4 text-left transition-[background-color,transform] duration-150 active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${fwPress}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Marker marker={marker} />
        <span className="min-w-0">
          <span className="block font-fw-sans text-caption text-text-tertiary">{label}</span>
          <span className={cn('block font-fw-sans text-body font-semibold', side ? 'text-text-primary' : 'text-text-secondary')}>
            {side?.name ?? 'Choose a player'}
          </span>
        </span>
      </span>
      <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" className="shrink-0 text-text-tertiary">
        <path d="M3.5 5.5L7 9l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function StrandLabel({ side, marker, className }: { side: CompareSide; marker: 'a' | 'b'; className?: string }) {
  return (
    <div className={cn('mb-1 flex items-center gap-2', className)}>
      <Marker marker={marker} />
      <span className="font-fw-sans text-body-sm font-semibold text-text-primary">{side.name}</span>
      <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
        {side.roundsOnFile != null ? `${side.roundsOnFile} rounds · ${readWord(side.roundsOnFile)}` : 'No rounds on file'}
      </span>
    </div>
  );
}

/**
 * The margin strip between the strands: one tick per skill, pointing up toward
 * player 1 or down toward player 2, its length the size of the lead. The three
 * widest splits are full ink; the rest recede.
 */
function MarginStrip({
  a,
  b,
  h2h,
  top,
  selectedId,
}: {
  a: CompareSide;
  b: CompareSide;
  h2h: HeadToHead[];
  top: ReadonlySet<string>;
  selectedId: string | null;
}) {
  const byId = new Map(h2h.map((h) => [h.id as string, h]));
  const groups = groupByFamily(a.traits);
  const HALF = 12;
  return (
    <div aria-hidden className="my-2 flex h-8 w-full gap-1 font-fw-sans text-caption" title={`Margin: up means ${a.name} leads, down means ${b.name} leads`}>
      {groups.map(({ family, traits }) => (
        <div
          key={family.id}
          className="flex min-w-0"
          style={{ flexGrow: traits.length, flexBasis: 0, minWidth: `${family.label.length}ch` }}
        >
          {traits.map((t) => {
            const h = byId.get(t.id);
            const len = h ? Math.max(2, Math.abs(h.magnitude) * HALF) : 0;
            const up = (h?.margin ?? 0) > 0;
            return (
              <span
                key={t.id}
                className={cn('relative h-full min-w-0 flex-1', selectedId === t.id && 'rounded-sm bg-surface-sunken')}
              >
                {h ? (
                  <span
                    className={cn(
                      'absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full',
                      top.has(t.id) ? 'bg-text-primary' : 'bg-text-tertiary/60',
                    )}
                    style={{ height: len, top: up ? `calc(50% - ${len}px)` : '50%' }}
                  />
                ) : null}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CompareReadout({ a, b, h2h, id }: { a: CompareSide; b: CompareSide; h2h: HeadToHead[]; id: string | null }) {
  const ta = a.traits.find((t) => t.id === id);
  const tb = b.traits.find((t) => t.id === id);
  if (!ta || !tb) return null;
  const h = h2h.find((x) => x.id === id) ?? null;
  return (
    <div aria-live="polite" className="mt-4 flex flex-col gap-1 border-t border-border-subtle pt-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-fw-sans text-h3 text-text-primary">{ta.label}</h3>
        <span className="shrink-0 font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
          {h == null ? 'Not comparable' : h.margin === 0 ? 'Level' : `${firstName(h.margin > 0 ? a.name : b.name)} by ${formatAdvantage(h.unit, Math.abs(h.margin)).replace('+', '')} ${advantageUnit(h.unit)}`}
        </span>
      </div>
      <p className="font-fw-sans text-body-sm tabular-nums text-text-secondary">
        {firstName(a.name)} {ta.valueText ?? 'not measured'} · {firstName(b.name)} {tb.valueText ?? 'not measured'}
        {ta.team.value != null ? ` · Team ${formatBaselineValue(ta, ta.team.value)}` : ''}
        {ta.tour.value != null ? ` · ${ta.tourLabel} ${formatBaselineValue(ta, ta.tour.value)}` : ''}
      </p>
    </div>
  );
}
